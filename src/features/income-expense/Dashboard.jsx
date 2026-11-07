import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Box, Skeleton, Typography, Button, Fab, useMediaQuery } from '@mui/material';
import { AddRounded } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { useFinanceTransactions } from '../../lib/finance/useFinance';
import { summarize, byFiscalYear } from '../../lib/finance/summary';
import { useDateRange, rangeLabel } from '../../lib/dateRange';
import { useFx, PageHeader, Panel, PanelHeader, SummaryCard, GrowthChart, AllocationDonut, Seg, FitPage, signColor } from '../../components/fx';
import CategoryBadge from './CategoryBadge';

const FLOW = { primary: 'income', secondary: 'expense', primaryLabel: 'Income', secondaryLabel: 'Expense', diffLabel: 'Saved' };

/** Personal finance for the selected range: what came in, what went out, what was kept, where it went. */
export default function IEDashboard() {
  const t = useFx();
  const isMobile = useMediaQuery('(max-width:900px)');
  const navigate = useNavigate();
  const { range } = useDateRange();
  const label = rangeLabel(range);
  const { data: txns, isLoading } = useFinanceTransactions();
  const [view, setView] = useState('month');

  const s = useMemo(() => (txns ? summarize(txns, range) : null), [txns, range]);

  const addButton = (
    <Button variant="contained" disableElevation startIcon={<AddRounded />} onClick={() => navigate('/add-transaction')}
      sx={{ borderRadius: 999, minHeight: 34, py: 0.5, px: 2, fontWeight: 650, display: { xs: 'none', md: 'inline-flex' } }}>
      Add
    </Button>
  );
  const header = <PageHeader title="Personal finance" actions={addButton} />;
  const fab = isMobile && createPortal(
    <Fab color="primary" aria-label="Add transaction" onClick={() => navigate('/add-transaction')}
      sx={{ position: 'fixed', right: 18, bottom: 'calc(76px + env(safe-area-inset-bottom, 0px))', zIndex: 1250, bgcolor: t.inv, color: t.invInk, '&:hover': { bgcolor: t.inv } }}>
      <AddRounded />
    </Fab>,
    document.body,
  );

  if (isLoading || !s) {
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

  if (!txns.length) {
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

  const spend = s.categories.map((c) => ({ key: c.name, label: c.name, value: c.amount, logo: <CategoryBadge icon={c.icon} name={c.name} size={26} />, onClick: () => navigate('/transactions') }));

  return (
    <FitPage>
      {header}

      <SummaryCard
        label="Saved"
        value={s.net}
        metrics={[
          { label: 'Income', amount: s.income },
          { label: 'Expense', amount: s.expense },
          s.savingsRate === null
            ? { label: 'Savings rate', value: '—', note: 'no income yet' }
            : { label: 'Savings rate', amount: s.savingsRate, format: (n) => `${n.toFixed(1)}%`, color: signColor(t, s.savingsRate), note: 'of income kept' },
        ]}
      />

      <Box sx={{
        display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 7fr) minmax(0, 5fr)' }, gap: 2,
        flex: isMobile ? 'none' : '1 1 0', minHeight: isMobile ? 'auto' : 280,
      }}>
        <Panel sx={{ minHeight: 0 }}>
          <PanelHeader title={view === 'month' ? 'Income and expense by month' : 'Income and expense by fiscal year'}
            right={<Seg size="sm" label="Chart period" value={view} onChange={setView} options={[{ value: 'month', label: 'Monthly' }, { value: 'year', label: 'Yearly' }]} />} />
          <Box sx={{ flex: 1, minHeight: isMobile ? 240 : 0, position: 'relative' }}>
            <Box sx={{ position: isMobile ? 'relative' : 'absolute', inset: 0, height: isMobile ? 240 : '100%' }}>
              <GrowthChart points={view === 'month' ? s.months : byFiscalYear(summarize(txns, { start: '2000-01-01', end: range.end }).months)}
                height="100%" keys={FLOW} caption="Income" emptyText={`Nothing recorded in ${label}`} />
            </Box>
          </Box>
        </Panel>

        <Panel sx={{ minHeight: isMobile ? 380 : 0 }}>
          <PanelHeader title="Spending" right={<Typography sx={{ fontSize: '0.72rem', color: t.muted }}>{s.categories.length} categor{s.categories.length === 1 ? 'y' : 'ies'}</Typography>} />
          <AllocationDonut items={spend} centerLabel="Spent" />
        </Panel>
      </Box>
      {fab}
    </FitPage>
  );
}
