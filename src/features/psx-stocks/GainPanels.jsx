import { Box, Typography, Tooltip, ButtonBase } from '@mui/material';
import { InfoOutlined, ReceiptLongRounded } from '@mui/icons-material';
import { formatCurrency } from '../../lib/formatters';
import { useFx, FONT_NUM, FONT_DISPLAY, signColor, FitMoney } from '../../components/fx';

const signed = (v) => (v === null || v === undefined ? '—' : `${v > 0 ? '+' : v < 0 ? '−' : ''}${formatCurrency(Math.abs(v), 2)}`);
const plain = (v) => (v === null || v === undefined ? '—' : formatCurrency(v, 2));
const r2 = (n) => Math.round(n * 100) / 100;

function Card({ title, hint, aside, children }) {
  const t = useFx();
  return (
    <Box sx={{ bgcolor: t.surface, border: `1px solid ${t.border}`, borderRadius: '26px', boxShadow: t.shadow, p: { xs: 2, md: 2.5 }, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
        <Typography component="h3" sx={{ fontFamily: FONT_DISPLAY, fontSize: '0.92rem', fontWeight: 700, color: t.ink2, flex: 1, minWidth: 0 }}>{title}</Typography>
        {aside}
        {hint && <Tooltip title={hint} arrow><InfoOutlined sx={{ fontSize: 16, color: t.muted }} /></Tooltip>}
      </Box>
      {children}
    </Box>
  );
}

function Headline({ label, value }) {
  const t = useFx();
  return (
    <Box sx={{ mb: 1.75 }}>
      <Typography sx={{ fontSize: '0.7rem', color: t.muted }}>{label}</Typography>
      <Typography data-numeric component="div" sx={{ fontFamily: FONT_NUM, fontWeight: 650, fontSize: 'clamp(1.7rem, 2.6vw, 2.3rem)', letterSpacing: '-0.045em', lineHeight: 1.05, color: signColor(t, value ?? 0), minWidth: 0 }}>
        {value === null || value === undefined ? '—' : <FitMoney value={value} format={signed} />}
      </Typography>
    </Box>
  );
}

/** One line of a small statement: label (and a note under it) left, amount right. */
function Line({ label, note, value, format = signed, tone, strong, op }) {
  const t = useFx();
  const color = tone === 'sign' ? signColor(t, value ?? 0) : tone === 'muted' ? t.muted : t.ink;
  return (
    <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1.5, py: 0.8, borderTop: strong ? `1px solid ${t.border}` : `1px solid ${t.hairline}` }}>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography sx={{ fontSize: '0.78rem', fontWeight: strong ? 700 : 500, color: strong ? t.ink : t.ink2 }}>
          {op && <Box component="span" sx={{ color: t.muted, fontFamily: FONT_NUM, mr: 0.75 }}>{op}</Box>}{label}
        </Typography>
        {note && <Typography sx={{ fontSize: '0.66rem', color: t.muted, lineHeight: 1.4 }}>{note}</Typography>}
      </Box>
      <Typography data-numeric sx={{ fontFamily: FONT_NUM, fontSize: strong ? '0.92rem' : '0.82rem', fontWeight: strong ? 700 : 600, letterSpacing: '-0.03em', color, whiteSpace: 'nowrap' }}>
        {format(value)}
      </Typography>
    </Box>
  );
}

function Note({ children }) {
  const t = useFx();
  return <Typography sx={{ fontSize: '0.7rem', color: t.muted, lineHeight: 1.55, mt: 1.5 }}>{children}</Typography>;
}

export function SectionTitle({ children, sub }) {
  const t = useFx();
  return (
    <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, mb: 1.25, mt: 0.5 }}>
      <Typography component="h2" sx={{ fontFamily: FONT_DISPLAY, fontSize: '1.05rem', fontWeight: 750, color: t.ink }}>{children}</Typography>
      {sub && <Typography sx={{ fontSize: '0.74rem', color: t.muted }}>{sub}</Typography>}
    </Box>
  );
}

/**
 * Realized: what the sales actually earned (average cost, real broker charges) next to what NCCPL
 * computes for tax (FIFO, deemed 0.5% costs), and what is left after its CGT.
 * totals: analyzeStocks totals for the range and filter. period: nccplPeriod() for the range, all stocks.
 * filtered: a stock/sector/broker filter is on (CGT is charged on all stocks together).
 */
export function RealizedPanel({ totals: tt, period, filtered, onReport, rateNote }) {
  const t = useFx();
  const cgt = period?.cgt ?? 0;
  const keep = r2(tt.realized - cgt);
  const sales = tt.salesCount ?? 0;
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' }, gap: 2 }}>
      <Card title="What you earned" hint="From your broker's actual charges. Each sale: proceeds after its sell charges (commission, sales tax, CDC, levies) − the average cost of the shares, which already includes their buy charges. Dated by settlement, as the broker and NCCPL do.">
        <Headline label="Net, after broker fees" value={tt.realized} />
        <Line label="Before broker fees" note={`${sales} sale${sales === 1 ? '' : 's'} settled in this period`} value={tt.realizedGross} tone="sign" />
        <Line op="−" label="Broker fees" note="Sell charges + the buy charges of the shares sold" value={tt.realizedFees} format={plain} />
        <Line op="=" label="Net after fees" value={tt.realized} tone="sign" strong />
        <Line label="Gross profit" note="Sales that made money" value={tt.realizedProfit} tone="sign" />
        <Line label="Gross loss" note="Sales that lost money" value={tt.realizedLoss} tone="sign" />
        {!filtered && (
          <>
            <Line op="−" label="CGT (NCCPL, 15% filer)" note="Charged on the right-hand figure, not on yours" value={cgt} format={plain} />
            <Line op="=" label="You keep" note="After broker fees and CGT" value={keep} tone="sign" strong />
          </>
        )}
        {filtered && <Note>CGT is charged on all your stocks and brokers together, so it is not split per filter. Clear the filters to see what you keep after CGT.</Note>}
      </Card>

      <Card title="What NCCPL sees" hint="NCCPL's capital gains for tax (Income Tax Rules, rule 13N): sales matched to purchases first in, first out by settlement date; no actual fees, instead 0.5% of the sale and 0.5% of the cost are deducted. Gains and losses run on month by month through the tax year (1 Jul to 30 Jun); a year's net loss is carried forward for 3 tax years."
        aside={onReport && (
          <Tooltip title="NCCPL capital gains report" arrow>
            <ButtonBase onClick={onReport} aria-label="Open NCCPL capital gains report" sx={{ borderRadius: '10px', px: 1, py: 0.4, gap: 0.5, fontSize: '0.72rem', fontWeight: 650, color: t.ink2, border: `1px solid ${t.border}`, '&:hover': { bgcolor: t.hover } }}>
              <ReceiptLongRounded sx={{ fontSize: 16 }} /> Report
            </ButtonBase>
          </Tooltip>
        )}>
        {!period ? <Typography sx={{ fontSize: '0.8rem', color: t.muted }}>No sales settled in this period.</Typography> : (
          <>
            <Headline label="NCCPL net gain" value={period.net} />
            <Line label="Capital gains" note={`${period.lots.filter((l) => l.gain > 0).length} lots at a gain`} value={period.gains} tone="sign" />
            <Line label="Capital losses" note={`${period.lots.filter((l) => l.gain < 0).length} lots at a loss`} value={period.losses} tone="sign" />
            <Line op="=" label="NCCPL net gain" note={`After deemed costs of ${formatCurrency(period.deemedCost, 2)} (0.5% of each sale and of its cost)`} value={period.net} tone="sign" strong />
            <Line label="CGT for these months" note="15% of the tax year's running net after losses brought forward, less what earlier months were charged. Negative = refund." value={cgt} format={signed} />
            <Note>
              NCCPL ignores your broker's actual fees ({formatCurrency(tt.realizedFees, 2)}{filtered ? ' for this filter' : ''}) and uses deemed costs instead, and it
              matches each sale with the oldest shares (FIFO) rather than your average cost. That is why its net gain differs from yours.
              {filtered && ' These figures are for all your stocks and brokers, since tax is charged on the total.'}
              {rateNote ? ` ${rateNote}` : ''} Gains from other brokers or mutual funds that NCCPL nets in are not included.
            </Note>
          </>
        )}
      </Card>
    </Box>
  );
}

/** Unrealized: shares still held, valued at the end of the period. */
export function UnrealizedPanel({ totals: tt, positions }) {
  const open = positions.filter((p) => p.isOpen && p.unrealized !== null);
  const up = open.filter((p) => p.unrealized > 0); const down = open.filter((p) => p.unrealized < 0);
  const sum = (xs) => r2(xs.reduce((s, p) => s + p.unrealized, 0));
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' }, gap: 2 }}>
      <Card title="Paper profit" hint="Value at the end of the period − average cost (buy charges included). Sell charges are not deducted until you sell.">
        <Headline label="Unrealized, before tax" value={tt.unrealized} />
        <Line label="Market value" value={tt.value} format={plain} />
        <Line op="−" label="Invested" note="Average cost of the shares held, buy charges included" value={tt.invested} format={plain} />
        <Line op="=" label="Unrealized" value={tt.unrealized} tone="sign" strong />
      </Card>
      <Card title="If you sold today" hint="An estimate: no tax is due until you sell. 15% (filer) of the net unrealized gain; a net loss owes nothing. NCCPL would also deduct its deemed 0.5% costs and use FIFO, so the real figure will differ slightly.">
        <Headline label="After estimated CGT" value={tt.unrealizedNet} />
        <Line label="Holdings in profit" note={`${up.length} stock${up.length === 1 ? '' : 's'}`} value={sum(up)} tone="sign" />
        <Line label="Holdings at a loss" note={`${down.length} stock${down.length === 1 ? '' : 's'}`} value={sum(down)} tone="sign" />
        <Line op="−" label="CGT 15% (est.)" note="On the net gain; losses offset gains" value={tt.unrealizedTax} format={plain} />
        <Line op="=" label="After est. CGT" value={tt.unrealizedNet} tone="sign" strong />
      </Card>
    </Box>
  );
}
