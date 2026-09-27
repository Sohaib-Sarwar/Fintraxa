import { useMemo, useState } from 'react';
import {
  Box, Card, CardContent, Typography, Grid, Skeleton, Chip, useTheme, useMediaQuery,
} from '@mui/material';
import {
  SavingsRounded, PieChartRounded, ShowChartRounded,
  TrendingUpRounded, TrendingDownRounded,
} from '@mui/icons-material';
import { PieChart, Pie, Cell, Sector, ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip } from 'recharts';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { supabase } from '../../lib/supabase';
import { mufapFundsQuery, fundPriceMap } from '../../lib/marketQueries';
import { useAuthStore } from '../../store/authStore';
import { formatCurrency, formatNumber, getPnLColor, formatPercent, shortFundName } from '../../lib/formatters';
import { subMonths, format } from 'date-fns';

/* ─── Profit / Loss color palettes ─── */
const profitColors = ['#22c55e', '#4ade80', '#86efac', '#bbf7d0'];
const lossColors = ['#ef4444', '#f87171', '#fca5a5', '#fecaca'];

/* ─── Active shape — colorful donut (image reference style) ─── */
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

/* ─── Outer labels with percentage + name (responsive for mobile) ─── */
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

export default function MFAnalytics() {
  const user = useAuthStore((s) => s.user);
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const isMobile = useMediaQuery('(max-width:768px)');
  const [activeIdx, setActiveIdx] = useState(-1);
  const [catActiveIdx, setCatActiveIdx] = useState(-1);

  /* Transactions */
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

  /* API prices */
  const { data: apiFundsData } = useQuery(mufapFundsQuery());

  const { allocationData, gainLossData, categoryData, totals } = useMemo(() => {
    const priceMap = fundPriceMap(apiFundsData);

    const fundMap = {};
    transactions.forEach((t) => {
      if (!fundMap[t.fund_id]) fundMap[t.fund_id] = { fundId: t.fund_id, fundName: t.fund_name, fundCategory: t.fund_category, totalUnits: 0, totalInvested: 0, latestNav: t.nav };
      const f = fundMap[t.fund_id];
      if (t.type === 'buy') { f.totalUnits += Number(t.units); f.totalInvested += Number(t.investment_amount); }
      else {
        const units = Number(t.units);
        const costBasis = f.totalUnits > 0 ? (f.totalInvested / f.totalUnits) * units : 0;
        f.totalUnits -= units; f.totalInvested -= costBasis;
      }
    });

    const holdings = Object.values(fundMap).filter((f) => f.totalUnits > 0);
    let totalInvested = 0, totalCurrentValue = 0;
    holdings.forEach((f) => {
      const rp = priceMap[f.fundName] || f.latestNav;
      totalInvested += f.totalInvested;
      totalCurrentValue += f.totalUnits * rp;
    });

    /* Fund allocation — assign green gradient for profit, red for loss */
    const allocationRaw = holdings.map((f) => {
      const rp = priceMap[f.fundName] || f.latestNav;
      const currentValue = f.totalUnits * rp;
      const gl = currentValue - f.totalInvested;
      return { name: f.fundName, shortName: shortFundName(f.fundName), value: Math.round(currentValue), gainLoss: gl };
    }).sort((a, b) => b.value - a.value);

    let profitIdx = 0, lossIdx = 0;
    const allocationData = allocationRaw.map((d) => {
      const color = d.gainLoss >= 0
        ? profitColors[profitIdx++ % profitColors.length]
        : lossColors[lossIdx++ % lossColors.length];
      return { ...d, color };
    });

    /* Gain/Loss bar */
    const gainLossData = holdings.map((f) => {
      const rp = priceMap[f.fundName] || f.latestNav;
      const currentValue = f.totalUnits * rp;
      const gl = currentValue - f.totalInvested;
      const pct = f.totalInvested > 0 ? (gl / f.totalInvested) * 100 : 0;
      return {
        name: shortFundName(f.fundName),
        fullName: f.fundName,
        gainLoss: Math.round(gl),
        pct,
        fill: gl >= 0 ? '#22c55e' : '#ef4444',
      };
    }).sort((a, b) => b.gainLoss - a.gainLoss);

    /* Category breakdown */
    const catMap = {};
    holdings.forEach((f) => {
      const cat = f.fundCategory || 'Other';
      const rp = priceMap[f.fundName] || f.latestNav;
      const val = Math.round(f.totalUnits * rp);
      const gl = val - f.totalInvested;
      if (!catMap[cat]) catMap[cat] = { name: cat, value: 0, gainLoss: 0 };
      catMap[cat].value += val;
      catMap[cat].gainLoss += gl;
    });
    let catProfitIdx = 0, catLossIdx = 0;
    const categoryData = Object.values(catMap).sort((a, b) => b.value - a.value)
      .map((d) => ({
        ...d,
        color: d.gainLoss >= 0
          ? profitColors[catProfitIdx++ % profitColors.length]
          : lossColors[catLossIdx++ % lossColors.length],
      }));

    return {
      allocationData, gainLossData, categoryData,
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
    let cumInvested = 0;
    const investedByMonth = {};
    const sorted = [...transactions].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    sorted.forEach((t) => {
      cumInvested += t.type === 'buy' ? Number(t.investment_amount) : -Number(t.investment_amount);
      investedByMonth[t.date?.slice(0, 7)] = cumInvested;
    });
    const fc = {};
    const snapshots = {};
    const allMonths = [...new Set(sorted.map((t) => t.date?.slice(0, 7)))].sort();
    allMonths.forEach((m) => {
      sorted.filter((t) => t.date?.slice(0, 7) === m).forEach((t) => {
        if (!fc[t.fund_id]) fc[t.fund_id] = { units: 0, nav: t.nav };
        fc[t.fund_id].nav = t.nav;
        fc[t.fund_id].units += t.type === 'buy' ? Number(t.units) : -Number(t.units);
      });
      snapshots[m] = Object.values(fc).reduce((sum, f) => sum + (f.units > 0 ? f.units * f.nav : 0), 0);
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

  /* ─── Stat cards (same as Dashboard) ─── */
  const pnlColor = totals.gainLoss >= 0 ? '#15803d' : '#b91c1c';
  const statCards = [
    { label: 'Invested', value: formatCurrency(totals.invested), icon: SavingsRounded },
    { label: 'Current', value: formatCurrency(totals.currentValue), icon: PieChartRounded },
    { label: 'P&L', value: formatCurrency(totals.gainLoss), icon: totals.gainLoss >= 0 ? TrendingUpRounded : TrendingDownRounded, highlight: true, color: pnlColor },
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
      <Typography sx={{ fontSize: '1.5rem', fontWeight: 800, letterSpacing: '-0.03em', mb: 3 }}>
        Fund Analytics
      </Typography>

      {allocationData.length === 0 ? (
        <Card sx={{ p: 5, textAlign: 'center' }}>
          <Typography color="text.secondary">No fund holdings to analyze</Typography>
        </Card>
      ) : (
        <>
          {/* ── Stat Cards (Dashboard style) ── */}
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

          {/* ── Fund Allocation Donut (image reference style) ── */}
          <Card sx={{ mb: 2.5, overflow: 'visible' }}>
            <CardContent sx={{ p: isMobile ? 2 : 2.5 }}>
              <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, letterSpacing: '0.02em', mb: 1 }}>
                Fund Allocation
              </Typography>
              <Box sx={{ position: 'relative' }}>
                <ResponsiveContainer width="100%" height={isMobile ? 280 : 300}>
                  <PieChart>
                    <Pie data={allocationData} dataKey="value" cx="50%" cy="50%"
                      innerRadius={isMobile ? 55 : 68} outerRadius={isMobile ? 78 : 96}
                      paddingAngle={4} strokeWidth={0}
                      activeIndex={activeIdx} activeShape={renderActive}
                      label={activeIdx < 0 ? renderOuterLabel : false}
                      labelLine={false}
                      onMouseEnter={(_, i) => setActiveIdx(i)}
                      onMouseLeave={() => setActiveIdx(-1)}>
                      {allocationData.map((d, i) => <Cell key={i} fill={d.color} />)}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                {activeIdx < 0 && (
                  <Box sx={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center', pointerEvents: 'none', width: isMobile ? 90 : 115 }}>
                    <Typography sx={{ fontSize: isMobile ? '0.85rem' : '1.1rem', fontWeight: 700, color: 'text.primary', lineHeight: 1.2 }}>{formatCurrency(totals.currentValue)}</Typography>
                    <Typography sx={{ fontSize: '0.55rem', color: 'text.secondary', mt: 0.25 }}>portfolio</Typography>
                  </Box>
                )}
              </Box>
            </CardContent>
          </Card>

          {/* ── Growth Over Time (mobile only) ── */}
          {isMobile && (
            <Card sx={{ mb: 2.5 }}>
              <CardContent sx={{ p: 2 }}>
                <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, letterSpacing: '0.02em', mb: 1 }}>
                  Growth Over Time
                </Typography>
                {growthData.some((d) => d.value > 0 || d.invested > 0) ? (
                  <>
                    <ResponsiveContainer width="100%" height={220}>
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
                  <Box sx={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Typography sx={{ fontSize: '0.78rem', color: 'text.secondary' }}>Add transactions to see growth</Typography>
                  </Box>
                )}
              </CardContent>
            </Card>
          )}

          {/* ── By Category Donut ── */}
          {categoryData.length > 1 && (
            <Card sx={{ mb: 2.5, overflow: 'visible' }}>
              <CardContent sx={{ p: isMobile ? 2 : 2.5 }}>
                <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, letterSpacing: '0.02em', mb: 1 }}>
                  By Category
                </Typography>
                <Box sx={{ position: 'relative' }}>
                  <ResponsiveContainer width="100%" height={isMobile ? 280 : 300}>
                    <PieChart>
                      <Pie data={categoryData} dataKey="value" cx="50%" cy="50%"
                        innerRadius={isMobile ? 55 : 68} outerRadius={isMobile ? 78 : 96}
                        paddingAngle={4} strokeWidth={0}
                        activeIndex={catActiveIdx} activeShape={renderActive}
                        label={catActiveIdx < 0 ? renderOuterLabel : false}
                        labelLine={false}
                        onMouseEnter={(_, i) => setCatActiveIdx(i)}
                        onMouseLeave={() => setCatActiveIdx(-1)}>
                        {categoryData.map((d, i) => <Cell key={i} fill={d.color} />)}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                  {catActiveIdx < 0 && (
                    <Box sx={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center', pointerEvents: 'none' }}>
                      <Typography sx={{ fontSize: '0.85rem', fontWeight: 700, color: 'text.primary' }}>{categoryData.length}</Typography>
                      <Typography sx={{ fontSize: '0.55rem', color: 'text.secondary' }}>categories</Typography>
                    </Box>
                  )}
                </Box>
              </CardContent>
            </Card>
          )}

          {/* ── Gain / Loss by Fund (with relative fill bars) ── */}
          <Card>
            <CardContent sx={{ p: isMobile ? 2 : 2.5 }}>
              <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, letterSpacing: '0.02em', mb: 2 }}>
                Gain / Loss by Fund
              </Typography>
              {(() => {
                const maxAbs = Math.max(...gainLossData.map((d) => Math.abs(d.gainLoss)), 1);
                return (
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                    {gainLossData.map((d, i) => {
                      const isProfit = d.gainLoss >= 0;
                      const accentColor = isProfit ? '#22c55e' : '#ef4444';
                      const bgTint = isProfit
                        ? (isDark ? 'rgba(34,197,94,0.06)' : 'rgba(34,197,94,0.04)')
                        : (isDark ? 'rgba(239,68,68,0.06)' : 'rgba(239,68,68,0.04)');
                      const barWidth = Math.max((Math.abs(d.gainLoss) / maxAbs) * 100, 3);
                      return (
                        <motion.div key={d.name} initial={{ opacity: 0, x: isProfit ? 10 : -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.04 }}>
                          <Box sx={{
                            p: 1.5, borderRadius: 2.5,
                            bgcolor: bgTint,
                            borderLeft: `3px solid ${accentColor}`,
                            transition: 'transform 0.15s ease',
                            '&:hover': { transform: 'translateX(4px)' },
                            position: 'relative',
                            overflow: 'hidden',
                          }}>
                            {/* Fill bar background */}
                            <Box sx={{
                              position: 'absolute', top: 0, left: 0, bottom: 0,
                              width: `${barWidth}%`,
                              bgcolor: isProfit
                                ? (isDark ? 'rgba(34,197,94,0.08)' : 'rgba(34,197,94,0.07)')
                                : (isDark ? 'rgba(239,68,68,0.08)' : 'rgba(239,68,68,0.07)'),
                              borderRadius: 2.5,
                              transition: 'width 0.6s ease',
                            }} />
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, position: 'relative', zIndex: 1 }}>
                              <Box sx={{
                                width: 36, height: 36, borderRadius: '50%',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                bgcolor: `${accentColor}14`,
                                border: `2px solid ${accentColor}30`,
                                fontWeight: 800, fontSize: 9, color: accentColor, flexShrink: 0,
                              }}>
                                {d.name}
                              </Box>
                              <Box sx={{ flex: 1, minWidth: 0 }}>
                                <Typography sx={{ fontSize: '0.75rem', fontWeight: 600 }} noWrap>
                                  {d.fullName}
                                </Typography>
                                <Typography sx={{ fontSize: '0.85rem', fontWeight: 700, color: accentColor, fontFeatureSettings: '"tnum"' }} className="currency">
                                  {isProfit ? '+' : ''}{formatCurrency(d.gainLoss)}
                                </Typography>
                              </Box>
                              <Chip
                                size="small"
                                label={formatPercent(d.pct)}
                                sx={{
                                  fontWeight: 700, fontSize: '0.62rem', height: 24,
                                  bgcolor: `${accentColor}14`, color: accentColor,
                                  border: `1px solid ${accentColor}30`,
                                }}
                              />
                            </Box>
                          </Box>
                        </motion.div>
                      );
                    })}
                  </Box>
                );
              })()}
            </CardContent>
          </Card>
        </>
      )}
    </Box>
  );
}
