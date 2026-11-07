import { useState } from 'react';
import { Box, ButtonBase, IconButton, Tooltip, Typography, useMediaQuery } from '@mui/material';
import { FormatListBulletedRounded, DonutLargeRounded } from '@mui/icons-material';
import AllocationDonut from './AllocationDonut';
import { useFx, FONT_NUM, signColor } from './tokens';
import Seg from './Seg';

const COLS = 'minmax(0, 1fr) 112px 104px';
const VIEW_KEY = 'fx-holdings-view';
const readView = () => { try { return localStorage.getItem(VIEW_KEY) === 'chart' ? 'chart' : 'list'; } catch { return 'list'; } };
const saveView = (v) => { try { localStorage.setItem(VIEW_KEY, v); } catch { /* preference only */ } };
const signed = (v, fmt) => (v === null || v === undefined ? '—' : `${v > 0 ? '+' : v < 0 ? '−' : ''}${fmt(Math.abs(v))}`);

/**
 * A formal holdings list with Current / Previous tabs. On desktop the card
 * takes the height of its grid row (the chart beside it) and the list
 * scrolls inside, so a long list never stretches the page.
 *
 * tabs: [{ value, label, columns: [first, middle, right], empty, rows: [
 *   { key, logo, title, sub, main, mainMuted?, gain, gainSub?, onClick } ] }]
 * formatMoney: number → string, used for the signed gain column.
 * chart: optional { items, centerLabel } — adds a List / Chart switch; Chart
 *   shows the allocation donut of what is held (the choice is remembered).
 */
export default function HoldingsCard({ title = 'Holdings', tabs, formatMoney, chart }) {
  const t = useFx();
  const isMobile = useMediaQuery('(max-width:900px)');
  const [tab, setTab] = useState(tabs[0].value);
  const [view, setViewState] = useState(readView);
  const setView = (v) => { setViewState(v); saveView(v); };
  const showChart = !!chart && view === 'chart';
  const current = tabs.find((x) => x.value === tab) ?? tabs[0];
  const toggle = chart && (
    <Box sx={{ display: 'flex', gap: 0.25, p: '3px', borderRadius: 999, border: `1px solid ${t.border}`, bgcolor: t.surface2 }} role="group" aria-label="Holdings view">
      {[['list', 'List', FormatListBulletedRounded], ['chart', 'Chart', DonutLargeRounded]].map(([v, label, Icon]) => (
        <Tooltip key={v} title={label}>
          <IconButton size="small" aria-label={`${label} view`} aria-pressed={view === v} onClick={() => setView(v)}
            sx={{ width: 28, height: 28, borderRadius: 999, color: view === v ? t.ink : t.muted, bgcolor: view === v ? t.surface : 'transparent',
              boxShadow: view === v && t.shadow !== 'none' ? '0 1px 2px rgba(0,0,0,.08)' : 'none', '&:hover': { bgcolor: view === v ? t.surface : t.hover } }}>
            <Icon sx={{ fontSize: 16 }} />
          </IconButton>
        </Tooltip>
      ))}
    </Box>
  );

  const card = (
    <Box component="section" sx={{
      bgcolor: t.surface, border: `1px solid ${t.border}`, borderRadius: '20px', boxShadow: t.shadow,
      p: { xs: 1.75, md: 2.25 }, display: 'flex', flexDirection: 'column', minWidth: 0,
      height: isMobile ? 440 : '100%', boxSizing: 'border-box',
    }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1.5, mb: 1.25, flexWrap: 'wrap', minHeight: 32, flexShrink: 0 }}>
        <Typography component="h2" sx={{ fontSize: '0.92rem', fontWeight: 650, color: t.ink, letterSpacing: '-0.01em' }}>{title}</Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
          {tabs.length > 1 && !showChart && (
            <Seg size="sm" label={title} value={tab} onChange={setTab} options={tabs.map((x) => ({ value: x.value, label: `${x.label} ${x.rows.length}` }))} />
          )}
          {toggle}
        </Box>
      </Box>

      {showChart ? (
        <AllocationDonut items={chart.items} centerLabel={chart.centerLabel ?? 'Value'} />
      ) : (
      <>
      <Box sx={{ display: 'grid', gridTemplateColumns: COLS, columnGap: 1.5, px: 1, pb: 0.75, borderBottom: `1px solid ${t.hairline}`, flexShrink: 0 }}>
        {current.columns.map((c, i) => (
          <Typography key={c} sx={{ fontSize: '0.68rem', fontWeight: 600, color: t.muted, textAlign: i === 0 ? 'left' : 'right' }}>{c}</Typography>
        ))}
      </Box>

      <Box sx={{
        flex: 1, minHeight: 0, overflowY: 'auto', mr: -1, pr: 1,
        scrollbarWidth: 'thin', scrollbarColor: `${t.border} transparent`,
        '&::-webkit-scrollbar': { width: 6 }, '&::-webkit-scrollbar-thumb': { background: t.border, borderRadius: 999 },
      }}>
        {current.rows.length === 0
          ? <Typography sx={{ fontSize: '0.8rem', color: t.muted, py: 4, textAlign: 'center' }}>{current.empty}</Typography>
          : current.rows.map((r) => <Row key={r.key} r={r} formatMoney={formatMoney} />)}
      </Box>
      </>
      )}
    </Box>
  );

  return isMobile ? card : <Box sx={{ position: 'relative', minHeight: 300 }}><Box sx={{ position: 'absolute', inset: 0 }}>{card}</Box></Box>;
}

function Row({ r, formatMoney }) {
  const t = useFx();
  return (
    <ButtonBase onClick={r.onClick} aria-label={`${r.title}: details`} sx={{
      display: 'grid', gridTemplateColumns: COLS, columnGap: 1.5, alignItems: 'center', width: '100%', px: 1, py: 1.1,
      textAlign: 'left', fontFamily: 'inherit', borderBottom: `1px solid ${t.hairline}`, borderRadius: 0,
      '&:last-of-type': { borderBottom: 0 }, '@media (hover: hover)': { '&:hover': { bgcolor: t.surface2 } },
      '&:focus-visible': { outline: `2px solid ${t.ink}`, outlineOffset: -2 },
    }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, minWidth: 0 }}>
        {r.logo}
        <Box sx={{ minWidth: 0 }}>
          <Typography noWrap sx={{ fontSize: '0.82rem', fontWeight: 600, color: t.ink }}>{r.title}</Typography>
          <Typography noWrap sx={{ fontSize: '0.68rem', color: t.muted }}>{r.sub}</Typography>
        </Box>
      </Box>
      <Typography data-numeric noWrap sx={{ fontFamily: FONT_NUM, fontSize: r.mainMuted ? '0.76rem' : '0.86rem', fontWeight: r.mainMuted ? 500 : 600, letterSpacing: '-0.02em', color: r.mainMuted ? t.ink2 : t.ink, textAlign: 'right' }}>
        {r.main}
      </Typography>
      <Box sx={{ textAlign: 'right', minWidth: 0 }}>
        <Typography data-numeric noWrap sx={{ fontFamily: FONT_NUM, fontSize: '0.84rem', fontWeight: 600, letterSpacing: '-0.02em', color: signColor(t, r.gain ?? 0) }}>{signed(r.gain, formatMoney)}</Typography>
        {r.gainSub && <Typography data-numeric noWrap sx={{ fontFamily: FONT_NUM, fontSize: '0.66rem', color: t.muted }}>{r.gainSub}</Typography>}
      </Box>
    </ButtonBase>
  );
}
