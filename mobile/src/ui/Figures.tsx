/**
 * Figures: the hero (one per screen), supporting stats (≤ 3), and the change line. All respect the
 * privacy mask; the hero counts up only when its value actually changed and never under Reduce motion.
 */
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, View, type TextStyle } from 'react-native';
import { autoDecimals, compactNumber, delta, group, isLong, MASK, money, tone as toneOf } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { useApp } from '@/lib/store';
import { Pill } from './primitives';
import { Text, type Variant } from './Text';
import { useTheme } from './theme';
import { font, space } from './tokens';

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

export function Money({ value, variant = 'num', tone, sign, decimals, animate = false, compact, color }: {
  value: number | null | undefined; variant?: Variant; tone?: 'auto' | 'ink' | 'ink2' | 'muted'; sign?: boolean; decimals?: number; animate?: boolean; compact?: boolean;
  /** Explicit colour (e.g. on the gradient hero card). */
  color?: string;
}) {
  const hidden = useHidden();
  const counted = useCountUp(animate ? value ?? null : null);
  const v = animate ? counted : value;
  const t = tone === 'auto' ? toneOf(value) : tone ?? 'ink';
  // Decimals follow the target value, so a count-up doesn't flicker between 0 and 2 decimals.
  const text = value === null || value === undefined ? '—' : money(v, { hidden, sign, decimals: decimals ?? autoDecimals(value), compact });
  return (
    <Text variant={variant} tone={t} style={[{ fontVariant: ['tabular-nums'] }, color ? { color } : null]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}
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

/** The one big number on a screen. Tap = details; long-press toggles the privacy mask (no eye icon: owner). */
export function HeroFigure({ label, value, caption, onPress, children }: {
  label: string; value: number | null | undefined; caption?: string | null; onPress?: () => void; children?: React.ReactNode;
}) {
  const hidden = useHidden();
  const toggle = () => { haptic.tick(); useApp.getState().set({ hideAmounts: !hidden }); };
  return (
    <View style={styles.hero}>
      <View style={styles.heroLabelRow}>
        <Text variant="label" tone="ink2">{label}</Text>
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
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  big: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  gridTile: { width: '48.8%', flexGrow: 1, borderRadius: 20, borderWidth: StyleSheet.hairlineWidth, padding: space.lg, gap: 4 },
});

export type GridStat = { label: string; value?: number | null; text?: string; tone?: 'auto' | 'ink'; sign?: boolean; sub?: string | null };

/** Two-column grid of figure tiles (detail screens): label, figure, optional sub-line. */
export function StatGrid({ stats }: { stats: GridStat[] }) {
  const p = useTheme();
  return (
    <View style={styles.grid}>
      {stats.map((s) => (
        <View key={s.label} style={[styles.gridTile, { backgroundColor: p.surface, borderColor: p.border }]}>
          <Text variant="caption" tone="ink2" numberOfLines={1}>{s.label}</Text>
          {s.text !== undefined
            ? <Text variant="numLarge" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{s.text}</Text>
            : <Money value={s.value} variant="numLarge" tone={s.tone ?? 'ink'} sign={s.sign} />}
          {s.sub ? <Text variant="caption" tone={s.tone === 'auto' ? toneOf(s.value) : 'muted'} numberOfLines={1}>{s.sub}</Text> : null}
        </View>
      ))}
    </View>
  );
}

/**
 * Hero amount in the reference style: big grouped number with a small "PKR" after it (count-up on change,
 * privacy mask respected). Decimals only below Rs 10,000 and only when there are paisa.
 */
export function BigAmount({ value, color, suffixColor, size = 'hero', numStyle }: { value: number | null | undefined; color?: string; suffixColor?: string; size?: 'hero' | 'display'; numStyle?: TextStyle }) {
  const p = useTheme();
  const hidden = useHidden();
  const v = useCountUp(value ?? null);
  // Long amounts (8+ digits) read as K/M/B so they never squeeze or clip; the exact figure is still spoken.
  const short = isLong(value);
  const body = (n: number) => (short ? compactNumber(n) : group(n, autoDecimals(value)));
  const text = value === null || value === undefined ? '—' : hidden ? MASK : `${value < 0 ? '-' : ''}${body(Math.abs(v ?? 0))}`;
  const spoken = value === null || value === undefined ? text : `${value < 0 ? '-' : ''}${group(Math.abs(value), autoDecimals(value))}`;
  return (
    <View style={styles.big} accessible accessibilityLabel={hidden ? 'Amount hidden' : `${spoken} rupees`}>
      <Text variant={size} style={[{ fontVariant: ['tabular-nums'] }, numStyle, color ? { color } : null]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>{text}</Text>
      <Text variant="label" style={{ color: suffixColor ?? p.muted, marginBottom: size === 'hero' ? 8 : 6, fontFamily: 'Inter_600SemiBold' }}>PKR</Text>
    </View>
  );
}

/** "▲ 3,420  |  0.27%" — the change line (arrows, so gains never rely on colour alone). */
export function ChangeLine({ amount, percent, suffix }: { amount: number | null | undefined; percent?: number | null; suffix?: string }) {
  const p = useTheme();
  const hidden = useHidden();
  if (amount === null || amount === undefined) return null;
  const t = toneOf(amount);
  const color = t === 'pos' ? p.pos : t === 'neg' ? p.neg : p.ink2;
  const abs = Math.abs(amount);
  const text = t === 'flat' ? 'No change' : `${amount > 0 ? '▲' : '▼'} ${hidden ? '••••' : group(abs, abs >= 100 ? 0 : 2)}${percent !== null && percent !== undefined ? `  |  ${Math.abs(percent).toFixed(2)}%` : ''}`;
  return (
    <Text variant="label" style={{ color, fontFamily: font.num }} accessibilityLabel={`${t === 'pos' ? 'Up' : t === 'neg' ? 'Down' : 'Unchanged'} ${hidden ? '' : text.replace(/[▲▼]/g, '')} ${suffix ?? ''}`}>
      {text}{suffix ? <Text variant="label" tone="muted">{`  ${suffix}`}</Text> : null}
    </Text>
  );
}
