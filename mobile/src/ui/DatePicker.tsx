/**
 * Date picker for income/expense, built from the owner's reference (`date selector ui.jpg`, 2026-11-14):
 * "Select Date" title, Month ▾ and Year ▾ dropdowns, a calendar badge with the chosen day's number, a
 * Sunday-first grid (Sundays in the accent, neighbouring months greyed, the chosen day in the accent with an
 * underline), and one Confirm button. The screen behind blurs.
 *
 * Rendered inside the screen (not a Modal) so Android can blur it: expo-blur on Android blurs a
 * `BlurTargetView`, which the screen wraps its content in and passes here as `blurTarget`. Android 11 and
 * older get a plain dim instead of blur (`dimezisBlurViewSdk31Plus`). Future days are disabled.
 */
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { glassPanel } from './GlassSheet';
import { useEffect, useState, type ComponentRef, type RefObject } from 'react';
import { BackHandler, Pressable, StyleSheet, View } from 'react-native';
import Animated, { Easing, FadeIn, FadeOut, withTiming } from 'react-native-reanimated';
import { isoLocal, todayIso } from '@/lib/dates';
import { haptic } from '@/lib/haptics';
import { ChevronDown } from './icons';
import { Button } from './primitives';
import { Text } from './Text';
import { useTheme } from './theme';
import { alpha, font, space } from './tokens';

const EASE = Easing.bezier(0.2, 0, 0, 1);
const WEEK = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const pad = (n: number) => String(n).padStart(2, '0');

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

type Mode = 'days' | 'months' | 'years';

function Dropdown({ label, open, onPress, a11y }: { label: string; open: boolean; onPress: () => void; a11y: string }) {
  const p = useTheme();
  return (
    <Pressable onPress={() => { haptic.tick(); onPress(); }} accessibilityRole="button" accessibilityLabel={a11y} accessibilityState={{ expanded: open }}
      style={({ pressed }) => [styles.dropdown, { backgroundColor: open ? p.accentSoft : p.mode === 'dark' ? 'rgba(255,255,255,0.07)' : p.surface2, opacity: pressed ? 0.85 : 1 }]}>
      <Text variant="bodyStrong" style={{ fontSize: 16 }} numberOfLines={2}>{label}</Text>
      <View style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }}><ChevronDown size={16} color={p.ink2} /></View>
    </Pressable>
  );
}

export function DatePicker({ value, onClose, onPick, blurTarget, max = todayIso() }: {
  value: string; onClose: () => void; onPick: (iso: string) => void; blurTarget: RefObject<ComponentRef<typeof View> | null>; max?: string;
}) {
  const p = useTheme();
  const [draft, setDraft] = useState(value);
  const [view, setView] = useState({ y: Number(value.slice(0, 4)), m: Number(value.slice(5, 7)) });
  const [mode, setMode] = useState<Mode>('days');
  const smoky = glassPanel(true, true);
  const accentText = p.mode === 'dark' ? p.accent : p.accentDeep;
  const faint = alpha(p.mode === 'dark' ? '#FFFFFF' : '#000000', 0.22);
  const maxY = Number(max.slice(0, 4));
  const maxM = Number(max.slice(5, 7));

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { onClose(); return true; });
    return () => sub.remove();
  }, [onClose]);

  // Whole weeks, Sunday first, including the neighbouring months' days (greyed, still tappable).
  const first = new Date(view.y, view.m - 1, 1);
  const weeks = Math.ceil((first.getDay() + new Date(view.y, view.m, 0).getDate()) / 7);
  const cells = Array.from({ length: weeks * 7 }, (_, i) => new Date(view.y, view.m - 1, 1 - first.getDay() + i));
  const years = Array.from({ length: 12 }, (_, i) => maxY - 11 + i);

  const pickDay = (d: Date) => {
    haptic.tick();
    setDraft(isoLocal(d));
    if (d.getMonth() + 1 !== view.m) setView({ y: d.getFullYear(), m: d.getMonth() + 1 });
  };

  return (
    <Animated.View entering={FadeIn.duration(220).easing(EASE)} exiting={FadeOut.duration(180).easing(EASE)} style={StyleSheet.absoluteFill}>
      <BlurView blurTarget={blurTarget} blurMethod="dimezisBlurViewSdk31Plus" intensity={p.mode === 'dark' ? 70 : 50}
        tint={p.mode === 'dark' ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
      <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: alpha('#000000', p.mode === 'dark' ? 0.35 : 0.12) }]} onPress={onClose}
        accessibilityRole="button" accessibilityLabel="Close date picker" />
      <View style={styles.center} pointerEvents="box-none">
        <Animated.View entering={rise} accessibilityViewIsModal style={[styles.card, p.mode === 'dark'
          ? { backgroundColor: smoky.backgroundColor, borderColor: smoky.borderColor, borderTopColor: smoky.borderTopColor, overflow: 'hidden', elevation: 0 }
          : { backgroundColor: p.surface, borderColor: p.border }]}>
          {p.mode === 'dark' ? <LinearGradient colors={smoky.sheen} style={styles.sheen} pointerEvents="none" /> : null}
          <View style={styles.head}>
            <View style={{ flex: 1, gap: space.md }}>
              <Text style={[styles.title, { color: p.ink }]} accessibilityRole="header">Select Date</Text>
              <View style={styles.dropdowns}>
                <Dropdown label={MONTHS[view.m - 1]} open={mode === 'months'} onPress={() => setMode(mode === 'months' ? 'days' : 'months')} a11y={`Month: ${MONTHS[view.m - 1]}. Change`} />
                <Dropdown label={String(view.y)} open={mode === 'years'} onPress={() => setMode(mode === 'years' ? 'days' : 'years')} a11y={`Year: ${view.y}. Change`} />
              </View>
            </View>
            {/* Calendar badge with the chosen day, like the reference's "01" tile. */}
            <View style={styles.badge} accessible accessibilityLabel={`Selected day ${Number(draft.slice(8))}`}>
              <View style={styles.rings}>
                <View style={[styles.ring, { backgroundColor: p.accentDeep }]} />
                <View style={[styles.ring, { backgroundColor: p.accentDeep }]} />
              </View>
              <View style={[styles.badgeBody, { backgroundColor: p.accent }]}>
                <View style={[styles.badgeTop, { backgroundColor: alpha('#000000', 0.08) }]} />
                <Text style={[styles.badgeNum, { color: p.accentInk }]}>{draft.slice(8)}</Text>
              </View>
            </View>
          </View>

          <View style={styles.body}>
            {mode === 'days' ? (
              <Animated.View key="days" entering={FadeIn.duration(180).easing(EASE)}>
                <View style={styles.weekRow}>
                  {WEEK.map((d, i) => <Text key={d} style={[styles.weekDay, { color: i === 0 ? accentText : p.ink2 }]}>{d}</Text>)}
                </View>
                <View style={styles.grid}>
                  {cells.map((d) => {
                    const iso = isoLocal(d);
                    const inMonth = d.getMonth() + 1 === view.m;
                    const off = iso > max;
                    const on = iso === draft;
                    const color = on ? accentText : !inMonth || off ? faint : d.getDay() === 0 ? accentText : p.ink;
                    return (
                      <Pressable key={iso} disabled={off} onPress={() => pickDay(d)} style={styles.cell}
                        accessibilityRole="button" accessibilityState={{ selected: on, disabled: off }} accessibilityLabel={d.toDateString()}>
                        <Text style={[styles.day, { color, fontFamily: on ? font.bold : font.semibold }]}>{pad(d.getDate())}</Text>
                        <View style={[styles.underline, { backgroundColor: on ? accentText : 'transparent' }]} />
                      </Pressable>
                    );
                  })}
                </View>
              </Animated.View>
            ) : mode === 'months' ? (
              <Animated.View key="months" entering={FadeIn.duration(180).easing(EASE)} style={styles.pickGrid}>
                {MONTHS.map((name, i) => {
                  const disabled = view.y === maxY && i + 1 > maxM;
                  const on = i + 1 === view.m;
                  return (
                    <Pressable key={name} disabled={disabled} onPress={() => { haptic.tick(); setView({ y: view.y, m: i + 1 }); setMode('days'); }}
                      accessibilityRole="button" accessibilityState={{ selected: on, disabled }} accessibilityLabel={name}
                      style={({ pressed }) => [styles.pickCell, { backgroundColor: on ? p.accent : pressed ? p.surface2 : 'transparent', opacity: disabled ? 0.3 : 1 }]}>
                      <Text variant="bodyStrong" style={{ color: on ? p.accentInk : p.ink }}>{name.slice(0, 3)}</Text>
                    </Pressable>
                  );
                })}
              </Animated.View>
            ) : (
              <Animated.View key="years" entering={FadeIn.duration(180).easing(EASE)} style={styles.pickGrid}>
                {years.map((y) => {
                  const on = y === view.y;
                  return (
                    <Pressable key={y} onPress={() => { haptic.tick(); setView({ y, m: y === maxY ? Math.min(view.m, maxM) : view.m }); setMode('days'); }}
                      accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={String(y)}
                      style={({ pressed }) => [styles.pickCell, { backgroundColor: on ? p.accent : pressed ? p.surface2 : 'transparent' }]}>
                      <Text variant="bodyStrong" style={{ color: on ? p.accentInk : p.ink, fontFamily: font.num }}>{y}</Text>
                    </Pressable>
                  );
                })}
              </Animated.View>
            )}
          </View>

          <View style={styles.footer}>
            <Button label="Confirm" style={styles.confirm} onPress={() => onPick(draft)} />
          </View>
        </Animated.View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  center: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', paddingHorizontal: 16 },
  card: {
    borderRadius: 32, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: space.xl, paddingTop: space.xxl, paddingBottom: space.xl,
    shadowColor: '#000', shadowOpacity: 0.28, shadowRadius: 30, shadowOffset: { width: 0, height: 14 }, elevation: 20,
  },
  sheen: { position: 'absolute', top: 0, left: 0, right: 0, height: 140 },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  title: { fontFamily: font.bold, fontSize: 28, lineHeight: 34, letterSpacing: -0.6 },
  dropdowns: { flexDirection: 'row', gap: space.sm },
  dropdown: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 46, paddingHorizontal: 14, borderRadius: 14 },
  badge: { width: 74, alignItems: 'center', marginTop: 6 },
  rings: { flexDirection: 'row', justifyContent: 'space-between', width: 46, height: 10, zIndex: 1, marginBottom: -5 },
  ring: { width: 7, height: 12, borderRadius: 4 },
  badgeBody: { width: 74, height: 70, borderRadius: 16, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  badgeTop: { position: 'absolute', top: 0, left: 0, right: 0, height: 35 },
  badgeNum: { fontFamily: font.numBold, fontSize: 36, lineHeight: 42, letterSpacing: -1 },
  body: { marginTop: space.xl, minHeight: 290 },
  weekRow: { flexDirection: 'row', marginBottom: 6 },
  weekDay: { width: `${100 / 7}%`, textAlign: 'center', fontFamily: font.semibold, fontSize: 12, letterSpacing: 0.3 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, height: 44, alignItems: 'center', justifyContent: 'center' },
  day: { fontSize: 15, fontVariant: ['tabular-nums'] },
  underline: { width: 18, height: 2.5, borderRadius: 2, marginTop: 3 },
  pickGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingTop: space.sm },
  pickCell: { width: '33.333%', height: 58, alignItems: 'center', justifyContent: 'center', borderRadius: 16 },
  footer: { alignItems: 'center', marginTop: space.md },
  confirm: { minWidth: 200 },
});
