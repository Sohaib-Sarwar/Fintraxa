import { useMemo, useState } from 'react';
import { Box, Typography, Skeleton, useMediaQuery } from '@mui/material';
import { usePsxPortfolio } from '../../lib/psx/usePsxPortfolio';
import { useDividends } from '../../lib/psx/useDividends';
import { groupByFiscalYear } from '../../lib/mf/profit';
import { getStockSector } from '../../lib/psxSectors';
import { useDateRange, rangeLabel, shortDate } from '../../lib/dateRange';
import { formatCurrency } from '../../lib/formatters';
import { useFx, PageHeader, PillSelect, Seg, EarningsChart, GainCard, FONT_NUM, signColor } from '../../components/fx';
import StockLogo from '../../components/StockLogo';
import StockDetailsDialog from './StockDetailsDialog';

const signed = (v) => (v === null || v === undefined ? '—' : `${v > 0 ? '+' : v < 0 ? '−' : ''}${formatCurrency(Math.abs(v))}`);

/** Realized and unrealized profit and dividends on PSX stocks for the range, by sector or stock. */
export default function PSXAnalytics() {
  const t = useFx();
  const isMobile = useMediaQuery('(max-width:900px)');
  const { range } = useDateRange();
  const [sectorPick, setSector] = useState('all');
  const [symbolPick, setSymbol] = useState('all');
  const [view, setView] = useState('month');
  const [source, setSource] = useState('trading');
  const [stock, setStock] = useState(null);
  const label = rangeLabel(range);

  // Options = stocks active in the range (held at its start or traded in it) plus any that paid a dividend in it.
  const { portfolio: base } = usePsxPortfolio(range);
  const { summary: baseDivs } = useDividends(range);
  const options = useMemo(() => {
    const syms = [...new Set([...(base?.positions ?? []).map((x) => x.symbol), ...(baseDivs ? baseDivs.bySymbol.keys() : [])])].sort();
    const sectors = [...new Set(syms.map((s) => getStockSector(s)))].sort();
    return { syms, sectors };
  }, [base, baseDivs]);
  const sector = options.sectors.includes(sectorPick) ? sectorPick : 'all';
  const symbol = options.syms.includes(symbolPick) && (sector === 'all' || getStockSector(symbolPick) === sector) ? symbolPick : 'all';

  const { portfolio: p, isLoading } = usePsxPortfolio(range, { sector, symbol });
  // Yearly view spans the whole history: one fiscal year alone would be a single point.
  const { portfolio: all } = usePsxPortfolio(undefined, { sector, symbol });
  const years = useMemo(() => groupByFiscalYear(all?.months ?? []), [all]);
  const { summary: divs } = useDividends(range, { sector, symbol });
  const { summary: divsAll } = useDividends(undefined, { sector, symbol });
  const divYears = useMemo(() => groupByFiscalYear(divsAll?.months ?? []), [divsAll]);

  const filters = (
    <>
      <PillSelect value={sector} onChange={(v) => { setSector(v); setSymbol('all'); }} label="Sector" width={isMobile ? 140 : 190}
        items={[{ value: 'all', label: 'All sectors' }, ...options.sectors.map((s) => ({ value: s, label: s }))]} />
      <PillSelect value={symbol} onChange={setSymbol} label="Stock" width={isMobile ? 130 : 160}
        items={[{ value: 'all', label: 'All stocks' }, ...options.syms.filter((s) => sector === 'all' || getStockSector(s) === sector)
          .map((s) => ({ value: s, label: s, icon: <StockLogo symbol={s} size="sm" /> }))]} />
    </>
  );

  if (isLoading || !p || !divs) {
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
  // Stocks active in the range, plus any that paid a dividend in it without a recorded trade.
  const bySym = new Map(p.positions.map((x) => [x.symbol, { ...x, dividends: divs.bySymbol.get(x.symbol)?.net ?? 0 }]));
  for (const d of divs.bySymbol.values()) {
    if (!bySym.has(d.symbol)) bySym.set(d.symbol, { symbol: d.symbol, dividendOnly: true, dividends: d.net, realized: 0, realizedFees: 0, unrealizedNet: null, isOpen: false });
  }
  const total = (x) => (x.realized ?? 0) + (x.unrealizedNet ?? 0) + x.dividends;
  const rows = [...bySym.values()].sort((a, b) => total(b) - total(a));
  const chart = source === 'dividends'
    ? { months: view === 'month' ? divs.months : divYears, taxLabel: 'Tax', title: 'Dividends' }
    : { months: view === 'month' ? p.months : years, taxLabel: 'Fees', title: 'Earnings' };
  const first = chart.months[0]?.month ? `${chart.months[0].month}-01` : p.start;

  return (
    <Box sx={{ pb: isMobile ? 1 : 0 }}>
      <PageHeader title="Analytics" actions={!isMobile && filters} />
      {isMobile && <Box sx={{ display: 'flex', gap: 0.75, mb: 1.5 }}>{filters}</Box>}

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, minmax(0, 1fr))' }, gap: 2, mb: 2 }}>
        <GainCard kind="realized" net={tt.realized} gross={tt.realizedGross} tax={tt.realizedFees} taxLabel="Broker fees"
          hint="Profit on shares sold in this period: sale proceeds − their average cost. Gross is before broker fees; net is after the buy and sell fees on those shares." />
        <GainCard kind="unrealized" net={tt.unrealizedNet} gross={tt.unrealized} tax={tt.unrealizedTax}
          hint="Profit on shares you still hold: their value at the end of the period − their average cost. No tax is due until you sell, so 15% CGT is shown as an estimate." />
        <GainCard kind="realized" title="Dividends" net={divs.net} gross={divs.gross} tax={divs.deductions} taxLabel="Tax withheld"
          hint="Cash dividends paid in this period, by payment date. Gross is the declared amount on your shares; tax is what was withheld at source (15% filer, 30% non-filer); net is what reached your account, as printed on the statement." />
      </Box>

      <Box sx={{ bgcolor: t.surface, border: `1px solid ${t.border}`, borderRadius: '20px', boxShadow: t.shadow, p: { xs: 1.75, md: 2.25 }, mb: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1.5, mb: 1.5, flexWrap: 'wrap' }}>
          <Box>
            <Typography component="h2" sx={{ fontSize: '0.92rem', fontWeight: 650 }}>{chart.title} {view === 'month' ? 'by month' : 'by fiscal year'}</Typography>
            <Typography sx={{ fontSize: '0.72rem', color: t.muted }}>
              {view === 'month' ? `${shortDate(p.start > first ? p.start : first)} to ${shortDate(p.end)}` : 'All years, July to June'}
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
            <Seg size="sm" label="Chart shows" value={source} onChange={setSource} options={[{ value: 'trading', label: 'Trading' }, { value: 'dividends', label: 'Dividends' }]} />
            <Seg size="sm" label="Chart period" value={view} onChange={setView} options={[{ value: 'month', label: 'Monthly' }, { value: 'year', label: 'Yearly' }]} />
          </Box>
        </Box>
        <EarningsChart months={chart.months} height={isMobile ? 230 : 280} taxLabel={chart.taxLabel} />
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
              <thead><tr><th>Stock</th><th>Realized (net)</th><th>Broker fees</th><th>Unrealized (net)</th><th>Dividends (net)</th><th>Value</th></tr></thead>
              <tbody>
                {rows.map((x) => (
                  <Box component="tr" key={x.symbol} onClick={x.dividendOnly ? undefined : () => setStock(x)} sx={{ cursor: x.dividendOnly ? 'default' : 'pointer', '&:hover td': { bgcolor: t.surface2 } }}>
                    <td>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <StockLogo symbol={x.symbol} size="sm" />
                        <Box sx={{ minWidth: 0 }}>
                          <Typography noWrap sx={{ fontSize: '0.78rem', fontWeight: 650 }}>{x.symbol}</Typography>
                          <Typography noWrap sx={{ fontSize: '0.64rem', color: t.muted, maxWidth: 240 }}>{getStockSector(x.symbol)}{x.dividendOnly ? ', no trades recorded' : ''}</Typography>
                        </Box>
                      </Box>
                    </td>
                    <Box component="td" sx={{ color: signColor(t, x.realized) }}>{signed(x.realized)}</Box>
                    <td>{formatCurrency(x.realizedFees ?? 0, 2)}</td>
                    <Box component="td" sx={{ color: signColor(t, x.unrealizedNet ?? 0) }}>{x.isOpen ? signed(x.unrealizedNet) : '—'}</Box>
                    <Box component="td" sx={{ color: signColor(t, x.dividends) }}>{x.dividends ? signed(x.dividends) : '—'}</Box>
                    <td>{x.isOpen ? formatCurrency(x.value ?? 0) : '—'}</td>
                  </Box>
                ))}
              </tbody>
            </Box>
          </Box>
        )}
      </Box>

      {stock && <StockDetailsDialog position={stock} onClose={() => setStock(null)} />}
    </Box>
  );
}
