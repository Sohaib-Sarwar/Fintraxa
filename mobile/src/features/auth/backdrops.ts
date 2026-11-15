/**
 * Sign-in wallpapers (owner, 2026-11-15: "mobile-size nature, stars, beaches, night, planet wallpapers"): portrait
 * photos cut to the Galaxy S24 Ultra's 1080 × 2340 screen (`assets/wallpapers/`; Pexels / NASA / Unsplash — credits
 * in assets/wallpapers/CREDITS.md). One is picked at random per visit, never the same twice in a row.
 */
export const WALLPAPERS = [
  require('../../../assets/wallpapers/milky-way.webp'),
  require('../../../assets/wallpapers/aurora.webp'),
  require('../../../assets/wallpapers/moon-sea.webp'),
  require('../../../assets/wallpapers/palm-beach.webp'),
  require('../../../assets/wallpapers/palm-sunset.webp'),
  require('../../../assets/wallpapers/tropical-sunset.webp'),
  require('../../../assets/wallpapers/misty-forest.webp'),
  require('../../../assets/wallpapers/deep-field.webp'),
  require('../../../assets/wallpapers/planet.webp'),
] as number[];

let last = -1;
export function pickBackdrop(): number {
  let i = Math.floor(Math.random() * WALLPAPERS.length);
  if (WALLPAPERS.length > 1 && i === last) i = (i + 1) % WALLPAPERS.length;
  last = i;
  return WALLPAPERS[i];
}
