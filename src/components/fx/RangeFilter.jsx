import { useState } from 'react';
import { Box, ButtonBase, Popover, Drawer, IconButton, useMediaQuery } from '@mui/material';
import {
  CalendarMonthRounded, KeyboardArrowDownRounded, ChevronLeftRounded, ChevronRightRounded, CheckRounded,
} from '@mui/icons-material';
import Seg from './Seg';
import { useFx } from './tokens';
import {
  useDateRange, presets, rangeLabel, todayIso, fyOf, fyLabel, addMonths, shortDate,
} from '../../lib/dateRange';

const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEK = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const pad = (n) => String(n).padStart(2, '0');

/**
 * The one date filter, used on every dashboard. The switch flips between the
 * two ranges people use most (this fiscal year, Jul–Jun, and year to date);
 * the button opens every other preset and a two-month calendar.
 * The choice is global: change it on one page and every page follows.
 */
export default function RangeFilter({ compact = false }) {
  const t = useFx();
  const isMobile = useMediaQuery('(max-width:768px)');
  const { range, setRange } = useDateRange();
  const [anchor, setAnchor] = useState(null);
  const today = todayIso();
  const fy = fyLabel(fyOf(today));

  const picker = anchor && (
    <Picker value={range} onClose={() => setAnchor(null)} onApply={(r) => { setRange(r); setAnchor(null); }} mobile={isMobile} />
  );

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'nowrap', minWidth: 0 }}>
      {!compact && (
        <Seg label="Period" size="sm" inverse value={range.id} onChange={(id) => setRange({ id })}
          options={[{ value: 'fy', label: fy, title: 'Fiscal year: 1 July to 30 June' }, { value: 'ytd', label: 'YTD', title: '1 January to today' }]} />
      )}
      <ButtonBase aria-haspopup="dialog" aria-expanded={!!anchor} title="Choose a date range"
        onClick={(e) => setAnchor(anchor ? null : e.currentTarget)}
        sx={{
          display: 'inline-flex', alignItems: 'center', gap: 0.75, height: 34, pl: 0.5, pr: 1, borderRadius: 999,
          ...t.glass, color: t.ink, fontWeight: 600, fontSize: '0.76rem',
          whiteSpace: 'nowrap', fontFamily: 'inherit', transition: 'background .16s ease',
          '@media (hover: hover)': { '&:hover': { background: t.glassHover } },
        }}>
        <Box sx={{ width: 26, height: 26, borderRadius: 999, display: 'grid', placeItems: 'center', ...t.glassThumb }}>
          <CalendarMonthRounded sx={{ fontSize: 15 }} />
        </Box>
        <Box component="span" sx={{ maxWidth: isMobile ? 120 : 'none', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {range.id === 'fy' || range.id === 'ytd' ? (isMobile ? 'More' : 'Range') : rangeLabel(range)}
        </Box>
        <KeyboardArrowDownRounded sx={{ fontSize: 17, color: t.muted, transition: 'transform .3s', transform: anchor ? 'rotate(180deg)' : 'none' }} />
      </ButtonBase>

      {isMobile ? (
        <Drawer anchor="bottom" open={!!anchor} onClose={() => setAnchor(null)}
          slotProps={{ paper: { sx: { borderRadius: '22px 22px 0 0', bgcolor: t.surface, backgroundImage: 'none', pb: 'env(safe-area-inset-bottom)' } } }}>
          {picker}
        </Drawer>
      ) : (
        <Popover open={!!anchor} anchorEl={anchor} onClose={() => setAnchor(null)}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }} transformOrigin={{ vertical: 'top', horizontal: 'right' }}
          slotProps={{ paper: { sx: { mt: 1, borderRadius: '20px', border: `1px solid ${t.border}`, boxShadow: t.shadowLg, bgcolor: t.surface, backgroundImage: 'none', overflow: 'hidden' } } }}>
          {picker}
        </Popover>
      )}
    </Box>
  );
}

function Picker({ value, onApply, onClose, mobile }) {
  const t = useFx();
  const today = todayIso();
  const list = presets(today);
  const [draft, setDraft] = useState({ start: value.id === 'all' ? null : value.start, end: value.id === 'all' ? null : value.end });
  const [hover, setHover] = useState(null);
  const endM = (value.end < today ? value.end : today).slice(0, 7);
  const [left, setLeft] = useState(mobile ? endM : addMonths(endM, -1));

  const pick = (iso) => {
    if (!draft.start || draft.end || iso < draft.start) setDraft({ start: iso, end: null });
    else setDraft({ start: draft.start, end: iso });
  };
  const end = draft.end || (draft.start && hover && hover >= draft.start ? hover : null);
  const valid = draft.start && draft.end && draft.start <= draft.end;

  const month = (m) => {
    const [y, mo] = m.split('-').map(Number);
    const lead = (new Date(y, mo - 1, 1).getDay() + 6) % 7;
    const n = new Date(y, mo, 0).getDate();
    const cells = [];
    for (let i = 0; i < lead; i++) cells.push(<span key={`b${i}`} />);
    for (let d = 1; d <= n; d++) {
      const iso = `${m}-${pad(d)}`;
      const col = (lead + d - 1) % 7;
      const isS = iso === draft.start;
      const isE = iso === end;
      const inR = draft.start && end && iso >= draft.start && iso <= end;
      const rowStart = col === 0 || d === 1;
      const rowEnd = col === 6 || d === n;
      cells.push(
        <ButtonBase key={iso} onClick={() => pick(iso)} onMouseEnter={() => setHover(iso)} aria-label={shortDate(iso)} aria-pressed={isS || isE}
          sx={{
            position: 'relative', height: 34, fontSize: '0.74rem', fontFamily: 'inherit', color: iso > today ? t.muted : t.ink,
            '&::before': inR ? {
              content: '""', position: 'absolute', top: 2, bottom: 2, bgcolor: t.surface3,
              left: isS && !isE ? '50%' : 0, right: isE && !isS ? '50%' : 0,
              borderRadius: `${rowStart && !isS ? 999 : 0}px ${rowEnd && !isE ? 999 : 0}px ${rowEnd && !isE ? 999 : 0}px ${rowStart && !isS ? 999 : 0}px`,
              display: isS && isE ? 'none' : 'block',
            } : {},
            // Target the number by class: ButtonBase adds its own ripple <span> as a child.
            '& > .day': {
              position: 'relative', zIndex: 1, width: 32, height: 32, display: 'grid', placeItems: 'center', borderRadius: '50%',
              bgcolor: isS || isE ? t.inv : 'transparent', color: isS || isE ? t.invInk : undefined, fontWeight: isS || isE ? 700 : 500,
              boxShadow: iso === today && !(isS || isE) ? `inset 0 0 0 1.5px ${t.net}` : 'none', transition: 'background-color .15s',
            },
            '&:hover > .day': isS || isE ? {} : { bgcolor: t.hover },
          }}>
          <span className="day">{d}</span>
        </ButtonBase>,
      );
    }
    return cells;
  };

  const months = mobile ? [left] : [left, addMonths(left, 1)];
  const input = { height: 34, padding: '0 10px', borderRadius: 10, border: `1px solid ${t.border}`, background: t.surface2, color: t.ink, font: 'inherit', fontSize: '0.74rem', colorScheme: 'inherit', minWidth: 0 };

  return (
    <Box role="dialog" aria-label="Choose date range" sx={{ display: 'grid', gridTemplateColumns: mobile ? '1fr' : 'auto 196px', color: t.ink }}>
      <Box sx={{ px: mobile ? 1.75 : 2.25, pt: 1.75, display: 'flex', flexDirection: 'column', order: mobile ? 2 : 1 }}>
        <Box sx={{ display: 'grid', gridTemplateColumns: mobile ? '1fr' : 'repeat(2, 252px)', gap: 2.75 }} onMouseLeave={() => setHover(null)}>
          {months.map((m, i) => {
            const [y, mo] = m.split('-').map(Number);
            return (
              <Box key={m}>
                <Box sx={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', height: 34, fontWeight: 700, fontSize: '0.82rem', mb: 0.5 }}>
                  {(i === 0 || mobile) && (
                    <IconButton size="small" aria-label="Previous month" onClick={() => setLeft(addMonths(left, -1))} sx={{ position: 'absolute', left: 0 }}><ChevronLeftRounded fontSize="small" /></IconButton>
                  )}
                  {MONTHS_LONG[mo - 1]} {y}
                  {(i === months.length - 1) && (
                    <IconButton size="small" aria-label="Next month" onClick={() => setLeft(addMonths(left, 1))} sx={{ position: 'absolute', right: 0 }}><ChevronRightRounded fontSize="small" /></IconButton>
                  )}
                </Box>
                <Box sx={{ display: 'grid', gridTemplateColumns: mobile ? 'repeat(7, 1fr)' : 'repeat(7, 36px)', rowGap: '3px' }}>
                  {WEEK.map((w, k) => <Box key={k} sx={{ textAlign: 'center', fontSize: '0.66rem', color: t.muted, fontWeight: 650, height: 24, lineHeight: '24px' }}>{w}</Box>)}
                  {month(m)}
                </Box>
              </Box>
            );
          })}
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', py: 1.5, mt: 1.25, borderTop: `1px solid ${t.hairline}` }}>
          <input type="date" aria-label="Start date" style={{ ...input, flex: mobile ? 1 : 'none' }} value={draft.start || ''}
            onChange={(e) => e.target.value && setDraft({ start: e.target.value, end: draft.end && draft.end >= e.target.value ? draft.end : null })} />
          <Box component="span" sx={{ color: t.muted }}>–</Box>
          <input type="date" aria-label="End date" style={{ ...input, flex: mobile ? 1 : 'none' }} value={draft.end || ''} min={draft.start || undefined}
            onChange={(e) => e.target.value && setDraft({ start: draft.start || e.target.value, end: e.target.value })} />
          <Box sx={{ flex: 1 }} />
          <PillButton onClick={onClose}>Cancel</PillButton>
          <PillButton primary disabled={!valid} onClick={() => onApply({ id: 'custom', start: draft.start, end: draft.end })}>Apply</PillButton>
        </Box>
      </Box>
      <Box sx={{
        display: 'flex', flexDirection: mobile ? 'row' : 'column', gap: '2px', p: 1.25, bgcolor: t.surface2, order: mobile ? 1 : 2,
        borderLeft: mobile ? 'none' : `1px solid ${t.hairline}`, borderBottom: mobile ? `1px solid ${t.hairline}` : 'none',
        overflowX: mobile ? 'auto' : 'visible', scrollbarWidth: 'none', '&::-webkit-scrollbar': { display: 'none' },
      }}>
        {!mobile && <Box sx={{ fontSize: '0.66rem', fontWeight: 700, color: t.muted, letterSpacing: '.04em', textTransform: 'uppercase', px: 1.5, py: 0.75 }}>Quick ranges</Box>}
        {list.map((p) => {
          const on = value.id === p.id;
          return (
            <ButtonBase key={p.id} aria-pressed={on} onClick={() => onApply({ id: p.id })}
              sx={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, textAlign: 'left', px: 1.5, py: 1,
                borderRadius: '12px', fontSize: '0.78rem', fontWeight: 620, fontFamily: 'inherit', flex: 'none', whiteSpace: 'nowrap',
                bgcolor: on ? t.inv : 'transparent', color: on ? t.invInk : t.ink, transition: 'background-color .16s',
                '@media (hover: hover)': { '&:hover': on ? {} : { bgcolor: t.hover } },
              }}>
              <span>
                {p.label}
                {!mobile && <Box component="small" sx={{ display: 'block', fontSize: '0.66rem', fontWeight: 500, opacity: on ? 0.7 : 1, color: on ? 'inherit' : t.muted, mt: '1px' }}>{p.id.endsWith('fy') ? p.short : p.sub}</Box>}
              </span>
              {on && !mobile && <CheckRounded sx={{ fontSize: 16 }} />}
            </ButtonBase>
          );
        })}
      </Box>
    </Box>
  );
}

function PillButton({ primary, disabled, onClick, children }) {
  const t = useFx();
  return (
    <ButtonBase disabled={disabled} onClick={onClick} sx={{
      height: 34, px: 1.75, borderRadius: 999, fontSize: '0.76rem', fontWeight: 650, fontFamily: 'inherit',
      border: `1px solid ${primary ? 'transparent' : t.border}`, bgcolor: primary ? t.inv : t.surface, color: primary ? t.invInk : t.ink,
      opacity: disabled ? 0.4 : 1, transition: 'opacity .16s, background-color .16s',
      '@media (hover: hover)': { '&:hover': { opacity: disabled ? 0.4 : 0.86 } },
    }}>{children}</ButtonBase>
  );
}
