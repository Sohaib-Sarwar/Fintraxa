/**
 * Allocation donut — a port of the web's `src/components/fx/AllocationDonut.jsx` (owner, 2026-11-14: "use the
 * same UI of the pie chart from the web version"): a thick ring of rounded segments, each end overlapping the
 * next, starting near ten o'clock; the holding's logo in its end cap; quiet % labels outside; the largest
 * holdings get their own segment and the rest fold into "Others". Tap a segment to see its name, value and
 * share in the centre (tap again to clear). Same palette as the web: the ink colour first, then violet and cyan.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Path } from 'react-native-svg';
import { compactNumber, group } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { Text } from '@/ui/Text';
import { useTheme } from '@/ui/theme';
import { font } from '@/ui/tokens';

const PALETTE = {
  light: ['#1b1d22', '#4f3fa6', '#3fb8d0', '#8e86d8', '#9fdcea', '#6b7079'],
  dark: ['#f2f2f4', '#9c8cff', '#5fdcef', '#c4bbff', '#a9ecf6', '#8b8b93'],
};
const OTHERS = { light: '#d9dce1', dark: '#3a3a40' };
const MAX_SLICES = 5;
const rad = (deg: number) => (deg * Math.PI) / 180;
const pt = (cx: number, cy: number, r: number, deg: number) => [cx + r * Math.cos(rad(deg)), cy + r * Math.sin(rad(deg))] as const;
const arc = (cx: number, cy: number, r: number, a0: number, a1: number) => {
  const [x0, y0] = pt(cx, cy, r, a0);
  const [x1, y1] = pt(cx, cy, r, a1);
  return `M ${x0} ${y0} A ${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1} ${y1}`;
};

/** `logo` renders the holding's logo at the size the cap allows. */
export type DonutItem = { key: string; label: string; value: number; logo?: (size: number) => ReactNode };

export function AllocationDonut({ items, centerLabel, width, height, hidden = false }: {
  items: DonutItem[]; centerLabel: string; width: number; height: number; hidden?: boolean;
}) {
  const p = useTheme();
  const mode = p.mode;
  const [active, setActive] = useState<string | null>(null);
  const reduce = useReducedMotion();
  const show = useSharedValue(reduce ? 1 : 0);
  const sig = items.map((i) => i.key).join('|');
  useEffect(() => {
    if (reduce) { show.set(1); return; }
    show.set(0);
    show.set(withTiming(1, { duration: 420, easing: Easing.bezier(0.2, 0, 0, 1) }));
  }, [sig, reduce, show]);
  const appear = useAnimatedStyle(() => ({ opacity: show.get(), transform: [{ scale: 0.96 + 0.04 * show.get() }] }));

  const sorted = items.filter((i) => i.value > 0).sort((a, b) => b.value - a.value);
  const total = sorted.reduce((s, i) => s + i.value, 0);
  const head = sorted.slice(0, sorted.length > MAX_SLICES + 1 ? MAX_SLICES : sorted.length);
  const rest = sorted.slice(head.length);
  const slices = [
    ...head.map((i, k) => ({ ...i, color: PALETTE[mode][k] })),
    ...(rest.length ? [{ key: 'others', label: `Others (${rest.length})`, value: rest.reduce((s, i) => s + i.value, 0), color: OTHERS[mode], logo: undefined }] : []),
  ].map((s) => ({ ...s, share: total > 0 ? s.value / total : 0 }));

  if (!slices.length) {
    return <View style={[styles.empty, { height }]}><Text variant="caption" tone="muted">Nothing held</Text></View>;
  }

  // The ring alone, centred and as large as the card allows (web: 170–340).
  const size = Math.max(170, Math.min(width, height, 340));
  const W = size * 0.15;
  const labelPad = 26;
  const R = size / 2 - W / 2 - labelPad;
  const C = size / 2;
  const capDeg = (W / 2 / R) * (180 / Math.PI);
  const segs = slices.map((s, i) => {
    const a0 = -200 + slices.slice(0, i).reduce((t, x) => t + x.share * 360, 0);
    return { ...s, a0, a1: a0 + s.share * 360 };
  });
  const on = active ? segs.find((s) => s.key === active) ?? null : null;
  const single = segs.length === 1;
  const d = W * 0.78;
  const toggle = (key: string) => { haptic.tick(); setActive((k) => (k === key ? null : key)); };
  const shown = on ? on.value : total;
  const fig = hidden ? '••••' : String(Math.round(shown)).length > 9 ? compactNumber(shown) : group(shown);

  return (
    <View style={[styles.wrap, { height }]}>
      <Animated.View style={[{ width: size, height: size }, appear]}
        accessible accessibilityRole="image" accessibilityLabel={`Allocation: ${segs.map((s) => `${s.label} ${(s.share * 100).toFixed(0)}%`).join(', ')}`}>
        <Svg width={size} height={size}>
          <Circle cx={C} cy={C} r={R} fill="none" stroke={p.surface2} strokeWidth={W} />
          {single ? (
            <Circle cx={C} cy={C} r={R} fill="none" stroke={segs[0].color} strokeWidth={W} onPress={() => toggle(segs[0].key)} />
          ) : (
            // Drawn last-to-first so each segment's rounded end sits over the next one's start.
            [...segs].reverse().map((s) => (
              <Path key={s.key} d={arc(C, C, R, s.a0 + capDeg * 0.15, Math.min(s.a1 + capDeg * 0.15, s.a0 + 359.5))} fill="none" stroke={s.color}
                strokeWidth={W} strokeLinecap="round" opacity={on && on.key !== s.key ? 0.4 : 1} onPress={() => toggle(s.key)} />
            ))
          )}
          {segs.map((s) => {
            const showLogo = !!s.logo && (single || s.share >= 0.06);
            if (!showLogo) return null;
            const [lx, ly] = pt(C, C, R, s.a1 - (single ? 90 : Math.min(capDeg * 0.9, (s.a1 - s.a0) / 2)));
            return <Circle key={`bg-${s.key}`} cx={lx} cy={ly} r={d / 2 + 2} fill={p.surface} opacity={on && on.key !== s.key ? 0.4 : 1} />;
          })}
        </Svg>

        {segs.map((s) => {
          const dim = on && on.key !== s.key ? 0.4 : 1;
          const showLogo = !!s.logo && (single || s.share >= 0.06);
          const showPct = !single && s.share >= 0.04;
          const [lx, ly] = pt(C, C, R, s.a1 - (single ? 90 : Math.min(capDeg * 0.9, (s.a1 - s.a0) / 2)));
          const [px, py] = pt(C, C, R + W / 2 + 15, (s.a0 + s.a1) / 2);
          return (
            <View key={`m-${s.key}`} pointerEvents="none" style={StyleSheet.absoluteFill}>
              {showLogo ? (
                <View style={[styles.logo, { left: lx - d / 2, top: ly - d / 2, width: d, height: d, borderRadius: d / 2, opacity: dim }]}>{s.logo?.(d)}</View>
              ) : null}
              {showPct ? (
                <Text style={[styles.pct, { left: px - 22, top: py - 8, color: p.muted, opacity: dim }]}>{(s.share * 100).toFixed(0)}%</Text>
              ) : null}
            </View>
          );
        })}

        {/* Centre: total at rest; the tapped segment's name, value and share. */}
        <View pointerEvents="none" style={styles.centerWrap}>
          <View style={{ width: R * 1.35, alignItems: 'center' }}>
            <Text variant="caption" tone="muted" numberOfLines={1}>{on ? on.label : centerLabel}</Text>
            <Text style={[styles.centerFig, { color: p.ink, fontSize: size > 220 ? 18 : 15 }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>{fig}</Text>
            {on ? <Text style={[styles.centerPct, { color: p.muted }]}>{(on.share * 100).toFixed(1)}%</Text> : null}
          </View>
        </View>

        {/* Tap targets over the ring are the SVG paths; a tap in the hole clears the selection. */}
        {on ? <Pressable style={[styles.hole, { left: C - R + W / 2, top: C - R + W / 2, width: (R - W / 2) * 2, height: (R - W / 2) * 2, borderRadius: R }]}
          onPress={() => setActive(null)} accessibilityRole="button" accessibilityLabel="Show the total" /> : null}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center' },
  empty: { alignItems: 'center', justifyContent: 'center' },
  logo: { position: 'absolute', overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  pct: { position: 'absolute', width: 44, textAlign: 'center', fontFamily: font.numMedium, fontSize: 12, letterSpacing: -0.2 },
  centerWrap: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  centerFig: { fontFamily: font.num, letterSpacing: -0.5, marginTop: 1 },
  centerPct: { fontFamily: font.num, fontSize: 11 },
  hole: { position: 'absolute' },
});
