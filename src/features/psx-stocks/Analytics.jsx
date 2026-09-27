import { useMemo, useState } from 'react';
import {
  Box, Card, CardContent, Typography, Grid, Skeleton, Chip, useTheme, useMediaQuery,
  TextField, InputAdornment, Menu, MenuItem, alpha,
} from '@mui/material';
import {
  SavingsRounded, PieChartRounded, ShowChartRounded,
  TrendingUpRounded, TrendingDownRounded, WarningAmberRounded,
  CategoryRounded, DonutLargeRounded, BarChartRounded,
  MapRounded, HealthAndSafetyRounded, TimelineRounded,
  SearchRounded, FilterListRounded, CheckRounded,
} from '@mui/icons-material';
import {
  PieChart, Pie, Cell, Sector, ResponsiveContainer,
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip,
  Treemap,
} from 'recharts';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../../lib/supabase';
import { psxStocksQuery, stockPriceMap } from '../../lib/marketQueries';
import { useAuthStore } from '../../store/authStore';
import { formatCurrency, formatNumber, getPnLColor, formatPercent } from '../../lib/formatters';
import { getStockSector, getSectorColor, SECTOR_COLORS, getAllSectors } from '../../lib/psxSectors';
import { subMonths, format } from 'date-fns';
import { getStockName } from '../../lib/stockMeta';
import StockLogo from '../../components/StockLogo';

/* Section tab config */
const SECTIONS = [
  { key: 'allocation', label: 'Allocation', icon: DonutLargeRounded },
  { key: 'gainloss', label: 'P&L', icon: BarChartRounded },
  { key: 'sectors', label: 'Sectors', icon: CategoryRounded },
  { key: 'map', label: 'Map', icon: MapRounded },
  { key: 'health', label: 'Health', icon: HealthAndSafetyRounded },
  { key: 'growth', label: 'Growth', icon: TimelineRounded },
];

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

/* Smaller active shape for dual-pie layout */
const renderSmallActive = (props) => {
  const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill, payload, percent, value } = props;
  return (
    <g>
      <text x={cx} y={cy - 8} textAnchor="middle" fontSize={9} fontWeight={600} fill={fill}>{payload.name}</text>
      <text x={cx} y={cy + 6} textAnchor="middle" fontSize={10} fontWeight={800} fill={fill}>{formatCurrency(value)}</text>
      <text x={cx} y={cy + 17} textAnchor="middle" fontSize={8} fill="#888">{`${(percent * 100).toFixed(1)}%`}</text>
      <Sector cx={cx} cy={cy} innerRadius={innerRadius - 2} outerRadius={outerRadius + 4}
        startAngle={startAngle} endAngle={endAngle} fill={fill} />
    </g>
  );
};

/* Gain/Loss bar component (reused for stock & sector) */
function GainLossBars({ data, isDark }) {
  const maxAbs = Math.max(...data.map((d) => Math.abs(d.gainLoss)), 1);
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      {data.map((d, i) => {
        const isProfit = d.gainLoss >= 0;
        const accentColor = isProfit ? '#22c55e' : '#ef4444';
        const bgTint = isProfit
          ? (isDark ? 'rgba(34,197,94,0.06)' : 'rgba(34,197,94,0.04)')
          : (isDark ? 'rgba(239,68,68,0.06)' : 'rgba(239,68,68,0.04)');
        const barWidth = Math.max((Math.abs(d.gainLoss) / maxAbs) * 100, 3);
        return (
          <motion.div key={d.name} initial={{ opacity: 0, x: isProfit ? 10 : -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.04 }}>
            <Box sx={{ p: 1.5, borderRadius: 2.5, bgcolor: bgTint, borderLeft: `3px solid ${accentColor}`, position: 'relative', overflow: 'hidden' }}>
              <Box sx={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: `${barWidth}%`, bgcolor: isProfit ? (isDark ? 'rgba(34,197,94,0.08)' : 'rgba(34,197,94,0.07)') : (isDark ? 'rgba(239,68,68,0.08)' : 'rgba(239,68,68,0.07)'), borderRadius: 2.5, transition: 'width 0.6s ease' }} />
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, position: 'relative', zIndex: 1 }}>
                {d.stocks === undefined && <StockLogo symbol={d.name} size="sm" />}
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <Typography sx={{ fontSize: '0.75rem', fontWeight: 600 }} noWrap>{d.name}</Typography>
                    {d.stocks !== undefined && <Typography sx={{ fontSize: '0.58rem', color: 'text.secondary' }}>({d.stocks})</Typography>}
                  </Box>
                  {d.fullName && <Typography sx={{ fontSize: '0.52rem', color: 'text.secondary' }} noWrap>{d.fullName}</Typography>}
                  <Typography sx={{ fontSize: '0.85rem', fontWeight: 700, color: accentColor, fontFeatureSettings: '"tnum"' }} className="currency">
                    {isProfit ? '+' : ''}{formatCurrency(d.gainLoss)}
                  </Typography>
                </Box>
                <Chip size="small" label={formatPercent(d.pct)} sx={{ fontWeight: 700, fontSize: '0.62rem', height: 24, bgcolor: `${accentColor}14`, color: accentColor, border: `1px solid ${accentColor}30` }} />
              </Box>
            </Box>
          </motion.div>
        );
      })}
    </Box>
  );
}

/* Treemap custom content — vivid colors */
const TreemapContent = ({ x, y, width, height, name, value, pnl, isDark }) => {
  if (width < 4 || height < 4) return null;
  const isProfit = (pnl || 0) >= 0;
  const bg = isProfit
    ? (isDark ? 'rgba(34,197,94,0.35)' : 'rgba(34,197,94,0.22)')
    : (isDark ? 'rgba(239,68,68,0.35)' : 'rgba(239,68,68,0.22)');
  const border = isProfit ? 'rgba(34,197,94,0.5)' : 'rgba(239,68,68,0.5)';
  const textColor = isDark ? '#f5f5f5' : '#111';
  return (
    <g>
      <rect x={x + 1} y={y + 1} width={Math.max(width - 2, 0)} height={Math.max(height - 2, 0)} rx={6}
        fill={bg} stroke={border} strokeWidth={1.5} />
      {width > 50 && height > 35 && (
        <>
          <text x={x + width / 2} y={y + height / 2 - 6} textAnchor="middle"
            fontSize={Math.min(width / 6, 13)} fontWeight={800} fill={textColor}>{name}</text>
          <text x={x + width / 2} y={y + height / 2 + 10} textAnchor="middle"
            fontSize={Math.min(width / 8, 10)} fontWeight={700}
            fill={isProfit ? '#16a34a' : '#dc2626'}>{formatCurrency(value)}</text>
        </>
      )}
      {width > 30 && width <= 50 && height > 20 && (
        <text x={x + width / 2} y={y + height / 2 + 3} textAnchor="middle"
          fontSize={8} fontWeight={700} fill={textColor}>{name}</text>
      )}
    </g>
  );
};

export default function PSXAnalytics() {
  const user = useAuthStore((s) => s.user);
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const isMobile = useMediaQuery('(max-width:768px)');
  const [activeIdx, setActiveIdx] = useState(-1);
  const [activeIdx2, setActiveIdx2] = useState(-1);
  const [activeSection, setActiveSection] = useState('allocation');
  const [searchFilter, setSearchFilter] = useState('');
  const [sectorFilter, setSectorFilter] = useState('');
  const [sectorMenuAnchor, setSectorMenuAnchor] = useState(null);
  const [period, setPeriod] = useState('6m');

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

  const { allocationData, gainLossData, totals } = useMemo(() => {
    const live = stockPriceMap(liveStocks);
    const priceMap = {};
    for (const [sym, s] of Object.entries(live)) priceMap[sym] = s.current;

    const holdingMap = {};
    transactions.forEach((t) => {
      const sym = t.symbol?.toUpperCase();
      if (!holdingMap[sym]) holdingMap[sym] = { symbol: sym, companyName: t.company_name, totalShares: 0, totalCost: 0 };
      const h = holdingMap[sym];
      const fee = Number(t.fee) || 0;
      if (t.type === 'buy') { h.totalShares += Number(t.quantity); h.totalCost += Number(t.price) * Number(t.quantity) + fee; }
      else {
        const qty = Number(t.quantity);
        const costBasis = h.totalShares > 0 ? (h.totalCost / h.totalShares) * qty : 0;
        h.totalShares -= qty; h.totalCost -= costBasis;
      }
    });

    const holdings = Object.values(holdingMap).filter((h) => h.totalShares > 0)
      .map((h) => ({ ...h, avgPrice: h.totalCost / h.totalShares }));

    let totalInvested = 0, totalCurrentValue = 0;
    holdings.forEach((h) => {
      const livePrice = priceMap[h.symbol] || h.avgPrice;
      totalInvested += h.totalCost;
      totalCurrentValue += h.totalShares * livePrice;
    });

    /* Allocation data */
    let profitIdx = 0, lossIdx = 0;
    const allocationData = holdings.map((h) => {
      const livePrice = priceMap[h.symbol] || h.avgPrice;
      const currentValue = Math.round(h.totalShares * livePrice);
      const gl = currentValue - h.totalCost;
      const color = gl >= 0
        ? profitColors[profitIdx++ % profitColors.length]
        : lossColors[lossIdx++ % lossColors.length];
      return { name: h.symbol, value: currentValue, gainLoss: Math.round(gl), color };
    }).sort((a, b) => b.value - a.value);

    /* Gain/Loss bar data */
    const gainLossData = holdings.map((h) => {
      const livePrice = priceMap[h.symbol] || h.avgPrice;
      const currentValue = h.totalShares * livePrice;
      const gl = currentValue - h.totalCost;
      const pct = h.totalCost > 0 ? (gl / h.totalCost) * 100 : 0;
      return {
        name: h.symbol,
        fullName: getStockName(h.symbol, h.companyName),
        gainLoss: Math.round(gl),
        pct,
        fill: gl >= 0 ? '#22c55e' : '#ef4444',
      };
    }).sort((a, b) => b.gainLoss - a.gainLoss);

    return {
      allocationData, gainLossData,
      totals: {
        invested: totalInvested, currentValue: totalCurrentValue,
        gainLoss: totalCurrentValue - totalInvested,
        gainPct: totalInvested > 0 ? ((totalCurrentValue - totalInvested) / totalInvested) * 100 : 0,
      },
    };
  }, [transactions, liveStocks]);

  /* ── Sector-level aggregated data ── */
  const { sectorAllocation, sectorPnL, treemapData, concentrationData } = useMemo(() => {
    if (allocationData.length === 0) return { sectorAllocation: [], sectorPnL: [], treemapData: [], concentrationData: null };

    const sectorMap = {};
    allocationData.forEach((d) => {
      const sector = getStockSector(d.name);
      if (!sectorMap[sector]) sectorMap[sector] = { name: sector, value: 0, invested: 0, stocks: [], gainLoss: 0 };
      sectorMap[sector].value += d.value;
      sectorMap[sector].gainLoss += d.gainLoss;
      sectorMap[sector].stocks.push(d.name);
    });

    // Match invested from gainLossData
    gainLossData.forEach((d) => {
      const sector = getStockSector(d.name);
      if (sectorMap[sector]) {
        const stockAlloc = allocationData.find((a) => a.name === d.name);
        if (stockAlloc) {
          sectorMap[sector].invested += stockAlloc.value - d.gainLoss; // invested = value - gl
        }
      }
    });

    const sectorArr = Object.values(sectorMap).sort((a, b) => b.value - a.value);
    const sectorAllocation = sectorArr.map((s, i) => ({
      ...s, color: getSectorColor(i),
    }));

    const sectorPnL = sectorArr.map((s, i) => {
      const pct = s.invested > 0 ? (s.gainLoss / s.invested) * 100 : 0;
      return {
        name: s.name,
        gainLoss: Math.round(s.gainLoss),
        pct,
        stocks: s.stocks.length,
        fill: s.gainLoss >= 0 ? '#22c55e' : '#ef4444',
      };
    }).sort((a, b) => b.gainLoss - a.gainLoss);

    // Treemap data
    const treemapData = allocationData.map((d) => ({
      name: d.name,
      size: Math.max(d.value, 1),
      value: d.value,
      pnl: d.gainLoss,
      sector: getStockSector(d.name),
    }));

    // Concentration risk
    const totalValue = sectorAllocation.reduce((s, d) => s + d.value, 0);
    const topStocks = [...allocationData].sort((a, b) => b.value - a.value).slice(0, 3);
    const topPct = totalValue > 0 ? topStocks.reduce((s, d) => s + d.value, 0) / totalValue * 100 : 0;
    const sectorCount = sectorAllocation.length;
    const totalSectors = 15; // reasonable PSX sector baseline
    const diversificationScore = Math.min(Math.round((sectorCount / totalSectors) * 100), 100);
    const highConc = sectorAllocation.filter((s) => totalValue > 0 && (s.value / totalValue) * 100 > 40);

    const concentrationData = {
      topStocks: topStocks.map((s) => ({ name: s.name, pct: totalValue > 0 ? (s.value / totalValue) * 100 : 0 })),
      topPct,
      sectorCount,
      diversificationScore,
      warnings: highConc.map((s) => `${Math.round((s.value / totalValue) * 100)}% in ${s.name}`),
    };

    return { sectorAllocation, sectorPnL, treemapData, concentrationData };
  }, [allocationData, gainLossData]);

  const allSectors = useMemo(() => getAllSectors(), []);

  /* Filtered data for search/sector toolbar */
  const { filteredAllocation, filteredGainLoss, filteredTreemap, filteredSectorAllocation, filteredSectorPnL } = useMemo(() => {
    const sq = searchFilter.toLowerCase();
    const stockFilter = (d) => {
      if (sq && !d.name.toLowerCase().includes(sq)) return false;
      if (sectorFilter && getStockSector(d.name) !== sectorFilter) return false;
      return true;
    };
    return {
      filteredAllocation: allocationData.filter(stockFilter),
      filteredGainLoss: gainLossData.filter(stockFilter),
      filteredTreemap: treemapData.filter(stockFilter),
      filteredSectorAllocation: sectorFilter ? sectorAllocation.filter((s) => s.name === sectorFilter) : sectorAllocation,
      filteredSectorPnL: sectorFilter ? sectorPnL.filter((s) => s.name === sectorFilter) : sectorPnL,
    };
  }, [allocationData, gainLossData, treemapData, sectorAllocation, sectorPnL, searchFilter, sectorFilter]);

  /* ── Growth data (dynamic period) ── */
  const growthData = useMemo(() => {
    const monthCount = { '1m': 1, '3m': 3, '6m': 6, '1y': 12, 'all': 60 }[period] || 6;
    const months = [];
    for (let i = monthCount - 1; i >= 0; i--) {
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
  }, [transactions, period]);

  const lineColorInvested = isDark ? '#a3a3a3' : '#555';
  const gridColor = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
  const axisColor = isDark ? '#555' : '#aaa';

  const pnlColor = totals.gainLoss >= 0 ? '#15803d' : '#b91c1c';
  const statCards = [
    { label: 'Invested', value: formatCurrency(totals.invested), icon: SavingsRounded },
    { label: 'Current', value: formatCurrency(totals.currentValue), icon: PieChartRounded },
    { label: 'P&L', value: formatCurrency(totals.gainLoss), icon: totals.gainLoss >= 0 ? TrendingUpRounded : TrendingDownRounded, color: pnlColor, highlight: true },
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
      <Typography sx={{ fontSize: isMobile ? '1.2rem' : '1.5rem', fontWeight: 800, letterSpacing: '-0.03em', mb: isMobile ? 1.5 : 3 }}>
        Stock Analytics
      </Typography>

      {allocationData.length === 0 ? (
        <Card sx={{ p: 5, textAlign: 'center' }}>
          <Typography color="text.secondary">No stock holdings to analyze</Typography>
        </Card>
      ) : (
        <>
          {/* ── Stat Cards (unified 2×2) ── */}
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
                          <Typography sx={{ fontSize: '0.62rem', color: 'text.secondary', fontWeight: 500, letterSpacing: '0.04em', textTransform: 'uppercase' }}>{s.label}</Typography>
                        </Box>
                        <Typography sx={{ fontSize: s.highlight ? '1.1rem' : '0.95rem', fontWeight: 700, color: s.color || 'text.primary', fontFeatureSettings: '"tnum"' }} className="currency">{s.value}</Typography>
                      </Box>
                    );
                  })}
                </Box>
              </CardContent>
            </Card>
          </motion.div>

          {/* ── Section Navigation (segmented control) ── */}
          <Box sx={{
            display: 'flex', gap: 0.5, p: 0.4, mb: 1.5,
            borderRadius: 2.5, bgcolor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)',
            overflowX: 'auto',
            '&::-webkit-scrollbar': { display: 'none' }, scrollbarWidth: 'none',
          }}>
            {SECTIONS.map((sec) => {
              const Icon = sec.icon;
              const isActive = activeSection === sec.key;
              return (
                <Box key={sec.key} onClick={() => setActiveSection(sec.key)} sx={{
                  flex: 1, minWidth: 'fit-content', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.4,
                  py: 0.8, px: 0.5, borderRadius: 2, cursor: 'pointer', transition: 'all 0.2s',
                  bgcolor: isActive ? (isDark ? '#fff' : '#111') : 'transparent',
                  color: isActive ? (isDark ? '#000' : '#fff') : 'text.secondary',
                  boxShadow: isActive ? (isDark ? 'none' : '0 1px 3px rgba(0,0,0,0.08)') : 'none',
                  '&:hover': { bgcolor: isActive ? undefined : (isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)') },
                }}>
                  <Icon sx={{ fontSize: 14 }} />
                  <Typography sx={{ fontSize: '0.62rem', fontWeight: isActive ? 700 : 500, lineHeight: 1, whiteSpace: 'nowrap' }}>{sec.label}</Typography>
                </Box>
              );
            })}
          </Box>

          {/* ── Filter Toolbar (search + sector for data sections, period for growth) ── */}
          {['allocation', 'gainloss', 'sectors', 'map'].includes(activeSection) && (
            <Box sx={{ display: 'flex', gap: 0.75, mb: 1.5, alignItems: 'center' }}>
              <TextField size="small" placeholder="Search stock..." value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                InputProps={{ startAdornment: <InputAdornment position="start"><SearchRounded sx={{ fontSize: 16, color: 'text.secondary' }} /></InputAdornment> }}
                sx={{ flex: 1, '& .MuiOutlinedInput-root': { borderRadius: 2.5, fontSize: '0.75rem', height: 32, bgcolor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)' } }}
              />
              {sectorFilter ? (
                <Chip label={sectorFilter} size="small" onDelete={() => setSectorFilter('')}
                  sx={{ fontSize: '0.6rem', fontWeight: 600, height: 28, flexShrink: 0,
                    bgcolor: isDark ? '#fff' : '#111', color: isDark ? '#000' : '#fff',
                    '& .MuiChip-deleteIcon': { color: isDark ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.5)', fontSize: 14 },
                  }} />
              ) : (
                <Chip label="Sector" size="small" icon={<FilterListRounded sx={{ fontSize: 13 }} />}
                  onClick={(e) => setSectorMenuAnchor(e.currentTarget)}
                  sx={{ fontSize: '0.6rem', fontWeight: 600, height: 28, flexShrink: 0,
                    bgcolor: 'transparent', color: 'text.secondary',
                    border: `1px solid ${isDark ? '#333' : '#ddd'}`,
                    '& .MuiChip-icon': { color: 'text.secondary' },
                  }} />
              )}
              <Menu anchorEl={sectorMenuAnchor} open={Boolean(sectorMenuAnchor)} onClose={() => setSectorMenuAnchor(null)}
                slotProps={{ paper: { sx: { maxHeight: 320, minWidth: 180, borderRadius: 2.5 } } }}>
                <MenuItem onClick={() => { setSectorFilter(''); setSectorMenuAnchor(null); }}
                  sx={{ fontSize: '0.72rem', py: 0.75, fontWeight: !sectorFilter ? 700 : 400 }}>All Sectors</MenuItem>
                {allSectors.map((s) => (
                  <MenuItem key={s} selected={sectorFilter === s}
                    onClick={() => { setSectorFilter(s); setSectorMenuAnchor(null); }}
                    sx={{ fontSize: '0.72rem', py: 0.75, gap: 1 }}>
                    {sectorFilter === s && <CheckRounded sx={{ fontSize: 14, color: isDark ? '#fff' : '#111' }} />}
                    {s}
                  </MenuItem>
                ))}
              </Menu>
            </Box>
          )}
          {activeSection === 'growth' && (
            <Box sx={{ display: 'flex', gap: 0.5, mb: 1.5 }}>
              {[{ k: '1m', l: '1M' }, { k: '3m', l: '3M' }, { k: '6m', l: '6M' }, { k: '1y', l: '1Y' }, { k: 'all', l: 'All' }].map((p) => {
                const isActive = period === p.k;
                return (
                  <Box key={p.k} onClick={() => setPeriod(p.k)} sx={{
                    px: 1.2, py: 0.5, borderRadius: 2, cursor: 'pointer', transition: 'all 0.15s',
                    bgcolor: isActive ? (isDark ? '#fff' : '#111') : (isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)'),
                    color: isActive ? (isDark ? '#000' : '#fff') : 'text.secondary',
                  }}>
                    <Typography sx={{ fontSize: '0.65rem', fontWeight: isActive ? 700 : 500 }}>{p.l}</Typography>
                  </Box>
                );
              })}
            </Box>
          )}

          {/* ── Section Content ── */}
          <AnimatePresence mode="wait">
            <motion.div key={activeSection} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }}>

              {/* ─── ALLOCATION: Dual pie (stock + sector side by side) ─── */}
              {activeSection === 'allocation' && (
                <Card sx={{ overflow: 'visible' }}>
                  <CardContent sx={{ p: isMobile ? 1.5 : 2.5 }}>
                    <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, letterSpacing: '0.02em', mb: 1 }}>Allocation</Typography>
                    <Grid container spacing={isMobile ? 1 : 2}>
                      {/* Stock pie */}
                      <Grid size={{ xs: 12, md: 6 }}>
                        <Typography sx={{ fontSize: '0.62rem', color: 'text.secondary', textAlign: 'center', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', mb: 0.5 }}>By Stock</Typography>
                        <Box sx={{ position: 'relative' }}>
                          <ResponsiveContainer width="100%" height={isMobile ? 240 : 280}>
                            <PieChart>
                              <Pie data={filteredAllocation} dataKey="value" cx="50%" cy="50%"
                                innerRadius={isMobile ? 45 : 58} outerRadius={isMobile ? 68 : 85}
                                paddingAngle={3} strokeWidth={0}
                                activeIndex={activeIdx} activeShape={renderSmallActive}
                                label={activeIdx < 0 && !isMobile ? renderOuterLabel : false} labelLine={false}
                                onMouseEnter={(_, i) => setActiveIdx(i)} onMouseLeave={() => setActiveIdx(-1)}>
                                {filteredAllocation.map((d, i) => <Cell key={i} fill={d.color} />)}
                              </Pie>
                            </PieChart>
                          </ResponsiveContainer>
                          {activeIdx < 0 && (
                            <Box sx={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center', pointerEvents: 'none', width: 85 }}>
                              <Typography sx={{ fontSize: '0.78rem', fontWeight: 700, lineHeight: 1.2 }}>{formatCurrency(totals.currentValue)}</Typography>
                              <Typography sx={{ fontSize: '0.5rem', color: 'text.secondary' }}>portfolio</Typography>
                            </Box>
                          )}
                        </Box>
                      </Grid>
                      {/* Sector pie */}
                      <Grid size={{ xs: 12, md: 6 }}>
                        <Typography sx={{ fontSize: '0.62rem', color: 'text.secondary', textAlign: 'center', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', mb: 0.5 }}>By Sector</Typography>
                        <Box sx={{ position: 'relative' }}>
                          <ResponsiveContainer width="100%" height={isMobile ? 240 : 280}>
                            <PieChart>
                              <Pie data={filteredSectorAllocation} dataKey="value" cx="50%" cy="50%"
                                innerRadius={isMobile ? 45 : 58} outerRadius={isMobile ? 68 : 85}
                                paddingAngle={3} strokeWidth={0}
                                activeIndex={activeIdx2} activeShape={renderSmallActive}
                                label={activeIdx2 < 0 && !isMobile ? renderOuterLabel : false} labelLine={false}
                                onMouseEnter={(_, i) => setActiveIdx2(i)} onMouseLeave={() => setActiveIdx2(-1)}>
                                {filteredSectorAllocation.map((d, i) => <Cell key={i} fill={d.color} />)}
                              </Pie>
                            </PieChart>
                          </ResponsiveContainer>
                          {activeIdx2 < 0 && (
                            <Box sx={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center', pointerEvents: 'none', width: 85 }}>
                              <Typography sx={{ fontSize: '0.78rem', fontWeight: 700, lineHeight: 1.2 }}>{filteredSectorAllocation.length}</Typography>
                              <Typography sx={{ fontSize: '0.5rem', color: 'text.secondary' }}>sectors</Typography>
                            </Box>
                          )}
                        </Box>
                      </Grid>
                    </Grid>
                  </CardContent>
                </Card>
              )}

              {/* ─── GAIN/LOSS ─── */}
              {activeSection === 'gainloss' && (
                <Card>
                  <CardContent sx={{ p: isMobile ? 2 : 2.5 }}>
                    <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, letterSpacing: '0.02em', mb: 2 }}>Gain / Loss by Stock</Typography>
                    <GainLossBars data={filteredGainLoss} isDark={isDark} />
                  </CardContent>
                </Card>
              )}

              {/* ─── SECTORS ─── */}
              {activeSection === 'sectors' && (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {/* Sector Summary */}
                  <Card>
                    <CardContent sx={{ p: isMobile ? 2 : 2.5 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 2 }}>
                        <CategoryRounded sx={{ fontSize: 16, color: 'text.secondary', opacity: 0.7 }} />
                        <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, letterSpacing: '0.02em' }}>Sector Summary</Typography>
                      </Box>
                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
                        {filteredSectorAllocation.map((s, i) => {
                          const spnlColor = getPnLColor(s.gainLoss);
                          const totalValue = sectorAllocation.reduce((sum, d) => sum + d.value, 0);
                          const pct = totalValue > 0 ? (s.value / totalValue) * 100 : 0;
                          return (
                            <motion.div key={s.name} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
                              <Box sx={{ p: 1.5, borderRadius: 2.5, bgcolor: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.015)', borderLeft: `3px solid ${s.color}` }}>
                                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.75 }}>
                                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flex: 1, minWidth: 0 }}>
                                    <Typography sx={{ fontSize: '0.75rem', fontWeight: 600 }} noWrap>{s.name}</Typography>
                                    <Typography sx={{ fontSize: '0.6rem', color: 'text.secondary' }}>{s.stocks.length} stock{s.stocks.length !== 1 ? 's' : ''}</Typography>
                                  </Box>
                                  <Chip size="small" label={`${pct.toFixed(1)}%`} sx={{ height: 20, fontSize: '0.58rem', fontWeight: 700, bgcolor: `${s.color}18`, color: s.color, '& .MuiChip-label': { px: 0.5 } }} />
                                </Box>
                                <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 1 }}>
                                  {[{ l: 'Invested', v: formatCurrency(s.invested) }, { l: 'Current', v: formatCurrency(s.value) }, { l: 'P&L', v: `${s.gainLoss >= 0 ? '+' : ''}${formatCurrency(s.gainLoss)}`, c: spnlColor }].map((item) => (
                                    <Box key={item.l}>
                                      <Typography sx={{ fontSize: '0.5rem', color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 500 }}>{item.l}</Typography>
                                      <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, fontFeatureSettings: '"tnum"', color: item.c || 'text.primary' }} className="currency">{item.v}</Typography>
                                    </Box>
                                  ))}
                                </Box>
                                <Box sx={{ display: 'flex', gap: 0.5, mt: 0.75, flexWrap: 'wrap' }}>
                                  {s.stocks.map((sym) => <Chip key={sym} label={sym} size="small" sx={{ height: 18, fontSize: '0.5rem', fontWeight: 600, bgcolor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)', '& .MuiChip-label': { px: 0.5 } }} />)}
                                </Box>
                              </Box>
                            </motion.div>
                          );
                        })}
                      </Box>
                    </CardContent>
                  </Card>
                  {/* Sector Performance bars */}
                  {filteredSectorPnL.length > 0 && (
                    <Card>
                      <CardContent sx={{ p: isMobile ? 2 : 2.5 }}>
                        <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, letterSpacing: '0.02em', mb: 2 }}>Sector Performance</Typography>
                        <GainLossBars data={filteredSectorPnL} isDark={isDark} />
                      </CardContent>
                    </Card>
                  )}
                </Box>
              )}

              {/* ─── PORTFOLIO MAP ─── */}
              {activeSection === 'map' && filteredTreemap.length > 0 && (
                <Card sx={{ overflow: 'hidden' }}>
                  <CardContent sx={{ p: isMobile ? 2 : 2.5 }}>
                    <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, letterSpacing: '0.02em', mb: 0.5 }}>Portfolio Map</Typography>
                    <Typography sx={{ fontSize: '0.6rem', color: 'text.secondary', mb: 1.5 }}>Size = current value · Green = profit · Red = loss</Typography>
                    <ResponsiveContainer width="100%" height={isMobile ? 280 : 360}>
                      <Treemap data={filteredTreemap} dataKey="size" aspectRatio={4 / 3}
                        stroke={isDark ? '#222' : '#fff'} content={<TreemapContent isDark={isDark} />} />
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              )}

              {/* ─── HEALTH ─── */}
              {activeSection === 'health' && concentrationData && (
                <Card>
                  <CardContent sx={{ p: isMobile ? 2 : 2.5 }}>
                    <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, letterSpacing: '0.02em', mb: 1.5 }}>Portfolio Health</Typography>
                    <Grid container spacing={1.5} sx={{ mb: concentrationData.warnings.length > 0 ? 1.5 : 0 }}>
                      <Grid size={{ xs: 12, md: 6 }}>
                        <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.015)' }}>
                          <Typography sx={{ fontSize: '0.6rem', color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 500, mb: 0.75 }}>Top 3 Holdings</Typography>
                          {concentrationData.topStocks.map((s) => (
                            <Box key={s.name} sx={{ display: 'flex', justifyContent: 'space-between', py: 0.25 }}>
                              <Typography sx={{ fontSize: '0.72rem', fontWeight: 600 }}>{s.name}</Typography>
                              <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, fontFeatureSettings: '"tnum"' }}>{s.pct.toFixed(1)}%</Typography>
                            </Box>
                          ))}
                          <Box sx={{ height: 4, borderRadius: 2, bgcolor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)', mt: 0.75, overflow: 'hidden' }}>
                            <Box sx={{ height: '100%', borderRadius: 2, width: `${Math.min(concentrationData.topPct, 100)}%`, bgcolor: concentrationData.topPct > 70 ? '#ef4444' : concentrationData.topPct > 50 ? '#eab308' : '#22c55e', transition: 'width 0.6s ease' }} />
                          </Box>
                          <Typography sx={{ fontSize: '0.58rem', color: 'text.secondary', mt: 0.25, textAlign: 'right' }}>{concentrationData.topPct.toFixed(1)}% of portfolio</Typography>
                        </Box>
                      </Grid>
                      <Grid size={{ xs: 12, md: 6 }}>
                        <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.015)' }}>
                          <Typography sx={{ fontSize: '0.6rem', color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 500, mb: 0.75 }}>Diversification</Typography>
                          <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.5, mb: 0.5 }}>
                            <Typography sx={{ fontSize: '1.4rem', fontWeight: 800, fontFeatureSettings: '"tnum"', color: concentrationData.diversificationScore > 40 ? '#22c55e' : concentrationData.diversificationScore > 20 ? '#eab308' : '#ef4444' }}>{concentrationData.diversificationScore}</Typography>
                            <Typography sx={{ fontSize: '0.68rem', color: 'text.secondary', fontWeight: 500 }}>/100</Typography>
                          </Box>
                          <Typography sx={{ fontSize: '0.62rem', color: 'text.secondary' }}>{concentrationData.sectorCount} sector{concentrationData.sectorCount !== 1 ? 's' : ''} covered</Typography>
                          <Box sx={{ height: 4, borderRadius: 2, bgcolor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)', mt: 0.75, overflow: 'hidden' }}>
                            <Box sx={{ height: '100%', borderRadius: 2, width: `${concentrationData.diversificationScore}%`, bgcolor: concentrationData.diversificationScore > 40 ? '#22c55e' : concentrationData.diversificationScore > 20 ? '#eab308' : '#ef4444', transition: 'width 0.6s ease' }} />
                          </Box>
                        </Box>
                      </Grid>
                    </Grid>
                    {concentrationData.warnings.length > 0 && (
                      <Box sx={{ p: 1.25, borderRadius: 2, bgcolor: isDark ? 'rgba(234,179,8,0.06)' : 'rgba(234,179,8,0.04)', border: '1px solid', borderColor: isDark ? 'rgba(234,179,8,0.15)' : 'rgba(234,179,8,0.12)', display: 'flex', alignItems: 'center', gap: 1 }}>
                        <WarningAmberRounded sx={{ fontSize: 16, color: '#eab308' }} />
                        <Box>
                          <Typography sx={{ fontSize: '0.65rem', fontWeight: 600, color: '#eab308' }}>High concentration</Typography>
                          <Typography sx={{ fontSize: '0.6rem', color: 'text.secondary' }}>{concentrationData.warnings.join(' · ')}</Typography>
                        </Box>
                      </Box>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* ─── GROWTH ─── */}
              {activeSection === 'growth' && (
                <Card>
                  <CardContent sx={{ p: isMobile ? 2 : 2.5 }}>
                    <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, letterSpacing: '0.02em', mb: 1 }}>Growth Over Time</Typography>
                    {growthData.some((d) => d.value > 0 || d.invested > 0) ? (
                      <>
                        <ResponsiveContainer width="100%" height={isMobile ? 240 : 300}>
                          <LineChart data={growthData} margin={{ top: 5, right: 10, left: -15, bottom: 0 }}>
                            <CartesianGrid stroke={gridColor} strokeDasharray="3 3" vertical={false} />
                            <XAxis dataKey="label" tick={{ fontSize: 10, fill: axisColor }} axisLine={false} tickLine={false} />
                            <YAxis tick={{ fontSize: 10, fill: axisColor }} axisLine={false} tickLine={false} tickFormatter={(v) => v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${(v / 1e3).toFixed(0)}K` : v} />
                            <RTooltip content={<GrowthTooltip />} />
                            <Line type="monotone" dataKey="value" name="Current Value" stroke={totals.gainLoss >= 0 ? '#15803d' : '#b91c1c'} strokeWidth={2.5} dot={{ r: 3, fill: totals.gainLoss >= 0 ? '#15803d' : '#b91c1c' }} activeDot={{ r: 5, fill: totals.gainLoss >= 0 ? '#15803d' : '#b91c1c' }} />
                            <Line type="monotone" dataKey="invested" name="Invested" stroke={lineColorInvested} strokeWidth={1.5} strokeDasharray="4 4" dot={false} />
                          </LineChart>
                        </ResponsiveContainer>
                        <Box sx={{ display: 'flex', justifyContent: 'center', gap: 2, mt: 1 }}>
                          {[{ label: 'Current Value', style: { borderBottom: `2.5px solid ${totals.gainLoss >= 0 ? '#15803d' : '#b91c1c'}` } }, { label: 'Invested', style: { borderBottom: `1.5px dashed ${lineColorInvested}` } }].map((l) => (
                            <Box key={l.label} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                              <Box sx={{ width: 16, height: 0, ...l.style }} />
                              <Typography sx={{ fontSize: '0.6rem', color: 'text.secondary' }}>{l.label}</Typography>
                            </Box>
                          ))}
                        </Box>
                      </>
                    ) : (
                      <Box sx={{ height: 240, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Typography sx={{ fontSize: '0.78rem', color: 'text.secondary' }}>Add trades to see growth</Typography>
                      </Box>
                    )}
                  </CardContent>
                </Card>
              )}

            </motion.div>
          </AnimatePresence>
        </>
      )}
    </Box>
  );
}
