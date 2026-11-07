import { useState } from 'react';
import {
  Box, Card, CardContent, Typography, Grid, Skeleton, Tooltip, IconButton, Alert, Button, useMediaQuery, useTheme,
} from '@mui/material';
import {
  UploadFileRounded, ReceiptLongRounded, ExpandMoreRounded, InfoOutlined,
} from '@mui/icons-material';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { supabase } from '../../lib/supabase';
import { useAppStore } from '../../store/appStore';
import { dbErrorHandler } from '../../lib/dbErrors';
import { useMfPortfolio, MF_LEDGER_KEY } from '../../lib/mf/useMfPortfolio';
import { formatCurrency, formatPercent, getPnLColor, shortFundName } from '../../lib/formatters';
import { CountUp } from '../../components/motion';
import { pieSector, makeOuterLabel, DonutCenter } from '../../components/charts';
import { clickable } from '../../lib/a11y';
import ImportDialog from './ImportDialog';
import AmcLogo from './AmcLogo';
import { ProfitDetailsDialog, FundDetailsDialog, GrowthChart } from './MFDetails';

const profitColors = ['#22c55e', '#4ade80', '#86efac', '#bbf7d0'];
const lossColors = ['#ef4444', '#f87171', '#fca5a5', '#fecaca'];
const renderOuterLabel = makeOuterLabel((p) => p.shortName || p.name);
const num = (d) => (d === null || d === undefined ? null : Number(d.toString()));
const AMC_SHORT = { atlas: 'Atlas', mcb: 'MCB', meezan: 'Meezan', nbp: 'NBP', ubl: 'UBL' };

export default function MFDashboard() {
  const isMobile = useMediaQuery('(max-width:768px)');
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const navigate = useNavigate();
  const qc = useQueryClient();
  const showSnackbar = useAppStore((s) => s.showSnackbar);
  const showConfirm = useAppStore((s) => s.showConfirm);
  const [activeIdx, setActiveIdx] = useState(-1);
  const [importOpen, setImportOpen] = useState(false);
  const [profitOpen, setProfitOpen] = useState(false);
  const [fund, setFund] = useState(null);
  const [showClosed, setShowClosed] = useState(false);
  const { portfolio, isLoading } = useMfPortfolio();

  const supersede = useMutation({
    mutationFn: async (fundId) => {
      const { data, error } = await supabase.rpc('mf_supersede_manual', { p_fund_id: fundId });
      if (error) throw error;
      return data;
    },
    onSuccess: (n) => { showSnackbar(`${n} manual entr${n === 1 ? 'y' : 'ies'} superseded (kept for audit)`, 'success'); qc.invalidateQueries({ queryKey: [MF_LEDGER_KEY] }); },
    onError: dbErrorHandler(showSnackbar, 'Could not supersede'),
  });

  const header = (
    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: isMobile ? 1.5 : 2 }}>
      <Typography sx={{ fontSize: isMobile ? '1.2rem' : '1.45rem', fontWeight: 800, letterSpacing: '-0.03em' }}>Mutual Funds</Typography>
      <Box sx={{ display: 'flex', gap: 0.5 }}>
        <Tooltip title="Fund transactions"><IconButton aria-label="Fund transactions" onClick={() => navigate('/funds/transactions')}><ReceiptLongRounded /></IconButton></Tooltip>
        <Tooltip title="Import statement (PDF)">
          <IconButton aria-label="Import statement" onClick={() => setImportOpen(true)}
            sx={{ bgcolor: isDark ? '#fff' : '#111', color: isDark ? '#111' : '#fff', '&:hover': { bgcolor: isDark ? '#e5e5e5' : '#333' } }}>
            <UploadFileRounded />
          </IconButton>
        </Tooltip>
      </Box>
    </Box>
  );

  if (isLoading || !portfolio) {
    return (
      <Box>
        {header}
        <Grid container spacing={1.5} sx={{ mb: 1.5 }}>
          <Grid size={{ xs: 12, md: 8 }}><Skeleton variant="rounded" height={250} /></Grid>
          <Grid size={{ xs: 12, md: 4 }}><Skeleton variant="rounded" height={250} /></Grid>
        </Grid>
        <Grid container spacing={1.5}>{[1, 2, 3, 4].map((i) => <Grid size={{ xs: 6, md: 3 }} key={i}><Skeleton variant="rounded" height={84} /></Grid>)}</Grid>
      </Box>
    );
  }

  const t = portfolio.totals;
  const open = portfolio.positions.filter((p) => p.isOpen);
  const closed = portfolio.positions.filter((p) => !p.isOpen);

  if (!portfolio.positions.length) {
    return (
      <Box>
        {header}
        <Card sx={{ p: isMobile ? 3 : 5, textAlign: 'center' }}>
          <UploadFileRounded sx={{ fontSize: 44, color: 'text.disabled', mb: 1 }} />
          <Typography sx={{ fontWeight: 700, mb: 0.5 }}>Import your first statement</Typography>
          <Typography sx={{ fontSize: '0.8rem', color: 'text.secondary', mb: 2.5, maxWidth: 420, mx: 'auto' }}>
            Upload the PDF account statement from Atlas, MCB, Meezan, NBP or UBL. Transactions, CGT and refunds are read
            from it and your profit is calculated with FIFO.
          </Typography>
          <Button variant="contained" disableElevation startIcon={<UploadFileRounded />} onClick={() => setImportOpen(true)} sx={{ textTransform: 'none', borderRadius: 2.5 }}>
            Import statement
          </Button>
        </Card>
        <ImportDialog open={importOpen} onClose={() => setImportOpen(false)} />
      </Box>
    );
  }

  const net = num(t.netProfit) ?? 0;
  const pnl = net >= 0 ? '#15803d' : '#b91c1c';
  const xirr = t.xirr ? num(t.xirr) * 100 : null;
  const simple = t.returnPct !== null ? num(t.returnPct) : null;
  const stats = [
    { label: 'Current value', value: num(t.marketValue) ?? 0, logic: 'Units you hold × each fund\'s latest repurchase price (NAV). Click for the full breakdown.' },
    { label: 'Invested', value: num(t.externalInvested) ?? 0, logic: 'Every rupee you paid into your funds. Moving money between funds (switches) is not counted twice.' },
    { label: 'Net profit', value: net, color: pnl, logic: 'Value now + money you received − money you invested. Equals realized + unrealized gains + dividends − CGT actually charged − other charges.' },
    { label: xirr !== null ? 'Return · XIRR' : 'Return', value: xirr ?? simple ?? 0, format: formatPercent, color: pnl,
      logic: xirr !== null ? `Annualised, accounting for when money went in and out. Simple return: ${simple !== null ? formatPercent(simple) : '—'}.` : 'Net profit ÷ invested.' },
  ];

  let profitIdx = 0, lossIdx = 0;
  const pie = open
    .map((p) => ({ name: p.fundName ?? 'Fund', shortName: shortFundName(p.fundName ?? ''), value: Math.round(num(p.marketValue) ?? 0), gainLoss: num(p.netProfit) ?? 0 }))
    .sort((a, b) => b.value - a.value)
    .map((d) => ({ ...d, color: d.gainLoss >= 0 ? profitColors[profitIdx++ % profitColors.length] : lossColors[lossIdx++ % lossColors.length] }));
  const chartH = isMobile ? 260 : 290;

  return (
    <Box sx={{ pb: isMobile ? 1 : 0 }}>
      {header}

      {portfolio.manualOverlaps.length > 0 && (
        <Alert severity="info" sx={{ mb: 1.5, borderRadius: 2.5, fontSize: '0.74rem', py: 0.25 }}
          action={portfolio.manualOverlaps.length === 1 ? (
            <Button size="small" color="inherit" disabled={supersede.isPending} sx={{ textTransform: 'none' }}
              onClick={() => showConfirm('Use statement data?', `Manual entries for ${portfolio.manualOverlaps[0].fundName} will be reversed (kept for audit).`, () => supersede.mutate(portfolio.manualOverlaps[0].fundId))}>
              Fix
            </Button>
          ) : null}>
          Manual entries overlap {portfolio.manualOverlaps.map((o) => o.fundName).join(', ')}, which your statements now cover.
          {portfolio.manualOverlaps.length > 1 && (
            <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', mt: 0.75 }}>
              {portfolio.manualOverlaps.map((o) => (
                <Button key={o.fundId} size="small" variant="outlined" color="inherit" sx={{ textTransform: 'none', fontSize: '0.68rem', py: 0 }}
                  onClick={() => showConfirm('Use statement data?', `Manual entries for ${o.fundName} will be reversed (kept for audit).`, () => supersede.mutate(o.fundId))}>
                  {o.fundName}
                </Button>
              ))}
            </Box>
          )}
        </Alert>
      )}

      {/* ── Figures ── */}
      <Grid container spacing={1.5} sx={{ mb: 1.5 }}>
        {stats.map((s, i) => (
          <Grid size={{ xs: 6, md: 3 }} key={s.label}>
            <Tooltip title={s.logic} arrow placement="top" enterDelay={250}>
              <Card {...clickable(() => setProfitOpen(true))} aria-label={`${s.label}: open breakdown`}
                sx={{ cursor: 'pointer', transition: 'transform .15s, box-shadow .15s', '&:hover': { transform: 'translateY(-1px)', boxShadow: isDark ? '0 6px 18px rgba(255,255,255,0.04)' : '0 6px 18px rgba(0,0,0,0.07)' } }}>
                <CardContent sx={{ p: isMobile ? 1.5 : 1.75, '&:last-child': { pb: isMobile ? 1.5 : 1.75 } }}>
                  <Typography sx={{ fontSize: '0.62rem', color: 'text.secondary', fontWeight: 500, letterSpacing: '0.05em', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 0.4 }}>
                    {s.label}<InfoOutlined sx={{ fontSize: 11, opacity: 0.5 }} />
                  </Typography>
                  <Typography sx={{ fontSize: isMobile ? '1.02rem' : '1.2rem', fontWeight: 750, color: s.color || 'text.primary', fontFeatureSettings: '"tnum"', mt: 0.25 }}>
                    <CountUp to={s.value} format={s.format || formatCurrency} delay={i * 0.04} />
                  </Typography>
                </CardContent>
              </Card>
            </Tooltip>
          </Grid>
        ))}
      </Grid>

      {/* ── Two charts ── */}
      <Grid container spacing={1.5} sx={{ mb: 2 }}>
        <Grid size={{ xs: 12, md: 8 }}>
          <Card sx={{ height: '100%' }}>
            <CardContent sx={{ p: isMobile ? 1.5 : 2, '&:last-child': { pb: 1 } }}>
              <Typography sx={{ fontSize: '0.74rem', fontWeight: 600, mb: 0.5 }}>Growth</Typography>
              <GrowthChart series={portfolio.series} height={chartH} />
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, md: 4 }}>
          <Card sx={{ height: '100%' }}>
            <CardContent sx={{ p: isMobile ? 1.5 : 2, '&:last-child': { pb: 1.5 } }}>
              <Typography sx={{ fontSize: '0.74rem', fontWeight: 600, mb: 0.5 }}>Allocation</Typography>
              {pie.length ? (
                <Box sx={{ position: 'relative' }}>
                  <ResponsiveContainer width="100%" height={chartH}>
                    <PieChart>
                      <Pie data={pie} dataKey="value" cx="50%" cy="50%"
                        innerRadius={isMobile ? 55 : 68} outerRadius={isMobile ? 78 : 96}
                        paddingAngle={4} strokeWidth={0} shape={pieSector}
                        label={activeIdx < 0 ? renderOuterLabel : false} labelLine={false}
                        onMouseEnter={(_, i) => setActiveIdx(i)} onMouseLeave={() => setActiveIdx(-1)}>
                        {pie.map((d, i) => <Cell key={i} fill={d.color} />)}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                  <DonutCenter data={pie} activeIndex={activeIdx} restingValue={formatCurrency(num(t.marketValue) ?? 0)}
                    restingLabel="portfolio" format={formatCurrency} width={isMobile ? 90 : 115} compact={isMobile} />
                </Box>
              ) : (
                <Box sx={{ height: chartH, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Typography sx={{ fontSize: '0.76rem', color: 'text.secondary' }}>No open holdings</Typography>
                </Box>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* ── Holdings ── */}
      <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', mb: 1 }}>
        <Typography sx={{ fontSize: '0.78rem', fontWeight: 700 }}>Holdings <Box component="span" sx={{ color: 'text.secondary', fontWeight: 500 }}>· {open.length}</Box></Typography>
      </Box>
      <Grid container spacing={1.25}>
        {open.map((p, i) => <Grid size={{ xs: 12, sm: 6, lg: 4 }} key={p.key}><FundCard p={p} i={i} onOpen={() => setFund(p)} /></Grid>)}
      </Grid>

      {closed.length > 0 && (
        <>
          <Button size="small" onClick={() => setShowClosed((v) => !v)} endIcon={<ExpandMoreRounded sx={{ transform: showClosed ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} />}
            sx={{ textTransform: 'none', color: 'text.secondary', mt: 1.5, mb: 1 }}>
            {showClosed ? 'Hide' : 'Show'} closed positions ({closed.length})
          </Button>
          {showClosed && (
            <Grid container spacing={1.25}>
              {closed.map((p, i) => <Grid size={{ xs: 12, sm: 6, lg: 4 }} key={p.key}><FundCard p={p} i={i} closed onOpen={() => setFund(p)} /></Grid>)}
            </Grid>
          )}
        </>
      )}

      <ImportDialog open={importOpen} onClose={() => setImportOpen(false)} />
      <ProfitDetailsDialog open={profitOpen} onClose={() => setProfitOpen(false)} totals={t} />
      <FundDetailsDialog open={!!fund} onClose={() => setFund(null)} position={fund} />
    </Box>
  );
}

/** Compact holding card: who, how much, how it's doing. Everything else is one click away. */
function FundCard({ p, i, closed, onOpen }) {
  const value = num(p.marketValue);
  const net = num(p.netProfit);
  const invested = num(p.invested) ?? 0;
  const pct = net !== null && invested > 0 ? (net / invested) * 100 : null;
  const color = getPnLColor(net ?? 0);
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 8) * 0.03 }} style={{ height: '100%' }}>
      <Card {...clickable(onOpen)} aria-label={`${p.fundName}: open details`}
        sx={{ height: '100%', cursor: 'pointer', opacity: closed ? 0.8 : 1, transition: 'transform .15s, box-shadow .15s, border-color .15s',
          '&:hover': { transform: 'translateY(-1px)', boxShadow: '0 6px 18px rgba(0,0,0,0.07)' } }}>
        <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 }, display: 'flex', alignItems: 'center', gap: 1.25 }}>
          <AmcLogo code={p.amcCode} name={p.amcName} size={38} />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography sx={{ fontSize: '0.8rem', fontWeight: 650, lineHeight: 1.25, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
              {p.fundName ?? 'Fund'}
            </Typography>
            <Typography sx={{ fontSize: '0.64rem', color: 'text.secondary', mt: 0.2 }}>
              {AMC_SHORT[p.amcCode] ?? p.amcName ?? ''}{p.price?.stale ? ' · price outdated' : ''}{!p.realizedComplete ? ' · incomplete' : ''}
            </Typography>
          </Box>
          <Box sx={{ textAlign: 'right', flexShrink: 0 }}>
            <Typography sx={{ fontSize: '0.84rem', fontWeight: 700, fontFeatureSettings: '"tnum"' }}>
              {closed ? 'Closed' : value === null ? '—' : formatCurrency(value)}
            </Typography>
            <Typography sx={{ fontSize: '0.68rem', fontWeight: 600, color, fontFeatureSettings: '"tnum"' }}>
              {net === null ? '—' : `${net >= 0 ? '+' : ''}${formatCurrency(net)}`}{pct !== null ? ` · ${formatPercent(pct)}` : ''}
            </Typography>
          </Box>
        </CardContent>
      </Card>
    </motion.div>
  );
}
