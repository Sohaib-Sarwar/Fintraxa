/**
 * The owner's fingerprint mark (`fingerprint.jpg`, 2026-11-15): four nested rounded loops with breaks and a hooked
 * core, drawn as strokes so it stays crisp at any size and takes any colour.
 */
import Svg, { Path, Rect } from 'react-native-svg';

/** Each loop: a stadium (rounded rect, ends fully round); the dash pattern makes its breaks. */
const LOOPS = [
  { x: 5, y: 5, w: 90, h: 130, dash: '262 16 92 22', offset: 40 },
  { x: 15, y: 15, w: 70, h: 110, dash: '196 14 70 20', offset: 150 },
  { x: 25, y: 25, w: 50, h: 90, dash: '150 13 60 18', offset: 70 },
  { x: 35, y: 35, w: 30, h: 70, dash: '92 12 40 16', offset: 120 },
];
const CORE = 'M46 86 V60 a4 4 0 0 1 8 0 V82';

export function FingerprintGlyph({ size = 40, color = '#FFFFFF', strokeWidth = 4.5 }: { size?: number; color?: string; strokeWidth?: number }) {
  return (
    <Svg width={size * (100 / 140)} height={size} viewBox="0 0 100 140" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {LOOPS.map((l, i) => (
        <Rect key={i} x={l.x} y={l.y} width={l.w} height={l.h} rx={l.w / 2} fill="none" stroke={color} strokeWidth={strokeWidth}
          strokeLinecap="round" strokeDasharray={l.dash} strokeDashoffset={l.offset} />
      ))}
      <Path d={CORE} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
    </Svg>
  );
}
