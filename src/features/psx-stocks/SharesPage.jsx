import { useState, useMemo, useCallback, useRef } from 'react';
import {
  Box, Card, CardContent, Typography, TextField, IconButton, Chip, Skeleton,
  Dialog, DialogTitle, DialogContent, DialogActions, Button, InputAdornment,
  ToggleButtonGroup, ToggleButton, useMediaQuery, useTheme, Divider, CircularProgress,
  Menu, MenuItem, ListItemIcon, ListItemText, Tooltip,
} from '@mui/material';
import {
  Search, Refresh, Close, TrendingUp, TrendingDown, LocalFireDepartment,
  StarOutlineRounded, StarRounded, ShowChart, SwapVert,
  SortRounded, ArrowDropUp, ArrowDropDown, BarChartRounded,
  FilterListRounded, CheckRounded,
} from '@mui/icons-material';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { dbErrorHandler } from '../../lib/dbErrors';
import { invalidateCache } from '../../lib/api';
import {
  psxStocksQuery, psxGainersQuery, psxLosersQuery, psxActiveQuery,
} from '../../lib/marketQueries';
import DataFreshness from '../../components/DataFreshness';
import { useAuthStore } from '../../store/authStore';
import { useAppStore } from '../../store/appStore';
import { formatCurrency, formatNumber, formatPercent, getPnLColor, calcBrokerFee } from '../../lib/formatters';
import { getStockSector, getAllSectors } from '../../lib/psxSectors';
import StockLogo from '../../components/StockLogo';
import { getStockName } from '../../lib/stockMeta';

const BUY_COLOR = '#15803d';
const SELL_COLOR = '#b91c1c';

export default function SharesPage() {
  const user = useAuthStore((s) => s.user);
  const showSnackbar = useAppStore((s) => s.showSnackbar);
  const showConfirm = useAppStore((s) => s.showConfirm);
  const queryClient = useQueryClient();
  const isMobile = useMediaQuery('(max-width:768px)');
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [sectorFilter, setSectorFilter] = useState('');
  const [sortBy, setSortBy] = useState('volume');
  const [detailStock, setDetailStock] = useState(null);
  const [scraping, setScraping] = useState(false);

  /* ── Trade modal state ── */
  const [tradeMode, setTradeMode] = useState('buy');
  const [tradePrice, setTradePrice] = useState('');
  const [tradeQty, setTradeQty] = useState('');
  const [tradeInputMode, setTradeInputMode] = useState('shares'); // 'shares' | 'amount'
  const [tradeAmount, setTradeAmount] = useState('');
  const [tradeFee, setTradeFee] = useState('');
  const [feeEdited, setFeeEdited] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [sortAnchor, setSortAnchor] = useState(null);
  const [sectorAnchor, setSectorAnchor] = useState(null);
  const [visibleCount, setVisibleCount] = useState(50);

  /* ── Data queries ── */
  const { data: allStocksData, isLoading, isError: stocksFailed, error: stocksError } =
    useQuery(psxStocksQuery());

  const { data: gainersData } = useQuery({ ...psxGainersQuery(50), enabled: filter === 'gainers' });
  const { data: losersData }  = useQuery({ ...psxLosersQuery(50),  enabled: filter === 'losers' });
  const { data: activeData }  = useQuery({ ...psxActiveQuery(50),  enabled: filter === 'active' });

  const { data: favorites = [] } = useQuery({
    queryKey: ['favorite-stocks', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('favorite_stocks').select('symbol').eq('user_id', user.id);
      if (error) throw error;
      return data.map((f) => f.symbol);
    },
    enabled: !!user,
  });

  const { data: freeCashData } = useQuery({
    queryKey: ['stock-free-cash', user?.id],
    queryFn: async () => {
      const { data: cats } = await supabase.from('categories').select('id').ilike('name', '%Investment - Stocks%');
      const catIds = (cats || []).map((c) => c.id);
      let deposited = 0;
      if (catIds.length > 0) {
        const { data: txns } = await supabase.from('income_expense_transactions')
          .select('amount').eq('user_id', user.id).eq('type', 'debit').in('category_id', catIds);
        deposited = (txns || []).reduce((s, t) => s + Number(t.amount), 0);
      }
      const { data: stTxns } = await supabase.from('stock_transactions')
        .select('price, quantity, type, fee').eq('user_id', user.id);
      let bought = 0, sold = 0, totalFees = 0;
      (stTxns || []).forEach((t) => {
        const amt = Number(t.price) * Number(t.quantity);
        const fee = Number(t.fee) || 0;
        totalFees += fee;
        if (t.type === 'buy') bought += amt;
        else sold += amt;
      });
      // freeCash = deposited - (bought + allFees) + sold
      return { deposited, bought, sold, totalFees, freeCash: deposited - bought - totalFees + sold };
    },
    enabled: !!user,
  });
  const freeCash = freeCashData?.freeCash ?? 0;

  const { data: myTransactions = [] } = useQuery({
    queryKey: ['stock-transactions', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('stock_transactions').select('*').eq('user_id', user.id);
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  /* ── My holdings map ── */
  const holdingsMap = useMemo(() => {
    const map = {};
    myTransactions.forEach((t) => {
      const sym = t.symbol?.toUpperCase();
      if (!map[sym]) map[sym] = { shares: 0, totalCost: 0 };
      const fee = Number(t.fee) || 0;
      if (t.type === 'buy') { map[sym].shares += Number(t.quantity); map[sym].totalCost += Number(t.price) * Number(t.quantity) + fee; }
      else {
        const qty = Number(t.quantity);
        const costBasis = map[sym].shares > 0 ? (map[sym].totalCost / map[sym].shares) * qty : 0;
        map[sym].shares -= qty; map[sym].totalCost -= costBasis;
      }
    });
    return map;
  }, [myTransactions]);

  /* ── Stocks list based on filter ── */
  const displayStocks = useMemo(() => {
    let list = [];
    if (filter === 'gainers') list = gainersData?.data || [];
    else if (filter === 'losers') list = losersData?.data || [];
    else if (filter === 'active') list = activeData?.data || [];
    else if (filter === 'favorites') {
      const all = allStocksData?.data || [];
      list = all.filter((s) => favorites.includes(s.symbol?.toUpperCase()));
    } else list = allStocksData?.data || [];

    if (search) {
      const q = search.toLowerCase();
      list = list.filter((s) => {
        const sym = s.symbol?.toUpperCase() || '';
        return sym.toLowerCase().includes(q) ||
          (s.name || '').toLowerCase().includes(q) ||
          (s.sector || '').toLowerCase().includes(q) ||
          getStockName(sym).toLowerCase().includes(q);
      });
    }

    if (sectorFilter) {
      list = list.filter((s) => getStockSector(s.symbol) === sectorFilter);
    }

    // Sort
    const sorted = [...list];
    switch (sortBy) {
      case 'price_asc': sorted.sort((a, b) => (a.current || 0) - (b.current || 0)); break;
      case 'price_desc': sorted.sort((a, b) => (b.current || 0) - (a.current || 0)); break;
      case 'change_desc': sorted.sort((a, b) => (b.change_pct || b.changePct || 0) - (a.change_pct || a.changePct || 0)); break;
      case 'change_asc': sorted.sort((a, b) => (a.change_pct || a.changePct || 0) - (b.change_pct || b.changePct || 0)); break;
      // Session volume is only published for the ~120 instruments carrying a
      // full quote; 30-day average covers the rest, so the list stays ordered
      // rather than collapsing into six hundred zeroes.
      case 'volume': sorted.sort((a, b) =>
        ((b.volume ?? b.volume_30d_avg) || 0) - ((a.volume ?? a.volume_30d_avg) || 0)); break;
      case 'alpha': sorted.sort((a, b) => (a.symbol || '').localeCompare(b.symbol || '')); break;
      default: break;
    }
    return sorted;
  }, [filter, allStocksData, gainersData, losersData, activeData, favorites, search, sectorFilter, sortBy]);

  /* Reset pagination when filters change */
  const prevFilterKey = useRef('');
  const filterKey = `${filter}-${search}-${sectorFilter}-${sortBy}`;
  if (filterKey !== prevFilterKey.current) {
    prevFilterKey.current = filterKey;
    if (visibleCount !== 50) setVisibleCount(50);
  }

  /* ── Favorite toggle ── */
  const favMutation = useMutation({
    mutationFn: async (symbol) => {
      const sym = symbol.toUpperCase();
      const isFav = favorites.includes(sym);
      // Neither result was checked, so a failed toggle flipped the star, let
      // the refetch quietly put it back, and told the user nothing.
      const { error } = isFav
        ? await supabase.from('favorite_stocks').delete().eq('user_id', user.id).eq('symbol', sym)
        : await supabase.from('favorite_stocks').insert({ user_id: user.id, symbol: sym });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['favorite-stocks'] }),
    onError: dbErrorHandler(showSnackbar, 'Could not update favourites'),
  });

  /* ── Buy / Sell mutation ── */
  const tradeMutation = useMutation({
    mutationFn: async ({ symbol, companyName, type, price, quantity, fee }) => {
      const { error } = await supabase.from('stock_transactions').insert({
        user_id: user.id, symbol: symbol.toUpperCase(), company_name: companyName,
        type, price: parseFloat(price), quantity: parseFloat(quantity),
        fee: parseFloat(fee) || 0,
        date: new Date().toISOString().split('T')[0],
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stock-transactions'] });
      queryClient.invalidateQueries({ queryKey: ['stock-free-cash'] });
      queryClient.invalidateQueries({ queryKey: ['home-st-txns'] });
      setConfirmOpen(false);
      setDetailStock(null);
      showSnackbar(`${tradeMode === 'buy' ? 'Bought' : 'Sold'} successfully`, 'success');
    },
    onError: (e) => showSnackbar(e.message, 'error'),
  });

  /* ── Refresh ──
     The service scrapes PSX on its own schedule — once per working day at
     17:00 PKT, after the close — and publishes the result as static JSON. A
     client cannot make it scrape again, so this re-reads what is published
     rather than pretending to fetch a new session. */
  const handleScrape = async () => {
    setScraping(true);
    try {
      invalidateCache();
      await queryClient.refetchQueries({ queryKey: ['psx'], type: 'active' });
      showSnackbar('Reloaded the latest published prices', 'success');
    } catch {
      showSnackbar('Could not reach the market data service', 'error');
    } finally {
      setScraping(false);
    }
  };

  /* ── Open stock detail ── */
  const openDetail = useCallback((stock) => {
    setDetailStock(stock);
    setTradeMode('buy');
    setTradePrice(String(stock.current || ''));
    setTradeQty('');
    setTradeAmount('');
    setTradeInputMode('shares');
    setTradeFee('');
    setFeeEdited(false);
  }, []);

  /* ── Computed trade values ── */
  const computedShares = tradeInputMode === 'amount' && tradePrice > 0
    ? Math.round((Number(tradeAmount) / Number(tradePrice)) * 100) / 100 : Number(tradeQty) || 0;
  const computedAmount = tradeInputMode === 'shares'
    ? (Number(tradeQty) || 0) * (Number(tradePrice) || 0)
    : Number(tradeAmount) || 0;

  /* Auto-calculate broker fee unless user has manually edited it */
  const autoFee = calcBrokerFee(Number(tradePrice) || 0, computedShares);
  const effectiveFee = feeEdited ? (Number(tradeFee) || 0) : autoFee;
  // Auto-sync display when not manually edited
  if (!feeEdited && tradeFee !== String(autoFee) && computedShares > 0) {
    // We'll set it in the render via useEffect-free pattern — store as derived
  }
  const totalWithFee = tradeMode === 'buy' ? computedAmount + effectiveFee : computedAmount - effectiveFee;

  const myHolding = detailStock ? (holdingsMap[detailStock.symbol?.toUpperCase()] || { shares: 0, totalCost: 0 }) : { shares: 0, totalCost: 0 };

  const canTrade = computedShares > 0 && Number(tradePrice) > 0 &&
    (tradeMode === 'buy' ? totalWithFee <= freeCash : computedShares <= myHolding.shares);

  const handleConfirmTrade = () => {
    if (!detailStock || !canTrade) return;
    tradeMutation.mutate({
      symbol: detailStock.symbol,
      companyName: detailStock.company_name || detailStock.name || detailStock.symbol,
      type: tradeMode,
      price: tradePrice,
      quantity: computedShares,
      fee: effectiveFee,
    });
  };

  const filterChips = [
    { key: 'all', label: 'All', icon: <ShowChart sx={{ fontSize: 14 }} /> },
    { key: 'gainers', label: 'Gainers', icon: <TrendingUp sx={{ fontSize: 14 }} /> },
    { key: 'losers', label: 'Losers', icon: <TrendingDown sx={{ fontSize: 14 }} /> },
    { key: 'active', label: 'Active', icon: <LocalFireDepartment sx={{ fontSize: 14 }} /> },
    { key: 'favorites', label: 'Favorites', icon: <StarRounded sx={{ fontSize: 14 }} /> },
  ];

  const sortOptions = [
    { value: 'volume', label: 'Volume' },
    { value: 'price_desc', label: 'Price ↓' },
    { value: 'price_asc', label: 'Price ↑' },
    { value: 'change_desc', label: 'Change ↓' },
    { value: 'change_asc', label: 'Change ↑' },
    { value: 'alpha', label: 'A–Z' },
  ];

  const allSectors = useMemo(() => getAllSectors(), []);

  return (
    <Box sx={{ pb: isMobile ? 1 : 0 }}>
      {/* ── Header ── */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
        <Typography sx={{ fontSize: isMobile ? '1.2rem' : '1.5rem', fontWeight: 800, letterSpacing: '-0.03em' }}>
          Shares
        </Typography>
        <DataFreshness freshness={allStocksData?.freshness} />
      </Box>

      {/* ── Search bar with integrated refresh ── */}
      <TextField fullWidth size="small" placeholder="Search by symbol or company..."
        value={search} onChange={(e) => setSearch(e.target.value)} sx={{ mb: 1 }}
        InputProps={{
          startAdornment: <InputAdornment position="start"><Search sx={{ fontSize: 18, color: 'text.secondary' }} /></InputAdornment>,
          endAdornment: (
            <InputAdornment position="end">
              <IconButton size="small" onClick={handleScrape} disabled={scraping} sx={{ p: 0.5 }}>
                {scraping ? <CircularProgress size={14} sx={{ color: 'text.secondary' }} /> : <Refresh sx={{ fontSize: 16 }} />}
              </IconButton>
            </InputAdornment>
          ),
        }}
      />

      {/* ── Filter Chips + Sort + Sector (single row, horizontally scrollable) ── */}
      <Box sx={{
        display: 'flex', gap: 0.5, mb: 1, alignItems: 'center',
        overflowX: 'auto', pb: 0.25,
        '&::-webkit-scrollbar': { display: 'none' }, scrollbarWidth: 'none',
      }}>
        {filterChips.map((c) => (
          <Chip key={c.key} label={c.label} icon={c.icon} size="small"
            onClick={() => { setFilter(c.key); setSectorFilter(''); }}
            sx={{
              fontSize: '0.65rem', fontWeight: 600, height: 28, flexShrink: 0,
              bgcolor: filter === c.key ? (isDark ? '#fff' : '#111') : 'transparent',
              color: filter === c.key ? (isDark ? '#000' : '#fff') : 'text.secondary',
              border: `1px solid ${filter === c.key ? 'transparent' : (isDark ? '#333' : '#ddd')}`,
              '& .MuiChip-icon': { color: filter === c.key ? (isDark ? '#000' : '#fff') : 'text.secondary' },
              '&:hover': { bgcolor: filter === c.key ? (isDark ? 'rgba(255,255,255,0.9)' : 'rgba(0,0,0,0.85)') : (isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)') },
            }}
          />
        ))}

        {/* Divider dot */}
        <Box sx={{ width: 3, height: 3, borderRadius: '50%', bgcolor: 'text.disabled', flexShrink: 0, mx: 0.25 }} />

        {/* Sector chip / active sector chip */}
        {sectorFilter ? (
          <Chip label={sectorFilter} size="small"
            onDelete={() => setSectorFilter('')}
            sx={{
              fontSize: '0.65rem', fontWeight: 600, height: 28, flexShrink: 0,
              bgcolor: isDark ? '#fff' : '#111', color: isDark ? '#000' : '#fff',
              '& .MuiChip-deleteIcon': { color: isDark ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.5)', fontSize: 14 },
            }}
          />
        ) : (
          <Chip label="Sector" size="small"
            icon={<FilterListRounded sx={{ fontSize: 13 }} />}
            onClick={(e) => setSectorAnchor(e.currentTarget)}
            sx={{
              fontSize: '0.65rem', fontWeight: 600, height: 28, flexShrink: 0,
              bgcolor: 'transparent', color: 'text.secondary',
              border: `1px solid ${isDark ? '#333' : '#ddd'}`,
              '& .MuiChip-icon': { color: 'text.secondary' },
            }}
          />
        )}

        {/* Sort button */}
        <Tooltip title="Sort">
          <IconButton size="small" onClick={(e) => setSortAnchor(e.currentTarget)}
            sx={{
              flexShrink: 0, ml: 'auto',
              border: `1px solid ${isDark ? '#333' : '#ddd'}`, borderRadius: 2,
              width: 28, height: 28,
            }}>
            <SortRounded sx={{ fontSize: 15, color: 'text.secondary' }} />
          </IconButton>
        </Tooltip>
      </Box>

      {/* Sort popover menu */}
      <Menu anchorEl={sortAnchor} open={Boolean(sortAnchor)} onClose={() => setSortAnchor(null)}
        slotProps={{ paper: { sx: { minWidth: 140, borderRadius: 2.5 } } }}>
        {sortOptions.map((o) => (
          <MenuItem key={o.value} selected={sortBy === o.value}
            onClick={() => { setSortBy(o.value); setSortAnchor(null); }}
            sx={{ fontSize: '0.72rem', py: 0.75, gap: 1 }}>
            {sortBy === o.value && <CheckRounded sx={{ fontSize: 14, color: isDark ? '#fff' : '#111' }} />}
            <ListItemText primaryTypographyProps={{ fontSize: '0.72rem', fontWeight: sortBy === o.value ? 700 : 400 }}>{o.label}</ListItemText>
          </MenuItem>
        ))}
      </Menu>

      {/* Sector popover menu */}
      <Menu anchorEl={sectorAnchor} open={Boolean(sectorAnchor)} onClose={() => setSectorAnchor(null)}
        slotProps={{ paper: { sx: { maxHeight: 320, minWidth: 180, borderRadius: 2.5 } } }}>
        <MenuItem onClick={() => { setSectorFilter(''); setSectorAnchor(null); }}
          sx={{ fontSize: '0.72rem', py: 0.75, fontWeight: !sectorFilter ? 700 : 400 }}>
          All Sectors
        </MenuItem>
        {allSectors.map((s) => (
          <MenuItem key={s} selected={sectorFilter === s}
            onClick={() => { setSectorFilter(s); setSectorAnchor(null); }}
            sx={{ fontSize: '0.72rem', py: 0.75, gap: 1 }}>
            {sectorFilter === s && <CheckRounded sx={{ fontSize: 14, color: isDark ? '#fff' : '#111' }} />}
            <ListItemText primaryTypographyProps={{ fontSize: '0.72rem', fontWeight: sectorFilter === s ? 700 : 400 }}>{s}</ListItemText>
          </MenuItem>
        ))}
      </Menu>

      <Typography sx={{ fontSize: '0.72rem', color: 'text.secondary', mb: 1.25, fontFeatureSettings: '"tnum"' }}>
        {displayStocks.length} share{displayStocks.length !== 1 ? 's' : ''}
        {sectorFilter && <> in <b>{sectorFilter}</b></>}
      </Typography>

      {/* ── Stock List ── */}
      {isLoading ? (
        Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} variant="rounded" height={82} sx={{ mb: 1 }} />)
      ) : displayStocks.length === 0 ? (
        <Card sx={{ p: 4, textAlign: 'center' }}>
          <Typography sx={{ fontSize: '0.85rem', color: 'text.secondary' }}>No shares found</Typography>
        </Card>
      ) : (
        <>
        {displayStocks.slice(0, visibleCount).map((stock, i) => {
          const sym = stock.symbol?.toUpperCase();
          const isFav = favorites.includes(sym);
          const change = stock.change || 0;
          const changePct = stock.change_pct || stock.changePct || 0;
          const color = getPnLColor(change);
          const sector = getStockSector(sym);
          const companyName = getStockName(sym, stock.company || stock.company_name);
          return (
              <Card key={sym || i} sx={{ mb: 0.75, cursor: 'pointer', '&:hover': { bgcolor: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.01)' } }}
                onClick={() => openDetail(stock)}>
                <CardContent sx={{ p: isMobile ? 1.5 : 2, '&:last-child': { pb: isMobile ? 1.5 : 2 } }}>
                  {/* Top row: logo + symbol + price + fav */}
                  <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
                    <StockLogo symbol={sym} size="md" sx={{ mt: 0.25 }} />
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                        <Typography sx={{ fontSize: '0.92rem', fontWeight: 700, lineHeight: 1.2 }}>{sym}</Typography>
                        {sector !== 'Other' && (
                          <Chip label={sector} size="small"
                            sx={{
                              height: 18, fontSize: '0.55rem', fontWeight: 600,
                              bgcolor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
                              color: 'text.secondary',
                              '& .MuiChip-label': { px: 0.75 },
                            }}
                          />
                        )}
                      </Box>
                      {companyName && companyName !== sym && (
                        <Typography sx={{ fontSize: '0.68rem', color: 'text.secondary', lineHeight: 1.3, mt: 0.2 }} noWrap>
                          {companyName}
                        </Typography>
                      )}
                    </Box>
                    <Box sx={{ textAlign: 'right', flexShrink: 0 }}>
                      <Typography sx={{ fontSize: '0.95rem', fontWeight: 700, fontFeatureSettings: '"tnum"' }}>
                        {formatNumber(stock.current, 2)}
                      </Typography>
                      <Typography sx={{ fontSize: '0.7rem', fontWeight: 600, color, fontFeatureSettings: '"tnum"', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 0.15 }}>
                        {change >= 0 ? <ArrowDropUp sx={{ fontSize: 16 }} /> : <ArrowDropDown sx={{ fontSize: 16 }} />}
                        {Math.abs(change).toFixed(2)} ({changePct >= 0 ? '+' : ''}{Number(changePct).toFixed(2)}%)
                      </Typography>
                    </Box>
                    <IconButton size="small" onClick={(e) => { e.stopPropagation(); favMutation.mutate(sym); }}
                      sx={{ color: isFav ? '#eab308' : 'text.secondary', ml: -0.25, mt: -0.25 }}>
                      {isFav ? <StarRounded sx={{ fontSize: 20 }} /> : <StarOutlineRounded sx={{ fontSize: 20 }} />}
                    </IconButton>
                  </Box>

                  {/* Bottom row: OHLC + Volume mini stats */}
                  <Box sx={{
                    display: 'flex', gap: isMobile ? 1.5 : 2, mt: 1,
                    flexWrap: 'wrap',
                  }}>
                    {[
                      { label: 'Open', val: stock.open },
                      { label: 'High', val: stock.high, color: '#22c55e' },
                      { label: 'Low', val: stock.low, color: '#ef4444' },
                      { label: 'LDCP', val: stock.ldcp },
                      { label: 'Vol', val: stock.volume, fmt: 'vol' },
                    ].map((item) => (
                      <Box key={item.label} sx={{ minWidth: 0 }}>
                        <Typography sx={{ fontSize: '0.55rem', color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 500, lineHeight: 1 }}>
                          {item.label}
                        </Typography>
                        <Typography sx={{
                          fontSize: '0.72rem', fontWeight: 600, fontFeatureSettings: '"tnum"', lineHeight: 1.4,
                          color: item.color || 'text.primary',
                        }}>
                          {item.fmt === 'vol'
                            ? (item.val >= 1e6 ? `${(item.val / 1e6).toFixed(1)}M` : item.val >= 1e3 ? `${(item.val / 1e3).toFixed(0)}K` : formatNumber(item.val || 0, 0))
                            : formatNumber(item.val || 0, 2)
                          }
                        </Typography>
                      </Box>
                    ))}
                  </Box>
                </CardContent>
              </Card>
          );
        })}
        {visibleCount < displayStocks.length && (
          <Button fullWidth onClick={() => setVisibleCount((c) => c + 50)}
            sx={{ mt: 1, mb: 1, borderRadius: 2.5, py: 1, fontWeight: 600, fontSize: '0.78rem', textTransform: 'none', color: isDark ? '#fff' : '#111' }}>
            Load more ({displayStocks.length - visibleCount} remaining)
          </Button>
        )}
        </>
      )}

      {/* ─────── Modern Trade Dialog ─────── */}
      <Dialog open={Boolean(detailStock)} onClose={() => setDetailStock(null)} maxWidth="xs" fullWidth
        PaperProps={{ sx: { borderRadius: 4, mx: isMobile ? 1.5 : 'auto', my: isMobile ? 2 : 'auto', maxHeight: isMobile ? 'calc(100dvh - 32px)' : undefined, overflow: 'hidden', '&::-webkit-scrollbar': { display: 'none' }, scrollbarWidth: 'none' } }}>
        {detailStock && (
          <>
            {/* ── Hero Header ── */}
            <Box sx={{
              px: isMobile ? 2 : 3, pt: 2.5, pb: 2, position: 'relative',
              bgcolor: tradeMode === 'buy' ? (isDark ? 'rgba(21,128,61,0.08)' : 'rgba(21,128,61,0.04)') : (isDark ? 'rgba(185,28,28,0.08)' : 'rgba(185,28,28,0.04)'),
              borderBottom: `1px solid ${isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'}`,
              transition: 'background-color 0.3s ease',
            }}>
              <IconButton onClick={() => setDetailStock(null)} size="small"
                sx={{ position: 'absolute', top: 10, right: 10, color: 'text.secondary' }}>
                <Close sx={{ fontSize: 18 }} />
              </IconButton>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.25 }}>
                <StockLogo symbol={detailStock.symbol} size="lg" />
                <Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                    <Typography sx={{ fontSize: '1.1rem', fontWeight: 800, letterSpacing: '-0.02em' }}>{detailStock.symbol}</Typography>
                    {getStockSector(detailStock.symbol) !== 'Other' && (
                      <Chip label={getStockSector(detailStock.symbol)} size="small"
                        sx={{ height: 18, fontSize: '0.5rem', fontWeight: 600, bgcolor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)', color: 'text.secondary', '& .MuiChip-label': { px: 0.75 } }} />
                    )}
                  </Box>
                  <Typography sx={{ fontSize: '0.62rem', color: 'text.secondary' }}>
                    {getStockName(detailStock.symbol, detailStock.company || detailStock.company_name)}
                  </Typography>
                </Box>
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
                <Typography sx={{ fontSize: '1.5rem', fontWeight: 800, fontFeatureSettings: '"tnum"', lineHeight: 1 }}>{formatNumber(detailStock.current, 2)}</Typography>
                <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, color: getPnLColor(detailStock.change || 0), fontFeatureSettings: '"tnum"' }}>
                  {detailStock.change >= 0 ? '+' : ''}{formatNumber(detailStock.change || 0, 2)} ({detailStock.change_pct >= 0 ? '+' : ''}{Number(detailStock.change_pct || 0).toFixed(2)}%)
                </Typography>
              </Box>
              {/* OHLC inline chips */}
              <Box sx={{ display: 'flex', gap: 0.75, mt: 1, flexWrap: 'wrap' }}>
                {[
                  { label: 'O', val: detailStock.open },
                  { label: 'H', val: detailStock.high, color: '#22c55e' },
                  { label: 'L', val: detailStock.low, color: '#ef4444' },
                  { label: 'LDCP', val: detailStock.ldcp },
                  ...(detailStock.volume > 0 ? [{ label: 'Vol', val: detailStock.volume, fmt: 'vol' }] : []),
                ].map((item) => (
                  <Box key={item.label} sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
                    <Typography sx={{ fontSize: '0.5rem', color: 'text.secondary', fontWeight: 500, textTransform: 'uppercase' }}>{item.label}</Typography>
                    <Typography sx={{ fontSize: '0.58rem', fontWeight: 700, fontFeatureSettings: '"tnum"', color: item.color || 'text.primary' }}>
                      {item.fmt === 'vol' ? (item.val >= 1e6 ? `${(item.val / 1e6).toFixed(1)}M` : item.val >= 1e3 ? `${(item.val / 1e3).toFixed(0)}K` : formatNumber(item.val || 0, 0)) : formatNumber(item.val || 0, 2)}
                    </Typography>
                  </Box>
                ))}
              </Box>
            </Box>

            <DialogContent sx={{ px: isMobile ? 2 : 3, pt: 2 }}>
              {/* ── Account info bar ── */}
              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, mb: 2 }}>
                <Box sx={{ p: 1.25, borderRadius: 2, bgcolor: isDark ? 'rgba(34,197,94,0.06)' : 'rgba(34,197,94,0.03)', border: '1px solid', borderColor: isDark ? 'rgba(34,197,94,0.12)' : 'rgba(34,197,94,0.08)' }}>
                  <Typography sx={{ fontSize: '0.48rem', color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 500 }}>Free Cash</Typography>
                  <Typography sx={{ fontSize: '0.82rem', fontWeight: 700, fontFeatureSettings: '"tnum"', color: '#22c55e' }} className="currency">{formatCurrency(freeCash)}</Typography>
                </Box>
                <Box sx={{ p: 1.25, borderRadius: 2, bgcolor: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.015)', border: '1px solid', borderColor: 'divider' }}>
                  <Typography sx={{ fontSize: '0.48rem', color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 500 }}>My Shares</Typography>
                  <Typography sx={{ fontSize: '0.82rem', fontWeight: 700, fontFeatureSettings: '"tnum"' }}>{formatNumber(myHolding.shares, 2)}</Typography>
                </Box>
              </Box>

              {/* ── Buy / Sell toggle ── */}
              <ToggleButtonGroup exclusive fullWidth size="small" value={tradeMode} onChange={(_, v) => { if (v) setTradeMode(v); }}
                sx={{
                  mb: 2, borderRadius: 3, overflow: 'hidden', border: 'none',
                  '& .MuiToggleButton-root': {
                    fontWeight: 700, fontSize: '0.78rem', py: 0.9, textTransform: 'none',
                    border: 'none', borderRadius: '12px !important',
                    '&.Mui-selected': { bgcolor: tradeMode === 'buy' ? BUY_COLOR : SELL_COLOR, color: '#fff', '&:hover': { bgcolor: tradeMode === 'buy' ? '#166534' : '#991b1b' } },
                    '&:not(.Mui-selected)': { bgcolor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)' },
                  },
                }}>
                <ToggleButton value="buy">Buy</ToggleButton>
                <ToggleButton value="sell">Sell</ToggleButton>
              </ToggleButtonGroup>

              {/* ── Price with quick-adjust ── */}
              <TextField fullWidth size="small" label="Price per share" type="number"
                value={tradePrice} onChange={(e) => setTradePrice(e.target.value)}
                error={tradePrice !== '' && Number(tradePrice) <= 0}
                helperText={tradePrice !== '' && Number(tradePrice) <= 0 ? 'Price must be greater than 0' : ''}
                sx={{ mb: 0.75 }}
                InputProps={{ startAdornment: <InputAdornment position="start">Rs</InputAdornment> }} />
              <Box sx={{ display: 'flex', gap: 0.5, mb: 2 }}>
                {[
                  { label: '-1%', fn: () => setTradePrice(String((Number(tradePrice) * 0.99).toFixed(2))) },
                  { label: 'Market', fn: () => setTradePrice(String(detailStock.current || '')) },
                  { label: '+1%', fn: () => setTradePrice(String((Number(tradePrice) * 1.01).toFixed(2))) },
                ].map((btn) => (
                  <Chip key={btn.label} label={btn.label} size="small" onClick={btn.fn}
                    sx={{ fontSize: '0.55rem', fontWeight: 600, height: 22, bgcolor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)', '& .MuiChip-label': { px: 0.75 } }} />
                ))}
              </Box>

              {/* ── Input mode toggle ── */}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 1.25 }}>
                {[{ key: 'shares', label: 'By Shares' }, { key: 'amount', label: 'By Amount' }].map((m) => (
                  <Chip key={m.key} label={m.label} size="small"
                    onClick={() => { setTradeInputMode(m.key); if (m.key === 'shares') setTradeAmount(''); else setTradeQty(''); }}
                    sx={{
                      fontSize: '0.6rem', fontWeight: 600, height: 24,
                      bgcolor: tradeInputMode === m.key ? (isDark ? '#fff' : '#111') : 'transparent',
                      color: tradeInputMode === m.key ? (isDark ? '#000' : '#fff') : 'text.secondary',
                      border: `1px solid ${tradeInputMode === m.key ? 'transparent' : (isDark ? '#333' : '#ddd')}`,
                    }} />
                ))}
              </Box>

              {tradeInputMode === 'shares' ? (
                <Box sx={{ display: 'flex', gap: 0.75, mb: 1.5, alignItems: 'flex-end' }}>
                  <TextField fullWidth size="small" label="Number of shares" type="number"
                    value={tradeQty} onChange={(e) => setTradeQty(e.target.value)}
                    inputProps={{ step: '0.01' }}
                    InputProps={{ endAdornment: <InputAdornment position="end">shares</InputAdornment> }} />
                  <Tooltip title={tradeMode === 'sell' ? `${formatNumber(myHolding.shares, 2)} shares` : Number(tradePrice) > 0 ? `${Math.floor(freeCash / Number(tradePrice))} shares` : 'Enter price first'} arrow>
                    <Chip label="Max" size="small" onClick={() => {
                      if (tradeMode === 'sell') setTradeQty(String(myHolding.shares));
                      else if (Number(tradePrice) > 0) setTradeQty(String(Math.floor(freeCash / Number(tradePrice))));
                    }}
                      sx={{ fontSize: '0.55rem', fontWeight: 700, height: 32, bgcolor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)', flexShrink: 0 }} />
                  </Tooltip>
                </Box>
              ) : (
                <Box sx={{ display: 'flex', gap: 0.75, mb: 1.5, alignItems: 'flex-end' }}>
                  <TextField fullWidth size="small" label="Total amount" type="number"
                    value={tradeAmount} onChange={(e) => setTradeAmount(e.target.value)}
                    InputProps={{ startAdornment: <InputAdornment position="start">Rs</InputAdornment> }} />
                  <Tooltip title={tradeMode === 'sell' ? `Rs ${formatNumber(Math.round(myHolding.shares * (Number(tradePrice) || 0)), 0)}` : `Rs ${formatNumber(Math.floor(freeCash), 0)}`} arrow>
                    <Chip label="Max" size="small" onClick={() => {
                      if (tradeMode === 'sell') setTradeAmount(String(Math.round(myHolding.shares * (Number(tradePrice) || 0))));
                      else setTradeAmount(String(Math.floor(freeCash)));
                    }}
                      sx={{ fontSize: '0.55rem', fontWeight: 700, height: 32, bgcolor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)', flexShrink: 0 }} />
                  </Tooltip>
                </Box>
              )}

              {/* ── Cost breakdown ── */}
              <Box sx={{
                p: 1.5, borderRadius: 2.5, mb: 1,
                bgcolor: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.015)',
                border: '1.5px solid', borderColor: tradeMode === 'buy' ? `${BUY_COLOR}25` : `${SELL_COLOR}25`,
              }}>
                {[
                  { label: 'Shares', value: formatNumber(computedShares, 2) },
                  { label: 'Price', value: `Rs ${formatNumber(Number(tradePrice) || 0, 2)}` },
                  { label: 'Subtotal', value: `Rs ${formatNumber(computedAmount, 2)}` },
                ].map((row) => (
                  <Box key={row.label} sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.4 }}>
                    <Typography sx={{ fontSize: '0.65rem', color: 'text.secondary' }}>{row.label}</Typography>
                    <Typography sx={{ fontSize: '0.68rem', fontWeight: 700, fontFeatureSettings: '"tnum"' }}>{row.value}</Typography>
                  </Box>
                ))}
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.4 }}>
                  <Typography sx={{ fontSize: '0.65rem', color: 'text.secondary' }}>Broker Fee{computedAmount > 0 && ` (${(effectiveFee / computedAmount * 100).toFixed(2)}%)`}</Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <TextField size="small" type="number"
                      value={feeEdited ? tradeFee : String(autoFee)}
                      onChange={(e) => { setTradeFee(e.target.value); setFeeEdited(true); }}
                      sx={{ width: 85, '& .MuiOutlinedInput-root': { height: 22, fontSize: '0.65rem', fontWeight: 700, fontFeatureSettings: '"tnum"' }, '& .MuiOutlinedInput-input': { px: 0.5, py: 0, textAlign: 'right' } }}
                      InputProps={{ startAdornment: <InputAdornment position="start" sx={{ '& .MuiTypography-root': { fontSize: '0.6rem' } }}>Rs</InputAdornment> }} />
                    {feeEdited && (
                      <Typography onClick={() => { setFeeEdited(false); setTradeFee(''); }}
                        sx={{ fontSize: '0.5rem', color: isDark ? '#fff' : '#111', cursor: 'pointer', textDecoration: 'underline', flexShrink: 0 }}>reset</Typography>
                    )}
                  </Box>
                </Box>
                <Divider sx={{ my: 0.75 }} />
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography sx={{ fontSize: '0.7rem', fontWeight: 700 }}>{tradeMode === 'buy' ? 'Total Cost' : 'Net Received'}</Typography>
                  <Typography sx={{ fontSize: '0.82rem', fontWeight: 800, color: tradeMode === 'buy' ? BUY_COLOR : SELL_COLOR, fontFeatureSettings: '"tnum"' }}>Rs {formatNumber(totalWithFee, 2)}</Typography>
                </Box>
              </Box>

              {tradeMode === 'buy' && totalWithFee > freeCash && totalWithFee > 0 && (
                <Typography sx={{ fontSize: '0.6rem', color: '#b91c1c', mb: 0.5 }}>Insufficient free cash (available: {formatCurrency(freeCash)})</Typography>
              )}
              {tradeMode === 'sell' && computedShares > myHolding.shares && computedShares > 0 && (
                <Typography sx={{ fontSize: '0.6rem', color: '#b91c1c', mb: 0.5 }}>Insufficient shares (you hold: {formatNumber(myHolding.shares, 2)})</Typography>
              )}
            </DialogContent>

            <DialogActions sx={{ px: isMobile ? 2 : 3, pb: 2.5, pt: 1 }}>
              <Button disabled={!canTrade || tradeMutation.isPending}
                fullWidth onClick={() => setConfirmOpen(true)}
                variant="contained"
                sx={{
                  fontSize: '0.82rem', borderRadius: 3, py: 1.2, fontWeight: 700,
                  bgcolor: tradeMode === 'buy' ? BUY_COLOR : SELL_COLOR, color: '#fff',
                  '&:hover': { bgcolor: tradeMode === 'buy' ? '#166534' : '#991b1b' },
                  '&.Mui-disabled': { bgcolor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)' },
                }}>
                {canTrade ? `${tradeMode === 'buy' ? 'Buy' : 'Sell'} · Rs ${formatNumber(totalWithFee, 0)}` : (tradeMode === 'buy' ? 'Buy' : 'Sell')}
              </Button>
            </DialogActions>
          </>
        )}
      </Dialog>

      {/* ─────── Confirmation Dialog (bottom-sheet style on mobile) ─────── */}
      <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)} maxWidth="xs" fullWidth
        PaperProps={{ sx: {
          borderRadius: isMobile ? '20px 20px 0 0' : 4,
          ...(isMobile && { position: 'fixed', bottom: 0, m: 0, maxHeight: '70dvh', overflow: 'auto', '&::-webkit-scrollbar': { display: 'none' }, scrollbarWidth: 'none' }),
        } }}>
        {detailStock && (
          <>
            <Box sx={{ textAlign: 'center', pt: 3, pb: 1, px: 3 }}>
              {/* Visual icon */}
              <Box sx={{
                width: 48, height: 48, borderRadius: '50%', mx: 'auto', mb: 1.5,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                bgcolor: tradeMode === 'buy' ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
              }}>
                {tradeMode === 'buy'
                  ? <TrendingUp sx={{ fontSize: 24, color: BUY_COLOR }} />
                  : <TrendingDown sx={{ fontSize: 24, color: SELL_COLOR }} />}
              </Box>
              <Typography sx={{ fontSize: '0.65rem', color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 500, mb: 0.5 }}>
                {tradeMode === 'buy' ? 'Buying' : 'Selling'}
              </Typography>
              <Typography sx={{ fontSize: '1.3rem', fontWeight: 800, color: tradeMode === 'buy' ? BUY_COLOR : SELL_COLOR }}>
                {formatNumber(computedShares, 2)} shares
              </Typography>
              <Typography sx={{ fontSize: '0.78rem', fontWeight: 600, color: 'text.secondary', mt: 0.25 }}>
                of {detailStock.symbol} @ Rs {formatNumber(Number(tradePrice) || 0, 2)}
              </Typography>
            </Box>

            <DialogContent sx={{ px: 3, pt: 1.5, pb: 0 }}>
              <Box sx={{ p: 1.5, borderRadius: 2.5, bgcolor: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.015)' }}>
                {[
                  { label: 'Subtotal', value: `Rs ${formatNumber(computedAmount, 2)}` },
                  { label: `Broker Fee${computedAmount > 0 ? ` (${(effectiveFee / computedAmount * 100).toFixed(2)}%)` : ''}`, value: `${tradeMode === 'sell' ? '−' : '+'}Rs ${formatNumber(effectiveFee, 2)}` },
                  { label: tradeMode === 'buy' ? 'Total Cost' : 'Net Received', value: `Rs ${formatNumber(totalWithFee, 2)}`, bold: true },
                ].map((row, i) => (
                  <Box key={row.label}>
                    {i === 2 && <Divider sx={{ my: 0.75 }} />}
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', py: 0.35 }}>
                      <Typography sx={{ fontSize: '0.68rem', color: row.bold ? 'text.primary' : 'text.secondary', fontWeight: row.bold ? 700 : 400 }}>{row.label}</Typography>
                      <Typography sx={{ fontSize: row.bold ? '0.92rem' : '0.68rem', fontWeight: row.bold ? 800 : 600, fontFeatureSettings: '"tnum"', color: row.bold ? (tradeMode === 'buy' ? BUY_COLOR : SELL_COLOR) : 'text.primary' }}>{row.value}</Typography>
                    </Box>
                  </Box>
                ))}
              </Box>
            </DialogContent>

            <DialogActions sx={{ px: 3, pb: 2.5, pt: 2, gap: 1 }}>
              <Button onClick={() => setConfirmOpen(false)} variant="text" color="inherit"
                sx={{ flex: 0.8, fontSize: '0.78rem', borderRadius: 3, py: 1.1, fontWeight: 600 }}>
                Cancel
              </Button>
              <Button onClick={handleConfirmTrade} disabled={tradeMutation.isPending}
                variant="contained"
                sx={{
                  flex: 1.2, fontSize: '0.82rem', borderRadius: 3, py: 1.2, fontWeight: 700,
                  bgcolor: tradeMode === 'buy' ? BUY_COLOR : SELL_COLOR, color: '#fff',
                  '&:hover': { bgcolor: tradeMode === 'buy' ? '#166534' : '#991b1b' },
                }}>
                {tradeMutation.isPending ? <CircularProgress size={18} sx={{ color: '#fff' }} /> : `Confirm ${tradeMode === 'buy' ? 'Buy' : 'Sell'}`}
              </Button>
            </DialogActions>
          </>
        )}
      </Dialog>
    </Box>
  );
}
