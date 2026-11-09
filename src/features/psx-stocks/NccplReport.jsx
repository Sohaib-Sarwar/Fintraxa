import { useMemo, useState } from 'react';
import { Box, Dialog, Typography, IconButton, Button, GlobalStyles, Tooltip, useMediaQuery } from '@mui/material';
import { CloseRounded, DownloadRounded, EastRounded, WarningAmberRounded } from '@mui/icons-material';
import { useNccpl } from '../../lib/psx/useNccpl';
import { usePsxPortfolio } from '../../lib/psx/usePsxPortfolio';
import { taxYearRange, taxYearLabel, CARRY_FORWARD_YEARS } from '../../lib/psx/nccpl';
import { useProfile } from '../../lib/profile/useProfile';
import { BROKERS } from '../../lib/psx/confirmations';
import { shortDate, monthLabel, todayIso } from '../../lib/dateRange';
import { useAppStore } from '../../store/appStore';
import { PillSelect } from '../../components/fx';
import FintraxaLogo from '../../components/FintraxaLogo';
import StockLogo from '../../components/StockLogo';

// A statement reads the same in light and dark mode, and prints on white.
const P = {
  paper: '#ffffff', ink: '#111316', ink2: '#3d434b', muted: '#6b7179', rule: '#d9dde2', hair: '#eceef1',
  band: '#f4f6f8', navy: '#1d2a6b', pos: '#11683f', neg: '#b3261e', posSoft: '#e9f5ee', negSoft: '#fcebea', warn: '#8f5d00', warnSoft: '#fbf1db',
};
const NUM = '"Roboto Mono", ui-monospace, SFMono-Regular, Menlo, monospace';

/** PKR with 2 decimals; losses in brackets, as on the NCCPL statement. Hidden in privacy mode. */
function usePkr() {
  const hidden = useAppStore((s) => s.hideAmounts === true);
  return (n, { sign } = {}) => {
    if (n === null || n === undefined) return '—';
    if (hidden) return '••••••';
    const s = Math.abs(n).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (n < 0) return `(${s})`;
    return sign && n > 0 ? `+${s}` : s;
  };
}
const tone = (n) => (n > 0 ? P.pos : n < 0 ? P.neg : P.ink);

/**
 * NCCPL-style capital gains statement for one tax year: a summary page (gains, losses, losses
 * brought forward, taxable gain, CGT, the month-by-month running CGT, and what was actually kept
 * after the broker's fees and CGT), then every lot in detail. Unofficial: computed from the
 * user's trades with src/lib/psx/nccpl.js. "Download PDF" prints only the statement.
 */
export default function NccplReport({ taxYear: initial, onClose }) {
  const isMobile = useMediaQuery('(max-width:900px)');
  const { report } = useNccpl();
  const { data: profile } = useProfile();
  const years = useMemo(() => (report?.years ?? []).filter((y) => y.lots.length || y.carriedIn.length).map((y) => y.taxYear).reverse(), [report]);
  const [pick, setPick] = useState(initial);
  const ty = years.includes(pick) ? pick : years[0];
  const y = report?.year(ty);
  const range = ty ? taxYearRange(ty) : null;
  const { portfolio } = usePsxPortfolio(range ?? undefined);

  return (
    <Dialog open onClose={onClose} fullScreen className="nccpl-print-root" PaperProps={{ sx: { bgcolor: { xs: P.band, md: '#e9ecef' } } }}>
      <GlobalStyles styles={{
        '@media print': {
          '@page': { size: 'A4', margin: '11mm 10mm' },
          'body > *:not(.nccpl-print-root)': { display: 'none !important' },
          '.nccpl-print-root, .nccpl-print-root .MuiDialog-container, .nccpl-print-root .MuiDialog-paper': {
            position: 'static !important', overflow: 'visible !important', height: 'auto !important', maxHeight: 'none !important',
            background: '#fff !important', boxShadow: 'none !important',
          },
          '.nccpl-print-root .MuiBackdrop-root, .nccpl-no-print': { display: 'none !important' },
          '.nccpl-sheet': { boxShadow: 'none !important', margin: '0 !important', padding: '0 !important', maxWidth: 'none !important', borderRadius: '0 !important' },
          '.nccpl-page-break': { breakBefore: 'page' },
          '.nccpl-keep': { breakInside: 'avoid' },
          '.nccpl-scroll': { overflow: 'visible !important' },
          'body': { WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' },
        },
      }} />

      <Box className="nccpl-no-print" sx={{ position: 'sticky', top: 0, zIndex: 2, display: 'flex', alignItems: 'center', gap: 1, px: { xs: 1.5, md: 3 }, py: 1.25, bgcolor: '#fff', borderBottom: `1px solid ${P.rule}`, color: P.ink }}>
        <Typography sx={{ fontWeight: 750, fontSize: '0.95rem', flex: 1, minWidth: 0 }} noWrap>Capital gains statement</Typography>
        {years.length > 1 && (
          <PillSelect value={ty} onChange={setPick} label="Tax year" width={isMobile ? 120 : 150}
            items={years.map((v) => ({ value: v, label: `TY ${taxYearLabel(v)}` }))} />
        )}
        <Button onClick={() => window.print()} disabled={!y} startIcon={<DownloadRounded />} variant="contained" disableElevation
          sx={{ borderRadius: '12px', textTransform: 'none', fontWeight: 650, bgcolor: P.ink, '&:hover': { bgcolor: '#2a2e33' } }}>
          {isMobile ? 'PDF' : 'Download PDF'}
        </Button>
        <IconButton onClick={onClose} aria-label="Close report"><CloseRounded /></IconButton>
      </Box>

      <Box sx={{ px: { xs: 0, md: 3 }, py: { xs: 0, md: 3 } }}>
        {!report ? null : !y ? (
          <Sheet><Typography sx={{ color: P.muted, py: 6, textAlign: 'center' }}>No shares sold yet, so there is no capital gain to report.</Typography></Sheet>
        ) : (
          <>
            <Sheet>
              <Letterhead y={y} profile={profile} />
              <Summary y={y} />
              <Months y={y} />
              <Kept y={y} totals={portfolio?.totals} />
              <Notes y={y} unmatched={report.unmatched.filter((u) => u.settlement >= y.start && u.settlement <= y.end)} />
            </Sheet>
            <Sheet breakBefore>
              <Letterhead y={y} profile={profile} compact />
              <Lots y={y} />
            </Sheet>
          </>
        )}
      </Box>
    </Dialog>
  );
}

function Sheet({ children, breakBefore }) {
  return (
    <Box className={`nccpl-sheet${breakBefore ? ' nccpl-page-break' : ''}`} sx={{
      bgcolor: P.paper, color: P.ink, maxWidth: 1060, mx: 'auto', mb: { xs: 1, md: 3 }, p: { xs: 2, md: 5 },
      borderRadius: { xs: 0, md: '6px' }, boxShadow: { xs: 'none', md: '0 1px 3px rgba(0,0,0,.08), 0 12px 32px -12px rgba(0,0,0,.18)' },
      fontSize: '0.8rem', '& *': { fontFeatureSettings: '"tnum"' },
    }}>{children}</Box>
  );
}

function H({ children, sub }) {
  return (
    <Box sx={{ mt: 3.5, mb: 1.25, display: 'flex', alignItems: 'baseline', gap: 1.25, borderBottom: `2px solid ${P.navy}`, pb: 0.6 }}>
      <Typography component="h3" sx={{ fontSize: '0.92rem', fontWeight: 800, color: P.navy, letterSpacing: '0.01em' }}>{children}</Typography>
      {sub && <Typography sx={{ fontSize: '0.7rem', color: P.muted }}>{sub}</Typography>}
    </Box>
  );
}

function Letterhead({ y, profile, compact }) {
  const brokers = [...new Set(y.lots.map((l) => l.broker).filter((b) => BROKERS[b]))];
  const { start, end } = taxYearRange(y.taxYear);
  return (
    <Box className="nccpl-keep">
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, pb: 1.75, borderBottom: `1px solid ${P.rule}` }}>
        <Box component="img" src="/report-logos/nccpl.webp" alt="NCCPL" sx={{ width: compact ? 40 : 56, height: compact ? 40 : 56, objectFit: 'contain', flexShrink: 0 }} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontSize: compact ? '0.95rem' : '1.2rem', fontWeight: 800, letterSpacing: '-0.01em', lineHeight: 1.2 }}>
            {compact ? 'Capital gain / loss: lot details' : 'Capital Gain / Loss Statement'}
          </Typography>
          <Typography sx={{ fontSize: '0.76rem', color: P.ink2 }}>
            Tax Year {taxYearLabel(y.taxYear)} · {shortDate(start)} to {shortDate(end)} · Listed shares (PSX)
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0 }}>
          {brokers.map((b) => (
            <Tooltip key={b} title={BROKERS[b].name} arrow>
              <Box component="img" src={BROKERS[b].logo} alt={BROKERS[b].name} sx={{ width: compact ? 30 : 38, height: compact ? 30 : 38, borderRadius: '8px', objectFit: 'cover', boxShadow: `0 0 0 1px ${P.rule}` }} />
            </Tooltip>
          ))}
          <FintraxaLogo size={compact ? 28 : 34} />
        </Box>
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, my: 1.25, px: 1.25, py: 0.75, bgcolor: P.warnSoft, color: P.warn, borderRadius: '4px', fontSize: '0.7rem', fontWeight: 650 }}>
        <WarningAmberRounded sx={{ fontSize: 15 }} />
        Unofficial. Prepared by Fintraxa from the trades you recorded, following NCCPL&apos;s method. Not issued by NCCPL; your NCCPL certificate is the final word.
      </Box>
      {!compact && (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' }, gap: 1.5, py: 1.25, borderBottom: `1px solid ${P.hair}` }}>
          <Field label="Taxpayer" value={profile?.full_name || profile?.username || '—'} />
          <Field label="Tax status" value={profile?.filer_status === 'non_filer' ? 'Non-filer' : 'Filer (ATL)'} />
          <Field label="Brokers" value={brokers.map((b) => BROKERS[b].name).join(', ') || 'Entered by hand'} />
          <Field label="Prepared on" value={shortDate(todayIso())} />
        </Box>
      )}
    </Box>
  );
}

function Field({ label, value }) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography sx={{ fontSize: '0.64rem', color: P.muted, fontWeight: 600 }}>{label}</Typography>
      <Typography sx={{ fontSize: '0.8rem', fontWeight: 650 }} noWrap>{value}</Typography>
    </Box>
  );
}

function Summary({ y }) {
  const pkr = usePkr();
  const rows = [
    { k: 'A', label: 'Capital gains', note: `${y.lots.filter((l) => l.gain > 0).length} lots`, v: y.gains },
    { k: 'B', label: 'Capital losses', note: `${y.lots.filter((l) => l.gain < 0).length} lots`, v: y.losses },
    { k: 'C', label: 'Net capital gain / (loss) for the year', note: 'A + B', v: y.net, strong: true },
    ...y.carriedIn.map((c) => ({ k: '', label: `Loss brought forward from TY ${taxYearLabel(c.fromYear)}`, note: 'Set off, oldest first', v: -c.used })),
    { k: 'D', label: 'Taxable capital gain', note: y.carriedIn.length ? 'C − losses brought forward' : 'C, nothing brought forward', v: y.taxable, strong: true },
    { k: 'E', label: 'Capital gains tax @ 15%', note: 'D × 15%', v: y.cgt, strong: true, tax: true },
  ];
  return (
    <>
      <H sub="the year as NCCPL computes it">Summary</H>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1.35fr 1fr' }, gap: 3 }}>
        <Box component="table" sx={tableSx({ first: 'left' })}>
          <tbody>
            {rows.map((r, i) => (
              <Box component="tr" key={i} sx={r.strong ? { '& td': { fontWeight: 750, bgcolor: r.tax ? P.band : 'transparent', borderTop: `1px solid ${P.rule}` } } : undefined}>
                <Box component="td" sx={{ width: 22, color: P.muted, fontWeight: 700 }}>{r.k}</Box>
                <Box component="td" sx={{ textAlign: 'left !important', fontFamily: 'inherit !important' }}>{r.label}<Box component="span" sx={{ display: 'block', fontSize: '0.66rem', color: P.muted, fontWeight: 400 }}>{r.note}</Box></Box>
                <Box component="td" sx={{ fontFamily: NUM, color: r.tax ? P.ink : tone(r.v), textAlign: 'right' }}>{pkr(r.v)}</Box>
              </Box>
            ))}
          </tbody>
        </Box>
        <Box>
          <Box sx={{ p: 2, bgcolor: y.cgt > 0 ? P.band : P.posSoft, borderRadius: '6px', mb: 1.5 }} className="nccpl-keep">
            <Typography sx={{ fontSize: '0.7rem', color: P.muted, fontWeight: 600 }}>CGT for the year</Typography>
            <Typography sx={{ fontFamily: NUM, fontSize: '1.7rem', fontWeight: 700, letterSpacing: '-0.03em' }}>Rs {pkr(y.cgt)}</Typography>
            <Typography sx={{ fontSize: '0.7rem', color: P.ink2, lineHeight: 1.5 }}>
              {y.net < 0 ? `A net loss of Rs ${pkr(-y.net)}: no CGT, and the loss is carried forward.`
                : y.carriedUsed > 0 ? `15% of Rs ${pkr(y.taxable)}, after setting off Rs ${pkr(y.carriedUsed)} of earlier losses.`
                  : `15% of the net gain of Rs ${pkr(y.taxable)}.`}
            </Typography>
          </Box>
          <Typography sx={{ fontSize: '0.72rem', fontWeight: 750, mb: 0.5 }}>Losses carried forward after this year</Typography>
          {y.carryForward.length === 0 ? <Typography sx={{ fontSize: '0.72rem', color: P.muted }}>None.</Typography> : (
            <Box component="table" sx={tableSx({ first: 'left', small: true })}>
              <thead><tr><th>From</th><th>Amount</th><th>Usable until</th></tr></thead>
              <tbody>
                {y.carryForward.map((c) => (
                  <tr key={c.fromYear}><td>TY {taxYearLabel(c.fromYear)}</td><Box component="td" sx={{ fontFamily: NUM, color: P.neg }}>{pkr(-c.amount)}</Box><td>TY {taxYearLabel(c.expires)}</td></tr>
                ))}
              </tbody>
            </Box>
          )}
        </Box>
      </Box>
    </>
  );
}

function Months({ y }) {
  const pkr = usePkr();
  return (
    <>
      <H sub="gains and losses run on through the year; each month is charged the change in CGT">Month by month</H>
      <Box className="nccpl-scroll" sx={{ overflowX: 'auto' }}>
        <Box component="table" sx={{ ...tableSx({ first: 'left' }), minWidth: 760 }}>
          <thead>
            <tr><th>Month</th><th>Gains</th><th>Losses</th><th>Net</th><th>Running net</th><th>Taxable so far</th><th>CGT so far</th><th>Charged before</th><th>This month</th></tr>
          </thead>
          <tbody>
            {y.months.map((m) => (
              <tr key={m.month}>
                <Box component="td" sx={{ fontWeight: 650 }}>{monthLabel(m.month)}</Box>
                <Box component="td" sx={{ color: tone(m.gains) }}>{pkr(m.gains)}</Box>
                <Box component="td" sx={{ color: tone(m.losses) }}>{pkr(m.losses)}</Box>
                <Box component="td" sx={{ color: tone(m.net), fontWeight: 650 }}>{pkr(m.net)}</Box>
                <Box component="td" sx={{ color: tone(m.ytdNet) }}>{pkr(m.ytdNet)}</Box>
                <td>{pkr(m.ytdTaxable)}</td>
                <td>{pkr(m.ytdCgt)}</td>
                <td>{pkr(m.previouslyCharged)}</td>
                <Box component="td" sx={{ fontWeight: 750, color: m.cgtThisMonth < 0 ? P.pos : P.ink }}>{m.cgtThisMonth < 0 ? `${pkr(m.cgtThisMonth)} refund` : pkr(m.cgtThisMonth)}</Box>
              </tr>
            ))}
            <Box component="tr" sx={{ '& td': { fontWeight: 800, borderTop: `1.5px solid ${P.ink}` } }}>
              <td>Tax year</td>
              <Box component="td" sx={{ color: tone(y.gains) }}>{pkr(y.gains)}</Box>
              <Box component="td" sx={{ color: tone(y.losses) }}>{pkr(y.losses)}</Box>
              <Box component="td" sx={{ color: tone(y.net) }}>{pkr(y.net)}</Box>
              <Box component="td" sx={{ color: tone(y.net) }}>{pkr(y.net)}</Box>
              <td>{pkr(y.taxable)}</td><td>{pkr(y.cgt)}</td><td /><td>{pkr(y.cgt)}</td>
            </Box>
          </tbody>
        </Box>
      </Box>
      {y.carriedIn.length > 0 && (
        <Typography sx={{ fontSize: '0.68rem', color: P.muted, mt: 0.75 }}>
          &quot;Taxable so far&quot; already sets off the Rs {pkr(y.carriedIn.reduce((s, c) => s + c.used, 0))} of losses brought forward from earlier years.
        </Typography>
      )}
    </>
  );
}

/** What was actually kept: the broker's real charges and average cost, then NCCPL's CGT. */
function Kept({ y, totals }) {
  const pkr = usePkr();
  if (!totals) return null;
  const deemed = y.lots.reduce((s, l) => s + l.deemedCost, 0);
  const keep = Math.round((totals.realized - y.cgt) * 100) / 100;
  const line = (label, v, opts = {}) => (
    <Box sx={{ display: 'flex', gap: 2, py: 0.55, borderTop: `1px solid ${opts.strong ? P.rule : P.hair}`, fontWeight: opts.strong ? 750 : 500 }}>
      <Box sx={{ flex: 1 }}>{label}</Box><Box sx={{ fontFamily: NUM, color: opts.plain ? P.ink : tone(v) }}>{pkr(v)}</Box>
    </Box>
  );
  return (
    <>
      <H sub="from your broker's actual charges, then this CGT">What you actually earned</H>
      <Box className="nccpl-keep" sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 3 }}>
        <Box>
          {line('Profit before broker fees', totals.realizedGross)}
          {line('− Broker fees (commission, taxes, CDC, levies)', totals.realizedFees, { plain: true })}
          {line('= Net profit after fees', totals.realized, { strong: true })}
          {line('− Capital gains tax (E above)', y.cgt, { plain: true })}
          <Box sx={{ display: 'flex', gap: 2, mt: 0.5, px: 1.25, py: 1, bgcolor: keep >= 0 ? P.posSoft : P.negSoft, borderRadius: '6px', fontWeight: 800 }}>
            <Box sx={{ flex: 1 }}>= You keep</Box><Box sx={{ fontFamily: NUM, color: tone(keep) }}>Rs {pkr(keep)}</Box>
          </Box>
        </Box>
        <Typography component="div" sx={{ fontSize: '0.72rem', color: P.ink2, lineHeight: 1.6 }}>
          NCCPL taxes its own figure, Rs {pkr(y.net)}, not yours. It deducts deemed costs of 0.5% of each sale and 0.5% of its
          cost (Rs {pkr(deemed)} this year) instead of the Rs {pkr(totals.realizedFees)} your broker actually charged, and it matches
          every sale with the oldest shares first (FIFO), while your profit uses the average cost of all the shares you held.
          Over a whole holding the two meet; within a year they can differ by a few percent.
        </Typography>
      </Box>
    </>
  );
}

function Notes({ y, unmatched }) {
  const older = y.lots.filter((l) => l.olderRegime).length;
  return (
    <>
      <H>How this is worked out</H>
      <Box component="ul" sx={{ m: 0, pl: 2.25, fontSize: '0.7rem', color: P.ink2, lineHeight: 1.65 }}>
        <li>Each sale is matched with the earliest purchase of the same stock still held, ordered by settlement date (T+1). Holding days run from the purchase&apos;s settlement to the sale&apos;s.</li>
        <li>Gain per lot = (sale − cost) − 0.5% of the sale − 0.5% of the cost (Income Tax Rules, rule 13N). Provisional CGT per lot is 15% of a positive gain.</li>
        <li>Within a tax year (1 July to 30 June) gains and losses run on: a month is charged 15% of the running net minus what earlier months paid, and refunded if the running net falls.</li>
        <li>A year&apos;s net loss is set off against the next {CARRY_FORWARD_YEARS} tax years&apos; gains, oldest loss first; after that it lapses.</li>
        <li>NCCPL also nets gains and losses you made through other brokers and mutual funds (&quot;capital gain/loss allocation&quot;). Only the trades recorded in Fintraxa are included here.</li>
        {older > 0 && <li><b>{older} lot{older === 1 ? ' was' : 's were'} bought before 1 July 2024</b>, when holding-period rates applied; 15% is assumed here.</li>}
        {unmatched.length > 0 && <li><b>Sold more than recorded:</b> {unmatched.map((u) => `${u.quantity} ${u.symbol}`).join(', ')} had no recorded purchase, so they are left out. Add the missing buy trades.</li>}
      </Box>
    </>
  );
}

function Lots({ y }) {
  const pkr = usePkr();
  return (
    <>
      {y.months.map((m) => (
        <Box key={m.month}>
          <H sub={`${m.lots.length} lot${m.lots.length === 1 ? '' : 's'} · net ${pkr(m.net, { sign: true })} · CGT this month ${pkr(m.cgtThisMonth)}`}>{monthLabel(m.month)}</H>
          <Box className="nccpl-scroll" sx={{ overflowX: 'auto' }}>
            <Box component="table" sx={{ ...tableSx({ first: 'left', small: true }), minWidth: 900 }}>
              <thead>
                <tr><th>Stock</th><th>Qty</th><th>Bought → Sold (rate)</th><th>Purchase settled</th><th>Sale settled</th><th>Days</th><th>Sale value</th><th>Cost</th><th>Deemed 0.5%+0.5%</th><th>Gain / (loss)</th><th>Prov. CGT</th></tr>
              </thead>
              <tbody>
                {m.lots.map((l, i) => (
                  <Box component="tr" key={i} className="nccpl-keep">
                    <td>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                        <StockLogo symbol={l.symbol} size="sm" />
                        <Box component="span" sx={{ fontWeight: 700 }}>{l.symbol}</Box>
                      </Box>
                    </td>
                    <td>{l.quantity.toLocaleString('en-PK')}</td>
                    <td>
                      <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, whiteSpace: 'nowrap' }}>
                        <span>{rate(l.buyPrice)}</span>
                        <EastRounded sx={{ fontSize: 13, color: tone(l.sellPrice - l.buyPrice) }} />
                        <Box component="span" sx={{ fontWeight: 700, color: tone(l.sellPrice - l.buyPrice) }}>{rate(l.sellPrice)}</Box>
                      </Box>
                    </td>
                    <td><DateCell trade={l.buyDate} settled={l.buySettlement} /></td>
                    <td><DateCell trade={l.saleDate} settled={l.settlement} /></td>
                    <td>{l.holdingDays}</td>
                    <td>{pkr(l.sale)}</td>
                    <td>{pkr(l.cost)}</td>
                    <Box component="td" sx={{ color: P.muted }}>{pkr(l.deemedCost)}</Box>
                    <Box component="td" sx={{ fontWeight: 700, color: tone(l.gain) }}>{pkr(l.gain)}</Box>
                    <td>{pkr(l.provisionalCgt)}</td>
                  </Box>
                ))}
                <Box component="tr" sx={{ '& td': { fontWeight: 750, borderTop: `1.5px solid ${P.ink}` } }}>
                  <td colSpan={6}>Gains {pkr(m.gains)} · Losses {pkr(m.losses)}</td>
                  <td>{pkr(m.lots.reduce((s, l) => s + l.sale, 0))}</td>
                  <td>{pkr(m.lots.reduce((s, l) => s + l.cost, 0))}</td>
                  <td>{pkr(m.lots.reduce((s, l) => s + l.deemedCost, 0))}</td>
                  <Box component="td" sx={{ color: tone(m.net) }}>{pkr(m.net)}</Box>
                  <td>{pkr(m.lots.reduce((s, l) => s + l.provisionalCgt, 0))}</td>
                </Box>
              </tbody>
            </Box>
          </Box>
          <Typography sx={{ fontSize: '0.66rem', color: P.muted, mt: 0.5 }}>
            Running net to {monthLabel(m.month)}: {pkr(m.ytdNet)} · CGT so far {pkr(m.ytdCgt)} · charged before {pkr(m.previouslyCharged)} · this month {pkr(m.cgtThisMonth)}
            {' '}(provisional CGT per lot is 15% of each gain; the month&apos;s charge nets the losses).
          </Typography>
        </Box>
      ))}
    </>
  );
}

const rate = (n) => n.toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 4 });

function DateCell({ trade, settled }) {
  return (
    <Box sx={{ lineHeight: 1.25, whiteSpace: 'nowrap' }}>
      <Box sx={{ fontWeight: 600 }}>{shortDate(settled)}</Box>
      <Box sx={{ fontSize: '0.62rem', color: P.muted }}>traded {shortDate(trade, false)}</Box>
    </Box>
  );
}

function tableSx({ first, small } = {}) {
  return {
    width: '100%', borderCollapse: 'collapse',
    '& th': { fontSize: '0.64rem', fontWeight: 700, color: P.ink2, textAlign: 'right', bgcolor: P.band, px: 1, py: 0.75, whiteSpace: 'nowrap', borderBottom: `1px solid ${P.rule}` },
    '& td': { fontSize: small ? '0.72rem' : '0.78rem', textAlign: 'right', px: 1, py: small ? 0.6 : 0.8, borderBottom: `1px solid ${P.hair}`, fontFamily: NUM, verticalAlign: 'middle', color: P.ink },
    ...(first === 'left' ? {
      '& th:first-of-type': { textAlign: 'left' },
      '& td:first-of-type': { textAlign: 'left', fontFamily: 'inherit' },
    } : {}),
  };
}
