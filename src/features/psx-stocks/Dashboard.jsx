import { useMemo, useState } from 'react';
import { Box, Skeleton, Typography, Button, useMediaQuery } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { usePsxPortfolio } from '../../lib/psx/usePsxPortfolio';
import { useDividends } from '../../lib/psx/useDividends';
import { useDateRange, rangeLabel, todayIso } from '../../lib/dateRange';
import { formatCurrency, formatNumber } from '../../lib/formatters';
import {
  useFx, PageHeader, Panel, SummaryCard, HoldingsCard, signColor, ValueChart,
} from '../../components/fx';
import StockLogo from '../../components/StockLogo';
import { assetRows } from '../../lib/snapshots/series';
import { usePortfolioSnapshots } from '../../lib/snapshots/useSnapshots';
import StockDetailsDialog from './StockDetailsDialog';

const SIGNED = (n) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${formatCurrency(Math.abs(n))}`;
const signed = (v, dp = 0) => (v === null || v === undefined ? '—' : `${v > 0 ? '+' : v < 0 ? '−' : ''}${formatCurrency(Math.abs(v), dp)}`);
const pct = (v) => (v === null || v === undefined ? '' : `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(2)}%`);
const CHART_H = 248;

/**
 * PSX, the essentials: value at live prices, what it cost, what it made;
 * growth over time and the stocks themselves. Same layout as Mutual Funds.
 */
export default function PSXDashboard() {
  const t = useFx();
  const isMobile = useMediaQuery('(max-width:900px)');
  const navigate = useNavigate();
  const { range } = useDateRange();
  const label = rangeLabel(range);
  const { portfolio: p, isLoading, pricesLoading, pricesFailed, pricesAsOf } = usePsxPortfolio(range);
  const { rows: snaps } = usePortfolioSnapshots();
  const { summary: divs, all: divAll } = useDividends(range);
  const [stock, setStock] = useState(null);

  const { held, sold } = useMemo(() => ({
    held: p ? p.positions.filter((x) => x.isOpen).sort((a, b) => (b.value ?? b.invested) - (a.value ?? a.invested)) : [],
    sold: p ? p.positions.filter((x) => !x.isOpen).sort((a, b) => (b.lastDate ?? '').localeCompare(a.lastDate ?? '')) : [],
    // (sold = fully sold by the end of the selected range)
  }), [p]);

  const title = <PageHeader title="PSX"
    icon={<Box component="img" src="/psx.png" alt="" sx={{ width: 34, height: 34, borderRadius: '10px', objectFit: 'contain' }} />} />;

  if (isLoading || !p) {
    return (
      <Box>
        {title}
        <Skeleton variant="rounded" height={isMobile ? 220 : 148} sx={{ borderRadius: '20px', mb: 2 }} />
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '7fr 5fr' }, gap: 2 }}>
          <Skeleton variant="rounded" height={320} sx={{ borderRadius: '20px' }} />
          <Skeleton variant="rounded" height={320} sx={{ borderRadius: '20px' }} />
        </Box>
      </Box>
    );
  }

  if (!p.allPositions.length && !divAll.length) {
    return (
      <Box>
        {title}
        <Panel sx={{ alignItems: 'center', textAlign: 'center', py: 7 }}>
          <Typography sx={{ fontSize: '1rem', fontWeight: 700, mb: 0.5 }}>No stocks yet</Typography>
          <Typography sx={{ fontSize: '0.82rem', color: t.muted, mb: 2.5 }}>Record a buy to start tracking your PSX holdings.</Typography>
          <Button variant="contained" disableElevation onClick={() => navigate('/stocks/shares')} sx={{ borderRadius: 999, px: 3 }}>Buy shares</Button>
        </Panel>
      </Box>
    );
  }

  const tt = p.totals;
  const priceNote = pricesFailed ? 'live prices unavailable' : pricesLoading ? 'loading live prices' : pricesAsOf ? `PSX prices of ${new Date(pricesAsOf).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : 'live PSX prices';
  const dayText = tt.dayChange ? `, today ${signed(tt.dayChange)}` : '';
  const fallbackText = tt.fallbackPriced ? `, ${tt.fallbackPriced} at last known price` : '';

  return (
    <Box sx={{ pb: isMobile ? 1 : 0 }}>
      {title}

      <SummaryCard
        label="Portfolio value"
        value={pricesLoading && !tt.value ? null : tt.value}
        sub={tt.held ? `${tt.held} stock${tt.held === 1 ? '' : 's'} held${dayText}${fallbackText}, ${p.end === todayIso() ? priceNote : `at the end of ${label}`}` : `Nothing held at the end of ${label}`}
        metrics={[
          { label: 'Invested', amount: tt.invested, note: 'average cost of shares held' },
          { label: 'Unrealized', amount: tt.unrealized, format: SIGNED, color: signColor(t, tt.unrealized), note: tt.unrealizedPct !== null ? `${pct(tt.unrealizedPct)} on cost` : 'on shares held' },
          { label: 'Realized', amount: tt.realized, format: SIGNED, color: signColor(t, tt.realized), note: `shares sold in ${label}` },
          {
            label: 'Dividends', amount: divs?.net ?? 0, format: SIGNED, color: signColor(t, divs?.net ?? 0),
            note: divs?.count ? `${divs.count} payment${divs.count === 1 ? '' : 's'}, after tax` : `none in ${label}`,
            onClick: () => navigate('/stocks/dividends'),
          },
        ]}
      />

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 7fr) minmax(0, 5fr)' }, gap: 2 }}>
        <ValueChart rows={assetRows(snaps, 'stocks', p)} range={range} height={isMobile ? 230 : CHART_H}
          note="Value of the shares held at each close against their average cost. Days before PSX closes were captured (6 Nov 2026) use your trade price." />

        <HoldingsCard
          formatMoney={(v) => formatCurrency(v)}
          chart={{
            centerLabel: 'Value',
            items: held.filter((x) => (x.value ?? 0) > 0).map((x) => ({
              key: x.symbol, label: x.symbol, value: x.value, onClick: () => setStock(x),
              logo: <StockLogo symbol={x.symbol} size="sm" />,
            })),
          }}
          tabs={[
            {
              value: 'current', label: 'Current', columns: ['Stock', 'Value', 'Unrealized'], empty: 'Nothing held right now',
              rows: held.map((x) => ({
                key: x.symbol, onClick: () => setStock(x), title: x.symbol,
                sub: `${formatNumber(x.shares, x.shares % 1 ? 2 : 0)} shares at ${formatNumber(x.avgCost ?? 0, 2)}`,
                logo: <StockLogo symbol={x.symbol} size="md" />,
                main: x.value === null ? '—' : formatCurrency(x.value), gain: x.unrealized, gainSub: pct(x.unrealizedPct),
              })),
            },
            {
              value: 'sold', label: 'Sold', columns: ['Stock', 'Last trade', 'Realized'], empty: 'No stocks sold yet',
              rows: sold.map((x) => ({
                key: x.symbol, onClick: () => setStock(x), title: x.symbol, sub: x.companyName,
                logo: <StockLogo symbol={x.symbol} size="md" />,
                main: x.lastDate ? new Date(`${x.lastDate}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—',
                mainMuted: true, gain: x.realizedAllTime, gainSub: 'after fees',
              })),
            },
          ]}
        />
      </Box>

      {stock && <StockDetailsDialog position={stock} onClose={() => setStock(null)} />}
    </Box>
  );
}
