import { useMemo, useState } from 'react';
import {
  Box, Card, Typography, TextField, MenuItem, Chip, Table, TableBody, TableCell, TableHead, TableRow, Skeleton,
  IconButton, Tooltip, Dialog, DialogContent, Button, useMediaQuery,
} from '@mui/material';
import { UndoRounded, FilterListOffRounded } from '@mui/icons-material';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { useAppStore } from '../../store/appStore';
import { dbErrorHandler } from '../../lib/dbErrors';
import { useMfPortfolio, MF_LEDGER_KEY } from '../../lib/mf/useMfPortfolio';
import { formatNumber } from '../../lib/formatters';
import { TYPE_LABEL, fmtDate } from './mfLabels';
import AmcLogo from './AmcLogo';

const GROUPS = {
  all: { label: 'All types', types: null },
  buy: { label: 'Purchases', types: ['purchase'] },
  redeem: { label: 'Redemptions', types: ['redemption'] },
  switch: { label: 'Switches', types: ['switch_in', 'switch_out', 'transfer_in', 'transfer_out'] },
  tax: { label: 'CGT & refunds', types: ['cgt_deduction', 'cgt_reversal', 'cgt_refund_cash', 'cgt_refund_reinvest'] },
  income: { label: 'Dividends & distributions', types: ['dividend_cash', 'dividend_reinvest', 'capital_refund_units', 'bonus_units'] },
};
const SOURCE = { statement: 'Statement', manual: 'Manual', legacy_migration: 'Manual (old)', correction: 'Reversal' };

export default function MFTransactions() {
  const isMobile = useMediaQuery('(max-width:768px)');
  const { ledger, isLoading } = useMfPortfolio();
  const [amc, setAmc] = useState('all');
  const [fund, setFund] = useState('all');
  const [group, setGroup] = useState('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [reversing, setReversing] = useState(null);

  const view = useMemo(() => {
    if (!ledger) return { rows: [], amcs: [], funds: [] };
    const funds = Object.fromEntries(ledger.funds.map((f) => [f.id, f]));
    const amcs = Object.fromEntries(ledger.amcs.map((a) => [a.id, a]));
    const cgt = new Map();
    for (const c of ledger.components) {
      if (c.component_type === 'cgt') cgt.set(c.entry_id, (cgt.get(c.entry_id) ?? 0) + Number(c.amount));
    }
    const reversedIds = new Set(ledger.entries.filter((e) => e.reverses_entry_id).map((e) => e.reverses_entry_id));
    const all = ledger.entries.map((e) => {
      const f = funds[e.fund_id];
      return {
        ...e, fundName: f?.name ?? 'Fund', amcId: f?.amc_id, amcName: amcs[f?.amc_id]?.name ?? '', amcCode: amcs[f?.amc_id]?.code ?? null,
        cgt: cgt.get(e.id) ?? null, reversed: reversedIds.has(e.id),
      };
    });
    const usedAmcs = [...new Map(all.map((r) => [r.amcId, { id: r.amcId, name: r.amcName }])).values()].filter((a) => a.id);
    const usedFunds = [...new Map(all.filter((r) => amc === 'all' || r.amcId === amc).map((r) => [r.fund_id, { id: r.fund_id, name: r.fundName }])).values()];
    const types = GROUPS[group].types;
    const rows = all
      .filter((r) => (amc === 'all' || r.amcId === amc) && (fund === 'all' || r.fund_id === fund))
      .filter((r) => !types || types.includes(r.entry_type))
      .filter((r) => (!from || r.trade_date >= from) && (!to || r.trade_date <= to))
      .sort((a, b) => (b.trade_date.localeCompare(a.trade_date)) || (b.seq - a.seq));
    return { rows, amcs: usedAmcs.sort((a, b) => a.name.localeCompare(b.name)), funds: usedFunds.sort((a, b) => a.name.localeCompare(b.name)) };
  }, [ledger, amc, fund, group, from, to]);

  const filtered = amc !== 'all' || fund !== 'all' || group !== 'all' || from || to;
  const clear = () => { setAmc('all'); setFund('all'); setGroup('all'); setFrom(''); setTo(''); };

  return (
    <Box sx={{ pb: isMobile ? 1 : 0 }}>
      <Typography sx={{ fontSize: isMobile ? '1.2rem' : '1.5rem', fontWeight: 800, letterSpacing: '-0.03em', mb: isMobile ? 2 : 3 }}>Fund transactions</Typography>

      <Box sx={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(5, minmax(0, 1fr)) auto', gap: 1, mb: 2, alignItems: 'center' }}>
        <TextField select size="small" label="AMC" value={amc} onChange={(e) => { setAmc(e.target.value); setFund('all'); }}>
          <MenuItem value="all">All AMCs</MenuItem>
          {view.amcs.map((a) => <MenuItem key={a.id} value={a.id}>{a.name}</MenuItem>)}
        </TextField>
        <TextField select size="small" label="Fund" value={fund} onChange={(e) => setFund(e.target.value)}>
          <MenuItem value="all">All funds</MenuItem>
          {view.funds.map((f) => <MenuItem key={f.id} value={f.id}>{f.name}</MenuItem>)}
        </TextField>
        <TextField select size="small" label="Type" value={group} onChange={(e) => setGroup(e.target.value)}>
          {Object.entries(GROUPS).map(([k, g]) => <MenuItem key={k} value={k}>{g.label}</MenuItem>)}
        </TextField>
        <TextField size="small" type="date" label="From" value={from} onChange={(e) => setFrom(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
        <TextField size="small" type="date" label="To" value={to} onChange={(e) => setTo(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
        {filtered && (
          <Tooltip title="Clear filters"><IconButton aria-label="Clear filters" onClick={clear}><FilterListOffRounded /></IconButton></Tooltip>
        )}
      </Box>

      <Typography sx={{ fontSize: '0.7rem', color: 'text.secondary', mb: 1 }}>{view.rows.length} transaction{view.rows.length === 1 ? '' : 's'}</Typography>

      {isLoading ? <Skeleton variant="rounded" height={300} /> : (
        <Card sx={{ overflow: 'hidden' }}>
          <Box sx={{ overflowX: 'auto' }}>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ '& th': { fontSize: '0.66rem', fontWeight: 600, color: 'text.secondary', whiteSpace: 'nowrap' } }}>
                  <TableCell>Date</TableCell>
                  <TableCell>Fund</TableCell>
                  <TableCell>Type</TableCell>
                  <TableCell align="right">Units</TableCell>
                  {!isMobile && <TableCell align="right">NAV</TableCell>}
                  <TableCell align="right">Amount</TableCell>
                  <TableCell align="right">CGT</TableCell>
                  {!isMobile && <TableCell>Source</TableCell>}
                  <TableCell />
                </TableRow>
              </TableHead>
              <TableBody>
                {view.rows.length === 0 && (
                  <TableRow><TableCell colSpan={9} sx={{ textAlign: 'center', py: 4, color: 'text.secondary', fontSize: '0.78rem' }}>No transactions match.</TableCell></TableRow>
                )}
                {view.rows.map((r) => {
                  const units = r.unit_delta !== null ? Number(r.unit_delta) : null;
                  const amount = units !== null && units < 0 ? (r.net_amount ?? r.gross_amount) : (r.gross_amount ?? r.net_amount);
                  const struck = r.reversed || r.reverses_entry_id;
                  return (
                    <TableRow key={r.id} hover sx={{ '& td': { fontSize: '0.72rem', py: 0.8, fontFeatureSettings: '"tnum"', opacity: struck ? 0.5 : 1, textDecoration: r.reversed ? 'line-through' : 'none' } }}>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>{fmtDate(r.trade_date)}</TableCell>
                      <TableCell sx={{ minWidth: 160 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <AmcLogo code={r.amcCode} name={r.amcName} size={26} />
                          <Box sx={{ minWidth: 0 }}>
                            <Box sx={{ fontWeight: 600 }}>{r.fundName}</Box>
                            <Box sx={{ fontSize: '0.62rem', color: 'text.secondary' }}>{r.amcName}</Box>
                          </Box>
                        </Box>
                      </TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>
                        {TYPE_LABEL[r.entry_type] ?? r.entry_type}
                        {r.reverses_entry_id && <Chip size="small" label="Reversal" sx={{ ml: 0.5, height: 16, fontSize: '0.55rem' }} />}
                      </TableCell>
                      <TableCell align="right" sx={{ color: units < 0 ? '#b91c1c' : units > 0 ? '#15803d' : undefined }}>
                        {units === null ? '—' : `${units > 0 ? '+' : ''}${formatNumber(units, 4)}`}
                      </TableCell>
                      {!isMobile && <TableCell align="right">{r.nav ? formatNumber(Number(r.nav), 4) : '—'}</TableCell>}
                      <TableCell align="right">{amount ? formatNumber(Number(amount), 2) : '—'}</TableCell>
                      <TableCell align="right">{r.cgt ? formatNumber(r.cgt, 2) : '—'}</TableCell>
                      {!isMobile && <TableCell sx={{ color: 'text.secondary' }}>{SOURCE[r.origin] ?? r.origin}</TableCell>}
                      <TableCell align="right">
                        {!struck && (
                          <Tooltip title="Reverse (correct) this entry">
                            <IconButton size="small" aria-label="Reverse entry" onClick={() => setReversing(r)}><UndoRounded sx={{ fontSize: 16 }} /></IconButton>
                          </Tooltip>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Box>
        </Card>
      )}

      {reversing && <ReverseDialog entry={reversing} onClose={() => setReversing(null)} />}
    </Box>
  );
}

function ReverseDialog({ entry, onClose }) {
  const showSnackbar = useAppStore((s) => s.showSnackbar);
  const qc = useQueryClient();
  const [reason, setReason] = useState('');
  const reverse = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('mf_reverse_entry', { p_entry_id: entry.id, p_reason: reason.trim() });
      if (error) throw error;
    },
    onSuccess: () => { showSnackbar('Entry reversed. Both rows are kept for audit.', 'success'); qc.invalidateQueries({ queryKey: [MF_LEDGER_KEY] }); onClose(); },
    onError: dbErrorHandler(showSnackbar, 'Could not reverse'),
  });
  return (
    <Dialog open onClose={onClose} maxWidth="xs" fullWidth slotProps={{ paper: { sx: { borderRadius: 3 } } }}>
      <DialogContent>
        <Typography sx={{ fontWeight: 700, mb: 0.5 }}>Reverse this entry?</Typography>
        <Typography sx={{ fontSize: '0.74rem', color: 'text.secondary', mb: 2 }}>
          {TYPE_LABEL[entry.entry_type]} · {entry.fundName} · {fmtDate(entry.trade_date)}. Nothing is deleted: a mirror entry cancels it, and both stay in your history.
        </Typography>
        <TextField label="Reason" size="small" fullWidth autoFocus value={reason} onChange={(e) => setReason(e.target.value)} />
        <Box sx={{ display: 'flex', gap: 1, mt: 2 }}>
          <Button fullWidth onClick={onClose} sx={{ textTransform: 'none' }}>Cancel</Button>
          <Button fullWidth variant="contained" color="error" disableElevation disabled={!reason.trim() || reverse.isPending}
            onClick={() => reverse.mutate()} sx={{ textTransform: 'none' }}>Reverse</Button>
        </Box>
      </DialogContent>
    </Dialog>
  );
}
