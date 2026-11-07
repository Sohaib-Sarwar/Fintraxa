import { useMemo, useState } from 'react';
import { Box, Skeleton, Typography, ButtonBase, Collapse, Button, useMediaQuery } from '@mui/material';
import { ExpandMoreRounded } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { useMfAnalysis } from '../../lib/mf/useMfPortfolio';
import { useDateRange, rangeLabel, shortDate } from '../../lib/dateRange';
import { formatCurrency } from '../../lib/formatters';
import { useFx, PageHeader, ValueCard, MonthlyProfitChart, FONT_NUM, signColor } from '../../components/fx';
import AmcLogo from './AmcLogo';
import { FundDetailsDialog } from './MFDetails';
import { monthName } from './mfLabels';

const AMC_SHORT = { atlas: 'Atlas', mcb: 'MCB', meezan: 'Meezan', nbp: 'NBP', ubl: 'UBL' };
/** The range's first day, or the first month with data for "All time". */
const periodStart = (a) => {
  const first = a.months[0] ? `${a.months[0].month}-01` : a.start;
  return a.start > first ? a.start : first;
};
const signed = (v) => (v === null || v === undefined ? '—' : `${v > 0 ? '+' : v < 0 ? '−' : ''}${formatCurrency(Math.abs(v))}`);

/**
 * Mutual funds for the selected range: the value card and profit by month
 * side by side, then the funds held now, then (folded) the ones sold.
 */
export default function MFDashboard() {
  const t = useFx();
  const isMobile = useMediaQuery('(max-width:900px)');
  const navigate = useNavigate();
  const { range } = useDateRange();
  const { analysis: a, isLoading } = useMfAnalysis(range);
  const [fund, setFund] = useState(null);
  const [showPrev, setShowPrev] = useState(false);
  const label = rangeLabel(range);

  const { held, previous } = useMemo(() => {
    if (!a) return { held: [], previous: [] };
    return {
      held: a.positions.filter((p) => p.isOpen).sort((x, y) => (y.value ?? 0) - (x.value ?? 0)),
      previous: a.allPositions.filter((p) => !p.isOpen).sort((x, y) => (y.lastDate ?? '').localeCompare(x.lastDate ?? '')),
    };
  }, [a]);

  if (isLoading || !a) {
    return (
      <Box>
        <PageHeader title="Mutual Funds" />
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2, mb: 2 }}>
          <Skeleton variant="rounded" height={330} sx={{ borderRadius: '26px' }} />
          <Skeleton variant="rounded" height={330} sx={{ borderRadius: '26px' }} />
        </Box>
      </Box>
    );
  }

  const tt = a.totals;
  const hasAny = a.allPositions.length > 0;

  return (
    <Box sx={{ pb: isMobile ? 1 : 0 }}>
      <PageHeader title="Mutual Funds" />

      {!hasAny ? (
        <Box sx={{ textAlign: 'center', py: 8, px: 2, border: `1px dashed ${t.border}`, borderRadius: '26px' }}>
          <Typography sx={{ fontWeight: 700, mb: 0.5 }}>No funds yet</Typography>
          <Typography sx={{ fontSize: '0.82rem', color: t.muted, mb: 2 }}>Upload a statement or add a fund by hand.</Typography>
          <Button variant="contained" disableElevation onClick={() => navigate('/funds/add')} sx={{ borderRadius: 999 }}>Add fund</Button>
        </Box>
      ) : (
        <>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1fr) minmax(0, 1fr)' }, gap: 2, mb: 2.5, alignItems: 'stretch' }}>
            <ValueCard
              title="Current value"
              badge={label}
              value={tt.value}
              panels={[
                { tone: 'indigo', items: [{ label: 'Invested', value: formatCurrency(tt.invested) }, { label: 'Funds held', value: String(tt.held) }] },
                {
                  tone: 'lavender',
                  items: [
                    { label: 'Realized gain', value: signed(tt.realized.net), onClick: () => navigate('/funds/analytics') },
                    { label: 'Unrealized gain', value: signed(tt.unrealized.net), onClick: () => navigate('/funds/analytics') },
                  ],
                },
              ]}
            />
            <MonthlyProfitChart months={a.months} monthName={monthName} height={isMobile ? 200 : 210}
              subtitle={`${shortDate(periodStart(a))} to ${shortDate(a.end)}`} />
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', mb: 1.25 }}>
            <Typography component="h2" sx={{ fontSize: '1rem', fontWeight: 750, letterSpacing: '-0.02em' }}>
              Holdings <Box component="span" sx={{ color: t.muted, fontWeight: 500 }}>{held.length}</Box>
            </Typography>
          </Box>
          {held.length === 0 ? (
            <Typography sx={{ fontSize: '0.82rem', color: t.muted, mb: 2 }}>Nothing held at the end of {label}.</Typography>
          ) : (
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(3, minmax(0, 1fr))', xl: 'repeat(4, minmax(0, 1fr))' }, gap: 1.5, mb: 2 }}>
              {held.map((p) => <HoldingCard key={p.key} p={p} onOpen={() => setFund(p)} />)}
            </Box>
          )}

          {previous.length > 0 && (
            <>
              <ButtonBase onClick={() => setShowPrev((v) => !v)} aria-expanded={showPrev}
                sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, height: 34, px: 1.5, borderRadius: 999, border: `1px solid ${t.border}`, bgcolor: t.surface, fontSize: '0.78rem', fontWeight: 650, fontFamily: 'inherit', color: t.ink2 }}>
                Previous holdings · {previous.length}
                <ExpandMoreRounded sx={{ fontSize: 18, transition: 'transform .25s', transform: showPrev ? 'rotate(180deg)' : 'none' }} />
              </ButtonBase>
              <Collapse in={showPrev} unmountOnExit>
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(3, minmax(0, 1fr))', xl: 'repeat(4, minmax(0, 1fr))' }, gap: 1.5, mt: 1.5 }}>
                  {previous.map((p) => <PreviousCard key={p.key} p={p} onOpen={() => setFund(p)} />)}
                </Box>
              </Collapse>
            </>
          )}
        </>
      )}

      <FundDetailsDialog open={!!fund} onClose={() => setFund(null)} position={fund} rangeLabel={label} />
    </Box>
  );
}

function HoldingCard({ p, onOpen }) {
  const t = useFx();
  const u = p.unrealized;
  return (
    <ButtonBase onClick={onOpen} aria-label={`${p.fundName}: details`} sx={{
      display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 1.5, p: 1.75, borderRadius: '20px', textAlign: 'left', fontFamily: 'inherit',
      bgcolor: t.surface, border: `1px solid ${t.border}`, boxShadow: t.shadow, transition: 'border-color .16s',
      '@media (hover: hover)': { '&:hover': { borderColor: t.muted } },
    }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, minWidth: 0 }}>
        <AmcLogo code={p.amcCode} name={p.amcName} size={38} />
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography noWrap sx={{ fontSize: '0.84rem', fontWeight: 650, color: t.ink }}>{p.fundName ?? 'Fund'}</Typography>
          <Typography noWrap sx={{ fontSize: '0.68rem', color: t.muted }}>{AMC_SHORT[p.amcCode] ?? p.amcName}{p.flags.includes('price_outdated') ? ' · price outdated' : ''}</Typography>
        </Box>
      </Box>
      <Typography data-numeric sx={{ fontFamily: FONT_NUM, fontSize: '1.35rem', fontWeight: 650, letterSpacing: '-0.04em', color: t.ink, lineHeight: 1 }}>
        {p.value === null ? '—' : formatCurrency(p.value)}
      </Typography>
      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
        <Mini label="Invested" value={formatCurrency(p.invested)} />
        <Mini label="Unrealized" value={signed(u.net)} color={signColor(t, u.net ?? 0)} />
      </Box>
    </ButtonBase>
  );
}

function PreviousCard({ p, onOpen }) {
  const t = useFx();
  return (
    <ButtonBase onClick={onOpen} aria-label={`${p.fundName}: details`} sx={{
      display: 'flex', alignItems: 'center', gap: 1.25, p: 1.5, borderRadius: '18px', textAlign: 'left', fontFamily: 'inherit',
      bgcolor: t.surface2, border: `1px solid ${t.hairline}`, '@media (hover: hover)': { '&:hover': { bgcolor: t.surface3 } },
    }}>
      <AmcLogo code={p.amcCode} name={p.amcName} size={32} />
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Typography noWrap sx={{ fontSize: '0.8rem', fontWeight: 650 }}>{p.fundName ?? 'Fund'}</Typography>
        <Typography noWrap sx={{ fontSize: '0.66rem', color: t.muted }}>Redeemed {p.lastDate ? shortDate(p.lastDate) : ''}</Typography>
      </Box>
      <Box sx={{ textAlign: 'right' }}>
        <Typography sx={{ fontSize: '0.62rem', color: t.muted }}>Realized</Typography>
        <Typography data-numeric sx={{ fontFamily: FONT_NUM, fontSize: '0.84rem', fontWeight: 650, color: signColor(t, p.allTime.net), letterSpacing: '-0.03em' }}>{signed(p.allTime.net)}</Typography>
      </Box>
    </ButtonBase>
  );
}

function Mini({ label, value, color }) {
  const t = useFx();
  return (
    <Box sx={{ bgcolor: t.surface2, borderRadius: '12px', px: 1.25, py: 0.9, minWidth: 0 }}>
      <Typography sx={{ fontSize: '0.64rem', color: t.muted, fontWeight: 600 }}>{label}</Typography>
      <Typography data-numeric noWrap sx={{ fontFamily: FONT_NUM, fontSize: '0.86rem', fontWeight: 650, color: color ?? t.ink, letterSpacing: '-0.03em' }}>{value}</Typography>
    </Box>
  );
}
