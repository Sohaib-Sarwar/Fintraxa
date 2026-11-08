import { useMemo, useState } from 'react';
import { Box, Typography, Tooltip, useTheme } from '@mui/material';
import { InfoOutlined } from '@mui/icons-material';
import { benchmarkSeries, sameWindowIndex } from '../../lib/snapshots/series';
import { useIndexHistory } from '../../lib/market/useIndexHistory';
import { todayIso } from '../../lib/dateRange';
import { useFx } from './tokens';
import { Panel } from './Dashboard';
import Seg from './Seg';
import FlowChart from './FlowChart';

const PERIODS = [{ value: 'day', label: 'Daily' }, { value: 'week', label: 'Weekly' }, { value: 'month', label: 'Monthly' }];
const COLORS = { light: { mine: '#2a78d6', index: '#eda100' }, dark: { mine: '#3987e5', index: '#c98500' } };
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pctAbs = (n) => `${n.toFixed(2)}%`;
const signedPct = (n) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toFixed(2)}%`;

/**
 * Your share portfolio against KSE-100, as % since 1 January (calendar year to date).
 * Portfolio: daily time-weighted returns from the snapshots, so buying and selling are
 * not counted as gains; dividends are, as they are in KSE-100 (a total-return index).
 * rows: portfolio_snapshots rows; left: the control that replaces the title (view switch).
 */
export default function BenchmarkChart({ rows, left, index = 'KSE100', indexLabel = 'KSE-100', height = 280, fill = false }) {
  const t = useFx();
  const mode = useTheme().palette.mode;
  const [period, setPeriod] = useState('week');
  const today = todayIso();
  const start = `${today.slice(0, 4)}-01-01`;
  const { data: closes = [], isLoading } = useIndexHistory(index, start);
  const points = useMemo(() => benchmarkSeries(rows ?? [], closes, { period, start, today }), [rows, closes, period, start, today]);
  const last = [...points].reverse().find((p) => p.portfolio !== null || p.index !== null);
  const series = [
    { key: 'portfolio', label: 'Your shares', color: COLORS[mode].mine },
    { key: 'index', label: indexLabel, color: COLORS[mode].index },
  ];
  // Started holding after 1 January: judge "ahead / behind" over the same days only.
  const fair = useMemo(() => sameWindowIndex(rows ?? [], closes, { start, today }), [rows, closes, start, today]);
  const ahead = last && last.portfolio !== null
    ? (fair ? Math.round((last.portfolio - fair.index) * 100) / 100 : last.gap)
    : null;
  const fmtDay = (iso) => `${Number(iso.slice(8, 10))} ${MON[Number(iso.slice(5, 7)) - 1]}`;

  return (
    <Panel sx={fill ? { height: '100%', minHeight: 0 } : undefined}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1.5, mb: 1, flexWrap: 'wrap' }}>
        {left ?? <Typography component="h2" sx={{ fontSize: '0.92rem', fontWeight: 650, color: t.ink }}>Return vs {indexLabel}</Typography>}
        <Seg size="sm" label="Chart period" value={period} onChange={setPeriod} options={PERIODS} />
      </Box>
      {last && (
        <Box sx={{ display: 'flex', gap: 2.5, flexWrap: 'wrap', mb: 1, fontSize: '0.74rem', color: t.muted }}>
          <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
            Since 1 {MON[0]} {start.slice(0, 4)}
            <Tooltip arrow title={`Time-weighted: price moves and dividends count, money you add or take out does not. ${indexLabel} includes dividends too.`}>
              <InfoOutlined sx={{ fontSize: 14, cursor: 'help' }} aria-label="How the return is measured" />
            </Tooltip>
          </Box>
          {last.portfolio !== null && <span>You <Box component="b" sx={{ color: last.portfolio < 0 ? t.neg : t.pos }}>{signedPct(last.portfolio)}</Box></span>}
          {last.index !== null && <span>{indexLabel} <Box component="b" sx={{ color: last.index < 0 ? t.neg : t.pos }}>{signedPct(last.index)}</Box></span>}
          {fair && <span>{indexLabel} since you started ({fmtDay(fair.since)}) <Box component="b" sx={{ color: fair.index < 0 ? t.neg : t.pos }}>{signedPct(fair.index)}</Box></span>}
          {ahead !== null && <span><Box component="b" sx={{ color: ahead < 0 ? t.neg : t.pos }}>{signedPct(ahead)}</Box> {ahead >= 0 ? 'ahead of' : 'behind'} the index{fair ? ' over the same period' : ''}</span>}
        </Box>
      )}
      {fill ? (
        // Fill the panel (desktop dashboards fit one screen): the chart takes whatever height is left.
        <Box sx={{ flex: 1, minHeight: 200, position: 'relative' }}>
          <Box sx={{ position: 'absolute', inset: 0 }}>
            <FlowChart points={points} series={series} height="100%" zeroBased={false}
        fmt={pctAbs} axisFormat={(v) => `${v}%`}
        emptyText={isLoading ? 'Loading index closes' : `No ${indexLabel} closes or share holdings since 1 January yet`}
        headline={(p) => (p.gap !== null ? { value: p.gap, signed: true, caption: p.gap >= 0 ? `Ahead of ${indexLabel}` : `Behind ${indexLabel}` } : null)} />
          </Box>
        </Box>
      ) : <FlowChart points={points} series={series} height={height} zeroBased={false}
        fmt={pctAbs} axisFormat={(v) => `${v}%`}
        emptyText={isLoading ? 'Loading index closes' : `No ${indexLabel} closes or share holdings since 1 January yet`}
        headline={(p) => (p.gap !== null ? { value: p.gap, signed: true, caption: p.gap >= 0 ? `Ahead of ${indexLabel}` : `Behind ${indexLabel}` } : null)} />}
    </Panel>
  );
}
