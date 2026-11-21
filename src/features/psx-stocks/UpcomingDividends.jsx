import { useState } from 'react';
import { Box, Typography, ButtonBase, CircularProgress, Dialog, DialogContent, IconButton, InputBase, Link, useMediaQuery } from '@mui/material';
import { CloseRounded, SyncRounded, OpenInNewRounded } from '@mui/icons-material';
import { useFx, FONT_NUM } from '../../components/fx';
import DateField from '../../components/fx/DateField';
import StockLogo from '../../components/StockLogo';
import { formatCurrency } from '../../lib/formatters';
import { validatePositiveNumber } from '../../lib/dbErrors';
import { todayIso } from '../../lib/dateRange';
import { describeUpcoming } from '../../lib/psx/upcomingDividends';
import { useApproveUpcoming, useCheckDividendsNow, useDecideUpcoming, useUpcomingDividends } from '../../lib/psx/useUpcomingDividends';

/**
 * Upcoming dividends (owner, 2026-11-22): cash dividends PSX announced on stocks you hold, found every night (and on
 * "Check now"). Expected gross, tax and net per your filer status; nothing counts until you approve it with the
 * amount and date you actually received. Already-recorded ones never show (linked automatically).
 */
export default function UpcomingDividends() {
  const t = useFx();
  const list = useUpcomingDividends();
  const check = useCheckDividendsNow();
  const [open, setOpen] = useState(null);
  const rows = list.data ?? [];

  return (
    <Box sx={{ ...t.glass, borderRadius: '22px', p: { xs: 2, md: 2.25 }, mb: 2, flexShrink: 0 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, mb: rows.length ? 1.25 : 0 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontSize: '0.92rem', fontWeight: 750 }}>Upcoming dividends{rows.length ? ` · ${rows.length}` : ''}</Typography>
          <Typography sx={{ fontSize: '0.72rem', color: t.muted }}>
            {rows.length ? 'Announced on PSX for stocks you hold. Approve each one with what you actually received.' : 'None announced on your stocks right now. PSX is checked every night.'}
          </Typography>
        </Box>
        <ButtonBase onClick={() => check.mutate()} disabled={check.isPending} aria-label="Check PSX for dividends now"
          sx={{ height: 34, px: 1.5, gap: 0.75, borderRadius: 999, border: `1px solid ${t.border}`, color: t.ink, fontFamily: 'inherit', fontSize: '0.76rem', fontWeight: 650 }}>
          {check.isPending ? <CircularProgress size={14} sx={{ color: t.ink }} /> : <SyncRounded sx={{ fontSize: 16 }} />}
          {check.isPending ? 'Checking PSX…' : 'Check now'}
        </ButtonBase>
      </Box>
      {rows.length > 0 && (
        <Box sx={{ borderRadius: '16px', bgcolor: t.hover, border: `1px solid ${t.border}`, px: 1.5 }}>
          {rows.map((u) => <UpcomingRow key={u.id} u={u} onOpen={() => setOpen(u)} />)}
        </Box>
      )}
      {open && <ApproveDialog u={open} onClose={() => setOpen(null)} />}
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
      sx={{ width: '100%', display: 'flex', alignItems: 'center', gap: 1.5, py: 1.2, textAlign: 'left', fontFamily: 'inherit', '& + &': { borderTop: `1px solid ${t.border}` } }}>
      <StockLogo symbol={u.symbol} size="md" />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          <Typography sx={{ fontSize: '0.86rem', fontWeight: 700 }}>{u.symbol}</Typography>
          <Typography sx={{ fontSize: '0.74rem', color: t.muted }}>{d.title} · {d.perShare}</Typography>
          <StageChip stage={d.stage} label={d.stageLabel} />
        </Box>
        <Typography sx={{ fontSize: '0.72rem', color: t.muted, mt: 0.25 }}>{d.status}</Typography>
      </Box>
      <Box sx={{ textAlign: 'right' }}>
        <Typography sx={{ fontFamily: FONT_NUM, fontSize: '0.95rem', fontWeight: 700, color: t.pos }}>{formatCurrency(d.net, 2)}</Typography>
        <Typography sx={{ fontSize: '0.66rem', color: t.muted }}>expected, after tax</Typography>
      </Box>
    </ButtonBase>
  );
}

function ApproveDialog({ u, onClose }) {
  const t = useFx();
  const isMobile = useMediaQuery('(max-width:768px)');
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
    approve.mutate({ id: u.id, paymentDate: date, net: Number(net) }, { onSuccess: onClose });
  };

  const line = (label, value, strong) => (
    <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, py: 0.6 }}>
      <Typography sx={{ fontSize: '0.78rem', color: t.muted }}>{label}</Typography>
      <Typography sx={{ fontFamily: FONT_NUM, fontSize: strong ? '0.95rem' : '0.82rem', fontWeight: strong ? 750 : 600, color: strong ? t.pos : t.ink }}>{value}</Typography>
    </Box>
  );

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth fullScreen={isMobile}
      slotProps={{ paper: { sx: { borderRadius: isMobile ? 0 : '26px', bgcolor: t.surface, backgroundImage: 'none' } } }}>
      <DialogContent sx={{ p: isMobile ? 2 : 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
          <StockLogo symbol={u.symbol} size="lg" />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography sx={{ fontSize: '1.05rem', fontWeight: 750 }}>{u.symbol} · {d.title}</Typography>
            <Typography sx={{ fontSize: '0.74rem', color: t.muted }} noWrap>{u.announcement?.company_name ?? ''}</Typography>
          </Box>
          <IconButton aria-label="Close" onClick={onClose}><CloseRounded /></IconButton>
        </Box>

        <Box sx={{ ...t.glass, borderRadius: '18px', p: 1.75, mb: 1.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.75 }}><StageChip stage={d.stage} label={d.stageLabel} /></Box>
          <Typography sx={{ fontSize: '0.8rem', lineHeight: 1.5 }}>{d.status}</Typography>
          {d.note && <Typography sx={{ fontSize: '0.74rem', color: t.warn, mt: 0.75 }}>{d.note}</Typography>}
        </Box>

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 1.5, mb: 1.5 }}>
          <Box sx={{ bgcolor: t.surface2, borderRadius: '16px', px: 1.75, py: 1 }}>
            <Typography sx={{ fontSize: '0.7rem', fontWeight: 700, color: t.muted, py: 0.5 }}>Expected</Typography>
            {line('Shares', d.shares.toLocaleString('en-US', { maximumFractionDigits: 4 }))}
            {line('Per share', d.perShare.replace(' per share', ''))}
            {line('Gross', formatCurrency(d.gross, 2))}
            {line(d.taxLabel, `− ${formatCurrency(d.tax, 2)}`)}
            {line('Net to you', formatCurrency(d.net, 2), true)}
          </Box>
          <Box sx={{ bgcolor: t.surface2, borderRadius: '16px', px: 1.75, py: 1 }}>
            <Typography sx={{ fontSize: '0.7rem', fontWeight: 700, color: t.muted, py: 0.5 }}>Dates</Typography>
            {d.dates.map(([k, v]) => line(k, v))}
          </Box>
        </Box>
        <Typography sx={{ fontSize: '0.7rem', color: t.muted, mb: 2 }}>
          Source: {d.sourceUrl ? <Link href={d.sourceUrl} target="_blank" rel="noopener" sx={{ color: t.ink }}>{d.source}<OpenInNewRounded sx={{ fontSize: 12, ml: 0.25, verticalAlign: '-2px' }} /></Link> : d.source}.
          {' '}Zakat, if deducted, is part of the difference between gross and what you received.
        </Typography>

        {d.canApprove ? (
          <>
            <Typography sx={{ fontSize: '0.86rem', fontWeight: 750, mb: 1 }}>What you received</Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 1.25, mb: 1 }}>
              <Box sx={{ bgcolor: t.surface2, borderRadius: '14px', px: 1.5, py: 1 }}>
                <Typography component="label" htmlFor="up-net" sx={{ fontSize: '0.68rem', color: t.muted, fontWeight: 600 }}>Amount received (Rs)</Typography>
                <InputBase id="up-net" value={net} onChange={(e) => { setNet(e.target.value); setErr(null); }} inputProps={{ inputMode: 'decimal' }} fullWidth
                  sx={{ fontFamily: FONT_NUM, fontSize: '1.05rem', fontWeight: 650 }} />
              </Box>
              <DateField value={date} onChange={(v) => { setDate(v); setErr(null); }} max={todayIso()} label="Payment date" />
            </Box>
            {err && <Typography role="alert" sx={{ fontSize: '0.76rem', color: t.neg, mb: 1 }}>{err}</Typography>}
          </>
        ) : (
          <Typography sx={{ fontSize: '0.78rem', color: t.muted, mb: 1 }}>You can approve it once the ex-date has passed and the money arrives.</Typography>
        )}

        <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end', mt: 2, flexWrap: 'wrap' }}>
          <ButtonBase onClick={() => decide.mutate({ id: u.id, status: 'rejected' }, { onSuccess: onClose })} disabled={decide.isPending}
            sx={{ height: 40, px: 2, borderRadius: 999, border: `1px solid ${t.border}`, color: t.ink, fontFamily: 'inherit', fontSize: '0.82rem', fontWeight: 650 }}>
            {d.canApprove ? 'Not received' : 'Remove'}
          </ButtonBase>
          {d.canApprove && (
            <ButtonBase onClick={submit} disabled={approve.isPending}
              sx={{ height: 40, px: 2.5, gap: 1, borderRadius: 999, bgcolor: t.inv, color: t.invInk, fontFamily: 'inherit', fontSize: '0.82rem', fontWeight: 700 }}>
              {approve.isPending && <CircularProgress size={14} sx={{ color: t.invInk }} />}
              Approve dividend
            </ButtonBase>
          )}
        </Box>
      </DialogContent>
    </Dialog>
  );
}
