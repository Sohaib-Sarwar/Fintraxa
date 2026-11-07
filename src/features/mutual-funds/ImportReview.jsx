import { useMemo, useState } from 'react';
import {
  Box, Card, CardContent, Typography, Chip, Button, Checkbox, Skeleton, Alert, Dialog, DialogContent,
  TextField, MenuItem, Collapse, IconButton, useMediaQuery, Tooltip,
} from '@mui/material';
import {
  ArrowBackRounded, ExpandMoreRounded, EditRounded, CheckRounded, BlockRounded, WarningAmberRounded,
  ContentCopyRounded, InfoOutlined,
} from '@mui/icons-material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/authStore';
import { useAppStore } from '../../store/appStore';
import { dbErrorHandler } from '../../lib/dbErrors';
import { formatNumber } from '../../lib/formatters';
import { MF_LEDGER_KEY } from '../../lib/mf/useMfPortfolio';
import { uuid } from '../../lib/mf/hash';
import { STATUS_LABEL, TYPE_LABEL, COMPONENT_LABEL, DIRECTION, fmtDate } from './mfLabels';

const OPEN = ['pending_review', 'requires_attention'];
const money = (v) => (v === null || v === undefined ? '—' : formatNumber(Number(v), 2));

export default function ImportReview() {
  const { id } = useParams();
  const user = useAuthStore((s) => s.user);
  const showSnackbar = useAppStore((s) => s.showSnackbar);
  const showConfirm = useAppStore((s) => s.showConfirm);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const isMobile = useMediaQuery('(max-width:768px)');
  const [selected, setSelected] = useState(new Set());
  const [filter, setFilter] = useState('open');
  const [expanded, setExpanded] = useState(null);
  const [editing, setEditing] = useState(null);

  const { data, isLoading } = useQuery({
    queryKey: ['mf-import', id],
    enabled: !!user && !!id,
    queryFn: async () => {
      const [imp, rows, lines] = await Promise.all([
        supabase.from('mf_statement_imports').select('*').eq('id', id).eq('user_id', user.id).single(),
        supabase.from('mf_staged_transactions')
          .select('id, seq, source_key, line_ids, page, section_key, fund_name_printed, unit_class, original_labels, original_label, entry_type, trade_date, price_date, nav::text, unit_delta::text, gross_amount::text, net_amount::text, components, warnings, duplicate_status, duplicate_note, review_status, external_ref, ai_values, user_edits')
          .eq('import_id', id).order('seq').limit(2000),
        supabase.from('mf_import_lines').select('line_id, text').eq('import_id', id).limit(5000),
      ]);
      if (imp.error) throw imp.error;
      if (rows.error) throw rows.error;
      return { imp: imp.data, rows: rows.data, lines: Object.fromEntries((lines.data ?? []).map((l) => [l.line_id, l.text])) };
    },
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['mf-import', id] });
    qc.invalidateQueries({ queryKey: ['mf-imports'] });
    qc.invalidateQueries({ queryKey: [MF_LEDGER_KEY] });
  };

  const approve = useMutation({
    mutationFn: async (ids) => {
      const { data: res, error } = await supabase.rpc('mf_approve_staged', {
        p_import_id: id, p_staged_ids: ids, p_idempotency_key: uuid(), p_mode: 'manual',
      });
      if (error) throw error;
      return res;
    },
    onSuccess: (res) => {
      showSnackbar(`${res.approved} transaction${res.approved === 1 ? '' : 's'} added${res.skipped?.length ? ` · ${res.skipped.length} skipped` : ''}`, 'success');
      setSelected(new Set());
      refresh();
    },
    onError: dbErrorHandler(showSnackbar, 'Could not approve'),
  });

  const setStatus = useMutation({
    mutationFn: async ({ ids, status }) => {
      const { error } = await supabase.rpc('mf_set_review_status', { p_staged_ids: ids, p_status: status, p_note: null });
      if (error) throw error;
    },
    onSuccess: () => { setSelected(new Set()); refresh(); },
    onError: dbErrorHandler(showSnackbar, 'Could not update'),
  });

  const rows = useMemo(() => {
    const all = data?.rows ?? [];
    return filter === 'open' ? all.filter((r) => OPEN.includes(r.review_status)) : all;
  }, [data, filter]);
  const groups = useMemo(() => {
    const m = new Map();
    for (const r of rows) {
      const k = `${r.fund_name_printed ?? 'Fund'}${r.unit_class ? ` · ${r.unit_class}` : ''}`;
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(r);
    }
    return [...m.entries()];
  }, [rows]);

  if (isLoading) return <Box>{[1, 2, 3].map((i) => <Skeleton key={i} variant="rounded" height={64} sx={{ mb: 1 }} />)}</Box>;
  if (!data) return <Alert severity="error">Import not found.</Alert>;

  const { imp } = data;
  const [statusLabel, statusColor] = STATUS_LABEL[imp.status] ?? [imp.status, 'default'];
  const openRows = data.rows.filter((r) => OPEN.includes(r.review_status));
  const counts = data.rows.reduce((acc, r) => ({ ...acc, [r.review_status]: (acc[r.review_status] ?? 0) + 1 }), {});
  const recon = imp.reconciliation?.sections ?? [];
  const toggle = (rid) => setSelected((s) => { const n = new Set(s); if (n.has(rid)) n.delete(rid); else n.add(rid); return n; });

  return (
    <Box sx={{ pb: isMobile ? 1 : 0 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
        <IconButton aria-label="Back to imports" onClick={() => navigate('/funds/imports')}><ArrowBackRounded /></IconButton>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontSize: isMobile ? '1.05rem' : '1.3rem', fontWeight: 800, letterSpacing: '-0.02em' }}>
            Statement {fmtDate(imp.period_start)} – {fmtDate(imp.period_end)}
          </Typography>
          <Typography sx={{ fontSize: '0.68rem', color: 'text.secondary' }}>
            {imp.page_count ?? '?'} pages · parser {imp.parser_version ?? '—'} · import {String(imp.id).slice(0, 8)}
          </Typography>
        </Box>
        <Chip size="small" label={statusLabel} color={statusColor} variant="outlined" />
      </Box>

      {imp.status === 'failed' && (
        <Alert severity="error" sx={{ mb: 2, borderRadius: 2.5 }}>
          {imp.error_message} {imp.recovery_action && <Box sx={{ mt: 0.5 }}>{imp.recovery_action}</Box>}
        </Alert>
      )}

      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mb: 2 }}>
        <Chip size="small" label={`${counts.approved ?? 0} added`} color="success" variant="outlined" />
        <Chip size="small" label={`${openRows.length} to review`} color={openRows.length ? 'warning' : 'default'} variant="outlined" />
        <Chip size="small" label={`${counts.duplicate ?? 0} duplicates`} variant="outlined" />
        <Chip size="small" label={`${(counts.excluded ?? 0) + (counts.rejected ?? 0)} excluded`} variant="outlined" />
        {recon.map((r) => (
          <Tooltip key={r.section_key} title={r.unit_chain?.status === 'missing_source' ? 'Statement prints no closing balance' : `Opening ${r.unit_chain?.opening} + movements ${r.unit_chain?.movements} = ${r.unit_chain?.computed_closing}; statement closing ${r.unit_chain?.printed_closing}`}>
            <Chip size="small" variant="outlined"
              color={r.status === 'material' ? 'error' : r.status === 'missing_source' ? 'default' : 'success'}
              label={`${r.section_key.split('|')[0].replace(/\b\w/g, (c) => c.toUpperCase())}: ${r.status === 'material' ? 'does not reconcile' : r.status === 'missing_source' ? 'no closing balance' : 'units reconcile'}`} />
          </Tooltip>
        ))}
      </Box>

      <Box sx={{ display: 'flex', gap: 1, mb: 1.5, flexWrap: 'wrap', alignItems: 'center' }}>
        <TextField select size="small" value={filter} onChange={(e) => setFilter(e.target.value)} sx={{ minWidth: 150 }}>
          <MenuItem value="open">Needs review ({openRows.length})</MenuItem>
          <MenuItem value="all">All ({data.rows.length})</MenuItem>
        </TextField>
        <Box sx={{ flex: 1 }} />
        {openRows.length > 0 && (
          <>
            <Button size="small" disabled={!selected.size || setStatus.isPending} startIcon={<BlockRounded />}
              onClick={() => showConfirm('Exclude selected?', 'Excluded rows are kept for audit but never added to your ledger.', () => setStatus.mutate({ ids: [...selected], status: 'excluded' }))}
              sx={{ textTransform: 'none' }}>Exclude</Button>
            <Button size="small" variant="contained" disableElevation disabled={!selected.size || approve.isPending} startIcon={<CheckRounded />}
              onClick={() => approve.mutate([...selected])} sx={{ textTransform: 'none', borderRadius: 2 }}>
              Approve {selected.size || ''}
            </Button>
          </>
        )}
      </Box>

      {groups.length === 0 && (
        <Card sx={{ p: 3, textAlign: 'center' }}>
          <Typography sx={{ fontSize: '0.82rem', color: 'text.secondary' }}>
            {filter === 'open' ? 'Nothing needs your review. Every clean transaction was added automatically.' : 'No transactions.'}
          </Typography>
        </Card>
      )}

      {groups.map(([fund, list]) => (
        <Box key={fund} sx={{ mb: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', mb: 0.75 }}>
            {list.some((r) => OPEN.includes(r.review_status)) && (
              <Checkbox size="small" inputProps={{ 'aria-label': `Select all in ${fund}` }}
                checked={list.filter((r) => OPEN.includes(r.review_status)).every((r) => selected.has(r.id))}
                onChange={(e) => setSelected((s) => {
                  const n = new Set(s);
                  for (const r of list.filter((x) => OPEN.includes(x.review_status))) { if (e.target.checked) n.add(r.id); else n.delete(r.id); }
                  return n;
                })} />
            )}
            <Typography sx={{ fontSize: '0.76rem', fontWeight: 700 }}>{fund}</Typography>
          </Box>
          {list.map((r) => {
            const warns = (r.warnings ?? []).filter((w) => w.severity !== 'info');
            const isOpen = OPEN.includes(r.review_status);
            return (
              <Card key={r.id} sx={{ mb: 0.75, borderLeft: warns.length && isOpen ? '3px solid #d97706' : undefined }}>
                <CardContent sx={{ p: 1.25, '&:last-child': { pb: 1.25 } }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    {isOpen && <Checkbox size="small" checked={selected.has(r.id)} onChange={() => toggle(r.id)} inputProps={{ 'aria-label': 'Select transaction' }} />}
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Box sx={{ display: 'flex', gap: 0.75, alignItems: 'center', flexWrap: 'wrap' }}>
                        <Typography sx={{ fontSize: '0.78rem', fontWeight: 700 }}>{TYPE_LABEL[r.entry_type] ?? r.entry_type}</Typography>
                        <Typography sx={{ fontSize: '0.66rem', color: 'text.secondary' }}>“{(r.original_labels ?? [r.original_label]).join(' / ')}”</Typography>
                        {r.duplicate_status === 'exact_duplicate' && <Chip size="small" icon={<ContentCopyRounded />} label="Already in ledger" sx={{ height: 18, fontSize: '0.58rem' }} />}
                        {r.duplicate_status === 'probable_duplicate' && <Chip size="small" color="warning" label="Possible duplicate" sx={{ height: 18, fontSize: '0.58rem' }} />}
                        {r.review_status === 'approved' && <Chip size="small" color="success" label="Added" sx={{ height: 18, fontSize: '0.58rem' }} />}
                        {['excluded', 'rejected'].includes(r.review_status) && <Chip size="small" label="Excluded" sx={{ height: 18, fontSize: '0.58rem' }} />}
                      </Box>
                      <Typography sx={{ fontSize: '0.68rem', color: 'text.secondary', fontFeatureSettings: '"tnum"' }}>
                        {fmtDate(r.trade_date)}
                        {r.unit_delta !== null && ` · ${formatNumber(Number(r.unit_delta), 4)} units`}
                        {r.nav !== null && ` @ ${formatNumber(Number(r.nav), 4)}`}
                        {r.gross_amount !== null && ` · gross ${money(r.gross_amount)}`}
                        {r.net_amount !== null && r.net_amount !== r.gross_amount && ` · net ${money(r.net_amount)}`}
                        {(r.components ?? []).map((c) => ` · ${COMPONENT_LABEL[c.type] ?? c.type} ${money(c.amount)}`).join('')}
                      </Typography>
                    </Box>
                    {isOpen && <IconButton size="small" aria-label="Edit" onClick={() => setEditing(r)}><EditRounded fontSize="small" /></IconButton>}
                    <IconButton size="small" aria-label="Show evidence" onClick={() => setExpanded(expanded === r.id ? null : r.id)}
                      sx={{ transform: expanded === r.id ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }}>
                      <ExpandMoreRounded fontSize="small" />
                    </IconButton>
                  </Box>
                  {warns.length > 0 && isOpen && (
                    <Box sx={{ mt: 0.75, ml: isOpen ? 5 : 0 }}>
                      {warns.map((w, i) => (
                        <Typography key={i} sx={{ fontSize: '0.66rem', color: '#b45309', display: 'flex', gap: 0.5, alignItems: 'flex-start' }}>
                          <WarningAmberRounded sx={{ fontSize: 13, mt: '1px' }} /> {w.message}
                        </Typography>
                      ))}
                      {r.duplicate_note && <Typography sx={{ fontSize: '0.66rem', color: 'text.secondary' }}>{r.duplicate_note}</Typography>}
                    </Box>
                  )}
                  <Collapse in={expanded === r.id} unmountOnExit>
                    <Box sx={{ mt: 1, p: 1, borderRadius: 1.5, bgcolor: 'action.hover', overflowX: 'auto' }}>
                      <Typography sx={{ fontSize: '0.6rem', color: 'text.secondary', mb: 0.5, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <InfoOutlined sx={{ fontSize: 12 }} /> Statement page {r.page ?? '?'} (personal details removed)
                      </Typography>
                      <Box component="pre" sx={{ m: 0, fontSize: '0.62rem', fontFamily: 'ui-monospace, monospace', whiteSpace: 'pre' }}>
                        {(r.line_ids ?? []).map((lid) => data.lines[lid] ?? '').filter(Boolean).join('\n')}
                      </Box>
                      {r.user_edits && (
                        <Typography sx={{ fontSize: '0.6rem', color: 'text.secondary', mt: 0.5 }}>
                          Edited: {Object.keys(r.user_edits).join(', ')} (parsed values kept for audit)
                        </Typography>
                      )}
                    </Box>
                  </Collapse>
                </CardContent>
              </Card>
            );
          })}
        </Box>
      ))}

      {editing && <EditDialog row={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); refresh(); }} />}
    </Box>
  );
}

function EditDialog({ row, onClose, onSaved }) {
  const showSnackbar = useAppStore((s) => s.showSnackbar);
  const [f, setF] = useState({
    entry_type: row.entry_type, trade_date: row.trade_date ?? '', unit_delta: row.unit_delta ?? '', nav: row.nav ?? '',
    gross_amount: row.gross_amount ?? '', net_amount: row.net_amount ?? '',
  });
  const save = useMutation({
    mutationFn: async () => {
      const edits = {};
      for (const [k, v] of Object.entries(f)) {
        const orig = row[k] ?? '';
        if (String(v) !== String(orig)) edits[k] = v === '' ? null : v;
      }
      if (edits.entry_type) edits.cash_direction = DIRECTION[edits.entry_type] ?? null;
      for (const k of ['unit_delta', 'nav', 'gross_amount', 'net_amount']) {
        if (edits[k] !== undefined && edits[k] !== null && !/^-?\d+(\.\d+)?$/.test(String(edits[k]).trim())) {
          throw new Error(`${k.replace('_', ' ')} must be a plain number (no commas)`);
        }
      }
      if (!Object.keys(edits).length) return null;
      const { error } = await supabase.rpc('mf_edit_staged', { p_staged_id: row.id, p_edits: edits });
      if (error) throw error;
      return edits;
    },
    onSuccess: () => { showSnackbar('Saved. The original parsed values are kept for audit.', 'success'); onSaved(); },
    onError: dbErrorHandler(showSnackbar, 'Could not save'),
  });
  const field = (k, label, props = {}) => (
    <TextField label={label} size="small" fullWidth value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} sx={{ mb: 1.5 }} {...props} />
  );
  return (
    <Dialog open onClose={onClose} maxWidth="xs" fullWidth slotProps={{ paper: { sx: { borderRadius: 3 } } }}>
      <DialogContent>
        <Typography sx={{ fontWeight: 700, mb: 0.5 }}>Correct transaction</Typography>
        <Typography sx={{ fontSize: '0.7rem', color: 'text.secondary', mb: 2 }}>
          Statement says: “{(row.original_labels ?? []).join(' / ')}”. Units are negative for redemptions and switches out.
        </Typography>
        <TextField select label="Type" size="small" fullWidth value={f.entry_type} onChange={(e) => setF({ ...f, entry_type: e.target.value })} sx={{ mb: 1.5 }}>
          {Object.entries(TYPE_LABEL).filter(([k]) => k !== 'unknown').map(([k, v]) => <MenuItem key={k} value={k}>{v}</MenuItem>)}
        </TextField>
        {field('trade_date', 'Date', { type: 'date', slotProps: { inputLabel: { shrink: true } } })}
        {field('unit_delta', 'Units (signed)')}
        {field('nav', 'NAV / price')}
        {field('gross_amount', 'Gross amount')}
        {field('net_amount', 'Net amount')}
        <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
          <Button fullWidth onClick={onClose} sx={{ textTransform: 'none' }}>Cancel</Button>
          <Button fullWidth variant="contained" disableElevation disabled={save.isPending} onClick={() => save.mutate()} sx={{ textTransform: 'none' }}>Save</Button>
        </Box>
      </DialogContent>
    </Dialog>
  );
}
