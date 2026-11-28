/**
 * Builds the widget-picker previews in assets/widget/ (owner, 2026-11-28): the Monstera card art (the owner's choice
 * for the picker), cropped to the widget's shape with rounded corners, and the widget's text in its own fonts and
 * sizes (src/features/widget/layout.ts). The figures are illustrative.
 *
 *   node scripts/build-widget-preview.mjs
 *
 * Needs `sharp` (the web app's devDependency): run from the repo with ../node_modules available.
 */
import { Buffer } from 'node:buffer';
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(here, '..', '..', 'package.json'));
const sharp = require('sharp');
const root = join(here, '..');
const out = join(root, 'assets', 'widget');
mkdirSync(out, { recursive: true });

const FONT = (p) => join(root, 'node_modules', '@expo-google-fonts', p);
const MEDIUM = FONT('inter/500Medium/Inter_500Medium.ttf');
const SEMI = FONT('inter-tight/600SemiBold/InterTight_600SemiBold.ttf');
const HEAVY = FONT('inter-tight/800ExtraBold/InterTight_800ExtraBold.ttf');
const S = 2; // px per dp

async function text(str, fontfile, family, sizeDp, color) {
  const buf = await sharp({ text: { text: `<span foreground="${color}">${str}</span>`, font: `${family} ${sizeDp * S}px`, fontfile, rgba: true, dpi: 72 } }).png().toBuffer();
  const m = await sharp(buf).metadata();
  return { input: buf, w: m.width, h: m.height };
}

async function build(name, wDp, hDp, small) {
  const W = wDp * S; const H = hDp * S; const R = 24 * S; const pad = 16 * S;
  const art = await sharp(join(root, 'assets', 'cards', 'monstera.webp')).resize(W, H, { fit: 'cover' }).toBuffer();
  const scrim = Buffer.from(`<svg width="${W}" height="${H}"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0.35"/><stop offset="1" stop-color="#000" stop-opacity="0.62"/></linearGradient></defs><rect width="${W}" height="${H}" fill="url(#g)"/></svg>`);
  const mask = Buffer.from(`<svg width="${W}" height="${H}"><rect width="${W}" height="${H}" rx="${R}" ry="${R}"/></svg>`);
  const INK = '#F5F5F3'; const INK2 = '#C8C8C6';
  const layers = [{ input: scrim, left: 0, top: 0 }];
  const label = await text('Earned today', MEDIUM, 'Inter', small ? 13 : 15, '#EDEDEB');
  layers.push({ input: label.input, left: pad, top: pad });
  const mark = await sharp(join(root, 'assets', 'mark.png')).resize(26 * S, 26 * S).toBuffer();
  layers.push({ input: mark, left: W - pad - 26 * S, top: pad - 4 * S });
  const big = await text('1,284.62', HEAVY, 'Inter Tight', small ? 30 : 50, INK);
  const pkr = await text('PKR', MEDIUM, 'Inter', small ? 10 : 15, INK2);
  const bigTop = small ? Math.round(H * 0.33) : Math.round(H * 0.27);
  layers.push({ input: big.input, left: pad, top: bigTop });
  layers.push({ input: pkr.input, left: pad + big.w + 3 * S, top: bigTop + big.h - pkr.h - 5 * S });
  const holders = small ? [['This month', 'Rs 37,980']] : [['This month', 'Rs 37,980'], ['Yesterday', 'Rs 1,356.40'], ['Overnight', 'Rs 452.18']];
  const colW = (W - 2 * pad) / holders.length;
  const cells = await Promise.all(holders.map(async ([a, b]) => [await text(a, MEDIUM, 'Inter', small ? 11.5 : 12.5, INK2), await text(b, SEMI, 'Inter Tight', small ? 16 : 18, INK)]));
  const lh = Math.max(...cells.map(([l]) => l.h)); const vh = Math.max(...cells.map(([, v]) => v.h));
  cells.forEach(([l, v], i) => {
    const x = Math.round(pad + i * colW + (i ? 10 * S : 0));
    layers.push({ input: l.input, left: x, top: H - pad - vh - lh - 2 * S });
    layers.push({ input: v.input, left: x, top: H - pad - vh });
    if (i) layers.push({ input: { create: { width: 1 * S, height: vh + lh, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 0.22 } } }, left: Math.round(pad + i * colW), top: H - pad - vh - lh });
  });
  await sharp(art).composite([...layers, { input: mask, blend: 'dest-in' }]).png({ compressionLevel: 9 }).toFile(join(out, `${name}.png`));
  console.log(`${name}.png ${W}×${H}`);
}

await build('preview-wide', 340, 170, false);
await build('preview-small', 170, 170, true);
