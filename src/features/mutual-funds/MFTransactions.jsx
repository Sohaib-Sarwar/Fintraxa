import { useMemo, useState } from 'react';
import { Box, Typography, Skeleton, InputBase, ButtonBase, useMediaQuery } from '@mui/material';
import { SearchRounded, EditRounded, CloseRounded } from '@mui/icons-material';
import { useMfPortfolio } from '../../lib/mf/useMfPortfolio';
import { useDateRange, rangeLabel, inRange } from '../../lib/dateRange';
import { formatNumber, formatCurrency } from '../../lib/formatters';
import { useFx, PageHeader, FxCard, Seg, PillSelect, usePaged, Pagination, FitPage, FONT_NUM, Chip } from '../../components/fx';
import { TYPE_LABEL, fmtDate } from './mfLabels';
import AmcLogo from './AmcLogo';
import EntryEditor from './EntryEditor';

const GROUPS = [
  { value: 'all', label: 'All', types: null },
  { value: 'buy', label: 'Buy', types: ['purchase'] },
  { value: 'redeem', label: 'Redeem', types: ['redemption'] },
  { value: 'switch', label: 'Switch', types: ['switch_in', 'switch_out', 'transfer_in', 'transfer_out'] },
  { value: 'tax', label: 'CGT', types: ['cgt_deduction', 'cgt_reversal', 'cgt_refund_cash', 'cgt_refund_reinvest'] },
  { value: 'income', label: 'Income', types: ['dividend_cash', 'dividend_reinvest', 'capital_refund_units', 'bonus_units'] },
];
const SOURCE = { statement: 'Statement', manual: 'Manual', legacy_migration: 'Manual', correction: 'Reversal' };

export default function MFTransactions() {
  const t = useFx();
  const isMobile = useMediaQuery('(max-width:900px)');
  const { range } = useDateRange();
  const { ledger, isLoading } = useMfPortfolio();
  const [amcPick, setAmc] = useState('all');
  const [fundPick, setFund] = useState('all');
  const [group, setGroup] = useState('all');
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState(null);

  const all = useMemo(() => {
    if (!ledger) return [];
    const funds = Object.fromEntries(ledger.funds.map((f) => [f.id, f]));
    const amcs = Object.fromEntries(ledger.amcs.map((a) => [a.id, a]));
    const cgt = new Map();
    for (const c of ledger.components) {
      if (c.component_type === 'cgt') cgt.set(c.entry_id, (cgt.get(c.entry_id) ?? 0) + Number(c.amount));
    }
    const reversedIds = new Set(ledger.entries.filter((e) => e.reverses_entry_id).map((e) => e.reverses_entry_id));
    return ledger.entries.map((e) => {
      const f = funds[e.fund_id];
      const a = amcs[f?.amc_id];
      return { ...e, fundName: f?.name ?? 'Fund', amcId: f?.amc_id ?? null, amcName: a?.name ?? '', amcCode: a?.code ?? null, cgt: cgt.get(e.id) ?? null, reversed: reversedIds.has(e.id) };
    });
  }, [ledger]);

  // Options come from the rows in the selected range, so every choice shown has something behind it.
  const inPeriod = useMemo(() => all.filter((r) => inRange(r.trade_date, range)), [all, range]);
  const amcOptions = useMemo(() => [...new Map(inPeriod.filter((r) => r.amcId).map((r) => [r.amcId, { value: r.amcId, label: r.amcName, icon: <AmcLogo code={r.amcCode} name={r.amcName} size={18} /> }])).values()]
    .sort((a, b) => a.label.localeCompare(b.label)), [inPeriod]);
  // A filter pointing at something no longer offered falls back to "all" instead of silently showing nothing.
  const amc = amcOptions.some((o) => o.value === amcPick) ? amcPick : 'all';
  const fundOptions = useMemo(() => [...new Map(inPeriod.filter((r) => amc === 'all' || r.amcId === amc).map((r) => [r.fund_id, { value: r.fund_id, label: r.fundName }])).values()]
    .sort((a, b) => a.label.localeCompare(b.label)), [inPeriod, amc]);

  const fund = fundOptions.some((o) => o.value === fundPick) ? fundPick : 'all';

  const rows = useMemo(() => {
    const types = GROUPS.find((g) => g.value === group)?.types;
    const needle = q.trim().toLowerCase();
    return inPeriod
      .filter((r) => (amc === 'all' || r.amcId === amc) && (fund === 'all' || r.fund_id === fund))
      .filter((r) => !types || types.includes(r.entry_type))
      .filter((r) => !needle || `${r.fundName} ${r.amcName} ${TYPE_LABEL[r.entry_type] ?? ''} ${r.original_label ?? ''}`.toLowerCase().includes(needle))
      .sort((a, b) => b.trade_date.localeCompare(a.trade_date) || (b.seq - a.seq));
  }, [inPeriod, amc, fund, group, q]);

  // Ten per page; any filter change starts again at page one.
  const pg = usePaged(rows, [amc, fund, group, q, range.start, range.end].join('|'));
  const totals = rows.reduce((s, r) => {
    const u = r.unit_delta !== null ? Number(r.unit_delta) : 0;
    if (r.reversed || r.reverses_entry_id) return s;
    if (r.entry_type === 'purchase') s.in += Number(r.gross_amount ?? r.net_amount ?? 0);
    if (r.entry_type === 'redemption' || (u < 0 && r.cash_direction === 'investor_receives')) s.out += Number(r.net_amount ?? r.gross_amount ?? 0);
    s.cgt += r.cgt ?? 0;
    return s;
  }, { in: 0, out: 0, cgt: 0 });
  const filtered = amc !== 'all' || fund !== 'all' || group !== 'all' || q;

  return (
    <FitPage>
      <PageHeader title="Fund transactions" />

      <Box sx={{ display: 'flex', gap: 0.75, mb: 1.25, flexWrap: 'wrap', alignItems: 'center', flexShrink: 0 }}>
        <Seg size="sm" label="Type" value={group} onChange={setGroup} options={GROUPS} />
        <PillSelect value={amc} onChange={(v) => { setAmc(v); setFund('all'); }} label="AMC" items={[{ value: 'all', label: 'All AMCs' }, ...amcOptions]} />
        <PillSelect value={fund} onChange={setFund} label="Fund" width={isMobile ? 160 : 220} items={[{ value: 'all', label: 'All funds' }, ...fundOptions]} />
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, height: 34, px: 1.25, borderRadius: 999, border: `1px solid ${t.border}`, bgcolor: t.surface, flex: isMobile ? '1 1 160px' : '0 1 220px' }}>
          <SearchRounded sx={{ fontSize: 16, color: t.muted }} />
          <InputBase value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" inputProps={{ 'aria-label': 'Search transactions' }} sx={{ fontSize: '0.76rem', flex: 1 }} />
        </Box>
        {filtered && (
          <ButtonBase onClick={() => { setAmc('all'); setFund('all'); setGroup('all'); setQ(''); }}
            sx={{ height: 34, px: 1.25, borderRadius: 999, fontSize: '0.74rem', fontWeight: 600, color: t.muted, gap: 0.5, fontFamily: 'inherit' }}>
            <CloseRounded sx={{ fontSize: 15 }} />Clear
          </ButtonBase>
        )}
      </Box>

      <FxCard sx={{ flex: isMobile ? 'none' : '1 1 0', minHeight: 0 }} bodySx={{ minHeight: 0 }}>
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mb: 1, fontSize: '0.72rem', color: t.muted, flexShrink: 0 }}>
          <span><b style={{ color: t.ink }}>{rows.length}</b> transaction{rows.length === 1 ? '' : 's'} in {rangeLabel(range)}</span>
          <span>Bought <Box component="b" sx={{ color: t.ink, fontFamily: FONT_NUM }}>{formatCurrency(totals.in)}</Box></span>
          <span>Redeemed <Box component="b" sx={{ color: t.ink, fontFamily: FONT_NUM }}>{formatCurrency(totals.out)}</Box></span>
          <span>CGT <Box component="b" sx={{ color: t.ink, fontFamily: FONT_NUM }}>{formatCurrency(totals.cgt, 2)}</Box></span>
        </Box>
        {!isMobile && (
          <Box sx={{ display: 'grid', gridTemplateColumns: COLS, gap: 1.5, px: 1, pb: 0.75, fontSize: '0.66rem', fontWeight: 600, color: t.muted, borderBottom: `1px solid ${t.hairline}`, flexShrink: 0 }}>
            <span>Date</span><span>Fund</span><span>Type</span><Box sx={{ textAlign: 'right' }}>Units</Box><Box sx={{ textAlign: 'right' }}>NAV</Box><Box sx={{ textAlign: 'right' }}>Amount</Box><Box sx={{ textAlign: 'right' }}>CGT</Box><span>Source</span><span />
          </Box>
        )}
        <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', scrollbarWidth: 'thin', scrollbarColor: `${t.border} transparent` }}>
          {isLoading ? <Skeleton variant="rounded" height={200} /> : rows.length === 0 ? (
            <Typography sx={{ textAlign: 'center', py: 5, color: t.muted, fontSize: '0.8rem' }}>No transactions match in {rangeLabel(range)}.</Typography>
          ) : pg.shown.map((r) => <TxRow key={r.id} r={r} mobile={isMobile} onEdit={() => setEditing(r)} />)}
        </Box>
        {!isLoading && <Box sx={{ mx: { xs: -1.5, md: -2 }, mb: { xs: -1.5, md: -2 } }}><Pagination page={pg.page} pages={pg.pages} total={rows.length} size={pg.size} onPage={pg.setPage} noun="transactions" /></Box>}
      </FxCard>

      {editing && <EntryEditor entry={editing} onClose={() => setEditing(null)} />}
    </FitPage>
  );
}

const COLS = '92px minmax(0, 2.4fr) minmax(0, 1.1fr) 110px 90px 110px 80px 76px 32px';

function TxRow({ r, mobile, onEdit }) {
  const t = useFx();
  const units = r.unit_delta !== null ? Number(r.unit_delta) : null;
  const amount = units !== null && units < 0 ? (r.net_amount ?? r.gross_amount) : (r.gross_amount ?? r.net_amount);
  const struck = r.reversed || r.reverses_entry_id;
  const typeText = <>{TYPE_LABEL[r.entry_type] ?? r.entry_type}{r.reverses_entry_id && <Box component="span" sx={{ ml: 0.5 }}><Chip>Reversal</Chip></Box>}</>;
  const uColor = units < 0 ? t.neg : units > 0 ? t.pos : t.ink2;
  if (mobile) {
    return (
      <ButtonBase onClick={onEdit} sx={{ display: 'flex', width: '100%', alignItems: 'center', gap: 1.25, py: 1.4, borderBottom: `1px solid ${t.hairline}`, textAlign: 'left', fontFamily: 'inherit', opacity: struck ? 0.5 : 1 }}>
        <AmcLogo code={r.amcCode} name={r.amcName} size={32} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography noWrap sx={{ fontSize: '0.78rem', fontWeight: 650, textDecoration: r.reversed ? 'line-through' : 'none' }}>{r.fundName}</Typography>
          <Typography noWrap sx={{ fontSize: '0.66rem', color: t.muted }}>{fmtDate(r.trade_date)} · {TYPE_LABEL[r.entry_type] ?? r.entry_type}</Typography>
        </Box>
        <Box sx={{ textAlign: 'right' }}>
          <Typography sx={{ fontSize: '0.78rem', fontWeight: 600, fontFamily: FONT_NUM }}>{amount ? formatNumber(Number(amount), 0) : '—'}</Typography>
          <Typography sx={{ fontSize: '0.64rem', fontFamily: FONT_NUM, color: uColor }}>{units === null ? '' : `${units > 0 ? '+' : ''}${formatNumber(units, 2)} u`}</Typography>
        </Box>
      </ButtonBase>
    );
  }
  return (
    <Box onClick={onEdit} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onEdit(); } }}
      sx={{
        display: 'grid', gridTemplateColumns: COLS, gap: 1.5, alignItems: 'center', height: 58, px: 1, borderBottom: `1px solid ${t.hairline}`,
        fontSize: '0.74rem', cursor: 'pointer', opacity: struck ? 0.5 : 1, borderRadius: '10px', transition: 'background-color .16s',
        '&:hover': { bgcolor: t.surface2 }, '&:hover .edit': { opacity: 1 }, '&:focus-visible': { outline: `2px solid ${t.ink}` },
      }}>
      <Box sx={{ fontFamily: FONT_NUM, color: t.ink2, letterSpacing: '-0.02em' }}>{fmtDate(r.trade_date)}</Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
        <AmcLogo code={r.amcCode} name={r.amcName} size={26} />
        <Box sx={{ minWidth: 0 }}>
          <Typography noWrap sx={{ fontSize: '0.74rem', fontWeight: 600, textDecoration: r.reversed ? 'line-through' : 'none' }}>{r.fundName}</Typography>
          <Typography noWrap sx={{ fontSize: '0.62rem', color: t.muted }}>{r.amcName}</Typography>
        </Box>
      </Box>
      <Box sx={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{typeText}</Box>
      <Box sx={{ textAlign: 'right', fontFamily: FONT_NUM, color: uColor, letterSpacing: '-0.02em' }}>{units === null ? '—' : `${units > 0 ? '+' : ''}${formatNumber(units, 4)}`}</Box>
      <Box sx={{ textAlign: 'right', fontFamily: FONT_NUM, letterSpacing: '-0.02em' }}>{r.nav ? formatNumber(Number(r.nav), 4) : '—'}</Box>
      <Box sx={{ textAlign: 'right', fontFamily: FONT_NUM, fontWeight: 600, letterSpacing: '-0.02em' }}>{amount ? formatNumber(Number(amount), 2) : '—'}</Box>
      <Box sx={{ textAlign: 'right', fontFamily: FONT_NUM, letterSpacing: '-0.02em' }}>{r.cgt ? formatNumber(r.cgt, 2) : '—'}</Box>
      <Box sx={{ color: t.muted, fontSize: '0.68rem' }}>{SOURCE[r.origin] ?? r.origin}</Box>
      <EditRounded className="edit" sx={{ fontSize: 15, color: t.muted, opacity: 0, transition: 'opacity .16s' }} />
    </Box>
  );
}
