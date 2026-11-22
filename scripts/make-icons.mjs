#!/usr/bin/env node
/**
 * Draws the app icons (a round companion on the 2GETHER violet) and writes them as PNG in
 * `web/static/icons/`. No dependency: shapes are signed distances, sampled 4×4 per pixel for
 * smooth edges, and the PNG is encoded with zlib. Run `node scripts/make-icons.mjs` after a change.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'web', 'static', 'icons');

const VIOLET = [124, 58, 237];
const BODY = [255, 236, 179];
const BODY_SHADE = [250, 214, 140];
const EYE = [45, 27, 78];
const SHINE = [255, 255, 255];
const BLUSH = [244, 143, 177];

/** Signed distance to an ellipse (approximate, good enough for drawing). */
function ellipse(x, y, cx, cy, rx, ry) {
  const dx = (x - cx) / rx;
  const dy = (y - cy) / ry;
  return (Math.sqrt(dx * dx + dy * dy) - 1) * Math.min(rx, ry);
}

/** Signed distance to a rounded square of half-size `h` and corner radius `r`, centred at 0.5. */
function roundedSquare(x, y, h, r) {
  const qx = Math.abs(x - 0.5) - h + r;
  const qy = Math.abs(y - 0.5) - h + r;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
}

/**
 * The colour at (x, y) in [0, 1]², or null where it is transparent. `scale` shrinks the drawing
 * around the centre (a maskable icon keeps it inside the safe zone), `full` fills the background.
 */
function paint(x, y, { scale, full }) {
  if (!full && roundedSquare(x, y, 0.5, 0.22) > 0) return null;
  const u = 0.5 + (x - 0.5) / scale;
  const v = 0.5 + (y - 0.5) / scale;
  let color = VIOLET;
  // A soft shadow under the companion.
  if (ellipse(u, v, 0.5, 0.86, 0.26, 0.05) < 0) color = [104, 44, 207];
  // Body, with a lighter belly.
  if (ellipse(u, v, 0.5, 0.56, 0.33, 0.3) < 0) {
    color = ellipse(u, v, 0.5, 0.66, 0.24, 0.17) < 0 ? BODY : BODY_SHADE;
    if (ellipse(u, v, 0.5, 0.52, 0.3, 0.26) < 0) color = BODY;
  }
  // Ears.
  for (const side of [-1, 1]) {
    if (ellipse(u, v, 0.5 + side * 0.2, 0.3, 0.08, 0.1) < 0 && v < 0.36) color = BODY_SHADE;
  }
  // Eyes with a shine, and blushing cheeks.
  for (const side of [-1, 1]) {
    const ex = 0.5 + side * 0.12;
    if (ellipse(u, v, ex, 0.52, 0.045, 0.06) < 0) color = EYE;
    if (ellipse(u, v, ex + 0.015, 0.5, 0.015, 0.018) < 0) color = SHINE;
    if (ellipse(u, v, 0.5 + side * 0.21, 0.61, 0.05, 0.03) < 0) color = BLUSH;
  }
  // A small smile.
  const smile = ellipse(u, v, 0.5, 0.6, 0.04, 0.03);
  if (smile < 0 && smile > -0.012 && v > 0.6) color = EYE;
  return color;
}

function render(size, options) {
  const samples = 4;
  const pixels = Buffer.alloc(size * size * 4);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < samples; sy++) {
        for (let sx = 0; sx < samples; sx++) {
          const c = paint(
            (px + (sx + 0.5) / samples) / size,
            (py + (sy + 0.5) / samples) / size,
            options,
          );
          if (!c) continue;
          r += c[0];
          g += c[1];
          b += c[2];
          a += 1;
        }
      }
      const i = (py * size + px) * 4;
      if (a > 0) {
        pixels[i] = Math.round(r / a);
        pixels[i + 1] = Math.round(g / a);
        pixels[i + 2] = Math.round(b / a);
      }
      pixels[i + 3] = Math.round((255 * a) / (samples * samples));
    }
  }
  return encodePng(size, pixels);
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}
function encodePng(size, rgba) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // RGBA
  const rows = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    rows[y * (size * 4 + 1)] = 0; // no filter
    rgba.copy(rows, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(rows, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync(OUT, { recursive: true });
const icons = {
  'icon-192.png': [192, { scale: 1, full: false }],
  'icon-512.png': [512, { scale: 1, full: false }],
  // Android crops maskable icons to a circle: full background, drawing inside the safe zone.
  'maskable-512.png': [512, { scale: 0.8, full: true }],
  // iOS rounds the corners itself and wants no transparency.
  'apple-touch-icon.png': [180, { scale: 0.9, full: true }],
  'favicon-32.png': [32, { scale: 1, full: false }],
};
for (const [name, [size, options]] of Object.entries(icons)) {
  writeFileSync(join(OUT, name), render(size, options));
  console.log(`web/static/icons/${name}`);
}
