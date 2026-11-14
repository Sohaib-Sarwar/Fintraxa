/**
 * "Lime Glass" theme — follows the owner's STRICT THEME INSPIRATION reference (2026-11-14): near-black with a
 * faint green glow, grey glass cards, one lime highlight (primary action, active tab, selected bar, toggles),
 * round grey icon buttons, a floating capsule nav. Profit stays a distinct mint green and is always paired
 * with ▲/▼ so gains never rely on colour alone (lime is the brand, not a profit signal).
 * Contrast of every text pair is checked by src/ui/__tests__/tokens.test.ts (WCAG AA).
 */
export type Palette = {
  mode: 'dark' | 'light';
  bg: string; glow: string; surface: string; surface2: string; surface3: string;
  hairline: string; border: string; borderStrong: string; scrim: string;
  ink: string; ink2: string; muted: string;
  pos: string; posSoft: string; neg: string; negSoft: string;
  warn: string; warnSoft: string;
  /** Lime: primary action, current selection, links. */
  accent: string; accentInk: string; accentSoft: string; accentDeep: string;
  /** Second data series (charts). */
  secondary: string;
  /** Glass hero card: two-stop gradient, text on it, rim. */
  heroFrom: string; heroTo: string; heroInk: string; heroInk2: string; heroBorder: string;
  chartLine: string; chartRef: string; barTop: string; barBottom: string;
  nav: string; navItem: string;
  /** Accent on always-dark surfaces (the nav capsule, the hero card) and the text on it. Differs from
   * `accent` only for Mono in light mode, where the accent itself is near-black. */
  accentOnDark: string; accentOnDarkInk: string;
  /** Black accent: fills are black, so they carry this ring to stay visible; accent text/icons use the ink (white). */
  accentRing: string | null;
  /** Which accent preset this palette was built with. */
  accentKey: AccentKey;
};

export const dark: Palette = {
  mode: 'dark',
  // Pitch black, no glow (owner, 2026-11-14).
  bg: '#000000', glow: 'transparent',
  surface: '#191C1A', surface2: '#232724', surface3: '#2E332F',
  hairline: '#222623', border: 'rgba(255,255,255,0.07)', borderStrong: 'rgba(255,255,255,0.13)', scrim: 'rgba(5,7,6,0.72)',
  ink: '#F3F5F1', ink2: '#B4BAB2', muted: '#9AA198',
  pos: '#6EE7A4', posSoft: 'rgba(110,231,164,0.13)', neg: '#FF7B72', negSoft: 'rgba(255,123,114,0.13)',
  warn: '#F5B84A', warnSoft: 'rgba(245,184,74,0.13)',
  accent: '#C6F16D', accentInk: '#121707', accentSoft: 'rgba(198,241,109,0.14)', accentDeep: '#6F9423',
  secondary: '#8FB8FF',
  heroFrom: '#2B302C', heroTo: '#1A1D1B', heroInk: '#F3F5F1', heroInk2: '#AEB4AC', heroBorder: 'rgba(255,255,255,0.08)',
  chartLine: '#C6F16D', chartRef: '#4B514C', barTop: '#9FA49F', barBottom: '#2B2F2C',
  // Solid (owner: a see-through bar 'destroys its worth'): content never shows through the nav.
  nav: '#1E211F', navItem: '#343935',
  accentOnDark: '#C6F16D', accentOnDarkInk: '#121707', accentRing: null, accentKey: 'lime',
};

export const light: Palette = {
  mode: 'light',
  bg: '#F2F4EF', glow: 'rgba(146,190,64,0.18)',
  surface: '#FFFFFF', surface2: '#ECEFE8', surface3: '#E1E5DC',
  hairline: '#E8EBE4', border: 'rgba(16,20,12,0.09)', borderStrong: 'rgba(16,20,12,0.15)', scrim: 'rgba(12,16,10,0.35)',
  ink: '#121510', ink2: '#3E453B', muted: '#5D6559',
  pos: '#0B7A45', posSoft: '#E2F3E8', neg: '#C42F2F', negSoft: '#FBE9E9',
  warn: '#94590A', warnSoft: '#FBF1DD',
  // Lime fills keep dark text; lime as text on white uses the deep olive.
  accent: '#BDEB5A', accentInk: '#121707', accentSoft: '#EEF8D9', accentDeep: '#4E6B12',
  secondary: '#2F5FB3',
  heroFrom: '#1F2420', heroTo: '#121512', heroInk: '#F3F5F1', heroInk2: '#B8BEB5', heroBorder: 'rgba(255,255,255,0.10)',
  chartLine: '#4E6B12', chartRef: '#B9BFB4', barTop: '#C9CEC5', barBottom: '#E9ECE5',
  nav: '#1E211F', navItem: '#343935',
  accentOnDark: '#C6F16D', accentOnDarkInk: '#121707', accentRing: null, accentKey: 'lime',
};

/**
 * Accent presets (owner, 2026-11-14: "a universal theme selector"). The accent drives the primary button,
 * the nav's active pill and "+", selections, toggles and the charts; profit/loss colours never change.
 * `fill` is the button colour (both modes unless `lightFill`), `ink` the text on it, `deep` the accent as
 * text/icons on light surfaces. Every preset is contrast-checked in src/ui/__tests__/tokens.test.ts.
 */
export type AccentKey = 'lime' | 'moss' | 'emerald' | 'sage' | 'jade' | 'teal' | 'mist' | 'glacier' | 'sky' | 'blue' | 'indigo' | 'violet' | 'lavender'
  | 'pink' | 'rose' | 'red' | 'coral' | 'orange' | 'amber' | 'gold' | 'champagne' | 'silver' | 'platinum' | 'titanium' | 'rosegold' | 'bronze' | 'mono' | 'black' | 'custom';
/** The fixed presets (everything but the user's own colour). */
export type AccentPreset = Exclude<AccentKey, 'custom'>;
type Accent = { name: string; fill: string; ink: string; deep: string; lightFill?: string; lightInk?: string };
export const ACCENTS: Record<AccentPreset, Accent> = {
  lime: { name: 'Lime', fill: '#C6F16D', ink: '#121707', deep: '#4E6B12', lightFill: '#BDEB5A' },
  // Card-matched (sampled from the card photos, lifted to accent brightness).
  moss: { name: 'Moss', fill: '#B9C96E', ink: '#1A1F06', deep: '#55640F' },
  emerald: { name: 'Emerald', fill: '#4ADE80', ink: '#052E14', deep: '#166534' },
  sage: { name: 'Sage', fill: '#8FCFA5', ink: '#06281A', deep: '#1F6B45' },
  jade: { name: 'Jade', fill: '#5CD6AE', ink: '#052A20', deep: '#0F6B52' },
  teal: { name: 'Teal', fill: '#5EE0C8', ink: '#03201A', deep: '#0B6E5F' },
  mist: { name: 'Mist', fill: '#9ACBD2', ink: '#0A2226', deep: '#2B6870' },
  glacier: { name: 'Glacier', fill: '#8CC8E6', ink: '#0A2230', deep: '#2A6585' },
  sky: { name: 'Sky', fill: '#38BDF8', ink: '#04263A', deep: '#0369A1' },
  blue: { name: 'Blue', fill: '#6EA8FF', ink: '#06142B', deep: '#1F56B8' },
  indigo: { name: 'Indigo', fill: '#818CF8', ink: '#10123A', deep: '#4338CA' },
  violet: { name: 'Violet', fill: '#B9A2FF', ink: '#160A33', deep: '#5B3FC4' },
  lavender: { name: 'Lavender', fill: '#D8B4FE', ink: '#2A0F45', deep: '#7E22CE' },
  pink: { name: 'Pink', fill: '#FF8FC7', ink: '#2B0718', deep: '#B0246A' },
  rose: { name: 'Rose', fill: '#FB7185', ink: '#3A0812', deep: '#BE123C' },
  red: { name: 'Red', fill: '#FF6B6B', ink: '#1F0606', deep: '#B42318' },
  coral: { name: 'Coral', fill: '#FF8A65', ink: '#2B0E05', deep: '#B93A0C' },
  orange: { name: 'Orange', fill: '#FFA94D', ink: '#2A1300', deep: '#A04A00' },
  amber: { name: 'Amber', fill: '#FBBF24', ink: '#2A1C00', deep: '#92400E' },
  gold: { name: 'Gold', fill: '#F5C542', ink: '#241A00', deep: '#835C00' },
  champagne: { name: 'Champagne', fill: '#EACFA6', ink: '#2A1E0C', deep: '#85561C' },
  silver: { name: 'Silver', fill: '#CBD5E1', ink: '#0F172A', deep: '#334155' },
  // Metallic finishes (owner, 2026-11-15: "metallic accent colours").
  platinum: { name: 'Platinum', fill: '#E3E4E6', ink: '#16171A', deep: '#4A4D52' },
  titanium: { name: 'Titanium', fill: '#B9BAB4', ink: '#151613', deep: '#4F514B' },
  rosegold: { name: 'Rose Gold', fill: '#E7B3A1', ink: '#2A1510', deep: '#8A4B3A' },
  bronze: { name: 'Bronze', fill: '#D2A06C', ink: '#24170A', deep: '#7A5126' },
  // White on dark; on the light theme a white button would vanish, so Mono turns ink-black there.
  mono: { name: 'White', fill: '#F4F5F2', ink: '#111312', deep: '#1A1D1B', lightFill: '#1A1D1B', lightInk: '#FFFFFF' },
  // Black with white contrast (owner, 2026-11-15): graphite-black fills with white text and icons on them.
  black: { name: 'Black', fill: '#1B1C1F', ink: '#FFFFFF', deep: '#1B1C1F' },
};
export const ACCENT_KEYS = Object.keys(ACCENTS) as AccentPreset[];

const luminance = (hex: string) => rgb(hex).map((c) => c / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  .reduce((s, c, i) => s + c * [0.2126, 0.7152, 0.0722][i], 0);
export const isHex = (v: string) => /^#[0-9a-fA-F]{6}$/.test(v);

/** The user's own accent (owner: "custom colour"): text on it is black or white by brightness; a deeper shade for light-theme text. */
export function customAccent(hex: string): Accent {
  const fill = isHex(hex) ? hex.toUpperCase() : '#7C9CFF';
  return { name: 'Custom', fill, ink: luminance(fill) > 0.42 ? '#111311' : '#FFFFFF', deep: mix(fill, '#000000', 0.55) };
}
export const accentOf = (key: AccentKey, custom?: string | null): Accent => (key === 'custom' ? customAccent(custom ?? '') : ACCENTS[key] ?? ACCENTS.lime);

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
/** `#RRGGBB` → `rgba(r,g,b,a)`. */
export const alpha = (hex: string, a: number) => `rgba(${rgb(hex).join(',')},${a})`;
/** Mix `hex` into `base` (0 = base, 1 = hex), as an opaque hex colour. */
const mix = (hex: string, base: string, k: number) => {
  const [a, b] = [rgb(hex), rgb(base)];
  return `#${a.map((v, i) => Math.round(b[i] + (v - b[i]) * k).toString(16).padStart(2, '0')).join('')}`.toUpperCase();
};

/** The dark or light palette re-tinted with an accent preset. */
export function withAccent(base: Palette, key: AccentKey, custom?: string | null): Palette {
  const a = accentOf(key, custom);
  if (base.mode === 'dark') {
    return {
      ...base, accentKey: key,
      accent: a.fill, accentInk: a.ink, accentSoft: key === 'black' ? 'rgba(255,255,255,0.10)' : alpha(a.fill, 0.14), accentDeep: a.deep,
      // Black: selections and the chart line read in white, the contrast colour.
      glow: 'transparent', chartLine: key === 'black' ? '#FFFFFF' : a.fill,
      accentOnDark: a.fill, accentOnDarkInk: a.ink, accentRing: key === 'black' ? 'rgba(255,255,255,0.85)' : null,
    };
  }
  const fill = a.lightFill ?? a.fill;
  return {
    ...base, accentKey: key,
    accent: fill, accentInk: a.lightInk ?? a.ink, accentSoft: mix(fill, '#FFFFFF', key === 'mono' ? 0.08 : 0.18), accentDeep: a.deep,
    glow: alpha(key === 'mono' ? '#9AA198' : a.fill, 0.18), chartLine: a.deep,
    accentOnDark: a.fill, accentOnDarkInk: a.ink, accentRing: key === 'black' ? 'rgba(255,255,255,0.85)' : null,
  };
}

/** The accent as text or an icon on the theme's surfaces (its deep shade on light, for contrast). */
export const accentText = (p: Palette) => (p.mode === 'dark' ? (p.accentRing ? p.accentInk : p.accent) : p.accentDeep);
/** The accent as text or an icon on always-dark surfaces (glass, cards): white for the Black accent. */
export const accentOnDarkText = (p: Palette) => (p.accentRing ? p.accentOnDarkInk : p.accentOnDark);

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28, xxxl: 40 } as const;
export const radius = { chip: 12, input: 16, card: 24, sheet: 32, pill: 999 } as const;
export const SCREEN_PAD = 20;
export const TOUCH = 48;
/** Height of the floating nav including its bottom margin, so content can clear it. */
export const NAV_CLEARANCE = 116;

export const font = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
  // Numbers in Inter Tight, the web's FONT_NUM (owner, 2026-11-14: "use the web version number font").
  num: 'InterTight_600SemiBold',
  numMedium: 'InterTight_500Medium',
  numBold: 'InterTight_700Bold',
  numHeavy: 'InterTight_800ExtraBold',
} as const;

/** Type scale (plan §7.2), sp. */
export const type = {
  hero: { fontFamily: font.numBold, fontSize: 38, lineHeight: 44, letterSpacing: -0.8 },
  display: { fontFamily: font.numBold, fontSize: 30, lineHeight: 36, letterSpacing: -0.6 },
  title: { fontFamily: font.bold, fontSize: 24, lineHeight: 30, letterSpacing: -0.3 },
  headline: { fontFamily: font.semibold, fontSize: 18, lineHeight: 24, letterSpacing: -0.1 },
  body: { fontFamily: font.regular, fontSize: 15, lineHeight: 22 },
  bodyStrong: { fontFamily: font.semibold, fontSize: 15, lineHeight: 22 },
  label: { fontFamily: font.medium, fontSize: 13, lineHeight: 18 },
  caption: { fontFamily: font.regular, fontSize: 12, lineHeight: 16 },
  num: { fontFamily: font.num, fontSize: 15, lineHeight: 20, fontVariant: ['tabular-nums'] as const },
  numLarge: { fontFamily: font.num, fontSize: 19, lineHeight: 25, fontVariant: ['tabular-nums'] as const, letterSpacing: -0.2 },
} as const;
