/**
 * Builds the Home card art in assets/cards/ (owner, 2026-11-15).
 *
 *   node scripts/build-card-art.mjs <photos-dir>
 *
 * 1. Photos: each <photos-dir>/<source> is centre-cropped to the card ratio (1.586:1), 1000 px wide, WebP.
 *    Sources and licences are listed in assets/cards/CREDITS.md (NASA: public domain; Pexels: Pexels License).
 *    `FRAMED` photos also get a thin engraved double frame inset from the edge.
 * Needs `sharp` (the web app's devDependency): run from the repo with ../node_modules available.
 */
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(here, '..', '..', 'package.json'));
const sharp = require('sharp');
const out = join(here, '..', 'assets', 'cards');
const W = 1000;
const H = Math.round(W / 1.586);

const PHOTOS = {
  'star-dust': 'art002e012588.jpg',
  'deep-field': 'GSFC_20171208_Archive_e001651.jpg',
  saturn: 'PIA06193.jpg',
  'solar-system': 'PIA10969o.jpg',
  jupiter: 'PIA25013.jpg',
  'fern-forest': 'px1334146.jpg',
  'night-leaves': 'px17245665.jpg',
  bamboo: 'px7898337.jpg',
  foliage: 'px9660579.jpg',
  'night-bloom': 'px4032763.jpg',
};
/** Photos framed with a thin engraved double line (none at the moment). */
const FRAMED = new Set([]);

const frame = (color) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <rect x="22" y="22" width="${W - 44}" height="${H - 44}" rx="26" fill="none" stroke="${color}" stroke-opacity="0.55" stroke-width="2"/>
  <rect x="32" y="32" width="${W - 64}" height="${H - 64}" rx="20" fill="none" stroke="${color}" stroke-opacity="0.28" stroke-width="1"/>
</svg>`);

async function photos(dir) {
  for (const [id, file] of Object.entries(PHOTOS)) {
    const src = join(dir, file);
    if (!existsSync(src)) { console.warn(`skip ${id}: ${file} not found`); continue; }
    let img = sharp(src).resize(W, H, { fit: 'cover', position: 'centre' });
    if (FRAMED.has(id)) img = sharp(await img.png().toBuffer()).composite([{ input: frame('#D9CBA3'), left: 0, top: 0 }]);
    await img.webp({ quality: 84 }).toFile(join(out, `${id}.webp`));
    console.log(`wrote ${id}.webp`);
  }
}

const dir = process.argv[2];
if (!dir) { console.error('usage: node scripts/build-card-art.mjs <photos-dir>'); process.exit(1); }
await photos(dir);
