import { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Typography, Skeleton, Button, useMediaQuery, useTheme } from '@mui/material';
import { useReducedMotion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { usePassiveIncome } from '../../lib/finance/usePassive';
import { useAuthStore } from '../../store/authStore';
import { useMfAnalysis } from '../../lib/mf/useMfPortfolio';
import { analyzePassive, passiveByFiscalYear, SOURCES, SOURCE_LABEL } from '../../lib/finance/passive';
import { useDateRange, rangeLabel, ALL_TIME_START, todayIso } from '../../lib/dateRange';
import { formatCurrency } from '../../lib/formatters';
import { useFx, PageHeader, Panel, PanelHeader, SummaryCard, FlowChart, AllocationDonut, Seg, PillSelect, FitPage, signColor, passiveColors, FONT_NUM } from '../../components/fx';
import StockLogo from '../../components/StockLogo';
import AmcLogo from '../mutual-funds/AmcLogo';
import { PassiveLogo, PassiveSourceIcon } from './passiveIcons';

const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const SIGNED = (n) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${formatCurrency(Math.abs(n), 2)}`;
const MONEY = (n) => formatCurrency(n, 2);
const HERO = { all: 'Passive income', mutual_funds: 'Mutual fund profit', dividends: 'Dividends', savings: 'Savings profit', other: 'Other passive income' };
const TAX_LABEL = { mutual_funds: 'CGT paid', dividends: 'Tax withheld', savings: 'Tax withheld', other: 'Tax' };
const VIEW_LABEL = { mutual_funds: 'Mutual funds', dividends: 'Dividends', savings: 'Savings accounts', other: 'Other passive' };

/** When the session's page load happened: the fallback if the sign-in time is unknown. */
const LOADED_AT = Date.now();

/**
 * Money earned since you signed in, at the average passive rate. It keeps
 * counting across pages and reloads (it is measured from the sign-in time, not
 * from when this page opened). Repainted directly, no re-renders.
 */
function SinceLogin({ perSecond, since }) {
  const ref = useRef(null);
  const reduce = useReducedMotion();
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const paint = () => {
      const earned = Math.max(0, perSecond) * Math.max(0, (Date.now() - since) / 1000);
      el.textContent = formatCurrency(earned, earned < 10 ? 4 : 2);
    };
    paint();
    const id = setInterval(paint, reduce ? 1000 : 100);
    return () => clearInterval(id);
  }, [perSecond, since, reduce]);
  return <span ref={ref} />;
}

/**
 * Passive income after tax: all of it, or one source (mutual funds, dividends,
 * savings accounts) with its own average, month-on-month and tax.
 */
export default function PassiveIncome() {
  const t = useFx();
  const mode = useTheme().palette.mode;
  const colors = passiveColors(mode);
  const isMobile = useMediaQuery('(max-width:900px)');
  const navigate = useNavigate();
  const { range } = useDateRange();
  const label = rangeLabel(range);
  const { events, isLoading } = usePassiveIncome(range);
  const { analysis: mfRange } = useMfAnalysis(range); // per-fund realized for the funds view
  const [source, setSource] = useState('all');
  const user = useAuthStore((s) => s.user);
  const signedInAt = Date.parse(user?.last_sign_in_at ?? '') || LOADED_AT; // Supabase records each sign-in
  const [view, setView] = useState('month');

  const used = useMemo(() => SOURCES.filter((s) => events.some((e) => e.source === s)), [events]);
  // The bank behind the latest savings credit, so the savings icon is that bank's logo.
  const savingsBank = useMemo(() => [...events].reverse().find((e) => e.source === 'savings' && e.symbol)?.symbol ?? null, [events]);
  const pick = used.includes(source) ? source : 'all';
  const scoped = useMemo(() => (pick === 'all' ? events : events.filter((e) => e.source === pick)), [events, pick]);
  const a = useMemo(() => analyzePassive(scoped, { start: range.start, end: range.end, today: todayIso() }), [scoped, range.start, range.end]);
  const everything = useMemo(() => analyzePassive(events, { start: range.start, end: range.end, today: todayIso() }), [events, range.start, range.end]);
  const years = useMemo(() => passiveByFiscalYear(analyzePassive(scoped, { start: ALL_TIME_START, end: todayIso(), today: todayIso() }).months), [scoped]);

  const sourcePicker = used.length > 0 && (
    <PillSelect value={pick} onChange={setSource} label="Passive income source" width={isMobile ? 170 : 210}
      items={[
        { value: 'all', label: 'All passive income', icon: <PassiveLogo size={20} /> },
        ...used.map((s) => ({ value: s, label: VIEW_LABEL[s], icon: <PassiveSourceIcon source={s} size={20} symbol={savingsBank} /> })),
      ]} />
  );
  const header = <PageHeader title="Passive income" icon={<PassiveLogo size={34} />} actions={sourcePicker} />;

  if (isLoading) {
    return (
      <FitPage>
        {header}
        <Skeleton variant="rounded" height={isMobile ? 220 : 150} sx={{ borderRadius: '20px', mb: 2, flexShrink: 0 }} />
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '7fr 5fr' }, gap: 2, flex: 1, minHeight: 0 }}>
          <Skeleton variant="rounded" sx={{ borderRadius: '20px', height: isMobile ? 300 : '100%' }} />
          <Skeleton variant="rounded" sx={{ borderRadius: '20px', height: isMobile ? 300 : '100%' }} />
        </Box>
      </FitPage>
    );
  }

  if (!events.length) {
    return (
      <Box>
        {header}
        <Panel sx={{ alignItems: 'center', textAlign: 'center', py: 7 }}>
          <PassiveLogo size={48} />
          <Typography sx={{ fontSize: '1.05rem', fontWeight: 700, mt: 2, mb: 0.5 }}>Passive income appears here on its own</Typography>
          <Typography sx={{ fontSize: '0.84rem', color: t.muted, mb: 2.5, maxWidth: 460 }}>
            Dividends and mutual fund profits are picked up automatically. Record bank profit as income under Savings profit and choose the account; the tax is worked out for you.
          </Typography>
          <Button variant="contained" disableElevation onClick={() => navigate('/add-transaction')} sx={{ borderRadius: 999, px: 3 }}>Add savings profit</Button>
        </Panel>
      </Box>
    );
  }

  const mom = a.mom;
  const momName = mom ? MONTHS_LONG[Number(mom.month.slice(5, 7)) - 1] : null;
  const prevName = mom ? MONTHS_LONG[(Number(mom.month.slice(5, 7)) + 10) % 12] : null;
  const signedInText = new Date(signedInAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
  const since = { label: 'Since you logged in', value: <SinceLogin perSecond={a.perSecond} since={signedInAt} />, note: `since ${signedInText}`,
    tooltip: `At the average of ${MONEY(a.avgPerMonth)} a month (about ${MONEY(a.perNight)} a night), earned second by second since you signed in.` };

  const metrics = pick === 'all'
    ? [
      ...['mutual_funds', 'savings', 'dividends'].filter((s) => used.includes(s)).map((s) => ({
        label: VIEW_LABEL[s], amount: everything.bySource[s].net, format: SIGNED, color: signColor(t, everything.bySource[s].net),
        note: s === 'mutual_funds' ? 'realized, after CGT' : 'after tax', onClick: () => setSource(s),
      })),
      since,
    ]
    : [
      { label: 'Average a month', amount: a.avgPerMonth, format: MONEY, note: `over ${a.elapsedMonths} month${a.elapsedMonths === 1 ? '' : 's'}`,
        tooltip: a.runRate3 ? `Last ${a.runRate3.months} complete months: ${MONEY(a.runRate3.perMonth)} a month` : undefined },
      mom
        ? { label: momName, amount: mom.net, format: SIGNED, color: signColor(t, mom.net), note: mom.changePct === null ? `nothing in ${prevName}` : `${mom.changePct >= 0 ? '+' : '−'}${Math.abs(mom.changePct)}% vs ${prevName}` }
        : { label: 'Last month', value: '—', note: 'no complete month yet' },
      { label: TAX_LABEL[pick], amount: a.totals.tax, format: MONEY, note: a.effectiveTaxRate === null ? 'nothing taxable' : `${a.effectiveTaxRate}% effective` },
      since,
    ];

  // Chart: every source, or the one picked.
  const SERIES = (pick === 'all' ? used : [pick]).map((s) => ({ key: s, label: SOURCE_LABEL[s], color: colors[s] }));

  // Donut: by source, by fund, by stock or by account.
  const group = (list, keyOf, labelOf, logoOf) => {
    const m = new Map();
    for (const e of list) {
      const k = keyOf(e);
      const cur = m.get(k) ?? { key: k, label: labelOf(e), value: 0, logo: logoOf(e) };
      cur.value += Number(e.net);
      m.set(k, cur);
    }
    return [...m.values()].map((x) => ({ ...x, value: Math.round(x.value * 100) / 100 }));
  };
  const inRange = a.events;
  const donut = {
    all: used.map((s) => ({ key: s, label: SOURCE_LABEL[s], value: a.bySource[s].net, color: colors[s], logo: <PassiveSourceIcon source={s} size={26} symbol={savingsBank} />, onClick: () => setSource(s) })),
    mutual_funds: (mfRange?.positions ?? []).filter((p) => p.realized.net > 0)
      .map((p) => ({ key: p.key, label: p.fundName ?? 'Fund', value: p.realized.net, logo: <AmcLogo code={p.amcCode} name={p.amcName} size={26} /> })),
    dividends: group(inRange, (e) => e.symbol, (e) => e.symbol, (e) => <StockLogo symbol={e.symbol} size="sm" />),
    savings: group(inRange, (e) => e.accountId ?? e.title, (e) => e.title, (e) => (e.symbol ? <StockLogo symbol={e.symbol} size="sm" /> : <PassiveSourceIcon source="savings" size={26} />)),
    other: group(inRange, (e) => e.title, (e) => e.title, () => <PassiveSourceIcon source="other" size={26} />),
  }[pick].filter((x) => x.value > 0);
  const donutTitle = { all: 'Where it comes from', mutual_funds: 'By fund', dividends: 'By stock', savings: 'By account', other: 'By category' }[pick];

  return (
    <FitPage>
      {header}

      <SummaryCard
        label={HERO[pick]}
        value={a.totals.net}
        metrics={metrics}
      />

      <Box sx={{
        display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 7fr) minmax(0, 5fr)' }, gap: 2,
        flex: isMobile ? 'none' : '1 1 0', minHeight: isMobile ? 'auto' : 280,
      }}>
        <Panel sx={{ minHeight: 0 }}>
          <PanelHeader title={`${pick === 'all' ? 'By source' : VIEW_LABEL[pick]}, ${view === 'month' ? 'month by month' : 'by fiscal year'}`}
            right={<Seg size="sm" label="Chart period" value={view} onChange={setView} options={[{ value: 'month', label: 'Monthly' }, { value: 'year', label: 'Yearly' }]} />} />
          <Box sx={{ flex: 1, minHeight: isMobile ? 240 : 0, position: 'relative' }}>
            <Box sx={{ position: isMobile ? 'relative' : 'absolute', inset: 0, height: isMobile ? 240 : '100%' }}>
              <FlowChart points={view === 'month' ? a.months : years} series={SERIES} height="100%" emptyText={`No ${pick === 'all' ? 'passive income' : VIEW_LABEL[pick].toLowerCase()} in ${label}`}
                headline={(p) => ({ value: p.net, caption: `${pick === 'all' ? 'Passive income' : VIEW_LABEL[pick]} after tax` })}
                rows={(p) => [{ label: pick === 'mutual_funds' ? 'CGT' : 'Tax withheld', value: MONEY(p.tax), color: 'rgba(255,255,255,0.75)' }]} />
            </Box>
          </Box>
        </Panel>

        <Panel sx={{ minHeight: isMobile ? 400 : 0 }}>
          <PanelHeader title={donutTitle} right={<Typography sx={{ fontSize: '0.72rem', color: t.muted }}>{pick === 'mutual_funds' ? 'realized, after CGT' : 'after tax'}</Typography>} />
          <AllocationDonut key={pick} centerLabel={{ all: 'Passive', mutual_funds: 'Funds', dividends: 'Dividends', savings: 'Savings', other: 'Other' }[pick]} items={donut} />
          <Typography sx={{ fontSize: '0.7rem', color: t.muted, textAlign: 'center', mt: 1, flexShrink: 0 }}>
            While you sleep: about <Box component="span" sx={{ fontFamily: FONT_NUM }}>{MONEY(a.perNight)}</Box> a night, <Box component="span" sx={{ fontFamily: FONT_NUM }}>{MONEY(a.avgPerMonth / 30.4375)}</Box> a day.
          </Typography>
        </Panel>
      </Box>
    </FitPage>
  );
}
