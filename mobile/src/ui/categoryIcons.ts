/**
 * `categories.icon` stores MUI icon NAMES chosen on the web ('Restaurant', 'DirectionsCar', …) — changing
 * them would orphan saved categories (CONTEXT.md gotcha 12). The phone draws the same glyphs from Material
 * Icons: PascalCase → kebab-case, minus MUI's style suffixes. src/ui/__tests__/categoryIcons.test.ts checks
 * every name in use (DB + web picker) maps to a real glyph; anything unknown falls back to `category`.
 */
import glyphs from '@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/MaterialIcons.json';

export const KNOWN_MUI_ICONS = [
  // in use in the database (select distinct icon from categories, 2026-11-13)
  'AccountBalance', 'TrendingUp', 'CardGiftcard', 'School', 'Restaurant', 'Work', 'MoreHoriz', 'Business', 'LocalHospital',
  'ShoppingBag', 'AttachMoney', 'Receipt', 'Home', 'ShowChart', 'Computer', 'Shield', 'SportsEsports', 'ShoppingCart', 'Savings',
  'DirectionsCar', 'CreditCard', 'VolunteerActivism', 'Redeem', 'Payments', 'ChildCare',
  // the web's picker (src/lib/categoryIcons.jsx)
  'LocalGroceryStore', 'Movie', 'Category', 'ArrowDownward', 'ArrowUpward',
] as const;

export type GlyphName = keyof typeof glyphs;

export function muiToGlyph(name: string | null | undefined): GlyphName {
  if (!name) return 'category';
  const base = name.replace(/(Rounded|Outlined|Sharp|TwoTone|Icon)$/, '');
  const kebab = base.replace(/([a-z0-9])([A-Z])/g, '$1-$2').replace(/([A-Z])([A-Z][a-z])/g, '$1-$2').toLowerCase();
  if (kebab in glyphs) return kebab as GlyphName;
  const snake = kebab.replace(/-/g, '_');
  return (snake in glyphs ? snake : 'category') as GlyphName;
}
