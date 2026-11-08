import { useMemo, useState } from 'react';
import { Box, Typography, Skeleton, useMediaQuery } from '@mui/material';
import { useMfAnalysis } from '../../lib/mf/useMfPortfolio';
import { useDateRange, rangeLabel } from '../../lib/dateRange';
import { formatCurrency } from '../../lib/formatters';
import { useFx, PageHeader, PillSelect, ValueChart, FONT_NUM, signColor, GainCard } from '../../components/fx';
import { useAssetSnapshots } from '../../lib/snapshots/useSnapshots';
import { sumByDate } from '../../lib/snapshots/series';
import AmcLogo from './AmcLogo';
import { FundDetailsDialog } from './MFDetails';

const signed = (v) => (v === null || v === undefined ? '—' : `${v > 0 ? '+' : v < 0 ? '−' : ''}${formatCurrency(Math.abs(v))}`);

/** Realized and unrealized profit for the range, by AMC or fund. */
export default function MFAnalytics() {
  const t = useFx();
  const isMobile = useMediaQuery('(max-width:900px)');
  const { range } = useDateRange();
  const [amcPick, setAmcId] = useState('all');
  const [fundPick, setFundId] = useState('all');
  const [fund, setFund] = useState(null);
  // Options = funds active in the range (held at its start or traded in it), straight from the engine,
  // so the dropdowns always match the lists. A pick that falls out of range resets to "all".
  const { analysis: base, ledger: ledgerAll } = useMfAnalysis(range);
  const options = useMemo(() => {
    if (!base || !ledgerAll) return { amcs: [], funds: [] };
    const funds = Object.fromEntries(ledgerAll.funds.map((f) => [f.id, f]));
    const used = [...new Set(base.positions.map((p) => p.fundId))].map((id) => funds[id]).filter(Boolean);
    const amcs = [...new Set(used.map((f) => f.amc_id))].map((id) => ledgerAll.amcs.find((x) => x.id === id)).filter(Boolean).sort((x, y) => x.name.localeCompare(y.name));
    return { amcs, funds: used.sort((x, y) => x.name.localeCompare(y.name)) };
  }, [base, ledgerAll]);
  const amcId = options.amcs.some((x) => x.id === amcPick) ? amcPick : 'all';
  const fundOptions = options.funds.filter((f) => amcId === 'all' || f.amc_id === amcId);
  const fundId = fundOptions.some((f) => f.id === fundPick) ? fundPick : 'all';
  const { analysis: a, isLoading } = useMfAnalysis(range, { amcId, fundId });
  // Daily holding snapshots, summed for what is picked (a fund held in two accounts counts once).
  const { rows: mfRows } = useAssetSnapshots('mf');
  const valueRows = useMemo(() => {
    const amcOf = Object.fromEntries((ledgerAll?.funds ?? []).map((f) => [f.id, f.amc_id]));
    return sumByDate(mfRows, (r) => {
      const f = r.asset_key.split('|')[1];
      return (fundId === 'all' || f === fundId) && (amcId === 'all' || amcOf[f] === amcId);
    });
  }, [mfRows, ledgerAll, fundId, amcId]);
  const label = rangeLabel(range);

  const filters = (
    <>
      <PillSelect value={amcId} onChange={(v) => { setAmcId(v); setFundId('all'); }} label="AMC"
        items={[{ value: 'all', label: 'All AMCs' }, ...options.amcs.map((x) => ({ value: x.id, label: x.name, icon: <AmcLogo code={x.code} name={x.name} size={18} /> }))]} />
      <PillSelect value={fundId} onChange={setFundId} label="Fund" width={isMobile ? 150 : 220}
        items={[{ value: 'all', label: 'All funds' }, ...fundOptions.map((f) => ({ value: f.id, label: f.name }))]} />
    </>
  );

  if (isLoading || !a) {
    return (
      <Box>
        <PageHeader title="Analytics" />
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
          {[1, 2].map((i) => <Skeleton key={i} variant="rounded" height={230} sx={{ borderRadius: '26px' }} />)}
        </Box>
      </Box>
    );
  }

  const tt = a.totals;
  const rows = [...a.positions].sort((x, y) => ((y.realized.net ?? 0) + (y.unrealized.net ?? 0)) - ((x.realized.net ?? 0) + (x.unrealized.net ?? 0)));

  return (
    <Box sx={{ pb: isMobile ? 1 : 0 }}>
      <PageHeader title="Analytics" actions={!isMobile && filters} />
      {isMobile && <Box sx={{ display: 'flex', gap: 0.75, mb: 1.5 }}>{filters}</Box>}

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2, mb: 2 }}>
        <GainCard kind="realized" net={tt.realized.net} gross={tt.realized.gross} tax={tt.realized.cgt} />
        <GainCard kind="unrealized" net={tt.unrealized.net} gross={tt.unrealized.gross} tax={tt.unrealized.tax} />
      </Box>

      <Box sx={{ mb: 2 }}>
        {/* The fund (or AMC, or all) picked above: units held × NAV at each close vs their FIFO cost. */}
        <ValueChart rows={valueRows} range={range} height={isMobile ? 230 : 280}
          title={`${fundId !== 'all' ? (fundOptions.find((f) => f.id === fundId)?.name ?? 'Fund') : amcId !== 'all' ? (options.amcs.find((x) => x.id === amcId)?.name ?? 'AMC') : 'All funds'}: value vs invested`}
          note="Each point: units held at that close × the latest NAV, against the FIFO cost of those units. Redemptions lower the invested line by the cost of the units sold; hover for unrealized and realized." />
      </Box>

      <Box sx={{ bgcolor: t.surface, border: `1px solid ${t.border}`, borderRadius: '26px', boxShadow: t.shadow, p: { xs: 1.5, md: 2.25 } }}>
        <Typography component="h2" sx={{ fontSize: '0.95rem', fontWeight: 750, mb: 1 }}>By fund <Box component="span" sx={{ color: t.muted, fontWeight: 500 }}>{rows.length}</Box></Typography>
        {rows.length === 0 ? <Typography sx={{ fontSize: '0.8rem', color: t.muted, py: 2 }}>No funds in {label}.</Typography> : (
          <Box sx={{ overflowX: 'auto' }}>
            <Box component="table" sx={{
              width: '100%', borderCollapse: 'collapse', minWidth: 600,
              '& th': { fontSize: '0.66rem', fontWeight: 600, color: t.muted, textAlign: 'right', pb: 1, px: 1, whiteSpace: 'nowrap' }, '& th:first-of-type': { textAlign: 'left', pl: 0 },
              '& td': { fontSize: '0.78rem', textAlign: 'right', py: 1, px: 1, borderTop: `1px solid ${t.hairline}`, fontFamily: FONT_NUM, whiteSpace: 'nowrap', letterSpacing: '-0.02em' },
              '& td:first-of-type': { textAlign: 'left', pl: 0, fontFamily: 'inherit', letterSpacing: 0 },
            }}>
              <thead><tr><th>Fund</th><th>Realized (net)</th><th>CGT paid</th><th>Unrealized (net)</th><th>Value</th></tr></thead>
              <tbody>
                {rows.map((p) => (
                  <Box component="tr" key={p.key} onClick={() => setFund(p)} sx={{ cursor: 'pointer', '&:hover td': { bgcolor: t.surface2 } }}>
                    <td>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <AmcLogo code={p.amcCode} name={p.amcName} size={26} />
                        <Typography noWrap sx={{ fontSize: '0.78rem', fontWeight: 600, maxWidth: 260 }}>{p.fundName}</Typography>
                      </Box>
                    </td>
                    <Box component="td" sx={{ color: signColor(t, p.realized.net) }}>{signed(p.realized.net)}</Box>
                    <td>{formatCurrency(p.realized.cgt)}</td>
                    <Box component="td" sx={{ color: signColor(t, p.unrealized.net ?? 0) }}>{p.isOpen ? signed(p.unrealized.net) : '—'}</Box>
                    <td>{p.isOpen ? formatCurrency(p.value) : '—'}</td>
                  </Box>
                ))}
              </tbody>
            </Box>
          </Box>
        )}
      </Box>

      <FundDetailsDialog open={!!fund} onClose={() => setFund(null)} position={fund} rangeLabel={label} />
    </Box>
  );
}
