/**
 * Figures: the hero (one per screen), supporting stats (≤ 3), and the change line. All respect the
 * privacy mask; the hero counts up only when its value actually changed and never under Reduce motion.
 */
import { Eye, EyeOff } from '@/ui/icons';
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, View } from 'react-native';
import { autoDecimals, delta, money, tone as toneOf } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { useApp } from '@/lib/store';
import { Pill } from './primitives';
import { Text, type Variant } from './Text';
import { useTheme } from './theme';
import { space } from './tokens';

export const useHidden = () => useApp((s) => s.hideAmounts);

let reduceMotion = false;
AccessibilityInfo.isReduceMotionEnabled().then((v) => { reduceMotion = v; }).catch(() => {});
AccessibilityInfo.addEventListener?.('reduceMotionChanged', (v) => { reduceMotion = v; });

/** Animates from the previous value to the new one in 450 ms (ease-out); the first paint is immediate. */
function useCountUp(target: number | null) {
  const [shown, setShown] = useState(target);
  const prev = useRef(target);
  useEffect(() => {
    const from = prev.current;
    prev.current = target;
    if (target === null || from === null || from === target || reduceMotion) { setShown(target); return; }
    let raf = 0;
    const t0 = Date.now();
    const step = () => {
      const k = Math.min(1, (Date.now() - t0) / 450);
      const e = 1 - (1 - k) ** 3;
      setShown(k >= 1 ? target : from + (target - from) * e);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target]);
  return shown;
}

export function Money({ value, variant = 'num', tone, sign, decimals, animate = false, compact }: {
  value: number | null | undefined; variant?: Variant; tone?: 'auto' | 'ink' | 'ink2' | 'muted'; sign?: boolean; decimals?: number; animate?: boolean; compact?: boolean;
}) {
  const hidden = useHidden();
  const counted = useCountUp(animate ? value ?? null : null);
  const v = animate ? counted : value;
  const t = tone === 'auto' ? toneOf(value) : tone ?? 'ink';
  // Decimals follow the target value, so a count-up doesn't flicker between 0 and 2 decimals.
  const text = value === null || value === undefined ? '—' : money(v, { hidden, sign, decimals: decimals ?? autoDecimals(value), compact });
  return (
    <Text variant={variant} tone={t} style={{ fontVariant: ['tabular-nums'] }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}
      accessibilityLabel={hidden ? 'Amount hidden' : text}>
      {text}
    </Text>
  );
}

/** "+Rs 3,420 · +0.27%" in a tinted pill, or "flat" (plan §5). */
export function Delta({ amount, percent, suffix }: { amount: number | null | undefined; percent?: number | null; suffix?: string }) {
  const hidden = useHidden();
  if (amount === null || amount === undefined) return null;
  const t = toneOf(amount);
  const text = t === 'flat' ? `No change${suffix ? ` ${suffix}` : ''}` : `${delta(amount, percent ?? null, { hidden })}${suffix ? ` ${suffix}` : ''}`;
  return <Pill text={text} tone={t} />;
}

/** The one big number on a screen. Tap = details; the eye toggles the privacy mask (long-press too). */
export function HeroFigure({ label, value, caption, onPress, children }: {
  label: string; value: number | null | undefined; caption?: string | null; onPress?: () => void; children?: React.ReactNode;
}) {
  const p = useTheme();
  const hidden = useHidden();
  const toggle = () => { haptic.tick(); useApp.getState().set({ hideAmounts: !hidden }); };
  return (
    <View style={styles.hero}>
      <View style={styles.heroLabelRow}>
        <Text variant="label" tone="ink2">{label}</Text>
        <Pressable onPress={toggle} hitSlop={14} accessibilityRole="button" accessibilityLabel={hidden ? 'Show amounts' : 'Hide amounts'}>
          {hidden ? <EyeOff size={16} color={p.muted} /> : <Eye size={16} color={p.muted} />}
        </Pressable>
      </View>
      <Pressable onPress={onPress} onLongPress={toggle} accessibilityRole={onPress ? 'button' : 'text'} accessibilityHint={onPress ? 'Shows how this is calculated' : undefined}>
        <Money value={value} variant="hero" animate />
      </Pressable>
      {children ? <View style={styles.heroBelow}>{children}</View> : null}
      {caption ? <Text variant="caption" tone="muted" style={{ marginTop: space.sm }}>{caption}</Text> : null}
    </View>
  );
}

export type Stat = { label: string; value: number | null | undefined; tone?: 'auto' | 'ink'; sign?: boolean; sub?: string | null; onPress?: () => void; /** Non-money figure (units, shares). */ text?: string };

/** Up to three supporting figures in a row (the figure budget). */
export function StatRow({ stats }: { stats: Stat[] }) {
  const p = useTheme();
  return (
    <View style={[styles.statRow, { borderColor: p.border, backgroundColor: p.surface }]}>
      {stats.slice(0, 3).map((s, i) => (
        <Pressable key={s.label} onPress={s.onPress} disabled={!s.onPress} accessibilityRole={s.onPress ? 'button' : undefined}
          style={({ pressed }) => [styles.stat, i > 0 && { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: p.border }, { opacity: pressed ? 0.7 : 1 }]}>
          <Text variant="caption" tone="ink2" numberOfLines={1}>{s.label}</Text>
          {s.text !== undefined
            ? <Text variant="numLarge" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{s.text}</Text>
            : <Money value={s.value} variant="numLarge" tone={s.tone ?? 'ink'} sign={s.sign} />}
          {s.sub ? <Text variant="caption" tone="muted" numberOfLines={1}>{s.sub}</Text> : null}
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { paddingTop: space.sm, paddingBottom: space.lg },
  heroLabelRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginBottom: 2 },
  heroBelow: { marginTop: space.sm, flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' },
  statRow: { flexDirection: 'row', borderRadius: 20, borderWidth: StyleSheet.hairlineWidth, paddingVertical: space.lg },
  stat: { flex: 1, paddingHorizontal: space.md, gap: 4, minHeight: 48 },
});
