import { useMemo, useState } from 'react';
import { Box, Skeleton, Typography, Button, useMediaQuery } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { useMfAnalysis } from '../../lib/mf/useMfPortfolio';
import { usePsxPortfolio } from '../../lib/psx/usePsxPortfolio';
import { fiscalYearEnds } from '../../lib/psx/portfolio';
import { mergeSeries, combineTotals } from '../../lib/home/combine';
import { useDateRange, rangeLabel, ALL_TIME_START, todayIso } from '../../lib/dateRange';
import { formatCurrency } from '../../lib/formatters';
import {
  useFx, PageHeader, Panel, PanelHeader, SummaryCard, GrowthChart, AllocationDonut, FitMoney, Seg, FitPage, FONT_NUM, signColor,
} from '../../components/fx';
import AmcLogo from '../mutual-funds/AmcLogo';
import { FundDetailsDialog } from '../mutual-funds/MFDetails';
import StockDetailsDialog from '../psx-stocks/StockDetailsDialog';
import StockLogo from '../../components/StockLogo';

const AMC_SHORT = { atlas: 'Atlas', mcb: 'MCB', meezan: 'Meezan', nbp: 'NBP', ubl: 'UBL' };
const ART = { light: '/hero/networth-light.webp', dark: '/hero/networth-dark.webp' };
const SIGNED = (n) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${formatCurrency(Math.abs(n))}`;

function greeting(user) {
  const h = new Date().getHours();
  const part = h < 5 ? 'Good evening' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  const full = user?.user_metadata?.full_name || user?.user_metadata?.name || '';
  const first = String(full).trim().split(/\s+/)[0]
    || String(user?.email ?? '').split('@')[0].replace(/[._\d]+/g, ' ').trim().split(' ')[0];
  const name = first ? first.charAt(0).toUpperCase() + first.slice(1) : '';
  return name ? `${part}, ${name}` : part;
}

/**
 * Home: net worth across mutual funds and PSX stocks for the selected range,
 * month-end closing value against what was invested, and where the money is.
 * Desktop fits one screen; phones scroll normally.
 */
export default function HomeDashboard() {
  const t = useFx();
  const isMobile = useMediaQuery('(max-width:900px)');
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const { range } = useDateRange();
  const label = rangeLabel(range);
  const { analysis: mf, isLoading: mfLoading } = useMfAnalysis(range);
  const { portfolio: psx, isLoading: psxLoading, pricesLoading } = usePsxPortfolio(range);
  // Yearly view: every fiscal year's 30 June close from the whole history (one year alone is a single point).
  const allTime = useMemo(() => ({ id: 'all', start: ALL_TIME_START, end: todayIso() }), []);
  const { analysis: mfAll } = useMfAnalysis(allTime);
  const { portfolio: psxAll } = usePsxPortfolio(allTime);
  const yearly = useMemo(() => (mfAll && psxAll ? fiscalYearEnds(mergeSeries(mfAll.series, psxAll.series)) : []), [mfAll, psxAll]);
  const [view, setView] = useState('month');
  const [tab, setTab] = useState('all');
  const [fund, setFund] = useState(null);
  const [stock, setStock] = useState(null);

  const data = useMemo(() => {
    if (!mf || !psx) return null;
    const funds = mf.positions.filter((p) => p.isOpen && (p.value ?? 0) > 0).map((p) => ({
      key: `f-${p.key}`, label: p.fundName ?? 'Fund', sub: AMC_SHORT[p.amcCode] ?? p.amcName ?? 'Fund', value: p.value,
      logo: <AmcLogo code={p.amcCode} name={p.amcName} size={28} />, onClick: () => setFund(p),
    }));
    const stocks = psx.positions.filter((p) => p.isOpen && (p.value ?? 0) > 0).map((p) => ({
      key: `s-${p.symbol}`, label: p.symbol, sub: 'Stock', value: p.value,
      logo: <StockLogo symbol={p.symbol} size="sm" />, onClick: () => setStock(p),
    }));
    return {
      totals: combineTotals(mf.totals, psx.totals),
      series: mergeSeries(mf.series, psx.series),
      funds, stocks, all: [...funds, ...stocks],
    };
  }, [mf, psx]);

  const header = <PageHeader title={greeting(user)} sub={false} />;

  if (mfLoading || psxLoading || !data) {
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

  const tt = data.totals;
  if (!mf.allPositions.length && !psx.allPositions.length) {
    return (
      <Box>
        {header}
        <Panel sx={{ alignItems: 'center', textAlign: 'center', py: 7 }}>
          <Typography sx={{ fontSize: '1.05rem', fontWeight: 700, mb: 0.5 }}>Start tracking your investments</Typography>
          <Typography sx={{ fontSize: '0.84rem', color: t.muted, mb: 2.5 }}>Add a mutual fund statement or record a PSX trade.</Typography>
          <Box sx={{ display: 'flex', gap: 1, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Button variant="contained" disableElevation onClick={() => navigate('/funds/add')} sx={{ borderRadius: 999, px: 2.5 }}>Add fund</Button>
            <Button variant="outlined" onClick={() => navigate('/stocks/shares')} sx={{ borderRadius: 999, px: 2.5 }}>Buy shares</Button>
          </Box>
        </Panel>
      </Box>
    );
  }

  const rows = tab === 'funds' ? data.funds : tab === 'stocks' ? data.stocks : data.all;

  return (
    <FitPage>
      {header}

      <SummaryCard
        label="Net worth"
        background={ART}
        value={pricesLoading && !tt.value ? null : tt.value}
        extra={<Split funds={tt.split.funds} stocks={tt.split.stocks} onFunds={() => navigate('/funds')} onStocks={() => navigate('/stocks')} />}
        metrics={[
          { label: 'Invested', amount: tt.invested, note: 'cost of holdings' },
          { label: 'Unrealized', amount: tt.unrealizedNet, format: SIGNED, color: signColor(t, tt.unrealizedNet), note: 'after 15% est.' },
          { label: 'Realized', amount: tt.realized, format: SIGNED, color: signColor(t, tt.realized), note: label },
        ]}
      />

      <Box sx={{
        display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 7fr) minmax(0, 5fr)' }, gap: 2,
        flex: isMobile ? 'none' : '1 1 0', minHeight: isMobile ? 'auto' : 280,
      }}>
        <Panel sx={{ minHeight: 0 }}>
          <PanelHeader title={view === 'month' ? 'Value by month' : 'Value by fiscal year'}
            right={<Seg size="sm" label="Chart period" value={view} onChange={setView} options={[{ value: 'month', label: 'Monthly' }, { value: 'year', label: 'Yearly' }]} />} />
          <Box sx={{ flex: 1, minHeight: isMobile ? 240 : 0, position: 'relative' }}>
            <Box sx={{ position: isMobile ? 'relative' : 'absolute', inset: 0, height: isMobile ? 240 : '100%' }}>
              <GrowthChart points={view === 'month' ? data.series : yearly} height="100%" />
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

/** Funds vs stocks: one quiet two-part bar, each side a link to its dashboard. */
function Split({ funds, stocks, onFunds, onStocks }) {
  const t = useFx();
  if (funds.value <= 0 && stocks.value <= 0) return null;
  const side = (name, s, onClick, align) => (
    <Box component="button" type="button" onClick={onClick} sx={{
      all: 'unset', cursor: 'pointer', textAlign: align, minWidth: 0,
      '&:hover .v': { textDecoration: 'underline', textUnderlineOffset: '3px' }, '&:focus-visible': { outline: `2px solid ${t.ink}`, outlineOffset: 2, borderRadius: '6px' },
    }}>
      <Typography sx={{ fontSize: '0.7rem', color: t.muted }}>{name} <Box component="span" sx={{ fontFamily: FONT_NUM }}>{(s.share * 100).toFixed(0)}%</Box></Typography>
      <Typography className="v" data-numeric component="div" sx={{ fontFamily: FONT_NUM, fontSize: '0.86rem', fontWeight: 600, letterSpacing: '-0.02em', color: t.ink, minWidth: 0 }}><FitMoney value={s.value} /></Typography>
    </Box>
  );
  return (
    <Box sx={{ mt: 1.75, maxWidth: 420 }}>
      <Box role="img" aria-label={`Mutual funds ${(funds.share * 100).toFixed(0)}%, stocks ${(stocks.share * 100).toFixed(0)}%`}
        sx={{ display: 'flex', gap: '3px', height: 6, borderRadius: 999, overflow: 'hidden', bgcolor: t.surface2 }}>
        {funds.share > 0 && <Box sx={{ flexGrow: funds.share, flexBasis: 0, bgcolor: t.ink, minWidth: 3 }} />}
        {stocks.share > 0 && <Box sx={{ flexGrow: stocks.share, flexBasis: 0, bgcolor: t.muted, opacity: 0.55, minWidth: 3 }} />}
      </Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, mt: 1 }}>
        {side('Mutual funds', funds, onFunds, 'left')}
        {side('Stocks', stocks, onStocks, 'right')}
      </Box>
    </Box>
  );
}
