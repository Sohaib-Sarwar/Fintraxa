import { useMemo, useState } from 'react';
import { Box, Typography, useTheme } from '@mui/material';
import { valueSeries } from '../../lib/snapshots/series';
import { todayIso } from '../../lib/dateRange';
import { formatCurrency } from '../../lib/formatters';
import { useFx } from './tokens';
import { Panel } from './Dashboard';
import Seg from './Seg';
import FlowChart from './FlowChart';

const PERIODS = [{ value: 'day', label: 'Daily' }, { value: 'week', label: 'Weekly' }, { value: 'month', label: 'Monthly' }, { value: 'year', label: 'Yearly' }];
const COLORS = { light: { value: '#2a78d6' }, dark: { value: '#3987e5' } };
const signed = (n) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${formatCurrency(Math.abs(n), 2)}`;

/**
 * Value vs invested over time, from daily snapshot rows ({ snap_date, value, cost, realized_day }).
 * Each point is the close of its day / week / month / fiscal year; hovering shows the
 * unrealized gain at that close and what was realized inside the period.
 *
 * rows      daily rows for what is selected (a holding, a group, or the whole asset class)
 * title     panel title; `left` replaces it with a control (e.g. a holding picker)
 * fillGaps  periods with nothing held show as zero instead of being skipped
 */
export default function ValueChart({ rows, range, title = 'Value vs invested', left, right, note, height = 280, fillGaps = true, defaultPeriod = 'month', emptyText }) {
  const t = useFx();
  const mode = useTheme().palette.mode;
  const [period, setPeriod] = useState(defaultPeriod);
  const today = todayIso();
  const points = useMemo(() => valueSeries(rows, { period, start: range.start, end: range.end, today, fillGaps }), [rows, period, range.start, range.end, today, fillGaps]);
  const series = [
    { key: 'value', label: 'Value', color: COLORS[mode].value },
    { key: 'invested', label: 'Invested', color: t.invested },
  ];
  return (
    <Panel>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1.5, mb: 1.5, flexWrap: 'wrap' }}>
        {left ?? <Typography component="h2" sx={{ fontSize: '0.92rem', fontWeight: 650, color: t.ink }}>{title}</Typography>}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          {right}
          <Seg size="sm" label="Chart period" value={period} onChange={setPeriod} options={PERIODS} />
        </Box>
      </Box>
      <FlowChart points={points} series={series} height={height}
        emptyText={emptyText ?? 'Nothing held in this period'}
        headline={(p) => ({ value: p.value, caption: p.live ? 'Value now' : `Value at the ${period === 'day' ? 'close' : `end of the ${period === 'year' ? 'fiscal year' : period}`}` })}
        rows={(p) => [
          { label: 'Unrealized gain', value: signed(p.unrealized), color: p.unrealized < 0 ? '#f87171' : '#86efac' },
          { label: period === 'day' ? 'Realized that day' : 'Realized in the period', value: signed(p.realized), color: 'rgba(255,255,255,0.85)' },
        ]} />
      {note && <Typography sx={{ fontSize: '0.66rem', color: t.muted, mt: 1 }}>{note}</Typography>}
    </Panel>
  );
}
