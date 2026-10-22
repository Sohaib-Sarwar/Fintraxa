import { useCallback, useEffect, useRef } from 'react';
import { useInView, useMotionValue, useSpring, useReducedMotion } from 'framer-motion';

/**
 * Spring-animated number.
 *
 * Ported from ReactBits `count-up` (fetched through the reactbits MCP server)
 * and adapted in two ways that matter here:
 *
 *   - ReactBits formats with a hardcoded `Intl.NumberFormat('en-US')`. Every
 *     figure in this app goes through `formatCurrency`, which also converts
 *     out of PKR into whichever display currency the user picked, so the
 *     formatter is injected instead.
 *   - It writes to `textContent` on every spring tick, outside React, so a
 *     counter running at 60fps costs no re-renders. That is kept — it is the
 *     reason this is safe to put on a dashboard full of cards.
 *
 * Respects `prefers-reduced-motion`: the final value is rendered immediately
 * rather than animated.
 */
export default function CountUp({
  to,
  from = 0,
  duration = 1.1,
  delay = 0,
  format = (n) => String(Math.round(n)),
  startWhen = true,
  className,
  style,
}) {
  const ref = useRef(null);
  const reduceMotion = useReducedMotion();
  const target = Number.isFinite(Number(to)) ? Number(to) : 0;

  const motionValue = useMotionValue(from);
  const springValue = useSpring(motionValue, {
    damping: 20 + 40 * (1 / duration),
    stiffness: 100 * (1 / duration),
  });

  const isInView = useInView(ref, { once: true, margin: '0px' });
  const write = useCallback((n) => {
    if (ref.current) ref.current.textContent = format(n);
  }, [format]);

  /* Paint something correct before the spring runs — and everything, at once,
     when the reader has asked for less motion. */
  useEffect(() => {
    write(reduceMotion ? target : from);
  }, [write, reduceMotion, target, from]);

  useEffect(() => {
    if (reduceMotion || !isInView || !startWhen) return undefined;
    const id = setTimeout(() => motionValue.set(target), delay * 1000);
    return () => clearTimeout(id);
  }, [reduceMotion, isInView, startWhen, motionValue, target, delay]);

  useEffect(() => {
    if (reduceMotion) return undefined;
    return springValue.on('change', write);
  }, [springValue, write, reduceMotion]);

  return <span ref={ref} className={className} style={style} />;
}
