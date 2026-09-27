import { useState, useMemo } from 'react';
import {
  Box, Typography, Card, CardContent, Chip, TextField, InputAdornment,
  Collapse, IconButton, LinearProgress, Skeleton, useTheme, useMediaQuery, alpha,
} from '@mui/material';
import {
  SearchRounded, ExpandMoreRounded, ExpandLessRounded,
  TrendingUpRounded, TrendingDownRounded, WarningAmberRounded,
  CheckCircleRounded, StarRounded,
} from '@mui/icons-material';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { psxStocksQuery, psxIndicesQuery, stockPriceMap } from '../../lib/marketQueries';
import { SECTORS, BUCKETS, AT_BUY_ZONE, MACRO, getAllResearchStocks, getResearchStock } from '../../data/psxResearch';
import { valuationTag, valueScore, overallRating, grahamNumber } from '../../lib/psxAnalysis';
import { formatNumber } from '../../lib/formatters';
import StockLogo from '../../components/StockLogo';

const SECTION_TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'sectors', label: 'Sectors' },
  { key: 'buckets', label: 'Portfolios' },
  { key: 'buyzone', label: 'Buy Zone' },
];

export default function Research() {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const isMobile = useMediaQuery('(max-width:768px)');
  const [activeTab, setActiveTab] = useState('overview');
  const [search, setSearch] = useState('');
  const [activeSector, setActiveSector] = useState(Object.keys(SECTORS)[0]);
  const [activeBucket, setActiveBucket] = useState('dividend');
  const [expandedStock, setExpandedStock] = useState(null);

  // Live prices
  const { data: liveStocks } = useQuery(psxStocksQuery());

  // Keyed upper-case, matching the research dataset's own symbols, so a lookup
  // cannot miss on casing alone.
  const livePriceMap = useMemo(() => stockPriceMap(liveStocks), [liveStocks]);

  const allStocks = useMemo(() => getAllResearchStocks(), []);

  const filteredStocks = useMemo(() => {
    if (!search) return [];
    const q = search.toLowerCase();
    return allStocks.filter(
      (s) => s.symbol.toLowerCase().includes(q) || s.name.toLowerCase().includes(q),
    );
  }, [search, allStocks]);

  const livePrice = (symbol) => livePriceMap[symbol]?.current || null;
  const liveChange = (symbol) => livePriceMap[symbol]?.change_pct ?? null;

  const cardSx = {
    borderRadius: 3, border: `1px solid ${theme.palette.divider}`,
    bgcolor: isDark ? 'rgba(255,255,255,0.02)' : '#fff',
  };

  const chipSx = (active) => ({
    fontWeight: 600, fontSize: '0.72rem', height: 30,
    bgcolor: active
      ? (isDark ? '#fff' : '#111')
      : (isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)'),
    color: active ? (isDark ? '#000' : '#fff') : 'text.secondary',
    border: active ? '1px solid' : '1px solid transparent',
    borderColor: active ? (isDark ? '#fff' : '#111') : 'transparent',
    '&:hover': { bgcolor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' },
  });

  return (
    <Box sx={{ pb: 4 }}>
      {/* Search Bar */}
      <TextField
        fullWidth size="small" placeholder="Search stocks..."
        value={search} onChange={(e) => setSearch(e.target.value)}
        InputProps={{
          startAdornment: <InputAdornment position="start"><SearchRounded sx={{ fontSize: 18, color: 'text.secondary' }} /></InputAdornment>,
        }}
        sx={{ mb: 2, '& .MuiOutlinedInput-root': { borderRadius: 2.5, fontSize: '0.82rem' } }}
      />

      {/* Search Results */}
      {search && filteredStocks.length > 0 && (
        <Card sx={{ ...cardSx, mb: 2 }}>
          <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
            {filteredStocks.slice(0, 8).map((s) => (
              <StockRow key={s.id} stock={s} livePrice={livePrice(s.symbol)} liveChange={liveChange(s.symbol)}
                expanded={expandedStock === s.id} onToggle={() => setExpandedStock(expandedStock === s.id ? null : s.id)}
                isDark={isDark} theme={theme} />
            ))}
          </CardContent>
        </Card>
      )}

      {/* Section Tabs */}
      {!search && (
        <>
          <Box sx={{ display: 'flex', gap: 0.75, mb: 2, overflowX: 'auto', pb: 0.5, '&::-webkit-scrollbar': { display: 'none' } }}>
            {SECTION_TABS.map((t) => (
              <Chip key={t.key} label={t.label} size="small" onClick={() => setActiveTab(t.key)} sx={chipSx(activeTab === t.key)} />
            ))}
          </Box>

          <AnimatePresence mode="wait">
            <motion.div key={activeTab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }}>
              {activeTab === 'overview' && <OverviewSection macro={MACRO} livePriceMap={livePriceMap} isDark={isDark} theme={theme} cardSx={cardSx} />}
              {activeTab === 'sectors' && (
                <SectorSection activeSector={activeSector} setActiveSector={setActiveSector}
                  livePrice={livePrice} liveChange={liveChange} isDark={isDark} theme={theme}
                  cardSx={cardSx} chipSx={chipSx} expandedStock={expandedStock} setExpandedStock={setExpandedStock} />
              )}
              {activeTab === 'buckets' && (
                <BucketSection activeBucket={activeBucket} setActiveBucket={setActiveBucket}
                  livePrice={livePrice} isDark={isDark} theme={theme} cardSx={cardSx} chipSx={chipSx} />
              )}
              {activeTab === 'buyzone' && <BuyZoneSection livePrice={livePrice} liveChange={liveChange} isDark={isDark} theme={theme} cardSx={cardSx} />}
            </motion.div>
          </AnimatePresence>
        </>
      )}
    </Box>
  );
}

/* ─── Overview Section ─── */
function OverviewSection({ macro, livePriceMap, isDark, theme, cardSx }) {
  const totalStocks = Object.values(SECTORS).reduce((s, sec) => s + sec.stocks.length, 0);
  const sectorCount = Object.keys(SECTORS).length;
  const buyZoneCount = AT_BUY_ZONE.length;

  // Fetch live KSE-100
  const { data: indices } = useQuery(psxIndicesQuery());
  const kse100 = useMemo(() => {
    const list = indices?.data;
    if (!Array.isArray(list)) return null;
    // The index board keys rows by `index_name` ("KSE100", no space).
    return list.find((i) => String(i.index_name ?? '').toUpperCase() === 'KSE100');
  }, [indices]);

  const stats = [
    { label: 'KSE-100', value: kse100?.current ? Number(kse100.current).toLocaleString() : macro.kse100.toLocaleString(), sub: kse100?.change_pct != null ? `${kse100.change_pct > 0 ? '+' : ''}${Number(kse100.change_pct).toFixed(2)}%` : '' },
    { label: 'Sectors', value: sectorCount },
    { label: 'Stocks Analyzed', value: totalStocks },
    { label: 'At Buy Zone', value: buyZoneCount },
  ];

  return (
    <Box>
      {/* Stats Grid */}
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 1.5, mb: 2 }}>
        {stats.map((s) => (
          <Card key={s.label} sx={{ ...cardSx }}>
            <CardContent sx={{ p: { xs: 1.2, sm: 1.5 }, '&:last-child': { pb: { xs: 1.2, sm: 1.5 } }, textAlign: 'center' }}>
              <Typography sx={{ fontSize: '0.65rem', color: 'text.secondary', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', mb: 0.3 }}>
                {s.label}
              </Typography>
              <Typography sx={{ fontSize: '1.15rem', fontWeight: 800, color: 'text.primary' }}>
                {s.value}
              </Typography>
              {s.sub && (
                <Typography sx={{ fontSize: '0.7rem', fontWeight: 600, color: String(s.sub).startsWith('+') ? '#16a34a' : String(s.sub).startsWith('-') ? '#dc2626' : 'text.secondary' }}>
                  {s.sub}
                </Typography>
              )}
            </CardContent>
          </Card>
        ))}
      </Box>

      {/* Market Context */}
      <Card sx={{ ...cardSx, mb: 2 }}>
        <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
          <Typography sx={{ fontSize: '0.78rem', fontWeight: 700, mb: 1 }}>Market Context</Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
            {[
              { l: 'Forward P/E', v: `${macro.forward_pe}x` },
              { l: 'PIB 5-Year', v: `${macro.pib_5yr}%` },
              { l: 'Dec 2026 Target', v: macro.target_2026.toLocaleString() },
              { l: 'Upside to Target', v: `+${(((macro.target_2026 - (kse100?.current || macro.kse100)) / (kse100?.current || macro.kse100)) * 100).toFixed(0)}%` },
            ].map((r) => (
              <Box key={r.l}>
                <Typography sx={{ fontSize: '0.65rem', color: 'text.secondary', fontWeight: 500 }}>{r.l}</Typography>
                <Typography sx={{ fontSize: '0.85rem', fontWeight: 700 }}>{r.v}</Typography>
              </Box>
            ))}
          </Box>
        </CardContent>
      </Card>

      {/* Methodology */}
      <Card sx={{ ...cardSx }}>
        <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
          <Typography sx={{ fontSize: '0.78rem', fontWeight: 700, mb: 1 }}>Methodology</Typography>
          {[
            { n: 'Graham Number', d: '√(22.5 × EPS × BVPS)' },
            { n: 'DDM', d: 'Dividend / (Return − Growth)' },
            { n: 'PEG Ratio', d: 'PE / Earnings Growth — below 1.0 = value' },
            { n: 'Relative PE', d: 'Stock PE / Sector PE — below 0.8 = cheap' },
            { n: 'EPV', d: 'EPS / Risk-Free Rate' },
            { n: 'DuPont ROE', d: 'Margin × Turnover × Leverage quality' },
          ].map((m) => (
            <Box key={m.n} sx={{ display: 'flex', gap: 1, mb: 0.8, alignItems: 'baseline' }}>
              <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, minWidth: 85, color: isDark ? '#fff' : '#111' }}>{m.n}</Typography>
              <Typography sx={{ fontSize: '0.7rem', color: 'text.secondary' }}>{m.d}</Typography>
            </Box>
          ))}
        </CardContent>
      </Card>
    </Box>
  );
}

/* ─── Sector Section ─── */
function SectorSection({ activeSector, setActiveSector, livePrice, liveChange, isDark, theme, cardSx, chipSx, expandedStock, setExpandedStock }) {
  const sectorKeys = Object.keys(SECTORS);
  const sector = SECTORS[activeSector];

  return (
    <Box>
      {/* Sector chips */}
      <Box sx={{ display: 'flex', gap: 0.5, mb: 2, overflowX: 'auto', pb: 0.5, '&::-webkit-scrollbar': { display: 'none' } }}>
        {sectorKeys.map((k) => (
          <Chip key={k} label={SECTORS[k].name} size="small" onClick={() => setActiveSector(k)}
            sx={{ ...chipSx(activeSector === k), whiteSpace: 'nowrap', flexShrink: 0 }} />
        ))}
      </Box>

      {/* Sector header */}
      <Card sx={{ ...cardSx, mb: 1.5 }}>
        <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
            <Typography sx={{ fontSize: '0.82rem', fontWeight: 700 }}>{sector.name}</Typography>
            <Box sx={{ display: 'flex', gap: 1.5 }}>
              <Typography sx={{ fontSize: '0.68rem', color: 'text.secondary' }}>PE <strong>{sector.sector_avg_pe}x</strong></Typography>
              <Typography sx={{ fontSize: '0.68rem', color: 'text.secondary' }}>Yield <strong>{sector.sector_avg_div_yield}%</strong></Typography>
            </Box>
          </Box>
          <Typography sx={{ fontSize: '0.7rem', color: 'text.secondary', lineHeight: 1.5 }}>{sector.outlook}</Typography>
        </CardContent>
      </Card>

      {/* Stocks */}
      {sector.stocks.map((s) => (
        <StockRow key={s.id} stock={{ ...s, sectorAvgPE: sector.sector_avg_pe }} livePrice={livePrice(s.symbol)}
          liveChange={liveChange(s.symbol)} expanded={expandedStock === s.id}
          onToggle={() => setExpandedStock(expandedStock === s.id ? null : s.id)}
          isDark={isDark} theme={theme} />
      ))}
    </Box>
  );
}

/* ─── Stock Row ─── */
function StockRow({ stock, livePrice: lp, liveChange: lc, expanded, onToggle, isDark, theme }) {
  const price = lp || stock.price;
  const change = lc;
  const vTag = valuationTag(price, stock.fvPE, stock.isTrap);
  const vs = valueScore({ ...stock, price, sectorAvgPE: stock.sectorAvgPE || 10 });
  const rating = overallRating(vs);
  const gn = grahamNumber(stock.eps, stock.bv);
  const upside = stock.fvPE > 0 ? (((stock.fvPE - price) / price) * 100) : null;

  return (
    <Card sx={{
      borderRadius: 2.5, mb: 1, border: `1px solid ${theme.palette.divider}`,
      bgcolor: stock.isTrap
        ? (isDark ? 'rgba(220,38,38,0.04)' : 'rgba(220,38,38,0.02)')
        : (isDark ? 'rgba(255,255,255,0.02)' : '#fff'),
    }}>
      <Box onClick={onToggle} sx={{ p: 1.5, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 1 }}>
        <StockLogo symbol={stock.symbol} size="md" />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
            <Typography sx={{ fontSize: '0.82rem', fontWeight: 700 }}>{stock.symbol}</Typography>
            {stock.atBuyZone && <Chip label="BUY ZONE" size="small" sx={{ height: 16, fontSize: '0.55rem', fontWeight: 700, bgcolor: 'rgba(5,150,105,0.12)', color: '#059669' }} />}
            {stock.isTrap && <Chip label="TRAP" size="small" sx={{ height: 16, fontSize: '0.55rem', fontWeight: 700, bgcolor: 'rgba(220,38,38,0.12)', color: '#dc2626' }} />}
            <Chip label={vTag.label} size="small" sx={{ height: 16, fontSize: '0.55rem', fontWeight: 600, bgcolor: vTag.bg, color: vTag.color }} />
          </Box>
          <Typography sx={{ fontSize: '0.65rem', color: 'text.secondary', mt: 0.2 }} noWrap>{stock.name}</Typography>
        </Box>
        <Box sx={{ textAlign: 'right', flexShrink: 0 }}>
          <Typography sx={{ fontSize: '0.85rem', fontWeight: 700 }}>
            {lp ? `Rs ${formatNumber(lp, 2)}` : `Rs ${formatNumber(stock.price, 0)}`}
          </Typography>
          {change != null && (
            <Typography sx={{ fontSize: '0.65rem', fontWeight: 600, color: change >= 0 ? '#16a34a' : '#dc2626' }}>
              {change >= 0 ? '+' : ''}{Number(change).toFixed(2)}%
            </Typography>
          )}
          {!lp && <Typography sx={{ fontSize: '0.58rem', color: 'text.secondary' }}>research</Typography>}
        </Box>
        <IconButton size="small" sx={{ ml: 0.5, p: 0.3 }}>
          {expanded ? <ExpandLessRounded sx={{ fontSize: 18 }} /> : <ExpandMoreRounded sx={{ fontSize: 18 }} />}
        </IconButton>
      </Box>

      <Collapse in={expanded}>
        <Box sx={{ px: 1.5, pb: 1.5 }}>
          {/* Rating bar */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.2 }}>
            <Typography sx={{ fontSize: '0.68rem', fontWeight: 700, color: rating.color }}>{rating.label}</Typography>
            <Box sx={{ flex: 1 }}>
              <LinearProgress variant="determinate" value={vs} sx={{
                height: 5, borderRadius: 3,
                bgcolor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
                '& .MuiLinearProgress-bar': { borderRadius: 3, bgcolor: rating.color },
              }} />
            </Box>
            <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, color: 'text.secondary' }}>{vs}/100</Typography>
          </Box>

          {/* Metrics grid */}
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(3, 1fr)' }, gap: 1, mb: 1.2 }}>
            {[
              { l: 'PE', v: stock.pe > 0 ? `${stock.pe}x` : '-' },
              { l: 'EPS', v: stock.eps > 0 ? formatNumber(stock.eps, 2) : '-' },
              { l: 'ROE', v: stock.roe > 0 ? `${stock.roe}%` : '-' },
              { l: 'Div Yield', v: stock.divYield > 0 ? `${stock.divYield}%` : '-' },
              { l: 'Payout', v: stock.payout > 0 ? `${stock.payout}%` : '-' },
              { l: 'Rev Growth', v: stock.revGr ? `${stock.revGr}%` : '-' },
              { l: 'Mkt Cap', v: stock.mcap || '-' },
              { l: 'Book Value', v: stock.bv > 0 ? formatNumber(stock.bv, 0) : '-' },
              { l: '1Y Change', v: stock.chg1y ? `${stock.chg1y > 0 ? '+' : ''}${stock.chg1y}%` : '-', color: stock.chg1y > 0 ? '#16a34a' : stock.chg1y < 0 ? '#dc2626' : undefined },
            ].map((m) => (
              <Box key={m.l}>
                <Typography sx={{ fontSize: '0.58rem', color: 'text.secondary', fontWeight: 500 }}>{m.l}</Typography>
                <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: m.color || 'text.primary' }}>{m.v}</Typography>
              </Box>
            ))}
          </Box>

          {/* Fair values */}
          {stock.fvPE > 0 && (
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(4, 1fr)' }, gap: 1, mb: 1.2,
              p: 1, borderRadius: 2, bgcolor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)' }}>
              {[
                { l: 'Fair (PE)', v: formatNumber(stock.fvPE, 0) },
                { l: 'Fair (BV)', v: stock.fvBV > 0 ? formatNumber(stock.fvBV, 0) : '-' },
                { l: 'Fair (DDM)', v: stock.fvDDM > 0 ? formatNumber(stock.fvDDM, 0) : '-' },
                { l: 'Graham #', v: gn ? formatNumber(gn, 0) : '-' },
              ].map((m) => (
                <Box key={m.l} sx={{ textAlign: 'center' }}>
                  <Typography sx={{ fontSize: '0.55rem', color: 'text.secondary' }}>{m.l}</Typography>
                  <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, color: isDark ? '#fff' : '#111' }}>{m.v}</Typography>
                </Box>
              ))}
            </Box>
          )}

          {/* Technical levels */}
          {(stock.support > 0 || stock.resistance > 0) && (
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(4, 1fr)' }, gap: 1, mb: 1.2 }}>
              {[
                { l: 'Support', v: stock.support > 0 ? formatNumber(stock.support, 0) : '-' },
                { l: 'Resistance', v: stock.resistance > 0 ? formatNumber(stock.resistance, 0) : '-' },
                { l: '50-DMA', v: stock.ma50 > 0 ? formatNumber(stock.ma50, 0) : '-' },
                { l: '200-DMA', v: stock.ma200 > 0 ? formatNumber(stock.ma200, 0) : '-' },
              ].map((m) => (
                <Box key={m.l}>
                  <Typography sx={{ fontSize: '0.55rem', color: 'text.secondary' }}>{m.l}</Typography>
                  <Typography sx={{ fontSize: '0.72rem', fontWeight: 600 }}>{m.v}</Typography>
                </Box>
              ))}
            </Box>
          )}

          {/* Upside bar */}
          {upside != null && (
            <Box sx={{ mb: 1.2 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.3 }}>
                <Typography sx={{ fontSize: '0.6rem', color: 'text.secondary' }}>Price vs Fair Value (PE)</Typography>
                <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, color: upside > 0 ? '#16a34a' : '#dc2626' }}>
                  {upside > 0 ? '+' : ''}{upside.toFixed(1)}% upside
                </Typography>
              </Box>
              <LinearProgress variant="determinate" value={Math.min(100, (price / stock.fvPE) * 100)} sx={{
                height: 5, borderRadius: 3,
                bgcolor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
                '& .MuiLinearProgress-bar': { borderRadius: 3, bgcolor: upside > 20 ? '#059669' : upside > 0 ? '#3b82f6' : '#dc2626' },
              }} />
            </Box>
          )}

          {/* Analysis */}
          <Typography sx={{ fontSize: '0.7rem', color: 'text.secondary', lineHeight: 1.6, fontStyle: 'italic',
            p: 1, borderRadius: 2, bgcolor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
            borderLeft: `3px solid ${rating.color}` }}>
            {stock.analysis}
          </Typography>
        </Box>
      </Collapse>
    </Card>
  );
}

/* ─── Bucket / Portfolio Section ─── */
function BucketSection({ activeBucket, setActiveBucket, livePrice, isDark, theme, cardSx, chipSx }) {
  const bucketKeys = Object.keys(BUCKETS);
  const bucket = BUCKETS[activeBucket];

  const enriched = useMemo(() => {
    return bucket.stocks.map((bs) => {
      const stock = getResearchStock(bs.id);
      const live = livePrice(bs.id);
      return { ...bs, stock, livePrice: live };
    }).filter((b) => b.stock);
  }, [activeBucket, bucket, livePrice]);

  const totalWeight = enriched.reduce((s, e) => s + e.weight, 0);
  const wYield = enriched.reduce((s, e) => s + (e.stock.divYield || 0) * e.weight, 0) / totalWeight;

  return (
    <Box>
      <Box sx={{ display: 'flex', gap: 0.5, mb: 2 }}>
        {bucketKeys.map((k) => (
          <Chip key={k} label={BUCKETS[k].name} size="small" onClick={() => setActiveBucket(k)} sx={chipSx(activeBucket === k)} />
        ))}
      </Box>

      {/* Bucket header */}
      <Card sx={{ ...cardSx, mb: 1.5 }}>
        <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
          <Typography sx={{ fontSize: '0.82rem', fontWeight: 700 }}>{bucket.name}</Typography>
          <Typography sx={{ fontSize: '0.7rem', color: isDark ? '#ccc' : '#333', fontWeight: 600, mb: 0.5 }}>{bucket.subtitle}</Typography>
          <Typography sx={{ fontSize: '0.7rem', color: 'text.secondary', mb: 1, lineHeight: 1.5 }}>{bucket.description}</Typography>

          <Box sx={{ display: 'flex', gap: 2, mb: 1 }}>
            <Box>
              <Typography sx={{ fontSize: '0.6rem', color: 'text.secondary' }}>Wtd Yield</Typography>
              <Typography sx={{ fontSize: '0.85rem', fontWeight: 700, color: '#16a34a' }}>{wYield.toFixed(1)}%</Typography>
            </Box>
            <Box>
              <Typography sx={{ fontSize: '0.6rem', color: 'text.secondary' }}>Stocks</Typography>
              <Typography sx={{ fontSize: '0.85rem', fontWeight: 700 }}>{enriched.length}</Typography>
            </Box>
          </Box>

          <Typography sx={{ fontSize: '0.65rem', fontWeight: 600, color: 'text.secondary', mb: 0.5 }}>Criteria</Typography>
          {bucket.criteria.map((c, i) => (
            <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.3 }}>
              <CheckCircleRounded sx={{ fontSize: 12, color: '#059669' }} />
              <Typography sx={{ fontSize: '0.65rem', color: 'text.secondary' }}>{c}</Typography>
            </Box>
          ))}
        </CardContent>
      </Card>

      {/* Bucket stocks */}
      {enriched.map((e) => (
        <Card key={e.id} sx={{ ...cardSx, mb: 1 }}>
          <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                <Typography sx={{ fontSize: '0.8rem', fontWeight: 700 }}>{e.id}</Typography>
                <Chip label={e.sector} size="small" sx={{ height: 16, fontSize: '0.55rem' }} />
              </Box>
              <Box sx={{ textAlign: 'right' }}>
                <Typography sx={{ fontSize: '0.78rem', fontWeight: 700 }}>
                  {e.livePrice ? `Rs ${formatNumber(e.livePrice, 2)}` : `Rs ${formatNumber(e.stock.price, 0)}`}
                </Typography>
              </Box>
            </Box>
            <Box sx={{ display: 'flex', gap: 2, mb: 0.5 }}>
              <Typography sx={{ fontSize: '0.65rem', color: 'text.secondary' }}>Weight <strong>{e.weight}%</strong></Typography>
              <Typography sx={{ fontSize: '0.65rem', color: 'text.secondary' }}>Yield <strong>{e.stock.divYield}%</strong></Typography>
              <Typography sx={{ fontSize: '0.65rem', color: 'text.secondary' }}>PE <strong>{e.stock.pe}x</strong></Typography>
            </Box>
            <Typography sx={{ fontSize: '0.65rem', color: 'text.secondary', lineHeight: 1.5 }}>{e.logic}</Typography>
          </CardContent>
        </Card>
      ))}
    </Box>
  );
}

/* ─── Buy Zone Section ─── */
function BuyZoneSection({ livePrice, liveChange, isDark, theme, cardSx }) {
  return (
    <Box>
      <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary', mb: 1.5, lineHeight: 1.5 }}>
        Stocks currently trading at or near technically significant buy zones based on support levels, chart patterns, and fundamental value.
      </Typography>
      {AT_BUY_ZONE.map((bz) => {
        const stock = getResearchStock(bz.id);
        const live = livePrice(bz.id);
        const lc = liveChange(bz.id);
        const price = live || bz.price;

        return (
          <Card key={bz.id} sx={{
            ...cardSx, mb: 1,
            borderLeft: `3px solid #059669`,
          }}>
            <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                <Box>
                  <Typography sx={{ fontSize: '0.82rem', fontWeight: 700 }}>{bz.id}</Typography>
                  {stock && <Typography sx={{ fontSize: '0.62rem', color: 'text.secondary' }}>{stock.name}</Typography>}
                </Box>
                <Box sx={{ textAlign: 'right' }}>
                  <Typography sx={{ fontSize: '0.85rem', fontWeight: 700 }}>Rs {formatNumber(price, 2)}</Typography>
                  {lc != null && (
                    <Typography sx={{ fontSize: '0.65rem', fontWeight: 600, color: lc >= 0 ? '#16a34a' : '#dc2626' }}>
                      {lc >= 0 ? '+' : ''}{Number(lc).toFixed(2)}%
                    </Typography>
                  )}
                </Box>
              </Box>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(3, 1fr)' }, gap: 1, mb: 0.5 }}>
                <Box>
                  <Typography sx={{ fontSize: '0.55rem', color: 'text.secondary' }}>Buy Zone</Typography>
                  <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, color: '#059669' }}>{bz.buyZone}</Typography>
                </Box>
                <Box>
                  <Typography sx={{ fontSize: '0.55rem', color: 'text.secondary' }}>Fair Value</Typography>
                  <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, color: isDark ? '#fff' : '#111' }}>{bz.fair}</Typography>
                </Box>
                <Box>
                  <Typography sx={{ fontSize: '0.55rem', color: 'text.secondary' }}>Pattern</Typography>
                  <Typography sx={{ fontSize: '0.68rem', fontWeight: 600 }}>{bz.concept}</Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        );
      })}
    </Box>
  );
}
