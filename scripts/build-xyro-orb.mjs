/**
 * Xyro's orb → public/xyro-orb.webp (transparent, 192 px).
 *
 *   node scripts/build-xyro-orb.mjs "<path>/chatbot UI logo.jpg"
 *
 * The source is the orb on a pale blue-grey backdrop. A square around the orb
 * is cut out, the backdrop is keyed out by colour distance (sampled from the
 * corners, soft ramp, so the glass rim stays translucent rather than cut), and
 * a soft circular mask removes the floor shadow.
 */
import sharp from 'sharp';

const src = process.argv[2];
if (!src) { console.error('usage: node scripts/build-xyro-orb.mjs <chatbot UI logo.jpg>'); process.exit(1); }

const CX = 410; const CY = 266; const R = 158; // orb centre and radius in the 800×600 source
const box = { left: CX - R, top: CY - R, width: 2 * R, height: 2 * R };
const { data, info } = await sharp(src).extract(box).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const W = info.width;
const px = (x, y) => { const i = (y * W + x) * 4; return [data[i], data[i + 1], data[i + 2]]; };
const corners = [px(2, 2), px(W - 3, 2), px(2, W - 3), px(W - 3, W - 3)];
const bg = [0, 1, 2].map((c) => corners.reduce((s, p) => s + p[c], 0) / corners.length);
const LOW = 10; const HIGH = 46;
for (let y = 0; y < W; y += 1) {
  for (let x = 0; x < W; x += 1) {
    const i = (y * W + x) * 4;
    const dist = Math.hypot(data[i] - bg[0], data[i + 1] - bg[1], data[i + 2] - bg[2]);
    let a = Math.min(1, Math.max(0, (dist - LOW) / (HIGH - LOW)));
    const r = Math.hypot(x - R, y - R);
    if (a > 0 && a < 1) { // un-mix the backdrop so translucent glass keeps its own colour on any theme
      for (let c = 0; c < 3; c += 1) data[i + c] = Math.min(255, Math.max(0, Math.round((data[i + c] - (1 - a) * bg[c]) / a)));
    }
    a *= Math.min(1, Math.max(0, (R - 8 - r) / 5)); // soft circular edge, inside the outer halo
    data[i + 3] = Math.round(a * 255);
  }
}
await sharp(data, { raw: info })
  .resize(192, 192)
  .webp({ quality: 90, alphaQuality: 100, effort: 6 })
  .toFile('public/xyro-orb.webp');
const m = await sharp('public/xyro-orb.webp').metadata();
console.log(`public/xyro-orb.webp ${m.width}x${m.height} alpha=${m.hasAlpha}`);
