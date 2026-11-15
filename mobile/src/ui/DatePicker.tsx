/**
 * Single-date picker (owner, 2026-11-15, reference `date picker.jpg`): the iOS wheel — month, day and year columns
 * that scroll and snap, the chosen row in a soft rounded band, rows tilting away and fading above and below it, a
 * light tick as each row passes. On a smoky glass card over the blurred screen; "Today" jumps back, Confirm keeps it.
 * Used wherever one date is chosen (wallet transactions, dividends). Future days are not allowed (clamped to `max`).
 *
 * Rendered inside the screen (not a Modal) so Android can blur it: expo-blur blurs a `BlurTargetView` the screen
 * wraps its content in and passes here as `blurTarget`; Android 11 and older get a plain dim instead.
 */
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef, useState, type ComponentRef, type RefObject } from 'react';
import { BackHandler, Pressable, StyleSheet, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import Animated, {
  Easing, Extrapolation, FadeIn, FadeOut, interpolate, useAnimatedRef, useAnimatedScrollHandler, useAnimatedStyle, useSharedValue, withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { todayIso } from '@/lib/dates';
import { haptic } from '@/lib/haptics';
import { glassPanel } from './GlassSheet';
import { Button } from './primitives';
import { Text } from './Text';
import { useTheme } from './theme';
import { alpha, font, space } from './tokens';

const EASE = Easing.bezier(0.2, 0, 0, 1);
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const ROW = 44;
const VISIBLE = 5; // rows on show; the middle one is the choice
const PAD = ROW * ((VISIBLE - 1) / 2);
const pad2 = (n: number) => String(n).padStart(2, '0');
const daysIn = (y: number, m: number) => new Date(y, m, 0).getDate();
const iso = (y: number, m: number, d: number) => `${y}-${pad2(m)}-${pad2(d)}`;

function eased(v: number, duration: number) {
  'worklet';
  return withTiming(v, { duration, easing: EASE });
}
/** The card fades in while rising 16 dp and settling from 97% scale. */
function rise() {
  'worklet';
  return {
    initialValues: { opacity: 0, transform: [{ translateY: 16 }, { scale: 0.97 }] },
    animations: { opacity: eased(1, 240), transform: [{ translateY: eased(0, 280) }, { scale: eased(1, 280) }] },
  };
}

/** One row: tilts back and fades with its distance from the band, like a drum. */
function WheelRow({ label, i, y, align, numeric, color }: { label: string; i: number; y: SharedValue<number>; align: 'left' | 'center' | 'right'; numeric: boolean; color: string }) {
  const style = useAnimatedStyle(() => {
    const d = (y.get() - i * ROW) / ROW;
    const a = Math.abs(d);
    return {
      opacity: interpolate(a, [0, 1, 2, 2.6], [1, 0.62, 0.3, 0.12], Extrapolation.CLAMP),
      transform: [{ perspective: 500 }, { rotateX: `${interpolate(d, [-2.6, 0, 2.6], [58, 0, -58], Extrapolation.CLAMP)}deg` }, { scale: interpolate(a, [0, 2.6], [1, 0.9], Extrapolation.CLAMP) }],
    };
  });
  return (
    <Animated.View style={[styles.row, style]}>
      <Text style={[styles.rowText, { textAlign: align, color, fontFamily: numeric ? font.num : font.medium }]} numberOfLines={1}>{label}</Text>
    </Animated.View>
  );
}

/** A scrolling, snapping column. `index` is the chosen row; `onChange` reports the row it settles on. */
function Wheel({ items, index, onChange, align, numeric, flex, color, label }: {
  items: string[]; index: number; onChange: (i: number) => void; align: 'left' | 'center' | 'right'; numeric?: boolean; flex: number; color: string; label: string;
}) {
  const ref = useAnimatedRef<Animated.ScrollView>();
  const y = useSharedValue(index * ROW);
  const passing = useSharedValue(index);
  const shown = useRef(index);

  // Follow outside changes (a day clamped when the month gets shorter, "Today", the future clamp).
  useEffect(() => {
    if (shown.current === index) return;
    shown.current = index;
    ref.current?.scrollTo({ y: index * ROW, animated: true });
  }, [index, ref]);

  const onScroll = useAnimatedScrollHandler((e) => {
    y.set(e.contentOffset.y);
    const r = Math.round(e.contentOffset.y / ROW);
    if (r !== passing.get()) { passing.set(r); scheduleOnRN(haptic.tick); }
  });
  const settle = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.max(0, Math.min(items.length - 1, Math.round(e.nativeEvent.contentOffset.y / ROW)));
    shown.current = i;
    if (i !== index) onChange(i);
  };

  return (
    <View style={{ flex, height: ROW * VISIBLE }} accessible accessibilityRole="adjustable" accessibilityLabel={`${label}: ${items[index]}`}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => onChange(Math.max(0, Math.min(items.length - 1, index + (e.nativeEvent.actionName === 'increment' ? 1 : -1))))}>
      <Animated.ScrollView ref={ref} onScroll={onScroll} scrollEventThrottle={16} showsVerticalScrollIndicator={false}
        snapToInterval={ROW} decelerationRate="fast" contentContainerStyle={{ paddingVertical: PAD }}
        contentOffset={{ x: 0, y: index * ROW }} onLayout={() => ref.current?.scrollTo({ y: index * ROW, animated: false })}
        onMomentumScrollEnd={settle} onScrollEndDrag={(e) => { if (!e.nativeEvent.velocity?.y) settle(e); }} nestedScrollEnabled>
        {items.map((it, i) => <WheelRow key={`${it}-${i}`} label={it} i={i} y={y} align={align} numeric={!!numeric} color={color} />)}
      </Animated.ScrollView>
    </View>
  );
}

export function DatePicker({ value, onClose, onPick, blurTarget, max = todayIso(), title = 'Select date' }: {
  value: string; onClose: () => void; onPick: (iso: string) => void; blurTarget: RefObject<ComponentRef<typeof View> | null>; max?: string; title?: string;
}) {
  const p = useTheme();
  const dark = p.mode === 'dark';
  const smoky = glassPanel(true, true);
  const maxY = Number(max.slice(0, 4));
  const years = Array.from({ length: 16 }, (_, i) => maxY - 15 + i);
  const [ymd, setYmd] = useState(() => {
    const v = value > max ? max : value;
    return { y: Number(v.slice(0, 4)), m: Number(v.slice(5, 7)), d: Number(v.slice(8, 10)) };
  });

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { onClose(); return true; });
    return () => sub.remove();
  }, [onClose]);

  /** Any change: keep the day inside the month, and the whole date not after `max`. */
  const set = (next: { y: number; m: number; d: number }) => {
    const d = Math.min(next.d, daysIn(next.y, next.m));
    const v = iso(next.y, next.m, d);
    if (v > max) setYmd({ y: Number(max.slice(0, 4)), m: Number(max.slice(5, 7)), d: Number(max.slice(8, 10)) });
    else setYmd({ y: next.y, m: next.m, d });
  };

  const draft = iso(ymd.y, ymd.m, ymd.d);
  const weekday = WEEKDAYS[new Date(ymd.y, ymd.m - 1, ymd.d).getDay()];
  const days = Array.from({ length: daysIn(ymd.y, ymd.m) }, (_, i) => String(i + 1));
  const ink = dark ? '#F5F5F7' : p.ink;
  const cardBg = dark ? '#0B0B0D' : p.surface; // hex: `alpha()` takes hex

  return (
    <Animated.View entering={FadeIn.duration(220).easing(EASE)} exiting={FadeOut.duration(180).easing(EASE)} style={StyleSheet.absoluteFill}>
      <BlurView blurTarget={blurTarget} blurMethod="dimezisBlurViewSdk31Plus" intensity={dark ? 70 : 50} tint={dark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
      <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: alpha('#000000', dark ? 0.35 : 0.12) }]} onPress={onClose}
        accessibilityRole="button" accessibilityLabel="Close date picker" />
      <View style={styles.center} pointerEvents="box-none">
        <Animated.View entering={rise} accessibilityViewIsModal style={[styles.card, dark
          ? { backgroundColor: smoky.backgroundColor, borderColor: smoky.borderColor, borderTopColor: smoky.borderTopColor, overflow: 'hidden', elevation: 0 }
          : { backgroundColor: p.surface, borderColor: p.border }]}>
          {dark ? <LinearGradient colors={smoky.sheen} style={styles.sheen} pointerEvents="none" /> : null}
          <View style={styles.head}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.title, { color: ink }]} accessibilityRole="header">{title}</Text>
              <Text style={[styles.sub, { color: alpha(ink, 0.6) }]}>{weekday}, {ymd.d} {MONTHS[ymd.m - 1]} {ymd.y}</Text>
            </View>
            <Pressable onPress={() => { haptic.tick(); set({ y: maxY, m: Number(max.slice(5, 7)), d: Number(max.slice(8, 10)) }); }} hitSlop={8}
              accessibilityRole="button" accessibilityLabel="Today" style={({ pressed }) => [styles.today, { opacity: pressed ? 0.7 : 1 }]}>
              <Text style={styles.todayText}>Today</Text>
            </Pressable>
          </View>

          <View style={styles.wheels}>
            {/* The chosen row's band, behind the columns. */}
            <View style={[styles.band, { top: PAD, backgroundColor: dark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.06)' }]} pointerEvents="none" />
            <Wheel label="Month" items={MONTHS} index={ymd.m - 1} onChange={(i) => set({ ...ymd, m: i + 1 })} align="left" flex={1.7} color={ink} />
            <Wheel label="Day" items={days} index={ymd.d - 1} onChange={(i) => set({ ...ymd, d: i + 1 })} align="center" numeric flex={0.8} color={ink} />
            <Wheel label="Year" items={years.map(String)} index={years.indexOf(ymd.y)} onChange={(i) => set({ ...ymd, y: years[i] })} align="right" numeric flex={1} color={ink} />
            {/* Rows dissolve into the card at the top and bottom. */}
            <LinearGradient colors={[cardBg, alpha(cardBg, 0)]} style={[styles.fade, { top: 0 }]} pointerEvents="none" />
            <LinearGradient colors={[alpha(cardBg, 0), cardBg]} style={[styles.fade, { bottom: 0 }]} pointerEvents="none" />
          </View>

          <Button label="Confirm" style={styles.confirm} onPress={() => { haptic.success(); onPick(draft); }} />
        </Animated.View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  center: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', paddingHorizontal: 16 },
  card: {
    borderRadius: 32, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: space.xl, paddingTop: space.xl, paddingBottom: space.xl,
    shadowColor: '#000', shadowOpacity: 0.28, shadowRadius: 30, shadowOffset: { width: 0, height: 14 }, elevation: 20,
  },
  sheen: { position: 'absolute', top: 0, left: 0, right: 0, height: 140 },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  title: { fontFamily: font.bold, fontSize: 24, lineHeight: 30, letterSpacing: -0.5 },
  sub: { fontFamily: font.regular, fontSize: 13, lineHeight: 18, marginTop: 2 },
  today: { height: 32, paddingHorizontal: 14, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.12)', marginTop: 2 },
  todayText: { color: '#F5F5F7', fontFamily: font.semibold, fontSize: 13, lineHeight: 17 },
  wheels: { flexDirection: 'row', gap: 6, marginTop: space.lg, height: ROW * VISIBLE, overflow: 'hidden' },
  band: { position: 'absolute', left: 0, right: 0, height: ROW, borderRadius: 12 },
  row: { height: ROW, justifyContent: 'center', paddingHorizontal: 10 },
  rowText: { fontSize: 21, lineHeight: 27 },
  fade: { position: 'absolute', left: 0, right: 0, height: ROW * 1.2 },
  confirm: { marginTop: space.lg },
});
