import { Box, Typography, Tooltip, IconButton } from '@mui/material';
import { InfoOutlined, ReceiptLongRounded, NorthEastRounded, SouthEastRounded } from '@mui/icons-material';
import { formatCurrency } from '../../lib/formatters';
import { taxYearLabel } from '../../lib/psx/nccpl';
import { shortDate } from '../../lib/dateRange';
import { useFx, FONT_NUM, FONT_DISPLAY, signColor } from '../../components/fx';

const r2 = (n) => Math.round(n * 100) / 100;
const SIGN = (n, always) => (n < 0 ? '−' : n > 0 && always ? '+' : '');
const money = (v, { signed } = {}) => (v === null || v === undefined ? '—' : `${SIGN(v, signed)}${formatCurrency(Math.abs(v), 2)}`);

/**
 * An amount set like a figure on a statement: a small muted currency, the whole number large,
 * the paisas smaller. Uses formatCurrency, so currency conversion and privacy mode still apply.
 */
export function Amount({ value, size = '2.4rem', signed = true, color }) {
  const t = useFx();
  if (value === null || value === undefined) return <Box component="span" sx={{ fontFamily: FONT_NUM, fontSize: size, color: t.muted }}>—</Box>;
  const text = formatCurrency(Math.abs(value), 2);
  const gap = text.indexOf(' ');
  const symbol = gap > 0 ? text.slice(0, gap) : '';
  const num = gap > 0 ? text.slice(gap + 1) : text;
  const dot = num.lastIndexOf('.');
  const whole = dot > 0 ? num.slice(0, dot) : num;
  const frac = dot > 0 ? num.slice(dot) : '';
  return (
    <Box component="span" data-numeric sx={{ display: 'inline-flex', alignItems: 'baseline', whiteSpace: 'nowrap', fontFamily: FONT_NUM, color: color ?? signColor(t, signed ? value : 0), lineHeight: 1 }}>
      {SIGN(value, signed) && <Box component="span" sx={{ fontSize: `calc(${size} * 0.78)`, fontWeight: 600, mr: '0.04em' }}>{SIGN(value, signed)}</Box>}
      <Box component="span" sx={{ fontSize: `max(0.62rem, calc(${size} * 0.42))`, fontWeight: 600, opacity: 0.6, mr: '0.22em', letterSpacing: 0 }}>{symbol}</Box>
      <Box component="span" sx={{ fontSize: size, fontWeight: 650, letterSpacing: '-0.045em' }}>{whole}</Box>
      {frac && <Box component="span" sx={{ fontSize: `max(0.66rem, calc(${size} * 0.5))`, fontWeight: 600, opacity: 0.55, letterSpacing: '-0.02em' }}>{frac}</Box>}
    </Box>
  );
}

/** A hover / tap card: a title, then label-value rows grouped by section, totals ruled off. */
function Tip({ title, sections, children }) {
  const t = useFx();
  const body = (
    <Box sx={{ minWidth: 250, maxWidth: 320, py: 0.5 }}>
      {title && <Typography sx={{ fontSize: '0.76rem', fontWeight: 750, mb: 0.75, color: t.tipInk }}>{title}</Typography>}
      {sections.filter(Boolean).map((s, i) => (
        <Box key={i} sx={{ mt: i ? 1.25 : 0 }}>
          {s.heading && <Typography sx={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', opacity: 0.55, mb: 0.4 }}>{s.heading}</Typography>}
          {s.rows.filter(Boolean).map((r, j) => (
            <Box key={j} sx={{ display: 'flex', alignItems: 'baseline', gap: 2, py: 0.3, ...(r.total ? { borderTop: '1px solid rgba(255,255,255,0.16)', mt: 0.4, pt: 0.6, fontWeight: 750 } : {}) }}>
              <Typography component="span" sx={{ flex: 1, fontSize: '0.7rem', fontWeight: 'inherit', opacity: r.total ? 1 : 0.8 }}>{r.label}</Typography>
              <Typography component="span" sx={{ fontFamily: FONT_NUM, fontSize: '0.72rem', fontWeight: r.total ? 750 : 600, letterSpacing: '-0.01em', whiteSpace: 'nowrap' }}>{r.value}</Typography>
            </Box>
          ))}
          {s.note && <Typography sx={{ fontSize: '0.64rem', opacity: 0.6, mt: 0.5, lineHeight: 1.45 }}>{s.note}</Typography>}
        </Box>
      ))}
    </Box>
  );
  return (
    <Tooltip title={body} arrow enterTouchDelay={0} leaveTouchDelay={6000} placement="bottom-end"
      slotProps={{ tooltip: { sx: { bgcolor: t.tipBg, color: t.tipInk, borderRadius: '14px', px: 1.75, py: 1.25, boxShadow: '0 18px 40px -12px rgba(0,0,0,.45)' } }, arrow: { sx: { color: t.tipBg } } }}>
      {children}
    </Tooltip>
  );
}

function InfoButton({ label, small, ...tip }) {
  const t = useFx();
  return (
    <Tip {...tip}>
      <IconButton size="small" aria-label={label} sx={{ color: t.muted, width: small ? 22 : 30, height: small ? 22 : 30, mr: small ? -0.5 : 0, '&:hover': { color: t.ink, bgcolor: t.hover } }}>
        <InfoOutlined sx={{ fontSize: small ? 14 : 17 }} />
      </IconButton>
    </Tip>
  );
}

function Card({ title, sub, actions, children }) {
  const t = useFx();
  return (
    <Box sx={{ bgcolor: t.surface, border: `1px solid ${t.border}`, borderRadius: '26px', boxShadow: t.shadow, p: { xs: 1.75, md: 2 }, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.5 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography component="h2" sx={{ fontFamily: FONT_DISPLAY, fontSize: '1rem', fontWeight: 750, color: t.ink, lineHeight: 1.3 }}>{title}</Typography>
          <Typography sx={{ fontSize: '0.7rem', color: t.muted }} noWrap>{sub}</Typography>
        </Box>
        {actions}
      </Box>
      {children}
    </Box>
  );
}

function Hero({ value, caption, badge }) {
  const t = useFx();
  return (
    <Box sx={{ mt: 1, mb: 1.25 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, flexWrap: 'wrap', minWidth: 0 }}>
        <Amount value={value} size="clamp(1.75rem, 2.6vw, 2.2rem)" />
        {badge}
      </Box>
      <Typography sx={{ fontSize: '0.7rem', color: t.muted, mt: 0.5 }}>{caption}</Typography>
    </Box>
  );
}

/** A small figure on a soft tile: label (with an optional info button) over the amount. No rules. */
function Stat({ label, value, info, color, signed = true, refund }) {
  const t = useFx();
  return (
    <Box sx={{ bgcolor: t.surface2, borderRadius: '14px', px: 1.25, py: 0.9, minWidth: 0 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25, minHeight: 22 }}>
        <Typography sx={{ fontSize: '0.66rem', color: t.muted, fontWeight: 600, flex: 1, minWidth: 0 }} noWrap>{label}</Typography>
        {refund && <Box component="span" sx={{ fontSize: '0.58rem', fontWeight: 700, color: t.pos, bgcolor: t.posSoft, px: 0.6, borderRadius: 999 }}>refund</Box>}
        {info}
      </Box>
      <Box sx={{ overflow: 'hidden' }}>
        <Amount value={value} size="0.98rem" signed={signed} color={color ?? (signed ? undefined : t.ink)} />
      </Box>
    </Box>
  );
}

function Stats({ children }) {
  return <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 1 }}>{children}</Box>;
}

function Total({ label, value, muted }) {
  const t = useFx();
  return (
    <Box sx={{ mt: 'auto', pt: 1 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1.5, py: 0.9, borderRadius: '16px', bgcolor: muted ? t.surface2 : value >= 0 ? t.posSoft : t.negSoft }}>
        <Typography sx={{ fontSize: '0.82rem', fontWeight: 750, color: t.ink, flex: 1 }}>{label}</Typography>
        <Amount value={value} size="1.08rem" />
      </Box>
    </Box>
  );
}

function Pct({ value }) {
  const t = useFx();
  if (value === null || !Number.isFinite(value)) return null;
  const up = value >= 0;
  const Icon = up ? NorthEastRounded : SouthEastRounded;
  return (
    <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.25, px: 1, py: 0.35, borderRadius: 999, fontFamily: FONT_NUM, fontSize: '0.74rem', fontWeight: 700, color: up ? t.pos : t.neg, bgcolor: up ? t.posSoft : t.negSoft }}>
      <Icon sx={{ fontSize: 14 }} />{Math.abs(value).toFixed(2)}%
    </Box>
  );
}

const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

/**
 * Realized: what the sales settled in the range earned after the broker's actual charges, the CGT
 * NCCPL charges for that range (its own method: FIFO, deemed 0.5% costs, running monthly CGT,
 * losses brought forward), and what is left.
 * totals: analyzeStocks totals for the range and filter. period: nccplPeriod() for the range, all stocks.
 * filtered: a stock/sector/broker filter is on; CGT is charged on all stocks together, so it is not split.
 */
export function RealizedCard({ totals: tt, period, filtered, rangeText, onReport, rateNote }) {
  const t = useFx();
  const sales = tt.salesCount ?? 0;
  const cgt = filtered ? null : (period?.cgt ?? 0);
  const keep = cgt === null ? null : r2(tt.realized - cgt);
  const won = period?.lots.filter((l) => l.gain > 0).length ?? 0;
  const lost = period?.lots.filter((l) => l.gain < 0).length ?? 0;

  const profitTip = {
    title: 'Your profit',
    sections: [{
      heading: `${plural(sales, 'sale')} settled in ${rangeText}`,
      rows: [
        { label: 'Sales at a profit', value: money(tt.realizedProfit, { signed: true }) },
        { label: 'Sales at a loss', value: money(tt.realizedLoss, { signed: true }) },
        { label: 'Before broker fees', value: money(tt.realizedGross, { signed: true }), total: true },
        { label: 'Broker fees', value: money(-(tt.realizedFees ?? 0), { signed: true }) },
        { label: 'Net realized', value: money(tt.realized, { signed: true }), total: true },
      ],
      note: 'Average cost of the shares sold; fees are your broker’s actual commission, taxes, CDC and levies.',
    }],
  };

  const segs = period?.years ?? [];
  const one = segs.length === 1 ? segs[0] : null;
  const cgtTip = {
    title: 'CGT as NCCPL computes it',
    sections: [
      period && {
        heading: 'NCCPL’s gain for this range',
        rows: [
          { label: `Capital gains · ${plural(won, 'lot')}`, value: money(period.gains, { signed: true }) },
          { label: `Capital losses · ${plural(lost, 'lot')}`, value: money(period.losses, { signed: true }) },
          { label: 'Net gain', value: money(period.net, { signed: true }), total: true },
        ],
        note: `FIFO by settlement date, after deemed costs of ${money(period.deemedCost)} (0.5% of each sale and of its cost) instead of actual fees.`,
      },
      one && {
        heading: `Tax year ${taxYearLabel(one.taxYear)} to ${shortDate(one.end)}`,
        rows: [
          { label: 'Net gain, year to date', value: money(one.ytdEnd, { signed: true }) },
          one.lossesUsed > 0 && { label: 'Losses brought forward', value: money(-one.lossesUsed, { signed: true }) },
          { label: 'Taxable to date', value: money(one.taxableToDate) },
          { label: 'CGT 15% to date', value: money(one.cgtToDate) },
          one.chargedBefore !== 0 && { label: `Charged before ${shortDate(one.start)}`, value: money(-one.chargedBefore, { signed: true }) },
          { label: one.cgt < 0 ? 'Refund for this range' : 'CGT for this range', value: money(Math.abs(one.cgt)), total: true },
        ],
      },
      segs.length > 1 && {
        heading: 'By tax year',
        rows: [
          ...segs.map((s) => ({ label: `TY ${taxYearLabel(s.taxYear)} · ${shortDate(s.start)} – ${shortDate(s.end)}`, value: money(s.cgt, { signed: true }) })),
          { label: 'CGT for this range', value: money(period.cgt, { signed: true }), total: true },
        ],
        note: 'Each tax year runs on its own: 15% of its running net after losses brought forward, less what earlier months were charged.',
      },
      rateNote && { rows: [], note: rateNote },
    ],
  };

  return (
    <Card title="Realized" sub={`${plural(sales, 'sale')} · settled in ${rangeText}`}
      actions={(
        <>
          <InfoButton label="How realized profit is worked out" {...profitTip} />
          {onReport && (
            <Tooltip title="Capital gains report" arrow>
              <IconButton onClick={onReport} aria-label="Open capital gains report" size="small"
                sx={{ width: 34, height: 34, ml: 0.25, borderRadius: '11px', border: `1px solid ${t.border}`, color: t.ink, '&:hover': { bgcolor: t.hover } }}>
                <ReceiptLongRounded sx={{ fontSize: 18 }} />
              </IconButton>
            </Tooltip>
          )}
        </>
      )}>
      <Hero value={tt.realized} caption="Net profit after broker fees" />
      <Stats>
        <Stat label="Before fees" value={tt.realizedGross} />
        <Stat label="Broker fees" value={-(tt.realizedFees ?? 0)} color={t.ink} />
        {filtered ? (
          <Stat label="CGT · NCCPL" value={null} info={<InfoButton small label="Why CGT is not shown" sections={[{ rows: [], note: 'CGT is charged on all your stocks and brokers together, so it is not split by filter. Clear the filters to see it.' }]} />} />
        ) : (
          <Stat label="CGT · NCCPL" value={-cgt} color={cgt < 0 ? t.pos : t.ink} refund={cgt < 0}
            info={<InfoButton small label="How NCCPL's CGT is worked out" {...cgtTip} />} />
        )}
      </Stats>
      {keep === null
        ? <Total label="Net realized" value={tt.realized} muted />
        : <Total label="You keep" value={keep} />}
    </Card>
  );
}

/** Unrealized: shares still held, valued at the range's end; CGT is an estimate until they are sold. */
export function UnrealizedCard({ totals: tt, positions, endText }) {
  const t = useFx();
  const open = positions.filter((p) => p.isOpen && p.unrealized !== null);
  const up = open.filter((p) => p.unrealized > 0); const down = open.filter((p) => p.unrealized < 0);
  const sum = (xs) => r2(xs.reduce((s, p) => s + p.unrealized, 0));
  const pct = tt.invested > 0 && tt.unrealized !== null ? (tt.unrealized / tt.invested) * 100 : null;
  const tip = {
    title: 'Paper profit',
    sections: [{
      heading: `${plural(open.length, 'holding')} on ${endText}`,
      rows: [
        { label: `In profit · ${up.length}`, value: money(sum(up), { signed: true }) },
        { label: `At a loss · ${down.length}`, value: money(sum(down), { signed: true }) },
        { label: 'Unrealized', value: money(tt.unrealized, { signed: true }), total: true },
      ],
      note: 'Value at the close − average cost, buy charges included. Sell charges are only deducted when you sell.',
    }],
  };
  return (
    <Card title="Unrealized" sub={`${plural(open.length, 'holding')} · valued on ${endText}`}
      actions={<InfoButton label="How unrealized profit is worked out" {...tip} />}>
      <Hero value={tt.unrealized} caption={`On ${money(tt.invested)} invested`} badge={<Pct value={pct} />} />
      <Stats>
        <Stat label="Market value" value={tt.value} signed={false} />
        <Stat label="Invested" value={tt.invested} signed={false} />
        <Stat label="Est. CGT 15%" value={-(tt.unrealizedTax ?? 0)} color={t.ink}
          info={<InfoButton small label="About the CGT estimate" sections={[{ rows: [], note: 'No tax is due until you sell. 15% of the net unrealized gain; a net loss owes nothing. NCCPL’s FIFO and deemed costs will move the final figure slightly.' }]} />} />
      </Stats>
      <Total label="After est. CGT" value={tt.unrealizedNet} />
    </Card>
  );
}
