// Builds the mobile app's icons and splash from the brand mark: node scripts/build-mobile-icons.mjs public/brand/mark.png mobile/assets
import sharp from 'sharp';
const [src, out] = process.argv.slice(2);
const meta = await sharp(src).metadata();
console.log('source', meta.width, meta.height, meta.channels, meta.hasAlpha);
const trimmed = await sharp(src).trim().png().toBuffer();
const fit = (size) => sharp(trimmed).resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
const canvas = (size, bg) => sharp({ create: { width: size, height: size, channels: 4, background: bg } });
const black = { r: 0, g: 0, b: 0, alpha: 1 }; const clear = { r: 0, g: 0, b: 0, alpha: 0 };
// Launcher icon (legacy/iOS): mark at 56% on true black.
await canvas(1024, black).composite([{ input: await fit(570), gravity: 'center' }]).png().toFile(`${out}/icon.png`);
// Adaptive foreground: content must sit inside the 66% safe zone of 108dp → mark ~ 50%.
await canvas(1024, clear).composite([{ input: await fit(500), gravity: 'center' }]).png().toFile(`${out}/android-icon-foreground.png`);
await canvas(1024, black).png().toFile(`${out}/android-icon-background.png`);
// Monochrome (Android 13 themed icons): the mark's alpha as a white silhouette.
const mono = await sharp(await fit(500)).ensureAlpha().extractChannel('alpha').toBuffer();
const white = await sharp({ create: { width: 500, height: 500, channels: 3, background: { r: 255, g: 255, b: 255 } } }).joinChannel(mono).png().toBuffer();
await canvas(1024, clear).composite([{ input: white, gravity: 'center' }]).png().toFile(`${out}/android-icon-monochrome.png`);
// Splash image (drawn on black by expo-splash-screen) and web favicon.
await canvas(600, clear).composite([{ input: await fit(560), gravity: 'center' }]).png().toFile(`${out}/splash-icon.png`);
await canvas(64, black).composite([{ input: await fit(44), gravity: 'center' }]).png().toFile(`${out}/favicon.png`);
// Small mark for in-app use (welcome / lock screens).
await sharp(await fit(256)).png().toFile(`${out}/mark.png`);
console.log('done');
