import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Box } from '@mui/material';
import { formatCurrency, formatCompactCurrency } from '../../lib/formatters';
import AnimatedValue from './AnimatedValue';

const SIGN = (n) => (n > 0 ? '+' : n < 0 ? '−' : '');

/**
 * An amount that never truncates with "…": the full figure while it fits the
 * space it is given, the compact one (Rs 1.4M, Rs 2.35B) when it would not,
 * with the exact figure as a tooltip. Fit is measured, not guessed: a hidden
 * probe in the same font holds the full text and is compared with the width
 * the box is GIVEN by its parent (never its own content width, which would
 * lock it in compact once it shrank), on every resize and once fonts load.
 *
 * format:        number → full text (default: currency, `digits` decimals)
 * compactFormat: number → compact text; derived from `format` when omitted
 *                (keeps a leading +/− sign; non-money formats never compact)
 * after:         an element placed right after the figure (e.g. the privacy eye);
 *                its width is reserved when deciding whether the figure fits
 */
export default function FitMoney({ value, digits = 0, format, compactFormat, split = false, dimColor, after }) {
  const full = format ?? ((n) => formatCurrency(n, digits));
  const sample = full(1);
  const isMoney = sample.includes(formatCurrency(0).split(' ')[0]);
  const signed = /^[+−-]/.test(sample);
  const compact = compactFormat ?? (isMoney ? (n) => (signed ? `${SIGN(n)}${formatCompactCurrency(Math.abs(n))}` : formatCompactCurrency(n)) : full);

  const [box, setBox] = useState(null);
  const [probe, setProbe] = useState(null);
  const afterRef = useRef(null);
  const [tight, setTight] = useState(false);
  const fullText = Number.isFinite(Number(value)) ? full(Number(value)) : '—';

  useLayoutEffect(() => {
    if (!box || !probe) return undefined;
    const check = () => {
      const reserve = afterRef.current ? afterRef.current.offsetWidth + 8 : 0;
      setTight(probe.scrollWidth + reserve > box.clientWidth + 0.5);
    };
    check();
    const ro = new ResizeObserver(check);
    ro.observe(box);
    return () => ro.disconnect();
  }, [box, probe, fullText]);

  // Widths change when the web font replaces the fallback.
  useEffect(() => {
    if (!box || !probe || !document.fonts?.ready) return undefined;
    let live = true;
    document.fonts.ready.then(() => {
      if (!live) return;
      const reserve = afterRef.current ? afterRef.current.offsetWidth + 8 : 0;
      setTight(probe.scrollWidth + reserve > box.clientWidth + 0.5);
    });
    return () => { live = false; };
  }, [box, probe]);

  return (
    // width: 100% so the box takes the space its parent gives it, whatever the figure's length.
    <Box component="span" ref={setBox}
      sx={{ position: 'relative', display: 'flex', alignItems: 'center', gap: '8px', width: '100%', minWidth: 0, overflow: 'hidden', whiteSpace: 'nowrap', justifyContent: 'inherit' }}>
      <Box component="span" title={tight ? fullText : undefined} sx={{ minWidth: 0, overflow: 'hidden' }}>
        <AnimatedValue value={value} format={tight ? compact : full} formatKey={tight ? 'compact' : 'full'} split={split} dimColor={dimColor} />
      </Box>
      {after && <Box component="span" ref={afterRef} sx={{ flexShrink: 0, display: 'inline-flex' }}>{after}</Box>}
      <span ref={setProbe} aria-hidden style={{ position: 'absolute', left: 0, top: 0, visibility: 'hidden', whiteSpace: 'nowrap', pointerEvents: 'none' }}>{fullText}</span>
    </Box>
  );
}
