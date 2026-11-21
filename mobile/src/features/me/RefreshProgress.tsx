/**
 * "Refresh my prices" in progress (owner, 2026-11-22: "ticks or a circular, formal animation; less text, to the point;
 * don't say what refused"). A ring fills as the four steps finish; each step shows a turning arc while it runs and a
 * tick when done (amber when only part came back). Calm timing curves, no springs; reduced motion = no spinning.
 */
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, cancelAnimation, useAnimatedProps, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';
import type { RefreshEvent } from '@/lib/refreshPrices';
import { GLASS_INK, GLASS_INK2 } from '@/ui/BlackGlass';
import { Check } from '@/ui/icons';
import { Text } from '@/ui/Text';
import { dark, font, space } from '@/ui/tokens';

type State = 'wait' | 'run' | 'ok' | 'part' | 'skip';
type Step = { state: State; value?: string };
export type Progress = { holdings: Step; stocks: Step; funds: Step; save: Step; total: { psx: number; funds: number } };
const KEYS = ['holdings', 'stocks', 'funds', 'save'] as const;
const LABEL: Record<(typeof KEYS)[number], string> = { holdings: 'Holdings', stocks: 'Stocks', funds: 'Funds', save: 'Saving' };

export const startProgress = (): Progress => ({
  holdings: { state: 'run' }, stocks: { state: 'wait' }, funds: { state: 'wait' }, save: { state: 'wait' }, total: { psx: 0, funds: 0 },
});

/** One server event → the next progress state. */
export function nextProgress(p: Progress, e: RefreshEvent): Progress {
  switch (e.type) {
    case 'holdings':
      return {
        ...p, total: { psx: e.psx.length, funds: e.funds.length },
        holdings: { state: 'ok', value: String(e.psx.length + e.funds.length) },
        stocks: e.psx.length ? { state: 'run' } : { state: 'skip' },
        funds: e.funds.length ? { state: 'run' } : { state: 'skip' },
      };
    case 'source':
      if (e.source !== 'psx') return p;
      return { ...p, stocks: { state: (e.ok ?? 0) === (e.requested ?? 0) ? 'ok' : 'part', value: `${e.ok ?? 0}/${e.requested ?? 0}` } };
    case 'saving': {
      const done = (s: Step, n: number, total: number): Step => (s.state === 'run' ? { state: n === total ? 'ok' : 'part', value: `${n}/${total}` } : s);
      return { ...p, stocks: done(p.stocks, e.psx, p.total.psx), funds: done(p.funds, e.funds, p.total.funds), save: { state: 'run' } };
    }
    case 'done':
      return { ...p, save: { state: 'ok' } };
    default:
      return p;
  }
}

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const RING = 76; const STROKE = 5; const R = (RING - STROKE) / 2; const C = 2 * Math.PI * R;

export function RefreshProgress({ progress, error }: { progress: Progress; error?: string | null }) {
  const finished = KEYS.filter((k) => ['ok', 'part', 'skip'].includes(progress[k].state)).length;
  const share = useSharedValue(0);
  useEffect(() => { share.value = withTiming(finished / KEYS.length, { duration: 420, easing: Easing.out(Easing.cubic) }); }, [finished, share]);
  const arc = useAnimatedProps(() => ({ strokeDashoffset: C * (1 - share.value) }));
  const complete = finished === KEYS.length;

  return (
    <View accessibilityLiveRegion="polite">
      <View style={styles.ringWrap} accessible accessibilityLabel={complete ? 'Prices refreshed' : `Refreshing, step ${Math.min(finished + 1, 4)} of 4`}>
        <Svg width={RING} height={RING}>
          <Circle cx={RING / 2} cy={RING / 2} r={R} stroke="rgba(255,255,255,0.10)" strokeWidth={STROKE} fill="none" />
          <AnimatedCircle cx={RING / 2} cy={RING / 2} r={R} stroke={error ? dark.neg : dark.pos} strokeWidth={STROKE} fill="none"
            strokeDasharray={`${C} ${C}`} animatedProps={arc} strokeLinecap="round" transform={`rotate(-90 ${RING / 2} ${RING / 2})`} />
        </Svg>
        <View style={styles.ringCenter}>
          {complete ? <Tick size={30} color={dark.pos} /> : <Text style={styles.ringText}>{finished}/{KEYS.length}</Text>}
        </View>
      </View>

      <View style={styles.steps}>
        {KEYS.map((k) => (
          <View key={k} style={styles.step} accessible accessibilityLabel={`${LABEL[k]}: ${progress[k].state === 'run' ? 'in progress' : progress[k].state === 'wait' ? 'waiting' : 'done'}${progress[k].value ? `, ${progress[k].value}` : ''}`}>
            <Dot state={progress[k].state} />
            <Text style={[styles.label, progress[k].state === 'wait' && { color: GLASS_INK2 }]}>{LABEL[k]}</Text>
            <Text style={[styles.value, progress[k].state === 'part' && { color: dark.warn }]}>{progress[k].value ?? ''}</Text>
          </View>
        ))}
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

/** A tick that fades and grows in once (timing, no spring). */
function Tick({ size, color }: { size: number; color: string }) {
  const v = useSharedValue(0);
  useEffect(() => { v.value = withTiming(1, { duration: 260, easing: Easing.out(Easing.cubic) }); }, [v]);
  const style = useAnimatedStyle(() => ({ opacity: v.value, transform: [{ scale: 0.6 + 0.4 * v.value }] }));
  return <Animated.View style={style}><Check size={size} color={color} strokeWidth={3} /></Animated.View>;
}

function Dot({ state }: { state: State }) {
  const reduce = useReducedMotion();
  const turn = useSharedValue(0);
  useEffect(() => {
    if (state === 'run' && !reduce) turn.value = withRepeat(withTiming(1, { duration: 900, easing: Easing.linear }), -1, false);
    else { cancelAnimation(turn); turn.value = 0; }
  }, [state, reduce, turn]);
  const spin = useAnimatedStyle(() => ({ transform: [{ rotate: `${turn.value * 360}deg` }] }));

  if (state === 'ok' || state === 'part') {
    const c = state === 'ok' ? dark.pos : dark.warn;
    return <View style={[styles.dot, { backgroundColor: c }]}><Tick size={12} color="#000" /></View>;
  }
  if (state === 'run') {
    return (
      <Animated.View style={[styles.dotBox, spin]}>
        <Svg width={20} height={20}>
          <Circle cx={10} cy={10} r={8} stroke="rgba(255,255,255,0.14)" strokeWidth={2} fill="none" />
          <Circle cx={10} cy={10} r={8} stroke={GLASS_INK} strokeWidth={2} fill="none" strokeDasharray={`${Math.PI * 4} ${Math.PI * 16}`} strokeLinecap="round" />
        </Svg>
      </Animated.View>
    );
  }
  if (state === 'skip') return <View style={[styles.dotBox, styles.center]}><View style={styles.dash} /></View>;
  return <View style={[styles.dotBox, styles.ring]} />;
}

const styles = StyleSheet.create({
  ringWrap: { alignSelf: 'center', width: RING, height: RING, marginTop: space.sm, marginBottom: space.lg },
  ringCenter: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  ringText: { color: GLASS_INK, fontFamily: font.num, fontSize: 16, fontVariant: ['tabular-nums'] },
  steps: { borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.045)', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.10)', paddingHorizontal: 14, paddingVertical: 4 },
  step: { flexDirection: 'row', alignItems: 'center', gap: 12, height: 46 },
  label: { flex: 1, color: GLASS_INK, fontFamily: font.medium, fontSize: 14.5 },
  value: { color: GLASS_INK2, fontFamily: font.num, fontSize: 14, fontVariant: ['tabular-nums'] },
  dot: { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  dotBox: { width: 20, height: 20 },
  ring: { borderRadius: 10, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.18)' },
  center: { alignItems: 'center', justifyContent: 'center' },
  dash: { width: 9, height: 2, borderRadius: 1, backgroundColor: 'rgba(255,255,255,0.3)' },
  error: { color: dark.neg, fontFamily: font.medium, fontSize: 13, textAlign: 'center', marginTop: space.md },
});
