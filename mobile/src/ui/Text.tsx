import { Text as RNText, type TextProps, type TextStyle } from 'react-native';
import { useTheme } from './theme';
import { type as scale, type Palette } from './tokens';

export type Variant = keyof typeof scale;
export type Tone = 'ink' | 'ink2' | 'muted' | 'pos' | 'neg' | 'warn' | 'accent' | 'accentInk' | 'flat';

export const toneColor = (p: Palette, t: Tone) => {
  switch (t) {
    case 'flat': return p.ink2;
    case 'accent': return p.mode === 'dark' ? p.accent : '#8A6640';
    default: return p[t];
  }
};

type Props = TextProps & { variant?: Variant; tone?: Tone; align?: TextStyle['textAlign']; weight?: TextStyle['fontFamily'] };

/** Every piece of text goes through here: one type scale, theme colours, system font scaling capped at 200%. */
export function Text({ variant = 'body', tone = 'ink', align, weight, style, maxFontSizeMultiplier = 2, ...rest }: Props) {
  const p = useTheme();
  return (
    <RNText
      maxFontSizeMultiplier={maxFontSizeMultiplier}
      style={[scale[variant], { color: toneColor(p, tone) }, align ? { textAlign: align } : null, weight ? { fontFamily: weight } : null, style]}
      {...rest}
    />
  );
}
