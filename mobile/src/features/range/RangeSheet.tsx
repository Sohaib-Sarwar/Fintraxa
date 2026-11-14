/**
 * Period sheet (owner, 2026-11-14): opened by the FY button on any money page. The screen blurs (nav included)
 * and a minimal sheet glides up: the web's presets as glass tiles (This / Last fiscal year, YTD, MTD, Last
 * month, Last 3 / 6 months, All time) — a tap applies and closes — and "Custom range", which swaps the tiles for
 * a range calendar in the style of the owner's date-picker reference (Sunday first, Sundays in the accent, the
 * ends as solid circles joined by one continuous band with pill caps at week edges — the web's RangeFilter look)
 * and an Apply button. Eased motion, no bounce; the
 * sheet follows the finger (`SheetFrame`).
 * Drawn by the tabs layout inside its `BlurTargetView` setup, like the card picker.
 */
import { LinearGradient } from 'expo-linear-gradient';
import { glassPanel } from '@/ui/GlassSheet';
import { useEffect, useState, type ComponentRef, type RefObject } from 'react';
import { BackHandler, Pressable, StyleSheet, View } from 'react-native';
import Animated, { Easing, FadeIn } from 'react-native-reanimated';
import { SheetFrame } from '@/ui/SheetFrame';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { addMonths, isoLocal, todayIso } from '@/lib/dates';
import { haptic } from '@/lib/haptics';
import { presets, type Range, type RangeChoice } from '@/lib/range';
import { CalendarDays, ChevronLeft, ChevronRight } from '@/ui/icons';
import { Button } from '@/ui/primitives';
import { Text } from '@/ui/Text';
import { useTheme } from '@/ui/theme';
import { alpha, font, SCREEN_PAD, space } from '@/ui/tokens';
import { usePeriod, usePeriodSheet } from './usePeriod';

const EASE = Easing.bezier(0.2, 0, 0, 1); // content cross-fades
const WEEK = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const short = (iso: string) => `${Number(iso.slice(8))} ${MON[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;
/** Concise names on the pills (owner, 2026-11-15: no explanations under them). */
const PILL: Record<string, (x: { short: string }) => string> = {
  fy: (x) => x.short, lfy: (x) => x.short, ytd: () => 'YTD', mtd: () => 'MTD', lm: () => 'Last month', l3: () => '3 months', l6: () => '6 months', all: () => 'All time',
};

function RangeCalendar({ start, end, onPick }: { start: string | null; end: string | null; onPick: (iso: string) => void }) {
  const p = useTheme();
  const today = todayIso();
  const dark = p.mode === 'dark';
  const [month, setMonth] = useState((end ?? start ?? today).slice(0, 7));
  const [y, m] = month.split('-').map(Number);
  const first = new Date(y, m - 1, 1);
  const weeks = Math.ceil((first.getDay() + new Date(y, m, 0).getDate()) / 7);
  const cells = Array.from({ length: weeks * 7 }, (_, i) => new Date(y, m - 1, 1 - first.getDay() + i));
  const accentText = p.mode === 'dark' ? p.accent : p.accentDeep;
  const canNext = month < today.slice(0, 7);
  return (
    <View>
      <View style={styles.calHead}>
        <Pressable onPress={() => { haptic.tick(); setMonth(addMonths(month, -1)); }} hitSlop={10} accessibilityRole="button" accessibilityLabel="Previous month" style={styles.calNav}>
          <ChevronLeft size={20} color={p.ink} />
        </Pressable>
        <Text variant="bodyStrong">{MONTHS[m - 1]} {y}</Text>
        <Pressable onPress={() => { if (canNext) { haptic.tick(); setMonth(addMonths(month, 1)); } }} hitSlop={10} accessibilityRole="button" accessibilityLabel="Next month"
          style={[styles.calNav, { opacity: canNext ? 1 : 0.3 }]}>
          <ChevronRight size={20} color={p.ink} />
        </Pressable>
      </View>
      <View style={styles.week}>{WEEK.map((d, i) => <Text key={i} style={[styles.weekDay, { color: i === 0 ? accentText : p.muted }]}>{d}</Text>)}</View>
      <View style={styles.grid}>
        {cells.map((d, i) => {
          const iso = isoLocal(d);
          // Like the web (RangeFilter.jsx): only this month's days are drawn; others are blank.
          if (d.getMonth() + 1 !== m) return <View key={iso} style={styles.cell} />;
          const off = iso > today;
          const col = i % 7;
          const isS = iso === start;
          const isE = iso === end;
          const edge = isS || isE;
          const inR = !!start && !!end && iso >= start && iso <= end;
          const rowStart = col === 0 || d.getDate() === 1;
          const rowEnd = col === 6 || d.getDate() === new Date(y, m, 0).getDate();
          const isToday = iso === today;
          return (
            <Pressable key={iso} disabled={off} onPress={() => { haptic.tick(); onPick(iso); }} style={styles.cell}
              accessibilityRole="button" accessibilityState={{ selected: edge, disabled: off }} accessibilityLabel={d.toDateString()}>
              {/* The web's range: one continuous band behind the days, from the start's centre to the end's centre,
                  with pill caps where it begins or ends a week row; the two ends are solid circles. */}
              {inR && !(isS && isE) ? (
                <View style={[styles.band, { backgroundColor: p.surface3 },
                  isS && { left: '50%' }, isE && { right: '50%' },
                  rowStart && !isS && styles.capLeft, rowEnd && !isE && styles.capRight]} />
              ) : null}
              <View style={[styles.day, edge ? { backgroundColor: p.ink } : isToday ? { borderWidth: 1.5, borderColor: dark ? p.accent : p.accentDeep } : null]}>
                <Text style={[styles.dayText, {
                  color: edge ? p.bg : off ? alpha(dark ? '#FFFFFF' : '#000000', 0.28) : p.ink,
                  fontFamily: edge ? font.bold : font.medium,
                }]}>{d.getDate()}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** The app-wide period by default; a page with its own period passes `range`, `onChoose` and `onClose`. */
export function RangeSheet({ blurTarget, range: ownRange, onChoose, onClose }: {
  blurTarget: RefObject<ComponentRef<typeof View> | null>; range?: Range; onChoose?: (c: RangeChoice) => void; onClose?: () => void;
}) {
  const p = useTheme();
  const insets = useSafeAreaInsets();
  const hideGlobal = usePeriodSheet((s) => s.hide);
  const global = usePeriod();
  const range = ownRange ?? global.range;
  const set = onChoose ?? global.set;
  const hide = onClose ?? hideGlobal;
  const [custom, setCustom] = useState(range.id === 'custom');
  const [start, setStart] = useState<string | null>(range.id === 'custom' ? range.start : null);
  const [end, setEnd] = useState<string | null>(range.id === 'custom' ? range.end : null);
  const dark = p.mode === 'dark';
  const glass = glassPanel(dark, true);
  const list = presets();

  useEffect(() => {
    // Back from the custom calendar returns to the presets; otherwise the frame closes the sheet smoothly.
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { if (custom) { setCustom(false); return true; } return false; });
    return () => sub.remove();
  }, [custom]);

  const pickDay = (iso: string) => {
    if (!start || end) { setStart(iso); setEnd(null); return; }
    if (iso < start) { setStart(iso); return; }
    setEnd(iso);
  };
  const choose = (id: (typeof list)[number]['id'], close: () => void) => { haptic.success(); set({ id }); close(); };
  const apply = (close: () => void) => { if (start && end) { haptic.success(); set({ id: 'custom', start, end }); close(); } };

  return (
    <SheetFrame blurTarget={blurTarget} intensity={dark ? 70 : 45} scrim={dark ? 0.45 : 0.12} onClose={hide} dragWholePanel
      panelStyle={[styles.sheet, { backgroundColor: glass.backgroundColor, borderColor: glass.borderColor, borderTopColor: glass.borderTopColor,
        paddingBottom: Math.max(insets.bottom, space.lg) + space.sm }]}
      decor={<LinearGradient colors={glass.sheen} style={styles.sheen} pointerEvents="none" />}
      handle={<View style={[styles.handle, { backgroundColor: dark ? 'rgba(255,255,255,0.28)' : 'rgba(0,0,0,0.18)' }]} />}>
      {(close) => (<>
        <View style={styles.head}>
          {custom ? (
            <Pressable onPress={() => setCustom(false)} hitSlop={10} accessibilityRole="button" accessibilityLabel="Back to presets" style={styles.back}>
              <ChevronLeft size={20} color={p.ink} />
            </Pressable>
          ) : null}
          <Text style={[styles.title, { color: p.ink }]} accessibilityRole="header">{custom ? 'Custom range' : 'Period'}</Text>
        </View>

        {!custom ? (
          <Animated.View key="presets" entering={FadeIn.duration(180).easing(EASE)}>
            <View style={styles.tiles}>
              {list.map((x) => {
                const on = range.id === x.id;
                return (
                  <Pressable key={x.id} onPress={() => choose(x.id, close)} accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel={`${x.label}, ${x.sub}`}
                    style={({ pressed }) => [styles.pill, on ? { backgroundColor: p.accentOnDark, borderColor: p.accentOnDark } : { backgroundColor: glass.tile, borderColor: glass.tileBorder },
                      { opacity: pressed ? 0.8 : 1 }]}>
                    <Text style={[styles.pillText, { color: on ? p.accentOnDarkInk : p.ink }]} numberOfLines={1}>{(PILL[x.id] ?? ((y) => y.short))(x)}</Text>
                  </Pressable>
                );
              })}
            </View>
            <Pressable onPress={() => { haptic.tick(); setCustom(true); }} accessibilityRole="button" accessibilityLabel="Custom range"
              style={({ pressed }) => [styles.pill, styles.customPill, range.id === 'custom' ? { backgroundColor: p.accentOnDark, borderColor: p.accentOnDark } : { backgroundColor: 'transparent', borderColor: glass.tileBorder },
                { opacity: pressed ? 0.8 : 1 }]}>
              <CalendarDays size={16} color={range.id === 'custom' ? p.accentOnDarkInk : p.ink2} />
              <Text style={[styles.pillText, { color: range.id === 'custom' ? p.accentOnDarkInk : p.ink }]} numberOfLines={1}>
                {range.id === 'custom' ? `${short(range.start)} – ${short(range.end)}` : 'Custom'}
              </Text>
            </Pressable>
          </Animated.View>
        ) : (
          <Animated.View key="custom" entering={FadeIn.duration(180).easing(EASE)}>
            <View style={styles.ends}>
              {[{ k: 'From', v: start }, { k: 'To', v: end }].map((e) => (
                <View key={e.k} style={[styles.end, { backgroundColor: glass.tile, borderColor: glass.tileBorder }]}>
                  <Text variant="caption" tone="muted">{e.k}</Text>
                  <Text style={[styles.endText, { color: e.v ? p.ink : p.muted }]} numberOfLines={1}>{e.v ? short(e.v) : 'Select'}</Text>
                </View>
              ))}
            </View>
            <RangeCalendar start={start} end={end} onPick={pickDay} />
<View style={{ height: space.md }} />
            <Button label="Apply" onPress={() => apply(close)} disabled={!start || !end} />
          </Animated.View>
        )}
      </>)}
    </SheetFrame>
  );
}

const styles = StyleSheet.create({
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, borderTopLeftRadius: 30, borderTopRightRadius: 30, borderWidth: 1,
    paddingHorizontal: SCREEN_PAD, paddingTop: 10, overflow: 'hidden' },
  sheen: { position: 'absolute', top: 0, left: 0, right: 0, height: 120 },
  handle: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, marginBottom: space.md },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginBottom: space.lg },
  back: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', marginLeft: -6 },
  title: { fontFamily: font.bold, fontSize: 22, letterSpacing: -0.4 },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  pill: { width: '48.5%', flexGrow: 1, height: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: space.md, borderRadius: 23, borderWidth: 1 },
  pillText: { fontFamily: font.semibold, fontSize: 14, letterSpacing: -0.1 },
  customPill: { width: '100%', marginTop: space.sm },
  ends: { flexDirection: 'row', gap: space.sm, marginBottom: space.md },
  end: { flex: 1, paddingHorizontal: space.md, paddingVertical: 10, borderRadius: 14, borderWidth: 1, gap: 2 },
  endText: { fontFamily: font.num, fontSize: 15 },
  calHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.sm },
  calNav: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  week: { flexDirection: 'row' },
  weekDay: { width: `${100 / 7}%`, textAlign: 'center', fontFamily: font.semibold, fontSize: 12, paddingVertical: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, height: 42, alignItems: 'center', justifyContent: 'center' },
  day: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  band: { position: 'absolute', top: 4, bottom: 4, left: 0, right: 0 },
  capLeft: { borderTopLeftRadius: 17, borderBottomLeftRadius: 17 },
  capRight: { borderTopRightRadius: 17, borderBottomRightRadius: 17 },
  dayText: { fontSize: 14, fontVariant: ['tabular-nums'] },
});
