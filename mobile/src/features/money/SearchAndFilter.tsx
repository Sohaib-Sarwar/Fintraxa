/**
 * The expanding search + filter row (owner, 2026-11-14 for Wallet transactions; 2026-11-15 shared with the fund and
 * share transactions): a round glass search icon beside the filter pill; tap the icon and it widens smoothly over the
 * whole row while the filter fades out; closing (✕, or leaving it empty) shrinks it back.
 */
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef, useState, type ComponentRef, type ReactNode } from 'react';
import { Pressable, StyleSheet, TextInput, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { haptic } from '@/lib/haptics';
import { Search, X } from '@/ui/icons';
import { useTheme } from '@/ui/theme';
import { font, space } from '@/ui/tokens';

export const SEARCH_ICON = 40;

export function SearchAndFilter({ q, setQ, title, edge, fill, filter }: {
  q: string; setQ: (v: string) => void; title: string; edge: StyleProp<ViewStyle>; fill: [string, string]; filter: ReactNode;
}) {
  const p = useTheme();
  const [openState, setOpen] = useState(false);
  const open = openState || !!q;
  const [rowW, setRowW] = useState(0);
  const k = useSharedValue(open ? 1 : 0);
  const width = useSharedValue(rowW);
  const input = useRef<ComponentRef<typeof TextInput>>(null);
  useEffect(() => { width.set(rowW); }, [rowW, width]);
  useEffect(() => {
    k.set(withTiming(open ? 1 : 0, { duration: 300, easing: Easing.bezier(0.2, 0, 0, 1) }));
    if (open) { const t = setTimeout(() => input.current?.focus(), 120); return () => clearTimeout(t); }
    input.current?.blur();
    return undefined;
  }, [open, k]);
  const close = () => { setQ(''); setOpen(false); };
  const searchStyle = useAnimatedStyle(() => ({ width: SEARCH_ICON + Math.max(0, width.get() - SEARCH_ICON) * k.get() }));
  const fieldStyle = useAnimatedStyle(() => ({ opacity: Math.max(0, (k.get() - 0.35) / 0.65) }));
  const filterStyle = useAnimatedStyle(() => ({ opacity: 1 - k.get(), marginLeft: 8 * (1 - k.get()) }));
  return (
    <View style={styles.controls} onLayout={(e) => setRowW(Math.round(e.nativeEvent.layout.width))}>
      <Animated.View style={[styles.searchBox, edge, searchStyle]}>
        <LinearGradient colors={fill} style={StyleSheet.absoluteFill} />
        <Pressable onPress={open ? () => input.current?.focus() : () => { haptic.tick(); setOpen(true); }} hitSlop={6} accessibilityRole="button"
          accessibilityLabel={open ? 'Search field' : `Search ${title.toLowerCase()}`} style={styles.searchIcon}>
          <Search size={17} color={p.ink} />
        </Pressable>
        <Animated.View style={[styles.field, fieldStyle]} pointerEvents={open ? 'auto' : 'none'}>
          <TextInput ref={input} value={q} onChangeText={setQ} placeholder={`Search ${title.toLowerCase()}`} placeholderTextColor={p.muted}
            style={[styles.input, { color: p.ink }]} accessibilityLabel={`Search ${title.toLowerCase()}`} returnKeyType="search"
            selectionColor={p.accent} cursorColor={p.accent} autoCorrect={false} onBlur={() => { if (!q) setOpen(false); }} />
          <Pressable onPress={close} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close search" style={styles.close}>
            <X size={16} color={p.ink2} />
          </Pressable>
        </Animated.View>
      </Animated.View>
      <Animated.View style={[styles.filter, filterStyle]} pointerEvents={open ? 'none' : 'auto'}>{filter}</Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  controls: { flexDirection: 'row', alignItems: 'center', marginTop: space.md, marginBottom: space.xs, minHeight: SEARCH_ICON },
  searchBox: { height: SEARCH_ICON, borderRadius: SEARCH_ICON / 2, borderWidth: 1, overflow: 'hidden', flexDirection: 'row', alignItems: 'center' },
  searchIcon: { width: SEARCH_ICON - 2, height: SEARCH_ICON - 2, alignItems: 'center', justifyContent: 'center' },
  field: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  input: { flex: 1, fontFamily: font.regular, fontSize: 15, padding: 0 },
  close: { paddingHorizontal: 12, height: SEARCH_ICON, justifyContent: 'center' },
  filter: { flex: 1, minWidth: 0 },
});
