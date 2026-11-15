/**
 * App-wide notification (owner, 2026-11-15: "show the same Apple notification style from the top, like the web"):
 * the web's GlassToast on the phone — a frosted dark card that slides down from the top with the Fintraxa icon,
 * a small tinted status badge, a short title, "now", and the message. Swipe it up or tap it to dismiss; it goes
 * by itself after 3.6 s (errors a little longer, Undo 5 s). Motion is a plain ease-out slide, no bounce.
 *
 *   toast('Transaction added')                              → Done
 *   toast('Couldn’t save', { tone: 'error' })               → Something went wrong
 *   toast('Keep at least one…', { tone: 'warning' })        → Heads up
 *   toast('Fingerprint sign-in is off', { tone: 'info' })   → Fintraxa
 *   toast('Transaction deleted', { action: { label: 'Undo', run } })
 */
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';
import { create } from 'zustand';
import { haptic } from '@/lib/haptics';
import { Check, Info, X, type LucideIcon } from './icons';
import { Text } from './Text';
import { font } from './tokens';

export type ToastTone = 'success' | 'error' | 'warning' | 'info';
type ToastMsg = { id: number; text: string; title?: string; action?: { label: string; run: () => void }; tone: ToastTone };
type ToastState = { current: ToastMsg | null; show: (m: Omit<ToastMsg, 'id'>) => void; hide: () => void };

let seq = 0;
export const useToast = create<ToastState>((set) => ({
  current: null,
  show: (m) => set({ current: { ...m, id: ++seq } }),
  hide: () => set({ current: null }),
}));

/** `tone: 'ok'` is the old name for success. */
export const toast = (text: string, opts: { action?: ToastMsg['action']; tone?: ToastTone | 'ok'; title?: string } = {}) =>
  useToast.getState().show({ text, title: opts.title, action: opts.action, tone: !opts.tone || opts.tone === 'ok' ? 'success' : opts.tone });

const TONE: Record<ToastTone, { color: string; Icon: LucideIcon | null; title: string }> = {
  success: { color: '#34C759', Icon: Check, title: 'Done' },
  error: { color: '#FF3B30', Icon: X, title: 'Something went wrong' },
  warning: { color: '#FF9F0A', Icon: null, title: 'Heads up' },
  info: { color: '#0A84FF', Icon: Info, title: 'Fintraxa' },
};
const SHOW_MS = 3600;
const ICON = require('../../assets/icon.png');
const EASE_IN = Easing.out(Easing.cubic);

export function ToastHost() {
  const insets = useSafeAreaInsets();
  const current = useToast((s) => s.current);
  const hide = useToast((s) => s.hide);
  if (!current) return null;
  return <Banner key={current.id} msg={current} top={insets.top + 8} onGone={hide} />;
}

function Banner({ msg, top, onGone }: { msg: ToastMsg; top: number; onGone: () => void }) {
  const tone = TONE[msg.tone];
  const y = useSharedValue(-140);
  const o = useSharedValue(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismiss = () => {
    if (timer.current) clearTimeout(timer.current);
    y.set(withTiming(-140, { duration: 220, easing: Easing.in(Easing.cubic) }));
    o.set(withTiming(0, { duration: 200 }, (done) => { if (done) scheduleOnRN(onGone); }));
  };

  useEffect(() => {
    y.set(withTiming(0, { duration: 300, easing: EASE_IN }));
    o.set(withTiming(1, { duration: 220 }));
    const ms = msg.action ? 5000 : msg.tone === 'error' ? SHOW_MS + 1800 : SHOW_MS;
    timer.current = setTimeout(dismiss, ms);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- once per message (keyed by id)

  // Swipe up to dismiss; a pull down only gives a little.
  const pan = usePanGesture({
    activeOffsetY: [-6, 6],
    onUpdate: (e) => { 'worklet'; y.set(e.translationY < 0 ? e.translationY : e.translationY * 0.15); },
    onDeactivate: (e) => {
      'worklet';
      if (e.translationY < -24 || e.velocityY < -500) scheduleOnRN(dismiss);
      else y.set(withTiming(0, { duration: 180, easing: EASE_IN }));
    },
  });
  const style = useAnimatedStyle(() => ({ opacity: o.get(), transform: [{ translateY: y.get() }] }));

  return (
    <View pointerEvents="box-none" style={[styles.wrap, { top }]}>
      <GestureDetector gesture={pan}>
        <Animated.View style={[styles.card, style]} accessibilityLiveRegion={msg.tone === 'error' ? 'assertive' : 'polite'} accessibilityRole="alert">
          <LinearGradient colors={['rgba(52,52,57,0.97)', 'rgba(30,30,33,0.97)']} style={StyleSheet.absoluteFill} />
          <Pressable onPress={dismiss} style={styles.row} accessibilityLabel={`${msg.title ?? tone.title}. ${msg.text}`}>
            <View>
              <Image source={ICON} style={styles.icon} contentFit="cover" />
              <View style={[styles.badge, { backgroundColor: tone.color }]}>
                {tone.Icon ? <tone.Icon size={10} color="#fff" strokeWidth={3.2} /> : <Text style={styles.bang}>!</Text>}
              </View>
            </View>
            <View style={styles.body}>
              <View style={styles.head}>
                <Text style={styles.title} numberOfLines={1}>{msg.title ?? tone.title}</Text>
                <Text style={styles.now}>now</Text>
              </View>
              <Text style={styles.text} numberOfLines={3}>{msg.text}</Text>
            </View>
            {msg.action ? (
              <Pressable hitSlop={10} accessibilityRole="button" accessibilityLabel={msg.action.label}
                onPress={() => { haptic.light(); msg.action!.run(); dismiss(); }} style={({ pressed }) => [styles.action, { opacity: pressed ? 0.7 : 1 }]}>
                <Text style={styles.actionText}>{msg.action.label}</Text>
              </Pressable>
            ) : null}
          </Pressable>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 12, right: 12, alignItems: 'center', zIndex: 1000, elevation: 1000 },
  card: {
    width: '100%', maxWidth: 420, borderRadius: 22, overflow: 'hidden', borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)', borderTopColor: 'rgba(255,255,255,0.2)',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 12, paddingVertical: 11 },
  icon: { width: 38, height: 38, borderRadius: 10 },
  badge: {
    position: 'absolute', right: -5, bottom: -5, width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#1E1E21',
  },
  bang: { color: '#fff', fontFamily: font.bold, fontSize: 10, lineHeight: 12 },
  body: { flex: 1, minWidth: 0, gap: 1 },
  head: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 },
  title: { flexShrink: 1, color: '#F5F5F7', fontFamily: font.bold, fontSize: 13, lineHeight: 17 },
  now: { color: 'rgba(245,245,247,0.5)', fontFamily: font.regular, fontSize: 11, lineHeight: 15 },
  text: { color: 'rgba(245,245,247,0.82)', fontFamily: font.regular, fontSize: 12.5, lineHeight: 17 },
  action: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.12)' },
  actionText: { color: '#F5F5F7', fontFamily: font.semibold, fontSize: 12.5, lineHeight: 16 },
});
