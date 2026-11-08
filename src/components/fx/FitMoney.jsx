import { useEffect, useLayoutEffect, useState } from 'react';
import { Box } from '@mui/material';
import { formatCurrency, formatCompactCurrency } from '../../lib/formatters';
import AnimatedValue from './AnimatedValue';

const SIGN = (n) => (n > 0 ? '+' : n < 0 ? '−' : '');

/**
 * An amount that never truncates with "…": the full figure while it fits the
 * space it is given, the compact one (Rs 1.4M, Rs 2.35B) when it would not,
 * with the exact figure as a tooltip. Fit is measured, not guessed: a hidden
 * probe in the same font holds the full text and is compared with the box on
 * every resize and once web fonts have loaded.
 *
 * format:        number → full text (default: currency, `digits` decimals)
 * compactFormat: number → compact text; derived from `format` when omitted
 *                (keeps a leading +/− sign; non-money formats never compact)
 */
export default function FitMoney({ value, digits = 0, format, compactFormat, split = false, dimColor }) {
  const full = format ?? ((n) => formatCurrency(n, digits));
  const sample = full(1);
  const isMoney = sample.includes(formatCurrency(0).split(' ')[0]);
  const signed = /^[+−-]/.test(sample);
  const compact = compactFormat ?? (isMoney ? (n) => (signed ? `${SIGN(n)}${formatCompactCurrency(Math.abs(n))}` : formatCompactCurrency(n)) : full);

  const [box, setBox] = useState(null);
  const [probe, setProbe] = useState(null);
  const [tight, setTight] = useState(false);
  const fullText = Number.isFinite(Number(value)) ? full(Number(value)) : '—';

  useLayoutEffect(() => {
    if (!box || !probe) return undefined;
    const check = () => setTight(probe.scrollWidth > box.clientWidth + 0.5);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(box);
    return () => ro.disconnect();
  }, [box, probe, fullText]);

  // Widths change when the web font replaces the fallback.
  useEffect(() => {
    if (!box || !probe || !document.fonts?.ready) return undefined;
    let live = true;
    document.fonts.ready.then(() => { if (live) setTight(probe.scrollWidth > box.clientWidth + 0.5); });
    return () => { live = false; };
  }, [box, probe]);

  return (
    <Box component="span" ref={setBox} title={tight ? fullText : undefined}
      sx={{ position: 'relative', display: 'block', maxWidth: '100%', overflow: 'hidden', whiteSpace: 'nowrap' }}>
      <AnimatedValue value={value} format={tight ? compact : full} formatKey={tight ? 'compact' : 'full'} split={split} dimColor={dimColor} />
      <span ref={setProbe} aria-hidden style={{ position: 'absolute', left: 0, top: 0, visibility: 'hidden', whiteSpace: 'nowrap', pointerEvents: 'none' }}>{fullText}</span>
    </Box>
  );
}
