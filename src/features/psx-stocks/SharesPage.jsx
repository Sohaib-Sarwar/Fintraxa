import { useMemo, useState } from 'react';
import { Box, Typography, InputBase, IconButton, Skeleton, Alert, Tooltip, CircularProgress, ButtonBase, useMediaQuery } from '@mui/material';
import { SearchRounded, RefreshRounded, StarRounded, StarOutlineRounded } from '@mui/icons-material';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { dbErrorHandler } from '../../lib/dbErrors';
import { invalidateCache } from '../../lib/api';
import { psxStocksQuery } from '../../lib/marketQueries';
import { useAuthStore } from '../../store/authStore';
import { useAppStore } from '../../store/appStore';
import { formatNumber } from '../../lib/formatters';
import { getStockSector, getAllSectors } from '../../lib/psxSectors';
import { getStockName } from '../../lib/stockMeta';
import { usePsxPortfolio } from '../../lib/psx/usePsxPortfolio';
import DataFreshness from '../../components/DataFreshness';
import StockLogo from '../../components/StockLogo';
import { useFx, PageHeader, Seg, PillSelect, FitPage, FONT_NUM, signColor } from '../../components/fx';
import TradeDialog from './TradeDialog';

const VIEWS = [
  { value: 'all', label: 'All' }, { value: 'gainers', label: 'Gainers' }, { value: 'losers', label: 'Losers' },
  { value: 'active', label: 'Active' }, { value: 'watch', label: 'Watchlist' },
];
const SORTS = [
  { value: 'volume', label: 'Most traded' }, { value: 'change_desc', label: 'Top change' }, { value: 'change_asc', label: 'Lowest change' },
  { value: 'price_desc', label: 'Highest price' }, { value: 'price_asc', label: 'Lowest price' }, { value: 'alpha', label: 'A to Z' },
];
const PAGE = 60;
const vol = (s) => (s.volume ?? s.volume_30d_avg) || 0;
const compactVol = (v) => (v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${(v / 1e3).toFixed(0)}K` : formatNumber(v, 0));

/** The PSX board: find a stock, see how it trades today, buy or sell it. */
export default function SharesPage() {
  const t = useFx();
  const isMobile = useMediaQuery('(max-width:900px)');
  const user = useAuthStore((s) => s.user);
  const showSnackbar = useAppStore((s) => s.showSnackbar);
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [view, setView] = useState('all');
  const [sector, setSector] = useState('all');
  const [sort, setSort] = useState('volume');
  const [count, setCount] = useState(PAGE);
  const [trade, setTrade] = useState(null);
  const [reloading, setReloading] = useState(false);

  const { data: board, isLoading, isError, error } = useQuery(psxStocksQuery());
  const { portfolio } = usePsxPortfolio();
  const held = useMemo(() => new Map((portfolio?.allPositions ?? []).filter((p) => p.isOpen).map((p) => [p.symbol, p])), [portfolio]);

  const { data: watch = [] } = useQuery({
    queryKey: ['favorite-stocks', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error: e } = await supabase.from('favorite_stocks').select('symbol').eq('user_id', user.id);
      if (e) throw e;
      return data.map((f) => f.symbol);
    },
  });
  const toggleWatch = useMutation({
    mutationFn: async (sym) => {
      const { error: e } = watch.includes(sym)
        ? await supabase.from('favorite_stocks').delete().eq('user_id', user.id).eq('symbol', sym)
        : await supabase.from('favorite_stocks').insert({ user_id: user.id, symbol: sym });
      if (e) throw e;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['favorite-stocks'] }),
    onError: dbErrorHandler(showSnackbar, 'Could not update the watchlist'),
  });

  const sectors = useMemo(() => getAllSectors(), []);
  const rows = useMemo(() => {
    let list = (board?.data ?? []).filter((s) => s.symbol && s.current);
    if (view === 'gainers') list = list.filter((s) => (s.change_pct ?? 0) > 0);
    if (view === 'losers') list = list.filter((s) => (s.change_pct ?? 0) < 0);
    if (view === 'watch') list = list.filter((s) => watch.includes(String(s.symbol).toUpperCase()));
    if (sector !== 'all') list = list.filter((s) => getStockSector(s.symbol) === sector);
    const q = search.trim().toLowerCase();
    if (q) list = list.filter((s) => `${s.symbol} ${s.name ?? ''} ${getStockName(s.symbol)}`.toLowerCase().includes(q));
    const by = view === 'gainers' ? 'change_desc' : view === 'losers' ? 'change_asc' : view === 'active' ? 'volume' : sort;
    const cmp = {
      volume: (a, b) => vol(b) - vol(a),
      change_desc: (a, b) => (b.change_pct ?? 0) - (a.change_pct ?? 0),
      change_asc: (a, b) => (a.change_pct ?? 0) - (b.change_pct ?? 0),
      price_desc: (a, b) => b.current - a.current,
      price_asc: (a, b) => a.current - b.current,
      alpha: (a, b) => String(a.symbol).localeCompare(String(b.symbol)),
    }[by];
    return [...list].sort(cmp);
  }, [board, view, sector, search, sort, watch]);

  // Any filter change starts the list from the top again.
  const sig = [view, sector, search, sort].join('|');
  const [shownSig, setShownSig] = useState(sig);
  if (shownSig !== sig) { setShownSig(sig); setCount(PAGE); }

  const reload = async () => {
    setReloading(true);
    try {
      invalidateCache();
      await qc.refetchQueries({ queryKey: ['psx'], type: 'active' });
      showSnackbar('Reloaded the latest published prices', 'success');
    } catch {
      showSnackbar('Could not reach the market data service', 'error');
    } finally { setReloading(false); }
  };

  return (
    <FitPage>
      <PageHeader title="Shares" filter={false} sub={`${rows.length} share${rows.length === 1 ? '' : 's'}`}
        actions={(
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <DataFreshness freshness={board?.freshness} />
            <Tooltip title="Reload published prices">
              <IconButton size="small" onClick={reload} disabled={reloading} sx={{ border: `1px solid ${t.border}`, width: 34, height: 34 }}>
                {reloading ? <CircularProgress size={14} /> : <RefreshRounded sx={{ fontSize: 18 }} />}
              </IconButton>
            </Tooltip>
          </Box>
        )} />

      {isError && (
        <Alert severity="warning" sx={{ mb: 1.25, borderRadius: '14px', fontSize: '0.74rem', py: 0, flexShrink: 0 }}>
          {error?.isOffline ? 'Cannot reach the market data service. Prices are not shown rather than shown stale.' : 'Market data is unavailable right now. Try reloading.'}
        </Alert>
      )}

      <Box sx={{ display: 'flex', gap: 0.75, mb: 1.25, flexWrap: 'wrap', alignItems: 'center', flexShrink: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, height: 34, px: 1.25, borderRadius: 999, border: `1px solid ${t.border}`, bgcolor: t.surface, flex: isMobile ? '1 1 100%' : '0 1 260px' }}>
          <SearchRounded sx={{ fontSize: 17, color: t.muted }} />
          <InputBase value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Symbol or company" inputProps={{ 'aria-label': 'Search shares' }} sx={{ fontSize: '0.78rem', flex: 1 }} />
        </Box>
        <Seg size="sm" label="View" value={view} onChange={setView} options={VIEWS} />
        <PillSelect value={sector} onChange={setSector} label="Sector" width={isMobile ? 150 : 190}
          items={[{ value: 'all', label: 'All sectors' }, ...sectors.map((s) => ({ value: s, label: s }))]} />
        {!['gainers', 'losers', 'active'].includes(view) && (
          <PillSelect value={sort} onChange={setSort} label="Sort" width={150} items={SORTS} />
        )}
      </Box>

      <Box sx={{ bgcolor: t.surface, border: `1px solid ${t.border}`, borderRadius: '20px', boxShadow: t.shadow, display: 'flex', flexDirection: 'column', minHeight: 0, flex: isMobile ? 'none' : '1 1 0', height: isMobile ? '68dvh' : 'auto', overflow: 'hidden' }}>
        {!isMobile && (
          <Box sx={{ display: 'grid', gridTemplateColumns: COLS, columnGap: 2, px: 2.25, py: 1.1, borderBottom: `1px solid ${t.hairline}`, flexShrink: 0 }}>
            {['Stock', 'Price', 'Change', 'Volume', 'You hold', ''].map((h, i) => (
              <Typography key={h || i} sx={{ fontSize: '0.68rem', fontWeight: 600, color: t.muted, textAlign: i === 0 ? 'left' : 'right' }}>{h}</Typography>
            ))}
          </Box>
        )}
        <Box onScroll={(e) => { const el = e.currentTarget; if (el.scrollTop + el.clientHeight > el.scrollHeight - 300 && count < rows.length) setCount((c) => c + PAGE); }}
          sx={{ flex: 1, minHeight: 0, overflowY: 'auto', px: { xs: 1, md: 1.25 }, py: 0.5, scrollbarWidth: 'thin', scrollbarColor: `${t.border} transparent` }}>
          {isLoading ? Array.from({ length: 10 }).map((_, i) => <Skeleton key={i} height={52} sx={{ mx: 1 }} />)
            : rows.length === 0 ? (
              <Typography sx={{ textAlign: 'center', color: t.muted, fontSize: '0.82rem', py: 6 }}>
                {view === 'watch' ? 'Star a stock to add it to your watchlist.' : 'No shares match.'}
              </Typography>
            ) : rows.slice(0, count).map((s) => {
              const sym = String(s.symbol).toUpperCase();
              return (
                <StockRow key={sym} s={s} sym={sym} mine={held.get(sym)} mobile={isMobile} watched={watch.includes(sym)}
                  onWatch={() => toggleWatch.mutate(sym)} onOpen={() => setTrade(s)} />
              );
            })}
        </Box>
      </Box>

      {trade && <TradeDialog stock={{ ...trade, symbol: String(trade.symbol).toUpperCase() }} position={held.get(String(trade.symbol).toUpperCase()) ?? null} onClose={() => setTrade(null)} />}
    </FitPage>
  );
}

const COLS = 'minmax(0, 2.4fr) 96px 132px 84px 104px 36px';

function StockRow({ s, sym, mine, mobile, watched, onWatch, onOpen }) {
  const t = useFx();
  const ch = s.change ?? 0;
  const pct = s.change_pct ?? 0;
  const color = signColor(t, pct);
  const star = (
    <IconButton size="small" aria-label={watched ? 'Remove from watchlist' : 'Add to watchlist'}
      onClick={(e) => { e.stopPropagation(); onWatch(); }} sx={{ color: watched ? '#d4a017' : t.muted }}>
      {watched ? <StarRounded sx={{ fontSize: 19 }} /> : <StarOutlineRounded sx={{ fontSize: 19 }} />}
    </IconButton>
  );
  const name = getStockName(sym, s.name);
  if (mobile) {
    return (
      <ButtonBase component="div" onClick={onOpen} sx={{ display: 'flex', width: '100%', alignItems: 'center', gap: 1.25, py: 1, px: 0.75, borderBottom: `1px solid ${t.hairline}`, textAlign: 'left', fontFamily: 'inherit' }}>
        <StockLogo symbol={sym} size="md" />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography noWrap sx={{ fontSize: '0.84rem', fontWeight: 650 }}>{sym}</Typography>
          <Typography noWrap sx={{ fontSize: '0.68rem', color: t.muted }}>{mine ? `You hold ${formatNumber(mine.shares, mine.shares % 1 ? 2 : 0)}` : name}</Typography>
        </Box>
        <Box sx={{ textAlign: 'right' }}>
          <Typography data-numeric sx={{ fontFamily: FONT_NUM, fontSize: '0.86rem', fontWeight: 600, letterSpacing: '-0.02em' }}>{formatNumber(s.current, 2)}</Typography>
          <Typography data-numeric sx={{ fontFamily: FONT_NUM, fontSize: '0.7rem', color }}>{pct >= 0 ? '+' : '−'}{Math.abs(pct).toFixed(2)}%</Typography>
        </Box>
        {star}
      </ButtonBase>
    );
  }
  return (
    <ButtonBase component="div" onClick={onOpen} aria-label={`${sym}: trade`} sx={{
      display: 'grid', gridTemplateColumns: COLS, columnGap: 2, alignItems: 'center', width: '100%', px: 1, py: 0.9,
      borderBottom: `1px solid ${t.hairline}`, borderRadius: '10px', textAlign: 'left', fontFamily: 'inherit',
      '@media (hover: hover)': { '&:hover': { bgcolor: t.surface2 } }, '&:focus-visible': { outline: `2px solid ${t.ink}`, outlineOffset: -2 },
    }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, minWidth: 0 }}>
        <StockLogo symbol={sym} size="md" />
        <Box sx={{ minWidth: 0 }}>
          <Typography noWrap sx={{ fontSize: '0.84rem', fontWeight: 650 }}>{sym}</Typography>
          <Typography noWrap sx={{ fontSize: '0.68rem', color: t.muted }}>{name}</Typography>
        </Box>
      </Box>
      <Typography data-numeric sx={{ fontFamily: FONT_NUM, fontSize: '0.86rem', fontWeight: 600, textAlign: 'right', letterSpacing: '-0.02em' }}>{formatNumber(s.current, 2)}</Typography>
      <Typography data-numeric noWrap sx={{ fontFamily: FONT_NUM, fontSize: '0.78rem', fontWeight: 600, textAlign: 'right', color, letterSpacing: '-0.02em' }}>
        {ch >= 0 ? '+' : '−'}{formatNumber(Math.abs(ch), 2)} <Box component="span" sx={{ opacity: 0.8 }}>({pct >= 0 ? '+' : '−'}{Math.abs(pct).toFixed(2)}%)</Box>
      </Typography>
      <Typography data-numeric sx={{ fontFamily: FONT_NUM, fontSize: '0.78rem', color: t.ink2, textAlign: 'right' }}>{compactVol(vol(s))}</Typography>
      <Typography data-numeric sx={{ fontFamily: FONT_NUM, fontSize: '0.78rem', fontWeight: mine ? 600 : 400, color: mine ? t.ink : t.muted, textAlign: 'right' }}>
        {mine ? formatNumber(mine.shares, mine.shares % 1 ? 2 : 0) : '—'}
      </Typography>
      <Box sx={{ textAlign: 'right' }}>{star}</Box>
    </ButtonBase>
  );
}
