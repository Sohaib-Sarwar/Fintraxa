import { useMemo, useState } from 'react';
import { Box, Card, CardContent, Typography, Grid, Skeleton, Chip, useMediaQuery, useTheme } from '@mui/material';
import {
  AccountBalanceWalletRounded, ShowChartRounded,
  TrendingUpRounded, TrendingDownRounded, Wallet,
  SavingsRounded, PieChartRounded,
} from '@mui/icons-material';
import { PieChart, Pie, Cell, Sector, ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip } from 'recharts';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { supabase } from '../../lib/supabase';
import { mufapFundsQuery, fundPriceMap } from '../../lib/marketQueries';
import { useAuthStore } from '../../store/authStore';
import { formatCurrency, formatPercent, getPnLColor, formatNumber, shortFundName } from '../../lib/formatters';
import { subMonths, format } from 'date-fns';
/* Profit / Loss color palettes for pie chart */
const profitColors = ['#22c55e', '#4ade80', '#86efac', '#bbf7d0'];
const lossColors = ['#ef4444', '#f87171', '#fca5a5', '#fecaca'];

/* Active shape — colorful donut style */
const renderActive = (props) => {
  const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill, payload, percent, value } = props;
  return (
    <g>
      <text x={cx} y={cy - 14} textAnchor="middle" fontSize={11} fontWeight={600} fill={fill}>
        {payload.shortName || payload.name}
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

/* Outer labels with percentage + short name (responsive) */
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
        {payload.shortName || payload.name}
      </text>
    </g>
  );
};

/* Minimal tooltip for growth chart */
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

export default function MFDashboard() {
  const user = useAuthStore((s) => s.user);
  const isMobile = useMediaQuery('(max-width:768px)');
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const [activeIdx, setActiveIdx] = useState(-1);

  const { data: transactions = [], isLoading } = useQuery({
    queryKey: ['mf-transactions', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('mutual_fund_transactions').select('*')
        .eq('user_id', user.id).order('date', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const { data: apiFundsData } = useQuery(mufapFundsQuery());

  const { data: freeCashData } = useQuery({
    queryKey: ['mf-free-cash', user?.id],
    queryFn: async () => {
      const { data: cats } = await supabase.from('categories').select('id').ilike('name', '%Investment - Mutual Funds%');
      const catIds = (cats || []).map((c) => c.id);
      let deposited = 0;
      if (catIds.length > 0) {
        const { data: txns } = await supabase.from('income_expense_transactions')
          .select('amount').eq('user_id', user.id).eq('type', 'debit').in('category_id', catIds);
        deposited = (txns || []).reduce((s, t) => s + Number(t.amount), 0);
      }
      const { data: mfTxns } = await supabase.from('mutual_fund_transactions')
        .select('investment_amount, type').eq('user_id', user.id);
      let bought = 0, sold = 0;
      (mfTxns || []).forEach((t) => { if (t.type === 'buy') bought += Number(t.investment_amount); else sold += Number(t.investment_amount); });
      return { deposited, bought, sold, freeCash: deposited - bought + sold };
    },
    enabled: !!user,
  });

  const freeCash = freeCashData?.freeCash ?? 0;

  const { funds, totals, priceMap, pieData } = useMemo(() => {
    const priceMap = fundPriceMap(apiFundsData);

    const fundMap = {};
    transactions.forEach((t) => {
      if (!fundMap[t.fund_id]) fundMap[t.fund_id] = { fundId: t.fund_id, fundName: t.fund_name, fundCategory: t.fund_category, totalUnits: 0, totalInvested: 0, totalBuyUnits: 0, totalBuyCost: 0, latestNav: t.nav };
      const f = fundMap[t.fund_id];
      if (t.type === 'buy') {
        f.totalUnits += Number(t.units);
        f.totalInvested += Number(t.investment_amount);
        f.totalBuyUnits += Number(t.units);
        f.totalBuyCost += Number(t.investment_amount);
      } else {
        const units = Number(t.units);
        const costBasis = f.totalUnits > 0 ? (f.totalInvested / f.totalUnits) * units : 0;
        f.totalUnits -= units;
        f.totalInvested -= costBasis;
      }
    });

    const funds = Object.values(fundMap).filter((f) => f.totalUnits > 0)
      .map((f) => ({
        ...f,
        avgOfferPrice: f.totalBuyUnits > 0 ? f.totalBuyCost / f.totalBuyUnits : 0,
      }));

    let totalInvested = 0, totalCurrentValue = 0;
    funds.forEach((f) => {
      const repPrice = priceMap[f.fundName] || f.latestNav;
      totalInvested += f.totalInvested;
      totalCurrentValue += f.totalUnits * repPrice;
    });

    const pieData = funds.map((f) => {
      const repPrice = priceMap[f.fundName] || f.latestNav;
      const currentValue = Math.round(f.totalUnits * repPrice);
      const gl = currentValue - f.totalInvested;
      return { name: f.fundName, shortName: shortFundName(f.fundName), value: currentValue, gainLoss: gl };
    });

    /* Assign green for profit, red for loss */
    let profitIdx = 0, lossIdx = 0;
    pieData.forEach((d) => {
      d.color = d.gainLoss >= 0
        ? profitColors[profitIdx++ % profitColors.length]
        : lossColors[lossIdx++ % lossColors.length];
    });

    return {
      funds, priceMap, pieData,
      totals: {
        invested: totalInvested, currentValue: totalCurrentValue,
        gainLoss: totalCurrentValue - totalInvested,
        gainPct: totalInvested > 0 ? ((totalCurrentValue - totalInvested) / totalInvested) * 100 : 0,
      },
    };
  }, [transactions, apiFundsData]);

  /* ── Monthly growth data (last 6 months) ── */
  const growthData = useMemo(() => {
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const d = subMonths(new Date(), i);
      months.push({ key: format(d, 'yyyy-MM'), label: format(d, 'MMM'), invested: 0, value: 0 });
    }

    // Cumulative invested by month
    let cumInvested = 0;
    const investedByMonth = {};
    const sorted = [...transactions].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    sorted.forEach((t) => {
      cumInvested += t.type === 'buy' ? Number(t.investment_amount) : -Number(t.investment_amount);
      investedByMonth[t.date?.slice(0, 7)] = cumInvested;
    });

    // Build cumulative snapshots per month
    const snapshots = {};
    const fc = {};
    const allMonths = [...new Set(sorted.map((t) => t.date?.slice(0, 7)))].sort();
    allMonths.forEach((m) => {
      sorted.filter((t) => t.date?.slice(0, 7) === m).forEach((t) => {
        if (!fc[t.fund_id]) fc[t.fund_id] = { units: 0, name: t.fund_name, nav: t.nav };
        fc[t.fund_id].nav = t.nav;
        fc[t.fund_id].units += t.type === 'buy' ? Number(t.units) : -Number(t.units);
      });
      snapshots[m] = Object.values(fc).reduce((sum, f) => sum + (f.units > 0 ? f.units * f.nav : 0), 0);
    });

    // Fill months
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
  const lineColorValue = isDark ? '#e5e5e5' : '#222';
  const gridColor = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
  const axisColor = isDark ? '#555' : '#aaa';

  const pnlColor = totals.gainLoss >= 0 ? '#15803d' : '#b91c1c';
  const statCards = [
    { label: 'Invested', value: formatCurrency(totals.invested), icon: SavingsRounded },
    { label: 'Current Value', value: formatCurrency(totals.currentValue), icon: PieChartRounded, highlight: true },
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
      <Typography sx={{ fontSize: isMobile ? '1.2rem' : '1.5rem', fontWeight: 800, letterSpacing: '-0.03em', mb: isMobile ? 2 : 3 }}>
        Mutual Funds
      </Typography>

      {/* ── Stat Cards (Home Dashboard style) ── */}
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
                        <Typography sx={{
                          fontSize: '0.62rem', color: 'text.secondary',
                          fontWeight: 500, letterSpacing: '0.04em', textTransform: 'uppercase',
                        }}>
                          {s.label}
                        </Typography>
                      </Box>
                      <Typography sx={{
                        fontSize: s.highlight ? '1.1rem' : '0.95rem',
                        fontWeight: 700, color: s.color || 'text.primary', fontFeatureSettings: '"tnum"',
                      }} className="currency">
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
                    '&:hover': {
                      transform: 'translateY(-2px)',
                      boxShadow: isDark
                        ? '0 8px 24px rgba(255,255,255,0.04)'
                        : '0 8px 24px rgba(0,0,0,0.08)',
                    },
                    ...(s.highlight && {
                      bgcolor: isDark ? '#111' : '#fafafa',
                      border: `1.5px solid ${isDark ? '#333' : '#d4d4d4'}`,
                    }),
                  }}>
                    <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                        <Typography sx={{
                          fontSize: '0.68rem', color: 'text.secondary', fontWeight: 500,
                          letterSpacing: '0.04em', textTransform: 'uppercase',
                        }}>
                          {s.label}
                        </Typography>
                        <Box sx={{
                          width: 32, height: 32, borderRadius: '10px',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          bgcolor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
                        }}>
                          <Icon sx={{ fontSize: 16, color: 'text.secondary' }} />
                        </Box>
                      </Box>
                      <Typography sx={{
                        fontSize: s.highlight ? '1.4rem' : '1.2rem',
                        fontWeight: 700, color: s.color || 'text.primary', lineHeight: 1.1,
                        fontFeatureSettings: '"tnum"',
                      }} className="currency">
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

      {/* Portfolio Donut + Growth Chart */}
      {pieData.length > 0 && (
        <Grid container spacing={isMobile ? 1.5 : 2} sx={{ mb: isMobile ? 2 : 3 }}>
          {/* Pie chart */}
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
                      <Typography sx={{ fontSize: '0.78rem', color: 'text.secondary' }}>Add transactions to see growth</Typography>
                    </Box>
                  )}
                </CardContent>
              </Card>
            </Grid>
          )}
        </Grid>
      )}

      {/* Holdings */}
      <Typography sx={{ fontSize: isMobile ? '0.7rem' : '0.75rem', fontWeight: 600, letterSpacing: '0.02em', mb: 1 }}>Holdings ({funds.length})</Typography>
      {funds.length === 0 ? (
        <Card sx={{ p: 4, textAlign: 'center' }}>
          <Typography color="text.secondary" variant="body2">No holdings yet</Typography>
        </Card>
      ) : (
        funds.map((fund, fi) => {
          const repPrice = priceMap[fund.fundName] || fund.latestNav;
          const currentValue = fund.totalUnits * repPrice;
          const gainLoss = currentValue - fund.totalInvested;
          const gainPct = fund.totalInvested > 0 ? (gainLoss / fund.totalInvested) * 100 : 0;
          const color = getPnLColor(gainLoss);
          return (
            <motion.div key={fund.fundId} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: fi * 0.04 }}>
              <Card sx={{ mb: isMobile ? 1 : 1.5 }}>
                <CardContent sx={{ p: isMobile ? 1.5 : 2, '&:last-child': { pb: isMobile ? 1.5 : 2 } }}>
                  {/* Fund name row */}
                  <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: 1.5 }}>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography sx={{ fontSize: '0.82rem', fontWeight: 700, lineHeight: 1.3 }}>{fund.fundName}</Typography>
                      <Typography sx={{ fontSize: '0.65rem', color: 'text.secondary', mt: 0.25 }}>{formatNumber(fund.totalUnits, 4)} units</Typography>
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
                      <Typography sx={{ fontSize: '0.82rem', fontWeight: 700, fontFeatureSettings: '"tnum"' }} className="currency">{formatCurrency(fund.totalInvested)}</Typography>
                    </Box>
                    <Box>
                      <Typography sx={{ fontSize: '0.58rem', color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.03em', fontWeight: 500 }}>Current Value</Typography>
                      <Typography sx={{ fontSize: '0.82rem', fontWeight: 700, color, fontFeatureSettings: '"tnum"' }} className="currency">{formatCurrency(currentValue)}</Typography>
                    </Box>
                    <Box>
                      <Typography sx={{ fontSize: '0.58rem', color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.03em', fontWeight: 500 }}>Avg Purchase Price</Typography>
                      <Typography sx={{ fontSize: '0.82rem', fontWeight: 700, fontFeatureSettings: '"tnum"' }}>{formatNumber(fund.avgOfferPrice, 4)}</Typography>
                    </Box>
                    <Box>
                      <Typography sx={{ fontSize: '0.58rem', color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.03em', fontWeight: 500 }}>Current Repurchase</Typography>
                      <Typography sx={{ fontSize: '0.82rem', fontWeight: 700, fontFeatureSettings: '"tnum"' }}>{formatNumber(repPrice, 4)}</Typography>
                    </Box>
                  </Box>
                </CardContent>
              </Card>
            </motion.div>
          );
        })
      )}
    </Box>
  );
}
