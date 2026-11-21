import { useEffect, useReducer, useState } from 'react';
import { Box, Typography, ButtonBase, CircularProgress } from '@mui/material';
import { SyncRounded, CheckCircleRounded, WarningAmberRounded, RadioButtonUncheckedRounded, RemoveCircleOutlineRounded, ScheduleRounded } from '@mui/icons-material';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../../store/authStore';
import { refreshMyPrices, afterRefresh, marketRefreshRunsQuery } from '../../lib/market/refreshPrices';
import { freshnessQuery } from '../../lib/marketQueries';
import { useFx, FONT_NUM } from '../../components/fx';
import { useAppStore } from '../../store/appStore';
import { refreshSummary, updatedSub } from '../../lib/market/refreshSummary';
import { formatNumber } from '../../lib/formatters';
import StockLogo from '../../components/StockLogo';
import AmcLogo from '../mutual-funds/AmcLogo';

const STEPS = [
  { id: 'holdings', label: 'Your holdings' },
  { id: 'psx', label: 'PSX prices' },
  { id: 'mufap_tab1', label: 'MUFAP NAVs' },
  { id: 'mufap_tab3', label: 'MUFAP prices' },
  { id: 'amc', label: 'Fund managers' },
  { id: 'amc_ai', label: 'Fund managers behind a bot check' },
  { id: 'save', label: 'Saving and updating pages' },
];

/** Short names for the fund managers the worker reads (quotes.js AMCS). */
const MANAGER = { ubl: 'UBL Funds', meezan: 'Al Meezan', nbp: 'NBP Funds', atlas: 'Atlas Funds', mcb: 'MCB Funds' };

/** "10 Nov 2026, 5:42 pm", Pakistan time. */
const when = (iso) => (iso ? new Date(iso).toLocaleString('en-GB', {
  timeZone: 'Asia/Karachi', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true,
}) : '—');
const secs = (ms) => (ms === null || ms === undefined ? '' : ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`);
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

const initial = { phase: 'idle', startedAt: null, steps: {}, run: null, message: null };
function reducer(s, a) {
  const set = (id, v) => ({ ...s.steps, [id]: { ...s.steps[id], ...v } });
  switch (a.type) {
    case 'begin': return { ...initial, phase: 'running', startedAt: a.at, steps: { holdings: { state: 'active' } } };
    case 'holdings': {
      const steps = { ...s.steps, holdings: { state: 'ok', ms: a.ms, note: `${plural(a.psx.length, 'stock')} · ${plural(a.funds.length, 'fund')}` } };
      steps.psx = a.psx.length ? { state: 'active' } : { state: 'skip', note: 'No stocks held' };
      steps.mufap_tab1 = a.funds.length ? { state: 'active' } : { state: 'skip', note: 'No funds held' };
      steps.mufap_tab3 = a.funds.length ? { state: 'active' } : { state: 'skip', note: 'No funds held' };
      steps.amc = a.funds.length ? { state: 'active' } : { state: 'skip', note: 'No funds held' };
      steps.amc_ai = a.funds.length ? { state: 'active' } : { state: 'skip', note: 'No funds held' };
      return { ...s, steps };
    }
    case 'source': {
      if (a.source === 'psx') {
        return { ...s, steps: set('psx', { state: a.ok === a.requested ? 'ok' : 'warn', ms: a.ms, note: `${a.ok} of ${a.requested} updated` }) };
      }
      if (a.source === 'amc_ai') {
        const m = (a.managers ?? [])[0];
        const ok = (a.managers ?? []).some((x) => x.status === 'ok');
        return {
          ...s, steps: set('amc_ai', ok
            ? { state: (a.matched ?? 0) === (a.requested ?? 0) ? 'ok' : 'warn', ms: a.ms, note: `${a.matched ?? 0} of ${plural(a.requested ?? 0, 'fund')} read from the manager’s own page (via Google)` }
            : { state: 'warn', ms: a.ms, note: m?.error ? `Could not read the page: ${m.error}` : 'Could not read the manager’s page' }),
        };
      }
      if (a.source === 'amc') {
        const names = (a.managers ?? []).filter((m) => m.status === 'ok').map((m) => MANAGER[m.id] ?? m.amc).filter(Boolean);
        return {
          ...s, steps: set('amc', a.status === 'ok'
            ? { state: 'ok', ms: a.ms, note: `${a.matched ?? 0} of ${plural(a.requested ?? 0, 'fund')} found${names.length ? ` · ${names.join(', ')}` : ''}` }
            : { state: 'warn', ms: a.ms, note: 'The fund managers’ websites did not answer' }),
        };
      }
      const blocked = a.status === 'blocked';
      return {
        ...s, steps: set(a.source, a.status === 'ok'
          ? { state: 'ok', ms: a.ms, note: `${plural(a.matched ?? 0, 'fund')} found` }
          : { state: 'warn', ms: a.ms, note: blocked ? 'MUFAP refused the request; using the fund managers’ prices' : 'MUFAP did not answer; using the fund managers’ prices' }),
      };
    }
    case 'saving': return { ...s, steps: set('save', { state: 'active' }) };
    case 'done': {
      // A source with nothing to ask (no fund with a known manager) never reports: not needed.
      const steps = Object.fromEntries(Object.entries(s.steps).map(([id, v]) => [id, v?.state === 'active' ? { state: 'skip', note: 'Not needed' } : v]));
      return {
        ...s, phase: 'done', run: a.run,
        steps: { ...steps, save: { state: 'ok', note: `${plural(a.run.psx_updated ?? 0, 'stock')}, ${plural(a.run.mufap_updated ?? 0, 'fund')} updated` } },
      };
    }
    case 'fail': return { ...s, phase: 'error', message: a.message };
    default: return s;
  }
}

/** Settings > Market prices: refresh your holdings' prices now, see each step, the results and past runs. */
export default function MarketPricesSettings() {
  const t = useFx();
  const qc = useQueryClient();
  const userId = useAuthStore((s) => s.user?.id);
  const runs = useQuery(marketRefreshRunsQuery(userId));
  const fresh = useQuery(freshnessQuery());
  const [s, dispatch] = useReducer(reducer, initial);
  const [clock, setClock] = useState(0);
  const running = s.phase === 'running';

  useEffect(() => {
    if (!running) return undefined;
    const id = setInterval(() => setClock(Date.now()), 100);
    return () => clearInterval(id);
  }, [running]);

  const showSnackbar = useAppStore((st) => st.showSnackbar);
  const summary = s.run ? refreshSummary(s.run) : null;

  const start = async () => {
    const at = Date.now();
    setClock(at);
    dispatch({ type: 'begin', at });
    try {
      await refreshMyPrices((e) => {
        if (e.type === 'holdings' || e.type === 'source' || e.type === 'saving' || e.type === 'done') dispatch(e);
        if (e.type === 'busy' || e.type === 'error') {
          dispatch({ type: 'fail', message: e.message });
          showSnackbar(`Prices were not refreshed: ${e.message}`, 'error');
        }
        if (e.type === 'done') {
          afterRefresh(qc);
          const sum = refreshSummary(e.run);
          if (sum) showSnackbar(`${sum.headline}${sum.notUpdated.length ? ` ${plural(sum.notUpdated.length, 'item')} not updated — see the list below.` : ''}`, sum.tone === 'ok' ? 'success' : sum.tone === 'failed' ? 'error' : 'warning');
        }
      });
    } catch (err) {
      dispatch({ type: 'fail', message: err.message });
      showSnackbar(`Prices were not refreshed: ${err.message}`, 'error');
    }
  };

  const elapsed = s.startedAt ? (s.run?.duration_ms ?? Math.max(0, clock - s.startedAt)) : null;
  const card = { bgcolor: t.surface2, borderRadius: '18px', p: { xs: 1.75, md: 2.25 } };
  const psxFeed = fresh.data?.datasets?.['psx.stocks'];
  const mufapFeed = fresh.data?.datasets?.['mufap.funds'];

  return (
    <Box sx={{ display: 'grid', gap: 1.5 }}>
      <Box sx={card}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
          <Box sx={{ flex: 1, minWidth: 220 }}>
            <Typography sx={{ fontSize: '0.95rem', fontWeight: 750 }}>Refresh my prices</Typography>
            <Typography sx={{ fontSize: '0.74rem', color: t.muted, mt: 0.25 }}>
              The latest price of every stock and fund you hold, straight from PSX, MUFAP and the fund managers. Takes a few seconds.
            </Typography>
          </Box>
          <ButtonBase onClick={start} disabled={running}
            sx={{ height: 42, px: 2.25, gap: 1, borderRadius: 999, bgcolor: t.inv, color: t.invInk, fontFamily: 'inherit', fontSize: '0.82rem', fontWeight: 700, opacity: running ? 0.75 : 1 }}>
            {running ? <CircularProgress size={16} sx={{ color: t.invInk }} /> : <SyncRounded sx={{ fontSize: 18 }} />}
            {running ? `Refreshing… ${secs(elapsed)}` : 'Refresh now'}
          </ButtonBase>
        </Box>

        {s.phase !== 'idle' && (
          <Box sx={{ mt: 2, display: 'grid', gap: 0.25 }} aria-live="polite">
            {STEPS.map((st) => <StepRow key={st.id} label={st.label} step={s.steps[st.id]} pending={running} />)}
            {s.phase === 'done' && (
              <Typography sx={{ fontSize: '0.72rem', color: t.muted, mt: 1 }}>
                Finished in <b style={{ color: t.ink }}>{secs(s.run?.duration_ms)}</b> · {when(s.run?.finished_at)}
              </Typography>
            )}
            {s.phase === 'error' && <Typography sx={{ fontSize: '0.76rem', color: t.neg, mt: 1 }}>{s.message}</Typography>}
          </Box>
        )}
      </Box>

      {summary && <Summary summary={summary} mufapBlocked={s.run?.details?.mufap?.status === 'blocked'} />}

      <Box sx={card}>
        <Typography sx={{ fontSize: '0.86rem', fontWeight: 750, mb: 1 }}>Scheduled updates</Typography>
        <Feed label="PSX board" schedule={psxFeed?.schedule ?? 'Once per working day after the PSX close'} feed={psxFeed} />
        <Feed label="MUFAP NAVs" schedule={mufapFeed?.schedule ?? 'Every evening'} feed={mufapFeed} />
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, py: 0.7 }}>
          <ScheduleRounded sx={{ fontSize: 17, color: t.muted }} />
          <Box sx={{ flex: 1 }}>
            <Typography sx={{ fontSize: '0.8rem', fontWeight: 650 }}>Your holdings</Typography>
            <Typography sx={{ fontSize: '0.7rem', color: t.muted }}>Also refreshed on their own every night at 11:40 pm, straight from PSX and the fund managers</Typography>
          </Box>
        </Box>
      </Box>

      <Box sx={card}>
        <Typography sx={{ fontSize: '0.86rem', fontWeight: 750, mb: 1 }}>Recent refreshes</Typography>
        {(runs.data ?? []).length === 0 ? <Typography sx={{ fontSize: '0.76rem', color: t.muted }}>None yet.</Typography> : (
          <Box sx={{ display: 'grid', gap: 0.5 }}>
            {runs.data.map((r) => <RunRow key={r.id} r={r} />)}
          </Box>
        )}
      </Box>
    </Box>
  );
}

function StepRow({ label, step, pending }) {
  const t = useFx();
  const state = step?.state ?? (pending ? 'pending' : 'skip');
  const icon = {
    active: <CircularProgress size={15} thickness={5} sx={{ color: t.ink }} />,
    ok: <CheckCircleRounded sx={{ fontSize: 18, color: t.pos }} />,
    warn: <WarningAmberRounded sx={{ fontSize: 18, color: t.warn }} />,
    skip: <RemoveCircleOutlineRounded sx={{ fontSize: 18, color: t.muted }} />,
    pending: <RadioButtonUncheckedRounded sx={{ fontSize: 18, color: t.muted }} />,
  }[state];
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, py: 0.6 }}>
      <Box sx={{ width: 20, display: 'flex', justifyContent: 'center' }}>{icon}</Box>
      <Typography sx={{ fontSize: '0.8rem', fontWeight: 600, color: state === 'pending' ? t.muted : t.ink, minWidth: 170 }}>{label}</Typography>
      <Typography sx={{ fontSize: '0.74rem', color: state === 'warn' ? t.warn : t.muted, flex: 1, minWidth: 0 }} noWrap>{step?.note ?? ''}</Typography>
      <Typography sx={{ fontFamily: FONT_NUM, fontSize: '0.72rem', color: t.muted, whiteSpace: 'nowrap' }}>{secs(step?.ms)}</Typography>
    </Box>
  );
}

/**
 * The result of a refresh (owner, 2026-11-22: formal "what is updated and what is not", in the app's own dark-glass
 * look): a count with a split bar and stock/fund pills, then what needs attention (with the reason) and what was
 * updated (logo, source and day, price). Wording from lib/market/refreshSummary.js, shared with the phone.
 */
function Summary({ summary, mufapBlocked }) {
  const t = useFx();
  const { counts } = summary;
  const tint = summary.tone === 'ok' ? t.pos : summary.tone === 'failed' ? t.neg : t.warn;
  const okShare = counts.total ? counts.ok / counts.total : 1;
  const verdict = counts.total === 0 ? 'Nothing to refresh'
    : summary.tone === 'ok' ? 'Everything is up to date'
      : summary.tone === 'failed' ? 'No prices could be updated' : `${summary.notUpdated.length} not updated`;
  const glass = { ...t.glass, borderRadius: '22px' };
  return (
    <Box role="status" aria-live="polite" sx={{ ...glass, p: { xs: 2, md: 2.5 } }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: tint, boxShadow: `0 0 10px ${tint}` }} />
        <Typography sx={{ fontSize: '0.8rem', fontWeight: 650, color: tint }}>{verdict}</Typography>
        <Typography sx={{ fontSize: '0.72rem', color: t.muted, ml: 'auto' }} noWrap>{summary.sub}</Typography>
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.75, mt: 1.25 }}>
        <Typography sx={{ fontFamily: FONT_NUM, fontSize: '2.6rem', fontWeight: 700, letterSpacing: '-0.04em', lineHeight: 1 }}>{counts.ok}</Typography>
        <Typography sx={{ fontFamily: FONT_NUM, fontSize: '1.2rem', fontWeight: 600, color: t.muted }}>/ {counts.total}</Typography>
        <Typography sx={{ fontSize: '0.8rem', color: t.muted, ml: 0.5 }}>prices refreshed</Typography>
      </Box>
      <Box sx={{ display: 'flex', gap: '2px', height: 4, borderRadius: 2, overflow: 'hidden', bgcolor: t.track, mt: 1.5 }}>
        <Box sx={{ flex: okShare, bgcolor: t.pos, borderRadius: 2 }} />
        {okShare < 1 && <Box sx={{ flex: 1 - okShare, bgcolor: t.warn, borderRadius: 2 }} />}
      </Box>
      <Box sx={{ display: 'flex', gap: 1, mt: 1.75, flexWrap: 'wrap' }}>
        {counts.stocks.total > 0 && <Pill label="Stocks" {...counts.stocks} />}
        {counts.funds.total > 0 && <Pill label="Funds" {...counts.funds} />}
      </Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: summary.notUpdated.length ? '1fr 1fr' : '1fr' }, gap: 2, mt: 2.5 }}>
        {summary.notUpdated.length > 0 && (
          <Group title="Needs attention" tone={t.warn}>
            {summary.notUpdated.map((m) => (
              <ReportRow key={`${m.kind}-${m.name}`} item={m} sub={`${m.reason} The last saved price stays in use.`}
                right={<Box sx={{ px: 1, height: 22, display: 'flex', alignItems: 'center', borderRadius: 999, bgcolor: t.warnSoft, color: t.warn, fontSize: '0.68rem', fontWeight: 650, whiteSpace: 'nowrap' }}>Kept last</Box>} />
            ))}
          </Group>
        )}
        {summary.updated.length > 0 && (
          <Group title="Updated" tone={t.muted}>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: summary.notUpdated.length ? '1fr' : '1fr 1fr' }, columnGap: 3 }}>
              {summary.updated.map((u) => (
                <ReportRow key={`${u.kind}-${u.name}`} item={u} sub={updatedSub(u)}
                  right={<Typography sx={{ fontFamily: FONT_NUM, fontSize: '0.9rem', fontWeight: 650, letterSpacing: '-0.01em' }}>{formatNumber(u.price, u.dp)}</Typography>} />
              ))}
            </Box>
          </Group>
        )}
      </Box>
      {mufapBlocked && (
        <Typography sx={{ fontSize: '0.7rem', color: t.muted, mt: 1.5, lineHeight: 1.5 }}>
          MUFAP’s website is refusing automated requests, so fund prices come from each fund manager’s own website (where MUFAP gets them) or MUFAP’s last published list.
        </Typography>
      )}
    </Box>
  );
}

function Pill({ label, ok, total }) {
  const t = useFx();
  const full = ok === total;
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, px: 1.25, height: 28, borderRadius: 999, border: `1px solid ${full ? t.border : t.warn}`, bgcolor: t.hover }}>
      <Typography sx={{ fontSize: '0.74rem', color: t.muted }}>{label}</Typography>
      <Typography sx={{ fontFamily: FONT_NUM, fontSize: '0.78rem', fontWeight: 650, color: full ? t.ink : t.warn }}>{ok}/{total}</Typography>
    </Box>
  );
}

function Group({ title, tone, children }) {
  const t = useFx();
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography sx={{ fontSize: '0.72rem', fontWeight: 650, color: tone, mb: 0.75, ml: 0.5 }}>{title}</Typography>
      <Box sx={{ borderRadius: '16px', bgcolor: t.hover, border: `1px solid ${t.border}`, px: 1.5 }}>{children}</Box>
    </Box>
  );
}

function ReportRow({ item, sub, right }) {
  const t = useFx();
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 1.1, '& + &': { borderTop: `1px solid ${t.border}` } }}>
      {item.kind === 'stock' ? <StockLogo symbol={item.symbol ?? item.name} size="md" /> : <AmcLogo code={item.code} name={item.amc ?? item.name} size={32} />}
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography sx={{ fontSize: '0.84rem', fontWeight: 650 }} noWrap>{item.name}</Typography>
        <Typography sx={{ fontSize: '0.72rem', color: t.muted, lineHeight: 1.4 }}>{sub}</Typography>
      </Box>
      {right}
    </Box>
  );
}

function Feed({ label, schedule, feed }) {
  const t = useFx();
  const degraded = feed?.state === 'degraded' || feed?.error;
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, py: 0.7, flexWrap: 'wrap' }}>
      <ScheduleRounded sx={{ fontSize: 17, color: t.muted }} />
      <Box sx={{ flex: 1, minWidth: 180 }}>
        <Typography sx={{ fontSize: '0.8rem', fontWeight: 650 }}>{label}</Typography>
        <Typography sx={{ fontSize: '0.7rem', color: t.muted }}>{schedule}</Typography>
      </Box>
      <Box sx={{ textAlign: 'right' }}>
        <Typography sx={{ fontSize: '0.74rem', fontWeight: 600, color: degraded ? t.warn : t.ink }}>
          {degraded ? 'Last fetch refused · ' : 'Fetched '}{when(feed?.fetched_at)}
        </Typography>
        <Typography sx={{ fontSize: '0.68rem', color: t.muted }}>Next {when(feed?.next_refresh_at)}</Typography>
      </Box>
    </Box>
  );
}

function RunRow({ r }) {
  const t = useFx();
  const tone = { ok: t.pos, partial: t.warn, failed: t.neg, running: t.muted }[r.status] ?? t.muted;
  const label = { ok: 'Updated', partial: 'Partly updated', failed: 'Failed', running: 'Running' }[r.status] ?? r.status;
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, py: 0.55, flexWrap: 'wrap' }}>
      <Box sx={{ width: 8, height: 8, borderRadius: 999, bgcolor: tone, flexShrink: 0 }} />
      <Typography sx={{ fontSize: '0.78rem', fontWeight: 600, minWidth: 150 }}>{when(r.requested_at)}</Typography>
      <Typography sx={{ fontSize: '0.74rem', color: tone, fontWeight: 650, minWidth: 100 }}>{label}</Typography>
      <Typography sx={{ fontSize: '0.72rem', color: t.muted, flex: 1 }}>
        Stocks {r.psx_updated}/{r.psx_requested} · Funds {r.mufap_updated}/{r.mufap_requested}
      </Typography>
      <Typography sx={{ fontFamily: FONT_NUM, fontSize: '0.72rem', color: t.muted }}>{secs(r.duration_ms)}</Typography>
    </Box>
  );
}
