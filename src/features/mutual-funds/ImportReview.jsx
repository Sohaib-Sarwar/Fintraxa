import { useMemo, useState } from 'react';
import {
  Box, Typography, Chip, Button, Checkbox, Skeleton, Alert, Dialog, DialogContent,
  TextField, MenuItem, Collapse, IconButton, useMediaQuery,
} from '@mui/material';
import {
  ArrowBackRounded, ExpandMoreRounded, EditRounded, CheckRounded, BlockRounded, WarningAmberRounded,
  InfoOutlined, DeleteOutlineRounded,
} from '@mui/icons-material';
import { useFx, FxCard, Seg, Chip as FxChip, FONT_NUM } from '../../components/fx';
import { useDeleteImport } from '../../lib/mf/mutations';
import AmcLogo from './AmcLogo';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/authStore';
import { useAppStore } from '../../store/appStore';
import { dbErrorHandler } from '../../lib/dbErrors';
import { formatNumber } from '../../lib/formatters';
import { MF_LEDGER_KEY } from '../../lib/mf/useMfPortfolio';
import { uuid } from '../../lib/mf/hash';
import { STATUS_LABEL, TYPE_LABEL, COMPONENT_LABEL, DIRECTION, AMC_NAME, fmtDate } from './mfLabels';

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
  const t = useFx();
  const delImport = useDeleteImport({ onDone: () => navigate('/funds/imports') });

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
  const sum = imp.summary ?? {};
  const [statusLabel, statusColor] = STATUS_LABEL[imp.status] ?? [imp.status, 'default'];
  const openRows = data.rows.filter((r) => OPEN.includes(r.review_status));
  const counts = data.rows.reduce((acc, r) => ({ ...acc, [r.review_status]: (acc[r.review_status] ?? 0) + 1 }), {});
  const recon = imp.reconciliation?.sections ?? [];
  const continuity = Object.fromEntries((imp.reconciliation?.continuity ?? []).map((c) => [c.section_key, c]));
  const cgtTotal = data.rows.filter((r) => r.review_status === 'approved')
    .reduce((s2, r) => s2 + (r.components ?? []).filter((c) => c.type === 'cgt').reduce((a, c) => a + Number(c.amount), 0), 0);
  const toggle = (rid) => setSelected((s2) => { const n = new Set(s2); if (n.has(rid)) n.delete(rid); else n.add(rid); return n; });
  const amcName = AMC_NAME[sum.amc] ?? 'Statement';
  const askDelete = () => showConfirm('Delete this statement?',
    'The statement, every transaction it added and its evidence are removed permanently. Your figures are recalculated without it. This cannot be undone.',
    () => delImport.mutate(imp.id));

  return (
    <Box sx={{ pb: isMobile ? 1 : 0 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, mb: 1.75, flexWrap: 'wrap' }}>
        <IconButton aria-label="Back to imports" onClick={() => navigate('/funds/imports')} sx={{ border: `1px solid ${t.border}`, width: 36, height: 36 }}>
          <ArrowBackRounded fontSize="small" />
        </IconButton>
        <AmcLogo code={sum.amc} name={amcName} size={40} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontSize: isMobile ? '1.05rem' : '1.3rem', fontWeight: 750, letterSpacing: '-0.03em', lineHeight: 1.2 }}>{amcName} statement</Typography>
          <Typography sx={{ fontSize: '0.7rem', color: t.muted }}>
            {fmtDate(imp.period_start)} – {fmtDate(imp.period_end)} · {imp.page_count ?? '?'} page{imp.page_count === 1 ? '' : 's'} · imported {fmtDate(String(imp.created_at).slice(0, 10))}
          </Typography>
        </Box>
        <Chip size="small" label={statusLabel} color={statusColor} variant="outlined" />
        <Button size="small" color="error" variant="outlined" startIcon={<DeleteOutlineRounded />} disabled={delImport.isPending}
          onClick={askDelete} sx={{ borderRadius: 999, minHeight: 32, py: 0.25 }}>
          Delete
        </Button>
      </Box>

      {imp.status === 'failed' && (
        <Alert severity="error" sx={{ mb: 1.5, borderRadius: '14px' }}>
          {imp.error_message} {imp.recovery_action && <Box sx={{ mt: 0.5 }}>{imp.recovery_action}</Box>}
        </Alert>
      )}

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(5, minmax(0, 1fr))' }, gap: 1.25, mb: 1.5 }}>
        <Stat label="Transactions read" value={data.rows.length} />
        <Stat label="Added to ledger" value={counts.approved ?? 0} tone="pos" />
        <Stat label="Need review" value={openRows.length} tone={openRows.length ? 'warn' : undefined} />
        <Stat label="Duplicates skipped" value={counts.duplicate ?? 0} />
        <Stat label="CGT on added rows" value={formatNumber(cgtTotal, 2)} />
      </Box>

      {recon.length > 0 && (
        <FxCard title="Funds in this statement" sx={{ mb: 1.5 }}>
          {recon.map((r) => {
            const [fundName, unitClass] = r.section_key.split('|');
            const uc = r.unit_chain ?? {};
            const c = continuity[r.section_key];
            const ok = r.status !== 'material' && r.status !== 'missing_source';
            return (
              <Box key={r.section_key} sx={{
                display: 'grid', gridTemplateColumns: isMobile ? '1fr auto' : 'minmax(0, 2fr) minmax(0, 1.4fr) auto auto', gap: 1.5, alignItems: 'center',
                py: 1, borderTop: `1px solid ${t.hairline}`, '&:first-of-type': { borderTop: 0 },
              }}>
                <Box sx={{ minWidth: 0 }}>
                  <Typography noWrap sx={{ fontSize: '0.78rem', fontWeight: 650, textTransform: 'capitalize' }}>{fundName}</Typography>
                  <Typography noWrap sx={{ fontSize: '0.64rem', color: t.muted }}>{unitClass || 'Units'}</Typography>
                </Box>
                {!isMobile && (
                  <Typography sx={{ fontSize: '0.72rem', fontFamily: FONT_NUM, color: t.ink2, letterSpacing: '-0.02em' }}>
                    {uc.status === 'missing_source' || !uc.status ? 'No closing balance printed' : `${uc.opening ?? '0'} → ${uc.printed_closing ?? uc.computed_closing ?? '—'} units`}
                  </Typography>
                )}
                <FxChip tone={r.status === 'material' ? 'neg' : ok ? 'pos' : undefined}>
                  {r.status === 'material' ? 'Does not reconcile' : r.status === 'missing_source' ? 'Not checkable' : 'Units reconcile'}
                </FxChip>
                {!isMobile && c && <FxChip tone={c.status === 'gap' ? 'warn' : undefined}>{CONTINUITY[c.status] ?? c.status}</FxChip>}
              </Box>
            );
          })}
        </FxCard>
      )}

      <FxCard title="Transactions" right={(
        <Box sx={{ display: 'flex', gap: 0.75, alignItems: 'center', flexWrap: 'wrap' }}>
          <Seg size="sm" label="Show" value={filter} onChange={setFilter}
            options={[{ value: 'open', label: `To review · ${openRows.length}` }, { value: 'all', label: `All · ${data.rows.length}` }]} />
          {openRows.length > 0 && (
            <>
              <Button size="small" disabled={!selected.size || setStatus.isPending} startIcon={<BlockRounded />}
                onClick={() => showConfirm('Exclude selected?', 'Excluded rows are kept for audit but never added to your ledger.', () => setStatus.mutate({ ids: [...selected], status: 'excluded' }))}
                sx={{ borderRadius: 999, minHeight: 32, py: 0.25 }}>Exclude</Button>
              <Button size="small" variant="contained" disableElevation disabled={!selected.size || approve.isPending} startIcon={<CheckRounded />}
                onClick={() => approve.mutate([...selected])} sx={{ borderRadius: 999, minHeight: 32, py: 0.25 }}>
                Approve {selected.size || ''}
              </Button>
            </>
          )}
        </Box>
      )}>
        {groups.length === 0 && (
          <Typography sx={{ fontSize: '0.8rem', color: t.muted, textAlign: 'center', py: 3 }}>
            {filter === 'open' ? 'Nothing needs your review. Every clean transaction was added automatically.' : 'No transactions.'}
          </Typography>
        )}

        {groups.map(([fund, list]) => (
          <Box key={fund} sx={{ mb: 1.5 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
              {list.some((r) => OPEN.includes(r.review_status)) && (
                <Checkbox size="small" inputProps={{ 'aria-label': `Select all in ${fund}` }}
                  checked={list.filter((r) => OPEN.includes(r.review_status)).every((r) => selected.has(r.id))}
                  onChange={(e) => setSelected((s2) => {
                    const n = new Set(s2);
                    for (const r of list.filter((x) => OPEN.includes(x.review_status))) { if (e.target.checked) n.add(r.id); else n.delete(r.id); }
                    return n;
                  })} />
              )}
              <Typography sx={{ fontSize: '0.74rem', fontWeight: 700, color: t.ink2 }}>{fund}</Typography>
            </Box>
            {!isMobile && (
              <Box sx={{ display: 'grid', gridTemplateColumns: RCOLS, gap: 1.25, px: 1, pb: 0.5, fontSize: '0.64rem', fontWeight: 600, color: t.muted }}>
                <span /><span>Date</span><span>Transaction</span><Box sx={{ textAlign: 'right' }}>Units</Box><Box sx={{ textAlign: 'right' }}>NAV</Box>
                <Box sx={{ textAlign: 'right' }}>Amount</Box><Box sx={{ textAlign: 'right' }}>CGT</Box><span>Status</span><span />
              </Box>
            )}
            {list.map((r) => (
              <ReviewRow key={r.id} r={r} t={t} mobile={isMobile} selected={selected.has(r.id)} onToggle={() => toggle(r.id)}
                expanded={expanded === r.id} onExpand={() => setExpanded(expanded === r.id ? null : r.id)} onEdit={() => setEditing(r)} lines={data.lines} />
            ))}
          </Box>
        ))}
      </FxCard>

      {editing && <EditDialog row={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); refresh(); }} />}
    </Box>
  );
}

const RCOLS = '28px 92px minmax(0, 2.2fr) 110px 90px 110px 76px 130px 64px';
const CONTINUITY = { continuous: 'Follows your ledger', gap: 'Earlier statement missing?', first_import: 'First statement', no_history: 'Opening balance only' };

function ReviewRow({ r, t, mobile, selected, onToggle, expanded, onExpand, onEdit, lines }) {
  const warns = (r.warnings ?? []).filter((w) => w.severity !== 'info');
  const isOpen = OPEN.includes(r.review_status);
  const u = r.unit_delta !== null ? Number(r.unit_delta) : null;
  const amount = u !== null && u < 0 ? (r.net_amount ?? r.gross_amount) : (r.gross_amount ?? r.net_amount);
  const cgt = (r.components ?? []).filter((c) => c.type === 'cgt').reduce((a, c) => a + Number(c.amount), 0);
  const status = r.review_status === 'approved' ? ['Added', 'pos']
    : r.review_status === 'duplicate' || r.duplicate_status === 'exact_duplicate' ? ['Duplicate', undefined]
      : ['excluded', 'rejected'].includes(r.review_status) ? ['Excluded', undefined]
        : r.duplicate_status === 'probable_duplicate' ? ['Possible duplicate', 'warn'] : ['To review', 'warn'];
  const numSx = { textAlign: 'right', fontFamily: FONT_NUM, letterSpacing: '-0.02em' };
  return (
    <Box sx={{ borderTop: `1px solid ${t.hairline}` }}>
      <Box sx={{ display: 'grid', gridTemplateColumns: mobile ? '28px 1fr auto 32px' : RCOLS, gap: 1.25, alignItems: 'center', px: mobile ? 0 : 1, py: 0.75, fontSize: '0.74rem' }}>
        {isOpen ? <Checkbox size="small" checked={selected} onChange={onToggle} inputProps={{ 'aria-label': 'Select transaction' }} sx={{ p: 0.25 }} /> : <span />}
        {mobile ? (
          <Box sx={{ minWidth: 0 }}>
            <Typography noWrap sx={{ fontSize: '0.76rem', fontWeight: 650 }}>{TYPE_LABEL[r.entry_type] ?? r.entry_type}</Typography>
            <Typography noWrap sx={{ fontSize: '0.64rem', color: t.muted }}>{fmtDate(r.trade_date)}{u === null ? '' : ` · ${formatNumber(u, 4)} u`} · {status[0]}</Typography>
          </Box>
        ) : (
          <>
            <Box sx={{ fontFamily: FONT_NUM, color: t.ink2, letterSpacing: '-0.02em' }}>{fmtDate(r.trade_date)}</Box>
            <Box sx={{ minWidth: 0 }}>
              <Typography noWrap sx={{ fontSize: '0.74rem', fontWeight: 600 }}>{TYPE_LABEL[r.entry_type] ?? r.entry_type}</Typography>
              <Typography noWrap sx={{ fontSize: '0.62rem', color: t.muted }}>“{(r.original_labels ?? [r.original_label]).join(' / ')}”</Typography>
            </Box>
            <Box sx={{ ...numSx, color: u < 0 ? t.neg : u > 0 ? t.pos : t.ink2 }}>{u === null ? '—' : `${u > 0 ? '+' : ''}${formatNumber(u, 4)}`}</Box>
            <Box sx={numSx}>{r.nav !== null ? formatNumber(Number(r.nav), 4) : '—'}</Box>
          </>
        )}
        <Box sx={{ ...numSx, fontWeight: 600 }}>{money(amount)}</Box>
        {!mobile && <Box sx={numSx}>{cgt ? formatNumber(cgt, 2) : '—'}</Box>}
        {!mobile && <Box><FxChip tone={status[1]}>{status[0]}</FxChip></Box>}
        <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
          {isOpen && !mobile && <IconButton size="small" aria-label="Edit" onClick={onEdit}><EditRounded sx={{ fontSize: 15 }} /></IconButton>}
          <IconButton size="small" aria-label="Show evidence" onClick={onExpand} sx={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }}>
            <ExpandMoreRounded sx={{ fontSize: 17 }} />
          </IconButton>
        </Box>
      </Box>
      {warns.length > 0 && isOpen && (
        <Box sx={{ pb: 0.75, pl: mobile ? 4 : 6 }}>
          {warns.map((w, i) => (
            <Typography key={i} sx={{ fontSize: '0.66rem', color: t.warn, display: 'flex', gap: 0.5, alignItems: 'flex-start' }}>
              <WarningAmberRounded sx={{ fontSize: 13, mt: '1px' }} /> {w.message}
            </Typography>
          ))}
          {r.duplicate_note && <Typography sx={{ fontSize: '0.66rem', color: t.muted }}>{r.duplicate_note}</Typography>}
        </Box>
      )}
      <Collapse in={expanded} unmountOnExit>
        <Box sx={{ mb: 1, p: 1.25, borderRadius: '12px', bgcolor: t.surface2, overflowX: 'auto' }}>
          <Typography sx={{ fontSize: '0.62rem', color: t.muted, mb: 0.5, display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap' }}>
            <InfoOutlined sx={{ fontSize: 12 }} /> As printed on page {r.page ?? '?'} (personal details removed)
            {r.gross_amount !== null && r.net_amount !== null && r.net_amount !== r.gross_amount && ` · gross ${money(r.gross_amount)} · net ${money(r.net_amount)}`}
            {(r.components ?? []).filter((c) => c.type !== 'cgt').map((c) => ` · ${COMPONENT_LABEL[c.type] ?? c.type} ${money(c.amount)}`).join('')}
          </Typography>
          <Box component="pre" sx={{ m: 0, fontSize: '0.64rem', fontFamily: FONT_NUM, whiteSpace: 'pre', color: t.ink2 }}>
            {(r.line_ids ?? []).map((lid) => lines[lid] ?? '').filter(Boolean).join('\n')}
          </Box>
          {r.user_edits && (
            <Typography sx={{ fontSize: '0.62rem', color: t.muted, mt: 0.5 }}>Edited: {Object.keys(r.user_edits).join(', ')} (parsed values kept for audit)</Typography>
          )}
        </Box>
      </Collapse>
    </Box>
  );
}

function Stat({ label, value, tone }) {
  const t = useFx();
  return (
    <Box sx={{ bgcolor: t.surface, border: `1px solid ${t.border}`, borderRadius: '16px', px: 1.5, py: 1.25 }}>
      <Typography sx={{ fontSize: '0.68rem', color: t.muted, fontWeight: 600 }}>{label}</Typography>
      <Typography sx={{ fontSize: '1.15rem', fontWeight: 600, fontFamily: FONT_NUM, letterSpacing: '-0.03em', color: tone === 'pos' ? t.pos : tone === 'warn' ? t.warn : t.ink }}>{value}</Typography>
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
