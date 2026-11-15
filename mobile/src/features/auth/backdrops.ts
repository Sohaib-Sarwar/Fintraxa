/**
 * Lock-screen and sign-in wallpapers (owner, 2026-11-15): portrait photos cut to the Galaxy S24 Ultra's 1080 × 2340
 * screen (`assets/wallpapers/`; Pexels / NASA / Unsplash — credits in assets/wallpapers/CREDITS.md). Long-press the
 * lock screen or the sign-in landing to choose one (WallpaperPicker); "Shuffle" (null) picks a different one per visit.
 */
import { useState } from 'react';
import { useApp } from '@/lib/store';

export type Wallpaper = { id: string; name: string; source: number };

export const WALLPAPERS: Wallpaper[] = [
  { id: 'mountain-lake', name: 'Mountain lake', source: require('../../../assets/wallpapers/mountain-lake.webp') },
  { id: 'golden-peak', name: 'Golden peak', source: require('../../../assets/wallpapers/golden-peak.webp') },
  { id: 'alpenglow', name: 'Alpenglow', source: require('../../../assets/wallpapers/alpenglow.webp') },
  { id: 'misty-pines', name: 'Misty pines', source: require('../../../assets/wallpapers/misty-pines.webp') },
  { id: 'turquoise-lake', name: 'Turquoise lake', source: require('../../../assets/wallpapers/turquoise-lake.webp') },
  { id: 'jungle-falls', name: 'Jungle falls', source: require('../../../assets/wallpapers/jungle-falls.webp') },
  { id: 'pink-summit', name: 'Pink summit', source: require('../../../assets/wallpapers/pink-summit.webp') },
  { id: 'green-hills', name: 'Green hills', source: require('../../../assets/wallpapers/green-hills.webp') },
  { id: 'autumn-lake', name: 'Autumn lake', source: require('../../../assets/wallpapers/autumn-lake.webp') },
  { id: 'forest-falls', name: 'Forest falls', source: require('../../../assets/wallpapers/forest-falls.webp') },
  { id: 'snow-peak', name: 'Snow peak', source: require('../../../assets/wallpapers/snow-peak.webp') },
  { id: 'mist-falls', name: 'Mist falls', source: require('../../../assets/wallpapers/mist-falls.webp') },
  { id: 'misty-forest', name: 'Misty forest', source: require('../../../assets/wallpapers/misty-forest.webp') },
  { id: 'milky-way', name: 'Milky Way', source: require('../../../assets/wallpapers/milky-way.webp') },
  { id: 'aurora', name: 'Aurora', source: require('../../../assets/wallpapers/aurora.webp') },
  { id: 'moon-sea', name: 'Moonlit sea', source: require('../../../assets/wallpapers/moon-sea.webp') },
  { id: 'palm-beach', name: 'Palm beach', source: require('../../../assets/wallpapers/palm-beach.webp') },
  { id: 'palm-sunset', name: 'Palm sunset', source: require('../../../assets/wallpapers/palm-sunset.webp') },
  { id: 'tropical-sunset', name: 'Tropical sunset', source: require('../../../assets/wallpapers/tropical-sunset.webp') },
  { id: 'deep-field', name: 'Deep field', source: require('../../../assets/wallpapers/deep-field.webp') },
  { id: 'planet', name: 'Earth', source: require('../../../assets/wallpapers/planet.webp') },
];

let last = -1;
/** A random wallpaper, never the same twice in a row. */
export function pickBackdrop(): Wallpaper {
  let i = Math.floor(Math.random() * WALLPAPERS.length);
  if (WALLPAPERS.length > 1 && i === last) i = (i + 1) % WALLPAPERS.length;
  last = i;
  return WALLPAPERS[i];
}

/** The wallpaper to show: the chosen one, or (Shuffle) one picked once per visit of the screen. */
export function useWallpaper(): Wallpaper {
  const chosen = useApp((s) => s.wallpaper);
  const [random] = useState(pickBackdrop);
  return WALLPAPERS.find((w) => w.id === chosen) ?? random;
}
