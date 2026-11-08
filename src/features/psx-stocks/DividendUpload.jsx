import { useMemo, useRef, useState } from 'react';
import { Box, Typography, ButtonBase, InputBase, Checkbox, Tooltip } from '@mui/material';
import { CheckCircleRounded, ErrorOutlineRounded } from '@mui/icons-material';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { dbErrorHandler } from '../../lib/dbErrors';
import { useAppStore } from '../../store/appStore';
import { formatCurrency, formatNumber } from '../../lib/formatters';
import { parseDividendStatement, parseDividendReport, dividendDuplicates, dividendKey } from '../../lib/psx/dividends';
import { useSaveDividends } from '../../lib/psx/useDividends';
import { readPdf, PdfError } from '../../lib/psx/pdfText';
import { atLeast, initSteps, setStep, jobId } from '../../lib/psx/importSteps';
import { useFx, FONT_NUM } from '../../components/fx';
import StockLogo from '../../components/StockLogo';
import { DropZone, FileProgress, DoneMark } from './importKit';

const STEPS = [
  { key: 'open', label: 'Opening the PDF' },
  { key: 'read', label: 'Reading the dividend warrants' },
  { key: 'totals', label: "Matching the statement's totals" },
  { key: 'dupes', label: 'Checking for duplicates' },
];
const fmtDate = (d) => (d ? new Date(`${d}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
const money = (v) => formatCurrency(Number(v ?? 0), 2);

class NoRowsError extends Error { constructor() { super('No dividend rows were found. Upload the CDC dividend statement, the one with Payment Date, Warrant # and Net Dividend columns.'); this.code = 'no_rows'; } }

/** Merge parse results from several files/pastes; the same warrant twice is kept once. */
function merge(parts) {
  const seen = new Set(); const rows = []; const statements = []; const warnings = [];
  for (const p of parts) {
    statements.push(...p.statements); warnings.push(...p.warnings);
    for (const r of p.rows) { const k = dividendKey(r); if (!seen.has(k)) { seen.add(k); rows.push(r); } }
  }
  return { rows, statements, warnings };
}

/** Upload CDC dividend reports (or paste the text) → review with stock logos → approve. */
export default function DividendUpload({ existing, onClose }) {
  const t = useFx();
  const showSnackbar = useAppStore((s) => s.showSnackbar);
  const save = useSaveDividends();
  const [phase, setPhase] = useState('pick'); // pick | work | review | done
  const [jobs, setJobs] = useState([]);
  const [pasteMode, setPasteMode] = useState(false);
  const [text, setText] = useState('');
  const [picked, setPicked] = useState({});
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

      current = 'read';
      step('read', { status: 'active' });
      // Each row read on its own by position, cross-checked against the text reading; the one that reconciles wins.
      const parsed = await atLeast(async () => parseDividendReport({ text: pdf.text, lines: pdf.lines }));
      if (!parsed.rows.length) throw new NoRowsError();
      step('read', { status: 'done', detail: `${parsed.rows.length} warrant${parsed.rows.length === 1 ? '' : 's'} from ${new Set(parsed.rows.map((r) => r.symbol)).size} stock${new Set(parsed.rows.map((r) => r.symbol)).size === 1 ? '' : 's'}` });

      current = 'totals';
      step('totals', { status: 'active' });
      await atLeast(async () => null);
      const bad = parsed.statements.filter((s) => s.matches === false);
      step('totals', bad.length
        ? { status: 'warn', detail: `Rows add up to ${money(bad[0].parsed.net)} net; the statement says ${money(bad[0].totals.net)}` }
        : { status: 'done', detail: parsed.statements.some((s) => s.totals) ? `Matches net ${parsed.statements.filter((s) => s.totals).map((s) => money(s.totals.net)).join(' and ')}` : 'No printed total to compare' });

      current = 'dupes';
      step('dupes', { status: 'active' });
      const dup = await atLeast(async () => dividendDuplicates(parsed.rows, existing));
      const saved = Object.values(dup).filter((v) => v === 'saved').length;
      const possible = Object.values(dup).filter((v) => v === 'possible').length;
      const fresh = parsed.rows.length - saved - possible;
      step('dupes', {
        status: saved === parsed.rows.length ? 'warn' : 'done',
        detail: saved || possible ? [`${fresh} new`, saved && `${saved} already saved`, possible && `${possible} possible duplicate${possible === 1 ? '' : 's'}`].filter(Boolean).join(', ') : 'All new',
      });
      patch(id, (j) => ({ ...j, result: parsed }));
      return true;
    } catch (e) {
      const known = e instanceof PdfError || e instanceof NoRowsError;
      if (!known) console.error('[dividend-import]', e);
      patch(id, (j) => ({ ...j, error: { code: e.code ?? 'error', message: known ? e.message : 'Something went wrong reading this file. Try again, or paste the statement text instead.' }, steps: setStep(j.steps, current, { status: 'error' }) }));
      return false;
    }
  };

  const addFiles = async (list) => {
    const fresh = list.map((f) => ({ id: jobId(), name: f.name, steps: initSteps(STEPS), error: null, result: null }));
    fresh.forEach((j, i) => files.current.set(j.id, list[i]));
    setJobs((js) => [...js, ...fresh]);
    setPhase('work');
    let allOk = true;
    for (const j of fresh) allOk = (await run(j.id)) && allOk;
    if (allOk && !jobs.some((j) => j.error)) setTimeout(() => setPhase((ph) => (ph === 'work' ? 'review' : ph)), 550);
  };
  const unlock = async (id, pwd) => { if (await run(id, pwd) && !jobs.some((j) => j.id !== id && j.error)) setTimeout(() => setPhase((ph) => (ph === 'work' ? 'review' : ph)), 550); };
  const remove = (id) => { files.current.delete(id); setJobs((js) => js.filter((j) => j.id !== id)); };

  const pasted = useMemo(() => (pasteMode && text.trim() ? parseDividendStatement(text) : null), [pasteMode, text]);
  const data = useMemo(() => merge([...jobs.map((j) => j.result).filter(Boolean), ...(pasted ? [pasted] : [])]), [jobs, pasted]);
  const dup = useMemo(() => dividendDuplicates(data.rows, existing), [data.rows, existing]);
  const isSaved = (r) => dup[dividendKey(r)] === 'saved';
  // A likely hand-entered copy starts unticked; everything new starts ticked; saved warrants are locked.
  const selected = (r) => !isSaved(r) && (picked[dividendKey(r)] ?? dup[dividendKey(r)] !== 'possible');
  const chosen = data.rows.filter(selected);
  const sum = (k) => chosen.reduce((s, r) => s + Number(r[k]), 0);
  const symbols = [...new Set(chosen.map((r) => r.symbol))];
  const working = jobs.some((j) => !j.error && !j.result);
  const allMatch = data.statements.length > 0 && data.statements.every((s) => s.matches !== false);

  const submit = () => save.mutate(chosen, {
    onSuccess: (r) => { setResult({ ...r, symbols }); setPhase('done'); },
    onError: dbErrorHandler(showSnackbar, 'Could not save the dividends'),
  });

  if (phase === 'done' && result) {
    return (
      <DoneMark title={result.added ? `${result.added} dividend${result.added === 1 ? '' : 's'} added` : 'Nothing new to add'}
        sub={result.skipped ? `${result.skipped} ${result.skipped === 1 ? 'was' : 'were'} already saved and skipped.` : 'Dividends, the PSX dashboard and Analytics are up to date.'}
        onDone={onClose}>
        {result.symbols.slice(0, 10).map((s) => <Tooltip key={s} title={s} arrow><Box component="span"><StockLogo symbol={s} size="md" /></Box></Tooltip>)}
      </DoneMark>
    );
  }

  return (
    <Box>
      {phase === 'pick' && !pasteMode && (
        <>
          <DropZone onFiles={addFiles} title="Drop dividend reports here, or choose files"
            hint="The CDC dividend statement PDF. You can add several at once; password-protected files are fine." />
          <ButtonBase onClick={() => { setPasteMode(true); setPhase('review'); }} sx={{ mt: 1.25, fontSize: '0.74rem', fontWeight: 600, color: t.ink2, textDecoration: 'underline', textUnderlineOffset: 3, fontFamily: 'inherit' }}>
            Paste the statement text instead
          </ButtonBase>
        </>
      )}

      {phase === 'work' && (
        <Box sx={{ display: 'grid', gap: 1.25 }}>
          <AnimatePresence initial={false}>
            {jobs.map((j) => <FileProgress key={j.id} job={j} onUnlock={unlock} onRemove={remove} />)}
          </AnimatePresence>
          {!working && <DropZone compact onFiles={addFiles} title="Add more reports" hint="Or continue to review." />}
        </Box>
      )}

      {phase === 'review' && (
        <Box>
          {jobs.filter((j) => j.error).map((j) => (
            <Box key={j.id} sx={{ display: 'flex', gap: 1, alignItems: 'center', p: 1.25, mb: 1.25, borderRadius: '12px', border: `1px solid ${t.border}`, bgcolor: t.surface2 }}>
              <ErrorOutlineRounded sx={{ fontSize: 18, color: t.neg }} />
              <Typography sx={{ fontSize: '0.74rem', flex: 1, minWidth: 0 }}><b>{j.name}</b> was skipped: {j.error.message}</Typography>
            </Box>
          ))}
          {pasteMode && (
            <InputBase multiline minRows={4} maxRows={8} value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste the dividend statement table, from the header to the Total line"
              inputProps={{ 'aria-label': 'Dividend statement text' }}
              sx={{ width: '100%', p: 1.25, mb: 1.5, borderRadius: '14px', border: `1px solid ${t.border}`, bgcolor: t.surface2, fontSize: '0.74rem', fontFamily: FONT_NUM, alignItems: 'flex-start', '&.Mui-focused': { borderColor: t.ink } }} />
          )}
          {pasteMode && text.trim() && !data.rows.length && (
            <Typography sx={{ fontSize: '0.76rem', color: t.neg, mb: 1 }}>No dividend rows found. Copy the whole table, including the dates and amounts.</Typography>
          )}
          {data.rows.length > 0 && <Review data={data} chosen={chosen} symbols={symbols} allMatch={allMatch} isSaved={isSaved} selected={selected} dup={dup}
            onToggle={(r, v) => setPicked((p) => ({ ...p, [dividendKey(r)]: v }))} sum={sum} />}
        </Box>
      )}

      {(phase === 'work' || phase === 'review') && (
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, mt: 2 }}>
          <ButtonBase onClick={onClose} disabled={save.isPending} sx={{ height: 40, px: 2, borderRadius: 999, border: `1px solid ${t.border}`, fontSize: '0.8rem', fontWeight: 650, fontFamily: 'inherit' }}>Cancel</ButtonBase>
          {phase === 'work' ? (
            <ButtonBase onClick={() => setPhase('review')} disabled={working || !data.rows.length}
              sx={{ height: 40, px: 2.5, borderRadius: 999, bgcolor: t.inv, color: t.invInk, fontSize: '0.8rem', fontWeight: 650, fontFamily: 'inherit', opacity: working || !data.rows.length ? 0.45 : 1 }}>
              {working ? 'Reading…' : data.rows.length ? 'Review dividends' : 'Nothing found'}
            </ButtonBase>
          ) : (
            <ButtonBase onClick={submit} disabled={!chosen.length || save.isPending}
              sx={{ height: 40, px: 2.5, borderRadius: 999, bgcolor: t.inv, color: t.invInk, fontSize: '0.8rem', fontWeight: 650, fontFamily: 'inherit', opacity: !chosen.length || save.isPending ? 0.45 : 1 }}>
              {save.isPending ? 'Saving…' : chosen.length ? `Approve ${chosen.length} dividend${chosen.length === 1 ? '' : 's'}` : 'Nothing new to save'}
            </ButtonBase>
          )}
        </Box>
      )}
    </Box>
  );
}

function Review({ data, chosen, symbols, allMatch, isSaved, selected, dup, onToggle, sum }) {
  const t = useFx();
  const reduce = useReducedMotion();
  return (
    <motion.div initial={reduce ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
      {/* The stocks paying out, front and centre */}
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', p: 2, borderRadius: '18px', bgcolor: t.surface2, border: `1px solid ${t.hairline}`, mb: 1.5 }}>
        <Box sx={{ display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: 0.75, maxWidth: 420 }}>
          {symbols.slice(0, 12).map((s, i) => (
            <motion.span key={s} initial={reduce ? false : { scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: reduce ? 0 : i * 0.035, type: 'spring', stiffness: 420, damping: 24 }}>
              <Tooltip title={s} arrow><Box component="span"><StockLogo symbol={s} size="md" /></Box></Tooltip>
            </motion.span>
          ))}
          {symbols.length > 12 && <Box sx={{ alignSelf: 'center', fontSize: '0.72rem', color: t.muted }}>+{symbols.length - 12}</Box>}
        </Box>
        <Typography data-numeric sx={{ fontFamily: FONT_NUM, fontSize: '1.5rem', fontWeight: 650, letterSpacing: '-0.04em', mt: 1.25, color: t.pos }}>+{money(sum('net_amount'))}</Typography>
        <Typography sx={{ fontSize: '0.72rem', color: t.muted }}>
          net from {chosen.length} warrant{chosen.length === 1 ? '' : 's'} across {symbols.length} stock{symbols.length === 1 ? '' : 's'}; gross {money(sum('gross_amount'))}, tax {money(sum('tax_amount'))}
        </Typography>
        <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.6, mt: 1, px: 1.25, py: 0.4, borderRadius: 999, bgcolor: allMatch ? t.posSoft : t.negSoft }}>
          {allMatch ? <CheckCircleRounded sx={{ fontSize: 15, color: t.pos }} /> : <ErrorOutlineRounded sx={{ fontSize: 15, color: t.neg }} />}
          <Typography sx={{ fontSize: '0.7rem', fontWeight: 650, color: allMatch ? t.pos : t.neg }}>
            {allMatch ? 'Every statement matches its printed totals' : 'A statement does not match its printed totals; check the rows'}
          </Typography>
        </Box>
      </Box>
      {data.warnings.filter((w) => !/repeated row/.test(w)).map((w) => <Typography key={w} sx={{ fontSize: '0.7rem', color: '#b5761a', mb: 0.5 }}>{w}</Typography>)}

      <Box sx={{ border: `1px solid ${t.border}`, borderRadius: '16px', overflow: 'hidden' }}>
        {data.rows.map((r) => {
          const saved = isSaved(r);
          const possible = dup[dividendKey(r)] === 'possible';
          const on = selected(r);
          return (
            <Box key={dividendKey(r)} sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1.25, py: 0.9, borderBottom: `1px solid ${t.hairline}`, '&:last-of-type': { borderBottom: 0 }, opacity: on ? 1 : 0.5 }}>
              <Checkbox size="small" checked={on} disabled={saved} onChange={(e) => onToggle(r, e.target.checked)} inputProps={{ 'aria-label': `Add ${r.symbol} dividend of ${r.payment_date}` }} sx={{ p: 0.25 }} />
              <StockLogo symbol={r.symbol} size="sm" />
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography noWrap sx={{ fontSize: '0.78rem', fontWeight: 650 }}>{r.symbol} <Box component="span" sx={{ fontWeight: 400, color: t.muted }}>{fmtDate(r.payment_date)}</Box></Typography>
                <Typography noWrap sx={{ fontSize: '0.64rem', color: t.muted }}>
                  {formatNumber(Number(r.shares), 0)} shares, gross {money(r.gross_amount)}, tax {money(r.tax_amount)}{r.warrant_no ? `, warrant ${r.warrant_no}` : ''}{saved ? ', already saved' : ''}
                </Typography>
                {possible && <Typography noWrap sx={{ fontSize: '0.64rem', color: '#b5761a' }}>Looks like a {r.symbol} dividend you already entered for this date. Tick to add it anyway.</Typography>}
              </Box>
              <Typography data-numeric sx={{ fontFamily: FONT_NUM, fontSize: '0.8rem', fontWeight: 650, color: t.pos }}>+{money(r.net_amount)}</Typography>
            </Box>
          );
        })}
      </Box>
    </motion.div>
  );
}
