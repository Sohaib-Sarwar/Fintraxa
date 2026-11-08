/**
 * Home "Net worth" card artwork → public/hero/networth-{dark,light}.webp
 *
 *   node scripts/build-hero-images.mjs <dark.png> <light.png>
 *
 * Two separate renders (one per theme), not an inverted copy: the light one
 * is desaturated a little so its background sits neutral against the white
 * card; both are resized for a ~1200 px wide card at 1.3x and saved as WebP.
 * The card fades the art in from the right (SummaryCard), so the subject
 * belongs on the right half of the source image.
 */
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';

const [, , dark, light] = process.argv;
if (!dark || !light) {
  console.error('usage: node scripts/build-hero-images.mjs <dark.png> <light.png>');
  process.exit(1);
}
mkdirSync('public/hero', { recursive: true });
const WIDTH = 1600;

await sharp(dark).resize({ width: WIDTH }).webp({ quality: 80, effort: 6 }).toFile('public/hero/networth-dark.webp');
await sharp(light).resize({ width: WIDTH }).modulate({ saturation: 0.55, brightness: 1.01 }).webp({ quality: 82, effort: 6 }).toFile('public/hero/networth-light.webp');

for (const f of ['networth-dark', 'networth-light']) {
  const m = await sharp(`public/hero/${f}.webp`).metadata();
  console.log(`${f}.webp ${m.width}x${m.height}`);
}
