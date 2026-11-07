import { useMemo, useState } from 'react';
import { Box, Typography, Skeleton, Button, IconButton, Tooltip, useMediaQuery } from '@mui/material';
import { AddRounded, ReceiptLongRounded } from '@mui/icons-material';
import { formatCurrency } from '../../lib/formatters';
import { useDividends } from '../../lib/psx/useDividends';
import { groupByFiscalYear } from '../../lib/mf/profit';
import { useDateRange, rangeLabel, shortDate, todayIso } from '../../lib/dateRange';
import { useFx, PageHeader, Panel, PanelHeader, SummaryCard, AllocationDonut, EarningsChart, Seg, FitPage } from '../../components/fx';
import StockLogo from '../../components/StockLogo';
import DividendDialog from './DividendDialog';
import DividendTransactions from './DividendTransactions';

/** Cash dividends: what came in for the selected range, month by month, and from which stocks. */
export default function Dividends() {
  const t = useFx();
  const isMobile = useMediaQuery('(max-width:900px)');
  const { range } = useDateRange();
  const label = rangeLabel(range);
  const { all, summary: s, isLoading } = useDividends(range);
  // Yearly view spans the whole history: one fiscal year alone would be a single point.
  const { summary: allTime } = useDividends();
  const [view, setView] = useState('month');
  const [dialog, setDialog] = useState(null); // null | { dividend: row | null }
  const [ledger, setLedger] = useState(false);

  const stocks = useMemo(() => (s ? [...s.bySymbol.values()].sort((a, b) => b.net - a.net) : []), [s]);
  const years = useMemo(() => groupByFiscalYear(allTime?.months ?? []), [allTime]);

  const actions = (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
      {all.length > 0 && (
        <Tooltip title="All dividend transactions" arrow>
          <IconButton aria-label="All dividend transactions" onClick={() => setLedger(true)}
            sx={{ width: 34, height: 34, border: `1px solid ${t.border}`, bgcolor: t.surface, color: t.ink }}>
            <ReceiptLongRounded sx={{ fontSize: 18 }} />
          </IconButton>
        </Tooltip>
      )}
      <Button variant="contained" disableElevation startIcon={<AddRounded />} onClick={() => setDialog({ dividend: null })}
        sx={{ borderRadius: 999, minHeight: 34, py: 0.5, px: 2, fontWeight: 650 }}>
        {isMobile ? 'Add' : 'Add dividends'}
      </Button>
    </Box>
  );
  const header = <PageHeader title="Dividends" actions={actions} />;
  const overlays = (
    <>
      {ledger && <DividendTransactions onClose={() => setLedger(false)} />}
      {dialog && <DividendDialog dividend={dialog.dividend} existing={all} onClose={() => setDialog(null)} />}
    </>
  );

  if (isLoading || !s) {
    return (
      <FitPage>
        {header}
        <Skeleton variant="rounded" height={isMobile ? 220 : 150} sx={{ borderRadius: '20px', mb: 2, flexShrink: 0 }} />
        <Skeleton variant="rounded" sx={{ borderRadius: '20px', flex: 1, minHeight: 300 }} />
      </FitPage>
    );
  }

  if (!all.length) {
    return (
      <Box>
        {header}
        <Panel sx={{ alignItems: 'center', textAlign: 'center', py: 7 }}>
          <Typography sx={{ fontSize: '1.05rem', fontWeight: 700, mb: 0.5 }}>No dividends recorded yet</Typography>
          <Typography sx={{ fontSize: '0.84rem', color: t.muted, mb: 2.5, maxWidth: 420 }}>
            Paste your CDC dividend statement and every warrant is read for you, or enter a dividend by hand.
          </Typography>
          <Button variant="contained" disableElevation onClick={() => setDialog({ dividend: null })} sx={{ borderRadius: 999, px: 3 }}>Add dividends</Button>
        </Panel>
        {overlays}
      </Box>
    );
  }

  const rate = s.gross > 0 ? (s.deductions / s.gross) * 100 : null;
  const months = view === 'month' ? s.months : years;
  const first = s.months[0] ? `${s.months[0].month}-01` : range.start;

  return (
    <FitPage>
      {header}

      <SummaryCard
        label="Dividends received"
        value={s.net}
        sub={s.count ? `${s.count} payment${s.count === 1 ? '' : 's'} from ${stocks.length} stock${stocks.length === 1 ? '' : 's'}, net of tax` : `Nothing paid in ${label}`}
        metrics={[
          { label: 'Gross', amount: s.gross, note: 'declared on your shares' },
          { label: 'Tax withheld', amount: s.deductions, note: s.zakat ? `incl. zakat ${formatCurrency(s.zakat, 2)}` : 'deducted at source' },
          rate === null
            ? { label: 'Tax rate', value: '—', note: 'nothing paid' }
            : { label: 'Tax rate', amount: rate, format: (n) => `${n.toFixed(1)}%`, note: 'filer 15%, non-filer 30%' },
        ]}
      />

      <Box sx={{
        display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 7fr) minmax(0, 5fr)' }, gap: 2,
        flex: isMobile ? 'none' : '1 1 0', minHeight: isMobile ? 'auto' : 300,
      }}>
        <Panel sx={{ minHeight: 0 }}>
          <PanelHeader
            title={view === 'month' ? 'Dividends by month' : 'Dividends by fiscal year'}
            right={<Seg size="sm" label="Chart period" value={view} onChange={setView} options={[{ value: 'month', label: 'Monthly' }, { value: 'year', label: 'Yearly' }]} />}
          />
          <Typography sx={{ fontSize: '0.7rem', color: t.muted, mt: -0.75, mb: 1 }}>
            {view === 'month' ? `${shortDate(range.start > first ? range.start : first)} to ${shortDate(range.end < todayIso() ? range.end : todayIso())}, by payment date` : 'All years, July to June'}
          </Typography>
          <Box sx={{ flex: 1, minHeight: isMobile ? 240 : 0, position: 'relative' }}>
            <Box sx={{ position: isMobile ? 'relative' : 'absolute', inset: 0, height: isMobile ? 240 : '100%' }}>
              <EarningsChart months={months} height="100%" taxLabel="Tax" />
            </Box>
          </Box>
        </Panel>

        <Panel sx={{ minHeight: isMobile ? 380 : 0 }}>
          <PanelHeader title="By stock" right={<Typography sx={{ fontSize: '0.72rem', color: t.muted }}>net received</Typography>} />
          <AllocationDonut centerLabel="Net"
            items={stocks.map((x) => ({ key: x.symbol, label: x.symbol, value: x.net, logo: <StockLogo symbol={x.symbol} size="sm" /> }))} />
        </Panel>
      </Box>

      {overlays}
    </FitPage>
  );
}
