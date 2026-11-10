import { useEffect, useReducer, useState } from 'react';
import { Box, Typography, ButtonBase, CircularProgress, Tooltip } from '@mui/material';
import { SyncRounded, CheckCircleRounded, WarningAmberRounded, RadioButtonUncheckedRounded, RemoveCircleOutlineRounded, ScheduleRounded } from '@mui/icons-material';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../../store/authStore';
import { refreshMyPrices, afterRefresh, marketRefreshRunsQuery } from '../../lib/market/refreshPrices';
import { freshnessQuery } from '../../lib/marketQueries';
import { formatCurrency } from '../../lib/formatters';
import { useFx, FONT_NUM, signColor } from '../../components/fx';

const STEPS = [
  { id: 'holdings', label: 'Your holdings' },
  { id: 'psx', label: 'PSX prices' },
  { id: 'mufap_tab1', label: 'MUFAP NAVs' },
  { id: 'mufap_tab3', label: 'MUFAP prices' },
  { id: 'save', label: 'Saving and updating pages' },
];

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
      return { ...s, steps };
    }
    case 'source': {
      if (a.source === 'psx') {
        return { ...s, steps: set('psx', { state: a.ok === a.requested ? 'ok' : 'warn', ms: a.ms, note: `${a.ok} of ${a.requested} updated` }) };
      }
      const blocked = a.status === 'blocked';
      return {
        ...s, steps: set(a.source, a.status === 'ok'
          ? { state: 'ok', ms: a.ms, note: `${plural(a.matched ?? 0, 'fund')} found` }
          : { state: 'warn', ms: a.ms, note: blocked ? 'MUFAP refused the request; last published NAVs kept' : 'MUFAP did not answer; last published NAVs kept' }),
      };
    }
    case 'saving': return { ...s, steps: set('save', { state: 'active' }) };
    case 'done': return {
      ...s, phase: 'done', run: a.run,
      steps: set('save', { state: 'ok', note: `${plural(a.run.psx_updated ?? 0, 'stock')}, ${plural(a.run.mufap_updated ?? 0, 'fund')} updated` }),
    };
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

  const start = async () => {
    const at = Date.now();
    setClock(at);
    dispatch({ type: 'begin', at });
    try {
      await refreshMyPrices((e) => {
        if (e.type === 'holdings' || e.type === 'source' || e.type === 'saving' || e.type === 'done') dispatch(e);
        if (e.type === 'busy' || e.type === 'error') dispatch({ type: 'fail', message: e.message });
        if (e.type === 'done') afterRefresh(qc);
      });
    } catch (err) {
      dispatch({ type: 'fail', message: err.message });
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
              The latest price of every stock and fund you hold, straight from PSX and MUFAP. Takes a few seconds.
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

      {s.run && <Results run={s.run} />}

      <Box sx={card}>
        <Typography sx={{ fontSize: '0.86rem', fontWeight: 750, mb: 1 }}>Scheduled updates</Typography>
        <Feed label="PSX board" schedule="Weekdays at 5:00 pm" feed={psxFeed} />
        <Feed label="MUFAP NAVs" schedule="Every day, hourly 6:00 pm – 12:00 am" feed={mufapFeed} />
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

function Results({ run }) {
  const t = useFx();
  const psx = run.details?.psx ?? [];
  const funds = run.details?.funds ?? [];
  const row = { display: 'flex', alignItems: 'center', gap: 1.5, py: 0.65 };
  return (
    <Box sx={{ bgcolor: t.surface2, borderRadius: '18px', p: { xs: 1.75, md: 2.25 }, display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2.5 }}>
      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: t.muted, mb: 0.5 }}>Stocks</Typography>
        {psx.length === 0 ? <Typography sx={{ fontSize: '0.76rem', color: t.muted }}>None held.</Typography> : psx.map((q) => (
          <Box key={q.symbol} sx={row}>
            <Typography sx={{ fontSize: '0.8rem', fontWeight: 700, width: 70 }}>{q.symbol}</Typography>
            {q.status === 'ok' ? (
              <>
                <Typography sx={{ fontFamily: FONT_NUM, fontSize: '0.82rem', fontWeight: 650 }}>{formatCurrency(q.price, 2)}</Typography>
                <Typography sx={{ fontFamily: FONT_NUM, fontSize: '0.74rem', fontWeight: 650, color: signColor(t, q.change_pct ?? 0) }}>
                  {q.change_pct === null ? '' : `${q.change_pct > 0 ? '+' : ''}${q.change_pct.toFixed(2)}%`}
                </Typography>
                <Typography sx={{ fontSize: '0.68rem', color: t.muted, ml: 'auto' }} noWrap>{q.as_of_text ?? q.as_of}</Typography>
              </>
            ) : <Typography sx={{ fontSize: '0.74rem', color: t.warn }}>{q.status === 'not_found' ? 'Not found on PSX' : 'Not updated'}</Typography>}
          </Box>
        ))}
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: t.muted, mb: 0.5 }}>Funds</Typography>
        {funds.length === 0 ? <Typography sx={{ fontSize: '0.76rem', color: t.muted }}>None held.</Typography> : funds.map((f) => (
          <Box key={f.id} sx={row}>
            <Typography sx={{ fontSize: '0.78rem', fontWeight: 650, flex: 1, minWidth: 0 }} noWrap>{f.name}</Typography>
            {f.price ? (
              <>
                <Typography sx={{ fontFamily: FONT_NUM, fontSize: '0.82rem', fontWeight: 650 }}>{formatCurrency(f.price, 4)}</Typography>
                <Tooltip title={f.kind === 'repurchase' ? 'Repurchase price, valid for this date' : 'NAV, valid for this date'} arrow>
                  <Typography sx={{ fontSize: '0.68rem', color: t.muted, whiteSpace: 'nowrap' }}>{f.nav_date}</Typography>
                </Tooltip>
              </>
            ) : <Typography sx={{ fontSize: '0.74rem', color: t.warn }}>Not updated</Typography>}
          </Box>
        ))}
        {run.details?.mufap?.status === 'blocked' && (
          <Typography sx={{ fontSize: '0.7rem', color: t.muted, mt: 1, lineHeight: 1.5 }}>
            MUFAP&apos;s website is refusing automated requests at the moment, so fund prices stay at the last published NAVs.
          </Typography>
        )}
      </Box>
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
        PSX {r.psx_updated}/{r.psx_requested} · MUFAP {r.mufap_updated}/{r.mufap_requested}
      </Typography>
      <Typography sx={{ fontFamily: FONT_NUM, fontSize: '0.72rem', color: t.muted }}>{secs(r.duration_ms)}</Typography>
    </Box>
  );
}
