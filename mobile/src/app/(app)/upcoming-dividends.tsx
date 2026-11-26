import { router } from 'expo-router';
import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { Easing, cancelAnimation, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { checkSummary, describeUpcoming, useCheckDividendsNow, useUpcoming } from '@/data/upcoming';
import { shortDate } from '@/lib/dates';
import { compactNumber, group } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { BlackGlass, GLASS_INK, GLASS_INK2, GLASS_LINE } from '@/ui/BlackGlass';
import { EmptyState, Skeleton, toast } from '@/ui/feedback';
import { useHidden } from '@/ui/Figures';
import { ChevronRight, RefreshCw } from '@/ui/icons';
import { StockLogo } from '@/ui/Logos';
import { Gap } from '@/ui/primitives';
import { Screen } from '@/ui/Screen';
import { Text } from '@/ui/Text';
import { dark, font, space } from '@/ui/tokens';

/**
 * Upcoming dividends (owner, 2026-11-22): cash dividends PSX announced on stocks you hold, found every night or with
 * Check now. What you can expect after tax, and each one's next step; tap one to approve it when the money arrives.
 */
export default function UpcomingDividends() {
  const hidden = useHidden();
  const list = useUpcoming();
  const check = useCheckDividendsNow();
  const rows = list.data ?? [];
  const views = rows.map((u) => ({ u, d: describeUpcoming(u) }));
  const total = views.reduce((s, x) => s + x.d.net, 0);
  const rs = (v: number) => (hidden ? '••••' : `Rs ${Math.abs(v) >= 1e7 ? compactNumber(v) : group(v, 2)}`);

  const checkNow = () => {
    haptic.tick();
    check.mutate(undefined, {
      onSuccess: (r) => {
        const s = checkSummary(r);
        toast(s.text, { title: s.title, tone: s.tone });
      },
      onError: () => toast('Try again shortly', { title: 'Check did not finish', tone: 'error' }),
    });
  };

  return (
    <Screen back title="Upcoming dividends" right={<CheckButton busy={check.isPending} onPress={checkNow} />}>
      {list.isLoading && !list.data ? (
        <><Skeleton height={110} radius={22} /><Gap h={space.md} /><Skeleton height={220} radius={22} /></>
      ) : !rows.length ? (
        <EmptyState title="No upcoming dividends" body="PSX is checked every night for the stocks you hold." />
      ) : (
        <>
          <BlackGlass style={styles.summary}>
            <Text style={styles.small}>Expected after tax</Text>
            <Text style={styles.total} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{rs(total)}</Text>
            <Text style={styles.small}>{rows.length} dividend{rows.length === 1 ? '' : 's'}</Text>
          </BlackGlass>
          <Gap h={space.md} />
          <BlackGlass style={styles.list}>
            {views.map(({ u, d }, i) => {
              const tint = d.stage === 'due' ? dark.warn : d.stage === 'entitled' ? dark.pos : GLASS_INK2;
              const next = d.stage === 'hold' ? `Hold till ${shortDate(u.announcement.last_cum_date)}`
                : d.stage === 'due' ? 'Arrived? Approve' : `Due by ${shortDate(u.announcement.expected_pay_by ?? u.announcement.book_closure_from)}`;
              return (
                <Pressable key={u.id} onPress={() => router.push({ pathname: '/upcoming-dividend/[id]', params: { id: u.id } })}
                  accessibilityRole="button" accessibilityLabel={`${u.symbol}, ${d.title}, ${rs(d.net)}, ${next}. Open`}
                  style={({ pressed }) => [styles.row, i > 0 && styles.rowSep, { opacity: pressed ? 0.75 : 1 }]}>
                  <StockLogo symbol={u.symbol} size={38} />
                  <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                    <Text style={styles.name} numberOfLines={1}>{u.symbol} <Text style={styles.small}>{d.title.replace(/ dividend$/, '')}</Text></Text>
                    <Text style={[styles.small, { color: tint }]} numberOfLines={1}>{next}</Text>
                  </View>
                  <Text style={styles.net}>{rs(d.net)}</Text>
                  <ChevronRight size={16} color={GLASS_INK2} />
                </Pressable>
              );
            })}
          </BlackGlass>
        </>
      )}
    </Screen>
  );
}

/** Check now: the refresh icon turns while PSX is being checked. */
function CheckButton({ busy, onPress }: { busy: boolean; onPress: () => void }) {
  const reduce = useReducedMotion();
  const turn = useSharedValue(0);
  useEffect(() => {
    if (busy && !reduce) turn.value = withRepeat(withTiming(1, { duration: 900, easing: Easing.linear }), -1, false);
    else { cancelAnimation(turn); turn.value = 0; }
  }, [busy, reduce, turn]);
  const spin = useAnimatedStyle(() => ({ transform: [{ rotate: `${turn.value * 360}deg` }] }));
  return (
    <Pressable onPress={onPress} disabled={busy} hitSlop={8} accessibilityRole="button" accessibilityLabel={busy ? 'Checking PSX' : 'Check PSX now'}
      accessibilityState={{ busy }} style={styles.checkBtn}>
      <Animated.View style={spin}><RefreshCw size={18} color={GLASS_INK} strokeWidth={2.2} /></Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  summary: { paddingVertical: space.lg, gap: 2 },
  total: { color: dark.pos, fontFamily: font.numHeavy, fontSize: 30, lineHeight: 36, letterSpacing: -0.6 },
  small: { color: GLASS_INK2, fontFamily: font.regular, fontSize: 12.5 },
  list: { paddingVertical: space.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 66, paddingVertical: space.sm },
  rowSep: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: GLASS_LINE },
  name: { color: GLASS_INK, fontFamily: font.semibold, fontSize: 15 },
  net: { color: GLASS_INK, fontFamily: font.num, fontSize: 15, fontVariant: ['tabular-nums'] },
  checkBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.10)' },
});
