/**
 * Brand mark → every logo file the app ships.
 *
 *   node scripts/build-brand-logo.mjs "<source image>"
 *
 * The source is the champagne-gold mark on a dark, striped backdrop. The mark
 * is lifted out by colour (warm, saturated pixels; the backdrop is neutral grey
 * or black), trimmed, and written as:
 *   public/brand/mark.png          transparent, 512px (invoices, splash)
 *   public/brand/mark-256.png      transparent, 256px (navbar, auth: FintraxaLogo)
 *   public/fintraxa-mark.webp      256px tile: the mark on pitch black, rounded (navbar, auth)
 *   public/icons/icon-{32,192,512}.png, icon-maskable-512.png, favicon.ico,
 *   public/apple-touch-icon.png    on pitch black (installed app)
 */
import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';

const src = process.argv[2];
if (!src) { console.error('usage: node scripts/build-brand-logo.mjs <source image>'); process.exit(1); }

const { data, info } = await sharp(src).removeAlpha().raw().toBuffer({ resolveWithObject: true });
const out = Buffer.alloc(info.width * info.height * 4);
for (let i = 0, j = 0; i < data.length; i += 3, j += 4) {
  const r = data[i]; const g = data[i + 1]; const b = data[i + 2];
  // Warmth: gold has R well above B; grey stripes and black do not.
  const warm = r - b;
  const gold = Math.max(0, Math.min(1, (warm - 22) / 30)) * Math.max(0, Math.min(1, (r - 90) / 60));
  // The polished highlight on the right leg is nearly white (little warmth) but far brighter than any stripe.
  const shine = warm > 4 ? Math.max(0, Math.min(1, (Math.min(r, g, b) - 165) / 35)) : 0;
  const a = Math.max(gold, shine);
  out[j] = r; out[j + 1] = g; out[j + 2] = b; out[j + 3] = Math.round(a * 255);
}
const cut = await sharp(out, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
const mark = await sharp(cut).trim({ threshold: 1 }).png().toBuffer();

await mkdir('public/brand', { recursive: true });
await mkdir('public/icons', { recursive: true });
await sharp(mark).resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png({ compressionLevel: 9 }).toFile('public/brand/mark.png');
// The navbar / auth mark: transparent, 256px (2x the largest size it is drawn at).
await sharp(mark).resize(256, 256, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png({ compressionLevel: 9, palette: true, quality: 90 }).toFile('public/brand/mark-256.png');

/** The mark centred on pitch black; `pad` is the share of the edge left empty on each side. */
const tile = async (size, pad, radius = 0) => {
  const inner = Math.round(size * (1 - 2 * pad));
  const m = await sharp(mark).resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
  let img = sharp({ create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } } })
    .composite([{ input: m, gravity: 'center' }]);
  if (radius) {
    const mask = Buffer.from(`<svg width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${radius}" ry="${radius}"/></svg>`);
    img = sharp(await img.png().toBuffer()).composite([{ input: mask, blend: 'dest-in' }]);
  }
  return img;
};

await (await tile(256, 0.2, 56)).webp({ quality: 90 }).toFile('public/fintraxa-mark.webp');
await (await tile(32, 0.12)).png().toFile('public/icons/icon-32.png');
await (await tile(192, 0.18)).png().toFile('public/icons/icon-192.png');
await (await tile(512, 0.18)).png().toFile('public/icons/icon-512.png');
await (await tile(512, 0.26)).png().toFile('public/icons/icon-maskable-512.png'); // maskable safe zone: inner 80%
await (await tile(180, 0.18)).png().toFile('public/apple-touch-icon.png');

// favicon.ico: a single 48px PNG inside an ICO container.
const png48 = await (await tile(48, 0.12)).png().toBuffer();
const head = Buffer.alloc(22);
head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(1, 4);
head.writeUInt8(48, 6); head.writeUInt8(48, 7); head.writeUInt8(0, 8); head.writeUInt8(0, 9);
head.writeUInt16LE(1, 10); head.writeUInt16LE(32, 12); head.writeUInt32LE(png48.length, 14); head.writeUInt32LE(22, 18);
await writeFile('public/icons/favicon.ico', Buffer.concat([head, png48]));
console.log('brand files written');
