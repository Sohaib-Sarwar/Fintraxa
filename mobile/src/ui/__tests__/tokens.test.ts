/** WCAG AA contrast for every text/background pair the theme uses (plan §7.1 asks for this check). */
import glyphs from '@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/MaterialIcons.json';
import { KNOWN_MUI_ICONS, muiToGlyph } from '../categoryIcons';
import { ACCENT_KEYS, accentText, dark, light, withAccent, type Palette } from '../tokens';

function lum(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contrast = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };

describe.each([['dark', dark], ['light', light]] as [string, Palette][])('%s theme', (_name, p) => {
  const surfaces = { bg: p.bg, surface: p.surface, surface2: p.surface2 };
  test.each(Object.entries(surfaces))('body text (ink, ink2, muted) ≥ 4.5:1 on %s', (_s, bg) => {
    for (const fg of [p.ink, p.ink2, p.muted]) expect(contrast(fg, bg)).toBeGreaterThanOrEqual(4.5);
  });
  test.each(Object.entries(surfaces))('profit/loss and warning text ≥ 4.5:1 on %s', (_s, bg) => {
    for (const fg of [p.pos, p.neg, p.warn]) expect(contrast(fg, bg)).toBeGreaterThanOrEqual(4.5);
  });
  test('iris accent: as text on bg/surface/surface2 ≥ 4.5:1; text on accent buttons ≥ 4.5:1', () => {
    for (const bg of [p.bg, p.surface, p.surface2]) expect(contrast(accentText(p), bg)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(p.accentInk, p.accent)).toBeGreaterThanOrEqual(4.5);
  });
  test('hero card: text ≥ 4.5:1 on both gradient stops', () => {
    for (const stop of [p.heroFrom, p.heroTo]) expect(contrast(p.heroInk, stop)).toBeGreaterThanOrEqual(4.5);
  });
  test('muted text still ≥ 4.5:1 on the raised surface3 (chips, tiles)', () => {
    expect(contrast(p.muted, p.surface3)).toBeGreaterThanOrEqual(4.5);
  });
});

describe.each(ACCENT_KEYS.flatMap((k) => [[`${k} on dark`, withAccent(dark, k)], [`${k} on light`, withAccent(light, k)]]) as [string, Palette][])('accent %s', (_name, p) => {
  test('accent as text on bg/surface/surface2 ≥ 4.5:1', () => {
    for (const bg of [p.bg, p.surface, p.surface2]) expect(contrast(accentText(p), bg)).toBeGreaterThanOrEqual(4.5);
  });
  test('text on accent fills (buttons, chips) ≥ 4.5:1', () => {
    expect(contrast(p.accentInk, p.accent)).toBeGreaterThanOrEqual(4.5);
  });
  test('nav pill / hero: accent ≥ 3:1 against the dark nav, its ink ≥ 4.5:1 on it', () => {
    // A ringed accent (Black) is outlined by its ring, so the ring is what must stand out from the nav.
    expect(contrast(p.accentRing ? '#FFFFFF' : p.accentOnDark, p.nav)).toBeGreaterThanOrEqual(3);
    expect(contrast(p.accentOnDarkInk, p.accentOnDark)).toBeGreaterThanOrEqual(4.5);
  });
});

describe('category icons stored as MUI names', () => {
  test.each(KNOWN_MUI_ICONS.filter((n) => n !== 'Category').map((n) => [n]))('%s maps to its own Material glyph (not the fallback)', (name) => {
    const g = muiToGlyph(name);
    expect(g in glyphs).toBe(true);
    expect(g).not.toBe('category');
  });
  test('Category itself, unknown names and null use the generic glyph', () => {
    expect(muiToGlyph('Category')).toBe('category');
    expect(muiToGlyph('NoSuchIconAnywhere')).toBe('category');
    expect(muiToGlyph(null)).toBe('category');
  });
  test('MUI style suffixes are ignored', () => {
    expect(muiToGlyph('RestaurantRounded')).toBe('restaurant');
    expect(muiToGlyph('DirectionsCar')).toBe('directions-car');
  });
});
