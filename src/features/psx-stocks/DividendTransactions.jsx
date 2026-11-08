import { useMemo, useState } from 'react';
import { Box, Dialog, Typography, IconButton, InputBase, Tooltip, ButtonBase, useMediaQuery } from '@mui/material';
import { CloseRounded, SearchRounded, FileDownloadOutlined, ChevronRightRounded } from '@mui/icons-material';
import { formatCurrency, formatNumber } from '../../lib/formatters';
import { useDividends } from '../../lib/psx/useDividends';
import { summarizeDividends } from '../../lib/psx/dividends';
import { useDateRange, rangeLabel } from '../../lib/dateRange';
import { useFx, Seg, FONT_NUM, usePaged, Pagination } from '../../components/fx';
import StockLogo from '../../components/StockLogo';
import DividendDialog from './DividendDialog';

const fmtDate = (d) => (d ? new Date(`${d}T00:00:00`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
const monthTitle = (m) => new Date(`${m}-01T00:00:00`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
const money = (v) => formatCurrency(Number(v ?? 0), 2);
const shareText = (v) => formatNumber(Number(v), Number(v) % 1 ? 2 : 0);
const deductionsOf = (x) => Number(x.tax_amount ?? 0) + Number(x.jh_tax_amount ?? 0) + Number(x.zakat_amount ?? 0);
const FILER = { filer: 'Filer', non_filer: 'Non-filer', unknown: 'Unknown' };

// Date | Stock | Account & warrant | Status | Shares | Gross | Tax | Net | chevron
const GRID = '112px minmax(200px, 1.8fr) minmax(140px, 1fr) 92px 72px 104px 104px 116px 18px';
const HEAD = ['Paid', 'Stock', 'Account / warrant', 'Tax status', 'Shares', 'Gross', 'Tax', 'Net', ''];

/** Every dividend warrant with all statement details, grouped by month; search, totals, CSV, click to edit. */
export default function DividendTransactions({ onClose }) {
  const t = useFx();
  const isMobile = useMediaQuery('(max-width:900px)');
  const { range } = useDateRange();
  const { all } = useDividends();
  const [scope, setScope] = useState('range');
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState(null);

  const rows = useMemo(() => {
    const base = summarizeDividends(all, scope === 'range' ? range : {}).rows;
    const needle = q.trim().toLowerCase();
    return needle ? base.filter((x) => `${x.symbol} ${x.company_name ?? ''} ${x.warrant_no ?? ''}`.toLowerCase().includes(needle)) : base;
  }, [all, range, scope, q]);
  const totals = useMemo(() => summarizeDividends(rows), [rows]);
  // Ten warrants per page, grouped by month; a month's total is the whole month, even across pages.
  const pg = usePaged(rows, `${scope}|${q}|${range.start}|${range.end}`);
  const monthNet = useMemo(() => {
    const m = new Map();
    for (const x of rows) { const k = x.payment_date.slice(0, 7); m.set(k, (m.get(k) ?? 0) + Number(x.net_amount)); }
    return m;
  }, [rows]);
  const groups = useMemo(() => {
    const m = new Map();
    for (const x of pg.shown) {
      const k = x.payment_date.slice(0, 7);
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(x);
    }
    return [...m.entries()].map(([month, list]) => ({ month, list, net: monthNet.get(month) ?? 0 }));
  }, [pg.shown, monthNet]);

  const exportCsv = () => {
    const esc = (v) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const head = ['Payment date', 'Issue date', 'Symbol', 'Company', 'Account', 'Warrant', 'Filer status', 'Filer status (as printed)', 'Shares', 'Gross', 'Tax', "JH's tax", 'Zakat', 'Net', 'Source', 'Note'];
    const body = rows.map((x) => [x.payment_date, x.issue_date, x.symbol, x.company_name, x.account_ref, x.warrant_no, FILER[x.filer_status], x.filer_status_raw, x.shares, x.gross_amount, x.tax_amount, x.jh_tax_amount, x.zakat_amount, x.net_amount, x.source, x.notes]);
    const csv = [head, ...body].map((r) => r.map(esc).join(',')).join('\n');
    const a = document.createElement('a');
    // Byte-order mark so Excel opens the file as UTF-8.
    a.href = URL.createObjectURL(new Blob([String.fromCharCode(0xfeff), csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `dividends-${scope === 'range' ? `${range.start}-to-${range.end}` : 'all-time'}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const rate = totals.gross > 0 ? (totals.deductions / totals.gross) * 100 : null;

  return (
    <Dialog open onClose={onClose} fullScreen={isMobile} fullWidth maxWidth="lg"
      slotProps={{ paper: { sx: { borderRadius: isMobile ? 0 : '24px', bgcolor: t.surface, backgroundImage: 'none', m: isMobile ? 0 : 3, height: isMobile ? '100%' : 'min(88dvh, 860px)', display: 'flex', flexDirection: 'column', overflow: 'hidden' } } }}>

      <Box sx={{ px: { xs: 2, md: 3 }, pt: { xs: 2, md: 2.75 }, pb: 2, flexShrink: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography component="h2" sx={{ fontSize: '1.1rem', fontWeight: 750, letterSpacing: '-0.01em' }}>Dividend transactions</Typography>
            <Typography sx={{ fontSize: '0.74rem', color: t.muted, mt: 0.25 }}>
              {scope === 'range' ? rangeLabel(range) : 'All time'}, by payment date. Select a row to edit or delete it.
            </Typography>
          </Box>
          <Tooltip title="Download as CSV" arrow>
            <span>
              <IconButton aria-label="Download as CSV" onClick={exportCsv} disabled={!rows.length} sx={{ border: `1px solid ${t.border}`, width: 36, height: 36 }}>
                <FileDownloadOutlined sx={{ fontSize: 18 }} />
              </IconButton>
            </span>
          </Tooltip>
          <IconButton aria-label="Close" onClick={onClose} sx={{ width: 36, height: 36 }}><CloseRounded sx={{ fontSize: 20 }} /></IconButton>
        </Box>

        <Box sx={{ display: 'flex', gap: 0.75, mt: 2, flexWrap: 'wrap', alignItems: 'center' }}>
          <Seg size="sm" label="Period" value={scope} onChange={setScope} options={[{ value: 'range', label: 'Selected period' }, { value: 'all', label: 'All time' }]} />
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, height: 34, px: 1.25, borderRadius: 999, border: `1px solid ${t.border}`, bgcolor: t.surface, flex: isMobile ? '1 1 100%' : '0 1 280px' }}>
            <SearchRounded sx={{ fontSize: 16, color: t.muted }} />
            <InputBase value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search stock, company or warrant" inputProps={{ 'aria-label': 'Search dividends' }} sx={{ fontSize: '0.76rem', flex: 1 }} />
            {q && <IconButton size="small" aria-label="Clear search" onClick={() => setQ('')} sx={{ p: 0.25 }}><CloseRounded sx={{ fontSize: 14 }} /></IconButton>}
          </Box>
        </Box>

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', md: 'repeat(4, minmax(0, 1fr))' }, gap: 1, mt: 2 }}>
          <Stat label="Warrants" value={String(rows.length)} />
          <Stat label="Gross" value={money(totals.gross)} />
          <Stat label="Tax withheld" value={money(totals.deductions)} note={rate === null ? null : `${rate.toFixed(1)}% of gross`} />
          <Stat label="Net received" value={money(totals.net)} accent />
        </Box>
      </Box>

      <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto', borderTop: `1px solid ${t.hairline}`, scrollbarWidth: 'thin', scrollbarColor: `${t.border} transparent` }}>
        {rows.length === 0 ? (
          <Typography sx={{ textAlign: 'center', color: t.muted, fontSize: '0.82rem', py: 8 }}>{q ? 'No dividends match your search.' : 'No dividends paid in this period.'}</Typography>
        ) : isMobile ? (
          <Box sx={{ px: 1.5, pb: 2 }}>
            {groups.map((g) => (
              <Box key={g.month}>
                <MonthHeader g={g} />
                <Box sx={{ display: 'grid', gap: 1 }}>{g.list.map((x) => <MobileCard key={x.id} x={x} onOpen={() => setEditing(x)} />)}</Box>
              </Box>
            ))}
          </Box>
        ) : (
          <Box sx={{ minWidth: 960, px: 2 }}>
            <Box sx={{ display: 'grid', gridTemplateColumns: GRID, columnGap: 2, px: 1.5, py: 1.1, position: 'sticky', top: 0, zIndex: 2, bgcolor: t.surface, borderBottom: `1px solid ${t.hairline}` }}>
              {HEAD.map((h, i) => (
                <Typography key={h || i} sx={{ fontSize: '0.68rem', fontWeight: 600, color: t.muted, textAlign: i >= 4 && i <= 7 ? 'right' : 'left', whiteSpace: 'nowrap' }}>{h}</Typography>
              ))}
            </Box>
            {groups.map((g) => (
              <Box key={g.month}>
                <MonthHeader g={g} />
                {g.list.map((x) => <DesktopRow key={x.id} x={x} onOpen={() => setEditing(x)} />)}
              </Box>
            ))}
            <Box sx={{ display: 'grid', gridTemplateColumns: GRID, columnGap: 2, alignItems: 'center', px: 1.5, py: 1.4, mt: 1, position: 'sticky', bottom: 0, zIndex: 2, bgcolor: t.surface, borderTop: `1px solid ${t.border}` }}>
              <Typography sx={{ gridColumn: '1 / 5', fontSize: '0.8rem', fontWeight: 700 }}>Total, {rows.length} warrant{rows.length === 1 ? '' : 's'}</Typography>
              <span />
              <Typography sx={num(t, true)}>{money(totals.gross)}</Typography>
              <Typography sx={num(t, true)}>{money(totals.deductions)}</Typography>
              <Typography sx={{ ...num(t, true), color: t.pos }}>+{money(totals.net)}</Typography>
              <span />
            </Box>
          </Box>
        )}
      </Box>

      <Pagination page={pg.page} pages={pg.pages} total={rows.length} size={pg.size} onPage={pg.setPage} noun="warrants" />

      {editing && <DividendDialog dividend={editing} existing={all} onClose={() => setEditing(null)} />}
    </Dialog>
  );
}

const num = (t, strong) => ({ fontFamily: FONT_NUM, fontSize: '0.8rem', letterSpacing: '-0.02em', textAlign: 'right', color: strong ? t.ink : t.ink2, fontWeight: strong ? 700 : 450, whiteSpace: 'nowrap' });

function Stat({ label, value, note, accent }) {
  const t = useFx();
  return (
    <Box sx={{ bgcolor: t.surface2, border: `1px solid ${t.hairline}`, borderRadius: '14px', px: 1.5, py: 1.1, minWidth: 0 }}>
      <Typography sx={{ fontSize: '0.66rem', color: t.muted, fontWeight: 600 }}>{label}</Typography>
      <Typography data-numeric noWrap sx={{ fontFamily: FONT_NUM, fontSize: '1.02rem', fontWeight: 650, letterSpacing: '-0.03em', color: accent ? t.pos : t.ink }}>{value}</Typography>
      {note && <Typography noWrap sx={{ fontSize: '0.64rem', color: t.muted }}>{note}</Typography>}
    </Box>
  );
}

function MonthHeader({ g }) {
  const t = useFx();
  return (
    <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 1, px: { xs: 0.25, md: 1.5 }, pt: 2, pb: 0.75 }}>
      <Typography sx={{ fontSize: '0.76rem', fontWeight: 700, color: t.ink }}>
        {monthTitle(g.month)} <Box component="span" sx={{ fontWeight: 500, color: t.muted }}>{g.list.length} warrant{g.list.length === 1 ? '' : 's'}</Box>
      </Typography>
      <Typography data-numeric sx={{ fontFamily: FONT_NUM, fontSize: '0.76rem', fontWeight: 650, color: t.pos, letterSpacing: '-0.02em' }}>+{money(g.net)}</Typography>
    </Box>
  );
}

function FilerChip({ x }) {
  const t = useFx();
  const tone = x.filer_status === 'non_filer' ? { c: t.neg, b: t.negSoft } : x.filer_status === 'filer' ? { c: t.pos, b: t.posSoft } : { c: t.muted, b: t.surface2 };
  return (
    <Tooltip title={x.filer_status_raw ? `On the statement: ${x.filer_status_raw}` : 'Tax status on the warrant'} arrow>
      <Box component="span" sx={{ display: 'inline-block', px: 0.9, py: '2px', borderRadius: 999, fontSize: '0.66rem', fontWeight: 650, whiteSpace: 'nowrap', color: tone.c, bgcolor: tone.b }}>
        {FILER[x.filer_status] ?? 'Unknown'}
      </Box>
    </Tooltip>
  );
}

function TaxCell({ x, align = 'right' }) {
  const t = useFx();
  const extra = [Number(x.jh_tax_amount) ? `JH ${money(x.jh_tax_amount)}` : null, Number(x.zakat_amount) ? `zakat ${money(x.zakat_amount)}` : null].filter(Boolean);
  return (
    <Box sx={{ textAlign: align, minWidth: 0 }}>
      <Typography sx={{ ...num(t), textAlign: align }}>{money(deductionsOf(x))}</Typography>
      {extra.length > 0 && <Typography noWrap sx={{ fontSize: '0.62rem', color: t.muted }}>incl. {extra.join(', ')}</Typography>}
    </Box>
  );
}

function DesktopRow({ x, onOpen }) {
  const t = useFx();
  const mono = { fontFamily: FONT_NUM, fontSize: '0.74rem', letterSpacing: '-0.01em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' };
  return (
    <ButtonBase component="div" onClick={onOpen} aria-label={`${x.symbol} dividend paid ${fmtDate(x.payment_date)}: edit`} sx={{
      display: 'grid', gridTemplateColumns: GRID, columnGap: 2, alignItems: 'center', width: '100%', px: 1.5, py: 1.35,
      borderRadius: '12px', textAlign: 'left', fontFamily: 'inherit',
      '& + &': { borderTop: `1px solid ${t.hairline}` },
      '@media (hover: hover)': { '&:hover': { bgcolor: t.surface2 }, '&:hover .chev': { opacity: 1 } },
      '&:focus-visible': { outline: `2px solid ${t.ink}`, outlineOffset: -2 },
    }}>
      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{ ...num(t), textAlign: 'left', color: t.ink }}>{fmtDate(x.payment_date)}</Typography>
        <Typography noWrap sx={{ fontSize: '0.64rem', color: t.muted }}>{x.issue_date ? `issued ${fmtDate(x.issue_date)}` : 'issue date not given'}</Typography>
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.1, minWidth: 0 }}>
        <StockLogo symbol={x.symbol} size="sm" />
        <Box sx={{ minWidth: 0 }}>
          <Typography noWrap sx={{ fontSize: '0.82rem', fontWeight: 650 }}>{x.symbol}</Typography>
          <Typography noWrap sx={{ fontSize: '0.66rem', color: t.muted }}>{x.company_name ?? (x.source === 'manual' ? 'Entered manually' : '')}</Typography>
        </Box>
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{ ...mono, color: t.ink2 }}>{x.account_ref ?? '—'}</Typography>
        <Typography sx={{ ...mono, fontSize: '0.66rem', color: t.muted }}>{x.warrant_no ? `warrant ${x.warrant_no}` : 'no warrant no.'}</Typography>
      </Box>
      <Box><FilerChip x={x} /></Box>
      <Typography sx={num(t)}>{shareText(x.shares)}</Typography>
      <Typography sx={num(t)}>{money(x.gross_amount)}</Typography>
      <TaxCell x={x} />
      <Typography sx={{ ...num(t), color: t.pos, fontWeight: 650 }}>+{money(x.net_amount)}</Typography>
      <ChevronRightRounded className="chev" sx={{ fontSize: 18, color: t.muted, opacity: 0, transition: 'opacity .16s' }} />
    </ButtonBase>
  );
}

function MobileCard({ x, onOpen }) {
  const t = useFx();
  const cell = (label, value) => (
    <Box sx={{ minWidth: 0 }}>
      <Typography sx={{ fontSize: '0.62rem', color: t.muted, fontWeight: 600 }}>{label}</Typography>
      <Typography noWrap sx={{ fontFamily: FONT_NUM, fontSize: '0.76rem', color: t.ink2, letterSpacing: '-0.02em' }}>{value}</Typography>
    </Box>
  );
  return (
    <ButtonBase onClick={onOpen} sx={{ display: 'block', width: '100%', textAlign: 'left', p: 1.5, borderRadius: '16px', border: `1px solid ${t.border}`, bgcolor: t.surface, fontFamily: 'inherit' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.1 }}>
        <StockLogo symbol={x.symbol} size="md" />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography noWrap sx={{ fontSize: '0.88rem', fontWeight: 700 }}>{x.symbol}</Typography>
          <Typography noWrap sx={{ fontSize: '0.66rem', color: t.muted }}>{fmtDate(x.payment_date)}</Typography>
        </Box>
        <Box sx={{ textAlign: 'right' }}>
          <Typography data-numeric sx={{ fontFamily: FONT_NUM, fontSize: '0.95rem', fontWeight: 700, color: t.pos }}>+{money(x.net_amount)}</Typography>
          <FilerChip x={x} />
        </Box>
      </Box>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 1, mt: 1.25, pt: 1.25, borderTop: `1px solid ${t.hairline}` }}>
        {cell('Shares', shareText(x.shares))}
        {cell('Gross', money(x.gross_amount))}
        {cell('Tax', money(deductionsOf(x)))}
        {cell('Issued', fmtDate(x.issue_date))}
        {cell('Account', x.account_ref ?? '—')}
        {cell('Warrant', x.warrant_no ?? '—')}
      </Box>
    </ButtonBase>
  );
}
