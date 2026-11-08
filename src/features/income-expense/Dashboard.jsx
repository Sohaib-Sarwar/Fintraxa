import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Box, Skeleton, Typography, Button, Fab, useMediaQuery, useTheme } from '@mui/material';
import { AddRounded } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { useFinanceTransactions } from '../../lib/finance/useFinance';
import { usePassiveIncome } from '../../lib/finance/usePassive';
import { summarize, byFiscalYear } from '../../lib/finance/summary';
import { analyzePassive } from '../../lib/finance/passive';
import { useDateRange, rangeLabel, ALL_TIME_START, todayIso } from '../../lib/dateRange';
import { formatCurrency } from '../../lib/formatters';
import {
  useFx, PageHeader, Panel, PanelHeader, SummaryCard, FlowChart, AllocationDonut, Seg, FitPage, signColor, flowColors, passiveColors, categoryColors,
} from '../../components/fx';
import CategoryBadge from './CategoryBadge';
import { PassiveSourceIcon, FlowIcon } from './passiveIcons';

const SIGNED = (n) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${formatCurrency(Math.abs(n))}`;

/**
 * Personal finance for the selected range. Saved = active income − expenses;
 * passive income (dividends, fund profit, savings profit) is shown beside it.
 * Money moved into savings or investments is a transfer, not an expense.
 */
export default function IEDashboard() {
  const t = useFx();
  const mode = useTheme().palette.mode;
  const colors = flowColors(mode);
  const sourceColors = passiveColors(mode);
  const isMobile = useMediaQuery('(max-width:900px)');
  const navigate = useNavigate();
  const { range } = useDateRange();
  const label = rangeLabel(range);
  const { data: txns, isLoading } = useFinanceTransactions();
  const { analysis: passive, events, isLoading: passiveLoading } = usePassiveIncome(range);
  const [view, setView] = useState('month');
  const [tab, setTab] = useState('all');
  const savingsBank = useMemo(() => [...events].reverse().find((e) => e.source === 'savings' && e.symbol)?.symbol ?? null, [events]);

  const s = useMemo(() => (txns && passive ? summarize(txns, range, todayIso(), { passive }) : null), [txns, passive, range]);
  // Yearly view: every fiscal year from the whole history.
  const years = useMemo(() => {
    if (!txns || (!events.length && !txns.length)) return [];
    const all = { start: ALL_TIME_START, end: todayIso() };
    return byFiscalYear(summarize(txns, all, todayIso(), { passive: analyzePassive(events, { ...all, today: todayIso() }) }).months);
  }, [txns, events]);

  const header = <PageHeader title="Personal finance" />;
  const fab = isMobile && createPortal(
    <Fab color="primary" aria-label="Add transaction" onClick={() => navigate('/add-transaction')}
      sx={{ position: 'fixed', right: 18, bottom: 'calc(76px + env(safe-area-inset-bottom, 0px))', zIndex: 1250, bgcolor: t.inv, color: t.invInk, '&:hover': { bgcolor: t.inv } }}>
      <AddRounded />
    </Fab>,
    document.body,
  );

  if (isLoading || passiveLoading || !s) {
    return (
      <FitPage>
        {header}
        <Skeleton variant="rounded" height={isMobile ? 220 : 150} sx={{ borderRadius: '20px', mb: 2, flexShrink: 0 }} />
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '7fr 5fr' }, gap: 2, flex: 1, minHeight: 0 }}>
          <Skeleton variant="rounded" sx={{ borderRadius: '20px', height: isMobile ? 300 : '100%' }} />
          <Skeleton variant="rounded" sx={{ borderRadius: '20px', height: isMobile ? 300 : '100%' }} />
        </Box>
      </FitPage>
    );
  }

  if (!txns.length && !events.length) {
    return (
      <Box>
        {header}
        <Panel sx={{ alignItems: 'center', textAlign: 'center', py: 7 }}>
          <Typography sx={{ fontSize: '1.05rem', fontWeight: 700, mb: 0.5 }}>Record your first transaction</Typography>
          <Typography sx={{ fontSize: '0.84rem', color: t.muted, mb: 2.5 }}>Add income or an expense to see where your money goes.</Typography>
          <Button variant="contained" disableElevation onClick={() => navigate('/add-transaction')} sx={{ borderRadius: 999, px: 3 }}>Add transaction</Button>
        </Panel>
        {fab}
      </Box>
    );
  }

  const SERIES = [
    { key: 'active', label: 'Active income', color: colors.active },
    { key: 'passive', label: 'Passive income', color: colors.passive },
    { key: 'expenses', label: 'Expenses', color: colors.expenses },
  ];
  // The All tab's slices wear the same colours as the three lines on the chart beside it.
  const donut = {
    all: [
      { key: 'active', label: 'Active income', value: s.active, color: colors.active, logo: <FlowIcon kind="active" size={26} /> },
      { key: 'passive', label: 'Passive income', value: s.passive, color: colors.passive, logo: <FlowIcon kind="passive" size={26} />, onClick: () => navigate('/passive-income') },
      { key: 'expenses', label: 'Expenses', value: s.expenses, color: colors.expenses, logo: <FlowIcon kind="expenses" size={26} />, onClick: () => navigate('/transactions') },
    ].filter((x) => x.value > 0),
    active: s.categories.active.map((c) => ({ key: c.name, label: c.name, value: c.amount, logo: <CategoryBadge icon={c.icon} name={c.name} size={26} /> })),
    passive: s.categories.passive.map((c) => ({ key: c.source, label: c.name, value: c.amount, color: sourceColors[c.source], logo: <PassiveSourceIcon source={c.source} size={26} symbol={savingsBank} />, onClick: () => navigate('/passive-income') })),
    expenses: s.categories.expenses.map((c) => ({ key: c.name, label: c.name, value: c.amount, logo: <CategoryBadge icon={c.icon} name={c.name} size={26} />, onClick: () => navigate('/transactions') })),
  };
  const centre = { all: 'In and out', active: 'Active', passive: 'Passive', expenses: 'Spent' };

  return (
    <FitPage>
      {header}

      <SummaryCard
        label="Saved"
        value={s.saved}
        sub={`Active income minus expenses${s.transfers ? `; ${formatCurrency(s.transfers)} moved to savings and investments` : ''}`}
        metrics={[
          { label: 'Active income', amount: s.active, note: 'salary, business, other' },
          { label: 'Passive income', amount: s.passive, format: SIGNED, color: signColor(t, s.passive), note: 'funds, dividends, savings', onClick: () => navigate('/passive-income') },
          { label: 'Expenses', amount: s.expenses, note: 'spending only', onClick: () => navigate('/transactions') },
          s.savingsRate === null
            ? { label: 'Savings rate', value: '—', note: 'no active income yet' }
            : { label: 'Savings rate', amount: s.savingsRate, format: (n) => `${n.toFixed(1)}%`, color: signColor(t, s.savingsRate), note: 'of active income kept' },
        ]}
      />

      <Box sx={{
        display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 7fr) minmax(0, 5fr)' }, gap: 2,
        flex: isMobile ? 'none' : '1 1 0', minHeight: isMobile ? 'auto' : 280,
      }}>
        <Panel sx={{ minHeight: 0 }}>
          <PanelHeader title={view === 'month' ? 'Income and expenses by month' : 'Income and expenses by fiscal year'}
            right={<Seg size="sm" label="Chart period" value={view} onChange={setView} options={[{ value: 'month', label: 'Monthly' }, { value: 'year', label: 'Yearly' }]} />} />
          <Box sx={{ flex: 1, minHeight: isMobile ? 240 : 0, position: 'relative' }}>
            <Box sx={{ position: isMobile ? 'relative' : 'absolute', inset: 0, height: isMobile ? 240 : '100%' }}>
              <FlowChart points={view === 'month' ? s.months : years} series={SERIES} height="100%" emptyText={`Nothing recorded in ${label}`}
                headline={(p) => ({ value: p.saved ?? (p.active - p.expenses), caption: 'Saved: active income − expenses', signed: true })} />
            </Box>
          </Box>
        </Panel>

        <Panel sx={{ minHeight: isMobile ? 400 : 0 }}>
          <PanelHeader title="Where it goes" right={(
            <Seg size="sm" label="Donut shows" value={tab} onChange={setTab}
              options={[{ value: 'all', label: 'All' }, { value: 'active', label: 'Active' }, { value: 'passive', label: 'Passive' }, { value: 'expenses', label: 'Expenses' }]} />
          )} />
          <AllocationDonut key={tab} items={donut[tab]} centerLabel={centre[tab]} palette={categoryColors(mode)} />
        </Panel>
      </Box>
      {fab}
    </FitPage>
  );
}
