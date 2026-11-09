import { useMemo, useRef, useState } from 'react';
import { Box, Dialog, Typography, IconButton, GlobalStyles, Tooltip, CircularProgress, useMediaQuery } from '@mui/material';
import { ThemeProvider } from '@mui/material/styles';
import { CloseRounded, FileDownloadOutlined, EastRounded } from '@mui/icons-material';
import { useNccpl } from '../../lib/psx/useNccpl';
import { usePsxPortfolio } from '../../lib/psx/usePsxPortfolio';
import { taxYearRange, taxYearLabel, CARRY_FORWARD_YEARS } from '../../lib/psx/nccpl';
import { useProfile } from '../../lib/profile/useProfile';
import { BROKERS } from '../../lib/psx/confirmations';
import { shortDate, monthLabel, todayIso } from '../../lib/dateRange';
import { useAppStore } from '../../store/appStore';
import { PillSelect, FONT_TEXT } from '../../components/fx';
import StockLogo from '../../components/StockLogo';
import { buildTheme } from '../../theme';
import { downloadSheetsAsPdf } from '../../lib/pdfExport';

/** The statement is white paper in both app themes, so its controls (picker, menus, buttons,
 *  tooltips) are rendered with the light theme too; otherwise dark-mode styles land on white. */
const PAPER_THEME = buildTheme('light');

/**
 * The statement is paper: the same in light and dark mode, and it prints as it looks.
 * One typeface (the app's text face) for words and figures alike, tabular figures;
 * no rules or borders: every block is a soft card on white.
 */
const P = {
  paper: '#ffffff', card: '#f5f6f8', card2: '#eceef1', ink: '#0b0c0e', ink2: '#4a5058', muted: '#8a8f97',
  black: '#0b0b0c', gold: '#c9a27e', pos: '#127046', neg: '#c0302a', posSoft: '#e6f3eb', negSoft: '#fbe9e7',
  backdrop: '#e7e9ec',
};
const F = FONT_TEXT;
const MARK = '/brand/mark-256.png';
const NCCPL_LOGO = '/report-logos/nccpl.webp';

/** PKR, 2 decimals; a loss in brackets as on NCCPL's own statements. Masked in privacy mode. */
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
const rate = (n) => n.toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 4 });

/**
 * Capital gains statement for one tax year, computed the NCCPL way (src/lib/psx/nccpl.js):
 * page 1 is the summary (key figures, the A–E computation, what was actually kept after the
 * broker's fees and CGT, month by month); page 2 is every lot. The download icon saves an A4 PDF
 * file directly (src/lib/pdfExport.js): watermark and page footer on every page, pages cut between
 * blocks. Ctrl+P still prints it through the print styles below.
 */
export default function NccplReport({ taxYear: initial, onClose }) {
  const { report } = useNccpl();
  const { data: profile } = useProfile();
  const years = useMemo(() => (report?.years ?? []).filter((y) => y.lots.length || y.carriedIn.length).map((y) => y.taxYear).reverse(), [report]);
  const [pick, setPick] = useState(initial);
  const ty = years.includes(pick) ? pick : years[0];
  const range = ty ? taxYearRange(ty) : null;
  const { portfolio } = usePsxPortfolio(range ?? undefined);
  return <ReportView report={report} profile={profile} totals={portfolio?.totals} years={years} ty={ty} onPick={setPick} onClose={onClose} />;
}

/** The statement itself, from data: report = nccplReport(), totals = analyzeStocks totals for the tax year. */
export function ReportView({ report, profile, totals, years, ty, onPick, onClose }) {
  const isMobile = useMediaQuery('(max-width:900px)');
  const y = report?.year(ty);
  const brokers = y ? [...new Set(y.lots.map((l) => l.broker).filter((b) => BROKERS[b]))] : [];
  const sheets = useRef(null);
  const [saving, setSaving] = useState(false);
  const download = async () => {
    if (!y || !sheets.current || saving) return;
    setSaving(true);
    try {
      await downloadSheetsAsPdf([...sheets.current.querySelectorAll('.fx-sheet')], {
        filename: `Fintraxa-Capital-Gains-TY${taxYearLabel(y.taxYear)}.pdf`,
        footer: `Fintraxa · Capital gains statement · Tax year ${taxYearLabel(y.taxYear)} · Prepared ${shortDate(todayIso())}`,
        watermark: MARK,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <ThemeProvider theme={PAPER_THEME}>
    <Dialog open onClose={onClose} fullScreen className="fx-report-root" PaperProps={{ sx: { bgcolor: P.backdrop, backgroundImage: 'none' } }}>
      <GlobalStyles styles={{
        '@media print': {
          '@page': { size: 'A4', margin: '10mm' },
          'body > *:not(.fx-report-root)': { display: 'none !important' },
          '.fx-report-root, .fx-report-root .MuiDialog-container, .fx-report-root .MuiDialog-paper': {
            position: 'static !important', overflow: 'visible !important', height: 'auto !important', maxHeight: 'none !important',
            background: '#fff !important', boxShadow: 'none !important',
          },
          '.fx-report-root .MuiBackdrop-root, .fx-no-print': { display: 'none !important' },
          '.fx-sheet': { boxShadow: 'none !important', margin: '0 !important', padding: '0 !important', maxWidth: 'none !important', borderRadius: '0 !important', overflow: 'visible !important' },
          // Fixed elements repeat on every printed page: one watermark, behind each page.
          '.fx-wm': { position: 'fixed !important', inset: '0 !important' },
          '.fx-sheet + .fx-sheet .fx-wm': { display: 'none !important' },
          '.fx-break': { breakBefore: 'page' },
          '.fx-keep': { breakInside: 'avoid' },
          '.fx-scroll': { overflow: 'visible !important' },
          'body': { WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' },
        },
      }} />

      <Box className="fx-no-print" sx={{
        position: 'sticky', top: 0, zIndex: 3, display: 'flex', alignItems: 'center', gap: 1, px: { xs: 1.5, md: 3 }, py: 1.1,
        bgcolor: 'rgba(231,233,236,0.82)', backdropFilter: 'blur(14px)', color: P.ink, fontFamily: F,
      }}>
        <Box component="img" src={MARK} alt="" sx={{ width: 28, height: 28, objectFit: 'contain', p: '4px', bgcolor: P.black, borderRadius: '9px' }} />
        <Typography sx={{ fontFamily: F, fontWeight: 700, fontSize: '0.92rem', flex: 1, minWidth: 0 }} noWrap>Capital gains statement</Typography>
        {years.length > 1 && (
          <PillSelect value={ty} onChange={onPick} label="Tax year" width={isMobile ? 118 : 150}
            items={years.map((v) => ({ value: v, label: `TY ${taxYearLabel(v)}` }))} />
        )}
        <Tooltip title="Download PDF" arrow>
          <span>
            <IconButton onClick={download} disabled={!y || saving} aria-label="Download PDF"
              sx={{ width: 40, height: 40, borderRadius: '12px', bgcolor: P.black, color: '#fff', '&:hover': { bgcolor: '#26272a' }, '&.Mui-disabled': { bgcolor: P.card2 } }}>
              {saving ? <CircularProgress size={18} sx={{ color: '#fff' }} /> : <FileDownloadOutlined sx={{ fontSize: 20 }} />}
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title="Close" arrow>
          <IconButton onClick={onClose} aria-label="Close statement" sx={{ width: 40, height: 40, borderRadius: '12px', bgcolor: '#fff', color: P.ink, '&:hover': { bgcolor: P.card } }}>
            <CloseRounded sx={{ fontSize: 20 }} />
          </IconButton>
        </Tooltip>
      </Box>

      <Box ref={sheets} sx={{ px: { xs: 0, md: 3 }, pt: { xs: 0, md: 1.5 }, pb: { xs: 0, md: 4 }, fontFamily: F }}>
        {!report ? null : !y ? (
          <Sheet>
            <Masthead title="Capital Gains Statement" sub="No shares sold yet" />
            <Typography sx={{ fontFamily: F, color: P.muted, py: 8, textAlign: 'center', fontSize: '0.85rem' }}>There is no capital gain or loss to report yet.</Typography>
          </Sheet>
        ) : (
          <>
            <Sheet>
              <Masthead title="Capital Gains Statement" sub={`Tax year ${taxYearLabel(y.taxYear)} · ${shortDate(y.start)} – ${shortDate(y.end)}`} />
              <Account profile={profile} brokers={brokers} />
              <KeyFigures y={y} />
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 1.5, mt: 1.5 }}>
                <Computation y={y} />
                <Kept y={y} totals={totals} />
              </Box>
              <Months y={y} />
              <Method y={y} unmatched={report.unmatched.filter((u) => u.settlement >= y.start && u.settlement <= y.end)} />
              <Footer />
            </Sheet>
            <Sheet breakBefore>
              <Masthead compact title="Lot details" sub={`Tax year ${taxYearLabel(y.taxYear)} · ${y.lots.length} lots`} />
              <Lots y={y} />
              <Footer />
            </Sheet>
          </>
        )}
      </Box>
    </Dialog>
    </ThemeProvider>
  );
}

function Sheet({ children, breakBefore }) {
  return (
    <Box className={`fx-sheet${breakBefore ? ' fx-break' : ''}`} sx={{
      position: 'relative', overflow: 'hidden', bgcolor: P.paper, color: P.ink, maxWidth: 940, mx: 'auto', mb: { xs: 1, md: 3 },
      p: { xs: 1.5, md: 4 }, borderRadius: { xs: 0, md: '22px' },
      boxShadow: { xs: 'none', md: '0 30px 70px -34px rgba(10,12,16,.32)' },
      fontFamily: F, fontSize: '0.8rem', '& *': { fontFamily: `${F} !important`, fontVariantNumeric: 'tabular-nums lining-nums' },
    }}>
      <Watermark />
      <Box className="fx-sheet-body" sx={{ position: 'relative', zIndex: 1 }}>{children}</Box>
    </Box>
  );
}

/**
 * Fintraxa marks in a staggered diagonal pattern over the page: faint enough to read through,
 * on top of the cards so they show everywhere. The PDF export draws the same pattern per page.
 */
const WM_COLS = 5;
function Watermark() {
  return (
    <Box className="fx-wm" aria-hidden sx={{ position: 'absolute', inset: 0, zIndex: 2, pointerEvents: 'none', overflow: 'hidden' }}>
      <Box sx={{ position: 'absolute', inset: '-12%', display: 'grid', gridTemplateColumns: `repeat(${WM_COLS}, 1fr)`, gridAutoRows: '200px', placeItems: 'center', transform: 'rotate(-18deg)' }}>
        {Array.from({ length: WM_COLS * 26 }, (_, i) => (
          <Box key={i} component="img" src={MARK} alt="" sx={{ width: 78, height: 78, objectFit: 'contain', opacity: 0.06, filter: 'grayscale(1)', transform: Math.floor(i / WM_COLS) % 2 ? 'translateX(50%)' : 'none' }} />
        ))}
      </Box>
    </Box>
  );
}

function Card({ children, sx, className = 'fx-keep' }) {
  return <Box className={className} sx={{ bgcolor: P.card, borderRadius: '16px', p: { xs: 1.75, md: 2.25 }, minWidth: 0, ...sx }}>{children}</Box>;
}

function Eyebrow({ children, color = P.muted }) {
  return <Typography sx={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color }}>{children}</Typography>;
}

function CardTitle({ children, sub, right }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, mb: 1.5, flexWrap: 'wrap' }}>
      <Typography component="h2" sx={{ fontSize: '0.92rem', fontWeight: 750, letterSpacing: '-0.01em' }}>{children}</Typography>
      {sub && <Typography sx={{ fontSize: '0.7rem', color: P.muted }}>{sub}</Typography>}
      {right && <><Box sx={{ flex: 1 }} />{right}</>}
    </Box>
  );
}

/** Brand on black on the left; the statement and NCCPL, whose method it follows, on the right. */
function Masthead({ title, sub, compact }) {
  return (
    <Box className="fx-keep fx-keep-next" sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: compact ? '210px 1fr' : '250px 1fr' }, gap: 1.5 }}>
      <Box sx={{ bgcolor: P.black, borderRadius: '16px', display: 'flex', alignItems: 'center', gap: 1.5, px: compact ? 2 : 2.5, py: compact ? 1.5 : 2.5 }}>
        <Box component="img" src={MARK} alt="Fintraxa" sx={{ width: compact ? 32 : 44, height: compact ? 32 : 44, objectFit: 'contain' }} />
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ fontSize: compact ? '1.1rem' : '1.42rem', fontWeight: 800, letterSpacing: '-0.035em', lineHeight: 1, color: '#f7f1ea' }}>Fintraxa</Typography>
          {!compact && <Box sx={{ mt: 0.7 }}><Eyebrow color={P.gold}>Personal finance</Eyebrow></Box>}
        </Box>
      </Box>
      <Card className="" sx={{ display: 'flex', alignItems: 'center', gap: 2, py: compact ? 1.5 : 2.5 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography component="h1" sx={{ fontSize: compact ? '1.05rem' : '1.4rem', fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.15 }}>{title}</Typography>
          <Typography sx={{ fontSize: '0.74rem', color: P.ink2, mt: 0.5 }}>{sub}</Typography>
        </Box>
        <Box sx={{ textAlign: 'center', flexShrink: 0 }}>
          <Box component="img" src={NCCPL_LOGO} alt="NCCPL" sx={{ width: compact ? 36 : 50, height: compact ? 36 : 50, objectFit: 'contain', borderRadius: '10px', display: 'block', mx: 'auto' }} />
          {!compact && <Typography sx={{ fontSize: '0.56rem', color: P.muted, mt: 0.6, whiteSpace: 'nowrap' }}>NCCPL method</Typography>}
        </Box>
      </Card>
    </Box>
  );
}

function Account({ profile, brokers }) {
  const field = (label, value) => (
    <Box sx={{ minWidth: 0 }}>
      <Eyebrow>{label}</Eyebrow>
      <Box sx={{ mt: 0.6 }}>{value}</Box>
    </Box>
  );
  const text = (v) => <Typography sx={{ fontSize: '0.84rem', fontWeight: 650 }} noWrap>{v}</Typography>;
  return (
    <Card sx={{ mt: 1.5, display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: '1.2fr 0.8fr 1.5fr 0.8fr' }, gap: 2 }}>
      {field('Taxpayer', text(profile?.full_name || profile?.username || '—'))}
      {field('Tax status', text(profile?.filer_status === 'non_filer' ? 'Non-filer' : 'Filer (ATL)'))}
      {field('Brokers', brokers.length ? (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
          {brokers.map((b) => (
            <Box key={b} sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75 }}>
              <Box component="img" src={BROKERS[b].logo} alt="" sx={{ width: 22, height: 22, borderRadius: '7px', objectFit: 'cover' }} />
              <Typography component="span" sx={{ fontSize: '0.82rem', fontWeight: 650, whiteSpace: 'nowrap' }}>{BROKERS[b].name}</Typography>
            </Box>
          ))}
        </Box>
      ) : text('Entered by hand'))}
      {field('Statement date', text(shortDate(todayIso())))}
    </Card>
  );
}

/** Rs small and muted, the figure large. */
function Big({ v, color, size = '1.5rem' }) {
  const pkr = usePkr();
  return (
    <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.6, mt: 1, whiteSpace: 'nowrap' }}>
      <Box component="span" sx={{ fontSize: '0.68rem', fontWeight: 650, opacity: 0.5 }}>Rs</Box>
      <Box component="span" sx={{ fontSize: size, fontWeight: 750, letterSpacing: '-0.035em', lineHeight: 1, color }}>{pkr(v)}</Box>
    </Box>
  );
}

function KeyFigures({ y }) {
  const tile = (label, v, { dark, color, note } = {}) => (
    <Card sx={{ ...(dark ? { bgcolor: P.black, color: '#fff' } : {}) }}>
      <Eyebrow color={dark ? P.gold : P.muted}>{label}</Eyebrow>
      <Big v={v} color={dark ? '#fff' : color} />
      <Typography sx={{ fontSize: '0.64rem', mt: 0.9, color: dark ? 'rgba(255,255,255,0.6)' : P.muted }}>{note}</Typography>
    </Card>
  );
  return (
    <Box className="fx-keep" sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, minmax(0, 1fr))' }, gap: 1.5, mt: 1.5 }}>
      {tile('Net capital gain', y.net, { color: tone(y.net), note: `${y.lots.length} lots closed` })}
      {tile('Losses set off', y.carriedUsed ? -y.carriedUsed : 0, { color: y.carriedUsed ? P.neg : P.ink, note: y.carriedUsed ? 'Brought forward' : 'None brought forward' })}
      {tile('Taxable gain', y.taxable, { note: y.net < 0 ? 'Loss year' : 'After losses set off' })}
      {tile('CGT payable', y.cgt, { dark: true, note: '15% of the taxable gain' })}
    </Box>
  );
}

/** A statement line: no rules; totals are set apart by weight and a little air. */
function Line({ k, label, v, strong, color, plainValue }) {
  const pkr = usePkr();
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, py: 0.7, ...(strong ? { mt: 0.5 } : {}) }}>
      {k !== undefined && <Box sx={{ width: 16, fontSize: '0.64rem', fontWeight: 800, color: P.gold }}>{k}</Box>}
      <Typography sx={{ flex: 1, minWidth: 0, fontSize: '0.8rem', fontWeight: strong ? 750 : 500, color: strong ? P.ink : P.ink2 }}>{label}</Typography>
      <Typography sx={{ fontSize: strong ? '0.9rem' : '0.82rem', fontWeight: strong ? 750 : 600, color: color ?? (plainValue ? P.ink : tone(v)), whiteSpace: 'nowrap' }}>{pkr(v)}</Typography>
    </Box>
  );
}

function Pill({ label, v, color, bg }) {
  const pkr = usePkr();
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', mt: 1.25, px: 1.75, py: 1.3, borderRadius: '12px', bgcolor: bg }}>
      <Typography sx={{ flex: 1, fontWeight: 750, fontSize: '0.84rem', color: color === '#fff' ? '#fff' : P.ink }}>{label}</Typography>
      <Typography sx={{ fontWeight: 800, fontSize: '1.08rem', letterSpacing: '-0.03em', color }}>Rs {pkr(v)}</Typography>
    </Box>
  );
}

function Computation({ y }) {
  const pkr = usePkr();
  const won = y.lots.filter((l) => l.gain > 0).length; const lost = y.lots.filter((l) => l.gain < 0).length;
  return (
    <Card sx={{ display: 'flex', flexDirection: 'column' }}>
      <CardTitle sub="as NCCPL computes it">Computation</CardTitle>
      <Line k="A" label={`Capital gains · ${won} lots`} v={y.gains} />
      <Line k="B" label={`Capital losses · ${lost} lots`} v={y.losses} />
      <Line k="C" label="Net gain / (loss)" v={y.net} strong />
      {y.carriedIn.map((c) => <Line key={c.fromYear} k="" label={`Loss brought forward · TY ${taxYearLabel(c.fromYear)}`} v={-c.used} />)}
      <Line k="D" label="Taxable gain" v={y.taxable} strong plainValue />
      <Box sx={{ mt: 'auto' }}>
        <Pill label="E  CGT @ 15%" v={y.cgt} color="#fff" bg={P.black} />
      </Box>
      {y.carryForward.length > 0 && (
        <Box sx={{ mt: 1.5 }}>
          <Eyebrow>Losses carried forward</Eyebrow>
          {y.carryForward.map((c) => (
            <Box key={c.fromYear} sx={{ display: 'flex', gap: 1, fontSize: '0.74rem', pt: 0.6, color: P.ink2 }}>
              <Box sx={{ flex: 1 }}>TY {taxYearLabel(c.fromYear)} · usable until TY {taxYearLabel(c.expires)}</Box>
              <Box sx={{ color: P.neg, fontWeight: 650 }}>{pkr(-c.amount)}</Box>
            </Box>
          ))}
        </Box>
      )}
    </Card>
  );
}

/** What was actually kept: the broker's real charges and average cost, then the CGT above. */
function Kept({ y, totals }) {
  if (!totals) return <Card />;
  const keep = Math.round((totals.realized - y.cgt) * 100) / 100;
  return (
    <Card sx={{ display: 'flex', flexDirection: 'column' }}>
      <CardTitle sub="after your broker's actual fees">What you kept</CardTitle>
      <Line label="Profit before fees" v={totals.realizedGross} />
      <Line label="Broker fees" v={-(totals.realizedFees ?? 0)} plainValue />
      <Line label="Net profit" v={totals.realized} strong />
      <Line label="CGT (E)" v={-y.cgt} plainValue />
      <Box sx={{ mt: 'auto' }}>
        <Pill label="You keep" v={keep} color={tone(keep)} bg={keep >= 0 ? P.posSoft : P.negSoft} />
      </Box>
    </Card>
  );
}

/** Tables without lines: air between rows, a soft band behind the totals. */
function tableSx({ small } = {}) {
  return {
    width: '100%', borderCollapse: 'separate', borderSpacing: 0,
    '& th': { fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: P.muted, textAlign: 'right', px: 1, pb: 0.9, whiteSpace: 'nowrap' },
    '& td': { fontSize: small ? '0.72rem' : '0.78rem', textAlign: 'right', px: 1, py: small ? 0.65 : 0.75, color: P.ink, whiteSpace: 'nowrap', verticalAlign: 'middle' },
    '& th:first-of-type, & td:first-of-type': { textAlign: 'left', pl: 1.25 },
    '& th:last-of-type, & td:last-of-type': { pr: 1.25 },
    '& tbody tr.total td': { fontWeight: 800, bgcolor: P.card2, py: 1 },
    '& tbody tr.total td:first-of-type': { borderRadius: '10px 0 0 10px' },
    '& tbody tr.total td:last-of-type': { borderRadius: '0 10px 10px 0' },
  };
}

function Months({ y }) {
  const pkr = usePkr();
  const withCarry = y.carriedIn.length > 0;
  return (
    <Card sx={{ mt: 1.5 }} className="">
      <CardTitle sub="CGT runs on through the year; a falling month is refunded">Month by month</CardTitle>
      <Box className="fx-scroll" sx={{ overflowX: 'auto', mx: -1.25 }}>
        <Box component="table" sx={{ ...tableSx(), minWidth: withCarry ? 700 : 620 }}>
          <thead>
            <tr><th>Month</th><th>Lots</th><th>Gains</th><th>Losses</th><th>Net</th><th>Running net</th>{withCarry && <th>Taxable</th>}<th>CGT to date</th><th>This month</th></tr>
          </thead>
          <tbody>
            {y.months.map((m) => (
              <tr key={m.month}>
                <Box component="td" sx={{ fontWeight: 650 }}>{monthLabel(m.month)}</Box>
                <Box component="td" sx={{ color: `${P.muted} !important` }}>{m.lots.length}</Box>
                <Box component="td" sx={{ color: `${tone(m.gains)} !important` }}>{pkr(m.gains)}</Box>
                <Box component="td" sx={{ color: `${tone(m.losses)} !important` }}>{pkr(m.losses)}</Box>
                <Box component="td" sx={{ color: `${tone(m.net)} !important`, fontWeight: 650 }}>{pkr(m.net)}</Box>
                <Box component="td" sx={{ color: `${tone(m.ytdNet)} !important` }}>{pkr(m.ytdNet)}</Box>
                {withCarry && <td>{pkr(m.ytdTaxable)}</td>}
                <td>{pkr(m.ytdCgt)}</td>
                <Box component="td" sx={{ fontWeight: 750 }}>
                  {m.cgtThisMonth < 0
                    ? <Box component="span" sx={{ color: P.pos }}>{pkr(-m.cgtThisMonth)} <Box component="span" sx={{ fontSize: '0.58rem', fontWeight: 700, bgcolor: P.posSoft, px: 0.7, py: '1px', borderRadius: 999 }}>refund</Box></Box>
                    : pkr(m.cgtThisMonth)}
                </Box>
              </tr>
            ))}
            <tr className="total">
              <td>Year</td>
              <td>{y.lots.length}</td>
              <Box component="td" sx={{ color: `${tone(y.gains)} !important` }}>{pkr(y.gains)}</Box>
              <Box component="td" sx={{ color: `${tone(y.losses)} !important` }}>{pkr(y.losses)}</Box>
              <Box component="td" sx={{ color: `${tone(y.net)} !important` }}>{pkr(y.net)}</Box>
              <td />
              {withCarry && <td>{pkr(y.taxable)}</td>}
              <td />
              <td>{pkr(y.cgt)}</td>
            </tr>
          </tbody>
        </Box>
      </Box>
    </Card>
  );
}

function Method({ y, unmatched }) {
  const older = y.lots.filter((l) => l.olderRegime).length;
  const items = [
    'Each sale is matched with the oldest purchase of that stock still held, by settlement date (T+1).',
    'Gain = sale − cost − 0.5% of the sale − 0.5% of the cost (Rule 13N deemed costs).',
    `CGT is 15% of the year's running net after losses brought forward; a net loss carries forward ${CARRY_FORWARD_YEARS} tax years.`,
    older > 0 && `${older} lot${older === 1 ? ' was' : 's were'} bought before 1 July 2024, when holding-period rates applied; 15% is used here.`,
    unmatched.length > 0 && `Sold without a recorded purchase, left out: ${unmatched.map((u) => `${u.quantity} ${u.symbol}`).join(', ')}.`,
  ].filter(Boolean);
  return (
    <Card sx={{ mt: 1.5 }}>
      <Eyebrow>Method</Eyebrow>
      <Box component="ol" sx={{ m: 0, mt: 0.9, pl: 2.25, display: 'grid', gap: 0.5 }}>
        {items.map((s, i) => <Box component="li" key={i} sx={{ fontSize: '0.7rem', color: P.ink2, lineHeight: 1.5 }}>{s}</Box>)}
      </Box>
    </Card>
  );
}

function Footer() {
  return (
    <Box className="fx-footer" sx={{ mt: 2.5, display: 'flex', alignItems: 'center', gap: 1, color: P.muted }}>
      <Box component="img" src={MARK} alt="" sx={{ width: 18, height: 18, objectFit: 'contain', p: '3px', bgcolor: P.black, borderRadius: '5px' }} />
      <Typography sx={{ fontSize: '0.62rem', flex: 1 }}>Prepared by Fintraxa on {shortDate(todayIso())} from the trades you recorded.</Typography>
    </Box>
  );
}

function Lots({ y }) {
  const pkr = usePkr();
  return (
    <Box sx={{ display: 'grid', gap: 1.5, mt: 1.5 }}>
      {y.months.map((m) => (
        <Card key={m.month} className="">
          <CardTitle sub={`${m.lots.length} lot${m.lots.length === 1 ? '' : 's'}`}
            right={(
              <Typography sx={{ fontSize: '0.72rem', color: P.ink2 }}>
                Net <Box component="b" sx={{ color: tone(m.net) }}>{pkr(m.net, { sign: true })}</Box>
                <Box component="span" sx={{ mx: 1.25, color: P.muted }}>·</Box>
                CGT <Box component="b" sx={{ color: m.cgtThisMonth < 0 ? P.pos : P.ink }}>{m.cgtThisMonth < 0 ? `${pkr(-m.cgtThisMonth)} refund` : pkr(m.cgtThisMonth)}</Box>
              </Typography>
            )}>
            {monthLabel(m.month)}
          </CardTitle>
          <Box className="fx-scroll" sx={{ overflowX: 'auto', mx: -1.25 }}>
            <Box component="table" sx={{ ...tableSx({ small: true }), minWidth: 800 }}>
              <thead>
                <tr><th>Stock</th><th>Qty</th><th>Buy → Sell</th><th>Bought</th><th>Sold</th><th>Days</th><th>Sale value</th><th>Cost</th><th>Deemed 1%</th><th>Gain / (loss)</th></tr>
              </thead>
              <tbody>
                {m.lots.map((l, i) => (
                  <Box component="tr" key={i} className="fx-keep">
                    <td>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                        <StockLogo symbol={l.symbol} size="sm" />
                        <Box component="span" sx={{ fontWeight: 750 }}>{l.symbol}</Box>
                      </Box>
                    </td>
                    <td>{l.quantity.toLocaleString('en-PK')}</td>
                    <td>
                      <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                        <span>{rate(l.buyPrice)}</span>
                        <EastRounded sx={{ fontSize: 12, color: P.muted }} />
                        <Box component="span" sx={{ fontWeight: 750, color: tone(l.sellPrice - l.buyPrice) }}>{rate(l.sellPrice)}</Box>
                      </Box>
                    </td>
                    <td><DateCell trade={l.buyDate} settled={l.buySettlement} /></td>
                    <td><DateCell trade={l.saleDate} settled={l.settlement} /></td>
                    <Box component="td" sx={{ color: `${P.muted} !important` }}>{l.holdingDays}</Box>
                    <td>{pkr(l.sale)}</td>
                    <td>{pkr(l.cost)}</td>
                    <Box component="td" sx={{ color: `${P.muted} !important` }}>{pkr(l.deemedCost)}</Box>
                    <Box component="td" sx={{ fontWeight: 750, color: `${tone(l.gain)} !important` }}>{pkr(l.gain)}</Box>
                  </Box>
                ))}
                <tr className="total">
                  <td colSpan={6}>Month total</td>
                  <td>{pkr(m.lots.reduce((s, l) => s + l.sale, 0))}</td>
                  <td>{pkr(m.lots.reduce((s, l) => s + l.cost, 0))}</td>
                  <td>{pkr(m.lots.reduce((s, l) => s + l.deemedCost, 0))}</td>
                  <Box component="td" sx={{ color: `${tone(m.net)} !important` }}>{pkr(m.net)}</Box>
                </tr>
              </tbody>
            </Box>
          </Box>
        </Card>
      ))}
    </Box>
  );
}

function DateCell({ trade, settled }) {
  return (
    <Box sx={{ lineHeight: 1.25 }}>
      <Box sx={{ fontWeight: 650 }}>{shortDate(settled)}</Box>
      <Box sx={{ fontSize: '0.6rem', color: P.muted }}>traded {shortDate(trade, false)}</Box>
    </Box>
  );
}
