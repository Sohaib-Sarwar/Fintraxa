import { useMemo, useRef, useState } from 'react';
import { Box, Dialog, Typography, IconButton, ButtonBase, Checkbox, Tooltip, useMediaQuery } from '@mui/material';
import { CloseRounded, CheckCircleRounded, ErrorOutlineRounded } from '@mui/icons-material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { supabase } from '../../lib/supabase';
import { dbErrorHandler } from '../../lib/dbErrors';
import { useAppStore } from '../../store/appStore';
import { useAuthStore } from '../../store/authStore';
import { formatCurrency, formatNumber } from '../../lib/formatters';
import { stockTradesQuery } from '../../lib/psx/usePsxPortfolio';
import { readPdf, PdfError } from '../../lib/psx/pdfText';
import { parseConfirmation, detectBroker, duplicateStatus, oversoldRefs, toTradeRows, BROKERS, ConfirmationError } from '../../lib/psx/confirmations';
import { atLeast, initSteps, setStep, jobId } from '../../lib/psx/importSteps';
import { useFx, FONT_NUM } from '../../components/fx';
import StockLogo from '../../components/StockLogo';
import BrokerLogo from './BrokerLogo';
import { DropZone, FileProgress, DoneMark } from './importKit';

const STEPS = [
  { key: 'open', label: 'Opening the PDF' },
  { key: 'broker', label: 'Identifying the broker' },
  { key: 'trades', label: 'Reading the trades' },
  { key: 'totals', label: "Matching the broker's totals" },
  { key: 'dupes', label: 'Checking for duplicates' },
];
const fmtDate = (d) => (d ? new Date(`${d}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
const money = (v) => formatCurrency(Number(v ?? 0), 2);
const qty = (v) => formatNumber(Number(v), Number(v) % 1 ? 2 : 0);

/** Upload AKD / KTrade trade confirmations → review → approve. */
export default function TradeImportDialog({ onClose }) {
  const t = useFx();
  const isMobile = useMediaQuery('(max-width:768px)');
  const user = useAuthStore((s) => s.user);
  const showSnackbar = useAppStore((s) => s.showSnackbar);
  const qc = useQueryClient();
  const { data: existing = [] } = useQuery(stockTradesQuery(user?.id));
  const [phase, setPhase] = useState('pick'); // pick | work | review | done
  const [jobs, setJobs] = useState([]);
  const [picked, setPicked] = useState({}); // source_ref → boolean, set when the user toggles
  const [result, setResult] = useState(null);
  const files = useRef(new Map());
  const patch = (id, fn) => setJobs((js) => js.map((j) => (j.id === id ? fn(j) : j)));

  const run = async (id, password) => {
    const file = files.current.get(id);
    patch(id, (j) => ({ ...j, error: null, result: null, steps: initSteps(STEPS) }));
    const step = (key, p) => patch(id, (j) => ({ ...j, steps: setStep(j.steps, key, p) }));
    let current = 'open';
    try {
      step('open', { status: 'active' });
      const pdf = await atLeast(() => readPdf(file, { password }));
      step('open', { status: 'done', detail: `${pdf.pages} page${pdf.pages === 1 ? '' : 's'}` });

      current = 'broker';
      step('broker', { status: 'active' });
      const broker = await atLeast(async () => detectBroker(pdf.lines));
      if (!broker) throw new ConfirmationError('This does not look like an AKD or KTrade trade confirmation.', 'unknown_broker');
      step('broker', { status: 'done', detail: BROKERS[broker].name });

      current = 'trades';
      step('trades', { status: 'active' });
      const parsed = await atLeast(async () => parseConfirmation(pdf.lines));
      const n = parsed.confirmations.reduce((s, c) => s + c.trades.length, 0);
      step('trades', { status: 'done', detail: `${n} trade${n === 1 ? '' : 's'} on ${parsed.confirmations.length} confirmation${parsed.confirmations.length === 1 ? '' : 's'}` });

      current = 'totals';
      step('totals', { status: 'active' });
      const checks = parsed.confirmations.flatMap((c) => c.checks);
      const bad = checks.filter((c) => c.ok === false);
      await atLeast(async () => null);
      step('totals', bad.length
        ? { status: 'warn', detail: `${bad[0].label}: rows add up to ${money(bad[0].parsed)}, the confirmation says ${money(bad[0].printed)}` }
        : { status: 'done', detail: checks.every((c) => c.ok) ? `Matches ${checks.map((c) => money(c.printed)).join(' and ')}` : 'No printed total to compare' });

      current = 'dupes';
      step('dupes', { status: 'active' });
      const dup = await atLeast(async () => duplicateStatus(parsed.confirmations, existing));
      const recorded = Object.values(dup).filter((v) => v === 'recorded').length;
      step('dupes', { status: recorded === n ? 'warn' : 'done', detail: recorded ? `${n - recorded} new, ${recorded} already recorded` : 'All new' });
      patch(id, (j) => ({ ...j, result: parsed }));
      return true;
    } catch (e) {
      const known = e instanceof PdfError || e instanceof ConfirmationError;
      const error = { code: e.code ?? 'error', message: known ? e.message : 'Something went wrong reading this file. Try again, or download a fresh copy from your broker.' };
      if (!known) console.error('[trade-import]', e);
      patch(id, (j) => ({ ...j, error, steps: setStep(j.steps, current, { status: 'error', detail: null }) }));
      return false;
    }
  };

  const addFiles = async (list) => {
    const fresh = list.map((f) => ({ id: jobId(), name: f.name, steps: initSteps(STEPS), error: null, result: null }));
    fresh.forEach((j, i) => files.current.set(j.id, list[i]));
    setJobs((js) => [...js, ...fresh]);
    setPhase('work');
    let allOk = true;
    for (const j of fresh) allOk = (await run(j.id)) && allOk; // one at a time: easier to follow, and pdf.js is single-threaded here
    // Everything read cleanly: move on to review after a beat; otherwise stay so the problem can be fixed.
    if (allOk && !jobs.some((j) => j.error)) setTimeout(() => setPhase((ph) => (ph === 'work' ? 'review' : ph)), 550);
  };
  const remove = (id) => { files.current.delete(id); setJobs((js) => js.filter((j) => j.id !== id)); };
  const unlock = async (id, pwd) => { if (await run(id, pwd) && !jobs.some((j) => j.id !== id && j.error)) setTimeout(() => setPhase((ph) => (ph === 'work' ? 'review' : ph)), 550); };

  const working = jobs.some((j) => !j.error && !j.result);
  const confirmations = useMemo(() => jobs.flatMap((j) => j.result?.confirmations ?? []), [jobs]);

  // Per trade: 'recorded' (already imported), 'similar' (matches a manual entry), or new.
  const status = useMemo(() => duplicateStatus(confirmations, existing), [confirmations, existing]);
  const keyOf = (c, tr) => `${c.broker}|${tr.source_ref}`;
  // The same confirmation picked twice in one upload: only its first copy counts.
  const firstCopy = useMemo(() => {
    const m = new Map();
    for (const c of confirmations) for (const tr of c.trades) if (!m.has(keyOf(c, tr))) m.set(keyOf(c, tr), tr);
    return m;
  }, [confirmations]);
  const isRepeat = (c, tr) => firstCopy.get(keyOf(c, tr)) !== tr;
  const locked = (c, tr) => status[tr.source_ref] === 'recorded' || isRepeat(c, tr);
  // Matches of hand-entered trades start unticked; everything new starts ticked.
  const selectedOf = (c, tr) => !locked(c, tr) && (picked[keyOf(c, tr)] ?? status[tr.source_ref] !== 'similar');
  const selectedRefs = new Set(confirmations.flatMap((c) => c.trades.filter((tr) => selectedOf(c, tr)).map((tr) => tr.source_ref)));
  const oversold = oversoldRefs(confirmations, (ref) => selectedRefs.has(ref), existing);

  const chosen = confirmations.flatMap((c) => c.trades.filter((tr) => selectedOf(c, tr)).map((tr) => ({ c, tr })));
  const totals = chosen.reduce((s, { tr }) => { if (tr.type === 'buy') s.buy += Number(tr.net); else s.sell += Number(tr.net); return s; }, { buy: 0, sell: 0 });

  const save = useMutation({
    mutationFn: async () => {
      const rows = confirmations.flatMap((c) => toTradeRows(c, c.trades.filter((tr) => selectedOf(c, tr)))).map((r) => ({ ...r, user_id: user.id }));
      if (!rows.length) return { added: 0, skipped: 0 };
      const { data, error } = await supabase.from('stock_transactions')
        .upsert(rows, { onConflict: 'user_id,broker,source_ref', ignoreDuplicates: true }).select('id');
      if (error) throw error;
      return { added: data?.length ?? 0, skipped: rows.length - (data?.length ?? 0) };
    },
    onSuccess: (r) => {
      ['stock-transactions', 'home-st-txns'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      setResult(r);
      setPhase('done');
    },
    onError: dbErrorHandler(showSnackbar, 'Could not save the trades'),
  });

  const brokersUsed = [...new Set(confirmations.map((c) => c.broker))];
  const reviewReady = !working && confirmations.length > 0;

  return (
    <Dialog open onClose={save.isPending ? undefined : onClose} fullScreen={isMobile} fullWidth maxWidth="md"
      slotProps={{ paper: { sx: { borderRadius: isMobile ? 0 : '24px', bgcolor: t.surface, backgroundImage: 'none', maxHeight: isMobile ? '100%' : '90dvh', display: 'flex', flexDirection: 'column', overflow: 'hidden' } } }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: { xs: 2, md: 2.75 }, pt: { xs: 2, md: 2.5 }, pb: 1.5, flexShrink: 0 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography component="h2" sx={{ fontSize: '1.08rem', fontWeight: 750 }}>
            {phase === 'review' ? 'Review trades' : phase === 'done' ? 'Trades added' : 'Upload trade confirmations'}
          </Typography>
          <Typography sx={{ fontSize: '0.72rem', color: t.muted }}>
            {phase === 'review' ? 'Untick anything you do not want to add, then approve.' : 'AKD Securities and KTrade PDFs. Read on this device; only the trades you approve are saved.'}
          </Typography>
        </Box>
        <IconButton aria-label="Close" onClick={onClose} disabled={save.isPending}><CloseRounded fontSize="small" /></IconButton>
      </Box>

      <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', px: { xs: 2, md: 2.75 }, pb: 2, scrollbarWidth: 'thin' }}>
        {phase === 'pick' && (
          <DropZone onFiles={addFiles} title="Drop confirmations here, or choose files"
            hint="You can add several at once. Password-protected PDFs are fine; you will be asked for the password." />
        )}

        {phase === 'work' && (
          <Box sx={{ display: 'grid', gap: 1.25 }}>
            <AnimatePresence initial={false}>
              {jobs.map((j) => <FileProgress key={j.id} job={j} onUnlock={unlock} onRemove={remove} />)}
            </AnimatePresence>
            {!working && (
              <DropZone compact onFiles={addFiles} title="Add more confirmations" hint="Or continue to review the trades found." />
            )}
          </Box>
        )}

        {phase === 'review' && (
          <Box sx={{ display: 'grid', gap: 2 }}>
            {jobs.filter((j) => j.error).map((j) => (
              <Box key={j.id} sx={{ display: 'flex', gap: 1, alignItems: 'center', p: 1.25, borderRadius: '12px', border: `1px solid ${t.border}`, bgcolor: t.surface2 }}>
                <ErrorOutlineRounded sx={{ fontSize: 18, color: t.neg }} />
                <Typography sx={{ fontSize: '0.74rem', flex: 1, minWidth: 0 }}><b>{j.name}</b> was skipped: {j.error.message}</Typography>
              </Box>
            ))}
            {confirmations.map((c) => (
              <ConfirmationCard key={`${c.broker}|${c.confirmation_no}`} c={c} isMobile={isMobile}
                status={status} locked={locked} selectedOf={selectedOf} oversold={oversold}
                onToggle={(tr, v) => setPicked((p) => ({ ...p, [keyOf(c, tr)]: v }))} />
            ))}
          </Box>
        )}

        {phase === 'done' && result && (
          <DoneMark
            title={result.added ? `${result.added} trade${result.added === 1 ? '' : 's'} added` : 'Nothing new to add'}
            sub={result.skipped ? `${result.skipped} ${result.skipped === 1 ? 'was' : 'were'} already recorded and skipped.` : 'Your holdings, profit and the Trades list are up to date.'}
            onDone={onClose}>
            {brokersUsed.map((b) => <BrokerLogo key={b} broker={b} size={28} tooltip />)}
          </DoneMark>
        )}
      </Box>

      {(phase === 'work' || phase === 'review') && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: { xs: 2, md: 2.75 }, py: 1.5, borderTop: `1px solid ${t.hairline}`, flexShrink: 0, flexWrap: 'wrap' }}>
          {phase === 'review' ? (
            <Typography sx={{ fontSize: '0.74rem', color: t.muted, flex: 1, minWidth: 180 }}>
              <b style={{ color: t.ink }}>{chosen.length}</b> selected
              {totals.buy ? <>, buys <Box component="b" sx={{ color: t.ink, fontFamily: FONT_NUM }}>{money(totals.buy)}</Box></> : null}
              {totals.sell ? <>, sales <Box component="b" sx={{ color: t.ink, fontFamily: FONT_NUM }}>{money(totals.sell)}</Box></> : null}
            </Typography>
          ) : <Box sx={{ flex: 1 }} />}
          {phase === 'review' && (
            <ButtonBase onClick={() => setPhase('work')} disabled={save.isPending} sx={{ height: 40, px: 2, borderRadius: 999, border: `1px solid ${t.border}`, fontSize: '0.8rem', fontWeight: 650, fontFamily: 'inherit' }}>Back</ButtonBase>
          )}
          {phase === 'work' ? (
            <ButtonBase onClick={() => setPhase('review')} disabled={!reviewReady}
              sx={{ height: 40, px: 2.5, borderRadius: 999, bgcolor: t.inv, color: t.invInk, fontSize: '0.8rem', fontWeight: 650, fontFamily: 'inherit', opacity: reviewReady ? 1 : 0.45 }}>
              {working ? 'Reading…' : confirmations.length ? 'Review trades' : 'No trades found'}
            </ButtonBase>
          ) : (
            <ButtonBase onClick={() => save.mutate()} disabled={!chosen.length || save.isPending}
              sx={{ height: 40, px: 2.5, borderRadius: 999, bgcolor: t.inv, color: t.invInk, fontSize: '0.8rem', fontWeight: 650, fontFamily: 'inherit', opacity: !chosen.length || save.isPending ? 0.45 : 1 }}>
              {save.isPending ? 'Saving…' : chosen.length ? `Approve ${chosen.length} trade${chosen.length === 1 ? '' : 's'}` : 'Nothing selected'}
            </ButtonBase>
          )}
        </Box>
      )}
    </Dialog>
  );
}

function ConfirmationCard({ c, isMobile, status, locked, selectedOf, oversold, onToggle }) {
  const t = useFx();
  const reduce = useReducedMotion();
  const b = BROKERS[c.broker];
  const bad = c.checks.filter((x) => x.ok === false);
  const grid = '28px 52px minmax(120px, 1.4fr) 64px 92px 80px 108px';
  return (
    <motion.div initial={reduce ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.28 }}>
      <Box sx={{ border: `1px solid ${t.border}`, borderRadius: '20px', overflow: 'hidden' }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', pt: 2.5, pb: 2, px: 2, bgcolor: t.surface2, borderBottom: `1px solid ${t.hairline}` }}>
          <BrokerLogo broker={c.broker} size={52} />
          <Typography sx={{ fontSize: '0.98rem', fontWeight: 750, mt: 1 }}>{b.name}</Typography>
          <Typography sx={{ fontSize: '0.72rem', color: t.muted, mt: 0.25 }}>
            Account <Box component="span" sx={{ fontFamily: FONT_NUM, color: t.ink2 }}>{c.account_ref}</Box>, confirmation <Box component="span" sx={{ fontFamily: FONT_NUM, color: t.ink2 }}>{c.confirmation_no}</Box>
          </Typography>
          <Typography sx={{ fontSize: '0.72rem', color: t.muted }}>Traded {fmtDate(c.trade_date)}{c.settlement_date ? `, settles ${fmtDate(c.settlement_date)}` : ''}</Typography>
          <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.6, mt: 1.25, px: 1.25, py: 0.4, borderRadius: 999, bgcolor: bad.length ? t.negSoft : t.posSoft }}>
            {bad.length ? <ErrorOutlineRounded sx={{ fontSize: 15, color: t.neg }} /> : <CheckCircleRounded sx={{ fontSize: 15, color: t.pos }} />}
            <Typography sx={{ fontSize: '0.7rem', fontWeight: 650, color: bad.length ? t.neg : t.pos }}>
              {bad.length
                ? `Rows add up to ${money(bad[0].parsed)}; the confirmation says ${money(bad[0].printed)}. Check before approving.`
                : c.checks.every((x) => x.ok) ? `Matches the confirmation: ${c.checks.map((x) => `${x.label.toLowerCase()} ${money(x.printed)}`).join(', ')}` : 'No printed total to compare'}
            </Typography>
          </Box>
        </Box>

        {!isMobile && (
          <Box sx={{ display: 'grid', gridTemplateColumns: grid, columnGap: 1.5, px: 2, py: 1, borderBottom: `1px solid ${t.hairline}` }}>
            {['', 'Side', 'Stock', 'Shares', 'Rate', 'Charges', 'Net amount'].map((h, i) => (
              <Typography key={h || i} sx={{ fontSize: '0.66rem', fontWeight: 600, color: t.muted, textAlign: i >= 3 ? 'right' : 'left' }}>{h}</Typography>
            ))}
          </Box>
        )}
        {c.trades.map((tr) => {
          const st = locked(c, tr) ? (status[tr.source_ref] === 'recorded' ? 'recorded' : 'batch') : status[tr.source_ref];
          const on = selectedOf(c, tr);
          const buy = tr.type === 'buy';
          const notes = [
            st === 'recorded' && 'Already recorded',
            st === 'batch' && 'Repeated in this upload',
            st === 'similar' && 'Matches a trade you entered by hand',
            oversold.has(tr.source_ref) && on && 'Sells more than your recorded holdings',
            ...tr.warnings,
          ].filter(Boolean);
          const side = <Box component="span" sx={{ px: 0.9, py: '1px', borderRadius: 999, fontSize: '0.64rem', fontWeight: 700, color: buy ? t.pos : t.neg, bgcolor: buy ? t.posSoft : t.negSoft }}>{buy ? 'Buy' : 'Sell'}</Box>;
          const box = <Checkbox size="small" checked={on} disabled={locked(c, tr)} onChange={(e) => onToggle(tr, e.target.checked)} inputProps={{ 'aria-label': `Add ${tr.type} ${tr.symbol}` }} sx={{ p: 0.25 }} />;
          const chargesTip = Object.entries(tr.charges).filter(([, v]) => v).map(([k, v]) => `${k.replace(/_/g, ' ')} ${money(v)}`).join(', ') || 'No charges';
          return (
            <Box key={tr.source_ref} sx={{ px: 2, py: 1, borderBottom: `1px solid ${t.hairline}`, '&:last-of-type': { borderBottom: 0 }, opacity: on ? 1 : 0.55, transition: 'opacity .15s' }}>
              {isMobile ? (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  {box}
                  <StockLogo symbol={tr.symbol} size="sm" />
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}><Typography sx={{ fontSize: '0.82rem', fontWeight: 700 }}>{tr.symbol}</Typography>{side}</Box>
                    <Typography noWrap sx={{ fontSize: '0.68rem', color: t.muted }}>{qty(tr.quantity)} at {formatNumber(Number(tr.price), 2)}, charges {money(tr.fee)}</Typography>
                  </Box>
                  <Typography sx={{ fontFamily: FONT_NUM, fontSize: '0.82rem', fontWeight: 650 }}>{money(tr.net)}</Typography>
                </Box>
              ) : (
                <Box sx={{ display: 'grid', gridTemplateColumns: grid, columnGap: 1.5, alignItems: 'center' }}>
                  {box}
                  <Box>{side}</Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
                    <StockLogo symbol={tr.symbol} size="sm" />
                    <Box sx={{ minWidth: 0 }}>
                      <Typography noWrap sx={{ fontSize: '0.8rem', fontWeight: 700 }}>{tr.symbol}</Typography>
                      {tr.company_name && <Typography noWrap sx={{ fontSize: '0.64rem', color: t.muted }}>{tr.company_name}</Typography>}
                    </Box>
                  </Box>
                  <Typography sx={{ fontFamily: FONT_NUM, fontSize: '0.78rem', textAlign: 'right' }}>{qty(tr.quantity)}</Typography>
                  <Typography sx={{ fontFamily: FONT_NUM, fontSize: '0.78rem', textAlign: 'right' }}>{formatNumber(Number(tr.price), 2)}</Typography>
                  <Tooltip title={chargesTip} arrow><Typography sx={{ fontFamily: FONT_NUM, fontSize: '0.78rem', textAlign: 'right', color: t.ink2, cursor: 'help' }}>{money(tr.fee)}</Typography></Tooltip>
                  <Typography sx={{ fontFamily: FONT_NUM, fontSize: '0.8rem', fontWeight: 650, textAlign: 'right' }}>{money(tr.net)}</Typography>
                </Box>
              )}
              {notes.length > 0 && (
                <Typography sx={{ fontSize: '0.66rem', color: st === 'recorded' || st === 'batch' ? t.muted : '#b5761a', mt: 0.4, pl: isMobile ? 4.5 : 5 }}>{notes.join('. ')}</Typography>
              )}
            </Box>
          );
        })}
      </Box>
    </motion.div>
  );
}
