// The three.js Time Circuits model.
//
// World units are the Swift app's natural points (see models/layout.js):
// x right, y up, z towards the viewer, enclosure centred on the origin.
// The camera fits the enclosure to the viewport, which replaces the
// app's per-row `.scaleEffect`.
//
// Depth stack, back to front:
//   enclosure slab (front face at z = 0)
//   row panels (raised PANEL_Z)
//   per-field display gel, ghost segments, lit segments
//   window bezels and a reflective "glass" sheet over each window
//   caption plates, city plate, AM/PM lamps, colon dots, rivets
//
// The view is straight-on and static: the depth only shows as bevel
// shading and recessed windows, exactly like a photo of the prop.
//
// Rendering is on demand: nothing is drawn unless a digit, the colon, or
// the viewport changes. A steady clock costs two frames a second.
//
// LED glow (selective bloom):
//   Lit segments are drawn at their true app colour (`litCore`, pale) in
//   the main pass, so the digits stay crisp. Each lit element also has a
//   "glow twin" on GLOW_LAYER in the row's saturated `bloom` colour. The
//   twins alone are rendered to a small target, blurred by
//   UnrealBloomPass, and added over the main image, which reproduces the
//   app's stacked `.shadow(color: bloom)` halos without touching the
//   digits themselves.

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

import { rowLayout, enclosureLayout, EnclosureMetrics } from '../models/layout.js';
import { sevenSegmentPolygons, fourteenSegmentPolygons } from '../models/segmentGeometry.js';
import { sevenSegmentMask, fourteenSegmentMask, isSegmentOn } from '../models/segmentMaps.js';
import { rowColorForIndex } from '../models/rowColor.js';
import { Palette } from '../models/palette.js';
import { BLANK_READOUT } from '../models/timeReadout.js';
import { brushedMetalTexture, windowGelTexture, plateTexture } from './textures.js';

// ---- Tunables -------------------------------------------------------------

/** Layer holding only the glow twins. */
const GLOW_LAYER = 1;
/**
 * Glow tuning. `gain` scales the twins' `bloom` colour; `strength` and
 * the per-mip weights shape the halo. UnrealBloomPass blends five blur
 * mips (½ … 1/32 resolution); the stock weights give a wide haze, so
 * these favour the small mips, like the app's 2 / 5 / 11pt shadows.
 */
const GLOW = { gain: 0.5, strength: 0.85, radius: 0, mipWeights: [1.0, 0.6, 0.25, 0.06, 0.0] };

const ENCLOSURE_DEPTH = 8;
const PANEL_Z = 1.6;          // row panel front face
const BEZEL_DEPTH = 1.1;      // how far the window bezels stand proud
const BEZEL_BORDER = 1.0;
const PLATE_Z = 0.35;         // caption plates sit just proud of the panel
const CAMERA_FOV = 22;
const FIT_MARGIN = 1.08;

const srgb = ([r, g, b]) => new THREE.Color().setRGB(r, g, b, THREE.SRGBColorSpace);

/** Adds the blurred glow texture over the main render. */
const GlowMixShader = {
  uniforms: { baseTexture: { value: null }, glowTexture: { value: null } },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D baseTexture;
    uniform sampler2D glowTexture;
    varying vec2 vUv;
    void main() {
      gl_FragColor = texture2D(baseTexture, vUv) + vec4(texture2D(glowTexture, vUv).rgb, 0.0);
    }`,
};

/** Small radial white → transparent sprite: the LED lamps' hot spot. */
function hotSpotTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,0.85)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ---- Geometry helpers -----------------------------------------------------

function roundedRectPath(path, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  path.moveTo(x + r, y);
  path.lineTo(x + w - r, y);
  path.absarc(x + w - r, y + r, r, -Math.PI / 2, 0, false);
  path.lineTo(x + w, y + h - r);
  path.absarc(x + w - r, y + h - r, r, 0, Math.PI / 2, false);
  path.lineTo(x + r, y + h);
  path.absarc(x + r, y + h - r, r, Math.PI / 2, Math.PI, false);
  path.lineTo(x, y + r);
  path.absarc(x + r, y + r, r, Math.PI, Math.PI * 1.5, false);
  return path;
}

/** Rounded rect centred on (cx, cy), world (y-up) coordinates. */
function roundedRectShape(cx, cy, w, h, r) {
  return roundedRectPath(new THREE.Shape(), cx - w / 2, cy - h / 2, w, h, r);
}

/**
 * Extruded slab whose front face (bevel included) lands exactly on
 * z = 0. The shape is inset by the bevel so the outer silhouette
 * matches the layout rect.
 */
function slabGeometry(cx, cy, w, h, r, depth, bevel) {
  const shape = roundedRectShape(cx, cy, w - bevel * 2, h - bevel * 2, Math.max(0.1, r - bevel));
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 3,
    curveSegments: 10,
  });
  geo.translate(0, 0, -(depth + bevel));
  planarUV(geo);
  return geo;
}

/** Replaces UVs with a front-on planar projection of the bounding box. */
function planarUV(geo) {
  geo.computeBoundingBox();
  const { min, max } = geo.boundingBox;
  const pos = geo.attributes.position;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    uv[i * 2] = (pos.getX(i) - min.x) / (max.x - min.x);
    uv[i * 2 + 1] = (pos.getY(i) - min.y) / (max.y - min.y);
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

/** Converts a y-down polygon (char-box local) to a Shape at (ox, oy). */
function polygonShape(points, ox = 0, oy = 0) {
  const s = new THREE.Shape();
  points.forEach(([x, y], i) => (i === 0 ? s.moveTo(ox + x, oy - y) : s.lineTo(ox + x, oy - y)));
  s.closePath();
  return s;
}

// Segment polygons depend only on the character box, which is fixed.
const ROW = rowLayout();
const SEVEN_W = ROW.fields[1].chars[0].w;
const FOURTEEN_W = ROW.fields[0].chars[0].w;
const CHAR_H = ROW.fields[0].chars[0].h;
const SEVEN_POLYS = sevenSegmentPolygons(SEVEN_W, CHAR_H);
const FOURTEEN_POLYS = fourteenSegmentPolygons(FOURTEEN_W, CHAR_H);

// Lit-segment geometry for a (kind, mask) pair, in char-local coords
// (origin at the char box's top-left, y up). Shared by every character
// showing the same glyph; a full day uses only a few dozen entries.
const glyphCache = new Map();
function glyphGeometry(kind, mask) {
  const key = `${kind}:${mask}`;
  let geo = glyphCache.get(key);
  if (!geo) {
    const polys = kind === 14 ? FOURTEEN_POLYS : SEVEN_POLYS;
    const shapes = polys.filter((_, i) => isSegmentOn(mask, i)).map((p) => polygonShape(p));
    geo = new THREE.ShapeGeometry(shapes, 1);
    glyphCache.set(key, geo);
  }
  return geo;
}

// ---- Scene ----------------------------------------------------------------

export class TimeCircuitsScene {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {{ onLayout?: (info: { clockHeightPx: number, clockWidthPx: number }) => void }} opts
   */
  constructor(canvas, { onLayout = () => {} } = {}) {
    this.canvas = canvas;
    this.onLayout = onLayout;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'low-power' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.0;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x000000);
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.3;
    pmrem.dispose();

    const key = new THREE.DirectionalLight(0xffffff, 1.1);
    key.position.set(-0.5, 0.8, 1.2);
    this.scene.add(key);

    this.camera = new THREE.PerspectiveCamera(CAMERA_FOV, 1, 1, 5000);

    this.model = new THREE.Group();
    this.scene.add(this.model);

    // Glow: twins → glowSource → UnrealBloomPass (threshold 0, since only
    // twins are in the target). The pass leaves the pure blurred halo in
    // renderTargetsHorizontal[0], which the mix pass samples. Driven by
    // hand rather than through a second EffectComposer.
    this.glowSource = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), GLOW.strength, GLOW.radius, 0);
    this.bloom.compositeMaterial.uniforms.bloomFactors.value = GLOW.mipWeights;

    // Main image: 4× MSAA, half-float so glow + core can exceed 1.0
    // before the Neutral tone mapper rolls it off.
    const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(this.renderer, rt);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    const mix = new ShaderPass(new THREE.ShaderMaterial(GlowMixShader), 'baseTexture');
    mix.material.uniforms.glowTexture.value = this.bloom.renderTargetsHorizontal[0].texture;
    this.composer.addPass(mix);
    this.composer.addPass(new OutputPass());

    this.rows = [];
    this.colonLit = true;
    this.disposables = [];
    this.renderQueued = false;
    this.layoutInfo = null;

    this.#buildSharedMaterials();
    new ResizeObserver(() => this.resize()).observe(canvas);
    this.resize();
  }

  // ---- Public API ---------------------------------------------------------

  /** Rebuilds the model for a new city list (0–3 cities). */
  setCities(cities) {
    this.#clearModel();
    const count = Math.min(cities.length, 3);
    this.enclosure = enclosureLayout(count);
    this.#buildEnclosure();
    this.rows = [];
    for (let i = 0; i < count; i++) {
      this.rows.push(this.#buildRow(i, cities[i].displayName, this.enclosure.panels[i]));
    }
    if (count === 0) this.#buildEmptyState();
    this.#fitCamera();
    this.requestRender();
  }

  /** Lights the segments for one readout per row. */
  setReadouts(readouts) {
    this.rows.forEach((row, i) => this.#applyReadout(row, readouts[i] ?? BLANK_READOUT));
    this.requestRender();
  }

  setColonLit(lit) {
    if (lit === this.colonLit) return;
    this.colonLit = lit;
    for (const row of this.rows) {
      for (const dot of row.colonDots) dot.setLit(lit);
    }
    this.requestRender();
  }

  resize() {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    if (w === 0 || h === 0) return;
    const pr = this.renderer.getPixelRatio();
    this.renderer.setSize(w, h, false);
    this.composer.setPixelRatio(pr);
    this.composer.setSize(w, h);
    this.glowSource.setSize(Math.round(w * pr), Math.round(h * pr));
    this.bloom.setSize(Math.round(w * pr), Math.round(h * pr));
    this.camera.aspect = w / h;
    this.#fitCamera();
    this.requestRender();
  }

  requestRender() {
    if (this.renderQueued) return;
    this.renderQueued = true;
    requestAnimationFrame(() => {
      this.renderQueued = false;
      this.renderNow();
    });
  }

  /** Synchronous render: glow layer first, then the main image. */
  renderNow() {
    const { renderer, camera } = this;
    camera.layers.set(GLOW_LAYER);
    renderer.setRenderTarget(this.glowSource);
    renderer.clear();
    renderer.render(this.scene, camera);
    this.bloom.render(renderer, null, this.glowSource, 0, false);
    camera.layers.set(0);
    this.composer.render();
  }

  // ---- Camera -------------------------------------------------------------

  #fitCamera() {
    if (!this.enclosure) return;
    const { width, height } = this.enclosure;
    const vHalf = Math.tan(THREE.MathUtils.degToRad(CAMERA_FOV / 2));
    const aspect = this.camera.aspect || 1;
    const distForH = (height / 2) / vHalf;
    const distForW = (width / 2) / (vHalf * aspect);
    const dist = Math.max(distForH, distForW) * FIT_MARGIN + ENCLOSURE_DEPTH;
    this.camera.position.set(0, 0, dist);
    this.camera.near = dist * 0.25;
    this.camera.far = dist * 3;
    this.camera.updateProjectionMatrix();
    this.camera.lookAt(0, 0, 0);

    const visibleH = 2 * vHalf * (dist);
    const pxPerUnit = this.canvas.clientHeight / visibleH;
    this.layoutInfo = { clockHeightPx: height * pxPerUnit, clockWidthPx: width * pxPerUnit };
    this.onLayout(this.layoutInfo);
  }

  // ---- Materials ----------------------------------------------------------

  #buildSharedMaterials() {
    this.bezelMat = new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.55, metalness: 0.2 });
    this.glassMat = new THREE.MeshStandardMaterial({
      color: 0x000000,
      roughness: 0.08,
      metalness: 0,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      envMapIntensity: 0.6,
    });
    this.rivetMat = new THREE.MeshStandardMaterial({ color: srgb([0.5, 0.5, 0.48]), metalness: 0.9, roughness: 0.35 });
    this.hotSpotMat = new THREE.MeshBasicMaterial({ map: hotSpotTexture(), transparent: true, depthWrite: false });
    this.rowMats = new Map();
  }

  /** Per-colour materials, built once and reused across rebuilds. */
  #materialsFor(color) {
    let m = this.rowMats.get(color.name);
    if (!m) {
      m = {
        ghost: new THREE.MeshBasicMaterial({ color: srgb(color.ghost) }),
        lit: new THREE.MeshBasicMaterial({ color: srgb(color.litCore) }),
        lamp: new THREE.MeshBasicMaterial({ color: srgb(color.lit) }),
        lampOff: new THREE.MeshBasicMaterial({ color: srgb(color.ghost) }),
        glow: new THREE.MeshBasicMaterial({ color: srgb(color.bloom).multiplyScalar(GLOW.gain) }),
        gel: new THREE.MeshBasicMaterial({ map: windowGelTexture(color.windowTint) }),
      };
      this.rowMats.set(color.name, m);
    }
    return m;
  }

  // ---- Model construction -------------------------------------------------

  /** Enclosure (y-down) point → world. */
  #world(x, y) {
    return [x - this.enclosure.width / 2, this.enclosure.height / 2 - y];
  }

  #track(...things) {
    this.disposables.push(...things);
    return things[0];
  }

  #clearModel() {
    for (const child of [...this.model.children]) this.model.remove(child);
    for (const d of this.disposables) d.dispose();
    this.disposables = [];
  }

  #buildEnclosure() {
    const { width, height } = this.enclosure;
    const e = EnclosureMetrics;
    const tex = this.#track(brushedMetalTexture(width, height, {
      stops: [[0.10, 0.10, 0.09], [0.06, 0.06, 0.05], [0.04, 0.04, 0.04], [0.08, 0.08, 0.07]],
      streakMax: 0.05,
      streakOpacity: 0.6,
      seed: 1985,
    }));
    const mat = this.#track(new THREE.MeshStandardMaterial({ map: tex, metalness: 0.3, roughness: 0.55 }));
    const geo = this.#track(slabGeometry(0, 0, width, height, e.cornerRadius, ENCLOSURE_DEPTH, 1.2));
    this.model.add(new THREE.Mesh(geo, mat));

    // Corner rivets: shallow metal domes.
    const rivetGeo = this.#track(new THREE.SphereGeometry(e.rivetRadius, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2));
    const inset = e.rivetInset;
    for (const [x, y] of [[inset, inset], [width - inset, inset], [inset, height - inset], [width - inset, height - inset]]) {
      const rivet = new THREE.Mesh(rivetGeo, this.rivetMat);
      rivet.rotation.x = Math.PI / 2;
      rivet.scale.set(1, 0.6, 1);
      rivet.position.set(...this.#world(x, y), 0);
      this.model.add(rivet);
    }
  }

  #panelMesh(rect, seed) {
    const tex = this.#track(brushedMetalTexture(rect.w, rect.h, {
      stops: [[0.32, 0.32, 0.30], [0.23, 0.23, 0.22], [0.18, 0.18, 0.17], [0.26, 0.26, 0.24]],
      streakMax: 0.08,
      streakOpacity: 0.45,
      seed,
    }));
    const mat = this.#track(new THREE.MeshStandardMaterial({ map: tex, metalness: 0.3, roughness: 0.45 }));
    const [cx, cy] = this.#world(rect.x + rect.w / 2, rect.y + rect.h / 2);
    const geo = this.#track(slabGeometry(cx, cy, rect.w, rect.h, EnclosureMetrics.panelCornerRadius, 1.0, 0.6));
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.z = PANEL_Z;
    return mesh;
  }

  /** A textured plane for a painted plate, centred at enclosure (x, y). */
  #plate(text, x, y, z, opts) {
    const { texture, width, height } = plateTexture(text, opts);
    this.#track(texture);
    const mat = this.#track(new THREE.MeshBasicMaterial({ map: texture, transparent: true }));
    const geo = this.#track(new THREE.PlaneGeometry(width, height));
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(...this.#world(x, y), z);
    return mesh;
  }

  #buildRow(index, label, { panel, content }) {
    const color = rowColorForIndex(index);
    const mats = this.#materialsFor(color);
    this.model.add(this.#panelMesh(panel, 88 + index * 1955));

    const ox = content.x;
    const oy = content.y;
    const zFace = PANEL_Z;
    const row = { mats, chars: [], colonDots: [], am: null, pm: null };

    const ghostShapes = [];
    for (const field of ROW.fields) {
      const win = field.window;
      const [wcx, wcy] = this.#world(ox + win.x + win.w / 2, oy + win.y + win.h / 2);

      // Gel backing.
      const gelGeo = this.#track(new THREE.PlaneGeometry(win.w, win.h));
      const gel = new THREE.Mesh(gelGeo, mats.gel);
      gel.position.set(wcx, wcy, zFace + 0.05);
      this.model.add(gel);

      // Bezel: a rounded frame with the window cut out.
      const outer = roundedRectShape(wcx, wcy, win.w + BEZEL_BORDER * 2, win.h + BEZEL_BORDER * 2, 2.6);
      outer.holes.push(roundedRectPath(new THREE.Path(), wcx - win.w / 2, wcy - win.h / 2, win.w, win.h, 2));
      const bezelGeo = this.#track(new THREE.ExtrudeGeometry(outer, {
        depth: BEZEL_DEPTH, bevelEnabled: true, bevelThickness: 0.2, bevelSize: 0.2, bevelSegments: 2, curveSegments: 8,
      }));
      const bezel = new THREE.Mesh(bezelGeo, this.bezelMat);
      bezel.position.z = zFace;
      this.model.add(bezel);

      // Glass sheet: reflection only (additive), so it never dims the LEDs.
      const glass = new THREE.Mesh(gelGeo, this.glassMat);
      glass.position.set(wcx, wcy, zFace + BEZEL_DEPTH);
      this.model.add(glass);

      // Caption plate.
      this.model.add(this.#plate(field.caption, ox + field.captionCenter.x, oy + field.captionCenter.y, zFace + PLATE_Z, {
        fontSize: 7.2, padX: 4, padY: 1, height: 11, radius: 1.5,
        fill: Palette.captionPlateRed, textColor: Palette.chromeTextGrey, tracking: 0.02,
      }));

      // Characters: ghost outline (merged per row) + one lit mesh each.
      for (const ch of field.chars) {
        const [cx, cy] = this.#world(ox + ch.x, oy + ch.y);
        const polys = ch.kind === 14 ? FOURTEEN_POLYS : SEVEN_POLYS;
        for (const p of polys) ghostShapes.push(polygonShape(p, cx, cy));
        const lit = new THREE.Mesh(glyphGeometry(ch.kind, 0), mats.lit);
        lit.position.set(cx, cy, zFace + 0.15);
        const glow = this.#glowTwin(lit, mats.glow);
        this.model.add(lit, glow);
        row.chars.push({ meshes: [lit, glow], kind: ch.kind, field: field.id, mask: 0 });
      }
    }
    const ghostGeo = this.#track(new THREE.ShapeGeometry(ghostShapes, 1));
    const ghost = new THREE.Mesh(ghostGeo, mats.ghost);
    ghost.position.z = zFace + 0.1;
    this.model.add(ghost);

    // Round LED lamps (AM/PM indicators and colon dots).
    const lampGeo = this.#track(new THREE.SphereGeometry(ROW.amPm.lampRadius, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2));
    const hotGeo = this.#track(new THREE.CircleGeometry(ROW.amPm.lampRadius * 0.5, 16));
    const lamp = (x, y) => {
      const [wx, wy] = this.#world(ox + x, oy + y);
      const dome = new THREE.Mesh(lampGeo, mats.lampOff);
      dome.rotation.x = Math.PI / 2;
      dome.scale.set(1, 0.5, 1);
      dome.position.set(wx, wy, zFace + 0.1);
      const glow = this.#glowTwin(dome, mats.glow);
      const hot = new THREE.Mesh(hotGeo, this.hotSpotMat);
      hot.position.set(wx, wy, zFace + 0.1 + ROW.amPm.lampRadius * 0.5 + 0.05);
      this.model.add(dome, glow, hot);
      const setLit = (lit) => {
        dome.material = lit ? mats.lamp : mats.lampOff;
        glow.visible = lit;
        hot.visible = lit;
      };
      setLit(false);
      return { setLit };
    };
    for (const [key, text] of [['am', 'AM'], ['pm', 'PM']]) {
      const spec = ROW.amPm[key];
      this.model.add(this.#plate(text, ox + spec.label.x, oy + spec.label.y, zFace + PLATE_Z, {
        fontSize: 5.2, padX: 2, padY: 0.3, height: ROW.amPm.labelH, radius: 1,
        fill: Palette.captionPlateRed, textColor: Palette.chromeTextGrey,
      }));
      row[key] = lamp(spec.lamp.x, spec.lamp.y);
    }
    for (const d of ROW.colon.dots) {
      const dot = lamp(d.x, d.y);
      dot.setLit(this.colonLit);
      row.colonDots.push(dot);
    }

    // City name plate.
    this.model.add(this.#plate(label, ox + ROW.cityPlate.cx, oy + ROW.cityPlate.y + ROW.cityPlate.h / 2, zFace + PLATE_Z, {
      fontSize: 9.5, padX: 10, padY: 2, height: ROW.cityPlate.h, radius: 2,
      fill: Palette.cityPlateBlack, textColor: Palette.chromeTextGrey, tracking: 0.03,
      border: 'rgba(0,0,0,0.9)', weight: 800,
    }));

    return row;
  }

  /** Same geometry and transform, glow material, glow layer only. */
  #glowTwin(mesh, material) {
    const twin = new THREE.Mesh(mesh.geometry, material);
    twin.position.copy(mesh.position);
    twin.rotation.copy(mesh.rotation);
    twin.scale.copy(mesh.scale);
    twin.layers.set(GLOW_LAYER);
    return twin;
  }

  #buildEmptyState() {
    const r = this.enclosure.empty;
    this.model.add(this.#panelMesh(r, 7));
    const cx = r.x + r.w / 2;
    const plateOpts = { padX: 6, padY: 2, radius: 2, fill: Palette.cityPlateBlack, textColor: Palette.chromeTextGrey, tracking: 0.08 };
    this.model.add(this.#plate('NO CITIES SELECTED', cx, r.y + r.h / 2 - 8, PANEL_Z + PLATE_Z, { ...plateOpts, fontSize: 10 }));
    this.model.add(this.#plate('USE CITIES TO ADD UP TO 3', cx, r.y + r.h / 2 + 10, PANEL_Z + PLATE_Z,
      { ...plateOpts, fontSize: 6.5, textColor: [0.7, 0.7, 0.68] }));
  }

  // ---- Readout → segments -------------------------------------------------

  #applyReadout(row, readout) {
    const text = {
      month: readout.paddedMonth,
      day: readout.dayDigits,
      year: readout.yearDigits,
      hour: readout.hourDigits,
      minute: readout.minuteDigits,
    };
    const cursor = {};
    for (const ch of row.chars) {
      const i = cursor[ch.field] ?? 0;
      cursor[ch.field] = i + 1;
      const c = text[ch.field][i] ?? ' ';
      const mask = ch.kind === 14 ? fourteenSegmentMask(c) : sevenSegmentMask(c);
      if (mask !== ch.mask) {
        ch.mask = mask;
        const geo = glyphGeometry(ch.kind, mask);
        for (const m of ch.meshes) m.geometry = geo;
      }
    }
    row.am.setLit(readout.isAM);
    row.pm.setLit(!readout.isAM);
  }
}
