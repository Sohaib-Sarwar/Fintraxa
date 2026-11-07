import { useEffect, useRef, useState } from 'react';
import {
  Box, Button, Dialog, DialogContent, Typography, Alert, Chip, Table, TableBody, TableCell, TableHead, TableRow,
  CircularProgress, useMediaQuery, useTheme,
} from '@mui/material';
import {
  UploadFileRounded, CheckCircleRounded, ErrorOutlineRounded, LockRounded, RadioButtonUncheckedRounded,
} from '@mui/icons-material';
import { motion, AnimatePresence } from 'framer-motion';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/authStore';
import { useAppStore } from '../../store/appStore';
import { dbErrorHandler } from '../../lib/dbErrors';
import { importStatement, validateStatementFile } from '../../lib/mf/statementUpload';
import { MF_LEDGER_KEY } from '../../lib/mf/useMfPortfolio';
import { uuid } from '../../lib/mf/hash';
import { formatNumber } from '../../lib/formatters';
import { TYPE_LABEL, AMC_NAME, fmtDate } from './mfLabels';
import AmcLogo from './AmcLogo';

/** What the backend is doing, in plain words. Shown in order while it works. */
const STEPS = [
  ['upload', 'Uploading your statement securely'],
  ['read', 'Reading every page and rebuilding the tables'],
  ['amc', 'Recognising the AMC, your account and each fund'],
  ['privacy', 'Removing your name, account numbers and IBANs'],
  ['dupes', 'Checking every row against what you already have'],
  ['reconcile', 'Reconciling unit balances against the statement'],
  ['fifo', 'Booking clean rows and recalculating FIFO profit'],
];
const OPEN = ['pending_review', 'requires_attention'];
const STATUS_CHIP = {
  approved: ['Added', 'success'], duplicate: ['Already have', 'default'],
  pending_review: ['Ready', 'info'], requires_attention: ['Check', 'warning'],
  excluded: ['Excluded', 'default'], rejected: ['Excluded', 'default'],
};

export default function ImportDialog({ open, onClose }) {
  const user = useAuthStore((s) => s.user);
  const showSnackbar = useAppStore((s) => s.showSnackbar);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const isMobile = useMediaQuery('(max-width:768px)');
  const [phase, setPhase] = useState('pick');    // pick | working | done | error
  const [step, setStep] = useState(0);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [drag, setDrag] = useState(false);
  const timer = useRef(null);

  useEffect(() => () => clearInterval(timer.current), []);

  const reset = () => { clearInterval(timer.current); setPhase('pick'); setStep(0); setResult(null); setError(null); };
  const close = () => { if (phase !== 'working') { reset(); onClose(); } };

  async function handleFile(file) {
    reset();
    const problem = validateStatementFile(file);
    if (problem) { setError({ message: problem }); setPhase('error'); return; }
    setPhase('working');
    // Advance the narration while the server works; the last step waits for the answer.
    timer.current = setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), 650);
    try {
      const out = await importStatement(file, user.id, () => {});
      clearInterval(timer.current);
      setStep(STEPS.length);
      setResult(out);
      setTimeout(() => setPhase('done'), 450);
      qc.invalidateQueries({ queryKey: [MF_LEDGER_KEY] });
      qc.invalidateQueries({ queryKey: ['mf-imports'] });
    } catch (e) {
      clearInterval(timer.current);
      setError({ message: e.message, details: e.details });
      setPhase('error');
    }
  }

  const rowsQuery = useQuery({
    queryKey: ['mf-import-rows', result?.import_id],
    enabled: phase === 'done' && !!result?.import_id,
    queryFn: async () => {
      const { data, error: err } = await supabase.from('mf_staged_transactions')
        .select('id, seq, trade_date, fund_name_printed, entry_type, unit_delta::text, gross_amount::text, net_amount::text, review_status, components')
        .eq('import_id', result.import_id).order('seq').limit(1000);
      if (err) throw err;
      return data;
    },
  });
  const rows = rowsQuery.data ?? [];
  const openIds = rows.filter((r) => OPEN.includes(r.review_status)).map((r) => r.id);

  const approve = useMutation({
    mutationFn: async () => {
      const { data, error: err } = await supabase.rpc('mf_approve_staged', {
        p_import_id: result.import_id, p_staged_ids: openIds, p_idempotency_key: uuid(), p_mode: 'manual',
      });
      if (err) throw err;
      return data;
    },
    onSuccess: (r) => {
      showSnackbar(`${r.approved} transaction${r.approved === 1 ? '' : 's'} added`, 'success');
      qc.invalidateQueries({ queryKey: ['mf-import-rows', result.import_id] });
      qc.invalidateQueries({ queryKey: [MF_LEDGER_KEY] });
      qc.invalidateQueries({ queryKey: ['mf-imports'] });
    },
    onError: dbErrorHandler(showSnackbar, 'Could not approve'),
  });

  const s = result?.summary;
  const amountOf = (r) => r.gross_amount ?? r.net_amount;
  const cgtOf = (r) => (r.components ?? []).filter((c) => c.type === 'cgt').reduce((a, c) => a + Number(c.amount), 0);

  return (
    <Dialog open={open} onClose={close} maxWidth={phase === 'done' ? 'md' : 'xs'} fullWidth fullScreen={isMobile && phase === 'done'}
      slotProps={{ paper: { sx: { borderRadius: isMobile && phase === 'done' ? 0 : 4, bgcolor: isDark ? '#0a0a0a' : '#fff' } } }}>
      <DialogContent sx={{ p: isMobile ? 2 : 3 }}>
        {phase !== 'done' && (
          <>
            <Typography sx={{ fontSize: '1.05rem', fontWeight: 700, mb: 0.5 }}>Import statement</Typography>
            <Typography sx={{ fontSize: '0.72rem', color: 'text.secondary', mb: 2 }}>
              Atlas, MCB/Alhamra, Meezan, NBP and UBL account statements (PDF, up to 10 MB).
            </Typography>
          </>
        )}

        {phase === 'pick' && (
          <Box component="label" tabIndex={0} aria-label="Choose a PDF statement"
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.currentTarget.querySelector('input')?.click(); } }}
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); handleFile(e.dataTransfer.files?.[0]); }}
            sx={{
              display: 'block', border: '1.5px dashed', borderColor: drag ? 'text.primary' : 'divider', borderRadius: 3,
              p: 3.5, textAlign: 'center', cursor: 'pointer', transition: 'all .2s',
              bgcolor: drag ? (isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)') : 'transparent',
              '&:hover': { borderColor: 'text.secondary' },
            }}>
            <motion.div animate={{ y: [0, -4, 0] }} transition={{ repeat: Infinity, duration: 2.4, ease: 'easeInOut' }}>
              <UploadFileRounded sx={{ fontSize: 40, color: 'text.secondary', mb: 1 }} />
            </motion.div>
            <Typography sx={{ fontSize: '0.84rem', fontWeight: 600 }}>Drop a PDF here or tap to choose</Typography>
            <input type="file" accept="application/pdf,.pdf" hidden onChange={(e) => { handleFile(e.target.files?.[0]); e.target.value = ''; }} />
          </Box>
        )}

        {phase === 'working' && (
          <Box sx={{ py: 1 }} aria-live="polite">
            {STEPS.map(([key, label], i) => {
              const done = i < step;
              const active = i === step;
              return (
                <motion.div key={key} initial={{ opacity: 0, x: -6 }} animate={{ opacity: i <= step ? 1 : 0.35, x: 0 }} transition={{ delay: i * 0.04 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, py: 0.7 }}>
                    <Box sx={{ width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <AnimatePresence mode="wait">
                        {done ? (
                          <motion.div key="d" initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 500, damping: 25 }}>
                            <CheckCircleRounded sx={{ fontSize: 19, color: '#16a34a' }} />
                          </motion.div>
                        ) : active ? (
                          <CircularProgress key="a" size={16} thickness={5} />
                        ) : (
                          <RadioButtonUncheckedRounded key="p" sx={{ fontSize: 18, color: 'text.disabled' }} />
                        )}
                      </AnimatePresence>
                    </Box>
                    <Typography sx={{ fontSize: '0.8rem', fontWeight: active ? 600 : 400, color: done || active ? 'text.primary' : 'text.secondary' }}>
                      {label}
                    </Typography>
                  </Box>
                </motion.div>
              );
            })}
          </Box>
        )}

        {phase === 'error' && (
          <Alert severity="error" icon={<ErrorOutlineRounded />} sx={{ borderRadius: 2.5, fontSize: '0.78rem' }}>
            {error?.message}
            {error?.details?.recovery_action && <Box sx={{ mt: 0.5, opacity: 0.85 }}>{error.details.recovery_action}</Box>}
            {error?.details?.import_id && <Box sx={{ mt: 0.5, fontSize: '0.65rem', opacity: 0.7 }}>Import ID: {error.details.import_id}</Box>}
          </Alert>
        )}

        {phase === 'done' && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
              {s?.amc ? <AmcLogo code={s.amc} name={AMC_NAME[s.amc]} size={30} /> : null}
              <CheckCircleRounded sx={{ color: '#16a34a' }} />
              <Typography sx={{ fontWeight: 700, fontSize: '1rem' }}>{result?.duplicate_file ? 'Already imported' : 'Statement imported'}</Typography>
            </Box>
            <Typography sx={{ fontSize: '0.74rem', color: 'text.secondary', mb: 1.5 }}>
              {s ? `${s.events} transactions read · ${rows.filter((r) => r.review_status === 'approved').length} added · ${rows.filter((r) => r.review_status === 'duplicate').length} already in your portfolio${openIds.length ? ` · ${openIds.length} waiting for you` : ''}` : ''}
            </Typography>

            <Box sx={{ maxHeight: isMobile ? 'calc(100vh - 220px)' : 420, overflow: 'auto', border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow sx={{ '& th': { fontSize: '0.66rem', fontWeight: 600, color: 'text.secondary', bgcolor: 'background.paper', py: 1 } }}>
                    <TableCell>Date</TableCell>
                    <TableCell>Fund</TableCell>
                    <TableCell>Type</TableCell>
                    <TableCell align="right">Units</TableCell>
                    <TableCell align="right">Amount</TableCell>
                    {!isMobile && <TableCell align="right">CGT</TableCell>}
                    <TableCell align="right">Status</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {rowsQuery.isLoading && (
                    <TableRow><TableCell colSpan={7} sx={{ textAlign: 'center', py: 3 }}><CircularProgress size={20} /></TableCell></TableRow>
                  )}
                  {rows.map((r) => {
                    const [label, color] = STATUS_CHIP[r.review_status] ?? [r.review_status, 'default'];
                    const units = r.unit_delta !== null ? Number(r.unit_delta) : null;
                    const cgt = cgtOf(r);
                    return (
                      <TableRow key={r.id} hover sx={{ '& td': { fontSize: '0.72rem', py: 0.75, fontFeatureSettings: '"tnum"' } }}>
                        <TableCell sx={{ whiteSpace: 'nowrap' }}>{fmtDate(r.trade_date)}</TableCell>
                        <TableCell sx={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{titleCase(r.fund_name_printed)}</TableCell>
                        <TableCell sx={{ whiteSpace: 'nowrap' }}>{TYPE_LABEL[r.entry_type] ?? r.entry_type}</TableCell>
                        <TableCell align="right" sx={{ color: units < 0 ? '#b91c1c' : undefined }}>{units === null ? '—' : formatNumber(units, 4)}</TableCell>
                        <TableCell align="right">{amountOf(r) === null ? '—' : formatNumber(Number(amountOf(r)), 2)}</TableCell>
                        {!isMobile && <TableCell align="right">{cgt ? formatNumber(cgt, 2) : '—'}</TableCell>}
                        <TableCell align="right"><Chip size="small" label={label} color={color} variant="outlined" sx={{ height: 20, fontSize: '0.6rem' }} /></TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </Box>
          </motion.div>
        )}

        {phase !== 'done' && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mt: 2, color: 'text.secondary' }}>
            <LockRounded sx={{ fontSize: 13 }} />
            <Typography sx={{ fontSize: '0.62rem' }}>
              Read on Fintraxa's servers. Personal details are stripped from what is stored; nothing goes to third parties.
            </Typography>
          </Box>
        )}

        <Box sx={{ display: 'flex', gap: 1, mt: 2.5, flexWrap: 'wrap' }}>
          {phase === 'done' && (
            <Button onClick={() => { const id = result.import_id; reset(); onClose(); navigate(`/funds/imports/${id}`); }} sx={{ textTransform: 'none', borderRadius: 2.5 }}>
              Full details
            </Button>
          )}
          <Box sx={{ flex: 1 }} />
          <Button onClick={close} disabled={phase === 'working'} sx={{ textTransform: 'none', borderRadius: 2.5 }}>
            {phase === 'done' ? 'Close' : 'Cancel'}
          </Button>
          {phase === 'done' && (
            <Button variant="contained" disableElevation disabled={!openIds.length || approve.isPending} onClick={() => approve.mutate()}
              startIcon={!openIds.length ? <CheckCircleRounded /> : null} sx={{ textTransform: 'none', borderRadius: 2.5, minWidth: 140 }}>
              {openIds.length ? `Approve ${openIds.length}` : 'All approved'}
            </Button>
          )}
          {phase === 'error' && (
            <Button variant="contained" disableElevation onClick={reset} sx={{ textTransform: 'none', borderRadius: 2.5 }}>Try another file</Button>
          )}
        </Box>
      </DialogContent>
    </Dialog>
  );
}

const titleCase = (s) => String(s ?? '').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
