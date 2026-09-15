#!/usr/bin/env node
/**
 * Generates every brand asset for Rectap from one source of truth: the mark below.
 *
 * Dependency-free on purpose. An icon pipeline that needs a native image
 * library is an icon pipeline that breaks on a fresh clone or in CI, and these
 * files are small enough to rasterise by hand: rounded rectangles into an RGBA
 * buffer, supersampled 4x for clean edges, then a minimal PNG encoder.
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
const INK = '#0C0C0D';
const PAPER = '#F7F7F5';

/** Supersampling factor. 4x is indistinguishable from 8x at these sizes. */
const SS = 4;

/**
 * The mark: a 5x5 grid with a diagonal band of completed days rising to the
 * top-right. It reads as growth at 1024px and still resolves as a distinct
 * shape at 48px, which is the size that actually decides recognisability.
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

/** Signed distance from a point to a rounded rectangle; negative is inside. */
function roundedRectDistance(px, py, x, y, w, h, radius) {
  const cx = Math.abs(px - (x + w / 2)) - (w / 2 - radius);
  const cy = Math.abs(py - (y + h / 2)) - (h / 2 - radius);
  const dx = Math.max(cx, 0);
  const dy = Math.max(cy, 0);
  return Math.min(Math.max(cx, cy), 0) + Math.sqrt(dx * dx + dy * dy) - radius;
}

/** Draws an anti-aliased rounded rectangle. */
function drawRoundedRect(canvas, x, y, w, h, radius, color, alpha = 1) {
  const x0 = Math.max(0, Math.floor(x - 1));
  const y0 = Math.max(0, Math.floor(y - 1));
  const x1 = Math.min(canvas.width, Math.ceil(x + w + 1));
  const y1 = Math.min(canvas.height, Math.ceil(y + h + 1));

  for (let py = y0; py < y1; py += 1) {
    for (let px = x0; px < x1; px += 1) {
      const d = roundedRectDistance(px + 0.5, py + 0.5, x, y, w, h, radius);
      // A one-pixel linear ramp across the edge is enough coverage
      // approximation once the whole canvas is supersampled.
      const coverage = Math.max(0, Math.min(1, 0.5 - d));
      if (coverage > 0) blendPixel(canvas, px, py, color, coverage * alpha);
    }
  }
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

/* ------------------------------------------------------------------ marks */

/**
 * Draws the 5x5 mark centred in `canvas`, occupying `scale` of the shorter
 * side. `mode` picks how cell intensity maps to colour.
 */
function drawMark(canvas, { scale, background, mode = 'tinted' }) {
  const size = Math.min(canvas.width, canvas.height);
  const grid = size * scale;
  const gap = grid * 0.055;
  const cell = (grid - gap * 4) / 5;
  const radius = cell * 0.26;
  const originX = (canvas.width - grid) / 2;
  const originY = (canvas.height - grid) / 2;

  for (let row = 0; row < 5; row += 1) {
    for (let col = 0; col < 5; col += 1) {
      const intensity = MARK[row][col];
      const x = originX + col * (cell + gap);
      const y = originY + row * (cell + gap);

      if (mode === 'monochrome') {
        // Android themed icons are a single-colour mask; intensity becomes alpha.
        drawRoundedRect(canvas, x, y, cell, cell, radius, [255, 255, 255], intensity);
      } else if (mode === 'alpha') {
        // Translucent accent rather than a pre-blend, so the same file reads
        // correctly on both the light and the dark splash background.
        drawRoundedRect(canvas, x, y, cell, cell, radius, parseHex(ACCENT), intensity);
      } else {
        drawRoundedRect(canvas, x, y, cell, cell, radius, mix(ACCENT, background, intensity), 1);
      }
    }
  }
}

function renderMark({ size, scale, background, mode, transparent = false }) {
  const canvas = createCanvas(size * SS, size * SS);
  if (!transparent) fillCanvas(canvas, parseHex(background));
  drawMark(canvas, { scale: scale, background, mode });
  return downsample(canvas, SS);
}

/**
 * The Play feature graphic: a wide, realistic contribution grid rather than a
 * logo lockup. It shows the product's actual output, which is the entire pitch,
 * and needs no text — so it cannot be mis-set in a font we do not ship.
 */
function renderFeatureGraphic() {
  const width = 1024;
  const height = 500;
  const canvas = createCanvas(width * SS, height * SS);
  fillCanvas(canvas, parseHex(INK));

  const rows = 7;
  const columns = 26;
  const gap = 6 * SS;
  const cell = 26 * SS;
  const gridWidth = columns * cell + (columns - 1) * gap;
  const gridHeight = rows * cell + (rows - 1) * gap;
  const originX = (width * SS - gridWidth) / 2;
  const originY = (height * SS - gridHeight) / 2;

  // Deterministic pseudo-random history that trends upward to the right, so the
  // graphic reads as a habit being built rather than as noise.
  let seed = 20260913;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  for (let col = 0; col < columns; col += 1) {
    const adherence = 0.25 + (col / (columns - 1)) * 0.65;
    for (let row = 0; row < rows; row += 1) {
      const done = random() < adherence;
      const intensity = done ? 0.45 + random() * 0.55 : 0.09;
      drawRoundedRect(
        canvas,
        originX + col * (cell + gap),
        originY + row * (cell + gap),
        cell,
        cell,
        cell * 0.26,
        mix(ACCENT, INK, intensity),
        1,
      );
    }
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
  encodePngOpaque(renderMark({ size: 1024, scale: 0.62, background: INK }), INK),
);

// Android adaptive icon: the foreground must stay inside the centre 66%, since
// the launcher may mask it to a circle.
write(
  'assets/android-icon-foreground.png',
  encodePng(
    renderMark({ size: 1024, scale: 0.46, background: INK, transparent: true }),
  ),
);
write('assets/android-icon-background.png', encodePngOpaque(createCanvas(1024, 1024), INK));
write(
  'assets/android-icon-monochrome.png',
  encodePng(
    renderMark({ size: 1024, scale: 0.46, background: INK, mode: 'monochrome', transparent: true }),
  ),
);

// Splash: the mark alone, transparent, over the theme background set in
// app.config.ts so it works in both light and dark.
write(
  'assets/splash-icon.png',
  encodePng(
    renderMark({ size: 512, scale: 0.72, background: PAPER, mode: 'alpha', transparent: true }),
  ),
);

write(
  'assets/favicon.png',
  encodePngOpaque(renderMark({ size: 64, scale: 0.7, background: INK }), INK),
);

write('store/feature-graphic.png', encodePngOpaque(renderFeatureGraphic(), INK));

console.log('\nDone.');
