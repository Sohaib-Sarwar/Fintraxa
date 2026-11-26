import { useState } from 'react';
import { Box, Typography, ButtonBase, CircularProgress, IconButton, InputBase, Link, Skeleton } from '@mui/material';
import { ArrowBackRounded, SyncRounded, OpenInNewRounded, EventAvailableRounded } from '@mui/icons-material';
import { useFx, FONT_NUM } from '../../components/fx';
import DateField from '../../components/fx/DateField';
import StockLogo from '../../components/StockLogo';
import { formatCurrency } from '../../lib/formatters';
import { validatePositiveNumber } from '../../lib/dbErrors';
import { todayIso } from '../../lib/dateRange';
import { describeUpcoming } from '../../lib/psx/upcomingDividends';
import { useApproveUpcoming, useCheckDividendsNow, useDecideUpcoming, useUpcomingDividends } from '../../lib/psx/useUpcomingDividends';

/**
 * Upcoming dividends (owner, 2026-11-22; moved into Add dividends › Upcoming on 2026-11-26): cash dividends PSX
 * announced on stocks you hold, found every night (and on "Check now"). Expected gross, tax and net per your filer
 * status; nothing counts until you confirm it with the amount and date you actually received. Dividends already on
 * file are linked automatically and never listed. Opening one shows its details and the confirm form in place.
 */
export default function UpcomingDividends({ onConfirmed }) {
  const t = useFx();
  const list = useUpcomingDividends();
  const check = useCheckDividendsNow();
  const [openId, setOpenId] = useState(null);
  const rows = list.data ?? [];
  const open = rows.find((u) => u.id === openId) ?? null;

  if (open) return <ApproveView u={open} onBack={() => setOpenId(null)} onDone={() => { setOpenId(null); onConfirmed?.(); }} />;

  const total = rows.reduce((s, u) => s + describeUpcoming(u).net, 0);
  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, mb: 1.5 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontSize: '0.86rem', fontWeight: 750 }}>
            {rows.length ? `${rows.length} announced on your stocks` : 'Nothing waiting'}
          </Typography>
          <Typography sx={{ fontSize: '0.72rem', color: t.muted }}>
            {rows.length ? `About ${formatCurrency(total, 2)} after tax. Confirm each one when the money arrives.` : 'PSX is checked every night for the stocks you hold.'}
          </Typography>
        </Box>
        <ButtonBase onClick={() => check.mutate()} disabled={check.isPending} aria-label="Check PSX for dividends now"
          sx={{ height: 34, px: 1.5, gap: 0.75, borderRadius: 999, border: `1px solid ${t.border}`, color: t.ink, fontFamily: 'inherit', fontSize: '0.76rem', fontWeight: 650, flexShrink: 0 }}>
          {check.isPending ? <CircularProgress size={14} sx={{ color: t.ink }} /> : <SyncRounded sx={{ fontSize: 16 }} />}
          {check.isPending ? 'Checking…' : 'Check now'}
        </ButtonBase>
      </Box>

      {list.isLoading && !list.data ? (
        <Box sx={{ display: 'grid', gap: 1 }}>{[0, 1].map((i) => <Skeleton key={i} variant="rounded" height={64} sx={{ borderRadius: '14px' }} />)}</Box>
      ) : rows.length ? (
        <Box sx={{ borderRadius: '16px', border: `1px solid ${t.border}`, px: 1.5 }}>
          {rows.map((u) => <UpcomingRow key={u.id} u={u} onOpen={() => setOpenId(u.id)} />)}
        </Box>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', py: 4, px: 2, borderRadius: '16px', border: `1px dashed ${t.border}` }}>
          <EventAvailableRounded sx={{ fontSize: 30, color: t.muted, mb: 1 }} />
          <Typography sx={{ fontSize: '0.84rem', fontWeight: 700 }}>You’re up to date</Typography>
          <Typography sx={{ fontSize: '0.74rem', color: t.muted, maxWidth: 340 }}>
            Every dividend announced on your stocks is already recorded. New announcements appear here with what to expect.
          </Typography>
        </Box>
      )}
    </Box>
  );
}

function StageChip({ stage, label }) {
  const t = useFx();
  const c = stage === 'due' ? t.warn : stage === 'entitled' ? t.pos : t.muted;
  const bg = stage === 'due' ? t.warnSoft : stage === 'entitled' ? t.posSoft : t.hover;
  return <Box component="span" sx={{ px: 1, height: 20, display: 'inline-flex', alignItems: 'center', borderRadius: 999, bgcolor: bg, color: c, fontSize: '0.66rem', fontWeight: 700, whiteSpace: 'nowrap' }}>{label}</Box>;
}

function UpcomingRow({ u, onOpen }) {
  const t = useFx();
  const d = describeUpcoming(u);
  return (
    <ButtonBase onClick={onOpen} aria-label={`${u.symbol} ${d.title}, about ${formatCurrency(d.net, 2)} after tax. Open`}
      sx={{ width: '100%', display: 'flex', alignItems: 'center', gap: 1.25, py: 1.2, textAlign: 'left', fontFamily: 'inherit', '& + &': { borderTop: `1px solid ${t.border}` } }}>
      <StockLogo symbol={u.symbol} size="md" />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
          <Typography sx={{ fontSize: '0.86rem', fontWeight: 700 }}>{u.symbol}</Typography>
          <StageChip stage={d.stage} label={d.stageLabel} />
        </Box>
        <Typography sx={{ fontSize: '0.72rem', color: t.muted, mt: 0.25 }}>{d.title} · {d.perShare}</Typography>
      </Box>
      <Box sx={{ textAlign: 'right', flexShrink: 0 }}>
        <Typography sx={{ fontFamily: FONT_NUM, fontSize: '0.92rem', fontWeight: 700, color: t.pos }}>{formatCurrency(d.net, 2)}</Typography>
        <Typography sx={{ fontSize: '0.64rem', color: t.muted }}>expected, after tax</Typography>
      </Box>
    </ButtonBase>
  );
}

/** One upcoming dividend: what to expect, the key dates, and "what you received" to confirm it. */
function ApproveView({ u, onBack, onDone }) {
  const t = useFx();
  const d = describeUpcoming(u);
  const approve = useApproveUpcoming();
  const decide = useDecideUpcoming();
  const [net, setNet] = useState(d.net.toFixed(2));
  const [date, setDate] = useState(d.suggestDate);
  const [err, setErr] = useState(null);

  const submit = () => {
    const e = validatePositiveNumber(net, 'Amount received');
    if (e) { setErr(e); return; }
    if (Number(net) > d.gross) { setErr(`The amount received can’t be more than the gross dividend (${formatCurrency(d.gross, 2)}).`); return; }
    if (!date || date > todayIso()) { setErr('Pick the day the money arrived (today or earlier).'); return; }
    approve.mutate({ id: u.id, paymentDate: date, net: Number(net) }, { onSuccess: onDone });
  };

  const line = (label, value, strong) => (
    <Box key={label} sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, py: 0.55 }}>
      <Typography sx={{ fontSize: '0.76rem', color: t.muted }}>{label}</Typography>
      <Typography sx={{ fontFamily: FONT_NUM, fontSize: strong ? '0.92rem' : '0.8rem', fontWeight: strong ? 750 : 600, color: strong ? t.pos : t.ink, textAlign: 'right' }}>{value}</Typography>
    </Box>
  );

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, mb: 1.5 }}>
        <IconButton size="small" aria-label="Back to upcoming dividends" onClick={onBack} sx={{ border: `1px solid ${t.border}` }}><ArrowBackRounded fontSize="small" /></IconButton>
        <StockLogo symbol={u.symbol} size="md" />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontSize: '0.95rem', fontWeight: 750 }}>{u.symbol} · {d.title}</Typography>
          <Typography noWrap sx={{ fontSize: '0.72rem', color: t.muted }}>{u.announcement?.company_name ?? ''}</Typography>
        </Box>
        <StageChip stage={d.stage} label={d.stageLabel} />
      </Box>

      <Typography sx={{ fontSize: '0.78rem', lineHeight: 1.5, mb: d.note ? 0.5 : 1.5 }}>{d.status}</Typography>
      {d.note && <Typography sx={{ fontSize: '0.72rem', color: t.warn, mb: 1.5 }}>{d.note}</Typography>}

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.25, mb: 1.25 }}>
        <Box sx={{ bgcolor: t.surface2, borderRadius: '14px', px: 1.5, py: 0.75 }}>
          <Typography sx={{ fontSize: '0.68rem', fontWeight: 700, color: t.muted, py: 0.4 }}>Expected</Typography>
          {line('Shares × per share', `${d.shares.toLocaleString('en-US', { maximumFractionDigits: 4 })} × ${Number(u.dps).toFixed(2)}`)}
          {line('Gross', formatCurrency(d.gross, 2))}
          {line(d.taxLabel, `− ${formatCurrency(d.tax, 2)}`)}
          {line('Net to you', formatCurrency(d.net, 2), true)}
        </Box>
        <Box sx={{ bgcolor: t.surface2, borderRadius: '14px', px: 1.5, py: 0.75 }}>
          <Typography sx={{ fontSize: '0.68rem', fontWeight: 700, color: t.muted, py: 0.4 }}>Dates</Typography>
          {d.dates.map(([k, v]) => line(k, v))}
        </Box>
      </Box>
      <Typography sx={{ fontSize: '0.68rem', color: t.muted, mb: 1.75 }}>
        Source: {d.sourceUrl ? <Link href={d.sourceUrl} target="_blank" rel="noopener" sx={{ color: t.ink }}>{d.source}<OpenInNewRounded sx={{ fontSize: 12, ml: 0.25, verticalAlign: '-2px' }} /></Link> : d.source}.
      </Typography>

      {d.canApprove ? (
        <>
          <Typography sx={{ fontSize: '0.84rem', fontWeight: 750, mb: 1 }}>What you received</Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.25, mb: 1 }}>
            <Box sx={{ bgcolor: t.surface2, borderRadius: '14px', px: 1.5, py: 0.9 }}>
              <Typography component="label" htmlFor="up-net" sx={{ fontSize: '0.68rem', color: t.muted, fontWeight: 600 }}>Amount received (Rs)</Typography>
              <InputBase id="up-net" value={net} onChange={(e) => { setNet(e.target.value); setErr(null); }} inputProps={{ inputMode: 'decimal' }} fullWidth
                sx={{ fontFamily: FONT_NUM, fontSize: '1.02rem', fontWeight: 650 }} />
            </Box>
            <DateField value={date} onChange={(v) => { setDate(v); setErr(null); }} max={todayIso()} label="Payment date" />
          </Box>
          <Typography sx={{ fontSize: '0.68rem', color: t.muted, mb: 1 }}>
            Warrant no. and CDC account are filled in later from your CDC dividend report (Upload report).
          </Typography>
          {err && <Typography role="alert" sx={{ fontSize: '0.76rem', color: t.neg, mb: 1 }}>{err}</Typography>}
        </>
      ) : (
        <Typography sx={{ fontSize: '0.76rem', color: t.muted, mb: 1 }}>You can confirm it once the ex-date has passed and the money arrives.</Typography>
      )}

      <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end', mt: 1.5, flexWrap: 'wrap' }}>
        <ButtonBase onClick={() => decide.mutate({ id: u.id, status: 'rejected' }, { onSuccess: onBack })} disabled={decide.isPending}
          sx={{ height: 40, px: 2, borderRadius: 999, border: `1px solid ${t.border}`, color: t.ink, fontFamily: 'inherit', fontSize: '0.8rem', fontWeight: 650 }}>
          {d.canApprove ? 'Not received' : 'Remove'}
        </ButtonBase>
        {d.canApprove && (
          <ButtonBase onClick={submit} disabled={approve.isPending}
            sx={{ height: 40, px: 2.5, gap: 1, borderRadius: 999, bgcolor: t.inv, color: t.invInk, fontFamily: 'inherit', fontSize: '0.8rem', fontWeight: 700 }}>
            {approve.isPending && <CircularProgress size={14} sx={{ color: t.invInk }} />}
            Confirm received
          </ButtonBase>
        )}
      </Box>
    </Box>
  );
}
