import { useEffect, useRef } from 'react';
import { animate, useReducedMotion } from 'framer-motion';

/**
 * A number that glides to its value: from 0 on first show, then from
 * whatever it currently reads to the new value when the figure changes (a new
 * date range, a refetch) — never flashing back to zero.
 *
 * Writes straight to the DOM on each frame, so a dashboard full of these
 * costs no React re-renders. With "reduce motion" on, the final value is
 * shown at once.
 *
 * format: number → string. split: render the decimals in a dimmer span
 * (the hero figure), which needs `dimColor`.
 */
export default function AnimatedValue({ value, format, formatKey, duration = 0.9, split = false, dimColor, className, style }) {
  const ref = useRef(null);
  const shown = useRef(0);
  const fmt = useRef(format);
  const reduce = useReducedMotion();

  useEffect(() => { fmt.current = format; });

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const paint = (n) => {
      shown.current = n;
      const text = fmt.current(n);
      if (!split) { el.textContent = text; return; }
      // Only trailing decimals are dimmed ("25,401" + ".06"); "Rs 1.4M" stays whole.
      const m = text.match(/^(.*?)(\.\d+)$/);
      el.children[0].textContent = m ? m[1] : text;
      el.children[1].textContent = m ? m[2] : '';
    };
    const target = Number(value);
    if (!Number.isFinite(target)) { if (split) { el.children[0].textContent = '—'; el.children[1].textContent = ''; } else el.textContent = '—'; return undefined; }
    // Same value, new format (e.g. switched to compact): repaint at once, no animation.
    if (reduce || shown.current === target) { paint(target); return undefined; }
    const controls = animate(shown.current, target, { duration, ease: [0.22, 1, 0.36, 1], onUpdate: paint });
    return () => controls.stop();
  }, [value, duration, split, reduce, formatKey]);

  return split
    ? <span ref={ref} className={className} style={style}><span /><span style={{ color: dimColor }} /></span>
    : <span ref={ref} className={className} style={style} />;
}
