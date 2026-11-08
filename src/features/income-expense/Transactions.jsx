import { useMemo, useState } from 'react';
import { Box, Typography, InputBase, Skeleton, ButtonBase, useMediaQuery } from '@mui/material';
import { SearchRounded, CloseRounded, EditRounded } from '@mui/icons-material';
import { formatCurrency } from '../../lib/formatters';
import { useFinanceTransactions } from '../../lib/finance/useFinance';
import { useDateRange, inRange, rangeLabel } from '../../lib/dateRange';
import { useFx, PageHeader, Seg, PillSelect, FitPage, FONT_NUM } from '../../components/fx';
import CategoryBadge from './CategoryBadge';
import TransactionEditor from './TransactionEditor';
import StockLogo from '../../components/StockLogo';

const fmtDate = (d) => (d ? new Date(`${d}T00:00:00`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');

/** Every income and expense in the selected range: filter, review, correct. */
export default function Transactions() {
  const t = useFx();
  const isMobile = useMediaQuery('(max-width:900px)');
  const { range } = useDateRange();
  const { data: txns = [], isLoading } = useFinanceTransactions();
  const [type, setType] = useState('all');
  const [catPick, setCat] = useState('all');
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState(null);

  const inPeriod = useMemo(() => txns.filter((x) => inRange(x.date, range)), [txns, range]);
  const cats = useMemo(() => {
    const m = new Map();
    for (const x of inPeriod) if (x.categories?.name && !m.has(x.categories.name)) m.set(x.categories.name, x.categories.icon);
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]))
      .map(([name, icon]) => ({ value: name, label: name, icon: <CategoryBadge icon={icon} name={name} size={20} /> }));
  }, [inPeriod]);
  // A category no longer in the range falls back to "all" instead of showing nothing.
  const cat = cats.some((c) => c.value === catPick) ? catPick : 'all';

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return inPeriod
      .filter((x) => type === 'all' || x.type === type)
      .filter((x) => cat === 'all' || x.categories?.name === cat)
      .filter((x) => !needle || `${x.categories?.name ?? ''} ${x.notes ?? ''} ${x.amount}`.toLowerCase().includes(needle));
  }, [inPeriod, type, cat, q]);

  const sums = rows.reduce((s, x) => { if (x.type === 'credit') s.in += Number(x.amount); else s.out += Number(x.amount); return s; }, { in: 0, out: 0 });
  const filtered = type !== 'all' || cat !== 'all' || q;

  return (
    <FitPage>
      <PageHeader title="Transactions" />

      <Box sx={{ display: 'flex', gap: 0.75, mb: 1.25, flexWrap: 'wrap', alignItems: 'center', flexShrink: 0 }}>
        <Seg size="sm" label="Type" value={type} onChange={setType} options={[{ value: 'all', label: 'All' }, { value: 'credit', label: 'Income' }, { value: 'debit', label: 'Expense' }]} />
        <PillSelect value={cat} onChange={setCat} label="Category" width={isMobile ? 160 : 200} items={[{ value: 'all', label: 'All categories' }, ...cats]} />
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, height: 34, px: 1.25, borderRadius: 999, border: `1px solid ${t.border}`, bgcolor: t.surface, flex: isMobile ? '1 1 160px' : '0 1 220px' }}>
          <SearchRounded sx={{ fontSize: 16, color: t.muted }} />
          <InputBase value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" inputProps={{ 'aria-label': 'Search transactions' }} sx={{ fontSize: '0.76rem', flex: 1 }} />
        </Box>
        {filtered && (
          <ButtonBase onClick={() => { setType('all'); setCat('all'); setQ(''); }} sx={{ height: 34, px: 1.25, borderRadius: 999, fontSize: '0.74rem', fontWeight: 600, color: t.muted, gap: 0.5, fontFamily: 'inherit' }}>
            <CloseRounded sx={{ fontSize: 15 }} />Clear
          </ButtonBase>
        )}
      </Box>

      <Box sx={{ bgcolor: t.surface, border: `1px solid ${t.border}`, borderRadius: '20px', boxShadow: t.shadow, display: 'flex', flexDirection: 'column', minHeight: 0, flex: isMobile ? 'none' : '1 1 0', height: isMobile ? '68dvh' : 'auto', overflow: 'hidden' }}>
        <Box sx={{ display: 'flex', gap: 2.5, flexWrap: 'wrap', px: 2.25, pt: 1.5, pb: 1, fontSize: '0.74rem', color: t.muted, flexShrink: 0 }}>
          <span><b style={{ color: t.ink }}>{rows.length}</b> in {rangeLabel(range)}</span>
          <span>Income <Box component="b" sx={{ color: t.pos, fontFamily: FONT_NUM }}>{formatCurrency(sums.in)}</Box></span>
          <span>Expense <Box component="b" sx={{ color: t.ink, fontFamily: FONT_NUM }}>{formatCurrency(sums.out)}</Box></span>
          <span>Net <Box component="b" sx={{ color: sums.in - sums.out < 0 ? t.neg : t.ink, fontFamily: FONT_NUM }}>{formatCurrency(sums.in - sums.out)}</Box></span>
        </Box>
        {!isMobile && (
          <Box sx={{ display: 'grid', gridTemplateColumns: COLS, columnGap: 2, px: 2.25, pb: 0.9, borderBottom: `1px solid ${t.hairline}`, flexShrink: 0 }}>
            {['Date', 'Category', 'Note', 'Amount', ''].map((h, i) => (
              <Typography key={h || i} sx={{ fontSize: '0.68rem', fontWeight: 600, color: t.muted, textAlign: i === 3 ? 'right' : 'left' }}>{h}</Typography>
            ))}
          </Box>
        )}
        <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', px: { xs: 1, md: 1.25 }, py: 0.5, scrollbarWidth: 'thin', scrollbarColor: `${t.border} transparent` }}>
          {isLoading ? Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} height={50} sx={{ mx: 1 }} />)
            : rows.length === 0 ? <Typography sx={{ textAlign: 'center', color: t.muted, fontSize: '0.82rem', py: 6 }}>Nothing in {rangeLabel(range)}.</Typography>
              : rows.map((x) => <Row key={x.id} x={x} mobile={isMobile} onOpen={() => setEditing(x)} />)}
        </Box>
      </Box>

      {editing && <TransactionEditor txn={editing} onClose={() => setEditing(null)} />}
    </FitPage>
  );
}

const COLS = '100px minmax(0, 1.4fr) minmax(0, 2fr) 140px 24px';

function Row({ x, mobile, onOpen }) {
  const t = useFx();
  const acct = x.savings_accounts; // savings profit credited to a bank account
  const logo = (size) => (acct ? <StockLogo symbol={acct.bank_symbol} size={size >= 34 ? 'md' : 'sm'} /> : <CategoryBadge icon={x.categories?.icon} name={x.categories?.name} size={size} />);
  const title = acct ? acct.name : x.categories?.name ?? 'Uncategorized';
  const detail = acct ? [acct.bank_name, x.notes].filter(Boolean).join(', ') : x.notes;
  const income = x.type === 'credit';
  const amount = <Typography data-numeric noWrap sx={{ fontFamily: FONT_NUM, fontSize: '0.84rem', fontWeight: 650, letterSpacing: '-0.02em', textAlign: 'right', color: income ? t.pos : t.ink }}>{income ? '+' : '−'}{formatCurrency(Number(x.amount))}</Typography>;
  if (mobile) {
    return (
      <ButtonBase onClick={onOpen} sx={{ display: 'flex', width: '100%', alignItems: 'center', gap: 1.25, py: 1, px: 0.75, borderBottom: `1px solid ${t.hairline}`, textAlign: 'left', fontFamily: 'inherit' }}>
        {logo(34)}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography noWrap sx={{ fontSize: '0.84rem', fontWeight: 650 }}>{title}</Typography>
          <Typography noWrap sx={{ fontSize: '0.68rem', color: t.muted }}>{fmtDate(x.date)}{detail ? `, ${detail}` : ''}</Typography>
        </Box>
        {amount}
      </ButtonBase>
    );
  }
  return (
    <ButtonBase component="div" onClick={onOpen} aria-label={`${x.categories?.name ?? 'Transaction'} on ${x.date}: edit`} sx={{
      display: 'grid', gridTemplateColumns: COLS, columnGap: 2, alignItems: 'center', width: '100%', px: 1, py: 0.9,
      borderBottom: `1px solid ${t.hairline}`, borderRadius: '10px', textAlign: 'left', fontFamily: 'inherit',
      '@media (hover: hover)': { '&:hover': { bgcolor: t.surface2 }, '&:hover .edit': { opacity: 1 } }, '&:focus-visible': { outline: `2px solid ${t.ink}`, outlineOffset: -2 },
    }}>
      <Typography sx={{ fontFamily: FONT_NUM, fontSize: '0.78rem', color: t.ink2, letterSpacing: '-0.02em' }}>{fmtDate(x.date)}</Typography>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.1, minWidth: 0 }}>
        {logo(28)}
        <Typography noWrap sx={{ fontSize: '0.8rem', fontWeight: 650 }}>{title}</Typography>
      </Box>
      <Typography noWrap sx={{ fontSize: '0.76rem', color: t.muted }}>{detail || '—'}</Typography>
      {amount}
      <EditRounded className="edit" sx={{ fontSize: 15, color: t.muted, opacity: 0, transition: 'opacity .16s' }} />
    </ButtonBase>
  );
}
