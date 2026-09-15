#!/usr/bin/env node
/**
 * Generates every brand asset for Rectap from one source of truth: the mark below.
 *
 * Dependency-free on purpose. An icon pipeline that needs a native image
 * library is an icon pipeline that breaks on a fresh clone or in CI, and these
 * files are small enough to rasterise by hand: signed-distance shapes into an
 * RGBA buffer, supersampled 4x for clean edges, then a minimal PNG encoder.
 *
 *   node scripts/generate-assets.mjs
 *
 * Re-run after changing the palette in src/theme/tokens.ts.
 */
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/* --------------------------------------------------------------- palette */

const ACCENT = '#FB7185';
const ACCENT_LIGHT = '#BE123C';
const INK = '#0C0C0D';
const PAPER = '#F7F7F5';

/** Supersampling factor. 4x is indistinguishable from 8x at these sizes. */
const SS = 4;

/**
 * The mark, as vector shapes in a 0..1 art box. It is app-specific — an icon
 * that differs from its neighbours only by hue is not an icon, it is a swatch —
 * and it is drawn from primitives rather than a bitmap so it stays crisp at
 * 1024 and still resolves as a distinct silhouette at 48px, which is the size
 * that actually decides recognisability.
 */
const SHAPES = [{"type":"rect","x":0.06,"y":0.18,"w":0.88,"h":0.64,"r":0.14,"fill":"accent"},{"type":"rect","x":0.15,"y":0.27,"w":0.7,"h":0.46,"r":0.08,"fill":"ink"},{"type":"circle","cx":0.5,"cy":0.5,"r":0.15,"fill":"accentLight"}];

/**
 * Fallback for an app with no vector mark yet: the legacy 5x5 intensity grid.
 * Kept so `npm run assets` never fails on a freshly bootstrapped app.
 */
const MARK = [[0.12,0.12,0.12,0.12,0.12],[0.12,1,1,1,0.12],[0.12,1,1,1,0.12],[0.12,1,1,1,0.12],[0.12,0.12,0.12,0.12,0.12]];

/* ----------------------------------------------------------------- colour */

function parseHex(hex) {
  const v = hex.replace('#', '');
  const n = Number.parseInt(v, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Blends `color` over `background` at `amount`, returning opaque RGB. */
function mix(color, background, amount) {
  const a = parseHex(color);
  const b = parseHex(background);
  const t = Math.max(0, Math.min(1, amount));
  return [0, 1, 2].map((i) => Math.round(b[i] + (a[i] - b[i]) * t));
}

/** Named fills a mark may use. Resolved against the app palette, never literals. */
const PALETTE = {
  accent: () => parseHex(ACCENT),
  accentLight: () => parseHex(ACCENT_LIGHT),
  accentDim: () => mix(ACCENT, INK, 0.3),
  accentMid: () => mix(ACCENT, INK, 0.6),
  ink: () => parseHex(INK),
  paper: () => parseHex(PAPER),
};

function fillOf(name) {
  const entry = PALETTE[name];
  if (!entry) throw new Error(`Unknown mark fill '${name}'`);
  return entry();
}

/* ----------------------------------------------------------------- canvas */

function createCanvas(width, height) {
  return { width, height, data: new Uint8ClampedArray(width * height * 4) };
}

function fillCanvas(canvas, [r, g, b], alpha = 255) {
  for (let i = 0; i < canvas.data.length; i += 4) {
    canvas.data[i] = r;
    canvas.data[i + 1] = g;
    canvas.data[i + 2] = b;
    canvas.data[i + 3] = alpha;
  }
}

/** Source-over composite of one pixel. `color` is an [r, g, b] triple. */
function blendPixel(canvas, x, y, color, alpha) {
  if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height || alpha <= 0) return;
  const i = (y * canvas.width + x) * 4;
  const src = alpha;
  const dstA = canvas.data[i + 3] / 255;
  const outA = src + dstA * (1 - src);
  if (outA <= 0) return;
  for (let c = 0; c < 3; c += 1) {
    canvas.data[i + c] = (canvas.data[i + c] * dstA * (1 - src) + color[c] * src) / outA;
  }
  canvas.data[i + 3] = Math.round(outA * 255);
}

/* ------------------------------------------------- signed distance fields */

/** Signed distance from a point to a rounded rectangle; negative is inside. */
function roundedRectDistance(px, py, x, y, w, h, radius) {
  const r = Math.min(radius, w / 2, h / 2);
  const cx = Math.abs(px - (x + w / 2)) - (w / 2 - r);
  const cy = Math.abs(py - (y + h / 2)) - (h / 2 - r);
  const dx = Math.max(cx, 0);
  const dy = Math.max(cy, 0);
  return Math.min(Math.max(cx, cy), 0) + Math.sqrt(dx * dx + dy * dy) - r;
}

function circleDistance(px, py, cx, cy, r) {
  return Math.hypot(px - cx, py - cy) - r;
}

/** An annulus of stroke width `w` centred on radius `r`. */
function ringDistance(px, py, cx, cy, r, w) {
  return Math.abs(Math.hypot(px - cx, py - cy) - r) - w / 2;
}

/** A capsule: the segment (ax,ay)-(bx,by) grown by half the stroke width. */
function segmentDistance(px, py, ax, ay, bx, by, w) {
  const vx = bx - ax;
  const vy = by - ay;
  const len2 = vx * vx + vy * vy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / len2));
  return Math.hypot(px - (ax + vx * t), py - (ay + vy * t)) - w / 2;
}

/**
 * Signed distance to an arbitrary simple polygon (Inigo Quilez's formulation).
 * Handles the concave cases a speech-bubble tail or a chevron needs.
 */
function polygonDistance(px, py, points) {
  let d = Infinity;
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
    const [ax, ay] = points[i];
    const [bx, by] = points[j];
    const ex = bx - ax;
    const ey = by - ay;
    const wx = px - ax;
    const wy = py - ay;
    const len2 = ex * ex + ey * ey;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, (wx * ex + wy * ey) / len2));
    const cx = wx - ex * t;
    const cy = wy - ey * t;
    d = Math.min(d, cx * cx + cy * cy);
    // Crossing-number test, evaluated alongside the distance to avoid a second pass.
    if (ay <= py !== by <= py && px < ax + ((py - ay) / (by - ay)) * ex) inside = !inside;
  }
  return (inside ? -1 : 1) * Math.sqrt(d);
}

/**
 * Rasterises one shape through its distance field. A one-pixel linear ramp
 * across the edge is enough coverage approximation once the whole canvas is
 * supersampled.
 */
function drawSdf(canvas, bounds, distance, color, alpha = 1) {
  const x0 = Math.max(0, Math.floor(bounds[0] - 1));
  const y0 = Math.max(0, Math.floor(bounds[1] - 1));
  const x1 = Math.min(canvas.width, Math.ceil(bounds[2] + 1));
  const y1 = Math.min(canvas.height, Math.ceil(bounds[3] + 1));
  for (let py = y0; py < y1; py += 1) {
    for (let px = x0; px < x1; px += 1) {
      const coverage = Math.max(0, Math.min(1, 0.5 - distance(px + 0.5, py + 0.5)));
      if (coverage > 0) blendPixel(canvas, px, py, color, coverage * alpha);
    }
  }
}

/** Draws an anti-aliased rounded rectangle. Pixel units. */
function drawRoundedRect(canvas, x, y, w, h, radius, color, alpha = 1) {
  drawSdf(
    canvas,
    [x, y, x + w, y + h],
    (px, py) => roundedRectDistance(px, py, x, y, w, h, radius),
    color,
    alpha,
  );
}

/** Box-downsamples a supersampled canvas back to its target size. */
function downsample(canvas, factor) {
  const width = canvas.width / factor;
  const height = canvas.height / factor;
  const out = createCanvas(width, height);
  const samples = factor * factor;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < factor; sy += 1) {
        for (let sx = 0; sx < factor; sx += 1) {
          const i = ((y * factor + sy) * canvas.width + (x * factor + sx)) * 4;
          const pa = canvas.data[i + 3] / 255;
          // Premultiply so transparent pixels do not drag colour toward black.
          r += canvas.data[i] * pa;
          g += canvas.data[i + 1] * pa;
          b += canvas.data[i + 2] * pa;
          a += pa;
        }
      }
      const o = (y * width + x) * 4;
      if (a > 0) {
        out.data[o] = r / a;
        out.data[o + 1] = g / a;
        out.data[o + 2] = b / a;
      }
      out.data[o + 3] = Math.round((a / samples) * 255);
    }
  }
  return out;
}

/* -------------------------------------------------------------------- PNG */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function encodePng(canvas) {
  const { width, height, data } = canvas;
  // Filter type 0 (None) per scanline: these are flat-colour images, so the
  // extra compression from adaptive filtering is not worth the complexity.
  const raw = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (width * 4 + 1);
    raw[rowStart] = 0;
    Buffer.from(data.buffer, y * width * 4, width * 4).copy(raw, rowStart + 1);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/**
 * Strips the alpha channel by compositing onto `background`.
 * The App Store rejects a 1024 icon that contains an alpha channel at all.
 */
function encodePngOpaque(canvas, background) {
  const [br, bg, bb] = parseHex(background);
  const { width, height, data } = canvas;
  const rgb = Buffer.alloc(height * (width * 3 + 1));
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (width * 3 + 1);
    rgb[rowStart] = 0;
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      const a = data[i + 3] / 255;
      const o = rowStart + 1 + x * 3;
      rgb[o] = Math.round(data[i] * a + br * (1 - a));
      rgb[o + 1] = Math.round(data[i + 1] * a + bg * (1 - a));
      rgb[o + 2] = Math.round(data[i + 2] * a + bb * (1 - a));
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2; // colour type: RGB, no alpha
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(rgb, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ---------------------------------------------------------------- ground */

/**
 * The icon ground: a vertical wash from an accent-tinted charcoal down to ink,
 * with a soft glow behind the mark. Flat black reads as "unfinished" next to
 * every other icon on a home screen; this costs one pass over the buffer.
 */
function fillGround(canvas) {
  const top = mix(ACCENT, INK, 0.11);
  const bottom = parseHex(INK);
  const cx = canvas.width / 2;
  const cy = canvas.height * 0.42;
  const glowRadius = canvas.width * 0.62;
  const glow = mix(ACCENT, INK, 0.5);

  for (let y = 0; y < canvas.height; y += 1) {
    const t = y / (canvas.height - 1);
    for (let x = 0; x < canvas.width; x += 1) {
      const d = Math.hypot(x - cx, y - cy) / glowRadius;
      // Smoothstep falloff: a linear glow shows a visible terminating ring.
      const g = Math.max(0, 1 - d);
      const weight = g * g * (3 - 2 * g) * 0.2;
      const i = (y * canvas.width + x) * 4;
      for (let c = 0; c < 3; c += 1) {
        const base = top[c] + (bottom[c] - top[c]) * t;
        canvas.data[i + c] = base + (glow[c] - base) * weight;
      }
      canvas.data[i + 3] = 255;
    }
  }
}

/* ------------------------------------------------------------------ marks */

/**
 * Draws one shape from the 0..1 art box into pixel space.
 * `origin` and `size` place the art box inside the canvas.
 */
function drawShape(canvas, shape, origin, size) {
  const X = (v) => origin[0] + v * size;
  const Y = (v) => origin[1] + v * size;
  const S = (v) => v * size;
  const color = fillOf(shape.fill ?? 'accent');
  const alpha = shape.alpha ?? 1;

  switch (shape.type) {
    case 'rect': {
      drawRoundedRect(canvas, X(shape.x), Y(shape.y), S(shape.w), S(shape.h), S(shape.r ?? 0), color, alpha);
      return;
    }
    case 'circle': {
      const cx = X(shape.cx);
      const cy = Y(shape.cy);
      const r = S(shape.r);
      drawSdf(
        canvas,
        [cx - r, cy - r, cx + r, cy + r],
        (px, py) => circleDistance(px, py, cx, cy, r),
        color,
        alpha,
      );
      return;
    }
    case 'ring': {
      const cx = X(shape.cx);
      const cy = Y(shape.cy);
      const r = S(shape.r);
      const w = S(shape.w);
      const outer = r + w / 2;
      drawSdf(
        canvas,
        [cx - outer, cy - outer, cx + outer, cy + outer],
        (px, py) => ringDistance(px, py, cx, cy, r, w),
        color,
        alpha,
      );
      return;
    }
    case 'path': {
      // A polyline with round caps and joins: drawn as overlapping capsules,
      // which is exact for round joins and needs no mitre maths.
      const w = S(shape.w);
      const pts = shape.points.map(([x, y]) => [X(x), Y(y)]);
      for (let i = 0; i < pts.length - 1; i += 1) {
        const [ax, ay] = pts[i];
        const [bx, by] = pts[i + 1];
        drawSdf(
          canvas,
          [Math.min(ax, bx) - w, Math.min(ay, by) - w, Math.max(ax, bx) + w, Math.max(ay, by) + w],
          (px, py) => segmentDistance(px, py, ax, ay, bx, by, w),
          color,
          alpha,
        );
      }
      return;
    }
    case 'poly': {
      const pts = shape.points.map(([x, y]) => [X(x), Y(y)]);
      const xs = pts.map((p) => p[0]);
      const ys = pts.map((p) => p[1]);
      drawSdf(
        canvas,
        [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)],
        (px, py) => polygonDistance(px, py, pts),
        color,
        alpha,
      );
      return;
    }
    default:
      throw new Error(`Unknown mark shape '${shape.type}'`);
  }
}

/** The legacy 5x5 intensity grid, for an app with no vector mark yet. */
function drawGridMark(canvas, origin, size, background, mode) {
  const gap = size * 0.055;
  const cell = (size - gap * 4) / 5;
  const radius = cell * 0.26;
  for (let row = 0; row < 5; row += 1) {
    for (let col = 0; col < 5; col += 1) {
      const intensity = MARK[row][col];
      const x = origin[0] + col * (cell + gap);
      const y = origin[1] + row * (cell + gap);
      if (mode === 'monochrome') {
        drawRoundedRect(canvas, x, y, cell, cell, radius, [255, 255, 255], intensity);
      } else {
        drawRoundedRect(canvas, x, y, cell, cell, radius, mix(ACCENT, background, intensity), 1);
      }
    }
  }
}

/**
 * Draws the mark centred in `canvas`, occupying `scale` of the shorter side.
 * `mode` 'monochrome' flattens every fill for the Android themed icon, which
 * is a single-colour mask.
 */
function drawMark(canvas, { scale, background, mode = 'tinted' }) {
  const size = Math.min(canvas.width, canvas.height) * scale;
  if (size <= 0) return;
  const origin = [(canvas.width - size) / 2, (canvas.height - size) / 2];

  if (!SHAPES) {
    drawGridMark(canvas, origin, size, background, mode);
    return;
  }
  for (const shape of SHAPES) {
    if (mode === 'monochrome') {
      // A cut-out painted in ink must stay a hole, not become another white
      // blob, so it is skipped rather than recoloured.
      if (shape.fill === 'ink') continue;
      drawShape(canvas, { ...shape, fill: 'paper' }, origin, size);
    } else {
      drawShape(canvas, shape, origin, size);
    }
  }
}

function renderMark({ size, scale, background, mode, ground = false, transparent = false }) {
  const canvas = createCanvas(size * SS, size * SS);
  if (ground) fillGround(canvas);
  else if (!transparent) fillCanvas(canvas, parseHex(background));
  drawMark(canvas, { scale, background, mode });
  return downsample(canvas, SS);
}

/**
 * The Play feature graphic: the mark on the same ground as the icon, offset
 * left, with a band of accent bars to the right. No text — it cannot be
 * mis-set in a font we do not ship, and Play overlays the app name anyway.
 */
function renderFeatureGraphic() {
  const width = 1024;
  const height = 500;
  const canvas = createCanvas(width * SS, height * SS);
  fillGround(canvas);

  const size = height * SS * 0.56;
  const origin = [width * SS * 0.13, (height * SS - size) / 2];
  if (SHAPES) {
    for (const shape of SHAPES) drawShape(canvas, shape, origin, size);
  } else {
    drawGridMark(canvas, origin, size, INK, 'tinted');
  }

  // Three bars whose lengths step up: a quiet gesture of progress, not a chart
  // claiming a number we have not measured.
  const barX = width * SS * 0.52;
  const barH = height * SS * 0.075;
  const gap = height * SS * 0.062;
  const top = (height * SS - (barH * 3 + gap * 2)) / 2;
  const widths = [0.2, 0.31, 0.26];
  const fills = ['accentDim', 'accent', 'accentLight'];
  for (let i = 0; i < 3; i += 1) {
    drawRoundedRect(
      canvas,
      barX,
      top + i * (barH + gap),
      width * SS * widths[i],
      barH,
      barH / 2,
      fillOf(fills[i]),
      1,
    );
  }

  return downsample(canvas, SS);
}

/* ------------------------------------------------------------------ write */

function write(relativePath, buffer) {
  const target = resolve(ROOT, relativePath);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, buffer);
  const kb = (buffer.length / 1024).toFixed(1);
  console.log(`  ${relativePath.padEnd(44)} ${kb.padStart(7)} KB`);
}

console.log('Generating Rectap brand assets\n');

// App icon. No alpha channel: the App Store rejects a 1024 icon that has one,
// and both platforms apply their own corner mask.
write(
  'assets/icon.png',
  encodePngOpaque(renderMark({ size: 1024, scale: 0.6, background: INK, ground: true }), INK),
);

// Android adaptive icon: the foreground must stay inside the centre 66%, since
// the launcher may mask it to a circle.
write(
  'assets/android-icon-foreground.png',
  encodePng(renderMark({ size: 1024, scale: 0.44, background: INK, transparent: true })),
);
write(
  'assets/android-icon-background.png',
  encodePngOpaque(renderMark({ size: 1024, scale: 0, background: INK, ground: true }), INK),
);
write(
  'assets/android-icon-monochrome.png',
  encodePng(
    renderMark({ size: 1024, scale: 0.44, background: INK, mode: 'monochrome', transparent: true }),
  ),
);

// Splash: the mark alone, transparent, over the theme background set in
// app.config.ts.
write(
  'assets/splash-icon.png',
  encodePng(renderMark({ size: 512, scale: 0.78, background: PAPER, transparent: true })),
);

write(
  'assets/favicon.png',
  encodePngOpaque(renderMark({ size: 64, scale: 0.68, background: INK, ground: true }), INK),
);

write('store/feature-graphic.png', encodePngOpaque(renderFeatureGraphic(), INK));

console.log('\nDone.');
