import { useMemo, useState } from 'react';
import { Box, Typography, Skeleton, Button, useMediaQuery, useTheme } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { useFinanceTransactions } from '../../lib/finance/useFinance';
import { ReceiptLongRounded, PaymentsRounded } from '@mui/icons-material';
import { analyzeSpending, isSpend, isActiveIncome } from '../../lib/finance/spending';
import { byFiscalYear } from '../../lib/finance/summary';
import { useDateRange, rangeLabel, ALL_TIME_START, todayIso } from '../../lib/dateRange';
import { formatCurrency } from '../../lib/formatters';
import {
  useFx, PageHeader, Panel, PanelHeader, SummaryCard, FlowChart, AllocationDonut, Seg, PillSelect, flowColors, categoryColors,
} from '../../components/fx';
import CategoryBadge from './CategoryBadge';

const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MONEY = (n) => formatCurrency(n, 2);
const fmtDay = (iso) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
/** A period as "23 Feb – 31 Dec 2025", with both years when it spans two. */
const fmtPeriod = (a, b) => (a.slice(0, 4) === b.slice(0, 4) ? `${fmtDay(a)} – ${fmtDay(b)} ${b.slice(0, 4)}` : `${fmtDay(a)} ${a.slice(0, 4)} – ${fmtDay(b)} ${b.slice(0, 4)}`);
/** Change as text; its colour depends on the side (more spending is bad, more income is good). */
const changeText = (pct) => (pct === null || pct === undefined ? null : `${pct > 0 ? '+' : pct < 0 ? '−' : ''}${Math.abs(pct).toFixed(1)}%`);

/**
 * Insights for the selected range, on two sides:
 *   Expenses  how much went out, at what pace, on what, against the period before
 *   Income    how much active income came in (salary, freelance, ...), from what, at what pace
 * Each side has its own category filter. Money moved into savings or investments is
 * not spending; passive income (profit, dividends) has its own page.
 */
export default function SpendingInsights() {
  const t = useFx();
  const mode = useTheme().palette.mode;
  const flow = flowColors(mode);
  const palette = categoryColors(mode);
  const isMobile = useMediaQuery('(max-width:900px)');
  const navigate = useNavigate();
  const { range } = useDateRange();
  const label = rangeLabel(range);
  const { data: txns, isLoading } = useFinanceTransactions();
  const [view, setView] = useState('month');
  const [side, setSideRaw] = useState('spend'); // 'spend' | 'income'
  const [picked, setCategory] = useState('all');
  const setSide = (v) => { setSideRaw(v); setCategory('all'); };
  const income = side === 'income';
  const isFocus = income ? isActiveIncome : isSpend;

  // Every category ever used on this side, biggest overall first.
  const cats = useMemo(() => {
    const m = new Map();
    for (const x of txns ?? []) {
      if (!isFocus(x)) continue;
      const name = x.categories?.name || 'Uncategorized';
      const cur = m.get(name) ?? { name, icon: x.categories?.icon ?? null, total: 0 };
      cur.total += Number(x.amount);
      m.set(name, cur);
    }
    return [...m.values()].sort((a, b) => b.total - a.total);
  }, [txns, isFocus]);
  const category = picked !== 'all' && cats.some((c) => c.name === picked) ? picked : null;
  const s = useMemo(() => (txns ? analyzeSpending(txns, range, todayIso(), { category, side }) : null), [txns, range, category, side]);
  const years = useMemo(() => (txns ? byFiscalYear(analyzeSpending(txns, { start: ALL_TIME_START, end: todayIso() }, todayIso(), { category, side }).months) : []), [txns, category, side]);
  const tone = (pct) => ((income ? -pct : pct) > 0 ? t.neg : pct !== 0 ? t.pos : t.ink2);

  const picker = cats.length > 0 && (
    <PillSelect value={category ?? 'all'} onChange={setCategory} label={income ? 'Income category' : 'Expense category'} width={isMobile ? 170 : 210}
      items={[
        income
          ? { value: 'all', label: 'All active income', icon: <PaymentsRounded sx={{ fontSize: 18 }} /> }
          : { value: 'all', label: 'All expenses', icon: <ReceiptLongRounded sx={{ fontSize: 18 }} /> },
        ...cats.map((c) => ({ value: c.name, label: c.name, icon: <CategoryBadge icon={c.icon} name={c.name} size={20} /> })),
      ]} />
  );
  const header = (
    <PageHeader title="Insights" actions={(
      <Box sx={{ display: 'flex', gap: 0.75, alignItems: 'center', flexWrap: 'wrap' }}>
        <Seg size="sm" label="Insights for" value={side} onChange={setSide} options={[{ value: 'spend', label: 'Expenses' }, { value: 'income', label: 'Income' }]} />
        {picker}
      </Box>
    )} />
  );

  if (isLoading || !s) {
    return (
      <Box>
        {header}
        <Skeleton variant="rounded" height={isMobile ? 220 : 150} sx={{ borderRadius: '20px', mb: 2 }} />
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '7fr 5fr' }, gap: 2 }}>
          <Skeleton variant="rounded" height={320} sx={{ borderRadius: '20px' }} />
          <Skeleton variant="rounded" height={320} sx={{ borderRadius: '20px' }} />
        </Box>
      </Box>
    );
  }

  if (!txns.some(isFocus)) {
    return (
      <Box>
        {header}
        <Panel sx={{ alignItems: 'center', textAlign: 'center', py: 7 }}>
          <Typography sx={{ fontSize: '1.05rem', fontWeight: 700, mb: 0.5 }}>{income ? 'No active income recorded yet' : 'No spending recorded yet'}</Typography>
          <Typography sx={{ fontSize: '0.84rem', color: t.muted, mb: 2.5 }}>
            {income ? 'Record a salary or other income to see where it comes from and how it changes month to month.' : 'Record an expense to see where your money goes and how it changes month to month.'}
          </Typography>
          <Button variant="contained" disableElevation onClick={() => navigate('/add-transaction')} sx={{ borderRadius: 999, px: 3 }}>{income ? 'Add income' : 'Add expense'}</Button>
        </Panel>
      </Box>
    );
  }

  const thisMonth = MONTHS_LONG[Number(s.mtd.month.slice(5, 7)) - 1];
  const metrics = [
    s.avgMonthly === null
      ? { label: 'Average a month', value: '—', note: 'no complete month yet' }
      : { label: 'Average a month', amount: s.avgMonthly, format: MONEY, note: `over ${s.completeMonths} full month${s.completeMonths === 1 ? '' : 's'}` },
    {
      label: `${thisMonth} so far`, amount: s.mtd.spent, format: MONEY,
      note: s.mtd.change === null ? 'none by this day last month' : `${changeText(s.mtd.change)} vs same days last month`,
      // (mtd.spent is the focus side: spending, or income on the Income side)
      color: s.mtd.change === null ? undefined : tone(s.mtd.change),
    },
    {
      label: 'vs previous period', value: changeText(s.previous.change) ?? '—', color: s.previous.change === null ? t.ink2 : tone(s.previous.change),
      note: s.previous.change === null ? (income ? 'nothing earned before' : 'nothing spent before') : `${MONEY(s.previous.total)} in ${fmtPeriod(s.previous.start, s.previous.end)}`,
    },
    income
      ? (s.keptShare === null
        ? { label: 'Kept after spending', value: '—', note: 'no active income in this period' }
        : { label: 'Kept after spending', value: `${s.keptShare.toFixed(1)}%`, color: s.keptShare < 0 ? t.neg : t.pos, note: `${MONEY(s.spentAll)} spent of ${MONEY(s.active)}` })
      : (s.shareOfIncome === null
        ? { label: 'Of active income', value: '—', note: 'no income in this period' }
        : { label: 'Of active income', value: `${s.shareOfIncome.toFixed(1)}%`, color: s.shareOfIncome > 100 ? t.neg : undefined, note: `of ${MONEY(s.active)} earned` }),
  ];

  const SERIES = income
    ? [{ key: 'income', label: category ?? 'Active income', color: flow.active }, { key: 'spent', label: 'Spending', color: flow.expenses }]
    : [{ key: 'spent', label: category ?? 'Spending', color: flow.expenses }, { key: 'income', label: 'Active income', color: flow.active }];
  const chosen = cats.find((c) => c.name === category);
  const donut = category
    ? [
      { key: category, label: category, value: s.total, color: palette[0], logo: <CategoryBadge icon={chosen?.icon} name={category} size={26} /> },
      { key: 'rest', label: income ? 'Other income' : 'Everything else', value: Math.round((s.allTotal - s.total) * 100) / 100, color: t.track },
    ]
    : s.categories.map((c) => ({ key: c.name, label: c.name, value: c.amount, onClick: () => setCategory(c.name), logo: <CategoryBadge icon={c.icon} name={c.name} size={26} /> }));

  return (
    <Box sx={{ pb: 2 }}>
      {header}

      <SummaryCard
        label={income ? (category ? `Earned from ${category}` : 'Active income') : (category ? `Spent on ${category}` : 'Spent')}
        value={s.total}
        metrics={metrics}
      />

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 7fr) minmax(0, 5fr)' }, gap: 2 }}>
        <Panel>
          <PanelHeader title={`${category ?? (income ? 'Active income' : 'Spending')} against ${income ? 'spending' : 'income'}, ${view === 'month' ? 'by month' : 'by fiscal year'}`}
            right={<Seg size="sm" label="Chart period" value={view} onChange={setView} options={[{ value: 'month', label: 'Monthly' }, { value: 'year', label: 'Yearly' }]} />} />
          <FlowChart points={view === 'month' ? s.months : years} series={SERIES} height={isMobile ? 240 : 300} emptyText={`Nothing recorded in ${label}`}
            headline={(p) => (income
              ? { value: p.income, caption: category ? `Earned from ${category}` : 'Active income' }
              : { value: p.spent, caption: category ? `Spent on ${category}` : 'Spent' })}
            rows={(p) => [{ label: 'Kept from income', value: MONEY(p.income - p.spent), color: p.income - p.spent < 0 ? '#f87171' : 'rgba(255,255,255,0.85)' }]} />
        </Panel>
        <Panel sx={{ minHeight: isMobile ? 380 : 0 }}>
          <PanelHeader title={category ? `Share of all ${income ? 'active income' : 'spending'}` : 'By category'} right={<Typography sx={{ fontSize: '0.72rem', color: t.muted }}>{label}</Typography>} />
          <AllocationDonut key={`${side}-${category ?? 'all'}`} items={donut} centerLabel={category ? (income ? 'All income' : 'All spending') : (income ? 'Earned' : 'Spent')} palette={palette} />
        </Panel>
      </Box>

    </Box>
  );
}
