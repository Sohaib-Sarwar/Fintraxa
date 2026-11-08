import { useMemo, useState } from 'react';
import { Box, Skeleton, Typography, Button, useMediaQuery } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { useMfAnalysis } from '../../lib/mf/useMfPortfolio';
import { useDateRange, rangeLabel } from '../../lib/dateRange';
import { formatCurrency } from '../../lib/formatters';
import { useFx, PageHeader, Panel, signColor, SummaryCard, ValueChart, FitPage } from '../../components/fx';
import MarketDataNotice from '../../components/MarketDataNotice';
import { assetRows } from '../../lib/snapshots/series';
import { usePortfolioSnapshots } from '../../lib/snapshots/useSnapshots';
import { FundDetailsDialog } from './MFDetails';
import HoldingsPanel from './HoldingsPanel';

const SIGNED = (n) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${formatCurrency(Math.abs(n))}`;

/**
 * Mutual funds, the essentials: what it is worth, what it cost, what you
 * kept — then earnings by month and the funds themselves.
 */
export default function MFDashboard() {
  const t = useFx();
  const isMobile = useMediaQuery('(max-width:900px)');
  const navigate = useNavigate();
  const { range } = useDateRange();
  const { analysis: a, isLoading } = useMfAnalysis(range);
  const { rows: snaps } = usePortfolioSnapshots();
  const [fund, setFund] = useState(null);
  const label = rangeLabel(range);

  const { held, previous } = useMemo(() => {
    if (!a) return { held: [], previous: [] };
    const heldList = a.positions.filter((p) => p.isOpen).sort((x, y) => (y.value ?? 0) - (x.value ?? 0));
    return {
      held: heldList,
      previous: a.positions.filter((p) => !p.isOpen).sort((x, y) => (y.lastDate ?? '').localeCompare(x.lastDate ?? '')),
    };
  }, [a]);

  if (isLoading || !a) {
    return (
      <Box>
        <PageHeader title="Mutual Funds" />
        <Skeleton variant="rounded" height={isMobile ? 220 : 148} sx={{ borderRadius: '20px', mb: 2 }} />
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '7fr 5fr' }, gap: 2 }}>
          <Skeleton variant="rounded" height={320} sx={{ borderRadius: '20px' }} />
          <Skeleton variant="rounded" height={320} sx={{ borderRadius: '20px' }} />
        </Box>
      </Box>
    );
  }

  if (!a.allPositions.length) {
    return (
      <Box>
        <PageHeader title="Mutual Funds" />
        <Panel sx={{ alignItems: 'center', textAlign: 'center', py: 7 }}>
          <Typography sx={{ fontSize: '1rem', fontWeight: 700, mb: 0.5 }}>No funds yet</Typography>
          <Typography sx={{ fontSize: '0.82rem', color: t.muted, mb: 2.5 }}>Upload a statement or add a purchase to start tracking.</Typography>
          <Button variant="contained" disableElevation onClick={() => navigate('/funds/add')} sx={{ borderRadius: 999, px: 3 }}>Add fund</Button>
        </Panel>
      </Box>
    );
  }

  const tt = a.totals;

  return (
    <FitPage>
      <PageHeader title="Mutual Funds" />
      <MarketDataNotice feeds={['mufap']} />

      <SummaryCard
        label="Portfolio value"
        value={tt.value}
        metrics={[
          { label: 'Invested', amount: tt.invested, note: 'cost of units held' },
          { label: 'Realized', amount: tt.realized.net, format: SIGNED, color: signColor(t, tt.realized.net), note: 'after CGT', onClick: () => navigate('/funds/analytics') },
          // Before tax, like the chart and the PSX page; the 15% CGT estimate is the note.
          { label: 'Unrealized', amount: tt.unrealized.gross, format: SIGNED, color: signColor(t, tt.unrealized.gross), note: `${SIGNED(tt.unrealized.net)} after 15% CGT est.`, onClick: () => navigate('/funds/analytics') },
        ]}
      />

      {/* Like Home: on desktop the chart and holdings take the rest of the screen. */}
      <Box sx={{
        display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 7fr) minmax(0, 5fr)' }, gap: 2,
        flex: isMobile ? 'none' : '1 1 0', minHeight: isMobile ? 'auto' : 300,
      }}>
        <ValueChart rows={assetRows(snaps, 'funds', a)} range={range} height={230} fill={!isMobile} />

        <HoldingsPanel held={held} previous={previous} onOpen={setFund} emptyText={`Nothing held at the end of ${label}`} />
      </Box>

      <FundDetailsDialog open={!!fund} onClose={() => setFund(null)} position={fund} rangeLabel={label} />
    </FitPage>
  );
}
