/**
 * Empty, loading, error and offline states, plus the global toast (with Undo) — every screen designs
 * these instead of showing a blank or a raw error.
 */
import NetInfo from '@react-native-community/netinfo';
import { WifiOff } from '@/ui/icons';
import { useEffect, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { Button } from './primitives';
import { Text } from './Text';
import { useTheme } from './theme';
import { radius, space } from './tokens';

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
/** Placeholder in the shape of what is loading: a slow, quiet breathe (not a blink). */
export function Skeleton({ height = 16, width = '100%', radius: r = 8, style }: { height?: number | `${number}%`; width?: number | `${number}%`; radius?: number; style?: object }) {
  const p = useTheme();
  const o = useSharedValue(0.55);
  useEffect(() => { o.value = withRepeat(withTiming(0.9, { duration: 1100, easing: Easing.inOut(Easing.sin) }), -1, true); }, [o]);
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

// ── Toast: the Apple-style top banner lives in NotificationBanner.tsx ──
export { toast, ToastHost, useToast, type ToastTone } from './NotificationBanner';

const styles = StyleSheet.create({
  empty: { alignItems: 'center', gap: space.sm, paddingVertical: space.xxxl, paddingHorizontal: space.xl },
  offline: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.pill, marginBottom: space.md },
});
