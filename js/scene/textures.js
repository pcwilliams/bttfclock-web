// Canvas-generated textures: brushed metal, LED window gel, and the
// painted label plates (DYMO captions, AM/PM tags, city name plates).
//
// Everything is procedural, so the repo ships no image assets and the
// look scales cleanly to any resolution.

import * as THREE from 'three';
import { cssRGB } from '../models/palette.js';

export const LABEL_FONT_FAMILY = '"Lexend Exa", "Arial Black", "Helvetica Neue", sans-serif';

/** Deterministic PRNG so the brushed-metal grain is identical every load. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvasTexture(canvas, { mipmaps = true } = {}) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.generateMipmaps = mipmaps;
  if (!mipmaps) tex.minFilter = THREE.LinearFilter;
  return tex;
}

/**
 * Brushed metal: a four-stop diagonal gradient with random horizontal
 * streaks composited in overlay mode, as in the app's
 * BrushedMetalOverlay. `stops` are sRGB triples.
 */
export function brushedMetalTexture(wUnits, hUnits, { stops, streakMax, streakOpacity, seed, pxPerUnit = 4 }) {
  const w = Math.min(2048, Math.round(wUnits * pxPerUnit));
  const h = Math.min(2048, Math.round(hUnits * pxPerUnit));
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, w, h);
  stops.forEach((s, i) => g.addColorStop(i / (stops.length - 1), cssRGB(s)));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  const rand = mulberry32(seed);
  ctx.globalCompositeOperation = 'overlay';
  ctx.globalAlpha = streakOpacity;
  const step = 1.5 * (h / hUnits);
  for (let y = 0; y < h; y += step) {
    const a = 0.02 + rand() * (streakMax - 0.02);
    ctx.fillStyle = rand() > 0.5 ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a})`;
    ctx.fillRect(0, y, w, step);
  }
  return canvasTexture(c);
}

/**
 * The tinted "gel" behind each LED window: black → row tint → black,
 * darkened by 35% black — the app's `windowFill`.
 */
export function windowGelTexture(tint) {
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 64);
  g.addColorStop(0, '#000');
  g.addColorStop(0.5, cssRGB(tint));
  g.addColorStop(1, '#000');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 4, 64);
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(0, 0, 4, 64);
  return canvasTexture(c, { mipmaps: false });
}

let measureCtx = null;

/** Width of `text` in world units at `fontSize` units, including tracking. */
export function measureLabel(text, { fontSize, weight = 800, tracking = 0 }) {
  measureCtx ??= document.createElement('canvas').getContext('2d');
  measureCtx.font = `${weight} 100px ${LABEL_FONT_FAMILY}`;
  const w = measureCtx.measureText(text).width / 100 * fontSize;
  return w + tracking * fontSize * Math.max(0, text.length - 1);
}

/**
 * A painted plate: rounded rectangle, fill, hairline border and centred
 * text. Returns the texture plus its size in world units, sized to fit
 * the text the way SwiftUI's `.fixedSize().padding()` does.
 */
export function plateTexture(text, {
  fontSize, padX, padY, fill, textColor, radius, border = 'rgba(0,0,0,0.55)',
  weight = 800, tracking = 0, minWidth = 0, height = null, pxPerUnit = 14,
}) {
  const textW = measureLabel(text, { fontSize, weight, tracking });
  const wUnits = Math.max(minWidth, textW + padX * 2);
  const hUnits = height ?? fontSize * 1.15 + padY * 2;
  const s = pxPerUnit;
  const c = document.createElement('canvas');
  c.width = Math.ceil(wUnits * s);
  c.height = Math.ceil(hUnits * s);
  const ctx = c.getContext('2d');
  ctx.scale(c.width / wUnits, c.height / hUnits);

  ctx.beginPath();
  ctx.roundRect(0.25, 0.25, wUnits - 0.5, hUnits - 0.5, radius);
  ctx.fillStyle = cssRGB(fill);
  ctx.fill();
  ctx.lineWidth = 0.5;
  ctx.strokeStyle = border;
  ctx.stroke();

  ctx.fillStyle = cssRGB(textColor);
  ctx.font = `${weight} ${fontSize}px ${LABEL_FONT_FAMILY}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${tracking * fontSize}px`;
  // Optical centring: caps-only text sits a touch high on 'middle'.
  ctx.fillText(text, (wUnits - textW) / 2, hUnits / 2 + fontSize * 0.06);

  return { texture: canvasTexture(c), width: wUnits, height: hUnits };
}
