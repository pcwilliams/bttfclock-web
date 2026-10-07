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
// Rendering is on demand: nothing is drawn unless a digit, the colon,
// the tilt, or the viewport changes. A steady clock costs two frames a
// second, not sixty.

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

import { rowLayout, enclosureLayout, EnclosureMetrics } from '../models/layout.js';
import { sevenSegmentPolygons, fourteenSegmentPolygons } from '../models/segmentGeometry.js';
import { sevenSegmentMask, fourteenSegmentMask, isSegmentOn } from '../models/segmentMaps.js';
import { rowColorForIndex } from '../models/rowColor.js';
import { Palette } from '../models/palette.js';
import { BLANK_READOUT } from '../models/timeReadout.js';
import { brushedMetalTexture, windowGelTexture, plateTexture } from './textures.js';

// ---- Tunables -------------------------------------------------------------

/**
 * Target linear luminance for lit segments and lamps. Each colour is
 * scaled to hit it, so red (a dim colour, luminance-wise) glows as
 * strongly as green and amber. Everything that isn't an LED stays well
 * under the bloom threshold, which gives selective bloom from a single
 * HDR render with no extra passes.
 */
//
// Segments use the saturated `lit` colour pushed well past 1.0: the
// Neutral tone mapper desaturates the hot core towards white (the app's
// pale `litCore`), while the bloom keeps the full row colour (the app's
// `bloom` shadows). One colour, both looks.
const LED_LUMINANCE = 2.0;
const LAMP_LUMINANCE = 2.0;
// UnrealBloomPass blends five blur mips (½ … 1/32 resolution). Its stock
// weights give a wide haze; these keep the glow tight around each
// segment, like the app's stacked 2 / 5 / 11pt shadows.
const BLOOM = { strength: 0.7, radius: 0, threshold: 0.8, mipWeights: [0.7, 0.4, 0.12, 0.02, 0.0] };

const ENCLOSURE_DEPTH = 8;
const PANEL_Z = 1.6;          // row panel front face
const BEZEL_DEPTH = 1.1;      // how far the window bezels stand proud
const BEZEL_BORDER = 1.0;
const PLATE_Z = 0.35;         // caption plates sit just proud of the panel
const MAX_TILT = 0.11;        // radians (~6°)
const TILT_EASE = 0.12;       // per-frame approach factor
const CAMERA_FOV = 22;
const FIT_MARGIN = 1.08;

const srgb = ([r, g, b]) => new THREE.Color().setRGB(r, g, b, THREE.SRGBColorSpace);

/** sRGB triple → linear colour scaled to the given luminance (HDR). */
function hdr(rgb, luminance) {
  const c = srgb(rgb);
  const l = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
  return c.multiplyScalar(luminance / l);
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

    // The rig is what tilts; the camera stays put.
    this.rig = new THREE.Group();
    this.scene.add(this.rig);

    // HDR (half-float) + 4× MSAA target, so LED colours can exceed 1.0
    // and the bloom threshold separates LEDs from bright chrome.
    const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(this.renderer, rt);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), BLOOM.strength, BLOOM.radius, BLOOM.threshold);
    this.bloom.compositeMaterial.uniforms.bloomFactors.value = BLOOM.mipWeights;
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    this.tilt = { x: 0, y: 0, tx: 0, ty: 0 };
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
      for (const dot of row.colonDots) dot.material = lit ? row.mats.lamp : row.mats.lampOff;
    }
    this.requestRender();
  }

  /** Target tilt in −1…1 on each axis; the rig eases towards it. */
  setTiltTarget(nx, ny) {
    this.tilt.tx = THREE.MathUtils.clamp(nx, -1, 1) * MAX_TILT;
    this.tilt.ty = THREE.MathUtils.clamp(ny, -1, 1) * MAX_TILT;
    this.requestRender();
  }

  resize() {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    if (w === 0 || h === 0) return;
    this.renderer.setSize(w, h, false);
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    this.#fitCamera();
    this.requestRender();
  }

  requestRender() {
    if (this.renderQueued) return;
    this.renderQueued = true;
    requestAnimationFrame(() => this.#frame());
  }

  /** Synchronous render, for screenshots and tests. */
  renderNow() {
    this.composer.render();
  }

  // ---- Frame --------------------------------------------------------------

  #frame() {
    this.renderQueued = false;
    const t = this.tilt;
    t.x += (t.tx - t.x) * TILT_EASE;
    t.y += (t.ty - t.y) * TILT_EASE;
    if (Math.abs(t.tx - t.x) < 1e-4) t.x = t.tx;
    if (Math.abs(t.ty - t.y) < 1e-4) t.y = t.ty;
    // Pointer right → turn the right edge away; pointer down → tip the
    // bottom away. Feels like the panel is looking at the cursor.
    this.rig.rotation.y = t.x;
    this.rig.rotation.x = t.y;
    this.composer.render();
    if (t.x !== t.tx || t.y !== t.ty) this.requestRender();
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
    this.rowMats = new Map();
  }

  /** Per-colour materials, built once and reused across rebuilds. */
  #materialsFor(color) {
    let m = this.rowMats.get(color.name);
    if (!m) {
      m = {
        ghost: new THREE.MeshBasicMaterial({ color: srgb(color.ghost) }),
        lit: new THREE.MeshBasicMaterial({ color: hdr(color.lit, LED_LUMINANCE) }),
        lamp: new THREE.MeshBasicMaterial({ color: hdr(color.lit, LAMP_LUMINANCE) }),
        lampOff: new THREE.MeshBasicMaterial({ color: srgb(color.ghost) }),
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
    for (const child of [...this.rig.children]) this.rig.remove(child);
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
    this.rig.add(new THREE.Mesh(geo, mat));

    // Corner rivets: shallow metal domes.
    const rivetGeo = this.#track(new THREE.SphereGeometry(e.rivetRadius, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2));
    const inset = e.rivetInset;
    for (const [x, y] of [[inset, inset], [width - inset, inset], [inset, height - inset], [width - inset, height - inset]]) {
      const rivet = new THREE.Mesh(rivetGeo, this.rivetMat);
      rivet.rotation.x = Math.PI / 2;
      rivet.scale.set(1, 0.6, 1);
      rivet.position.set(...this.#world(x, y), 0);
      this.rig.add(rivet);
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
    this.rig.add(this.#panelMesh(panel, 88 + index * 1955));

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
      this.rig.add(gel);

      // Bezel: a rounded frame with the window cut out.
      const outer = roundedRectShape(wcx, wcy, win.w + BEZEL_BORDER * 2, win.h + BEZEL_BORDER * 2, 2.6);
      outer.holes.push(roundedRectPath(new THREE.Path(), wcx - win.w / 2, wcy - win.h / 2, win.w, win.h, 2));
      const bezelGeo = this.#track(new THREE.ExtrudeGeometry(outer, {
        depth: BEZEL_DEPTH, bevelEnabled: true, bevelThickness: 0.2, bevelSize: 0.2, bevelSegments: 2, curveSegments: 8,
      }));
      const bezel = new THREE.Mesh(bezelGeo, this.bezelMat);
      bezel.position.z = zFace;
      this.rig.add(bezel);

      // Glass sheet: reflection only (additive), so it never dims the LEDs.
      const glass = new THREE.Mesh(gelGeo, this.glassMat);
      glass.position.set(wcx, wcy, zFace + BEZEL_DEPTH);
      this.rig.add(glass);

      // Caption plate.
      this.rig.add(this.#plate(field.caption, ox + field.captionCenter.x, oy + field.captionCenter.y, zFace + PLATE_Z, {
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
        this.rig.add(lit);
        row.chars.push({ mesh: lit, kind: ch.kind, field: field.id, mask: 0 });
      }
    }
    const ghostGeo = this.#track(new THREE.ShapeGeometry(ghostShapes, 1));
    const ghost = new THREE.Mesh(ghostGeo, mats.ghost);
    ghost.position.z = zFace + 0.1;
    this.rig.add(ghost);

    // Round LED lamps (AM/PM indicators and colon dots).
    const lampGeo = this.#track(new THREE.SphereGeometry(ROW.amPm.lampRadius, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2));
    const lamp = (x, y) => {
      const m = new THREE.Mesh(lampGeo, mats.lampOff);
      m.rotation.x = Math.PI / 2;
      m.scale.set(1, 0.5, 1);
      m.position.set(...this.#world(ox + x, oy + y), zFace + 0.1);
      this.rig.add(m);
      return m;
    };
    for (const [key, text] of [['am', 'AM'], ['pm', 'PM']]) {
      const spec = ROW.amPm[key];
      this.rig.add(this.#plate(text, ox + spec.label.x, oy + spec.label.y, zFace + PLATE_Z, {
        fontSize: 5.2, padX: 2, padY: 0.3, height: ROW.amPm.labelH, radius: 1,
        fill: Palette.captionPlateRed, textColor: Palette.chromeTextGrey,
      }));
      row[key] = lamp(spec.lamp.x, spec.lamp.y);
    }
    for (const d of ROW.colon.dots) {
      const dot = lamp(d.x, d.y);
      dot.material = this.colonLit ? mats.lamp : mats.lampOff;
      row.colonDots.push(dot);
    }

    // City name plate.
    this.rig.add(this.#plate(label, ox + ROW.cityPlate.cx, oy + ROW.cityPlate.y + ROW.cityPlate.h / 2, zFace + PLATE_Z, {
      fontSize: 9.5, padX: 10, padY: 2, height: ROW.cityPlate.h, radius: 2,
      fill: Palette.cityPlateBlack, textColor: Palette.chromeTextGrey, tracking: 0.03,
      border: 'rgba(0,0,0,0.9)', weight: 800,
    }));

    return row;
  }

  #buildEmptyState() {
    const r = this.enclosure.empty;
    this.rig.add(this.#panelMesh(r, 7));
    const cx = r.x + r.w / 2;
    const plateOpts = { padX: 6, padY: 2, radius: 2, fill: Palette.cityPlateBlack, textColor: Palette.chromeTextGrey, tracking: 0.08 };
    this.rig.add(this.#plate('NO CITIES SELECTED', cx, r.y + r.h / 2 - 8, PANEL_Z + PLATE_Z, { ...plateOpts, fontSize: 10 }));
    this.rig.add(this.#plate('USE CITIES TO ADD UP TO 3', cx, r.y + r.h / 2 + 10, PANEL_Z + PLATE_Z,
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
        ch.mesh.geometry = glyphGeometry(ch.kind, mask);
      }
    }
    row.am.material = readout.isAM ? row.mats.lamp : row.mats.lampOff;
    row.pm.material = readout.isAM ? row.mats.lampOff : row.mats.lamp;
  }
}
