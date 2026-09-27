import { useState, useMemo } from 'react';
import {
  Box, Typography, Card, CardContent, TextField, InputAdornment, Button,
  Chip, Autocomplete, Slider, LinearProgress, Collapse, useTheme, useMediaQuery, alpha,
} from '@mui/material';
import {
  CalculateRounded, SearchRounded, TrendingUpRounded,
  SavingsRounded, FilterListRounded, ExpandMoreRounded,
  StarRounded, FunctionsRounded, SpeedRounded, GppGoodRounded,
  BalanceRounded, RocketLaunchRounded, SquareFootRounded,
  BarChartRounded, PaidRounded, BoltRounded,
} from '@mui/icons-material';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { psxStocksQuery, stockPriceMap } from '../../lib/marketQueries';
import { getAllResearchStocks, getResearchStock, MACRO, BUCKETS } from '../../data/psxResearch';
import {
  grahamNumber, pegRatio, ddmValue, epv, relativePE,
  dividendSafety, valueScore, overallRating, valuationTag,
} from '../../lib/psxAnalysis';
import { formatNumber } from '../../lib/formatters';
import StockLogo from '../../components/StockLogo';
import { getStockName } from '../../lib/stockMeta';

const CGT_RATE = 0.30;

const TOOL_TABS = [
  { key: 'analyzer', label: 'Analyzer', icon: <SpeedRounded sx={{ fontSize: 15 }} /> },
  { key: 'invest', label: 'Invest', icon: <SavingsRounded sx={{ fontSize: 15 }} /> },
  { key: 'calculator', label: 'Formulas', icon: <FunctionsRounded sx={{ fontSize: 15 }} /> },
  { key: 'screener', label: 'Screener', icon: <FilterListRounded sx={{ fontSize: 15 }} /> },
];

/* shared hook — live prices */
function useLivePrices() {
  const { data } = useQuery(psxStocksQuery());
  return useMemo(() => stockPriceMap(data), [data]);
}

/* ─── Score Gauge Ring ─── */
function ScoreGauge({ value, size = 56, stroke = 5, color }) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (value / 100) * circ;
  return (
    <Box sx={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeWidth={stroke} opacity={0.08} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke}
          strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.6s ease' }} />
      </svg>
      <Box sx={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Typography sx={{ fontSize: size * 0.26, fontWeight: 800, color, lineHeight: 1 }}>{value}</Typography>
      </Box>
    </Box>
  );
}

/* ─── Metric Pill ─── */
function MetricPill({ label, value, color }) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  return (
    <Box sx={{
      display: 'flex', flexDirection: 'column', px: 1.2, py: 0.7, borderRadius: 2,
      bgcolor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.025)',
    }}>
      <Typography sx={{ fontSize: '0.55rem', color: 'text.secondary', lineHeight: 1.2 }}>{label}</Typography>
      <Typography sx={{ fontSize: '0.78rem', fontWeight: 700, color: color || 'text.primary', lineHeight: 1.2 }}>{value}</Typography>
    </Box>
  );
}

export default function Tools() {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const isMobile = useMediaQuery('(max-width:768px)');
  const [activeTool, setActiveTool] = useState('analyzer');

  return (
    <Box sx={{ pb: 4 }}>
      {/* Segmented Tab Bar */}
      <Box sx={{
        display: 'flex', gap: 0.5, p: 0.4, mb: 2,
        borderRadius: 2.5, bgcolor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)',
      }}>
        {TOOL_TABS.map((t) => {
          const active = activeTool === t.key;
          return (
            <Box key={t.key} onClick={() => setActiveTool(t.key)} sx={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.4,
              py: 0.8, borderRadius: 2, cursor: 'pointer', transition: 'all 0.2s',
              bgcolor: active ? (isDark ? '#fff' : '#111') : 'transparent',
              color: active ? (isDark ? '#000' : '#fff') : 'text.secondary',
              boxShadow: active ? (isDark ? 'none' : '0 1px 3px rgba(0,0,0,0.08)') : 'none',
              '&:hover': { bgcolor: active ? undefined : (isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)') },
            }}>
              {t.icon}
              <Typography sx={{ fontSize: '0.68rem', fontWeight: active ? 700 : 500, lineHeight: 1 }}>{t.label}</Typography>
            </Box>
          );
        })}
      </Box>

      <AnimatePresence mode="wait">
        <motion.div key={activeTool} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.22, ease: 'easeOut' }}>
          {activeTool === 'analyzer' && <StockAnalyzer />}
          {activeTool === 'invest' && <InvestCalculator />}
          {activeTool === 'calculator' && <Calculators />}
          {activeTool === 'screener' && <Screener />}
        </motion.div>
      </AnimatePresence>
    </Box>
  );
}

/* ═══════════════════════════════════════════════
   STOCK ANALYZER
   ═══════════════════════════════════════════════ */
function StockAnalyzer() {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const allStocks = useMemo(() => getAllResearchStocks(), []);
  const [selected, setSelected] = useState(null);
  const [openSections, setOpenSections] = useState({ valuation: true, quality: true, technical: false });
  const livePriceMap = useLivePrices();

  const toggle = (k) => setOpenSections((p) => ({ ...p, [k]: !p[k] }));

  const analysis = useMemo(() => {
    if (!selected) return null;
    const stock = getResearchStock(selected.symbol);
    if (!stock) return null;
    const live = livePriceMap[stock.symbol];
    const price = live?.current || stock.price;
    const gn = grahamNumber(stock.eps, stock.bv);
    const peg = pegRatio(stock.pe, stock.revGr);
    const ddm = ddmValue(price, stock.divYield, Math.min(stock.revGr || 5, 20), MACRO.pib_5yr);
    const epvVal = epv(stock.eps, MACRO.pib_5yr);
    const rpe = relativePE(stock.pe, stock.sectorAvgPE);
    const ds = dividendSafety(stock.divYield, stock.payout, stock.roe);
    const vs = valueScore({ ...stock, price, sectorAvgPE: stock.sectorAvgPE });
    const rating = overallRating(vs);
    const vTag = valuationTag(price, stock.fvPE, stock.isTrap);
    const fairValues = [stock.fvPE, stock.fvBV, stock.fvDDM, gn, ddm, epvVal].filter((v) => v && v > 0);
    const fairAvg = fairValues.length > 0 ? fairValues.reduce((a, b) => a + b, 0) / fairValues.length : null;
    const upside = fairAvg ? ((fairAvg - price) / price * 100) : null;
    return { ...stock, price, live, gn, peg, ddm, epvVal, rpe, ds, vs, rating, vTag, fairAvg, upside, sectorName: stock.sectorName };
  }, [selected, livePriceMap]);

  const cardSx = { borderRadius: 3, border: `1px solid ${theme.palette.divider}`, bgcolor: isDark ? 'rgba(255,255,255,0.02)' : '#fff' };

  // A plain render function, not a component declared in the render body.
  // Declared as a component it got a fresh identity every render, so React
  // tore down and rebuilt the whole header subtree on each pass instead of
  // reconciling it. Calling it directly keeps the JSX inline where it belongs.
  const sectionHeader = ({ title, sectionKey, icon }) => (
    <Box onClick={() => toggle(sectionKey)} sx={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer',
      px: 2, py: 1.2, borderBottom: openSections[sectionKey] ? `1px solid ${theme.palette.divider}` : 'none',
    }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
        <Box sx={{ color: isDark ? '#fff' : '#111', display: 'flex' }}>{icon}</Box>
        <Typography sx={{ fontSize: '0.75rem', fontWeight: 700 }}>{title}</Typography>
      </Box>
      <ExpandMoreRounded sx={{
        fontSize: 18, color: 'text.secondary', transition: 'transform 0.2s',
        transform: openSections[sectionKey] ? 'rotate(180deg)' : 'rotate(0deg)',
      }} />
    </Box>
  );

  return (
    <Box>
      {/* Search */}
      <Autocomplete
        options={allStocks}
        getOptionLabel={(o) => `${o.symbol} — ${o.name}`}
        onChange={(_, v) => setSelected(v)}
        size="small"
        renderOption={(props, opt) => (
          <Box component="li" {...props} sx={{ display: 'flex', alignItems: 'center', gap: 1.25, width: '100%', py: 1 }}>
            <StockLogo symbol={opt.symbol} size="md" />
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                <Typography sx={{ fontSize: '0.82rem', fontWeight: 700 }}>{opt.symbol}</Typography>
                <Chip label={opt.sectorName} size="small" sx={{ height: 16, fontSize: '0.5rem', fontWeight: 600, bgcolor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)', color: 'text.secondary', '& .MuiChip-label': { px: 0.6 } }} />
              </Box>
              <Typography sx={{ fontSize: '0.65rem', color: 'text.secondary', mt: 0.15 }} noWrap>{opt.name}</Typography>
            </Box>
          </Box>
        )}
        renderInput={(params) => (
          <TextField {...params} placeholder="Search any stock..."
            InputProps={{
              ...params.InputProps,
              startAdornment: <InputAdornment position="start"><SearchRounded sx={{ fontSize: 18, color: 'text.secondary' }} /></InputAdornment>,
            }}
            sx={{ '& .MuiOutlinedInput-root': { borderRadius: 3, fontSize: '0.82rem', bgcolor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)' } }}
          />
        )}
        sx={{ mb: 2 }}
      />

      {analysis ? (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
          {/* ─ Hero Header ─ */}
          <Card sx={{
            ...cardSx, mb: 1.5, overflow: 'hidden',
            background: isDark
              ? `linear-gradient(135deg, ${alpha(analysis.rating.color, 0.08)} 0%, transparent 60%)`
              : `linear-gradient(135deg, ${alpha(analysis.rating.color, 0.06)} 0%, transparent 60%)`,
          }}>
            <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
              <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start', flexWrap: { xs: 'wrap', sm: 'nowrap' } }}>
                <ScoreGauge value={analysis.vs} color={analysis.rating.color} />
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.3, flexWrap: 'wrap' }}>
                    <StockLogo symbol={analysis.symbol} size="sm" />
                    <Typography sx={{ fontSize: '1.05rem', fontWeight: 800, letterSpacing: '-0.02em' }}>{analysis.symbol}</Typography>
                    <Chip label={analysis.vTag.label} size="small" sx={{ height: 18, fontSize: '0.55rem', fontWeight: 700, bgcolor: analysis.vTag.bg, color: analysis.vTag.color }} />
                  </Box>
                  <Typography sx={{ fontSize: '0.65rem', color: 'text.secondary', mb: 0.5 }}>{analysis.name} · {analysis.sectorName}</Typography>
                  <Chip label={analysis.rating.label} size="small" sx={{
                    height: 22, fontSize: '0.65rem', fontWeight: 700,
                    bgcolor: alpha(analysis.rating.color, 0.12), color: analysis.rating.color,
                    border: `1px solid ${alpha(analysis.rating.color, 0.25)}`,
                  }} />
                </Box>
                <Box sx={{ textAlign: 'right', flexShrink: 0 }}>
                  <Typography sx={{ fontSize: '1.15rem', fontWeight: 800, letterSpacing: '-0.02em' }}>
                    Rs {formatNumber(analysis.price, 2)}
                  </Typography>
                  {analysis.live && (
                    <Typography sx={{ fontSize: '0.68rem', fontWeight: 600, color: analysis.live.change_pct >= 0 ? '#16a34a' : '#dc2626' }}>
                      {analysis.live.change_pct >= 0 ? '+' : ''}{Number(analysis.live.change_pct).toFixed(2)}%
                    </Typography>
                  )}
                  {analysis.upside != null && (
                    <Typography sx={{ fontSize: '0.6rem', fontWeight: 700, color: analysis.upside > 0 ? '#16a34a' : '#dc2626', mt: 0.3 }}>
                      {analysis.upside > 0 ? '▲' : '▼'} {Math.abs(analysis.upside).toFixed(1)}% to fair
                    </Typography>
                  )}
                </Box>
              </Box>

              {/* Quick metrics row */}
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(4, 1fr)' }, gap: 0.75, mt: 1.5 }}>
                <MetricPill label="PE" value={analysis.pe > 0 ? `${analysis.pe}x` : '—'} />
                <MetricPill label="Div Yield" value={analysis.divYield > 0 ? `${analysis.divYield}%` : '—'} color={analysis.divYield > 6 ? '#16a34a' : undefined} />
                <MetricPill label="ROE" value={`${analysis.roe}%`} color={analysis.roe > 25 ? '#16a34a' : undefined} />
                <MetricPill label="Payout" value={`${analysis.payout}%`} color={analysis.payout > 90 ? '#dc2626' : undefined} />
              </Box>
            </CardContent>
          </Card>

          {/* ─ Valuation Models (collapsible) ─ */}
          <Card sx={{ ...cardSx, mb: 1.5, overflow: 'hidden' }}>
            {sectionHeader({ title: "Valuation Models", sectionKey: "valuation", icon: <CalculateRounded sx={{ fontSize: 16 } })}} />
            <Collapse in={openSections.valuation}>
              <CardContent sx={{ p: 2, pt: 1.5, '&:last-child': { pb: 2 } }}>
                <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 1 }}>
                  {[
                    { l: 'Graham #', v: analysis.gn, d: '√(22.5×EPS×BV)' },
                    { l: 'PEG', v: analysis.peg, d: 'PE / Growth', fmt: (v) => v?.toFixed(2), clr: (v) => v < 1 ? '#16a34a' : v < 1.5 ? '#d97706' : '#dc2626' },
                    { l: 'DDM', v: analysis.ddm, d: 'Div/(Return−Growth)' },
                    { l: 'EPV', v: analysis.epvVal, d: 'EPS / Risk-Free' },
                    { l: 'Rel. PE', v: analysis.rpe, d: 'vs Sector', fmt: (v) => v?.toFixed(2) + 'x', clr: (v) => v < 0.8 ? '#16a34a' : v > 1.2 ? '#dc2626' : '#d97706' },
                    { l: 'Fair (PE)', v: analysis.fvPE > 0 ? analysis.fvPE : null, d: 'Analyst' },
                    { l: 'Fair (BV)', v: analysis.fvBV > 0 ? analysis.fvBV : null, d: 'Book model' },
                    { l: 'Consensus', v: analysis.fairAvg, d: 'All models avg' },
                  ].map((m) => {
                    const displayValue = m.v != null ? (m.fmt ? m.fmt(m.v) : `Rs ${formatNumber(m.v, 0)}`) : '—';
                    const valColor = m.clr && m.v != null ? m.clr(m.v) : undefined;
                    return (
                      <Box key={m.l} sx={{
                        p: 1, borderRadius: 2,
                        bgcolor: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.015)',
                      }}>
                        <Typography sx={{ fontSize: '0.55rem', color: 'text.secondary', letterSpacing: '0.03em' }}>{m.l}</Typography>
                        <Typography sx={{ fontSize: '0.82rem', fontWeight: 700, color: valColor }}>{displayValue}</Typography>
                        <Typography sx={{ fontSize: '0.5rem', color: 'text.secondary', opacity: 0.7 }}>{m.d}</Typography>
                      </Box>
                    );
                  })}
                </Box>

                {/* Upside bar */}
                {analysis.upside != null && (
                  <Box sx={{
                    mt: 1.5, p: 1.2, borderRadius: 2.5, textAlign: 'center',
                    background: isDark
                      ? `linear-gradient(90deg, ${alpha(analysis.upside > 0 ? '#16a34a' : '#dc2626', 0.08)}, transparent)`
                      : `linear-gradient(90deg, ${alpha(analysis.upside > 0 ? '#16a34a' : '#dc2626', 0.05)}, transparent)`,
                  }}>
                    <Typography sx={{ fontSize: '0.6rem', color: 'text.secondary' }}>Upside to Consensus</Typography>
                    <Typography sx={{ fontSize: '1.15rem', fontWeight: 800, color: analysis.upside > 0 ? '#16a34a' : '#dc2626', letterSpacing: '-0.02em' }}>
                      {analysis.upside > 0 ? '+' : ''}{analysis.upside.toFixed(1)}%
                    </Typography>
                  </Box>
                )}
              </CardContent>
            </Collapse>
          </Card>

          {/* ─ Quality & Safety (collapsible) ─ */}
          <Card sx={{ ...cardSx, mb: 1.5, overflow: 'hidden' }}>
            {sectionHeader({ title: "Quality & Safety", sectionKey: "quality", icon: <GppGoodRounded sx={{ fontSize: 16 } })}} />
            <Collapse in={openSections.quality}>
              <CardContent sx={{ p: { xs: 1.5, sm: 2 }, pt: 1.5, '&:last-child': { pb: { xs: 1.5, sm: 2 } } }}>
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(3, 1fr)' }, gap: 0.75 }}>
                  {[
                    { l: 'ROE', v: `${analysis.roe}%`, c: analysis.roe > 25 ? '#16a34a' : undefined },
                    { l: 'Net Margin', v: `${analysis.npm}%` },
                    { l: 'Rev Growth', v: `${analysis.revGr || 0}%`, c: (analysis.revGr || 0) > 15 ? '#16a34a' : undefined },
                    { l: 'P/BV', v: analysis.bv > 0 ? `${(analysis.price / analysis.bv).toFixed(2)}x` : '—' },
                    { l: 'EPS', v: analysis.eps > 0 ? `Rs ${formatNumber(analysis.eps, 2)}` : '—' },
                    { l: 'Mkt Cap', v: analysis.mcap || '—' },
                  ].map((m) => (
                    <Box key={m.l} sx={{ p: 0.75, borderRadius: 1.5, bgcolor: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.015)' }}>
                      <Typography sx={{ fontSize: '0.52rem', color: 'text.secondary' }}>{m.l}</Typography>
                      <Typography sx={{ fontSize: '0.78rem', fontWeight: 700, color: m.c }}>{m.v}</Typography>
                    </Box>
                  ))}
                </Box>

                {/* Dividend Safety gauge */}
                {analysis.divYield > 0 && (
                  <Box sx={{ mt: 1.5 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.4 }}>
                      <Typography sx={{ fontSize: '0.6rem', fontWeight: 600, color: 'text.secondary' }}>Dividend Safety</Typography>
                      <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, color: analysis.ds >= 70 ? '#16a34a' : analysis.ds >= 40 ? '#d97706' : '#dc2626' }}>
                        {analysis.ds}/100
                      </Typography>
                    </Box>
                    <LinearProgress variant="determinate" value={analysis.ds} sx={{
                      height: 6, borderRadius: 3,
                      bgcolor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
                      '& .MuiLinearProgress-bar': {
                        borderRadius: 3,
                        bgcolor: analysis.ds >= 70 ? '#16a34a' : analysis.ds >= 40 ? '#d97706' : '#dc2626',
                      },
                    }} />
                  </Box>
                )}
              </CardContent>
            </Collapse>
          </Card>

          {/* ─ Technical Levels (collapsible) ─ */}
          <Card sx={{ ...cardSx, mb: 1.5, overflow: 'hidden' }}>
            {sectionHeader({ title: "Technical Levels", sectionKey: "technical", icon: <TrendingUpRounded sx={{ fontSize: 16 } })}} />
            <Collapse in={openSections.technical}>
              <CardContent sx={{ p: 2, pt: 1.5, '&:last-child': { pb: 2 } }}>
                {/* Visual price ruler */}
                {analysis.support > 0 && analysis.resistance > 0 && (
                  <Box sx={{ mb: 1.5 }}>
                    <Box sx={{ position: 'relative', height: 32, borderRadius: 2, overflow: 'hidden', bgcolor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)' }}>
                      {(() => {
                        const lo = analysis.support * 0.95;
                        const hi = analysis.resistance * 1.05;
                        const range = hi - lo;
                        const pricePct = Math.min(100, Math.max(0, ((analysis.price - lo) / range) * 100));
                        const supportPct = ((analysis.support - lo) / range) * 100;
                        const resistPct = ((analysis.resistance - lo) / range) * 100;
                        return (
                          <>
                            <Box sx={{ position: 'absolute', left: `${supportPct}%`, top: 0, bottom: 0, width: 1, bgcolor: '#16a34a', opacity: 0.5 }} />
                            <Box sx={{ position: 'absolute', left: `${resistPct}%`, top: 0, bottom: 0, width: 1, bgcolor: '#dc2626', opacity: 0.5 }} />
                            <Box sx={{
                              position: 'absolute', left: `${pricePct}%`, top: '50%', transform: 'translate(-50%, -50%)',
                              width: 10, height: 10, borderRadius: '50%', bgcolor: isDark ? '#fff' : '#111', border: '2px solid', borderColor: isDark ? '#000' : '#fff',
                              zIndex: 1,
                            }} />
                          </>
                        );
                      })()}
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 0.3 }}>
                      <Typography sx={{ fontSize: '0.55rem', color: '#16a34a' }}>S: {formatNumber(analysis.support, 0)}</Typography>
                      <Typography sx={{ fontSize: '0.55rem', color: isDark ? '#fff' : '#111', fontWeight: 600 }}>Price: {formatNumber(analysis.price, 0)}</Typography>
                      <Typography sx={{ fontSize: '0.55rem', color: '#dc2626' }}>R: {formatNumber(analysis.resistance, 0)}</Typography>
                    </Box>
                  </Box>
                )}

                <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 0.75 }}>
                  {[
                    { l: 'Support', v: analysis.support > 0 ? formatNumber(analysis.support, 0) : '—', c: '#16a34a' },
                    { l: 'Resistance', v: analysis.resistance > 0 ? formatNumber(analysis.resistance, 0) : '—', c: '#dc2626' },
                    { l: '50-DMA', v: analysis.ma50 > 0 ? formatNumber(analysis.ma50, 0) : '—', c: analysis.price > (analysis.ma50 || 0) ? '#16a34a' : '#dc2626' },
                    { l: '200-DMA', v: analysis.ma200 > 0 ? formatNumber(analysis.ma200, 0) : '—', c: analysis.price > (analysis.ma200 || 0) ? '#16a34a' : '#dc2626' },
                    { l: 'Buy Low', v: analysis.buyLow ? formatNumber(analysis.buyLow, 0) : '—' },
                    { l: 'Buy High', v: analysis.buyHigh ? formatNumber(analysis.buyHigh, 0) : '—' },
                  ].map((m) => (
                    <Box key={m.l} sx={{ p: 0.75, borderRadius: 1.5, bgcolor: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.015)' }}>
                      <Typography sx={{ fontSize: '0.52rem', color: 'text.secondary' }}>{m.l}</Typography>
                      <Typography sx={{ fontSize: '0.78rem', fontWeight: 700, color: m.c }}>Rs {m.v}</Typography>
                    </Box>
                  ))}
                </Box>
              </CardContent>
            </Collapse>
          </Card>

          {/* ─ Analyst Note ─ */}
          <Box sx={{
            p: 1.5, borderRadius: 3,
            bgcolor: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.025)',
            border: `1px solid ${theme.palette.divider}`,
            borderLeft: `3px solid ${analysis.rating.color}`,
          }}>
            <Typography sx={{ fontSize: '0.62rem', fontWeight: 700, color: 'text.secondary', mb: 0.3, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Analyst Note</Typography>
            <Typography sx={{ fontSize: '0.72rem', color: 'text.secondary', lineHeight: 1.65 }}>{analysis.analysis}</Typography>
          </Box>
        </motion.div>
      ) : (
        <Box sx={{ textAlign: 'center', py: 6 }}>
          <Box sx={{
            width: 64, height: 64, borderRadius: '50%', mx: 'auto', mb: 1.5,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            bgcolor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
          }}>
            <SpeedRounded sx={{ fontSize: 28, color: isDark ? '#fff' : '#111', opacity: 0.5 }} />
          </Box>
          <Typography sx={{ fontSize: '0.82rem', fontWeight: 600, mb: 0.3 }}>Stock Analyzer</Typography>
          <Typography sx={{ fontSize: '0.7rem', color: 'text.secondary', maxWidth: 220, mx: 'auto', lineHeight: 1.5 }}>
            Search any stock above for instant fundamental analysis with live prices
          </Typography>
        </Box>
      )}
    </Box>
  );
}

/* ═══════════════════════════════════════════════
   INVESTMENT CALCULATOR
   ═══════════════════════════════════════════════ */
function InvestCalculator() {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const [bucketKey, setBucketKey] = useState('dividend');
  const [amount, setAmount] = useState('');
  const [risk, setRisk] = useState(3);
  const [horizon, setHorizon] = useState(3);
  const [results, setResults] = useState(null);
  const [showAllocs, setShowAllocs] = useState(false);
  const livePriceMap = useLivePrices();

  const fmtPKR = (n) => n ? `Rs ${Number(Math.round(n)).toLocaleString()}` : 'Rs 0';
  const cardSx = { borderRadius: 3, border: `1px solid ${theme.palette.divider}`, bgcolor: isDark ? 'rgba(255,255,255,0.02)' : '#fff' };

  const calculate = () => {
    const raw = parseInt(String(amount).replace(/[^0-9]/g, '')) || 0;
    if (raw < 10000) return;
    const bucket = BUCKETS[bucketKey];
    const adjustedStocks = bucket.stocks.map((bs) => {
      const stock = getResearchStock(bs.id);
      if (!stock) return null;
      const live = livePriceMap[stock.symbol];
      const price = live?.current || stock.price;
      let w = bs.weight;
      if (risk <= 2 && stock.divYield > 7) w *= 1.15;
      if (risk >= 4 && stock.roe > 20) w *= 1.15;
      return { ...bs, adjWeight: w, stock: { ...stock, price } };
    }).filter(Boolean);
    const totalW = adjustedStocks.reduce((s, bs) => s + bs.adjWeight, 0);
    const allocs = adjustedStocks.map((bs) => {
      const pct = (bs.adjWeight / totalW) * 100;
      const allocAmt = raw * (bs.adjWeight / totalW);
      const shares = Math.floor(allocAmt / bs.stock.price);
      const remainder = allocAmt - (shares * bs.stock.price);
      return { id: bs.id, symbol: bs.stock.symbol, name: bs.stock.name, sector: bs.sector, price: bs.stock.price, shares, pct, divYield: bs.stock.divYield, pe: bs.stock.pe, roe: bs.stock.roe, remainder, fvPE: bs.stock.fvPE, revGr: bs.stock.revGr };
    });
    let leftover = raw - allocs.reduce((s, a) => s + a.shares * a.price, 0);
    const byRemainder = allocs.map((a, i) => ({ idx: i, remainder: a.remainder, price: a.price })).sort((a, b) => b.remainder - a.remainder);
    for (const item of byRemainder) { if (leftover >= item.price) { allocs[item.idx].shares += 1; leftover -= item.price; } }
    const byCheapest = allocs.map((a, i) => ({ idx: i, price: a.price })).sort((a, b) => a.price - b.price);
    let safety = 0;
    while (leftover > 0 && safety < 200) { let bought = false; for (const item of byCheapest) { if (leftover >= item.price) { allocs[item.idx].shares += 1; leftover -= item.price; bought = true; break; } } if (!bought) break; safety++; }
    allocs.forEach((a) => {
      a.allocAmt = a.shares * a.price;
      a.grossDiv = a.allocAmt * (a.divYield / 100);
      a.cgtOnDiv = a.grossDiv * CGT_RATE;
      a.netDiv = a.grossDiv - a.cgtOnDiv;
      let expGrowth = 0;
      if (a.fvPE > 0 && a.fvPE > a.price) expGrowth = ((a.fvPE - a.price) / a.price) / Math.max(horizon, 1) * 100;
      else if (a.revGr > 0) expGrowth = a.revGr * 0.5;
      a.expGrowth = Math.min(expGrowth, 40);
    });
    const totalInvested = allocs.reduce((s, a) => s + a.allocAmt, 0);
    const totalGrossDiv = allocs.reduce((s, a) => s + a.grossDiv, 0);
    const totalCGT = allocs.reduce((s, a) => s + a.cgtOnDiv, 0);
    const totalNetDiv = allocs.reduce((s, a) => s + a.netDiv, 0);
    const portfolioYield = totalInvested > 0 ? (totalNetDiv / totalInvested * 100) : 0;
    const wExpGrowth = totalInvested > 0 ? allocs.reduce((s, a) => s + a.expGrowth * a.allocAmt, 0) / totalInvested : 0;
    const projected = [];
    for (let y = 1; y <= horizon; y++) {
      const capGain = totalInvested * Math.pow(1 + wExpGrowth / 100, y) - totalInvested;
      const cumNetDiv = totalNetDiv * y;
      projected.push({ year: y, portfolioValue: totalInvested + capGain, totalDividends: cumNetDiv, totalReturn: capGain + cumNetDiv, totalReturnPct: ((capGain + cumNetDiv) / totalInvested * 100) });
    }
    setResults({ allocs, totalInvested, totalGrossDiv, totalCGT, totalNetDiv, portfolioYield, projected, uninvested: raw - totalInvested });
    setShowAllocs(false);
  };

  const riskLabels = ['Conservative', 'Low Risk', 'Balanced', 'Growth', 'Aggressive'];
  const riskColors = ['#16a34a', '#22c55e', '#0d9488', '#f59e0b', '#dc2626'];
  const bucketKeys = Object.keys(BUCKETS);

  return (
    <Box>
      {/* Strategy selector — card style */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(3, 1fr)', sm: 'repeat(3, 1fr)' }, gap: 0.75, mb: 1.5 }}>
        {bucketKeys.map((k) => {
          const active = bucketKey === k;
          const b = BUCKETS[k];
          return (
            <Box key={k} onClick={() => { setBucketKey(k); setResults(null); }} sx={{
              px: 1, py: 0.9, borderRadius: 2, cursor: 'pointer', textAlign: 'center', transition: 'all 0.2s',
              border: `1.5px solid ${active ? (isDark ? '#fff' : '#111') : theme.palette.divider}`,
              bgcolor: active ? (isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.04)') : 'transparent',
              '&:hover': { borderColor: active ? undefined : (isDark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.2)') },
            }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.4, color: active ? (isDark ? '#fff' : '#111') : 'text.secondary' }}>
                {k === 'dividend' ? <SavingsRounded sx={{ fontSize: 14 }} /> : k === 'hybrid' ? <BalanceRounded sx={{ fontSize: 14 }} /> : <RocketLaunchRounded sx={{ fontSize: 14 }} />}
                <Typography sx={{ fontSize: '0.68rem', fontWeight: 700, color: active ? (isDark ? '#fff' : '#111') : 'text.primary' }}>
                  {b.name.split(' ')[0]}
                </Typography>
              </Box>
              <Typography sx={{ fontSize: '0.52rem', color: 'text.secondary', mt: 0.15 }}>{b.subtitle}</Typography>
            </Box>
          );
        })}
      </Box>

      {/* Input card */}
      <Card sx={{ ...cardSx, mb: 1.5, overflow: 'hidden' }}>
        <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
          <Typography sx={{ fontSize: '0.65rem', fontWeight: 600, color: 'text.secondary', mb: 0.5, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Investment Amount
          </Typography>
          <TextField
            fullWidth size="small" placeholder="1,000,000" value={amount}
            onChange={(e) => { const v = e.target.value.replace(/[^0-9]/g, ''); setAmount(v ? Number(v).toLocaleString() : ''); }}
            InputProps={{ startAdornment: <InputAdornment position="start"><Typography sx={{ fontSize: '0.82rem', fontWeight: 800, color: isDark ? '#fff' : '#111' }}>PKR</Typography></InputAdornment> }}
            sx={{ mb: 1.5, '& .MuiOutlinedInput-root': { borderRadius: 2.5, fontSize: '0.9rem', fontWeight: 700, bgcolor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)' } }}
          />

          {/* Risk */}
          <Box sx={{ mb: 1.5 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
              <Typography sx={{ fontSize: '0.65rem', fontWeight: 600, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Risk Profile</Typography>
              <Chip label={riskLabels[risk - 1]} size="small" sx={{ height: 18, fontSize: '0.58rem', fontWeight: 700, bgcolor: alpha(riskColors[risk - 1], 0.12), color: riskColors[risk - 1] }} />
            </Box>
            <Slider size="small" min={1} max={5} step={1} value={risk} onChange={(_, v) => setRisk(v)}
              sx={{ color: riskColors[risk - 1], '& .MuiSlider-thumb': { width: 16, height: 16 }, '& .MuiSlider-rail': { opacity: 0.2 } }} />
          </Box>

          {/* Horizon */}
          <Typography sx={{ fontSize: '0.65rem', fontWeight: 600, color: 'text.secondary', mb: 0.75, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Time Horizon
          </Typography>
          <Box sx={{ display: 'flex', gap: 0.5, mb: 1.5 }}>
            {[1, 2, 3, 5, 7, 10].map((h) => {
              const active = horizon === h;
              return (
                <Box key={h} onClick={() => setHorizon(h)} sx={{
                  flex: 1, py: 0.7, borderRadius: 2, textAlign: 'center', cursor: 'pointer', transition: 'all 0.15s',
                  bgcolor: active ? (isDark ? '#fff' : '#111') : (isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)'),
                  color: active ? (isDark ? '#000' : '#fff') : 'text.secondary',
                }}>
                  <Typography sx={{ fontSize: '0.72rem', fontWeight: active ? 700 : 500 }}>{h}Y</Typography>
                </Box>
              );
            })}
          </Box>

          <Button fullWidth variant="contained" onClick={calculate} disableElevation
            disabled={!amount || parseInt(String(amount).replace(/[^0-9]/g, '')) < 10000}
            startIcon={<CalculateRounded sx={{ fontSize: 16 }} />}
            sx={{ borderRadius: 2.5, py: 0.9, fontWeight: 700, fontSize: '0.78rem', textTransform: 'none', letterSpacing: '-0.01em', bgcolor: isDark ? '#fff' : '#111', color: isDark ? '#000' : '#fff', '&:hover': { bgcolor: isDark ? 'rgba(255,255,255,0.85)' : 'rgba(0,0,0,0.85)' }, '&.Mui-disabled': { bgcolor: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)', color: isDark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)' } }}>
            Calculate Portfolio
          </Button>
        </CardContent>
      </Card>

      {/* Results */}
      {results && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
          {/* Hero result */}
          <Card sx={{
            ...cardSx, mb: 1.5, overflow: 'hidden',
            background: isDark
              ? 'linear-gradient(135deg, rgba(22,163,106,0.08) 0%, transparent 60%)'
              : 'linear-gradient(135deg, rgba(22,163,106,0.04) 0%, transparent 60%)',
          }}>
            <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1.5 }}>
                <Box>
                  <Typography sx={{ fontSize: '0.6rem', color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Monthly Income</Typography>
                  <Typography sx={{ fontSize: '1.4rem', fontWeight: 800, color: '#16a34a', letterSpacing: '-0.03em' }}>
                    {fmtPKR(results.totalNetDiv / 12)}
                  </Typography>
                </Box>
                <Box sx={{ textAlign: 'right' }}>
                  <Typography sx={{ fontSize: '0.6rem', color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Net Yield</Typography>
                  <Typography sx={{ fontSize: '1.1rem', fontWeight: 800, color: '#16a34a' }}>{results.portfolioYield.toFixed(1)}%</Typography>
                </Box>
              </Box>

              <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 0.75 }}>
                {[
                  { l: 'Invested', v: fmtPKR(results.totalInvested) },
                  { l: 'Gross Dividend', v: fmtPKR(results.totalGrossDiv) },
                  { l: 'CGT @30%', v: `−${fmtPKR(results.totalCGT)}`, c: '#dc2626' },
                  { l: 'Net Annual', v: fmtPKR(results.totalNetDiv), c: '#16a34a' },
                ].map((m) => (
                  <Box key={m.l} sx={{ p: 0.8, borderRadius: 1.5, bgcolor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)' }}>
                    <Typography sx={{ fontSize: '0.52rem', color: 'text.secondary' }}>{m.l}</Typography>
                    <Typography sx={{ fontSize: '0.78rem', fontWeight: 700, color: m.c || 'text.primary' }}>{m.v}</Typography>
                  </Box>
                ))}
              </Box>

              {results.uninvested > 0 && (
                <Typography sx={{ fontSize: '0.58rem', color: 'text.secondary', mt: 1, textAlign: 'center' }}>
                  {fmtPKR(results.uninvested)} uninvested (less than cheapest share)
                </Typography>
              )}
            </CardContent>
          </Card>

          {/* Allocations — progressive disclosure */}
          <Card sx={{ ...cardSx, mb: 1.5, overflow: 'hidden' }}>
            <Box onClick={() => setShowAllocs(!showAllocs)} sx={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 2, py: 1.2, cursor: 'pointer',
            }}>
              <Typography sx={{ fontSize: '0.72rem', fontWeight: 700 }}>
                Allocation ({results.allocs.length} stocks)
              </Typography>
              <ExpandMoreRounded sx={{ fontSize: 18, color: 'text.secondary', transition: 'transform 0.2s', transform: showAllocs ? 'rotate(180deg)' : 'none' }} />
            </Box>
            <Collapse in={showAllocs}>
              <Box sx={{ px: 1.5, pb: 1.5 }}>
                {results.allocs.map((a) => (
                  <Box key={a.id} sx={{
                    display: 'flex', alignItems: 'center', gap: 0.75, py: 0.7,
                    borderBottom: `1px solid ${theme.palette.divider}`, '&:last-child': { borderBottom: 'none' },
                  }}>
                    <Box sx={{ width: 26, textAlign: 'center', flexShrink: 0 }}>
                      <Typography sx={{ fontSize: '0.62rem', fontWeight: 800, color: isDark ? '#fff' : '#111' }}>{a.pct.toFixed(0)}%</Typography>
                    </Box>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <StockLogo symbol={a.symbol} size="sm" />
                        <Typography sx={{ fontSize: '0.72rem', fontWeight: 700 }}>{a.symbol}</Typography>
                        <Chip label={a.sector} size="small" sx={{ height: 14, fontSize: '0.48rem', fontWeight: 600, bgcolor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)', color: 'text.secondary', '& .MuiChip-label': { px: 0.5 } }} />
                      </Box>
                      <Typography sx={{ fontSize: '0.52rem', color: 'text.secondary', ml: 3.5 }} noWrap>
                        {getStockName(a.symbol)} · {a.shares} × Rs {formatNumber(a.price, 0)}
                      </Typography>
                    </Box>
                    <Box sx={{ textAlign: 'right', flexShrink: 0 }}>
                      <Typography sx={{ fontSize: '0.7rem', fontWeight: 700 }}>{fmtPKR(a.allocAmt)}</Typography>
                      <Typography sx={{ fontSize: '0.52rem', fontWeight: 600, color: '#16a34a' }}>÷12 = {fmtPKR(a.netDiv / 12)}</Typography>
                    </Box>
                  </Box>
                ))}
              </Box>
            </Collapse>
          </Card>

          {/* Projection */}
          <Card sx={{ ...cardSx }}>
            <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
              <Typography sx={{ fontSize: '0.65rem', fontWeight: 600, color: 'text.secondary', mb: 1, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {horizon}-Year Projection (Net of 30% CGT)
              </Typography>
              {results.projected.map((p, i) => {
                const total = p.portfolioValue + p.totalDividends;
                const maxTotal = results.projected[results.projected.length - 1];
                const maxV = (maxTotal.portfolioValue + maxTotal.totalDividends) * 1.05;
                const barPct = Math.min(100, (total / maxV) * 100);
                const isLast = i === results.projected.length - 1;
                return (
                  <Box key={p.year} sx={{ mb: isLast ? 0 : 1 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Typography sx={{ fontSize: '0.62rem', fontWeight: 700, minWidth: 20, color: 'text.secondary' }}>Y{p.year}</Typography>
                      <Box sx={{ flex: 1 }}>
                        <LinearProgress variant="determinate" value={barPct} sx={{
                          height: isLast ? 10 : 7, borderRadius: 5,
                          bgcolor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)',
                          '& .MuiLinearProgress-bar': { borderRadius: 5, bgcolor: isLast ? '#16a34a' : (isDark ? '#fff' : '#111') },
                        }} />
                      </Box>
                      <Box sx={{ minWidth: 72, textAlign: 'right' }}>
                        <Typography sx={{ fontSize: '0.62rem', fontWeight: 700 }}>{fmtPKR(total)}</Typography>
                      </Box>
                      <Chip label={`+${p.totalReturnPct.toFixed(0)}%`} size="small" sx={{
                        height: 18, fontSize: '0.52rem', fontWeight: 700, minWidth: 42,
                        bgcolor: alpha('#16a34a', 0.1), color: '#059669',
                      }} />
                    </Box>
                  </Box>
                );
              })}
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Empty state */}
      {!results && (
        <Box sx={{ textAlign: 'center', py: 4 }}>
          <Box sx={{
            width: 56, height: 56, borderRadius: '50%', mx: 'auto', mb: 1.5,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            bgcolor: isDark ? 'rgba(22,163,106,0.08)' : 'rgba(22,163,106,0.05)',
          }}>
            <SavingsRounded sx={{ fontSize: 24, color: '#16a34a', opacity: 0.5 }} />
          </Box>
          <Typography sx={{ fontSize: '0.72rem', color: 'text.secondary', lineHeight: 1.5, maxWidth: 240, mx: 'auto' }}>
            Enter an investment amount to see how the <strong>{BUCKETS[bucketKey].name}</strong> portfolio allocates your money with projected dividends
          </Typography>
        </Box>
      )}
    </Box>
  );
}

/* ═══════════════════════════════════════════════
   FORMULA CALCULATORS
   ═══════════════════════════════════════════════ */
function Calculators() {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const [calc, setCalc] = useState('graham');
  const [inputs, setInputs] = useState({});
  const [result, setResult] = useState(null);

  const calcs = [
    { key: 'graham', label: 'Graham', icon: <SquareFootRounded sx={{ fontSize: 18 }} />, fields: [{ k: 'eps', l: 'EPS (TTM)', ph: '48.78' }, { k: 'bv', l: 'Book Value', ph: '310' }], formula: '√(22.5 × EPS × BV)' },
    { key: 'peg', label: 'PEG', icon: <BarChartRounded sx={{ fontSize: 18 }} />, fields: [{ k: 'pe', l: 'P/E Ratio', ph: '7.4' }, { k: 'growth', l: 'Growth Rate %', ph: '15' }], formula: 'PE / Growth Rate' },
    { key: 'ddm', label: 'DDM', icon: <PaidRounded sx={{ fontSize: 18 }} />, fields: [{ k: 'price', l: 'Price', ph: '361' }, { k: 'yield', l: 'Div Yield %', ph: '9.83' }, { k: 'growth', l: 'Growth %', ph: '8' }], formula: 'Div / (Return − Growth)' },
    { key: 'epv', label: 'EPV', icon: <BoltRounded sx={{ fontSize: 18 }} />, fields: [{ k: 'eps', l: 'EPS (TTM)', ph: '48.78' }, { k: 'rfr', l: 'Risk-Free %', ph: '12' }], formula: 'EPS / Risk-Free Rate' },
  ];

  const activeCalc = calcs.find((c) => c.key === calc);
  const cardSx = { borderRadius: 3, border: `1px solid ${theme.palette.divider}`, bgcolor: isDark ? 'rgba(255,255,255,0.02)' : '#fff' };

  const calculate = () => {
    const v = {};
    activeCalc.fields.forEach((f) => { v[f.k] = parseFloat(inputs[f.k]) || 0; });
    let res = null;
    if (calc === 'graham') {
      const gn = grahamNumber(v.eps, v.bv);
      res = gn ? { label: 'Graham Number', value: `Rs ${formatNumber(gn, 2)}`, desc: `√(22.5 × ${v.eps} × ${v.bv})`, ok: true } : { label: 'Error', value: 'Invalid', desc: 'EPS and BV must be > 0', ok: false };
    } else if (calc === 'peg') {
      const p = pegRatio(v.pe, v.growth);
      const interp = p < 0.5 ? 'Deeply undervalued' : p < 1.0 ? 'Undervalued (GARP)' : p < 1.5 ? 'Fair' : 'Overvalued';
      res = p != null ? { label: 'PEG Ratio', value: p.toFixed(3), desc: interp, ok: true, color: p < 1 ? '#16a34a' : p < 1.5 ? '#d97706' : '#dc2626' } : { label: 'Error', value: 'Invalid', desc: 'PE and Growth must be > 0', ok: false };
    } else if (calc === 'ddm') {
      const d = ddmValue(v.price, v.yield, v.growth);
      res = d != null ? { label: 'DDM Fair Value', value: `Rs ${formatNumber(d, 2)}`, desc: 'Intrinsic value estimate', ok: true } : { label: 'Error', value: 'N/A', desc: 'Required return must exceed growth', ok: false };
    } else if (calc === 'epv') {
      const e = epv(v.eps, v.rfr);
      res = e != null ? { label: 'Earnings Power Value', value: `Rs ${formatNumber(e, 2)}`, desc: 'Perpetuity value of earnings', ok: true } : { label: 'Error', value: 'Invalid', desc: 'EPS must be > 0', ok: false };
    }
    setResult(res);
  };

  return (
    <Box>
      {/* Calculator cards grid */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(4, 1fr)' }, gap: 0.75, mb: 2 }}>
        {calcs.map((c) => {
          const active = calc === c.key;
          return (
            <Box key={c.key} onClick={() => { setCalc(c.key); setResult(null); setInputs({}); }} sx={{
              py: 1, borderRadius: 2.5, textAlign: 'center', cursor: 'pointer', transition: 'all 0.15s',
              border: `1.5px solid ${active ? (isDark ? '#fff' : '#111') : theme.palette.divider}`,
              bgcolor: active ? (isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.04)') : 'transparent',
            }}>
              <Box sx={{ display: 'flex', justifyContent: 'center', color: active ? (isDark ? '#fff' : '#111') : 'text.secondary' }}>{c.icon}</Box>
              <Typography sx={{ fontSize: '0.62rem', fontWeight: active ? 700 : 500, color: active ? (isDark ? '#fff' : '#111') : 'text.secondary', mt: 0.3 }}>{c.label}</Typography>
            </Box>
          );
        })}
      </Box>

      <Card sx={{ ...cardSx, overflow: 'hidden' }}>
        {/* Formula header */}
        <Box sx={{
          px: 2, py: 1.2,
          bgcolor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.025)',
          borderBottom: `1px solid ${theme.palette.divider}`,
        }}>
          <Typography sx={{ fontSize: '0.75rem', fontWeight: 700 }}>{activeCalc.label} Calculator</Typography>
          <Typography sx={{ fontSize: '0.6rem', color: 'text.secondary', fontFamily: 'monospace' }}>{activeCalc.formula}</Typography>
        </Box>

        <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
          {activeCalc.fields.map((f) => (
            <TextField key={f.k} fullWidth size="small" label={f.l} placeholder={f.ph}
              type="number" value={inputs[f.k] || ''} onChange={(e) => setInputs({ ...inputs, [f.k]: e.target.value })}
              sx={{
                mb: 1.5,
                '& .MuiOutlinedInput-root': { borderRadius: 2.5, fontSize: '0.85rem', fontWeight: 600, bgcolor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)' },
                '& .MuiInputLabel-root': { fontSize: '0.75rem' },
              }}
            />
          ))}

          <Button fullWidth variant="contained" onClick={calculate} disableElevation
            startIcon={<CalculateRounded sx={{ fontSize: 16 }} />}
            sx={{ borderRadius: 2.5, py: 0.9, fontWeight: 700, fontSize: '0.78rem', textTransform: 'none', bgcolor: isDark ? '#fff' : '#111', color: isDark ? '#000' : '#fff', '&:hover': { bgcolor: isDark ? 'rgba(255,255,255,0.85)' : 'rgba(0,0,0,0.85)' } }}>
            Calculate
          </Button>

          {/* Result */}
          <AnimatePresence>
            {result && (
              <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.25 }}>
                <Box sx={{
                  mt: 2, p: 1.5, borderRadius: 3, textAlign: 'center',
                  bgcolor: result.ok
                    ? (isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)')
                    : (isDark ? 'rgba(220,38,38,0.06)' : 'rgba(220,38,38,0.04)'),
                  border: `1px solid ${result.ok ? (isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.1)') : alpha('#dc2626', 0.15)}`,
                }}>
                  <Typography sx={{ fontSize: '0.58rem', color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.06em', mb: 0.3 }}>{result.label}</Typography>
                  <Typography sx={{ fontSize: '1.3rem', fontWeight: 800, color: result.ok ? (result.color || (isDark ? '#fff' : '#111')) : '#dc2626', letterSpacing: '-0.02em' }}>
                    {result.value}
                  </Typography>
                  <Typography sx={{ fontSize: '0.62rem', color: 'text.secondary', mt: 0.3 }}>{result.desc}</Typography>
                </Box>
              </motion.div>
            )}
          </AnimatePresence>
        </CardContent>
      </Card>
    </Box>
  );
}

/* ═══════════════════════════════════════════════
   SCREENER
   ═══════════════════════════════════════════════ */
function Screener() {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const allStocks = useMemo(() => getAllResearchStocks(), []);
  const [sortBy, setSortBy] = useState('score');
  const livePriceMap = useLivePrices();

  const ranked = useMemo(() => {
    return allStocks
      .filter((s) => s.eps > 0 && s.pe > 0 && !s.isTrap)
      .map((s) => {
        const live = livePriceMap[s.symbol];
        const price = live?.current || s.price;
        const vs = valueScore({ ...s, price, sectorAvgPE: s.sectorAvgPE || 10 });
        const rat = overallRating(vs);
        return { ...s, price, vs, rating: rat, liveChange: live?.change_pct };
      })
      .sort((a, b) => {
        if (sortBy === 'score') return b.vs - a.vs;
        if (sortBy === 'yield') return (b.divYield || 0) - (a.divYield || 0);
        if (sortBy === 'pe') return (a.pe || 999) - (b.pe || 999);
        if (sortBy === 'roe') return (b.roe || 0) - (a.roe || 0);
        return 0;
      });
  }, [allStocks, livePriceMap, sortBy]);

  const sortOpts = [
    { k: 'score', l: 'Score', icon: <StarRounded sx={{ fontSize: 13 }} /> },
    { k: 'yield', l: 'Yield' },
    { k: 'pe', l: 'Low PE' },
    { k: 'roe', l: 'High ROE' },
  ];

  return (
    <Box>
      {/* Sort bar */}
      <Box sx={{
        display: 'flex', gap: 0.5, p: 0.35, mb: 1.5,
        borderRadius: 2, bgcolor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
      }}>
        {sortOpts.map((o) => {
          const active = sortBy === o.k;
          return (
            <Box key={o.k} onClick={() => setSortBy(o.k)} sx={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.3,
              py: 0.6, borderRadius: 1.5, cursor: 'pointer', transition: 'all 0.15s',
              bgcolor: active ? (isDark ? '#fff' : '#111') : 'transparent',
              color: active ? (isDark ? '#000' : '#fff') : 'text.secondary',
              boxShadow: active ? (isDark ? 'none' : '0 1px 2px rgba(0,0,0,0.06)') : 'none',
            }}>
              {o.icon}
              <Typography sx={{ fontSize: '0.65rem', fontWeight: active ? 700 : 500 }}>{o.l}</Typography>
            </Box>
          );
        })}
      </Box>

      <Typography sx={{ fontSize: '0.62rem', color: 'text.secondary', mb: 1 }}>
        {ranked.length} stocks · traps excluded · sorted by {sortOpts.find((o) => o.k === sortBy)?.l}
      </Typography>

      {ranked.map((s, i) => {
        const isTop3 = i < 3;
        return (
          <Box key={s.id} sx={{
            display: 'flex', alignItems: 'center', gap: 0.75, py: 0.9, px: 0.5,
            borderBottom: `1px solid ${theme.palette.divider}`,
            '&:last-child': { borderBottom: 'none' },
          }}>
            {/* Rank */}
            <Box sx={{
              width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              bgcolor: isTop3 ? alpha(s.rating.color, 0.12) : (isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)'),
            }}>
              <Typography sx={{ fontSize: '0.62rem', fontWeight: 800, color: isTop3 ? s.rating.color : 'text.secondary' }}>
                {i + 1}
              </Typography>
            </Box>

            {/* Stock info */}
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <StockLogo symbol={s.symbol} size="sm" />
                <Typography sx={{ fontSize: '0.75rem', fontWeight: 700 }}>{s.symbol}</Typography>
                <Chip label={s.rating.label} size="small" sx={{
                  height: 15, fontSize: '0.48rem', fontWeight: 700,
                  bgcolor: alpha(s.rating.color, 0.1), color: s.rating.color,
                }} />
                {s.atBuyZone && <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: '#16a34a', flexShrink: 0 }} />}
              </Box>
              <Typography sx={{ fontSize: '0.52rem', color: 'text.secondary', ml: 3.5 }} noWrap>
                {getStockName(s.symbol, s.name)}
              </Typography>
              <Typography sx={{ fontSize: '0.52rem', color: 'text.secondary', ml: 3.5 }}>
                PE {s.pe}x · Y {s.divYield}% · ROE {s.roe}%
              </Typography>
            </Box>

            {/* Price */}
            <Box sx={{ textAlign: 'right', flexShrink: 0, mr: 0.5 }}>
              <Typography sx={{ fontSize: '0.72rem', fontWeight: 700 }}>{formatNumber(s.price, 0)}</Typography>
              {s.liveChange != null && (
                <Typography sx={{ fontSize: '0.55rem', fontWeight: 600, color: s.liveChange >= 0 ? '#16a34a' : '#dc2626' }}>
                  {s.liveChange >= 0 ? '+' : ''}{Number(s.liveChange).toFixed(1)}%
                </Typography>
              )}
            </Box>

            {/* Score gauge */}
            <ScoreGauge value={s.vs} size={32} stroke={3} color={s.rating.color} />
          </Box>
        );
      })}
    </Box>
  );
}
