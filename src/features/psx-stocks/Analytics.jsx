import { useMemo, useState } from 'react';
import { Box, Typography, Skeleton, IconButton, Tooltip, useMediaQuery } from '@mui/material';
import { ReceiptLongRounded } from '@mui/icons-material';
import { usePsxPortfolio } from '../../lib/psx/usePsxPortfolio';
import { useNccpl } from '../../lib/psx/useNccpl';
import { nccplPeriod, taxYearOf } from '../../lib/psx/nccpl';
import { useProfile } from '../../lib/profile/useProfile';
import { getStockSector } from '../../lib/psxSectors';
import { useDateRange, rangeLabel, todayIso, shortDate } from '../../lib/dateRange';
import { formatCurrency } from '../../lib/formatters';
import { useFx, PageHeader, PillSelect, ValueChart, FONT_NUM, signColor } from '../../components/fx';
import { useAssetSnapshots } from '../../lib/snapshots/useSnapshots';
import { sumByDate } from '../../lib/snapshots/series';
import { buildSnapshots } from '../../lib/snapshots/build';
import { normSymbol } from '../../lib/psx/portfolio';
import { BROKERS } from '../../lib/psx/confirmations';
import BrokerLogo from './BrokerLogo';
import StockLogo from '../../components/StockLogo';
import StockDetailsDialog from './StockDetailsDialog';
import NccplReport from './NccplReport';
import { RealizedPanel, UnrealizedPanel, SectionTitle } from './GainPanels';

const signed = (v) => (v === null || v === undefined ? '—' : `${v > 0 ? '+' : v < 0 ? '−' : ''}${formatCurrency(Math.abs(v))}`);

/**
 * Realized and unrealized profit on PSX stocks for the range, by broker, sector or stock.
 * Realized shows what the sales actually earned next to NCCPL's taxable figure and CGT (all stocks);
 * the report icon opens the NCCPL-style statement. Dividends have their own page.
 */
export default function PSXAnalytics() {
  const t = useFx();
  const isMobile = useMediaQuery('(max-width:900px)');
  const { range } = useDateRange();
  const [sectorPick, setSector] = useState('all');
  const [symbolPick, setSymbol] = useState('all');
  const [brokerPick, setBroker] = useState('all');
  const [stock, setStock] = useState(null);
  const [reportOpen, setReportOpen] = useState(false);
  const label = rangeLabel(range);

  // Options = stocks active in the range (held at its start, traded or settled in it).
  const { portfolio: base, trades, history } = usePsxPortfolio(range);
  const { report } = useNccpl();
  const { data: profile } = useProfile();
  const period = useMemo(() => (report && report.lots.length ? nccplPeriod(report, range) : null), [report, range]);
  const options = useMemo(() => {
    const syms = [...new Set((base?.positions ?? []).map((x) => x.symbol))].sort();
    const sectors = [...new Set(syms.map((s) => getStockSector(s)))].sort();
    return { syms, sectors };
  }, [base]);
  // Brokers the trades came through ('manual' = entered by hand), offered when there is a choice.
  const brokers = useMemo(() => {
    const set = new Set(trades.map((x) => x.broker ?? 'manual'));
    return [
      ...Object.values(BROKERS).filter((b) => set.has(b.code)).map((b) => ({ value: b.code, label: b.name, icon: <BrokerLogo broker={b.code} size={18} /> })),
      ...(set.has('manual') ? [{ value: 'manual', label: 'Entered by hand' }] : []),
    ];
  }, [trades]);
  const broker = brokers.some((o) => o.value === brokerPick) ? brokerPick : 'all';
  const sector = options.sectors.includes(sectorPick) ? sectorPick : 'all';
  const symbol = options.syms.includes(symbolPick) && (sector === 'all' || getStockSector(symbolPick) === sector) ? symbolPick : 'all';

  const { portfolio: p, isLoading } = usePsxPortfolio(range, { sector, symbol, broker });
  const { rows: psxRows } = useAssetSnapshots('psx');
  // One broker's trades: the stored snapshots mix brokers, so that broker's daily values are
  // computed here with the same engine the nightly snapshots use (src/lib/snapshots/build.js).
  const brokerTrades = useMemo(() => (broker === 'all' ? null : trades.filter((x) => {
    const sym = normSymbol(x.symbol);
    return (x.broker ?? 'manual') === broker && (symbol === 'all' || sym === symbol) && (sector === 'all' || getStockSector(sym) === sector);
  })), [trades, broker, symbol, sector]);
  const valueRows = useMemo(() => {
    if (!brokerTrades) {
      return sumByDate(psxRows, (r) => (symbol === 'all' || r.asset_key === symbol) && (sector === 'all' || getStockSector(r.asset_key) === sector));
    }
    if (!brokerTrades.length) return [];
    const today = todayIso();
    const from = brokerTrades.map((x) => String(x.date).slice(0, 10)).sort()[0];
    const { holdings } = buildSnapshots({ psx: { trades: brokerTrades, history: history ?? {} }, from, to: today, today });
    return sumByDate(holdings);
  }, [brokerTrades, psxRows, history, symbol, sector]);

  const reportButton = (
    <Tooltip title="NCCPL capital gains report" arrow>
      <IconButton onClick={() => setReportOpen(true)} aria-label="Open NCCPL capital gains report"
        sx={{ border: `1px solid ${t.border}`, borderRadius: '12px', width: 38, height: 38, color: t.ink2 }}>
        <ReceiptLongRounded sx={{ fontSize: 20 }} />
      </IconButton>
    </Tooltip>
  );
  const filters = (
    <>
      {brokers.length > 1 && (
        <PillSelect value={broker} onChange={setBroker} label="Broker" width={isMobile ? 140 : 180}
          items={[{ value: 'all', label: 'All brokers' }, ...brokers]} />
      )}
      <PillSelect value={sector} onChange={(v) => { setSector(v); setSymbol('all'); }} label="Sector" width={isMobile ? 140 : 190}
        items={[{ value: 'all', label: 'All sectors' }, ...options.sectors.map((s) => ({ value: s, label: s }))]} />
      <PillSelect value={symbol} onChange={setSymbol} label="Stock" width={isMobile ? 130 : 160}
        items={[{ value: 'all', label: 'All stocks' }, ...options.syms.filter((s) => sector === 'all' || getStockSector(s) === sector)
          .map((s) => ({ value: s, label: s, icon: <StockLogo symbol={s} size="sm" /> }))]} />
      {reportButton}
    </>
  );

  if (isLoading || !p) {
    return (
      <Box>
        <PageHeader title="Analytics" />
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
          {[1, 2].map((i) => <Skeleton key={i} variant="rounded" height={230} sx={{ borderRadius: '26px' }} />)}
        </Box>
      </Box>
    );
  }

  const tt = p.totals;
  const filtered = broker !== 'all' || sector !== 'all' || symbol !== 'all';
  const rows = [...p.positions].sort((a, b) => ((b.realized ?? 0) + (b.unrealized ?? 0)) - ((a.realized ?? 0) + (a.unrealized ?? 0)));
  const endLabel = shortDate(range.end < todayIso() ? range.end : todayIso());

  return (
    <Box sx={{ pb: isMobile ? 1 : 0 }}>
      <PageHeader title="Analytics" actions={!isMobile && filters} />
      {isMobile && <Box sx={{ display: 'flex', gap: 0.75, mb: 1.5, flexWrap: 'wrap' }}>{filters}</Box>}

      <SectionTitle sub={`sales settled in ${label}`}>Realized</SectionTitle>
      <Box sx={{ mb: 3 }}>
        <RealizedPanel totals={tt} period={period} filtered={filtered} onReport={() => setReportOpen(true)}
          rateNote={profile?.filer_status === 'non_filer' ? 'CGT is shown at the 15% filer rate; as a non-filer yours may be higher.' : ''} />
      </Box>

      <SectionTitle sub={`shares held on ${endLabel}`}>Unrealized</SectionTitle>
      <Box sx={{ mb: 3 }}>
        <UnrealizedPanel totals={tt} positions={p.positions} />
      </Box>

      <Box sx={{ mb: 2 }}>
        {/* The stock (or sector, or all) picked above: shares held × close at each period's end vs their average cost. */}
        <ValueChart rows={valueRows} range={range} height={isMobile ? 230 : 280}
          title={`${symbol !== 'all' ? symbol : sector !== 'all' ? sector : 'All stocks'}: value vs invested`}
          note="Each point: shares held at that close × the closing price, against their average cost. Sales lower the invested line; days before PSX closes were captured (6 Nov 2026) use your trade price." />
      </Box>

      <Box sx={{ bgcolor: t.surface, border: `1px solid ${t.border}`, borderRadius: '26px', boxShadow: t.shadow, p: { xs: 1.5, md: 2.25 } }}>
        <Typography component="h2" sx={{ fontSize: '0.95rem', fontWeight: 750, mb: 1 }}>By stock <Box component="span" sx={{ color: t.muted, fontWeight: 500 }}>{rows.length}</Box></Typography>
        {rows.length === 0 ? <Typography sx={{ fontSize: '0.8rem', color: t.muted, py: 2 }}>No stocks in {label}.</Typography> : (
          <Box sx={{ overflowX: 'auto' }}>
            <Box component="table" sx={{
              width: '100%', borderCollapse: 'collapse', minWidth: 700,
              '& th': { fontSize: '0.66rem', fontWeight: 600, color: t.muted, textAlign: 'right', pb: 1, px: 1, whiteSpace: 'nowrap' }, '& th:first-of-type': { textAlign: 'left', pl: 0 },
              '& td': { fontSize: '0.78rem', textAlign: 'right', py: 1, px: 1, borderTop: `1px solid ${t.hairline}`, fontFamily: FONT_NUM, whiteSpace: 'nowrap', letterSpacing: '-0.02em' },
              '& td:first-of-type': { textAlign: 'left', pl: 0, fontFamily: 'inherit', letterSpacing: 0 },
            }}>
              <thead><tr><th>Stock</th><th>Realized before fees</th><th>Broker fees</th><th>Realized (net)</th><th>Unrealized</th><th>Value</th></tr></thead>
              <tbody>
                {rows.map((x) => (
                  <Box component="tr" key={x.symbol} onClick={() => setStock(x)} sx={{ cursor: 'pointer', '&:hover td': { bgcolor: t.surface2 } }}>
                    <td>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <StockLogo symbol={x.symbol} size="sm" />
                        <Box sx={{ minWidth: 0 }}>
                          <Typography noWrap sx={{ fontSize: '0.78rem', fontWeight: 650 }}>{x.symbol}</Typography>
                          <Typography noWrap sx={{ fontSize: '0.64rem', color: t.muted, maxWidth: 240 }}>{getStockSector(x.symbol)}</Typography>
                        </Box>
                      </Box>
                    </td>
                    <Box component="td" sx={{ color: signColor(t, x.realizedGross ?? 0) }}>{x.salesCount ? signed(x.realizedGross) : '—'}</Box>
                    <td>{x.salesCount ? formatCurrency(x.realizedFees ?? 0, 2) : '—'}</td>
                    <Box component="td" sx={{ color: signColor(t, x.realized), fontWeight: 650 }}>{x.salesCount ? signed(x.realized) : '—'}</Box>
                    <Box component="td" sx={{ color: signColor(t, x.unrealized ?? 0) }}>{x.isOpen ? signed(x.unrealized) : '—'}</Box>
                    <td>{x.isOpen ? formatCurrency(x.value ?? 0) : '—'}</td>
                  </Box>
                ))}
              </tbody>
            </Box>
          </Box>
        )}
      </Box>

      {stock && <StockDetailsDialog position={stock} onClose={() => setStock(null)} />}
      {reportOpen && <NccplReport taxYear={taxYearOf(range.end < todayIso() ? range.end : todayIso())} onClose={() => setReportOpen(false)} />}
    </Box>
  );
}
