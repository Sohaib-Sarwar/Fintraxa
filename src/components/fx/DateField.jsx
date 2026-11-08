import { useEffect, useMemo, useRef, useState } from 'react';
import { Box, ButtonBase, MenuItem, Popover, Select, Typography } from '@mui/material';
import { EventRounded, KeyboardArrowDownRounded } from '@mui/icons-material';
import { useFx, FONT_NUM, FONT_DISPLAY } from './tokens';
import { isoLocal, todayIso } from '../../lib/dateRange';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MON = MONTHS.map((m) => m.slice(0, 3));
const DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const pad = (n) => String(n).padStart(2, '0');
const parse = (iso) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d); };
const shift = (iso, days) => { const d = parse(iso); d.setDate(d.getDate() + days); return isoLocal(d); };
const valid = (iso) => typeof iso === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(iso);
/** "8 Nov 2026" */
const showDate = (iso) => (valid(iso) ? `${Number(iso.slice(8))} ${MON[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}` : '');

/** The 6 x 7 grid for a month, Sunday first, with the neighbouring months' days around it. */
function monthGrid(year, month) {
  const first = new Date(year, month, 1);
  const start = new Date(year, month, 1 - first.getDay());
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    return { iso: isoLocal(d), day: d.getDate(), inMonth: d.getMonth() === month, sunday: d.getDay() === 0 };
  });
}

/**
 * One date, picked from a calendar card (the "Select date" reference: month and
 * year dropdowns, a calendar tile showing the chosen day, Sundays marked, today
 * underlined, Confirm). Drawn in the app's own monochrome, light or dark.
 *
 * value / onChange  'YYYY-MM-DD'
 * min / max         'YYYY-MM-DD', days outside are not selectable
 * sx                style of the closed field, so it matches the inputs around it
 */
export default function DateField({ value, onChange, min, max, sx, label = 'Date', placeholder = 'Pick a date', disabled }) {
  const t = useFx();
  const [anchor, setAnchor] = useState(null);
  return (
    <>
      <ButtonBase disabled={disabled} onClick={(e) => setAnchor(e.currentTarget)} aria-label={`${label}: ${showDate(value) || 'not set'}`} aria-haspopup="dialog"
        sx={{
          height: 40, px: 1.25, borderRadius: '12px', border: `1px solid ${t.border}`, bgcolor: t.surface2, color: t.ink,
          fontSize: '0.84rem', fontFamily: FONT_NUM, justifyContent: 'space-between', gap: 1, width: '100%', textAlign: 'left',
          transition: 'border-color .16s', '&:hover': { borderColor: t.muted }, '&.Mui-focusVisible': { borderColor: t.ink },
          ...(anchor ? { borderColor: t.ink } : null),
          ...sx,
        }}>
        <Box component="span" sx={{ color: value ? 'inherit' : t.muted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{showDate(value) || placeholder}</Box>
        <EventRounded sx={{ fontSize: '1.05em', color: t.muted, flexShrink: 0 }} />
      </ButtonBase>
      <Popover open={!!anchor} anchorEl={anchor} onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }} transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        slotProps={{ paper: { sx: { mt: 0.75, borderRadius: '24px', border: `1px solid ${t.border}`, bgcolor: t.surface, backgroundImage: 'none', boxShadow: t.shadowLg, overflow: 'visible' } } }}>
        {anchor && <DatePanel value={value} min={min} max={max} onConfirm={(iso) => { onChange(iso); setAnchor(null); }} />}
      </Popover>
    </>
  );
}

/** The calendar card itself (also usable inline). */
export function DatePanel({ value, min, max, onConfirm }) {
  const t = useFx();
  const today = todayIso();
  const clamp = (iso) => (min && iso < min ? min : max && iso > max ? max : iso);
  const [draft, setDraft] = useState(() => clamp(valid(value) ? value : today));
  const [view, setView] = useState(() => ({ y: Number(draft.slice(0, 4)), m: Number(draft.slice(5, 7)) - 1 }));
  const gridRef = useRef(null);
  useEffect(() => { gridRef.current?.focus({ preventScroll: true }); }, []);

  const cells = useMemo(() => monthGrid(view.y, view.m), [view]);
  const thisYear = Number(today.slice(0, 4));
  const lo = min ? Number(min.slice(0, 4)) : thisYear - 30;
  const hi = max ? Number(max.slice(0, 4)) : thisYear + 5;
  const years = Array.from({ length: hi - lo + 1 }, (_, i) => hi - i);
  const allowed = (iso) => (!min || iso >= min) && (!max || iso <= max);
  const pick = (iso) => {
    if (!allowed(iso)) return;
    setDraft(iso);
    setView({ y: Number(iso.slice(0, 4)), m: Number(iso.slice(5, 7)) - 1 });
  };
  const goMonth = (y, m) => {
    setView({ y, m });
    // Keep the same day where it exists, so the tile and the grid agree.
    const day = Math.min(Number(draft.slice(8)), new Date(y, m + 1, 0).getDate());
    const iso = clamp(`${y}-${pad(m + 1)}-${pad(day)}`);
    setDraft(iso);
  };
  // Scrolling over the calendar (wheel, trackpad or a swipe) moves a month at a time.
  // The handler is re-pointed every render so it always sees the current month.
  const stepMonth = useRef(null);
  useEffect(() => {
    stepMonth.current = (dir) => {
      const m = view.m + dir;
      const y = view.y + Math.floor(m / 12);
      if (y < lo || y > hi) return;
      goMonth(y, ((m % 12) + 12) % 12);
    };
  });
  useEffect(() => {
    const el = gridRef.current;
    if (!el) return undefined;
    let acc = 0; let last = 0; let touchY = null;
    const step = (dy) => {
      acc += dy;
      const now = Date.now();
      // One month per gesture notch; a long trackpad fling does not race through a year.
      if (Math.abs(acc) >= 40 && now - last > 180) { stepMonth.current?.(acc > 0 ? 1 : -1); acc = 0; last = now; }
    };
    const onWheel = (e) => { e.preventDefault(); step(e.deltaY); };
    const onTouchStart = (e) => { touchY = e.touches[0].clientY; acc = 0; };
    const onTouchMove = (e) => {
      if (touchY === null) return;
      e.preventDefault();
      const y = e.touches[0].clientY; step(touchY - y); touchY = y;
    };
    const onTouchEnd = () => { touchY = null; };
    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd);
    return () => {
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
    };
  }, []);

  const onKey = (e) => {
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
    if (step) { e.preventDefault(); pick(clamp(shift(draft, step))); return; }
    if (e.key === 'PageUp' || e.key === 'PageDown') {
      e.preventDefault();
      const d = parse(draft); d.setMonth(d.getMonth() + (e.key === 'PageUp' ? -1 : 1));
      pick(clamp(isoLocal(d)));
      return;
    }
    if (e.key === 'Enter') { e.preventDefault(); onConfirm(draft); }
  };

  const selectSx = {
    height: 38, borderRadius: '12px', bgcolor: t.surface2, fontSize: '0.84rem', fontWeight: 650, color: t.ink,
    '& .MuiOutlinedInput-notchedOutline': { border: 0 },
    '& .MuiSelect-select': { py: 0, pl: 1.5, pr: '32px !important', display: 'flex', alignItems: 'center' },
    '& .MuiSelect-icon': { color: t.muted, right: 6 },
    '&.Mui-focused': { boxShadow: 'none', outline: `2px solid ${t.ink}`, outlineOffset: 1 },
  };
  const menu = { slotProps: { paper: { sx: { borderRadius: '14px', mt: 0.5, maxHeight: 280, border: `1px solid ${t.border}` } } } };

  return (
    <Box role="dialog" aria-label="Select date" sx={{ width: { xs: 'calc(100vw - 32px)', sm: 340 }, maxWidth: 340, p: 2.5, pb: 2.25, color: t.ink }}>
      <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1.5 }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ fontFamily: FONT_DISPLAY, fontSize: '1.35rem', fontWeight: 750, letterSpacing: '-0.03em', lineHeight: 1.1 }}>Select date</Typography>
          <Box sx={{ display: 'flex', gap: 1, mt: 1.5 }}>
            <Select size="small" value={view.m} onChange={(e) => goMonth(view.y, Number(e.target.value))} IconComponent={KeyboardArrowDownRounded}
              inputProps={{ 'aria-label': 'Month' }} sx={{ ...selectSx, minWidth: 138 }} MenuProps={menu}>
              {MONTHS.map((m, i) => <MenuItem key={m} value={i} sx={{ fontSize: '0.82rem' }}>{m}</MenuItem>)}
            </Select>
            <Select size="small" value={view.y} onChange={(e) => goMonth(Number(e.target.value), view.m)} IconComponent={KeyboardArrowDownRounded}
              inputProps={{ 'aria-label': 'Year' }} sx={{ ...selectSx, fontFamily: FONT_NUM }} MenuProps={menu}>
              {years.map((y) => <MenuItem key={y} value={y} sx={{ fontSize: '0.82rem', fontFamily: FONT_NUM }}>{y}</MenuItem>)}
            </Select>
          </Box>
        </Box>
        <DayTile day={Number(draft.slice(8))} />
      </Box>

      <Box ref={gridRef} role="grid" tabIndex={0} onKeyDown={onKey} aria-label={`${MONTHS[view.m]} ${view.y}`}
        sx={{ mt: 2.25, outline: 'none', borderRadius: '12px', '&:focus-visible': { boxShadow: `0 0 0 2px ${t.border}` } }}>
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', mb: 0.5 }}>
          {DAYS.map((d, i) => (
            <Box key={d} sx={{ textAlign: 'center', fontSize: '0.66rem', fontWeight: 700, letterSpacing: '0.02em', color: i === 0 ? t.pos : t.ink2, py: 0.5 }}>{d}</Box>
          ))}
        </Box>
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', rowGap: 0.25 }}>
          {cells.map((c) => {
            const on = c.iso === draft;
            const ok = allowed(c.iso);
            const isToday = c.iso === today;
            return (
              <ButtonBase key={c.iso} role="gridcell" aria-selected={on} aria-label={showDate(c.iso)} disabled={!ok} tabIndex={-1}
                onClick={() => pick(c.iso)} onDoubleClick={() => ok && onConfirm(c.iso)}
                sx={{ height: 38, display: 'grid', placeItems: 'center' }}>
                <Box component="span" sx={{
                  position: 'relative', width: 34, height: 34, borderRadius: '50%', display: 'grid', placeItems: 'center',
                  fontFamily: FONT_NUM, fontSize: '0.84rem', fontWeight: 650, fontVariantNumeric: 'tabular-nums',
                  transition: 'background-color .14s, color .14s',
                  color: on ? t.invInk : !c.inMonth ? t.muted : c.sunday ? t.pos : t.ink,
                  bgcolor: on ? t.inv : 'transparent',
                  opacity: !ok ? 0.25 : c.inMonth || on ? 1 : 0.45,
                  '@media (hover: hover)': { '&:hover': { bgcolor: on ? t.inv : t.hover } },
                  '&::after': isToday && !on ? { content: '""', position: 'absolute', bottom: 5, left: '50%', width: 14, height: 2, borderRadius: 2, bgcolor: t.pos, transform: 'translateX(-50%)' } : undefined,
                }}>{pad(c.day)}</Box>
              </ButtonBase>
            );
          })}
        </Box>
      </Box>

      <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2 }}>
        <ButtonBase onClick={() => onConfirm(draft)}
          sx={{
            height: 44, width: '62%', borderRadius: '14px', bgcolor: t.inv, color: t.invInk, fontSize: '0.88rem', fontWeight: 700,
            boxShadow: '0 10px 24px -12px rgba(0,0,0,.55)', transition: 'transform .12s ease, opacity .12s',
            '&:hover': { opacity: 0.92 }, '&:active': { transform: 'scale(0.98)' }, '&.Mui-focusVisible': { outline: `2px solid ${t.ink}`, outlineOffset: 2 },
          }}>Confirm</ButtonBase>
      </Box>
    </Box>
  );
}

/** Desk-calendar tile with the chosen day, in the inverse of the surface (black on light, white on dark). */
function DayTile({ day }) {
  const t = useFx();
  return (
    <Box aria-hidden sx={{ position: 'relative', flexShrink: 0, width: 62, height: 64, mt: 0.25 }}>
      {[14, 40].map((left) => (
        <Box key={left} sx={{ position: 'absolute', top: 0, left, width: 7, height: 12, borderRadius: 4, bgcolor: t.pos, zIndex: 1 }} />
      ))}
      <Box sx={{
        position: 'absolute', inset: '5px 0 0 0', borderRadius: '12px', overflow: 'hidden', display: 'grid', placeItems: 'center',
        background: `linear-gradient(180deg, ${t.inv} 0 50%, color-mix(in srgb, ${t.inv} 84%, ${t.invInk}) 50% 100%)`,
        boxShadow: '0 10px 22px -12px rgba(0,0,0,.6)',
      }}>
        <Box component="span" sx={{ fontFamily: FONT_NUM, fontSize: '1.75rem', fontWeight: 800, letterSpacing: '-0.04em', color: t.invInk, lineHeight: 1 }}>{pad(day)}</Box>
      </Box>
    </Box>
  );
}
