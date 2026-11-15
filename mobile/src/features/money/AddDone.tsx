/**
 * The finish screen after saving income/expense (owner, 2026-11-14): an accent disc scales in, a soft ring
 * pulses out once and the check draws itself; then the transaction's details rise in one by one
 * (amount, category, date, note). "Done" closes; "Add another" starts a fresh entry.
 * Motion is eased timing only (no springs) and is skipped under Reduce motion.
 */
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, FadeInDown, useAnimatedProps, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import type { Category } from '@/data/types';
import { longDate } from '@/lib/dates';
import { group } from '@/lib/format';
import { CalendarDays, NotebookPen, type LucideIcon } from '@/ui/icons';
import { CategoryIcon } from '@/ui/Logos';
import { Button } from '@/ui/primitives';
import { Text } from '@/ui/Text';
import { useTheme } from '@/ui/theme';
import { font, SCREEN_PAD, space } from '@/ui/tokens';

const EASE = Easing.bezier(0.2, 0, 0, 1);
const DISC = 104;
const CHECK = 'M30 53 L45 68 L75 38';
const CHECK_LEN = 64;
const AnimatedPath = Animated.createAnimatedComponent(Path);

function Row({ icon: Icon, leading, label, value, index }: { icon?: LucideIcon; leading?: React.ReactNode; label: string; value: string; index: number }) {
  const p = useTheme();
  return (
    <Animated.View entering={FadeInDown.delay(380 + index * 70).duration(320).easing(EASE)} style={styles.row}>
      {leading ?? (Icon ? <View style={[styles.rowIcon, { backgroundColor: p.surface2 }]}><Icon size={18} color={p.ink2} /></View> : null)}
      <View style={{ flex: 1 }}>
        <Text variant="caption" tone="muted">{label}</Text>
        <Text variant="bodyStrong" numberOfLines={3}>{value}</Text>
      </View>
    </Animated.View>
  );
}

export function AddDone({ kind, amount, category, date, note, editing, onDone, onAnother }: {
  kind: 'debit' | 'credit'; amount: string; category: Category | null; date: string; note: string; editing: boolean;
  onDone: () => void; onAnother: () => void;
}) {
  const p = useTheme();
  const insets = useSafeAreaInsets();
  const reduce = useReducedMotion();
  const disc = useSharedValue(reduce ? 1 : 0);
  const ring = useSharedValue(reduce ? 1 : 0);
  const draw = useSharedValue(reduce ? 1 : 0);

  useEffect(() => {
    if (reduce) return;
    disc.set(withTiming(1, { duration: 360, easing: EASE }));
    ring.set(withDelay(120, withTiming(1, { duration: 900, easing: Easing.out(Easing.cubic) })));
    draw.set(withDelay(220, withTiming(1, { duration: 380, easing: EASE })));
  }, [reduce, disc, ring, draw]);

  const discStyle = useAnimatedStyle(() => ({ opacity: disc.get(), transform: [{ scale: 0.7 + 0.3 * disc.get() }] }));
  const ringStyle = useAnimatedStyle(() => ({ opacity: 0.45 * (1 - ring.get()), transform: [{ scale: 1 + 0.6 * ring.get() }] }));
  const checkProps = useAnimatedProps(() => ({ strokeDashoffset: CHECK_LEN * (1 - draw.get()) }));

  const amt = group(amount, amount.includes('.') ? 2 : 0);
  const title = editing ? 'Changes saved' : kind === 'debit' ? 'Expense saved' : 'Income added';

  return (
    <View style={[StyleSheet.absoluteFill, styles.root, { backgroundColor: p.bg, paddingTop: insets.top + space.xxxl, paddingBottom: Math.max(insets.bottom, space.lg) }]}
      accessibilityViewIsModal accessibilityLiveRegion="polite">
      <View style={styles.top}>
        <View style={styles.discWrap}>
          <Animated.View style={[styles.ring, { borderColor: p.accent }, ringStyle]} />
          <Animated.View style={[styles.disc, { backgroundColor: p.accent, shadowColor: p.accent }, discStyle]}>
            <Svg width={DISC} height={DISC} viewBox="0 0 104 104">
              <AnimatedPath d={CHECK} stroke={p.accentInk} strokeWidth={8} strokeLinecap="round" strokeLinejoin="round" fill="none"
                strokeDasharray={`${CHECK_LEN} ${CHECK_LEN}`} animatedProps={checkProps} />
            </Svg>
          </Animated.View>
        </View>
        <Animated.View entering={FadeInDown.delay(260).duration(320).easing(EASE)} style={styles.titleBox}>
          <Text variant="title" align="center" accessibilityRole="header">{title}</Text>
          <View style={styles.amountRow}>
            <Text style={[styles.amount, { color: p.ink }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>{`Rs ${amt}`}</Text>
          </View>
        </Animated.View>
      </View>

      <View style={[styles.card, { backgroundColor: p.surface, borderColor: p.border }]}>
        <Row index={0} label={kind === 'debit' ? 'Spent on' : 'Received as'} value={category?.name ?? 'Uncategorised'}
          leading={<CategoryIcon icon={category?.icon} size={36} tone="accent" />} />
        <View style={[styles.sep, { backgroundColor: p.border }]} />
        <Row index={1} icon={CalendarDays} label="Date" value={longDate(date)} />
        {note.trim() ? (
          <>
            <View style={[styles.sep, { backgroundColor: p.border }]} />
            <Row index={2} icon={NotebookPen} label="Note" value={note.trim()} />
          </>
        ) : null}
      </View>

      <View style={{ flex: 1 }} />
      <Animated.View entering={FadeInDown.delay(560).duration(320).easing(EASE)} style={styles.actions}>
        <Button label="Done" onPress={onDone} />
        {!editing ? <Button label={kind === 'debit' ? 'Add another expense' : 'Add another income'} kind="ghost" onPress={onAnother} /> : null}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { paddingHorizontal: SCREEN_PAD },
  top: { alignItems: 'center' },
  discWrap: { width: DISC, height: DISC, alignItems: 'center', justifyContent: 'center' },
  ring: { position: 'absolute', width: DISC, height: DISC, borderRadius: DISC / 2, borderWidth: 3 },
  disc: { width: DISC, height: DISC, borderRadius: DISC / 2, alignItems: 'center', justifyContent: 'center', shadowOpacity: 0.45, shadowRadius: 24, shadowOffset: { width: 0, height: 8 }, elevation: 10 },
  titleBox: { alignItems: 'center', marginTop: space.xl, gap: space.xs, alignSelf: 'stretch' },
  amountRow: { maxWidth: '100%' },
  amount: { fontFamily: font.numBold, fontSize: 40, lineHeight: 48, letterSpacing: -1, fontVariant: ['tabular-nums'] },
  card: { marginTop: space.xxl, borderRadius: 24, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: space.lg, paddingVertical: space.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md },
  rowIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  sep: { height: StyleSheet.hairlineWidth, marginLeft: 48 },
  actions: { gap: space.xs },
});

