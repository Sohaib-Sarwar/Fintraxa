/**
 * AMC logos → small rounded-square WebPs in public/amc-logos/<code>.webp.
 *
 *   node scripts/build-amc-logos.mjs "<dir with the source logos>"
 *
 * Each source is trimmed of its empty margin, centred on a white square with
 * even padding, given rounded corners (transparent outside), and exported at
 * 128 px — enough for 2–3× density at the 28–48 px the UI renders.
 */
import { join, dirname } from 'node:path';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const SRC = process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'amc-logos');
const SIZE = 128;
const PAD = 0.14;        // share of the square kept clear on each side
const RADIUS = 0.22;     // corner radius as a share of the side

const LOGOS = [
  { code: 'atlas', file: 'Atlas Asset management.webp' },
  { code: 'mcb', file: 'MCB FUNDS.png', cropTop: 0.5 },   // the wordmark is unreadable at icon size; keep the mark
  { code: 'meezan', file: 'Meezan Investemnts.jpg', pad: 0.08 },   // round seal: fill more of the tile
  { code: 'nbp', file: 'NBP Funds.png', pad: 0.08 },
  { code: 'ubl', file: 'UBL FUNDS.png' },
];

mkdirSync(OUT, { recursive: true });
const r = Math.round(SIZE * RADIUS);
const mask = Buffer.from(`<svg width="${SIZE}" height="${SIZE}"><rect width="${SIZE}" height="${SIZE}" rx="${r}" ry="${r}" fill="#fff"/></svg>`);

for (const { code, file, pad = PAD, cropTop } of LOGOS) {
  const inner = Math.round(SIZE * (1 - 2 * pad));
  let src = sharp(join(SRC, file));
  if (cropTop) {
    const m = await src.metadata();
    src = sharp(await src.extract({ left: 0, top: 0, width: m.width, height: Math.round(m.height * cropTop) }).toBuffer());
  }
  const trimmed = await src
    .flatten({ background: '#ffffff' })
    .trim({ background: '#ffffff', threshold: 28 })
    .resize(inner, inner, { fit: 'contain', background: '#ffffff' })
    .toBuffer();
  await sharp({ create: { width: SIZE, height: SIZE, channels: 4, background: '#ffffff' } })
    .composite([{ input: trimmed, gravity: 'centre' }, { input: mask, blend: 'dest-in' }])
    .webp({ quality: 90, alphaQuality: 100 })
    .toFile(join(OUT, `${code}.webp`));
  console.log(`amc-logos/${code}.webp`);
}
