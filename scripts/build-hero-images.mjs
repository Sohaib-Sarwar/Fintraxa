/**
 * Home "Net worth" card backgrounds → public/hero/*.webp
 *
 *   node scripts/build-hero-images.mjs <source.png>
 *
 * The source is the dark artwork (graphite ribbons on black, generated with
 * Higgsfield Z Image). The light variant is the same artwork inverted and
 * lifted, so both themes share one composition.
 */
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';

const src = process.argv[2];
if (!src) { console.error('usage: node scripts/build-hero-images.mjs <source.png>'); process.exit(1); }
mkdirSync('public/hero', { recursive: true });

const base = sharp(src).resize({ width: 1600, withoutEnlargement: true });
await base.clone().webp({ quality: 74 }).toFile('public/hero/networth-dark.webp');
// Invert (black → white, silver ribbons → grey), then compress the range so
// the ribbons stay soft on a near-white card.
// Two passes: sharp would otherwise apply linear() before negate().
const inverted = await base.clone().negate({ alpha: false }).png().toBuffer();
await sharp(inverted).linear(0.42, 255 * 0.58).webp({ quality: 74 }).toFile('public/hero/networth-light.webp');
for (const f of ['networth-dark', 'networth-light']) {
  const m = await sharp(`public/hero/${f}.webp`).metadata();
  console.log(f, `${m.width}x${m.height}`);
}
