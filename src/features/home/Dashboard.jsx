import { useMemo, useState } from 'react';
import { Box, Skeleton, Typography, Button, useMediaQuery, useTheme } from '@mui/material';
import { AccountBalanceRounded } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { useMfAnalysis } from '../../lib/mf/useMfPortfolio';
import { usePsxPortfolio } from '../../lib/psx/usePsxPortfolio';
import { useFinanceTransactions } from '../../lib/finance/useFinance';
import { useDividends } from '../../lib/psx/useDividends';
import { cashFlows, savingsAt, netWorthSeries, netWorth } from '../../lib/home/combine';
import { holdingsSeries } from '../../lib/snapshots/series';
import { usePortfolioSnapshots } from '../../lib/snapshots/useSnapshots';
import { useDateRange, rangeLabel, ALL_TIME_START, todayIso } from '../../lib/dateRange';
import {
  useFx, PageHeader, Panel, PanelHeader, SummaryCard, FlowChart, AllocationDonut, Seg, FitPage, signColor, worthColors,
} from '../../components/fx';
import AmcLogo from '../mutual-funds/AmcLogo';
import { FundDetailsDialog } from '../mutual-funds/MFDetails';
import StockDetailsDialog from '../psx-stocks/StockDetailsDialog';
import StockLogo from '../../components/StockLogo';

const AMC_SHORT = { atlas: 'Atlas', mcb: 'MCB', meezan: 'Meezan', nbp: 'NBP', ubl: 'UBL' };
const ART = { light: '/hero/networth-light.webp', dark: '/hero/networth-dark.webp' };
const NONE = [];
const pctOf = (share) => `${(share * 100).toFixed(0)}% of net worth`;
const fmtDay = (iso) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

function greeting(user) {
  const h = new Date().getHours();
  const part = h < 5 ? 'Good evening' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  const full = user?.user_metadata?.full_name || user?.user_metadata?.name || '';
  const first = String(full).trim().split(/\s+/)[0]
    || String(user?.email ?? '').split('@')[0].replace(/[._\d]+/g, ' ').trim().split(' ')[0];
  const name = first ? first.charAt(0).toUpperCase() + first.slice(1) : '';
  return name ? `${part}, ${name}` : part;
}

/** Savings in the allocation donut: a bank mark in the savings colour. */
function SavingsMark({ size = 28 }) {
  const c = worthColors(useTheme().palette.mode).savings;
  return (
    <Box sx={{ width: size, height: size, borderRadius: '50%', bgcolor: `${c}22`, color: c, display: 'grid', placeItems: 'center' }}>
      <AccountBalanceRounded sx={{ fontSize: size * 0.56 }} />
    </Box>
  );
}

/**
 * Home: net worth = mutual funds (value now) + PSX stocks (value now) +
 * savings (what this month kept; each month starts fresh; see
 * src/lib/home/combine.js for exactly what moves it). Month-end values of the
 * three parts on the chart, and where the money is.
 * Desktop fits one screen; phones scroll normally.
 */
export default function HomeDashboard() {
  const t = useFx();
  const mode = useTheme().palette.mode;
  const colors = worthColors(mode);
  const isMobile = useMediaQuery('(max-width:900px)');
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const { range } = useDateRange();
  const label = rangeLabel(range);
  const { analysis: mf, isLoading: mfLoading } = useMfAnalysis(range);
  const { portfolio: psx, isLoading: psxLoading, pricesLoading } = usePsxPortfolio(range);
  const { data: txns, isLoading: txLoading } = useFinanceTransactions();
  const { all: dividendRows, isLoading: divLoading } = useDividends();
  const dividends = dividendRows.length ? dividendRows : NONE;
  const flows = useMemo(() => (txns ? cashFlows({ transactions: txns, dividends }) : null), [txns, dividends]);
  // Yearly view: every fiscal year's 30 June close from the whole history (one year alone is a single point).
  const allTime = useMemo(() => ({ id: 'all', start: ALL_TIME_START, end: todayIso() }), []);
  const { analysis: mfAll } = useMfAnalysis(allTime);
  const { portfolio: psxAll } = usePsxPortfolio(allTime);
  // Month-ends from the live engine, for dates before the daily snapshots begin.
  const early = useMemo(() => (mfAll && psxAll && flows
    ? netWorthSeries({ funds: mfAll.series, stocks: psxAll.series, flows, start: ALL_TIME_START, end: todayIso(), today: todayIso() })
    : []), [mfAll, psxAll, flows]);
  const { rows: snaps } = usePortfolioSnapshots();
  const [view, setView] = useState('month');
  const chartPoints = useMemo(() => holdingsSeries({ snaps, early, dividends, period: view, start: range.start, end: range.end, today: todayIso() }),
    [snaps, early, dividends, view, range.start, range.end]);
  const [tab, setTab] = useState('all');
  const [fund, setFund] = useState(null);
  const [stock, setStock] = useState(null);

  const data = useMemo(() => {
    if (!mf || !psx || !flows) return null;
    const today = todayIso();
    const asOf = range.end && range.end < today ? range.end : today;
    const worth = netWorth({ funds: mf.totals.value ?? 0, stocks: psx.totals.value ?? 0, savings: savingsAt(flows, asOf) });
    const funds = mf.positions.filter((p) => p.isOpen && (p.value ?? 0) > 0).map((p) => ({
      key: `f-${p.key}`, label: p.fundName ?? 'Fund', sub: AMC_SHORT[p.amcCode] ?? p.amcName ?? 'Fund', value: p.value,
      logo: <AmcLogo code={p.amcCode} name={p.amcName} size={28} />, onClick: () => setFund(p),
    }));
    const stocks = psx.positions.filter((p) => p.isOpen && (p.value ?? 0) > 0).map((p) => ({
      key: `s-${p.symbol}`, label: p.symbol, sub: 'Stock', value: p.value,
      logo: <StockLogo symbol={p.symbol} size="sm" />, onClick: () => setStock(p),
    }));
    const cash = worth.savings > 0 ? [{ key: 'savings', label: 'Savings', sub: 'This month', value: worth.savings, logo: <SavingsMark />, onClick: () => navigate('/') }] : [];
    return {
      asOf, worth,
      series: netWorthSeries({ funds: mf.series, stocks: psx.series, flows, start: range.start, end: range.end, today }),
      funds, stocks, all: [...funds, ...stocks, ...cash],
    };
  }, [mf, psx, flows, range.start, range.end, navigate]);

  const header = <PageHeader title={greeting(user)} sub={false} />;

  if (mfLoading || psxLoading || txLoading || divLoading || !data) {
    return (
      <FitPage>
        {header}
        <Skeleton variant="rounded" height={isMobile ? 240 : 176} sx={{ borderRadius: '20px', mb: 2, flexShrink: 0 }} />
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '7fr 5fr' }, gap: 2, flex: 1, minHeight: 0 }}>
          <Skeleton variant="rounded" sx={{ borderRadius: '20px', height: isMobile ? 300 : '100%' }} />
          <Skeleton variant="rounded" sx={{ borderRadius: '20px', height: isMobile ? 300 : '100%' }} />
        </Box>
      </FitPage>
    );
  }

  const w = data.worth;
  if (!mf.allPositions.length && !psx.allPositions.length && !flows.length) {
    return (
      <Box>
        {header}
        <Panel sx={{ alignItems: 'center', textAlign: 'center', py: 7 }}>
          <Typography sx={{ fontSize: '1.05rem', fontWeight: 700, mb: 0.5 }}>Start tracking your money</Typography>
          <Typography sx={{ fontSize: '0.84rem', color: t.muted, mb: 2.5 }}>Record income and expenses, add a mutual fund statement or a PSX trade.</Typography>
          <Box sx={{ display: 'flex', gap: 1, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Button variant="contained" disableElevation onClick={() => navigate('/add-transaction')} sx={{ borderRadius: 999, px: 2.5 }}>Add transaction</Button>
            <Button variant="outlined" onClick={() => navigate('/funds/add')} sx={{ borderRadius: 999, px: 2.5 }}>Add fund</Button>
            <Button variant="outlined" onClick={() => navigate('/stocks/shares')} sx={{ borderRadius: 999, px: 2.5 }}>Buy shares</Button>
          </Box>
        </Panel>
      </Box>
    );
  }

  const rows = tab === 'funds' ? data.funds : tab === 'stocks' ? data.stocks : data.all;
  const SERIES = [
    { key: 'funds', label: 'Mutual funds', color: colors.funds },
    { key: 'stocks', label: 'PSX stocks', color: colors.stocks },
    { key: 'dividends', label: view === 'year' ? 'Dividends that year' : 'Dividends received', color: colors.savings },
  ];

  return (
    <FitPage>
      {header}

      <SummaryCard
        label="Net worth"
        background={ART}
        value={pricesLoading && !w.value ? null : w.value}
        sub={`Mutual funds, PSX stocks and this month's savings on ${fmtDay(data.asOf)}`}
        metrics={[
          { label: 'Mutual funds', amount: w.funds, note: pctOf(w.share.funds), onClick: () => navigate('/funds') },
          { label: 'PSX stocks', amount: w.stocks, note: pctOf(w.share.stocks), onClick: () => navigate('/stocks') },
          {
            label: 'Saved this month', amount: w.savings, color: w.savings < 0 ? signColor(t, w.savings) : undefined,
            note: w.savings < 0 ? 'spent more than earned' : pctOf(w.share.savings),
            tooltip: 'This month only: income and cash passive income (bank profit, dividends) minus spending and money moved into funds or shares. Each month starts fresh; nothing carries over.',
          },
        ]}
      />

      <Box sx={{
        display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 7fr) minmax(0, 5fr)' }, gap: 2,
        flex: isMobile ? 'none' : '1 1 0', minHeight: isMobile ? 'auto' : 280,
      }}>
        <Panel sx={{ minHeight: 0 }}>
          <PanelHeader title="Holdings value"
            right={<Seg size="sm" label="Chart period" value={view} onChange={setView} options={[{ value: 'day', label: 'Daily' }, { value: 'week', label: 'Weekly' }, { value: 'month', label: 'Monthly' }, { value: 'year', label: 'Yearly' }]} />} />
          <Box sx={{ flex: 1, minHeight: isMobile ? 240 : 0, position: 'relative' }}>
            <Box sx={{ position: isMobile ? 'relative' : 'absolute', inset: 0, height: isMobile ? 240 : '100%' }}>
              <FlowChart points={chartPoints} series={SERIES} height="100%" emptyText={`Nothing held in ${label}`}
                headline={(p) => ({ value: p.value, caption: p.live ? 'Funds and stocks now' : 'Funds and stocks at the close' })} />
            </Box>
          </Box>
        </Panel>

        <Panel sx={{ minHeight: isMobile ? 420 : 0 }}>
          <PanelHeader title="Allocation"
            right={<Seg size="sm" label="Allocation" value={tab} onChange={setTab}
              options={[{ value: 'all', label: 'All' }, { value: 'funds', label: 'Funds' }, { value: 'stocks', label: 'Stocks' }]} />} />
          <AllocationDonut key={tab} items={rows} centerLabel={tab === 'funds' ? 'Mutual funds' : tab === 'stocks' ? 'Stocks' : 'Net worth'} />
        </Panel>
      </Box>

      <FundDetailsDialog open={!!fund} onClose={() => setFund(null)} position={fund} rangeLabel={label} />
      {stock && <StockDetailsDialog position={stock} onClose={() => setStock(null)} />}
    </FitPage>
  );
}
