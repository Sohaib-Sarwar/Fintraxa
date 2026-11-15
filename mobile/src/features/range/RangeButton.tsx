/**
 * The period button at the top right of every money page (owner, 2026-11-14): an Apple-style glass capsule
 * showing the period ("FY 2026-27") with a small chevron. Tap → the period sheet slides up.
 */
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet } from 'react-native';
import { haptic } from '@/lib/haptics';
import { ChevronDown } from '@/ui/icons';
import { Text } from '@/ui/Text';
import { useTheme } from '@/ui/theme';
import { font } from '@/ui/tokens';
import { usePeriod, usePeriodSheet } from './usePeriod';

/** Defaults to the app-wide period; a page with its own period passes `label` and `onPress`. */
export function RangeButton({ label: ownLabel, onPress }: { label?: string; onPress?: () => void } = {}) {
  const p = useTheme();
  const dark = p.mode === 'dark';
  const global = usePeriod();
  const showGlobal = usePeriodSheet((s) => s.show);
  const label = ownLabel ?? global.label;
  const show = onPress ?? showGlobal;
  return (
    <Pressable onPress={() => { haptic.tick(); show(); }} hitSlop={6} accessibilityRole="button" accessibilityLabel={`Period: ${label}. Change`}
      style={({ pressed }) => [styles.pill, {
        borderColor: dark ? 'rgba(255,255,255,0.12)' : 'rgba(16,20,12,0.10)',
        borderBottomColor: dark ? 'rgba(255,255,255,0.26)' : 'rgba(16,20,12,0.18)',
        opacity: pressed ? 0.8 : 1,
      }]}>
      <LinearGradient colors={dark ? ['rgba(255,255,255,0.12)', 'rgba(255,255,255,0.04)'] : ['rgba(255,255,255,0.98)', 'rgba(232,235,228,0.95)']} style={StyleSheet.absoluteFill} />
      {/* Never cut short (owner, 2026-11-15: dates were ending in "…"): the pill sizes to its label. */}
      <Text style={[styles.text, { color: p.ink }]}>{label}</Text>
      <ChevronDown size={14} color={p.ink2} strokeWidth={2.2} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 6, height: 36, paddingHorizontal: 14, borderRadius: 18, borderWidth: 1, overflow: 'hidden', flexShrink: 0,
  },
  text: { fontFamily: font.num, fontSize: 13.5, lineHeight: 18, letterSpacing: -0.1 },
});
