/** WCAG AA contrast for every text/background pair the theme uses (plan §7.1 asks for this check). */
import glyphs from '@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/MaterialIcons.json';
import { KNOWN_MUI_ICONS, muiToGlyph } from '../categoryIcons';
import { accentText, dark, light, type Palette } from '../tokens';

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
  test('gold accent: text on surfaces ≥ 4.5:1; dark ink on gold buttons ≥ 4.5:1', () => {
    expect(contrast(accentText(p), p.surface)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(p.accentInk, p.accent)).toBeGreaterThanOrEqual(4.5);
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
