/**
 * "Ink, Paper, Gold" (plan §7). Monochrome surfaces; green/red only for profit and loss; one gold accent
 * for the primary action and focus. Contrast of every text/background pair is checked by
 * src/ui/__tests__/tokens.test.ts (WCAG AA: 4.5:1 body text, 3:1 large text and UI parts).
 */
export type Palette = {
  mode: 'dark' | 'light';
  bg: string; surface: string; surface2: string; surface3: string;
  hairline: string; border: string; scrim: string;
  ink: string; ink2: string; muted: string;
  pos: string; posSoft: string; neg: string; negSoft: string;
  warn: string; warnSoft: string;
  accent: string; accentInk: string; accentSoft: string;
  /** Lines in charts: value line and the invested/cost reference. */
  chartLine: string; chartRef: string;
};

export const dark: Palette = {
  mode: 'dark',
  bg: '#000000', surface: '#0C0C0D', surface2: '#151517', surface3: '#1E1E21',
  hairline: '#1A1A1D', border: 'rgba(255,255,255,0.08)', scrim: 'rgba(0,0,0,0.6)',
  // muted lifted from the web's #7C7C84 so it passes 4.5:1 on surface2 as well (plan §7.1 asks to check).
  ink: '#F5F5F7', ink2: '#A8A8AE', muted: '#8A8A92',
  pos: '#3CCF8E', posSoft: 'rgba(60,207,142,0.12)', neg: '#FF7A70', negSoft: 'rgba(255,122,112,0.12)',
  warn: '#F0B44C', warnSoft: 'rgba(240,180,76,0.12)',
  accent: '#C9A27E', accentInk: '#14100C', accentSoft: 'rgba(201,162,126,0.14)',
  chartLine: '#F5F5F7', chartRef: '#5A5A61',
};

export const light: Palette = {
  mode: 'light',
  bg: '#F4F5F6', surface: '#FFFFFF', surface2: '#F6F7F8', surface3: '#ECEEF1',
  hairline: '#EEF0F2', border: 'rgba(10,12,16,0.08)', scrim: 'rgba(10,12,16,0.35)',
  // muted darkened from the web's #80858D, which is only 3.5:1 on surface2.
  ink: '#0B0C0E', ink2: '#4B5058', muted: '#676C74',
  pos: '#137148', posSoft: '#E6F2EB', neg: '#C4302B', negSoft: '#FCEBEA',
  warn: '#8F5D00', warnSoft: '#FBF1DB',
  // Gold fills keep dark text in both themes; gold as text/icon on white uses the darker accentText.
  accent: '#C9A27E', accentInk: '#14100C', accentSoft: 'rgba(169,130,94,0.14)',
  chartLine: '#0B0C0E', chartRef: '#B4B8BF',
};

/** Gold used as text or an icon on the theme's surfaces (darker on white for contrast). */
export const accentText = (p: Palette) => (p.mode === 'dark' ? '#C9A27E' : '#8A6640');

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28, xxxl: 40 } as const;
export const radius = { chip: 12, input: 16, card: 24, sheet: 32, pill: 999 } as const;
export const SCREEN_PAD = 20;
export const TOUCH = 48;

export const font = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
  num: 'InterTight_600SemiBold',
  numMedium: 'InterTight_500Medium',
  numBold: 'InterTight_700Bold',
} as const;

/** Type scale (plan §7.2), sp. */
export const type = {
  hero: { fontFamily: font.numBold, fontSize: 44, lineHeight: 50, letterSpacing: -0.9 },
  display: { fontFamily: font.numBold, fontSize: 32, lineHeight: 38, letterSpacing: -0.6 },
  title: { fontFamily: font.bold, fontSize: 24, lineHeight: 30, letterSpacing: -0.3 },
  headline: { fontFamily: font.semibold, fontSize: 18, lineHeight: 24, letterSpacing: -0.1 },
  body: { fontFamily: font.regular, fontSize: 15, lineHeight: 22 },
  bodyStrong: { fontFamily: font.semibold, fontSize: 15, lineHeight: 22 },
  label: { fontFamily: font.medium, fontSize: 13, lineHeight: 18 },
  caption: { fontFamily: font.regular, fontSize: 12, lineHeight: 16 },
  num: { fontFamily: font.num, fontSize: 15, lineHeight: 20, fontVariant: ['tabular-nums'] as const },
  numLarge: { fontFamily: font.num, fontSize: 20, lineHeight: 26, fontVariant: ['tabular-nums'] as const, letterSpacing: -0.2 },
} as const;
