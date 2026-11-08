/**
 * Installed-app icons, from the transparent brand mark.
 *
 *   node scripts/build-app-icons.mjs
 *
 * Reads public/brand/mark.png (written by build-brand-logo.mjs) and writes:
 *   public/icons/icon-{192,512}.png  Apple-style rounded tile (squircle, transparent corners).
 *                                    What Chrome/Edge use for the installed desktop app and
 *                                    the Android launcher when no maskable icon is chosen.
 *   public/icons/icon-maskable-512.png  full-bleed square; Android cuts its own shape,
 *                                    so the mark stays inside the 80% safe circle.
 *   public/apple-touch-icon.png      full-bleed square; iOS rounds it itself.
 *   public/icons/icon-32.png, favicon.ico  small rounded tiles for the tab.
 *
 * The mark is wide (about 1.8:1), so "fills the tile" means width: it used to
 * sit at 64% of the tile width and read as small at taskbar sizes.
 */
import sharp from 'sharp';
import { writeFile } from 'node:fs/promises';

const BLACK = { r: 0, g: 0, b: 0, alpha: 1 };
const CLEAR = { r: 0, g: 0, b: 0, alpha: 0 };
const mark = await sharp('public/brand/mark.png').trim({ threshold: 1 }).png().toBuffer();

/**
 * Apple's icon shape is a continuous-curvature rounded square, not a plain
 * rounded rect. A superellipse |x|^n + |y|^n = 1 with n = 5 is the usual
 * close match; a circular rx leaves visible "shoulders" at the corners.
 */
function squirclePath(size, inset) {
  const c = size / 2; const r = size / 2 - inset; const n = 5; const pts = [];
  for (let i = 0; i < 360; i += 1) {
    const t = (i * Math.PI) / 180; const cos = Math.cos(t); const sin = Math.sin(t);
    const x = c + r * Math.sign(cos) * Math.abs(cos) ** (2 / n);
    const y = c + r * Math.sign(sin) * Math.abs(sin) ** (2 / n);
    pts.push(`${x.toFixed(2)},${y.toFixed(2)}`);
  }
  return `M${pts.join('L')}Z`;
}

/**
 * The mark centred on black. `width` is the share of the tile the mark spans;
 * `shape` 'squircle' cuts transparent corners with an `inset` margin (share of
 * the edge) so the icon sits on the taskbar like a native one.
 */
async function tile(size, { width, shape = 'square', inset = 0 }) {
  const m = await sharp(mark).resize(Math.round(size * width), size, { fit: 'inside' }).png().toBuffer();
  let img = await sharp({ create: { width: size, height: size, channels: 4, background: BLACK } })
    .composite([{ input: m, gravity: 'center' }]).png().toBuffer();
  if (shape === 'squircle') {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><path d="${squirclePath(size, Math.round(size * inset))}" fill="#000"/></svg>`;
    img = await sharp(img).composite([{ input: Buffer.from(svg), blend: 'dest-in' }]).png().toBuffer();
  } else if (shape === 'cleared') {
    img = await sharp(img).flatten({ background: BLACK }).png().toBuffer();
  }
  return sharp(img);
}

const save = async (s, path) => { await s.png({ compressionLevel: 9 }).toFile(path); console.log('  ', path); };

// Installed app (desktop + Android "any"): rounded, mark at 72% of the tile width.
await save(await tile(512, { width: 0.72, shape: 'squircle', inset: 0.02 }), 'public/icons/icon-512.png');
await save(await tile(192, { width: 0.72, shape: 'squircle', inset: 0.02 }), 'public/icons/icon-192.png');
// Maskable: full bleed. A 1.8:1 mark 70% wide keeps its corners inside the 80% safe circle.
await save(await tile(512, { width: 0.70 }), 'public/icons/icon-maskable-512.png');
// iOS rounds the square itself and shows transparency as black; keep it opaque.
await save(await tile(180, { width: 0.74 }), 'public/apple-touch-icon.png');
// Tab: as large as the tile allows.
await save(await tile(32, { width: 0.86, shape: 'squircle' }), 'public/icons/icon-32.png');

const png48 = await (await tile(48, { width: 0.86, shape: 'squircle' })).png().toBuffer();
const head = Buffer.alloc(22);
head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(1, 4);
head.writeUInt8(48, 6); head.writeUInt8(48, 7); head.writeUInt8(0, 8); head.writeUInt8(0, 9);
head.writeUInt16LE(1, 10); head.writeUInt16LE(32, 12); head.writeUInt32LE(png48.length, 14); head.writeUInt32LE(22, 18);
await writeFile('public/icons/favicon.ico', Buffer.concat([head, png48]));
console.log('   public/icons/favicon.ico');
