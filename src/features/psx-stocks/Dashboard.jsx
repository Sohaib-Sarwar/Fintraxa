import { useMemo, useState } from 'react';
import { Box, Card, CardContent, Typography, Grid, Skeleton, Chip, useMediaQuery, useTheme, IconButton, Menu, MenuItem, ListItemText, alpha } from '@mui/material';
import {
  ShowChartRounded, TrendingUpRounded, TrendingDownRounded,
  SavingsRounded, PieChartRounded, CategoryRounded,
  SortRounded, CheckRounded,
} from '@mui/icons-material';
import {
  PieChart, Pie, Cell, Sector, ResponsiveContainer,
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip,
} from 'recharts';
import { getStockSector, getSectorColor } from '../../lib/psxSectors';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { supabase } from '../../lib/supabase';
import { psxStocksQuery, stockPriceMap } from '../../lib/marketQueries';
import { useAuthStore } from '../../store/authStore';
import { formatCurrency, formatPercent, formatNumber, getPnLColor } from '../../lib/formatters';
import { subMonths, format } from 'date-fns';
import StockLogo from '../../components/StockLogo';
import { getStockName } from '../../lib/stockMeta';

/* ─── Profit / Loss color palettes ─── */
const profitColors = ['#22c55e', '#4ade80', '#86efac', '#bbf7d0'];
const lossColors = ['#ef4444', '#f87171', '#fca5a5', '#fecaca'];

/* Active shape — shows symbol, value, percentage */
const renderActive = (props) => {
  const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill, payload, percent, value } = props;
  return (
    <g>
      <text x={cx} y={cy - 14} textAnchor="middle" fontSize={11} fontWeight={600} fill={fill}>
        {payload.name}
      </text>
      <text x={cx} y={cy + 3} textAnchor="middle" fontSize={13} fontWeight={800} fill={fill}>
        {formatCurrency(value)}
      </text>
      <text x={cx} y={cy + 18} textAnchor="middle" fontSize={10} fill="#888">
        {`${(percent * 100).toFixed(1)}%`}
      </text>
      <Sector cx={cx} cy={cy} innerRadius={innerRadius - 3} outerRadius={outerRadius + 6}
        startAngle={startAngle} endAngle={endAngle} fill={fill} />
    </g>
  );
};

/* Outer labels — clean text style (matches MF) */
const RADIAN = Math.PI / 180;
const renderOuterLabel = ({ cx, cy, midAngle, outerRadius, percent, payload, fill, viewBox }) => {
  if (percent < 0.03) return null;
  const isSm = (viewBox?.width || 400) < 380;
  const radius = outerRadius + (isSm ? 18 : 24);
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);
  const anchor = x > cx ? 'start' : 'end';
  return (
    <g>
      <text x={x} y={y - 6} textAnchor={anchor} fontSize={isSm ? 12 : 13} fontWeight={800} fill={fill}>
        {`${(percent * 100).toFixed(0)}%`}
      </text>
      <text x={x} y={y + (isSm ? 7 : 9)} textAnchor={anchor} fontSize={isSm ? 9 : 10} fontWeight={500} fill="#888">
        {payload.name}
      </text>
    </g>
  );
};

/* Growth chart tooltip */
function GrowthTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <Box sx={{
      bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider',
      borderRadius: 2, px: 1.5, py: 1, boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
    }}>
      <Typography sx={{ fontSize: '0.65rem', color: 'text.secondary', mb: 0.25 }}>{label}</Typography>
      {payload.map((p, i) => (
        <Typography key={i} sx={{ fontSize: '0.72rem', fontWeight: 600, color: p.color }}>
          {p.name}: {formatCurrency(p.value)}
        </Typography>
      ))}
    </Box>
  );
}

export default function PSXDashboard() {
  const user = useAuthStore((s) => s.user);
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const [activeIdx, setActiveIdx] = useState(-1);
  const isMobile = useMediaQuery('(max-width:768px)');
  const [holdingsSort, setHoldingsSort] = useState('alpha');
  const [sortAnchor, setSortAnchor] = useState(null);

  const { data: transactions = [], isLoading } = useQuery({
    queryKey: ['stock-transactions', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('stock_transactions').select('*')
        .eq('user_id', user.id).order('date', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const { data: liveStocks } = useQuery(psxStocksQuery());

  const { holdings, totals, pieData, priceMap, sectorData } = useMemo(() => {
    const live = stockPriceMap(liveStocks);
    const priceMap = {};
    for (const [sym, s] of Object.entries(live)) {
      priceMap[sym] = { price: s.current, change: s.change, changePct: s.change_pct };
    }

    const holdingMap = {};
    transactions.forEach((t) => {
      const sym = t.symbol?.toUpperCase();
      if (!holdingMap[sym]) holdingMap[sym] = { symbol: sym, companyName: t.company_name, totalShares: 0, totalCost: 0, totalFees: 0 };
      const h = holdingMap[sym];
      const fee = Number(t.fee) || 0;
      if (t.type === 'buy') { h.totalShares += Number(t.quantity); h.totalCost += Number(t.price) * Number(t.quantity) + fee; h.totalFees += fee; }
      else {
        const qty = Number(t.quantity);
        const costBasis = h.totalShares > 0 ? (h.totalCost / h.totalShares) * qty : 0;
        h.totalShares -= qty; h.totalCost -= costBasis; h.totalFees += fee;
      }
    });

    const holdings = Object.values(holdingMap).filter((h) => h.totalShares > 0)
      .map((h) => ({ ...h, avgPrice: h.totalCost / h.totalShares }));

    let totalInvested = 0, totalCurrentValue = 0;
    holdings.forEach((h) => {
      const livePrice = priceMap[h.symbol]?.price || h.avgPrice;
      totalInvested += h.totalCost;
      totalCurrentValue += h.totalShares * livePrice;
    });

    let profitIdx = 0, lossIdx = 0;
    const pieData = holdings.map((h) => {
      const livePrice = priceMap[h.symbol]?.price || h.avgPrice;
      const currentValue = Math.round(h.totalShares * livePrice);
      const gl = currentValue - h.totalCost;
      const isProfit = gl >= 0;
      const color = isProfit
        ? profitColors[profitIdx++ % profitColors.length]
        : lossColors[lossIdx++ % lossColors.length];
      return { name: h.symbol, value: currentValue, gainLoss: Math.round(gl), color };
    }).sort((a, b) => b.value - a.value);

    /* Sector distribution */
    const sectorMap = {};
    holdings.forEach((h) => {
      const sector = getStockSector(h.symbol);
      const livePrice = priceMap[h.symbol]?.price || h.avgPrice;
      const currentValue = h.totalShares * livePrice;
      if (!sectorMap[sector]) sectorMap[sector] = { sector, invested: 0, currentValue: 0, stocks: 0 };
      sectorMap[sector].invested += h.totalCost;
      sectorMap[sector].currentValue += currentValue;
      sectorMap[sector].stocks += 1;
    });
    const sectorData = Object.values(sectorMap)
      .map((s) => ({ ...s, pnl: s.currentValue - s.invested, pct: totalCurrentValue > 0 ? (s.currentValue / totalCurrentValue) * 100 : 0 }))
      .sort((a, b) => b.currentValue - a.currentValue);

    return {
      holdings, priceMap, pieData, sectorData,
      totals: {
        invested: totalInvested, currentValue: totalCurrentValue,
        gainLoss: totalCurrentValue - totalInvested,
        gainPct: totalInvested > 0 ? ((totalCurrentValue - totalInvested) / totalInvested) * 100 : 0,
      },
    };
  }, [transactions, liveStocks]);

  /* ── Monthly growth data (last 6 months) ── */
  const growthData = useMemo(() => {
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const d = subMonths(new Date(), i);
      months.push({ key: format(d, 'yyyy-MM'), label: format(d, 'MMM'), invested: 0, value: 0 });
    }
    let cumInvested = 0;
    const investedByMonth = {};
    const sorted = [...transactions].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    sorted.forEach((t) => {
      const amt = Number(t.price) * Number(t.quantity);
      cumInvested += t.type === 'buy' ? amt : -amt;
      investedByMonth[t.date?.slice(0, 7)] = cumInvested;
    });
    const fc = {};
    const snapshots = {};
    const allMonths = [...new Set(sorted.map((t) => t.date?.slice(0, 7)))].sort();
    allMonths.forEach((m) => {
      sorted.filter((t) => t.date?.slice(0, 7) === m).forEach((t) => {
        const sym = t.symbol?.toUpperCase();
        if (!fc[sym]) fc[sym] = { shares: 0, price: Number(t.price) };
        fc[sym].price = Number(t.price);
        fc[sym].shares += t.type === 'buy' ? Number(t.quantity) : -Number(t.quantity);
      });
      snapshots[m] = Object.values(fc).reduce((sum, s) => sum + (s.shares > 0 ? s.shares * s.price : 0), 0);
    });
    let lastInv = 0, lastVal = 0;
    const allKnown = [...new Set([...Object.keys(investedByMonth), ...Object.keys(snapshots)])].sort();
    months.forEach((mo) => {
      allKnown.filter((k) => k <= mo.key).forEach((k) => {
        if (investedByMonth[k] !== undefined) lastInv = investedByMonth[k];
        if (snapshots[k] !== undefined) lastVal = snapshots[k];
      });
      mo.invested = Math.round(lastInv);
      mo.value = Math.round(lastVal);
    });
    return months;
  }, [transactions]);

  const lineColorInvested = isDark ? '#a3a3a3' : '#555';
  const gridColor = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
  const axisColor = isDark ? '#555' : '#aaa';

  const pnlColor = totals.gainLoss >= 0 ? '#15803d' : '#b91c1c';
  const statCards = [
    { label: 'Invested', value: formatCurrency(totals.invested), icon: SavingsRounded, highlight: true },
    { label: 'Current Value', value: formatCurrency(totals.currentValue), icon: PieChartRounded },
    { label: 'P&L', value: formatCurrency(totals.gainLoss), icon: totals.gainLoss >= 0 ? TrendingUpRounded : TrendingDownRounded, color: pnlColor },
    { label: 'Return', value: formatPercent(totals.gainPct), icon: ShowChartRounded, color: pnlColor },
  ];

  if (isLoading) {
    return (
      <Box>
        <Skeleton variant="rounded" height={32} width={200} sx={{ mb: 3 }} />
        <Grid container spacing={1.5} sx={{ mb: 3 }}>
          {[1,2,3,4].map((i) => <Grid size={{ xs: 6, md: 3 }} key={i}><Skeleton variant="rounded" height={100} /></Grid>)}
        </Grid>
        <Skeleton variant="rounded" height={260} />
      </Box>
    );
  }

  return (
    <Box sx={{ pb: isMobile ? 1 : 0 }}>
      {/* ── PSX Logo + Title ── */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: isMobile ? 2 : 3 }}>
        <Box component="img" src="/psx.png" alt="PSX" sx={{ width: isMobile ? 30 : 36, height: isMobile ? 30 : 36, borderRadius: 2, objectFit: 'contain' }} />
        <Typography sx={{ fontSize: isMobile ? '1.2rem' : '1.5rem', fontWeight: 800, letterSpacing: '-0.03em' }}>PSX</Typography>
      </Box>

      {/* ── Stat Cards ── */}
      {isMobile ? (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <Card sx={{ mb: 1.5, overflow: 'hidden' }}>
            <CardContent sx={{ p: 0, '&:last-child': { pb: 0 } }}>
              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
                {statCards.map((s, i) => {
                  const Icon = s.icon;
                  return (
                    <Box key={i} sx={{
                      px: 1.75, py: 1.5,
                      borderRight: i % 2 === 0 ? `1px solid ${isDark ? 'rgba(255,255,255,0.06)' : '#f0f0f0'}` : 'none',
                      borderBottom: i < 2 ? `1px solid ${isDark ? 'rgba(255,255,255,0.06)' : '#f0f0f0'}` : 'none',
                      ...(s.highlight && { bgcolor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)' }),
                    }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.5 }}>
                        <Icon sx={{ fontSize: 14, color: 'text.secondary', opacity: 0.7 }} />
                        <Typography sx={{ fontSize: '0.62rem', color: 'text.secondary', fontWeight: 500, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                          {s.label}
                        </Typography>
                      </Box>
                      <Typography sx={{ fontSize: s.highlight ? '1.1rem' : '0.95rem', fontWeight: 700, color: s.color || 'text.primary', fontFeatureSettings: '"tnum"' }} className="currency">
                        {s.value}
                      </Typography>
                    </Box>
                  );
                })}
              </Box>
            </CardContent>
          </Card>
        </motion.div>
      ) : (
        <Grid container spacing={1.5} sx={{ mb: 3 }}>
          {statCards.map((s, i) => {
            const Icon = s.icon;
            return (
              <Grid size={{ xs: 6, md: 3 }} key={i}>
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
                  <Card sx={{
                    position: 'relative', overflow: 'hidden',
                    transition: 'transform 0.2s ease, box-shadow 0.2s ease',
                    '&:hover': { transform: 'translateY(-2px)', boxShadow: isDark ? '0 8px 24px rgba(255,255,255,0.04)' : '0 8px 24px rgba(0,0,0,0.08)' },
                    ...(s.highlight && { bgcolor: isDark ? '#111' : '#fafafa', border: `1.5px solid ${isDark ? '#333' : '#d4d4d4'}` }),
                  }}>
                    <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                        <Typography sx={{ fontSize: '0.68rem', color: 'text.secondary', fontWeight: 500, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                          {s.label}
                        </Typography>
                        <Box sx={{ width: 32, height: 32, borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)' }}>
                          <Icon sx={{ fontSize: 16, color: 'text.secondary' }} />
                        </Box>
                      </Box>
                      <Typography sx={{ fontSize: s.highlight ? '1.4rem' : '1.2rem', fontWeight: 700, color: s.color || 'text.primary', lineHeight: 1.1, fontFeatureSettings: '"tnum"' }} className="currency">
                        {s.value}
                      </Typography>
                    </CardContent>
                  </Card>
                </motion.div>
              </Grid>
            );
          })}
        </Grid>
      )}

      {/* ── Allocation Pie + Growth Chart ── */}
      {pieData.length > 0 && (
        <Grid container spacing={isMobile ? 1.5 : 2} sx={{ mb: isMobile ? 2 : 3 }}>
          <Grid size={{ xs: 12, md: 6 }}>
            <Card sx={{ overflow: 'visible', height: '100%' }}>
              <CardContent sx={{ p: isMobile ? 1.5 : 2.5 }}>
                <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, letterSpacing: '0.02em', mb: 1 }}>
                  Allocation
                </Typography>
                <Box sx={{ position: 'relative' }}>
                  <ResponsiveContainer width="100%" height={isMobile ? 280 : 300}>
                    <PieChart>
                      <Pie data={pieData} dataKey="value" cx="50%" cy="50%"
                        innerRadius={isMobile ? 55 : 68} outerRadius={isMobile ? 78 : 96}
                        paddingAngle={4} strokeWidth={0}
                        activeIndex={activeIdx} activeShape={renderActive}
                        label={activeIdx < 0 ? renderOuterLabel : false}
                        labelLine={false}
                        onMouseEnter={(_, i) => setActiveIdx(i)}
                        onMouseLeave={() => setActiveIdx(-1)}>
                        {pieData.map((d, i) => <Cell key={i} fill={d.color} />)}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                  {activeIdx < 0 && (
                    <Box sx={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center', pointerEvents: 'none', width: isMobile ? 90 : 115 }}>
                      <Typography sx={{ fontSize: isMobile ? '0.85rem' : '1.1rem', fontWeight: 700, color: 'text.primary', lineHeight: 1.2 }}>{formatCurrency(totals.currentValue)}</Typography>
                      <Typography sx={{ fontSize: '0.55rem', color: 'text.secondary', mt: 0.25 }}>portfolio value</Typography>
                    </Box>
                  )}
                </Box>
              </CardContent>
            </Card>
          </Grid>

          {/* Growth Chart — desktop only */}
          {!isMobile && (
            <Grid size={{ xs: 12, md: 6 }}>
              <Card sx={{ height: '100%' }}>
                <CardContent sx={{ p: 2.5 }}>
                  <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, letterSpacing: '0.02em', mb: 1 }}>
                    Growth Over Time
                  </Typography>
                  {growthData.some((d) => d.value > 0 || d.invested > 0) ? (
                    <>
                      <ResponsiveContainer width="100%" height={275}>
                        <LineChart data={growthData} margin={{ top: 5, right: 10, left: -15, bottom: 0 }}>
                          <CartesianGrid stroke={gridColor} strokeDasharray="3 3" vertical={false} />
                          <XAxis dataKey="label" tick={{ fontSize: 10, fill: axisColor }} axisLine={false} tickLine={false} />
                          <YAxis tick={{ fontSize: 10, fill: axisColor }} axisLine={false} tickLine={false}
                            tickFormatter={(v) => v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${(v / 1e3).toFixed(0)}K` : v} />
                          <RTooltip content={<GrowthTooltip />} />
                          <Line type="monotone" dataKey="value" name="Current Value"
                            stroke={totals.gainLoss >= 0 ? '#15803d' : '#b91c1c'} strokeWidth={2.5}
                            dot={{ r: 3, fill: totals.gainLoss >= 0 ? '#15803d' : '#b91c1c' }}
                            activeDot={{ r: 5, fill: totals.gainLoss >= 0 ? '#15803d' : '#b91c1c' }} />
                          <Line type="monotone" dataKey="invested" name="Invested"
                            stroke={lineColorInvested} strokeWidth={1.5}
                            strokeDasharray="4 4" dot={false} />
                        </LineChart>
                      </ResponsiveContainer>
                      <Box sx={{ display: 'flex', justifyContent: 'center', gap: 2, mt: 1 }}>
                        {[
                          { label: 'Current Value', style: { borderBottom: `2.5px solid ${totals.gainLoss >= 0 ? '#15803d' : '#b91c1c'}` } },
                          { label: 'Invested', style: { borderBottom: `1.5px dashed ${lineColorInvested}` } },
                        ].map((l) => (
                          <Box key={l.label} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            <Box sx={{ width: 16, height: 0, ...l.style }} />
                            <Typography sx={{ fontSize: '0.6rem', color: 'text.secondary' }}>{l.label}</Typography>
                          </Box>
                        ))}
                      </Box>
                    </>
                  ) : (
                    <Box sx={{ height: 275, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Typography sx={{ fontSize: '0.78rem', color: 'text.secondary' }}>Add trades to see growth</Typography>
                    </Box>
                  )}
                </CardContent>
              </Card>
            </Grid>
          )}
        </Grid>
      )}

      {/* ── Holdings ── */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
        <Typography sx={{ fontSize: isMobile ? '0.7rem' : '0.75rem', fontWeight: 600, letterSpacing: '0.02em' }}>
          Holdings ({holdings.length})
        </Typography>
        <IconButton size="small" onClick={(e) => setSortAnchor(e.currentTarget)}
          sx={{ border: `1px solid ${isDark ? '#333' : '#ddd'}`, borderRadius: 2, width: 28, height: 28 }}>
          <SortRounded sx={{ fontSize: 15, color: 'text.secondary' }} />
        </IconButton>
      </Box>
      <Menu anchorEl={sortAnchor} open={Boolean(sortAnchor)} onClose={() => setSortAnchor(null)}
        slotProps={{ paper: { sx: { minWidth: 160, borderRadius: 2.5 } } }}>
        {[
          { value: 'alpha', label: 'A-Z' },
          { value: 'alpha_desc', label: 'Z-A' },
          { value: 'value_desc', label: 'Highest Value' },
          { value: 'value_asc', label: 'Lowest Value' },
          { value: 'pnl_desc', label: 'Best P&L' },
          { value: 'pnl_asc', label: 'Worst P&L' },
          { value: 'weight_desc', label: 'Largest Weight' },
        ].map((o) => (
          <MenuItem key={o.value} selected={holdingsSort === o.value}
            onClick={() => { setHoldingsSort(o.value); setSortAnchor(null); }}
            sx={{ fontSize: '0.72rem', py: 0.75, gap: 1 }}>
            {holdingsSort === o.value && <CheckRounded sx={{ fontSize: 14, color: isDark ? '#fff' : '#111' }} />}
            <ListItemText primaryTypographyProps={{ fontSize: '0.72rem', fontWeight: holdingsSort === o.value ? 700 : 400 }}>{o.label}</ListItemText>
          </MenuItem>
        ))}
      </Menu>
      {holdings.length === 0 ? (
        <Card sx={{ p: 4, textAlign: 'center' }}>
          <Typography color="text.secondary" variant="body2">No stock holdings yet</Typography>
        </Card>
      ) : (
        [...holdings].sort((a, b) => {
          const aLive = priceMap[a.symbol]?.price || a.avgPrice;
          const bLive = priceMap[b.symbol]?.price || b.avgPrice;
          const aVal = a.totalShares * aLive;
          const bVal = b.totalShares * bLive;
          const aPnl = aVal - a.totalCost;
          const bPnl = bVal - b.totalCost;
          switch (holdingsSort) {
            case 'alpha': return a.symbol.localeCompare(b.symbol);
            case 'alpha_desc': return b.symbol.localeCompare(a.symbol);
            case 'value_desc': return bVal - aVal;
            case 'value_asc': return aVal - bVal;
            case 'pnl_desc': return bPnl - aPnl;
            case 'pnl_asc': return aPnl - bPnl;
            case 'weight_desc': return b.totalCost - a.totalCost;
            default: return 0;
          }
        }).map((h, fi) => {
          const liveData = priceMap[h.symbol] || {};
          const livePrice = liveData.price || h.avgPrice;
          const currentValue = h.totalShares * livePrice;
          const gainLoss = currentValue - h.totalCost;
          const gainPct = h.totalCost > 0 ? (gainLoss / h.totalCost) * 100 : 0;
          const color = getPnLColor(gainLoss);
          const sector = getStockSector(h.symbol);
          const portfolioPct = totals.invested > 0 ? (h.totalCost / totals.invested) * 100 : 0;
          return (
            <motion.div key={h.symbol} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: fi * 0.04 }}>
              <Card sx={{ mb: isMobile ? 1 : 1.5 }}>
                <CardContent sx={{ p: isMobile ? 1.5 : 2, '&:last-child': { pb: isMobile ? 1.5 : 2 } }}>
                  {/* Symbol row */}
                  <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: 1.5 }}>
                    <Box sx={{ display: 'flex', gap: 1, flex: 1, minWidth: 0 }}>
                      <StockLogo symbol={h.symbol} size="md" sx={{ mt: 0.25 }} />
                      <Box sx={{ minWidth: 0 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.25 }}>
                          <Typography sx={{ fontSize: '0.82rem', fontWeight: 700, lineHeight: 1.3 }}>{h.symbol}</Typography>
                          {sector !== 'Other' && (
                            <Chip label={sector} size="small"
                              sx={{
                                height: 18, fontSize: '0.5rem', fontWeight: 600,
                                bgcolor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
                                color: 'text.secondary', '& .MuiChip-label': { px: 0.75 },
                              }}
                            />
                          )}
                        </Box>
                        <Typography sx={{ fontSize: '0.6rem', color: 'text.secondary' }} noWrap>
                          {getStockName(h.symbol, h.companyName)}
                        </Typography>
                        <Typography sx={{ fontSize: '0.6rem', color: 'text.secondary', mt: 0.15 }}>
                          {formatNumber(h.totalShares, 2)} shares · {portfolioPct.toFixed(1)}% of portfolio
                        </Typography>
                      </Box>
                    </Box>
                    <Box sx={{ textAlign: 'right', flexShrink: 0, ml: 1.5 }}>
                      <Typography sx={{ fontSize: '0.82rem', fontWeight: 700, color, fontFeatureSettings: '"tnum"' }} className="currency">
                        {formatCurrency(gainLoss)}
                      </Typography>
                      <Chip size="small" label={formatPercent(gainPct)}
                        sx={{ fontSize: '0.6rem', height: 20, bgcolor: `${color}14`, color, fontWeight: 600, mt: 0.25 }} />
                    </Box>
                  </Box>
                  {/* Details grid */}
                  <Box sx={{
                    display: 'grid', gridTemplateColumns: '1fr 1fr',
                    gap: 1, p: 1.5, borderRadius: 2,
                    bgcolor: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.015)',
                  }}>
                    <Box>
                      <Typography sx={{ fontSize: '0.58rem', color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.03em', fontWeight: 500 }}>Invested</Typography>
                      <Typography sx={{ fontSize: '0.82rem', fontWeight: 700, fontFeatureSettings: '"tnum"' }} className="currency">{formatCurrency(h.totalCost)}</Typography>
                    </Box>
                    <Box>
                      <Typography sx={{ fontSize: '0.58rem', color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.03em', fontWeight: 500 }}>Current Value</Typography>
                      <Typography sx={{ fontSize: '0.82rem', fontWeight: 700, color, fontFeatureSettings: '"tnum"' }} className="currency">{formatCurrency(currentValue)}</Typography>
                    </Box>
                    <Box>
                      <Typography sx={{ fontSize: '0.58rem', color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.03em', fontWeight: 500 }}>Avg Price</Typography>
                      <Typography sx={{ fontSize: '0.82rem', fontWeight: 700, fontFeatureSettings: '"tnum"' }}>{formatNumber(h.avgPrice, 2)}</Typography>
                    </Box>
                    <Box>
                      <Typography sx={{ fontSize: '0.58rem', color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.03em', fontWeight: 500 }}>Live Price</Typography>
                      <Typography sx={{ fontSize: '0.82rem', fontWeight: 700, color: getPnLColor(liveData.change || 0), fontFeatureSettings: '"tnum"' }}>{formatNumber(livePrice, 2)}</Typography>
                    </Box>
                  </Box>
                </CardContent>
              </Card>
            </motion.div>
          );
        })
      )}

      {/* ── Sector Distribution ── */}
      {sectorData.length > 0 && (
        <>
          <Typography sx={{ fontSize: isMobile ? '0.7rem' : '0.75rem', fontWeight: 600, letterSpacing: '0.02em', mb: 1, mt: isMobile ? 2 : 2.5 }}>
            <CategoryRounded sx={{ fontSize: 14, verticalAlign: 'text-bottom', mr: 0.5, opacity: 0.6 }} />
            Sector Distribution
          </Typography>
          <Card>
            <CardContent sx={{ p: isMobile ? 1.5 : 2, '&:last-child': { pb: isMobile ? 1.5 : 2 } }}>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                {sectorData.map((s, i) => {
                  const barColor = getSectorColor(i);
                  const pnlColor = getPnLColor(s.pnl);
                  return (
                    <Box key={s.sector}>
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.25 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flex: 1, minWidth: 0 }}>
                          <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: barColor, flexShrink: 0 }} />
                          <Typography sx={{ fontSize: '0.72rem', fontWeight: 600, lineHeight: 1.2 }} noWrap>
                            {s.sector}
                          </Typography>
                          <Typography sx={{ fontSize: '0.6rem', color: 'text.secondary' }}>
                            ({s.stocks})
                          </Typography>
                        </Box>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0 }}>
                          <Typography sx={{ fontSize: '0.7rem', fontWeight: 700, fontFeatureSettings: '"tnum"', color: pnlColor }} className="currency">
                            {formatCurrency(s.currentValue)}
                          </Typography>
                          <Chip size="small" label={`${s.pct.toFixed(1)}%`}
                            sx={{ height: 18, fontSize: '0.55rem', fontWeight: 700, bgcolor: `${barColor}18`, color: barColor, '& .MuiChip-label': { px: 0.5 } }} />
                        </Box>
                      </Box>
                      <Box sx={{ height: 3, borderRadius: 1.5, bgcolor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)', overflow: 'hidden' }}>
                        <Box sx={{ height: '100%', width: `${s.pct}%`, bgcolor: barColor, borderRadius: 1.5, transition: 'width 0.6s ease' }} />
                      </Box>
                    </Box>
                  );
                })}
              </Box>
            </CardContent>
          </Card>
        </>
      )}
    </Box>
  );
}
