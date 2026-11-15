/**
 * Charts drawn with react-native-svg (in Expo Go, light, smooth on low-end phones). Plan §9.2 suggested
 * victory-native/Skia; plain SVG covers the v1 needs (one value line + an invested reference) without the
 * extra native dependency — deviation logged in the plan §15.
 *
 * The area chart keeps numbers on screen (high/low labels and a scrub readout): a chart without axis
 * numbers was the most-criticised fintech redesign of 2025 (docs/mobile/design-references.md).
 */
import { barWindow } from './barWindow';
import { useEffect, useMemo, useRef, useState, type ComponentRef, type ReactNode, type RefObject } from 'react';
import { BlurTargetView, BlurView } from 'expo-blur';
import { LinearGradient as ExpoLinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, { Easing, useAnimatedProps, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import Svg, { Circle, Defs, Line, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import { haptic } from '@/lib/haptics';
import { Text } from './Text';
import { useTheme } from './theme';
import { alpha, font } from './tokens';

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

export type Bar = { key: string; label: string; value: number };

/** Smooth path through points (Catmull-Rom → cubic Bézier), for the line over the bars. */
function smooth(pts: { x: number; y: number }[]) {
  if (pts.length < 2) return '';
  let d = `M${pts[0].x},${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i]; const p1 = pts[i]; const p2 = pts[i + 1]; const p3 = pts[i + 2] ?? p2;
    const c1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 };
    const c2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 };
    d += ` C${c1.x.toFixed(1)},${c1.y.toFixed(1)} ${c2.x.toFixed(1)},${c2.y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
  }
  return d;
}

/**
 * Apple-style glass panel over a chart: the chart behind it is blurred (real blur on Android 12+, via the chart's
 * `BlurTargetView`), under a light translucent tint with a lit top edge. No elevation: a shadow behind a
 * translucent view shows through as a grey blob on Android.
 */
function Glass({ target, radius, style, children }: { target: RefObject<ComponentRef<typeof View> | null>; radius: number; style: StyleProp<ViewStyle>; children: ReactNode }) {
  const p = useTheme();
  const dark = p.mode === 'dark';
  return (
    <View pointerEvents="none" style={[style, {
      borderRadius: radius, overflow: 'hidden', borderWidth: 1,
      borderColor: dark ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.9)', borderTopColor: dark ? 'rgba(255,255,255,0.30)' : '#FFFFFF',
    }]}>
      <BlurView blurTarget={target} blurMethod="dimezisBlurViewSdk31Plus" intensity={dark ? 45 : 55} tint={dark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
      <ExpoLinearGradient colors={dark ? ['rgba(255,255,255,0.14)', 'rgba(255,255,255,0.05)'] : ['rgba(255,255,255,0.78)', 'rgba(255,255,255,0.52)']} style={StyleSheet.absoluteFill} />
      {children}
    </View>
  );
}

/**
 * Monthly bars in the reference style: rounded bars fading top → bottom into the card (grey; the selected month in
 * the accent), and a soft accent trend line through the bar tops; the selected bar's value sits above it.
 * Tap a bar to select it. Press and hold, then slide, to scrub across months: `renderTip` draws a detail card
 * above the held bar (like the web Home chart's tooltip). Negative values (refunds) draw as a stub.
 */
export { barWindow, MAX_BARS } from './barWindow';

export function BarChart<B extends Bar>({ bars: allBars, selected, onSelect, height = 200, format, renderTip }: {
  bars: B[]; selected?: string | null; onSelect?: (key: string) => void; height?: number; format: (v: number) => string;
  renderTip?: (bar: B) => ReactNode;
}) {
  const bars = useMemo(() => barWindow(allBars, selected), [allBars, selected]);
  const p = useTheme();
  const [w, setW] = useState(0);
  const [held, setHeld] = useState<number | null>(null);
  // The bars are the blur target, so the hold card can be frosted glass over them (owner: Apple glass, not solid).
  const target = useRef<ComponentRef<typeof View>>(null);
  // Scrub: finger x → bar index on the UI thread; JS runs only when the index changes.
  const width = useSharedValue(0);
  const count = useSharedValue(bars.length);
  const lastIdx = useSharedValue(-1);
  useEffect(() => { count.set(bars.length); }, [bars.length, count]);
  const show = (i: number) => {
    if (i >= 0) haptic.tick();
    setHeld(i < 0 ? null : i);
  };
  const scrub = usePanGesture({
    activateAfterLongPress: 220,
    onActivate: (e) => {
      'worklet';
      const n = count.get();
      if (width.get() <= 0 || n < 1) return;
      const i = Math.max(0, Math.min(n - 1, Math.floor((e.x / width.get()) * n)));
      lastIdx.set(i); scheduleOnRN(show, i);
    },
    onUpdate: (e) => {
      'worklet';
      const n = count.get();
      if (width.get() <= 0 || n < 1) return;
      const i = Math.max(0, Math.min(n - 1, Math.floor((e.x / width.get()) * n)));
      if (i !== lastIdx.get()) { lastIdx.set(i); scheduleOnRN(show, i); }
    },
    onFinalize: () => { 'worklet'; if (lastIdx.get() >= 0) { lastIdx.set(-1); scheduleOnRN(show, -1); } },
  });

  if (!bars.length) {
    return <View style={[styles.empty, { height }]}><Text variant="caption" tone="muted">No months to show yet.</Text></View>;
  }
  const max = Math.max(1, ...bars.map((b) => b.value));
  const sel = held !== null && bars[held] ? bars[held].key : selected ?? bars[bars.length - 1].key;
  const top = 34; const plotH = height - top - 26;
  const slot = w / bars.length;
  const bw = Math.min(38, slot * 0.62);
  const geo = bars.map((b, i) => {
    const h = Math.max(10, (Math.max(0, b.value) / max) * plotH);
    const x = slot * i + (slot - bw) / 2;
    return { b, x, cx: x + bw / 2, y: top + plotH - h, h };
  });
  const line = smooth(geo.map((g) => ({ x: g.cx, y: g.y + 4 })));
  const s = geo.find((g) => g.b.key === sel) ?? geo[geo.length - 1];
  const tipW = Math.min(220, w);
  return (
    <GestureDetector gesture={scrub}>
    <View onLayout={(e: LayoutChangeEvent) => { setW(e.nativeEvent.layout.width); width.set(e.nativeEvent.layout.width); }} style={{ height }}
      accessibilityHint={renderTip ? 'Press and hold, then slide, to see each month in detail' : undefined}>
      {w ? (
        <>
          <BlurTargetView ref={target} style={StyleSheet.absoluteFill}>
          <Svg width={w} height={height - 22}>
            <Defs>
              {/* Bars fade top → bottom into the card (owner): full colour at the top, gone at the base. */}
              <LinearGradient id="barIdle" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={p.barTop} stopOpacity={0.85} />
                <Stop offset="0.55" stopColor={p.barTop} stopOpacity={0.35} />
                <Stop offset="1" stopColor={p.barTop} stopOpacity={0} />
              </LinearGradient>
              <LinearGradient id="barOn" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={p.accent} stopOpacity={1} />
                <Stop offset="0.55" stopColor={p.accent} stopOpacity={0.45} />
                <Stop offset="1" stopColor={p.accent} stopOpacity={0} />
              </LinearGradient>
            </Defs>
            {geo.map((g) => (
              <Rect key={g.b.key} x={g.x} y={g.y} width={bw} height={g.h} rx={Math.min(12, bw / 2)} fill={g.b.key === sel ? 'url(#barOn)' : 'url(#barIdle)'} />
            ))}
            {/* Monthly trend over the bars: the original soft accent line, at the thicker 2.4 px (owner). */}
            <Path d={line} stroke={p.mode === 'dark' ? alpha(p.accent, 0.55) : p.accentDeep} strokeWidth={2.4} fill="none" strokeLinecap="round" strokeLinejoin="round" />
            {held !== null ? <Line x1={s.cx} x2={s.cx} y1={0} y2={height - 22} stroke={p.muted} strokeWidth={1} strokeDasharray="3 4" /> : null}
          </Svg>
          <View style={styles.labels} pointerEvents="none">
            {geo.map((g) => (
              <Text key={g.b.key} variant="caption" tone={g.b.key === sel ? 'ink' : 'muted'} style={{ width: slot, textAlign: 'center', fontSize: 11, fontFamily: g.b.key === sel ? 'Inter_600SemiBold' : 'Inter_400Regular' }} numberOfLines={1}>{g.b.label}</Text>
            ))}
          </View>
          </BlurTargetView>
          {held === null || !renderTip ? (
            <Glass target={target} radius={10} style={[styles.tip, { left: Math.min(Math.max(s.cx - 50, 0), w - 100), top: Math.max(0, s.y - 30) }]}>
              <Text variant="caption" style={{ color: p.ink, fontFamily: font.num }} numberOfLines={1}>{format(s.b.value)}</Text>
            </Glass>
          ) : (
            <Glass target={target} radius={18} style={[styles.detail, { width: tipW, left: Math.min(Math.max(s.cx - tipW / 2, 0), w - tipW) }]}>
              {renderTip(s.b as B)}
            </Glass>
          )}
          {onSelect ? (
            <View style={StyleSheet.absoluteFill}>
              <View style={styles.hitRow}>
                {geo.map((g) => (
                  <Pressable key={g.b.key} style={{ width: slot, height: '100%' }} onPress={() => { haptic.tick(); onSelect(g.b.key); }}
                    accessibilityRole="button" accessibilityLabel={`${g.b.label}: ${format(g.b.value)}`} accessibilityState={{ selected: g.b.key === sel }} />
                ))}
              </View>
            </View>
          ) : null}
        </>
      ) : null}
    </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  empty: { alignItems: 'center', justifyContent: 'center' },
  label: { position: 'absolute', width: 96, textAlign: 'center' },
  track: { height: 4, borderRadius: 2, overflow: 'hidden', marginTop: 6 },
  detail: { position: 'absolute', top: 0, paddingHorizontal: 14, paddingVertical: 12 },
  tip: { position: 'absolute', width: 100, alignItems: 'center', paddingVertical: 4 },
  hitRow: { flexDirection: 'row', flex: 1 },
  labels: { flexDirection: 'row', position: 'absolute', bottom: 0, left: 0, right: 0 },
  fill: { height: 4, borderRadius: 2 },
});

const AnimatedPath = Animated.createAnimatedComponent(Path);
const DRAW_EASE = Easing.bezier(0.2, 0, 0, 1);

/**
 * Hero trend line (owner, 2026-11-14): a smooth line of recent values that draws itself left to right, with a
 * soft fill fading in under it and a dot on the latest value. Decorative summary; the exact figures live in
 * the hero number and the charts. Respects Reduce motion (drawn at once).
 */
export function TrendLine({ values, width, height, color }: { values: number[]; width: number; height: number; color: string }) {
  const reduce = useReducedMotion();
  const progress = useSharedValue(reduce ? 1 : 0);
  const key = values.length ? `${values.length}:${values[0]}:${values[values.length - 1]}` : 'empty';
  useEffect(() => {
    if (reduce) { progress.set(1); return; }
    progress.set(0);
    progress.set(withTiming(1, { duration: 1100, easing: DRAW_EASE }));
  }, [key, reduce, progress]);

  const pad = 4;
  const pts = useMemo(() => {
    if (values.length < 2) return [];
    let min = Math.min(...values); let max = Math.max(...values);
    if (min === max) { min -= 1; max += 1; }
    return values.map((v, i) => ({ x: pad + (i / (values.length - 1)) * (width - pad * 2), y: pad + (1 - (v - min) / (max - min)) * (height - pad * 2) }));
  }, [values, width, height]);
  // Length of the polyline (+8% for the curve) so the dash covers the whole line.
  const len = useMemo(() => pts.reduce((s, q, i) => (i ? s + Math.hypot(q.x - pts[i - 1].x, q.y - pts[i - 1].y) : 0), 0) * 1.08 + 4, [pts]);
  const lineProps = useAnimatedProps(() => ({ strokeDashoffset: len * (1 - progress.get()) }));
  const fillProps = useAnimatedProps(() => ({ opacity: Math.max(0, (progress.get() - 0.4) / 0.6) }));
  const dotProps = useAnimatedProps(() => ({ opacity: progress.get() > 0.95 ? 1 : 0 }));

  if (pts.length < 2) return <View style={{ width, height }} />;
  const d = smooth(pts);
  const last = pts[pts.length - 1];
  return (
    <Svg width={width} height={height} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Defs>
        <LinearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={color} stopOpacity={0.28} />
          <Stop offset="1" stopColor={color} stopOpacity={0} />
        </LinearGradient>
      </Defs>
      <AnimatedPath d={`${d} L${last.x},${height} L${pts[0].x},${height} Z`} fill="url(#trendFill)" animatedProps={fillProps} />
      <AnimatedPath d={d} stroke={color} strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round"
        strokeDasharray={`${len} ${len}`} animatedProps={lineProps} />
      <AnimatedCircle cx={last.x} cy={last.y} r={3.5} fill={color} animatedProps={dotProps} />
    </Svg>
  );
}
const AnimatedCircle = Animated.createAnimatedComponent(Circle);
