/**
 * Design tokens shared by the dashboards (Home, Mutual Funds, PSX).
 *
 * Neutral surfaces; colour only where it carries meaning: green = net /
 * gain, red = tax / loss, a pale "ghost" for gross. Values were validated
 * for contrast in both modes (the same palette as the Passive Income
 * Tracker the owner approved).
 */
import { useTheme } from '@mui/material';

/** Text: Monety, Artonex for display; Inter until licensed files are added (see public/fonts/README.md). */
export const FONT_TEXT = "'Monety', 'Inter Variable', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
export const FONT_DISPLAY = "'Artonex', 'Monety', 'Inter Variable', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
/** Figures: Inter Tight — tight, heavy grotesk numerals (the "Number font" reference), tabular. */
export const FONT_NUM = "'Inter Tight Variable', 'Inter Tight', 'Inter Variable', 'Inter', -apple-system, 'Segoe UI', sans-serif";

const LIGHT = {
  bg: '#f4f5f6', surface: '#ffffff', surface2: '#f6f7f8', surface3: '#eceef1',
  border: 'rgba(10,12,16,0.08)', hairline: '#eef0f2', hover: 'rgba(10,12,16,0.06)',
  ink: '#0b0c0e', ink2: '#4b5058', muted: '#80858d', inv: '#0b0c0e', invInk: '#ffffff',
  net: '#1f8a5c', tax: '#e34948', profit: '#2a5bd7', gross: '#e3e6ea', pos: '#137148', posSoft: '#eaf4ee', neg: '#c4302b', negSoft: '#fdecea',
  warn: '#8f5d00', warnSoft: '#fbf1db', tipBg: '#0b0c0e', tipInk: '#ffffff', track: '#eceef1',
  series: ['#1f8a5c', '#2a78d6', '#eda100', '#7a5af5', '#d6457a', '#0f9fb0', '#c3c8ce'],
  invested: '#9aa0a8',
  // Glass for small controls (switches, pills, dropdowns): a frosted capsule with a lit top edge,
  // and a raised, slightly brighter thumb. Kept subtle on purpose.
  glass: {
    background: 'linear-gradient(180deg, rgba(255,255,255,0.72) 0%, rgba(240,242,245,0.72) 100%)',
    border: '1px solid rgba(10,12,16,0.08)',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.95), inset 0 -1px 0 rgba(10,12,16,0.03), 0 1px 2px rgba(10,12,16,0.04)',
    backdropFilter: 'blur(14px) saturate(160%)', WebkitBackdropFilter: 'blur(14px) saturate(160%)',
  },
  glassHover: 'linear-gradient(180deg, rgba(255,255,255,0.9) 0%, rgba(236,238,241,0.9) 100%)',
  glassThumb: {
    background: 'linear-gradient(180deg, #ffffff 0%, #f5f6f8 100%)',
    boxShadow: 'inset 0 1px 0 #ffffff, 0 1px 2px rgba(10,12,16,0.10), 0 4px 12px -4px rgba(10,12,16,0.18)',
  },
  shadow: '0 1px 2px rgba(10,12,16,.04), 0 6px 20px -8px rgba(10,12,16,.08)',
  shadowLg: '0 24px 60px -16px rgba(10,12,16,.28)',
};

const DARK = {
  bg: '#000000', surface: '#0c0c0d', surface2: '#151517', surface3: '#1e1e21',
  border: 'rgba(255,255,255,0.08)', hairline: '#1a1a1d', hover: 'rgba(255,255,255,0.08)',
  ink: '#f5f5f7', ink2: '#a8a8ae', muted: '#7c7c84', inv: '#f5f5f7', invInk: '#000000',
  net: '#1fa065', tax: '#e66767', profit: '#5b8def', gross: '#26262a', pos: '#3ccf8e', posSoft: 'rgba(60,207,142,.1)', neg: '#ff7a70', negSoft: 'rgba(255,122,112,.1)',
  warn: '#f0b44c', warnSoft: 'rgba(240,180,76,.1)', tipBg: '#1e1e21', tipInk: '#f5f5f7', track: '#1e1e21',
  series: ['#22a86f', '#3987e5', '#c98500', '#9b85ff', '#e86a97', '#29b6c6', '#3a3a3f'],
  invested: '#6f6f76',
  glass: {
    background: 'linear-gradient(180deg, rgba(255,255,255,0.07) 0%, rgba(255,255,255,0.03) 100%)',
    border: '1px solid rgba(255,255,255,0.10)',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.07), inset 0 -1px 0 rgba(255,255,255,0.12), 0 6px 18px -10px rgba(0,0,0,0.8)',
    backdropFilter: 'blur(14px) saturate(150%)', WebkitBackdropFilter: 'blur(14px) saturate(150%)',
  },
  glassHover: 'linear-gradient(180deg, rgba(255,255,255,0.11) 0%, rgba(255,255,255,0.05) 100%)',
  glassThumb: {
    background: 'linear-gradient(180deg, rgba(255,255,255,0.16) 0%, rgba(255,255,255,0.07) 100%)',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.14), 0 4px 14px -4px rgba(0,0,0,0.7)',
  },
  shadow: 'none',
  shadowLg: '0 24px 60px -16px rgba(0,0,0,.8)',
};

export const fxTokens = (mode) => (mode === 'dark' ? DARK : LIGHT);

export function useFx() {
  const theme = useTheme();
  return fxTokens(theme.palette.mode);
}

/** Text colour for a signed amount. */
export const signColor = (t, v) => (v > 0 ? t.pos : v < 0 ? t.neg : t.ink2);

/**
 * Earnings chart colours (after the "line chart UI" reference): violet for
 * gross, cyan for net, a muted blue-grey axis and a navy hover card. Dark mode
 * lifts both lines so they keep contrast on near-black. Red stays reserved
 * for a loss.
 */
export const earningsColors = (mode) => (mode === 'dark'
  ? { gross: '#9c8cff', net: '#5fdcef', axis: '#7d8699', tip: '#111114', tipBorder: 'rgba(255,255,255,0.10)', grossOnTip: '#b7acff', loss: '#ff7a70' }
  : { gross: '#4f3fa6', net: '#3fc8de', axis: '#8a98b2', tip: '#0d1530', tipBorder: 'transparent', grossOnTip: '#b7acff', loss: '#c4302b' });

/**
 * Personal finance lines: active income, passive income, expenses.
 * Validated with the dataviz palette checker (lightness band, chroma, CVD,
 * contrast) on the light and dark chart surfaces; do not swap by eye.
 */
export const flowColors = (mode) => (mode === 'dark'
  ? { active: '#9085e9', passive: '#199e70', expenses: '#d95926' }
  : { active: '#6250d6', passive: '#1baf7a', expenses: '#eb6834' });

/**
 * Categorical slices for category donuts (validated in this order, adjacent
 * pairs, both modes): blue, orange, aqua, yellow, magenta; "Others" is grey.
 */
export const categoryColors = (mode) => (mode === 'dark'
  ? ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181']
  : ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4']);

/** Net worth parts on Home: mutual funds, PSX stocks, savings (validated, all pairs). */
export const worthColors = (mode) => (mode === 'dark'
  ? { funds: '#3987e5', stocks: '#d95926', savings: '#199e70' }
  : { funds: '#2a78d6', stocks: '#eb6834', savings: '#1baf7a' });

/** Passive income sources (validated the same way). `other` is a neutral grey. */
export const passiveColors = (mode) => (mode === 'dark'
  ? { mutual_funds: '#22a86f', dividends: '#3987e5', savings: '#c98500', other: '#8b8b93' }
  : { mutual_funds: '#1f8a5c', dividends: '#2a78d6', savings: '#b07400', other: '#6b7079' });
