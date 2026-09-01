/**
 * Generates the PWA icons: the four rings on the dark surface.
 *
 * Hand-rolled PNG encoding rather than a dependency — the icon is four
 * circles, and the palette must stay in lockstep with styles/tokens.css.
 *
 * Run: npm run icons
 */
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../public');

const SURFACE = [0x12, 0x07, 0x0c];
const TRACK = [0x2a, 0x16, 0x20];
// Outer to inner, matching ringSpecs(): water, reading, steps, workout.
const RINGS = [
  { color: [0x6e, 0xc5, 0xff], fill: 0.82 },
  { color: [0xc7, 0x7d, 0xff], fill: 0.66 },
  { color: [0xff, 0x7a, 0xa8], fill: 0.93 },
  { color: [0xff, 0x2d, 0x78], fill: 0.5 },
];

function crc32(buf) {
  let c = ~0;
  for (const byte of buf) {
    c ^= byte;
    for (let k = 0; k < 8; k += 1) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function encodePng(size, pixels) {
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y += 1) {
    raw[y * (stride + 1)] = 0; // filter: none
    pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Antialiased by supersampling: the rings are thin and jaggies show. */
function render(size, { inset }) {
  const ss = 3;
  const dim = size * ss;
  const centre = dim / 2;
  const pixels = Buffer.alloc(size * size * 4);

  const usable = (dim / 2) * (1 - inset);
  const band = usable * 0.155;
  const gap = band * 0.55;

  const bands = RINGS.map((ring, i) => {
    const outer = usable - i * (band + gap);
    return { ...ring, outer, inner: outer - band };
  });

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let r = 0;
      let g = 0;
      let b = 0;

      for (let sy = 0; sy < ss; sy += 1) {
        for (let sx = 0; sx < ss; sx += 1) {
          const px = x * ss + sx + 0.5 - centre;
          const py = y * ss + sy + 0.5 - centre;
          const dist = Math.hypot(px, py);
          // 0 at 12 o'clock, sweeping clockwise like the SVG rings.
          const angle = (Math.atan2(px, -py) + Math.PI * 2) % (Math.PI * 2);

          let colour = SURFACE;
          for (const ringBand of bands) {
            if (dist <= ringBand.outer && dist >= ringBand.inner) {
              colour =
                angle <= ringBand.fill * Math.PI * 2 ? ringBand.color : TRACK;
              break;
            }
          }

          r += colour[0];
          g += colour[1];
          b += colour[2];
        }
      }

      const samples = ss * ss;
      const o = (y * size + x) * 4;
      pixels[o] = Math.round(r / samples);
      pixels[o + 1] = Math.round(g / samples);
      pixels[o + 2] = Math.round(b / samples);
      pixels[o + 3] = 255;
    }
  }

  return encodePng(size, pixels);
}

mkdirSync(OUT_DIR, { recursive: true });

const targets = [
  { file: 'icon-192.png', size: 192, inset: 0.12 },
  { file: 'icon-512.png', size: 512, inset: 0.12 },
  { file: 'apple-touch-icon.png', size: 180, inset: 0.12 },
  // Maskable icons get cropped to a safe zone, so pull the art further in.
  { file: 'icon-maskable-512.png', size: 512, inset: 0.26 },
  { file: 'favicon-32.png', size: 32, inset: 0.06 },
];

for (const target of targets) {
  writeFileSync(resolve(OUT_DIR, target.file), render(target.size, target));
  console.log(`wrote public/${target.file}`);
}
