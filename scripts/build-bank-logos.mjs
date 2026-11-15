#!/usr/bin/env node
/**
 * Bank logos for savings accounts (owner, 2026-11-15): the owner's source images → 256 px square WebP, written to
 * public/bank-logos/ (web) and mobile/assets/bank-logos/ (bundled in the app). They take priority over the stock-logo
 * set for banks only, so UBL as a bank shows UBL Ameen while the UBL share keeps its own logo.
 *
 *   node scripts/build-bank-logos.mjs <folder with the source images>
 */
import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = process.argv[2];
if (!src) { console.error('usage: node scripts/build-bank-logos.mjs <source folder>'); process.exit(1); }

// symbol → source file, how to fit it in the square, and the square's background.
const LOGOS = [
  { symbol: 'UBL', file: 'UBL Ameen Bank Logo.jpg', fit: 'cover', bg: '#0E7276' },
  { symbol: 'MCBIB', file: 'MCB Islamic Bank.jpg', fit: 'contain', bg: '#FFFFFF', pad: 18 },
  { symbol: 'RAQAMI', file: 'Raqami Bank Logo.webp', fit: 'contain', bg: '#FFFFFF', pad: 44 },
];

const outs = [join(root, 'public/bank-logos'), join(root, 'mobile/assets/bank-logos')];
outs.forEach((d) => mkdirSync(d, { recursive: true }));

for (const l of LOGOS) {
  const inner = 256 - 2 * (l.pad ?? 0);
  const img = await sharp(join(src, l.file)).resize(inner, inner, { fit: l.fit, background: l.bg }).flatten({ background: l.bg }).toBuffer();
  const square = await sharp({ create: { width: 256, height: 256, channels: 3, background: l.bg } })
    .composite([{ input: img, gravity: 'center' }]).webp({ quality: 88 }).toBuffer();
  for (const d of outs) await sharp(square).toFile(join(d, `${l.symbol}.webp`));
  console.log(`${l.symbol}.webp`, Math.round(square.length / 1024), 'KB');
}
