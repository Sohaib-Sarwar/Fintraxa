import { useState } from 'react';
import {
  Box, Card, CardContent, Typography, Grid, Skeleton, Alert,
  useMediaQuery, useTheme,
} from '@mui/material';
import {
  AccountBalanceWalletRounded,
  SavingsRounded,
  ShowChartRounded,
  PieChartRounded,
  InfoOutlined,
} from '@mui/icons-material';
import {
  PieChart, Pie, Cell, ResponsiveContainer, 
  LineChart, Line, XAxis, YAxis, Tooltip as RTooltip,
  CartesianGrid,
} from 'recharts';
import { motion } from 'framer-motion';
import { useAggregatedAssets } from './useAggregatedAssets';
import { formatCurrency } from '../../lib/formatters';
import { CountUp, Reveal } from '../../components/motion';
import { pieSector, makeOuterLabel, DonutCenter } from '../../components/charts';

const PIE_COLORS = ['#333333', '#666666', '#999999'];
const PIE_COLORS_DARK = ['#e5e5e5', '#a3a3a3', '#6b6b6b'];



/* Minimal custom tooltip for Growth charts */
function ChartTooltip({ active, payload, label }) {
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

/* Percentage + name, drawn around the ring while nothing is hovered. */
const renderOuterLabel = makeOuterLabel((p) => p.name);

export default function HomeDashboard() {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const isMobile = useMediaQuery('(max-width:768px)');
  const [activeIdx, setActiveIdx] = useState(-1);

  const {
    totalAssets, financeBalance, mfValue, stocksValue,
    pieData, growthData, isLoading,
    marketDataFailed, holdingsAtCost, fundsAtCost,
  } = useAggregatedAssets();

  /* `useAggregatedAssets` has always reported how trustworthy its valuation
     is — whether the market feed answered, and how many positions had to fall
     back to their purchase price. Nothing read it, so the dashboard presented
     a cost basis as a market value with no qualification. A holding priced at
     cost is not wrong, but it is not a valuation either, and in a finance app
     the difference belongs on screen. */
  const atCost = (holdingsAtCost || 0) + (fundsAtCost || 0);
  const valuationNote = marketDataFailed
    ? 'Live prices are unavailable right now — positions are valued at what you paid for them.'
    : atCost > 0
      ? `${atCost} position${atCost === 1 ? '' : 's'} had no published price today and ${atCost === 1 ? 'is' : 'are'} valued at cost.`
      : null;

  const colors = isDark ? PIE_COLORS_DARK : PIE_COLORS;

  /* `amount` is the raw number so the figure can spring up to it rather than
     appearing fully formed; `formatCurrency` still owns the display, including
     the conversion out of PKR. */
  const statCards = [
    { label: 'Total Assets', amount: totalAssets, icon: AccountBalanceWalletRounded, highlight: true },
    { label: 'Finance', amount: financeBalance, icon: SavingsRounded },
    { label: 'Mutual Funds', amount: mfValue, icon: PieChartRounded },
    { label: 'Stocks', amount: stocksValue, icon: ShowChartRounded },
  ];

  const lineColor = isDark ? '#e5e5e5' : '#222222';
  const gridColor = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
  const axisColor = isDark ? '#555' : '#aaa';

  if (isLoading) {
    return (
      <Box>
        <Skeleton variant="rounded" height={32} width={200} sx={{ mb: 3 }} />
        <Grid container spacing={1.5} sx={{ mb: 3 }}>
          {[1, 2, 3, 4].map((i) => (
            <Grid size={{ xs: 6, md: 3 }} key={i}>
              <Skeleton variant="rounded" height={100} />
            </Grid>
          ))}
        </Grid>
        <Skeleton variant="rounded" height={260} sx={{ mb: 3 }} />
        <Skeleton variant="rounded" height={220} />
      </Box>
    );
  }

  return (
    <Box sx={{ pb: isMobile ? 2 : 0 }}>
      {/* Title - only on desktop (mobile has logo in header) */}
      {!isMobile && (
        <Typography sx={{
          fontSize: '1.5rem', fontWeight: 800, letterSpacing: '-0.03em', mb: 3,
        }}>
          Dashboard
        </Typography>
      )}

      {valuationNote && (
        <Reveal distance={8} duration={0.3}>
          <Alert
            severity={marketDataFailed ? 'warning' : 'info'}
            icon={<InfoOutlined sx={{ fontSize: 18 }} />}
            sx={{ mb: 1.5, borderRadius: 2.5, fontSize: '0.74rem', py: 0.25, alignItems: 'center' }}
          >
            {valuationNote}
          </Alert>
        </Reveal>
      )}

      {/* ── Asset Summary Cards ── */}
      {isMobile ? (
        /* Mobile: merged 2×2 card */
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <Card sx={{ mb: 1.5, overflow: 'hidden', borderRadius: 3 }}>
            <CardContent sx={{ p: 0, '&:last-child': { pb: 0 } }}>
              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
                {statCards.map((s, i) => {
                  const Icon = s.icon;
                  return (
                    <Box key={i} sx={{
                      px: 1.75, py: 1.5,
                      borderRight: i % 2 === 0 ? `1px solid ${isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'}` : 'none',
                      borderBottom: i < 2 ? `1px solid ${isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'}` : 'none',
                      ...(s.highlight && {
                        bgcolor: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.015)',
                      }),
                    }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.6, mb: 0.4 }}>
                        <Icon sx={{ fontSize: 13, color: 'text.secondary', opacity: 0.6 }} />
                        <Typography sx={{
                          fontSize: '0.58rem', color: 'text.secondary',
                          fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase',
                        }}>
                          {s.label}
                        </Typography>
                      </Box>
                      <Typography sx={{
                        fontSize: s.highlight ? '1.15rem' : '1rem',
                        fontWeight: 700, color: 'text.primary', fontFeatureSettings: '"tnum"',
                        letterSpacing: '-0.02em',
                      }} className="currency">
                        <CountUp to={s.amount} format={formatCurrency} delay={i * 0.05} />
                      </Typography>
                    </Box>
                  );
                })}
              </Box>
            </CardContent>
          </Card>
        </motion.div>
      ) : (
        /* Desktop: 4 separate cards */
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
                        fontWeight: 700, color: 'text.primary', lineHeight: 1.1,
                        fontFeatureSettings: '"tnum"',
                      }} className="currency">
                        <CountUp to={s.amount} format={formatCurrency} delay={i * 0.05} />
                      </Typography>
                    </CardContent>
                  </Card>
                </motion.div>
              </Grid>
            );
          })}
        </Grid>
      )}

      {/* ── Charts Row ── */}
      <Grid container spacing={1.5} sx={{ mb: 2 }}>
        {/* Pie Chart - Asset Distribution */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Card sx={{ overflow: 'visible', height: '100%', borderRadius: 3 }}>
            <CardContent sx={{ p: isMobile ? 1.75 : 2.5 }}>
              <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.03em', mb: 0.5, textTransform: 'uppercase', color: 'text.secondary' }}>
                Asset Distribution
              </Typography>
              {pieData.length > 0 ? (
                <Box sx={{ position: 'relative' }}>
                  <ResponsiveContainer width="100%" height={isMobile ? 280 : 300}>
                    <PieChart>
                      <Pie
                        data={pieData} dataKey="value" cx="50%" cy="50%"
                        innerRadius={isMobile ? 55 : 68} outerRadius={isMobile ? 78 : 96}
                        paddingAngle={3} strokeWidth={0}
                        shape={pieSector}
                        label={activeIdx < 0 ? renderOuterLabel : false}
                        labelLine={false}
                        onMouseEnter={(_, i) => setActiveIdx(i)}
                        onMouseLeave={() => setActiveIdx(-1)}
                      >
                        {pieData.map((_, i) => (
                          <Cell key={i} fill={colors[i % colors.length]} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                  <DonutCenter
                    data={pieData}
                    activeIndex={activeIdx}
                    restingValue={formatCurrency(totalAssets)}
                    restingLabel="total assets"
                    format={formatCurrency}
                    width={isMobile ? 90 : 110}
                    compact={isMobile}
                  />
                </Box>
              ) : (
                <Box sx={{ height: 260, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Typography sx={{ fontSize: '0.78rem', color: 'text.secondary' }}>No data yet</Typography>
                </Box>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Growth Line Chart */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Card sx={{ height: '100%', borderRadius: 3 }}>
            <CardContent sx={{ p: isMobile ? 1.75 : 2.5 }}>
              <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.03em', mb: 0.5, textTransform: 'uppercase', color: 'text.secondary' }}>
                Growth Over Time
              </Typography>
              {growthData.some((d) => d.total > 0) ? (
                <ResponsiveContainer width="100%" height={isMobile ? 260 : 275}>
                  <LineChart data={growthData} margin={{ top: 5, right: 10, left: -15, bottom: 0 }}>
                    <CartesianGrid stroke={gridColor} strokeDasharray="3 3" vertical={false} />
                    <XAxis
                      dataKey="label" tick={{ fontSize: 10, fill: axisColor }}
                      axisLine={false} tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 10, fill: axisColor }}
                      axisLine={false} tickLine={false}
                      tickFormatter={(v) => {
                        if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
                        if (v >= 1e3) return `${(v / 1e3).toFixed(0)}K`;
                        return v;
                      }}
                    />
                    <RTooltip content={<ChartTooltip />} />
                    <Line
                      type="monotone" dataKey="total" name="Total"
                      stroke={lineColor} strokeWidth={2.5}
                      dot={{ r: 3, fill: lineColor }}
                      activeDot={{ r: 5, fill: lineColor }}
                    />
                    <Line
                      type="monotone" dataKey="finance" name="Finance"
                      stroke={isDark ? '#aaa' : '#555'} strokeWidth={1.5}
                      strokeDasharray="4 4" dot={false}
                    />
                    <Line
                      type="monotone" dataKey="mf" name="Mutual Funds"
                      stroke={isDark ? '#777' : '#888'} strokeWidth={1.5}
                      strokeDasharray="6 3" dot={false}
                    />
                    <Line
                      type="monotone" dataKey="stocks" name="Stocks"
                      stroke={isDark ? '#555' : '#bbb'} strokeWidth={1.5}
                      strokeDasharray="2 2" dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <Box sx={{ height: 260, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Typography sx={{ fontSize: '0.78rem', color: 'text.secondary' }}>
                    Add transactions to see growth trends
                  </Typography>
                </Box>
              )}
              {/* Chart legend */}
              <Box sx={{ display: 'flex', justifyContent: 'center', gap: 2, mt: 1 }}>
                {[
                  { label: 'Total', style: { borderBottom: `2.5px solid ${lineColor}` } },
                  { label: 'Finance', style: { borderBottom: `1.5px dashed ${isDark ? '#aaa' : '#555'}` } },
                  { label: 'MF', style: { borderBottom: `1.5px dashed ${isDark ? '#777' : '#888'}` } },
                  { label: 'Stocks', style: { borderBottom: `1.5px dotted ${isDark ? '#555' : '#bbb'}` } },
                ].map((l) => (
                  <Box key={l.label} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <Box sx={{ width: 16, height: 0, ...l.style }} />
                    <Typography sx={{ fontSize: '0.6rem', color: 'text.secondary' }}>{l.label}</Typography>
                  </Box>
                ))}
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}
