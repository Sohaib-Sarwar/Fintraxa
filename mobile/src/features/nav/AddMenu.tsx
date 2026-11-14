/**
 * The "+" action as a speed-dial (owner feedback: no overflow, smooth): the screen dims, the + turns into ✕
 * and three rows rise above it with a short stagger — Upload, Income, Expense — each a short name and a round
 * icon, right-aligned to the button so nothing leaves the screen. Back / backdrop / ✕ close it.
 * All motion runs on the UI thread (Reanimated); a light haptic on open and on pick.
 */
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withSpring, withTiming, type SharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';
import { haptic } from '@/lib/haptics';
import { Banknote, FileUp, Plus, ShoppingBag, type LucideIcon } from '@/ui/icons';
import { Text } from '@/ui/Text';
import { useTheme } from '@/ui/theme';

export const FAB_SIZE = 62;
/** Distance from the screen bottom (above the safe area) to the nav's centre line. */
export const FAB_CENTER_FROM_BOTTOM = 12 + 35;
/** The + sits at the right end of the nav row: its centre is this far from the right edge. */
export const FAB_CENTER_FROM_RIGHT = 12 + FAB_SIZE / 2;

type Action = { key: string; label: string; icon: LucideIcon; go: () => void; primary?: boolean };
const ACTIONS: Action[] = [
  { key: 'expense', label: 'Expense', icon: ShoppingBag, go: () => router.push({ pathname: '/add', params: { type: 'debit' } }) },
  { key: 'income', label: 'Income', icon: Banknote, go: () => router.push({ pathname: '/add', params: { type: 'credit' } }) },
  { key: 'upload', label: 'Upload', icon: FileUp, go: () => router.push('/upload'), primary: true },
];
const SPRING = { damping: 20, stiffness: 240, mass: 0.7 };

function Row({ a, index, progress, onPick }: { a: Action; index: number; progress: SharedValue<number>; onPick: (a: Action) => void }) {
  const p = useTheme();
  const style = useAnimatedStyle(() => {
    // Stagger: the row nearest the button moves first.
    const k = Math.max(0, Math.min(1, (progress.get() - index * 0.12) / (1 - index * 0.12)));
    return { opacity: k, transform: [{ translateY: (1 - k) * 18 }, { scale: 0.92 + 0.08 * k }] };
  });
  const Icon = a.icon;
  return (
    <Animated.View style={[styles.row, style]}>
      <Pressable onPress={() => onPick(a)} accessibilityRole="button" accessibilityLabel={a.label}
        style={({ pressed }) => [styles.rowInner, { opacity: pressed ? 0.85 : 1 }]} hitSlop={4}>
        <View style={[styles.labelPill, { backgroundColor: p.surface2, borderColor: p.borderStrong }]}>
          <Text variant="bodyStrong" numberOfLines={1}>{a.label}</Text>
        </View>
        <View style={[styles.icon, { backgroundColor: a.primary ? p.accent : p.surface3, borderColor: a.primary ? p.accent : p.borderStrong }]}>
          <Icon size={22} color={a.primary ? p.accentInk : p.ink} strokeWidth={2} />
        </View>
      </Pressable>
    </Animated.View>
  );
}

export function AddMenu({ open, onClose }: { open: boolean; onClose: () => void }) {
  const p = useTheme();
  const insets = useSafeAreaInsets();
  const progress = useSharedValue(0);
  const [mounted, setMounted] = useState(open);
  if (open && !mounted) setMounted(true);

  useEffect(() => {
    if (open) progress.set(withSpring(1, SPRING));
    else progress.set(withTiming(0, { duration: 160, easing: Easing.out(Easing.quad) }, (done) => { if (done) scheduleOnRN(setMounted, false); }));
  }, [open, progress]);

  const backdrop = useAnimatedStyle(() => ({ opacity: progress.get() }));
  const rotate = useAnimatedStyle(() => ({ transform: [{ rotate: `${progress.get() * 135}deg` }] }));

  const pick = (a: Action) => {
    haptic.light();
    onClose();
    setTimeout(a.go, 80);
  };

  if (!mounted) return null;
  return (
    <Modal visible transparent animationType="none" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(5,7,6,0.82)' }, backdrop]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close add menu" />
      </Animated.View>
      {/* A real, sized column (not absolute children of a zero-size anchor): rows size to their content and
          every row sits inside its parent, so nothing is squeezed and every row is tappable on Android. */}
      <View pointerEvents="box-none" style={[styles.stack, { bottom: insets.bottom + FAB_CENTER_FROM_BOTTOM - FAB_SIZE / 2, right: FAB_CENTER_FROM_RIGHT - FAB_SIZE / 2 }]}>
        {ACTIONS.map((a, i) => ({ a, i })).reverse().map(({ a, i }) => <Row key={a.key} a={a} index={i} progress={progress} onPick={pick} />)}
        <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close add menu"
          style={[styles.fab, { backgroundColor: p.accent }]}>
          <Animated.View style={rotate}><Plus size={28} color={p.accentInk} strokeWidth={2.6} /></Animated.View>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  stack: { position: 'absolute', left: 16, alignItems: 'flex-end', gap: 12 },
  fab: { width: FAB_SIZE, height: FAB_SIZE, borderRadius: FAB_SIZE / 2, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  row: { marginRight: (FAB_SIZE - 54) / 2 },
  rowInner: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  labelPill: { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 14, paddingVertical: 7 },
  icon: { width: 54, height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
});
