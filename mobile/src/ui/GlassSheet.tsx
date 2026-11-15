/**
 * Apple-style glass bottom sheet (owner, 2026-11-14): the screen behind blurs and the sheet itself is
 * translucent frosted glass with a lit top edge, gliding up with eased timing (no bounce). Drawn inside the
 * page (not a Modal) so Android can blur: the page wraps its content in a `BlurTargetView` and passes it here.
 * Drag the handle down to dismiss (it follows the finger, `SheetFrame`); back or a tap outside close it too.
 */
import { LinearGradient } from 'expo-linear-gradient';
import { type ComponentRef, type ReactNode, type RefObject } from 'react';
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useGlass } from './glass';
import { Text } from './Text';
import { useTheme } from './theme';
import { SheetFrame } from './SheetFrame';
import { font, SCREEN_PAD, space } from './tokens';

/**
 * The translucent glass panel colours, shared with the period sheet. `smoky` (date selectors, owner: "a dark
 * touch") is a deeper near-black glass in the dark theme; the light theme stays light glass for its dark text.
 */
export function glassPanel(dark: boolean, smoky = false, tint?: number) {
  if (dark && smoky) {
    return {
      // With the Glass style the tint follows the transparency setting (real blur shows through).
      backgroundColor: `rgba(8,8,10,${tint !== undefined ? Math.min(0.85, tint + 0.1).toFixed(2) : '0.80'})`,
      borderColor: 'rgba(255,255,255,0.09)',
      borderTopColor: 'rgba(255,255,255,0.22)',
      sheen: ['rgba(255,255,255,0.06)', 'rgba(255,255,255,0)'] as [string, string],
      tile: 'rgba(255,255,255,0.045)',
      tileBorder: 'rgba(255,255,255,0.07)',
    };
  }
  return {
    tile: dark ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.7)',
    tileBorder: dark ? 'rgba(255,255,255,0.08)' : 'rgba(16,20,12,0.08)',
    backgroundColor: dark ? 'rgba(30,30,32,0.66)' : 'rgba(255,255,255,0.74)',
    borderColor: dark ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.9)',
    borderTopColor: dark ? 'rgba(255,255,255,0.30)' : '#FFFFFF',
    sheen: (dark ? ['rgba(255,255,255,0.10)', 'rgba(255,255,255,0)'] : ['rgba(255,255,255,0.6)', 'rgba(255,255,255,0)']) as [string, string],
  };
}

export function GlassSheet({ blurTarget, title, onClose, children, maxHeight = 0.8, smoky = false }: {
  blurTarget: RefObject<ComponentRef<typeof View> | null>; title?: string; onClose: () => void; children: ReactNode; maxHeight?: number;
  /** Deeper near-black glass in the dark theme (date selectors, the net-worth sheet). */
  smoky?: boolean;
}) {
  const p = useTheme();
  const dark = p.mode === 'dark';
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const glass = useGlass();
  const g = glassPanel(dark, smoky, glass.on ? glass.tintAlpha : undefined);
  return (
    <SheetFrame blurTarget={blurTarget} maxHeight={height * maxHeight} intensity={dark ? (smoky ? 70 : 60) : 50} scrim={dark ? (smoky ? 0.45 : 0.3) : 0.1} onClose={onClose}
      panelStyle={[styles.sheet, { maxHeight: height * maxHeight, backgroundColor: g.backgroundColor, borderColor: g.borderColor, borderTopColor: g.borderTopColor,
        paddingBottom: Math.max(insets.bottom, space.lg) }]}
      decor={<LinearGradient colors={g.sheen} style={styles.sheen} pointerEvents="none" />}
      handle={<>
        <View style={[styles.handle, { backgroundColor: dark ? 'rgba(255,255,255,0.28)' : 'rgba(0,0,0,0.18)' }]} />
        {title ? <Text style={[styles.title, { color: p.ink }]} accessibilityRole="header">{title}</Text> : null}
      </>}>
      {() => <ScrollView style={{ flexGrow: 0 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">{children}</ScrollView>}
    </SheetFrame>
  );
}

const styles = StyleSheet.create({
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, borderTopLeftRadius: 30, borderTopRightRadius: 30, borderWidth: 1,
    paddingHorizontal: SCREEN_PAD, paddingTop: 10, overflow: 'hidden' },
  sheen: { position: 'absolute', top: 0, left: 0, right: 0, height: 120 },
  handle: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, marginBottom: space.md },
  title: { fontFamily: font.bold, fontSize: 22, letterSpacing: -0.4, marginBottom: space.md },
});
