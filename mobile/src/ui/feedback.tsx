/**
 * Empty, loading, error and offline states, plus the global toast (with Undo) — every screen designs
 * these instead of showing a blank or a raw error.
 */
import NetInfo from '@react-native-community/netinfo';
import { WifiOff } from '@/ui/icons';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, FadeOutDown, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { create } from 'zustand';
import { haptic } from '@/lib/haptics';
import { Button } from './primitives';
import { Text } from './Text';
import { useTheme } from './theme';
import { radius, SCREEN_PAD, space } from './tokens';

export function EmptyState({ icon, title, body, action, onAction }: { icon?: ReactNode; title: string; body?: string; action?: string; onAction?: () => void }) {
  return (
    <View style={styles.empty}>
      {icon}
      <Text variant="headline" align="center">{title}</Text>
      {body ? <Text variant="body" tone="ink2" align="center">{body}</Text> : null}
      {action && onAction ? <Button label={action} onPress={onAction} kind="secondary" size="md" style={{ marginTop: space.sm, alignSelf: 'center' }} /> : null}
    </View>
  );
}

export function ErrorState({ onRetry, message = 'We couldn’t load this. Check your connection and try again.' }: { onRetry?: () => void; message?: string }) {
  return <EmptyState title="Something didn’t load" body={message} action={onRetry ? 'Try again' : undefined} onAction={onRetry} />;
}

/** Pulsing placeholder — only when there is no cached data at all (plan §7.4). */
export function Skeleton({ height = 16, width = '100%', radius: r = 8, style }: { height?: number; width?: number | `${number}%`; radius?: number; style?: object }) {
  const p = useTheme();
  const o = useSharedValue(0.5);
  useEffect(() => { o.value = withRepeat(withTiming(1, { duration: 700 }), -1, true); }, [o]);
  const s = useAnimatedStyle(() => ({ opacity: o.value }));
  return <Animated.View style={[{ height, width, borderRadius: r, backgroundColor: p.surface2 }, s, style]} />;
}

export function useOnline() {
  const [online, setOnline] = useState(true);
  useEffect(() => NetInfo.addEventListener((s) => setOnline(s.isConnected !== false && s.isInternetReachable !== false)), []);
  return online;
}

/** "Offline · last updated 21:40" (plan §6.7). */
export function OfflinePill({ updatedAt }: { updatedAt?: string | null }) {
  const p = useTheme();
  const online = useOnline();
  if (online) return null;
  return (
    <View style={[styles.offline, { backgroundColor: p.warnSoft }]} accessibilityLiveRegion="polite">
      <WifiOff size={14} color={p.warn} />
      <Text variant="label" tone="warn">Offline{updatedAt ? ` · last updated ${updatedAt}` : ' · showing saved figures'}</Text>
    </View>
  );
}

// ── Toast ──
type ToastMsg = { id: number; text: string; action?: { label: string; run: () => void }; tone?: 'ok' | 'error' };
type ToastState = { current: ToastMsg | null; show: (m: Omit<ToastMsg, 'id'>) => void; hide: () => void };
let seq = 0;
export const useToast = create<ToastState>((set) => ({
  current: null,
  show: (m) => set({ current: { ...m, id: ++seq } }),
  hide: () => set({ current: null }),
}));
export const toast = (text: string, opts: { action?: ToastMsg['action']; tone?: ToastMsg['tone'] } = {}) => useToast.getState().show({ text, ...opts });

export function ToastHost() {
  const p = useTheme();
  const insets = useSafeAreaInsets();
  const { current, hide } = useToast();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!current) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(hide, current.action ? 5000 : 2600);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [current, hide]);
  if (!current) return null;
  return (
    <Animated.View key={current.id} entering={FadeInDown.springify().damping(20)} exiting={FadeOutDown.duration(150)} pointerEvents="box-none"
      style={[styles.toastWrap, { bottom: insets.bottom + 92 }]}>
      <View style={[styles.toast, { backgroundColor: p.mode === 'dark' ? p.surface3 : p.ink }]} accessibilityLiveRegion="polite" accessibilityRole="alert">
        <Text variant="bodyStrong" style={{ color: current.tone === 'error' ? p.neg : p.mode === 'dark' ? p.ink : p.bg, flex: 1 }}>{current.text}</Text>
        {current.action ? (
          <Pressable hitSlop={12} accessibilityRole="button" accessibilityLabel={current.action.label}
            onPress={() => { haptic.light(); current.action!.run(); hide(); }}>
            <Text variant="bodyStrong" style={{ color: p.accent }}>{current.action.label}</Text>
          </Pressable>
        ) : null}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  empty: { alignItems: 'center', gap: space.sm, paddingVertical: space.xxxl, paddingHorizontal: space.xl },
  offline: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.pill, marginBottom: space.md },
  toastWrap: { position: 'absolute', left: SCREEN_PAD, right: SCREEN_PAD },
  toast: { flexDirection: 'row', alignItems: 'center', gap: space.lg, borderRadius: 16, paddingHorizontal: space.lg, paddingVertical: 14 },
});
