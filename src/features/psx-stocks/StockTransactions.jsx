import { useMemo, useState } from 'react';
import { Box, Typography, InputBase, Skeleton, ButtonBase, IconButton, Tooltip, useMediaQuery } from '@mui/material';
import { SearchRounded, CloseRounded, EditRounded, UploadFileRounded } from '@mui/icons-material';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '../../store/authStore';
import { formatCurrency, formatNumber } from '../../lib/formatters';
import { getStockName } from '../../lib/stockMeta';
import { stockTradesQuery } from '../../lib/psx/usePsxPortfolio';
import { useDateRange, inRange, rangeLabel } from '../../lib/dateRange';
import StockLogo from '../../components/StockLogo';
import { useFx, PageHeader, Seg, PillSelect, FitPage, FONT_NUM } from '../../components/fx';
import TradeEditor from './TradeEditor';
import TradeImportDialog from './TradeImportDialog';
import BrokerLogo from './BrokerLogo';
import { BROKERS } from '../../lib/psx/confirmations';

const fmtDate = (d) => (d ? new Date(`${d}T00:00:00`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
const amountOf = (x) => Number(x.price) * Number(x.quantity) + (x.type === 'buy' ? Number(x.fee || 0) : -Number(x.fee || 0));

/** Every PSX trade in the selected range: filter, review, correct. */
export default function StockTransactions() {
  const t = useFx();
  const isMobile = useMediaQuery('(max-width:900px)');
  const user = useAuthStore((s) => s.user);
  const { range } = useDateRange();
  const { data: trades = [], isLoading } = useQuery(stockTradesQuery(user?.id));
  const [type, setType] = useState('all');
  const [symPick, setSym] = useState('all');
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState(null);
  const [brokerPick, setBroker] = useState('all');
  const [importing, setImporting] = useState(false);

  const inPeriod = useMemo(() => trades.filter((x) => inRange(x.date, range)), [trades, range]);
  const symbols = useMemo(() => [...new Set(inPeriod.map((x) => String(x.symbol).toUpperCase()))].sort()
    .map((s) => ({ value: s, label: s, icon: <StockLogo symbol={s} size="sm" /> })), [inPeriod]);
  // A stock no longer in the range falls back to "all" instead of showing nothing.
  const sym = symbols.some((o) => o.value === symPick) ? symPick : 'all';
  // Broker filter: only brokers that appear in the range, plus hand-entered trades.
  const brokers = useMemo(() => {
    const set = new Set(inPeriod.map((x) => x.broker ?? 'manual'));
    return [
      ...Object.values(BROKERS).filter((b) => set.has(b.code)).map((b) => ({ value: b.code, label: b.name, icon: <BrokerLogo broker={b.code} size={18} /> })),
      ...(set.has('manual') ? [{ value: 'manual', label: 'Entered by hand' }] : []),
    ];
  }, [inPeriod]);
  const broker = brokers.some((o) => o.value === brokerPick) ? brokerPick : 'all';

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return inPeriod
      .filter((x) => type === 'all' || x.type === type)
      .filter((x) => sym === 'all' || String(x.symbol).toUpperCase() === sym)
      .filter((x) => broker === 'all' || (x.broker ?? 'manual') === broker)
      .filter((x) => !needle || `${x.symbol} ${x.company_name ?? ''} ${x.notes ?? ''}`.toLowerCase().includes(needle))
      .sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')));
  }, [inPeriod, type, sym, broker, q]);

  const sums = rows.reduce((s, x) => {
    const gross = Number(x.price) * Number(x.quantity);
    if (x.type === 'buy') s.bought += gross; else s.sold += gross;
    s.fees += Number(x.fee || 0);
    return s;
  }, { bought: 0, sold: 0, fees: 0 });
  const filtered = type !== 'all' || sym !== 'all' || broker !== 'all' || q;

  return (
    <FitPage>
      <PageHeader title="Trades" actions={(
        <Tooltip title="Upload trade confirmations" arrow>
          <IconButton aria-label="Upload trade confirmations" onClick={() => setImporting(true)}
            sx={{ width: 34, height: 34, border: `1px solid ${t.border}`, bgcolor: t.surface, color: t.ink, '&:hover': { bgcolor: t.surface2 } }}>
            <UploadFileRounded sx={{ fontSize: 18 }} />
          </IconButton>
        </Tooltip>
      )} />

      <Box sx={{ display: 'flex', gap: 0.75, mb: 1.25, flexWrap: 'wrap', alignItems: 'center', flexShrink: 0 }}>
        <Seg size="sm" label="Type" value={type} onChange={setType} options={[{ value: 'all', label: 'All' }, { value: 'buy', label: 'Buys' }, { value: 'sell', label: 'Sells' }]} />
        <PillSelect value={sym} onChange={setSym} label="Stock" width={150} items={[{ value: 'all', label: 'All stocks' }, ...symbols]} />
        {brokers.length > 1 && <PillSelect value={broker} onChange={setBroker} label="Broker" width={isMobile ? 150 : 180} items={[{ value: 'all', label: 'All brokers' }, ...brokers]} />}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, height: 34, px: 1.25, borderRadius: 999, border: `1px solid ${t.border}`, bgcolor: t.surface, flex: isMobile ? '1 1 160px' : '0 1 220px' }}>
          <SearchRounded sx={{ fontSize: 16, color: t.muted }} />
          <InputBase value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" inputProps={{ 'aria-label': 'Search trades' }} sx={{ fontSize: '0.76rem', flex: 1 }} />
        </Box>
        {filtered && (
          <ButtonBase onClick={() => { setType('all'); setSym('all'); setBroker('all'); setQ(''); }} sx={{ height: 34, px: 1.25, borderRadius: 999, fontSize: '0.74rem', fontWeight: 600, color: t.muted, gap: 0.5, fontFamily: 'inherit' }}>
            <CloseRounded sx={{ fontSize: 15 }} />Clear
          </ButtonBase>
        )}
      </Box>

      <Box sx={{ bgcolor: t.surface, border: `1px solid ${t.border}`, borderRadius: '20px', boxShadow: t.shadow, display: 'flex', flexDirection: 'column', minHeight: 0, flex: isMobile ? 'none' : '1 1 0', height: isMobile ? '68dvh' : 'auto', overflow: 'hidden' }}>
        <Box sx={{ display: 'flex', gap: 2.5, flexWrap: 'wrap', px: 2.25, pt: 1.5, pb: 1, fontSize: '0.74rem', color: t.muted, flexShrink: 0 }}>
          <span><b style={{ color: t.ink }}>{rows.length}</b> trade{rows.length === 1 ? '' : 's'} in {rangeLabel(range)}</span>
          <span>Bought <Box component="b" sx={{ color: t.ink, fontFamily: FONT_NUM }}>{formatCurrency(sums.bought)}</Box></span>
          <span>Sold <Box component="b" sx={{ color: t.ink, fontFamily: FONT_NUM }}>{formatCurrency(sums.sold)}</Box></span>
          <span>Fees <Box component="b" sx={{ color: t.ink, fontFamily: FONT_NUM }}>{formatCurrency(sums.fees, 2)}</Box></span>
        </Box>
        {!isMobile && (
          <Box sx={{ display: 'grid', gridTemplateColumns: COLS, columnGap: 2, px: 2.25, pb: 0.9, borderBottom: `1px solid ${t.hairline}`, flexShrink: 0 }}>
            {['Date', 'Stock', 'Type', 'Shares', 'Price', 'Fee', 'Amount', ''].map((h, i) => (
              <Typography key={h || i} sx={{ fontSize: '0.68rem', fontWeight: 600, color: t.muted, textAlign: i >= 3 ? 'right' : 'left' }}>{h}</Typography>
            ))}
          </Box>
        )}
        <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', px: { xs: 1, md: 1.25 }, py: 0.5, scrollbarWidth: 'thin', scrollbarColor: `${t.border} transparent` }}>
          {isLoading ? Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} height={50} sx={{ mx: 1 }} />)
            : rows.length === 0 ? <Typography sx={{ textAlign: 'center', color: t.muted, fontSize: '0.82rem', py: 6 }}>No trades in {rangeLabel(range)}.</Typography>
              : rows.map((x) => <TradeRow key={x.id} x={x} mobile={isMobile} onOpen={() => setEditing(x)} />)}
        </Box>
      </Box>

      {editing && <TradeEditor trade={editing} onClose={() => setEditing(null)} />}
      {importing && <TradeImportDialog onClose={() => setImporting(false)} />}
    </FitPage>
  );
}

const COLS = '96px minmax(0, 2fr) 64px 84px 92px 80px 116px 24px';

function TradeRow({ x, mobile, onOpen }) {
  const t = useFx();
  const sym = String(x.symbol).toUpperCase();
  const buy = x.type === 'buy';
  const q = Number(x.quantity);
  const num = { fontFamily: FONT_NUM, letterSpacing: '-0.02em', textAlign: 'right', fontSize: '0.78rem' };
  const typeTag = (
    <Box component="span" sx={{ px: 0.9, py: '1px', borderRadius: 999, fontSize: '0.66rem', fontWeight: 700, color: buy ? t.pos : t.neg, bgcolor: buy ? t.posSoft : t.negSoft }}>{buy ? 'Buy' : 'Sell'}</Box>
  );
  if (mobile) {
    return (
      <ButtonBase onClick={onOpen} sx={{ display: 'flex', width: '100%', alignItems: 'center', gap: 1.25, py: 1, px: 0.75, borderBottom: `1px solid ${t.hairline}`, textAlign: 'left', fontFamily: 'inherit' }}>
        <StockLogo symbol={sym} size="md" />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}><Typography sx={{ fontSize: '0.84rem', fontWeight: 650 }}>{sym}</Typography>{typeTag}{x.broker && <BrokerLogo broker={x.broker} size={16} />}</Box>
          <Typography noWrap sx={{ fontSize: '0.68rem', color: t.muted }}>{fmtDate(x.date)}, {formatNumber(q, q % 1 ? 2 : 0)} at {formatNumber(Number(x.price), 2)}</Typography>
        </Box>
        <Typography data-numeric sx={{ ...num, fontSize: '0.84rem', fontWeight: 650 }}>{formatCurrency(amountOf(x))}</Typography>
      </ButtonBase>
    );
  }
  return (
    <ButtonBase component="div" onClick={onOpen} aria-label={`${sym} ${x.type} on ${x.date}: edit`} sx={{
      display: 'grid', gridTemplateColumns: COLS, columnGap: 2, alignItems: 'center', width: '100%', px: 1, py: 0.9,
      borderBottom: `1px solid ${t.hairline}`, borderRadius: '10px', textAlign: 'left', fontFamily: 'inherit',
      '@media (hover: hover)': { '&:hover': { bgcolor: t.surface2 }, '&:hover .edit': { opacity: 1 } }, '&:focus-visible': { outline: `2px solid ${t.ink}`, outlineOffset: -2 },
    }}>
      <Typography sx={{ ...num, textAlign: 'left', color: t.ink2 }}>{fmtDate(x.date)}</Typography>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.1, minWidth: 0 }}>
        <StockLogo symbol={sym} size="sm" />
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography noWrap sx={{ fontSize: '0.8rem', fontWeight: 650 }}>{sym}</Typography>
          <Typography noWrap sx={{ fontSize: '0.66rem', color: t.muted }}>{x.notes || getStockName(sym, x.company_name)}</Typography>
        </Box>
        {x.broker && <BrokerLogo broker={x.broker} size={20} tooltip={`${BROKERS[x.broker]?.name ?? 'Broker'}${x.account_ref ? `, account ${x.account_ref}` : ''}`} />}
      </Box>
      <Box>{typeTag}</Box>
      <Typography sx={num}>{formatNumber(q, q % 1 ? 2 : 0)}</Typography>
      <Typography sx={num}>{formatNumber(Number(x.price), 2)}</Typography>
      <Typography sx={{ ...num, color: t.ink2 }}>{x.fee ? formatNumber(Number(x.fee), 2) : '—'}</Typography>
      <Typography sx={{ ...num, fontWeight: 650 }}>{formatCurrency(amountOf(x), 2)}</Typography>
      <EditRounded className="edit" sx={{ fontSize: 15, color: t.muted, opacity: 0, transition: 'opacity .16s' }} />
    </ButtonBase>
  );
}
