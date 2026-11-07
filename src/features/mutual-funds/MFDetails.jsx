import {
  Box, Dialog, DialogContent, Typography, IconButton, Chip, Divider, Table, TableBody, TableCell, TableHead, TableRow,
  Tooltip, useMediaQuery, useTheme,
} from '@mui/material';
import { CloseRounded, InfoOutlined } from '@mui/icons-material';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, ResponsiveContainer, Legend } from 'recharts';
import { formatCurrency, formatNumber, formatPercent, getPnLColor } from '../../lib/formatters';
import { TYPE_LABEL, fmtDate } from './mfLabels';
import AmcLogo from './AmcLogo';

const num = (d) => (d === null || d === undefined ? null : Number(d.toString()));
const money = (d, dp = 2) => (d === null || d === undefined ? '—' : formatCurrency(num(d), dp));
const METHOD = {
  statement_stated: 'FIFO — stated on the AMC statement',
  statement_consistent: 'FIFO — matches the CGT your statements report',
  industry_default: 'FIFO — standard practice (Sec. 37A / NCCPL)',
};
const SOURCE = { mufap: 'MUFAP', statement: 'your statement' };

function Row({ label, value, hint, strong, color, indent }) {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', py: 0.7, pl: indent ? 2 : 0 }}>
      <Typography sx={{ fontSize: strong ? '0.82rem' : '0.76rem', fontWeight: strong ? 700 : 400, color: strong ? 'text.primary' : 'text.secondary', display: 'flex', gap: 0.5, alignItems: 'center' }}>
        {label}
        {hint && <Tooltip title={hint}><InfoOutlined sx={{ fontSize: 13, opacity: 0.6 }} /></Tooltip>}
      </Typography>
      <Typography sx={{ fontSize: strong ? '0.9rem' : '0.8rem', fontWeight: strong ? 800 : 600, color, fontFeatureSettings: '"tnum"' }}>{value}</Typography>
    </Box>
  );
}

function Shell({ open, onClose, title, subtitle, children, wide, icon }) {
  const isMobile = useMediaQuery('(max-width:768px)');
  const theme = useTheme();
  return (
    <Dialog open={open} onClose={onClose} maxWidth={wide ? 'md' : 'sm'} fullWidth fullScreen={isMobile}
      slotProps={{ paper: { sx: { borderRadius: isMobile ? 0 : 4, bgcolor: theme.palette.mode === 'dark' ? '#0a0a0a' : '#fff' } } }}>
      <DialogContent sx={{ p: isMobile ? 2 : 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, mb: 2 }}>
          {icon}
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography sx={{ fontSize: '1.05rem', fontWeight: 800, letterSpacing: '-0.02em' }}>{title}</Typography>
            {subtitle && <Typography sx={{ fontSize: '0.72rem', color: 'text.secondary', mt: 0.25 }}>{subtitle}</Typography>}
          </Box>
          <IconButton aria-label="Close" onClick={onClose} size="small"><CloseRounded /></IconButton>
        </Box>
        {children}
      </DialogContent>
    </Dialog>
  );
}

/** Profit, tax and charges: every component behind the headline numbers. */
export function ProfitDetailsDialog({ open, onClose, totals }) {
  if (!totals) return null;
  const t = totals;
  const net = num(t.netProfit) ?? 0;
  return (
    <Shell open={open} onClose={onClose} title="How your profit is calculated"
      subtitle="Every figure is worked out from your approved transactions. CGT deducted and refunded is exactly what your statements report.">
      <Typography sx={{ fontSize: '0.68rem', fontWeight: 700, color: 'text.secondary', letterSpacing: '0.05em', textTransform: 'uppercase', mb: 0.5 }}>Portfolio</Typography>
      <Row label="Current value" value={money(t.marketValue)} hint="Units held × latest repurchase price/NAV of each fund" />
      <Row label="Money invested" value={money(t.externalInvested)} hint="Everything you paid in. Switches between funds are not new money." />
      <Row label="Money received" value={money(t.externalReceived)} hint="Redemptions, cash dividends and cash refunds paid to you" />
      <Row label="Cost of units still held" value={money(t.costOpen)} hint="FIFO: the oldest units are treated as sold first" />
      <Divider sx={{ my: 1 }} />
      <Typography sx={{ fontSize: '0.68rem', fontWeight: 700, color: 'text.secondary', letterSpacing: '0.05em', textTransform: 'uppercase', mb: 0.5 }}>Profit</Typography>
      <Row label="Realized gain" value={money(t.realized)} color={getPnLColor(num(t.realized))} hint="On units already sold or switched: proceeds − their FIFO cost" />
      <Row label="Unrealized gain" value={money(t.unrealized)} color={getPnLColor(num(t.unrealized))} hint="On units you still hold: value − their FIFO cost" />
      <Row label="Distributions" value={money(t.distributions)} hint="Dividends and refund-of-capital units" />
      <Row label="Gross profit" value={money(t.grossProfit)} strong />
      <Divider sx={{ my: 1 }} />
      <Typography sx={{ fontSize: '0.68rem', fontWeight: 700, color: 'text.secondary', letterSpacing: '0.05em', textTransform: 'uppercase', mb: 0.5 }}>Capital gains tax (from your statements)</Typography>
      <Row label="CGT deducted" value={money(t.cgtDeducted)} indent />
      <Row label="CGT refunded" value={money(t.cgtRefunded)} indent />
      <Row label="CGT reversed" value={money(t.cgtReversed)} indent />
      <Row label="Net CGT actually charged" value={money(t.netCgt)} strong hint="Deducted − refunded − reversed. Can go negative if refunds exceed deductions." />
      <Row label="Other taxes & charges" value={money(t.otherCharges)} hint="Zakat, withholding tax and charges deducted by the AMC" />
      <Divider sx={{ my: 1 }} />
      <Row label="Net profit" value={money(t.netProfit)} strong color={getPnLColor(net)} hint="Gross profit − net CGT − other charges = value + received − invested" />
      <Row label="Return on money invested" value={t.returnPct === null ? '—' : formatPercent(num(t.returnPct))} />
      <Row label="Annualised return (XIRR)" value={t.xirr ? formatPercent(num(t.xirr) * 100) : '—'} hint="Money-weighted: accounts for when each rupee went in and came out" />
      <Box sx={{ mt: 1.5, p: 1.5, borderRadius: 2, bgcolor: 'action.hover' }}>
        <Row label="Expected CGT if you sold today (estimate)" value={money(t.expectedCgt)}
          hint="15% (individual filer rate) on unrealized gains. An estimate, not tax charged. Losses owe nothing." />
        <Row label="Net profit after expected CGT" value={money(t.netAfterExpectedCgt)} strong color={getPnLColor(num(t.netAfterExpectedCgt))} />
      </Box>
    </Shell>
  );
}

/** Everything about one fund position. */
export function FundDetailsDialog({ open, onClose, position: p }) {
  if (!p) return null;
  const units = num(p.units) ?? 0;
  const avg = units > 0 && p.costKnown ? num(p.costOpen) / units : null;
  const entries = [...(p.entries ?? [])].sort((a, b) => b.trade_date.localeCompare(a.trade_date) || b.seq - a.seq);
  const r = p.fundReturns ?? {};
  return (
    <Shell open={open} onClose={onClose} wide title={p.fundName ?? 'Fund'} icon={<AmcLogo code={p.amcCode} name={p.amcName} size={44} />}
      subtitle={[p.amcName, p.unitClass, p.category, p.account?.account_ref_masked && `Account ${p.account.account_ref_masked}`].filter(Boolean).join(' · ')}>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, columnGap: 4 }}>
        <Box>
          <Row label="Units held" value={formatNumber(units, 4)} />
          <Row label="Current value" value={money(p.marketValue)} strong />
          <Row label="Price" value={p.price ? formatNumber(num(p.price.value), 4) : '—'}
            hint={p.price ? `${p.price.kind === 'repurchase' ? 'Repurchase price' : 'NAV'} on ${fmtDate(p.price.date)} from ${SOURCE[p.price.source] ?? p.price.source}${p.price.stale ? ' — older than 4 days' : ''}` : 'No price available'} />
          <Row label="Average cost (FIFO, units held)" value={avg === null ? '—' : formatNumber(avg, 4)} />
          <Row label="Cost of units held" value={money(p.costOpen)} />
          <Row label="Invested in this fund" value={money(p.invested)} hint="Purchases and switches in" />
          <Row label="Received from this fund" value={money(p.received)} hint="Redemptions and switches out, after tax" />
        </Box>
        <Box>
          <Row label="Unrealized gain" value={money(p.unrealized)} color={getPnLColor(num(p.unrealized))} />
          <Row label="Realized gain" value={money(p.realized)} color={getPnLColor(num(p.realized))} />
          <Row label="Distributions" value={money(p.distributions)} />
          <Row label="CGT deducted" value={money(p.cgtDeducted)} />
          <Row label="CGT refunded / reversed" value={money(p.cgtRefunded && p.cgtReversed ? p.cgtRefunded.plus(p.cgtReversed) : null)} />
          <Row label="Net profit" value={money(p.netProfit)} strong color={getPnLColor(num(p.netProfit))} />
          <Row label="Expected CGT if sold today (15%, estimate)" value={money(p.expectedCgt)} />
          <Row label="Annualised return (XIRR)" value={p.xirr ? formatPercent(num(p.xirr) * 100) : '—'} />
        </Box>
      </Box>

      <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', my: 1.5 }}>
        <Chip size="small" label={METHOD[p.method.evidence] ?? 'FIFO'} />
        {r.ytd != null && <Chip size="small" variant="outlined" label={`Fund YTD ${formatPercent(Number(r.ytd))}`} />}
        {r.d365 != null && <Chip size="small" variant="outlined" label={`Fund 1Y ${formatPercent(Number(r.d365))}`} />}
        {!p.realizedComplete && <Chip size="small" color="warning" variant="outlined" label="Profit incomplete — an earlier statement may be missing" />}
      </Box>
      {(r.ytd != null || r.d365 != null) && (
        <Typography sx={{ fontSize: '0.64rem', color: 'text.secondary', mb: 1.5 }}>
          Fund returns are MUFAP's published NAV performance, not your personal return (which depends on when you invested).
        </Typography>
      )}

      {p.lots.length > 0 && (
        <>
          <Typography sx={{ fontSize: '0.74rem', fontWeight: 700, mb: 0.75 }}>Units held, oldest first (FIFO lots)</Typography>
          <Table size="small" sx={{ mb: 2, '& td, & th': { fontSize: '0.7rem', fontFeatureSettings: '"tnum"' } }}>
            <TableHead><TableRow><TableCell>Bought</TableCell><TableCell align="right">Units</TableCell><TableCell align="right">Cost</TableCell><TableCell align="right">Cost / unit</TableCell></TableRow></TableHead>
            <TableBody>
              {p.lots.map((l, i) => (
                <TableRow key={i}>
                  <TableCell>{fmtDate(l.date)}</TableCell>
                  <TableCell align="right">{formatNumber(num(l.units), 4)}</TableCell>
                  <TableCell align="right">{l.costKnown ? formatNumber(num(l.cost), 2) : 'unknown'}</TableCell>
                  <TableCell align="right">{l.costKnown && num(l.units) > 0 ? formatNumber(num(l.cost) / num(l.units), 4) : '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </>
      )}

      <Typography sx={{ fontSize: '0.74rem', fontWeight: 700, mb: 0.75 }}>Transactions ({entries.length})</Typography>
      <Box sx={{ maxHeight: 300, overflow: 'auto' }}>
        <Table size="small" stickyHeader sx={{ '& td, & th': { fontSize: '0.7rem', fontFeatureSettings: '"tnum"' } }}>
          <TableHead><TableRow><TableCell>Date</TableCell><TableCell>Type</TableCell><TableCell align="right">Units</TableCell><TableCell align="right">NAV</TableCell><TableCell align="right">Amount</TableCell></TableRow></TableHead>
          <TableBody>
            {entries.map((e) => {
              const u = e.unit_delta !== null ? Number(e.unit_delta) : null;
              return (
                <TableRow key={e.id} sx={{ opacity: e.reverses_entry_id ? 0.5 : 1 }}>
                  <TableCell>{fmtDate(e.trade_date)}</TableCell>
                  <TableCell>{TYPE_LABEL[e.entry_type] ?? e.entry_type}{e.reverses_entry_id ? ' (reversal)' : ''}</TableCell>
                  <TableCell align="right" sx={{ color: u < 0 ? '#b91c1c' : undefined }}>{u === null ? '—' : formatNumber(u, 4)}</TableCell>
                  <TableCell align="right">{e.nav ? formatNumber(Number(e.nav), 4) : '—'}</TableCell>
                  <TableCell align="right">{formatNumber(Number((u < 0 ? e.net_amount : e.gross_amount) ?? e.gross_amount ?? 0), 2)}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Box>
    </Shell>
  );
}

function GrowthTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <Box sx={{ bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', borderRadius: 2, px: 1.5, py: 1, boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}>
      <Typography sx={{ fontSize: '0.66rem', color: 'text.secondary', mb: 0.25 }}>{fmtDate(label)}</Typography>
      {payload.map((p) => (
        <Typography key={p.dataKey} sx={{ fontSize: '0.72rem', fontWeight: 600, color: p.color }}>{p.name}: {formatCurrency(p.value)}</Typography>
      ))}
    </Box>
  );
}

/** Invested (cost of units held) vs market value, month by month. */
export function GrowthChart({ series, height = 260 }) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  if (!series?.length) {
    return <Box sx={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Typography sx={{ fontSize: '0.78rem', color: 'text.secondary' }}>Import a statement to see growth</Typography></Box>;
  }
  const last = series[series.length - 1];
  const up = last.value >= last.invested;
  const axis = isDark ? '#666' : '#9ca3af';
  const valueColor = up ? '#16a34a' : '#dc2626';
  const investedColor = isDark ? '#a3a3a3' : '#525252';
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={series} margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
        <CartesianGrid stroke={isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'} strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="date" tick={{ fontSize: 10, fill: axis }} axisLine={false} tickLine={false} minTickGap={24}
          tickFormatter={(d) => new Date(`${d}T00:00:00`).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' })} />
        <YAxis tick={{ fontSize: 10, fill: axis }} axisLine={false} tickLine={false} width={52}
          tickFormatter={(v) => (v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${Math.round(v / 1e3)}K` : v)} />
        <RTooltip content={<GrowthTooltip />} />
        <Legend wrapperStyle={{ fontSize: 11 }} iconType="plainline" />
        <Line type="monotone" dataKey="value" name="Current value" stroke={valueColor} strokeWidth={2.5}
          dot={{ r: 3.5, fill: valueColor, stroke: valueColor, strokeWidth: 1 }} activeDot={{ r: 5.5, fill: valueColor, stroke: isDark ? '#0a0a0a' : '#fff', strokeWidth: 2 }} />
        <Line type="monotone" dataKey="invested" name="Invested (cost of units held)" stroke={investedColor} strokeWidth={1.75} strokeDasharray="5 4"
          dot={{ r: 3, fill: investedColor, stroke: investedColor, strokeWidth: 1 }} activeDot={{ r: 5, fill: investedColor, stroke: isDark ? '#0a0a0a' : '#fff', strokeWidth: 2 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}
