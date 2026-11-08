/**
 * Passive Income leaf → public/passive-logo.png (transparent, trimmed, 256 px).
 *
 *   node scripts/build-passive-logo.mjs "<path>/logo-app-icon.png"
 *
 * The source is the leaf on a solid black square. Black is keyed out with a
 * soft ramp on brightness (no hard edge), colours are un-premultiplied so the
 * leaf's rim does not keep a dark fringe, then the image is trimmed to the leaf
 * and fitted into a square with a little breathing room. The leaf's own
 * colours are untouched.
 */
import sharp from 'sharp';

const src = process.argv[2];
if (!src) { console.error('usage: node scripts/build-passive-logo.mjs <logo-app-icon.png>'); process.exit(1); }

const { data, info } = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const LOW = 18; const HIGH = 70; // brightness below LOW → transparent, above HIGH → opaque
for (let i = 0; i < data.length; i += 4) {
  const max = Math.max(data[i], data[i + 1], data[i + 2]);
  const a = Math.min(1, Math.max(0, (max - LOW) / (HIGH - LOW))) * (data[i + 3] / 255);
  if (a > 0 && a < 1) { // un-premultiply against black so edges keep the leaf's colour
    data[i] = Math.min(255, Math.round(data[i] / a));
    data[i + 1] = Math.min(255, Math.round(data[i + 1] / a));
    data[i + 2] = Math.min(255, Math.round(data[i + 2] / a));
  }
  data[i + 3] = Math.round(a * 255);
}

const keyed = await sharp(data, { raw: info }).png().toBuffer();
const trimmed = await sharp(keyed).trim({ threshold: 1 }).toBuffer();
await sharp(trimmed)
  .resize(232, 232, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .extend({ top: 12, bottom: 12, left: 12, right: 12, background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png({ compressionLevel: 9, palette: true, quality: 92, effort: 10 })
  .toFile('public/passive-logo.png');
const m = await sharp('public/passive-logo.png').metadata();
console.log(`public/passive-logo.png ${m.width}x${m.height} alpha=${m.hasAlpha}`);
