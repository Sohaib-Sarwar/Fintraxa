/**
 * Charts drawn with react-native-svg (in Expo Go, light, smooth on low-end phones). Plan §9.2 suggested
 * victory-native/Skia; plain SVG covers the v1 needs (one value line + an invested reference) without the
 * extra native dependency — deviation logged in the plan §15.
 *
 * The area chart keeps numbers on screen (high/low labels and a scrub readout): a chart without axis
 * numbers was the most-criticised fintech redesign of 2025 (docs/mobile/design-references.md).
 */
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import { useSharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import Svg, { Circle, Defs, Line, LinearGradient, Path, Stop } from 'react-native-svg';
import { haptic } from '@/lib/haptics';
import { Text } from './Text';
import { useTheme } from './theme';

export type Point = { date: string; value: number; cost?: number };

function scale(points: Point[], w: number, h: number, padTop: number, padBottom: number, withCost: boolean) {
  const vals = points.flatMap((p) => (withCost && p.cost !== undefined ? [p.value, p.cost] : [p.value]));
  let min = Math.min(...vals);
  let max = Math.max(...vals);
  if (min === max) { min -= 1; max += 1; }
  const x = (i: number) => (points.length === 1 ? w / 2 : (i / (points.length - 1)) * w);
  const y = (v: number) => padTop + (1 - (v - min) / (max - min)) * (h - padTop - padBottom);
  return { x, y, min, max };
}

const pathOf = (points: Point[], x: (i: number) => number, y: (v: number) => number, key: 'value' | 'cost') =>
  points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y((p[key] ?? p.value) as number).toFixed(1)}`).join(' ');

export function AreaChart({ points, height = 180, showCost = true, onScrub, format, tone = 'auto' }: {
  points: Point[]; height?: number; showCost?: boolean; onScrub?: (p: Point | null) => void; format: (v: number) => string; tone?: 'auto' | 'ink';
}) {
  const p = useTheme();
  const [w, setW] = useState(0);
  const [active, setActive] = useState<number | null>(null);
  const withCost = showCost && points.some((pt) => pt.cost !== undefined);
  const geo = useMemo(() => (w ? scale(points, w, height, 22, 22, withCost) : null), [points, w, height, withCost]);
  const up = points.length > 1 ? points[points.length - 1].value >= points[0].value : true;
  const line = tone === 'ink' ? p.chartLine : up ? p.pos : p.neg;

  // Scrub: the finger position → point index is computed on the UI thread; JS runs only when the index changes.
  const width = useSharedValue(0);
  const count = useSharedValue(points.length);
  const lastIdx = useSharedValue(-1);
  useEffect(() => { count.set(points.length); }, [points.length, count]);
  const show = (i: number) => {
    haptic.tick();
    setActive(i < 0 ? null : i);
    onScrub?.(i < 0 ? null : points[i] ?? null);
  };
  const scrubGesture = usePanGesture({
    activeOffsetX: [-6, 6],
    failOffsetY: [-12, 12],
    onUpdate: (e) => {
      'worklet';
      if (width.get() <= 0 || count.get() < 2) return;
      const n = count.get();
      const i = Math.max(0, Math.min(n - 1, Math.round((e.x / width.get()) * (n - 1))));
      if (i !== lastIdx.get()) { lastIdx.set(i); scheduleOnRN(show, i); }
    },
    onFinalize: () => { 'worklet'; lastIdx.set(-1); scheduleOnRN(show, -1); },
  });

  if (points.length < 2) {
    return (
      <View style={[styles.empty, { height }]}>
        <Text variant="caption" tone="muted">History appears after a couple of days of data.</Text>
      </View>
    );
  }

  const hiIdx = points.reduce((b, pt, i) => (pt.value > points[b].value ? i : b), 0);
  const loIdx = points.reduce((b, pt, i) => (pt.value < points[b].value ? i : b), 0);

  return (
    <GestureDetector gesture={scrubGesture}>
    <View onLayout={(e: LayoutChangeEvent) => { setW(e.nativeEvent.layout.width); width.set(e.nativeEvent.layout.width); }} style={{ height }}
      accessible accessibilityRole="image" accessibilityLabel={`Chart from ${format(points[0].value)} to ${format(points[points.length - 1].value)}. Drag to read values.`}>
      {geo ? (
        <>
          <Svg width={w} height={height}>
            <Defs>
              <LinearGradient id="fill" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={line} stopOpacity={p.mode === 'dark' ? 0.22 : 0.16} />
                <Stop offset="1" stopColor={line} stopOpacity={0} />
              </LinearGradient>
            </Defs>
            <Path d={`${pathOf(points, geo.x, geo.y, 'value')} L${geo.x(points.length - 1)},${height} L0,${height} Z`} fill="url(#fill)" />
            {withCost ? <Path d={pathOf(points, geo.x, geo.y, 'cost')} stroke={p.chartRef} strokeWidth={1.25} strokeDasharray="4 4" fill="none" /> : null}
            <Path d={pathOf(points, geo.x, geo.y, 'value')} stroke={line} strokeWidth={2} fill="none" strokeLinejoin="round" strokeLinecap="round" />
            {active !== null ? (
              <>
                <Line x1={geo.x(active)} x2={geo.x(active)} y1={0} y2={height} stroke={p.muted} strokeWidth={1} />
                <Circle cx={geo.x(active)} cy={geo.y(points[active].value)} r={5} fill={line} stroke={p.bg} strokeWidth={2} />
              </>
            ) : (
              <Circle cx={geo.x(points.length - 1)} cy={geo.y(points[points.length - 1].value)} r={4} fill={line} />
            )}
          </Svg>
          {active === null ? (
            <>
              <Text variant="caption" tone="muted" style={[styles.label, { top: 0, left: Math.min(Math.max(geo.x(hiIdx) - 40, 0), w - 96) }]}>High {format(points[hiIdx].value)}</Text>
              <Text variant="caption" tone="muted" style={[styles.label, { bottom: 0, left: Math.min(Math.max(geo.x(loIdx) - 40, 0), w - 96) }]}>Low {format(points[loIdx].value)}</Text>
            </>
          ) : null}
        </>
      ) : null}
    </View>
    </GestureDetector>
  );
}

export function Sparkline({ values, width = 64, height = 24 }: { values: number[]; width?: number; height?: number }) {
  const p = useTheme();
  if (values.length < 2) return <View style={{ width, height }} />;
  const pts = values.map((v, i) => ({ date: String(i), value: v }));
  const g = scale(pts, width, height, 2, 2, false);
  const color = values[values.length - 1] >= values[0] ? p.pos : p.neg;
  return (
    <Svg width={width} height={height}>
      <Path d={pathOf(pts, g.x, g.y, 'value')} stroke={color} strokeWidth={1.5} fill="none" strokeLinejoin="round" />
    </Svg>
  );
}

/** Horizontal share bar for category breakdowns (one hue; the ranking carries the meaning). */
export function ShareBar({ share }: { share: number }) {
  const p = useTheme();
  return (
    <View style={[styles.track, { backgroundColor: p.surface2 }]}>
      <View style={[styles.fill, { width: `${Math.max(2, Math.min(100, share))}%`, backgroundColor: p.mode === 'dark' ? p.ink2 : p.ink }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { alignItems: 'center', justifyContent: 'center' },
  label: { position: 'absolute', width: 96, textAlign: 'center' },
  track: { height: 4, borderRadius: 2, overflow: 'hidden', marginTop: 6 },
  fill: { height: 4, borderRadius: 2 },
});
