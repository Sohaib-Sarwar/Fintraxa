import { useMemo, useRef, useState } from 'react';
import { Box, Typography, ButtonBase, InputBase, Checkbox, Tooltip } from '@mui/material';
import { CheckCircleRounded, ErrorOutlineRounded, AddCircleOutlineRounded, EditNoteRounded, LibraryAddCheckRounded } from '@mui/icons-material';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { dbErrorHandler } from '../../lib/dbErrors';
import { useAppStore } from '../../store/appStore';
import { formatCurrency, formatNumber } from '../../lib/formatters';
import { parseDividendStatement, parseDividendReport, dividendMatches, dividendKey, describeFills } from '../../lib/psx/dividends';
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
      const dup = Object.values(await atLeast(async () => dividendMatches(parsed.rows, existing)));
      const saved = dup.filter((v) => v.status === 'saved').length;
      const complete = dup.filter((v) => v.status === 'complete').length;
      const fresh = parsed.rows.length - saved - complete;
      step('dupes', {
        status: saved === parsed.rows.length ? 'warn' : 'done',
        detail: saved || complete ? [fresh && `${fresh} new`, complete && `${complete} to complete`, saved && `${saved} already saved`].filter(Boolean).join(', ') : 'All new',
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
  // What saving will do per row, by the server's own rules (dividends_save): new, complete an entry on file, or nothing.
  const dup = useMemo(() => dividendMatches(data.rows, existing), [data.rows, existing]);
  const statusOf = (r) => dup[dividendKey(r)]?.status ?? 'new';
  const isSaved = (r) => statusOf(r) === 'saved';
  // New rows and completions start ticked (a completion can never add an amount twice); saved ones are locked.
  const selected = (r) => !isSaved(r) && (picked[dividendKey(r)] ?? true);
  const chosen = data.rows.filter(selected);
  const chosenNew = chosen.filter((r) => statusOf(r) === 'new');
  const chosenComplete = chosen.filter((r) => statusOf(r) === 'complete');
  const sum = (k) => chosenNew.reduce((s, r) => s + Number(r[k]), 0);
  const symbols = [...new Set(chosen.map((r) => r.symbol))];
  const working = jobs.some((j) => !j.error && !j.result);
  const allMatch = data.statements.length > 0 && data.statements.every((s) => s.matches !== false);

  const submit = () => save.mutate(chosen, {
    onSuccess: (r) => {
      setResult({
        ...r,
        addedRows: chosenNew,
        completedRows: chosenComplete.map((x) => ({ row: x, match: dup[dividendKey(x)] })),
        savedCount: data.rows.filter(isSaved).length,
      });
      setPhase('done');
    },
    onError: dbErrorHandler(showSnackbar, 'Could not save the dividends'),
  });

  if (phase === 'done' && result) return <SavedSummary result={result} onDone={onClose} />;

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
          {data.rows.length > 0 && <Review data={data} chosenNew={chosenNew} symbols={symbols} allMatch={allMatch} selected={selected} dup={dup}
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
              {save.isPending ? 'Saving…' : saveLabel(chosenNew.length, chosenComplete.length)}
            </ButtonBase>
          )}
        </Box>
      )}
    </Box>
  );
}

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
/** "Add 2 · Update 1": the button says exactly what Save does. */
function saveLabel(add, update) {
  if (!add && !update) return 'Nothing to save';
  return [add && `Add ${add}`, update && `Update ${update}`].filter(Boolean).join(' · ');
}

/** A heading inside the review / summary list: icon, title, count, one plain line. */
function GroupHead({ icon, title, n, note }) {
  const t = useFx();
  return (
    <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, px: 1.25, pt: 1.1, pb: 0.75, bgcolor: t.surface2, borderBottom: `1px solid ${t.hairline}` }}>
      <Box sx={{ color: t.ink2, display: 'flex', mt: '1px' }}>{icon}</Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography sx={{ fontSize: '0.78rem', fontWeight: 750 }}>{title} <Box component="span" sx={{ color: t.muted, fontWeight: 600 }}>· {n}</Box></Typography>
        {note && <Typography sx={{ fontSize: '0.66rem', color: t.muted, lineHeight: 1.4 }}>{note}</Typography>}
      </Box>
    </Box>
  );
}

/** One report row: (tick), logo, symbol + date, one detail line, net. */
function Line({ r, sub, check = null, amount = true, dim = false }) {
  const t = useFx();
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1.25, py: 0.9, borderBottom: `1px solid ${t.hairline}`, '&:last-child': { borderBottom: 0 }, opacity: dim ? 0.55 : 1 }}>
      {check}
      <StockLogo symbol={r.symbol} size="sm" />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography noWrap sx={{ fontSize: '0.78rem', fontWeight: 650 }}>{r.symbol} <Box component="span" sx={{ fontWeight: 400, color: t.muted }}>{fmtDate(r.payment_date)}</Box></Typography>
        <Typography sx={{ fontSize: '0.66rem', color: t.muted, lineHeight: 1.35, overflowWrap: 'anywhere' }}>{sub}</Typography>
      </Box>
      {amount && <Typography data-numeric sx={{ fontFamily: FONT_NUM, fontSize: '0.8rem', fontWeight: 650, color: t.pos, whiteSpace: 'nowrap' }}>+{money(r.net_amount)}</Typography>}
    </Box>
  );
}

const newSub = (r) => `${formatNumber(Number(r.shares), 0)} shares · gross ${money(r.gross_amount)} · tax ${money(Number(r.tax_amount) + Number(r.jh_tax_amount ?? 0))}${r.warrant_no ? ` · warrant ${r.warrant_no}` : ''}`;
const completeSub = (m) => `Adds ${describeFills(m?.fills)} to your entry of ${fmtDate(m?.target?.payment_date)}. Your amount ${money(m?.target?.net_amount)} stays.`;
const cap = (s) => s.replace(/^./, (c) => c.toUpperCase());

function Review({ data, chosenNew, symbols, allMatch, selected, dup, onToggle, sum }) {
  const t = useFx();
  const reduce = useReducedMotion();
  const by = (st) => data.rows.filter((r) => (dup[dividendKey(r)]?.status ?? 'new') === st);
  const fresh = by('new'); const complete = by('complete'); const saved = by('saved');
  const check = (r) => (
    <Checkbox size="small" checked={selected(r)} onChange={(e) => onToggle(r, e.target.checked)}
      inputProps={{ 'aria-label': `Include ${r.symbol} dividend of ${fmtDate(r.payment_date)}` }} sx={{ p: 0.25 }} />
  );
  return (
    <motion.div initial={reduce ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', p: 2, borderRadius: '18px', bgcolor: t.surface2, border: `1px solid ${t.hairline}`, mb: 1.5 }}>
        <Box sx={{ display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: 0.75, maxWidth: 420 }}>
          {symbols.slice(0, 12).map((s) => <Tooltip key={s} title={s} arrow><Box component="span"><StockLogo symbol={s} size="md" /></Box></Tooltip>)}
          {symbols.length > 12 && <Box sx={{ alignSelf: 'center', fontSize: '0.72rem', color: t.muted }}>+{symbols.length - 12}</Box>}
        </Box>
        <Typography data-numeric sx={{ fontFamily: FONT_NUM, fontSize: '1.5rem', fontWeight: 650, letterSpacing: '-0.04em', mt: 1.25, color: chosenNew.length ? t.pos : t.ink }}>
          {chosenNew.length ? `+${money(sum('net_amount'))}` : money(0)}
        </Typography>
        <Typography sx={{ fontSize: '0.72rem', color: t.muted }}>
          {chosenNew.length
            ? `net from ${plural(chosenNew.length, 'new dividend')}; gross ${money(sum('gross_amount'))}, tax ${money(sum('tax_amount'))}`
            : 'No new income: this report only completes or repeats what is on file'}
        </Typography>
        <Typography sx={{ fontSize: '0.72rem', color: t.ink2, fontWeight: 650, mt: 0.5 }}>
          {[fresh.length && `${fresh.length} new`, complete.length && `${complete.length} to complete`, saved.length && `${saved.length} already saved`].filter(Boolean).join(' · ')}
        </Typography>
        <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.6, mt: 1, px: 1.25, py: 0.4, borderRadius: 999, bgcolor: allMatch ? t.posSoft : t.negSoft }}>
          {allMatch ? <CheckCircleRounded sx={{ fontSize: 15, color: t.pos }} /> : <ErrorOutlineRounded sx={{ fontSize: 15, color: t.neg }} />}
          <Typography sx={{ fontSize: '0.7rem', fontWeight: 650, color: allMatch ? t.pos : t.neg }}>
            {allMatch ? 'Every statement matches its printed totals' : 'A statement does not match its printed totals; check the rows'}
          </Typography>
        </Box>
      </Box>
      {data.warnings.filter((w) => !/repeated row/.test(w)).map((w) => <Typography key={w} sx={{ fontSize: '0.7rem', color: t.warn, mb: 0.5 }}>{w}</Typography>)}

      <Box sx={{ border: `1px solid ${t.border}`, borderRadius: '16px', overflow: 'hidden' }}>
        {fresh.length > 0 && (
          <Box>
            <GroupHead icon={<AddCircleOutlineRounded sx={{ fontSize: 17 }} />} title="New dividends" n={fresh.length} note="Added to your dividends and passive income." />
            {fresh.map((r) => <Line key={dividendKey(r)} r={r} sub={newSub(r)} check={check(r)} dim={!selected(r)} />)}
          </Box>
        )}
        {complete.length > 0 && (
          <Box sx={{ borderTop: fresh.length ? `1px solid ${t.border}` : 0 }}>
            <GroupHead icon={<EditNoteRounded sx={{ fontSize: 17 }} />} title="Completes dividends you entered" n={complete.length}
              note="Already counted. Only the missing details are filled in; the amount is never added twice." />
            {complete.map((r) => <Line key={dividendKey(r)} r={r} sub={completeSub(dup[dividendKey(r)])} check={check(r)} amount={false} dim={!selected(r)} />)}
          </Box>
        )}
        {saved.length > 0 && (
          <Box sx={{ borderTop: fresh.length || complete.length ? `1px solid ${t.border}` : 0 }}>
            <GroupHead icon={<LibraryAddCheckRounded sx={{ fontSize: 17 }} />} title="Already saved" n={saved.length} note="On file with every detail in this report." />
            {saved.map((r) => <Line key={dividendKey(r)} r={r} sub={r.warrant_no ? `Warrant ${r.warrant_no}` : 'Recorded earlier'} amount={false} dim />)}
          </Box>
        )}
      </Box>
    </motion.div>
  );
}

/** After saving: what was added, what was updated (and with what), what was already there. */
function SavedSummary({ result, onDone }) {
  const t = useFx();
  const { added = 0, completed = 0, addedRows = [], completedRows = [] } = result;
  const already = (result.skipped ?? 0) + (result.savedCount ?? 0);
  const title = added && completed ? `${plural(added, 'dividend')} added, ${completed} updated`
    : added ? `${plural(added, 'dividend')} added`
      : completed ? `${plural(completed, 'dividend')} updated` : 'Nothing new to add';
  const sub = added || completed
    ? [added && 'New dividends now count in your income.', completed && 'Updated ones keep their amounts and now carry the report’s details.'].filter(Boolean).join(' ')
    : 'Every dividend in this report is already saved with its details.';
  return (
    <DoneMark title={title} sub={sub} onDone={onDone}>
      <Box sx={{ width: '100%', maxWidth: 460, textAlign: 'left', border: `1px solid ${t.border}`, borderRadius: '16px', overflow: 'hidden' }}>
        {added > 0 && (
          <Box>
            <GroupHead icon={<AddCircleOutlineRounded sx={{ fontSize: 17 }} />} title="Added" n={added} />
            {addedRows.map((r) => <Line key={dividendKey(r)} r={r} sub={newSub(r)} />)}
          </Box>
        )}
        {completed > 0 && (
          <Box sx={{ borderTop: added ? `1px solid ${t.border}` : 0 }}>
            <GroupHead icon={<EditNoteRounded sx={{ fontSize: 17 }} />} title="Updated" n={completed} />
            {completedRows.map(({ row, match }) => <Line key={dividendKey(row)} r={row} amount={false}
              sub={`${cap(describeFills(match?.fills))} added to your entry of ${fmtDate(match?.target?.payment_date)}.`} />)}
          </Box>
        )}
        {already > 0 && (
          <Box sx={{ borderTop: added || completed ? `1px solid ${t.border}` : 0 }}>
            <GroupHead icon={<LibraryAddCheckRounded sx={{ fontSize: 17 }} />} title="Already saved" n={already} note="Left as they were." />
          </Box>
        )}
      </Box>
    </DoneMark>
  );
}
