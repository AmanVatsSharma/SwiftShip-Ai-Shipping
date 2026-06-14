#!/usr/bin/env node
/* eslint-disable */
/**
 * SwiftShip Admin — placeholder PWA icon generator.
 *
 * Generates valid PNGs at:
 *   - public/icons/icon-192x192.png
 *   - public/icons/icon-512x512.png
 *   - public/icons/icon-maskable-192x192.png
 *   - public/icons/icon-maskable-512x512.png
 *
 * The icons are solid-color squares with a white centered "S" wordmark. They
 * are valid PNGs and pass the PWA manifest validator, but they are clearly
 * placeholders. Replace them with designer-supplied artwork before launch.
 *
 * Run from the admin-portal directory:
 *     node scripts/generate-icons.js
 *
 * No external dependencies are required (uses Node's built-in zlib + Buffer).
 */

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const THEME = { r: 0x25, g: 0x63, b: 0xeb }; // #2563eb
const BG = { r: 0xff, g: 0xff, b: 0xff };
const FG = { r: 0xff, g: 0xff, b: 0xff };

const ICON_DIR = path.join(__dirname, '..', 'public', 'icons');
fs.mkdirSync(ICON_DIR, { recursive: true });

/**
 * Render a 5x7 block-letter "S" bitmap on a 32x32 logical grid (scaled later).
 * Each cell is 1.0 unit; the wordmark sits centered in the icon.
 */
const S_BITMAP_5x7 = [
  '01110',
  '10001',
  '10000',
  '01110',
  '00001',
  '10001',
  '01110',
];

/**
 * Build an RGBA pixel buffer for a 512x512 icon. The "maskable" variant uses
 * a 10% safe-area padding so the wordmark is not cropped by adaptive icons.
 */
function buildIconPixels(size, { maskable = false } = {}) {
  const buf = Buffer.alloc(size * size * 4);
  const safeArea = maskable ? Math.round(size * 0.1) : 0;
  const inner = size - safeArea * 2;

  // Bitmap: scale 5x7 grid to fit ~55% of the inner area, centered.
  const scale = Math.max(1, Math.floor((inner * 0.55) / 7));
  const bmW = 5 * scale;
  const bmH = 7 * scale;
  const offsetX = Math.floor((size - bmW) / 2);
  const offsetY = Math.floor((size - bmH) / 2);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      let color = maskable ? THEME : THEME;
      // For the non-maskable icon, give it a white background and a blue
      // rounded square "tile" so it does not look like a flat block.
      if (!maskable) {
        const margin = Math.round(size * 0.05);
        const inTile =
          x >= margin &&
          x < size - margin &&
          y >= margin &&
          y < size - margin;
        color = inTile ? THEME : BG;
      }
      // Stamp the "S" wordmark.
      const inWordX = x >= offsetX && x < offsetX + bmW;
      const inWordY = y >= offsetY && y < offsetY + bmH;
      if (inWordX && inWordY) {
        const localX = Math.floor((x - offsetX) / scale);
        const localY = Math.floor((y - offsetY) / scale);
        const row = S_BITMAP_5x7[localY];
        if (row && row[localX] === '1') {
          color = FG;
        }
      }
      buf[i] = color.r;
      buf[i + 1] = color.g;
      buf[i + 2] = color.b;
      buf[i + 3] = 0xff;
    }
  }
  return buf;
}

function crc32(buf) {
  let c;
  const table = [];
  for (let n = 0; n < 256; n++) {
    c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff];
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePng(rgba, width, height) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  // Add filter byte (0 = None) at the start of every scanline.
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idat = zlib.deflateSync(raw);
  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function writeIcon(name, size, opts) {
  const pixels = buildIconPixels(size, opts);
  const png = encodePng(pixels, size, size);
  const out = path.join(ICON_DIR, name);
  fs.writeFileSync(out, png);
  console.log(`wrote ${out} (${size}x${size}, ${png.length} bytes)`);
}

writeIcon('icon-192x192.png', 192, { maskable: false });
writeIcon('icon-512x512.png', 512, { maskable: false });
writeIcon('icon-maskable-192x192.png', 192, { maskable: true });
writeIcon('icon-maskable-512x512.png', 512, { maskable: true });

console.log('\nPlaceholder PWA icons generated.');
console.log(
  'NOTE: These are valid PNGs but clearly placeholder. Replace with designer artwork before launch.',
);
