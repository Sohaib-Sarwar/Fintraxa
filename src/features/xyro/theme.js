/**
 * Xyro's look, on top of the app's tokens (useFx): a violet accent, a glass
 * surface and a soft lavender-to-blue wash, each stepped for light and dark.
 */
export const SERIF = "'Iowan Old Style', 'Palatino Linotype', Palatino, 'Book Antiqua', Georgia, serif";

export function xyroTheme(mode) {
  const dark = mode === 'dark';
  return dark
    ? {
      accent: '#9085e9', accentInk: '#ffffff', accentSoft: 'rgba(144,133,233,0.16)',
      glass: 'rgba(16,16,20,0.80)', glassBorder: 'rgba(255,255,255,0.09)', blur: 'blur(22px) saturate(160%)',
      wash: 'radial-gradient(120% 70% at 85% 0%, rgba(98,80,214,0.22) 0%, transparent 55%), radial-gradient(90% 60% at 0% 100%, rgba(57,135,229,0.16) 0%, transparent 60%), radial-gradient(60% 40% at 100% 70%, rgba(213,81,129,0.08) 0%, transparent 70%), #0d0d11',
      chip: 'rgba(255,255,255,0.05)', chipBorder: 'rgba(255,255,255,0.10)', chipHover: 'rgba(255,255,255,0.09)',
      input: 'rgba(255,255,255,0.06)', bubble: 'rgba(255,255,255,0.05)',
      shadow: '0 30px 80px -20px rgba(0,0,0,0.85), 0 0 0 1px rgba(255,255,255,0.04)',
    }
    : {
      accent: '#6250d6', accentInk: '#ffffff', accentSoft: 'rgba(98,80,214,0.10)',
      glass: 'rgba(255,255,255,0.82)', glassBorder: 'rgba(10,12,16,0.08)', blur: 'blur(22px) saturate(170%)',
      wash: 'radial-gradient(120% 70% at 85% 0%, rgba(173,160,255,0.38) 0%, transparent 55%), radial-gradient(90% 60% at 0% 100%, rgba(160,205,255,0.40) 0%, transparent 60%), radial-gradient(60% 40% at 100% 70%, rgba(255,190,225,0.30) 0%, transparent 70%), #f7f7fc',
      chip: 'rgba(255,255,255,0.72)', chipBorder: 'rgba(98,80,214,0.14)', chipHover: '#ffffff',
      input: 'rgba(255,255,255,0.86)', bubble: 'rgba(255,255,255,0.78)',
      shadow: '0 30px 80px -24px rgba(60,50,140,0.35), 0 0 0 1px rgba(10,12,16,0.04)',
    };
}
