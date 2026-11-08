import { useRef, useState } from 'react';
import { Box, Dialog, Typography, InputBase, ButtonBase, IconButton, useMediaQuery } from '@mui/material';
import { DeleteOutlineRounded } from '@mui/icons-material';
import Decimal from 'decimal.js';
import { useFx, FONT_NUM } from '../../components/fx';
import DateField from '../../components/fx/DateField';
import { todayIso } from '../../lib/dateRange';
import { useAppStore } from '../../store/appStore';
import { useEditEntry, useDeleteEntry } from '../../lib/mf/mutations';
import { TYPE_LABEL, AMC_NAME } from './mfLabels';
import { formatCurrency, formatNumber } from '../../lib/formatters';
import Receipt, { ReceiptToolbar, EditHeader } from '../../components/Receipt';
import { downloadReceipt, receiptDate } from '../../lib/receipt';
import AmcLogo from './AmcLogo';

const UNIT_TYPES = new Set(['purchase', 'redemption', 'switch_in', 'switch_out', 'transfer_in', 'transfer_out', 'dividend_reinvest', 'bonus_units', 'capital_refund_units', 'cgt_refund_reinvest']);
const DECIMAL = /^\d+(\.\d+)?$/;

const CASH_IN = new Set(['redemption', 'dividend_cash', 'cgt_refund_cash']);
const num = (v) => { const n = Number(String(v ?? '').replace(/,/g, '')); return Number.isFinite(n) && String(v ?? '').trim() !== '' ? n : null; };

/**
 * One ledger transaction: a receipt you can download (fund logo, what happened,
 * the amount and only the figures below), the fields to correct it, and delete.
 * Type and fund are fixed (delete and re-add to change those). Units × price
 * fills the amount when it is left blank.
 */
export default function EntryEditor({ entry, onClose }) {
  const t = useFx();
  const isMobile = useMediaQuery('(max-width:768px)');
  const showConfirm = useAppStore((s) => s.showConfirm);
  const showSnackbar = useAppStore((s) => s.showSnackbar);
  const slip = useRef(null);
  const units0 = entry.unit_delta !== null && entry.unit_delta !== undefined ? new Decimal(entry.unit_delta).abs().toString() : '';
  // The saved values: Cancel goes back to these.
  const [saved] = useState(() => ({
    trade_date: entry.trade_date ?? '', units: units0, nav: entry.nav ?? '',
    gross_amount: entry.gross_amount ?? '', net_amount: entry.net_amount ?? '', cgt: entry.cgt != null ? String(entry.cgt) : '',
  }));
  const [f, setF] = useState(saved);
  const [err, setErr] = useState(null);
  // Opening a record shows its receipt; Edit swaps it for the form alone.
  const [mode, setMode] = useState('view');
  const edit = useEditEntry({ onDone: onClose });
  const del = useDeleteEntry({ onDone: onClose });
  const hasUnits = UNIT_TYPES.has(entry.entry_type);
  const isOut = entry.unit_delta !== null && Number(entry.unit_delta) < 0;

  const save = () => {
    setErr(null);
    const edits = {};
    const orig = { trade_date: entry.trade_date ?? '', units: units0, nav: entry.nav ?? '', gross_amount: entry.gross_amount ?? '', net_amount: entry.net_amount ?? '', cgt: entry.cgt != null ? String(entry.cgt) : '' };
    for (const [k, v] of Object.entries(f)) {
      const val = String(v).trim().replace(/,/g, '');
      if (val === String(orig[k])) continue;
      if (k !== 'trade_date' && val !== '' && !DECIMAL.test(val)) { setErr('Use plain numbers, for example 1250.50'); return; }
      edits[k] = val === '' ? null : val;
    }
    if (hasUnits && (edits.units === null || (edits.units !== undefined && Number(edits.units) <= 0))) { setErr('Units must be more than zero'); return; }
    if (edits.trade_date && edits.trade_date > new Date().toISOString().slice(0, 10)) { setErr('The date cannot be in the future'); return; }
    if (!Object.keys(edits).length) { onClose(); return; }
    edit.mutate({ id: entry.id, edits });
  };

  const fill = () => {
    const u = String(f.units).replace(/,/g, ''); const p = String(f.nav).replace(/,/g, '');
    if (DECIMAL.test(u) && DECIMAL.test(p) && !f.gross_amount) setF((x) => ({ ...x, gross_amount: new Decimal(u).times(p).toDecimalPlaces(2).toString() }));
  };

  const download = async () => {
    if (!slip.current) return;
    try {
      await downloadReceipt(slip.current, `fund-${entry.entry_type}-${f.trade_date || 'undated'}.png`, t.surface, t.muted);
    } catch {
      showSnackbar('Could not create the receipt', 'error');
    }
  };

  // The receipt mirrors the form: what is typed shows at once.
  const units = num(f.units); const nav = num(f.nav); const gross = num(f.gross_amount); const net = num(f.net_amount); const cgt = num(f.cgt);
  const headline = net ?? gross;
  const cashIn = CASH_IN.has(entry.entry_type);

  const field = (k, label, props = {}) => (
    <Box component="label" sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, minWidth: 0 }}>
      <Box component="span" sx={{ fontSize: '0.68rem', fontWeight: 600, color: t.muted }}>{label}</Box>
      {props.type === 'date' ? <DateField value={f[k]} onChange={(v) => setF({ ...f, [k]: v })} max={todayIso()} label={label} /> : <InputBase value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} inputProps={{ inputMode: k === 'trade_date' ? undefined : 'decimal', 'aria-label': label }}
        sx={{
          height: 40, px: 1.25, borderRadius: '12px', border: `1px solid ${t.border}`, bgcolor: t.surface2, color: t.ink,
          fontSize: '0.84rem', fontFamily: k === 'trade_date' ? 'inherit' : FONT_NUM, transition: 'border-color .16s',
          '&.Mui-focused': { borderColor: t.ink }, '& input': { colorScheme: 'inherit' },
        }} {...props} />}
    </Box>
  );

  const askDelete = () => showConfirm('Delete this transaction?', 'It is removed permanently from your ledger and every figure is recalculated. This cannot be undone.', () => del.mutate(entry.id));
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs" fullScreen={false}
      slotProps={{ paper: { sx: { borderRadius: '22px', bgcolor: t.surface, backgroundImage: 'none', p: 0, m: isMobile ? 1.5 : 4, width: isMobile ? 'calc(100% - 24px)' : undefined } } }}>
      <Box sx={{ p: 2.25 }}>
        {mode === 'view' ? (
          <>
        <ReceiptToolbar onDelete={askDelete} onDownload={download} onEdit={() => setMode('edit')} onClose={onClose} busy={del.isPending} />

        {/* Receipt: also what "Download" captures. */}
        <Receipt boxRef={slip}
          label={`${TYPE_LABEL[entry.entry_type] ?? entry.entry_type}${net !== null ? ', net amount' : ''}`}
          tone={cashIn ? 'pos' : 'neutral'}
          amount={headline !== null ? `${cashIn ? '+' : ''}${formatCurrency(headline, 2)}` : '—'}
          date={receiptDate(f.trade_date)}
          subject={{ logo: <AmcLogo code={entry.amcCode} name={entry.amcName} size={28} />, title: entry.fundName ?? 'Fund', sub: entry.amcName ?? AMC_NAME[entry.amcCode] }}
          rows={[
            [isOut ? 'Units out' : 'Units in', hasUnits && units !== null ? formatNumber(units, 4) : null],
            ['Price (NAV)', hasUnits && nav !== null ? formatNumber(nav, 4) : null],
            ['Gross amount', gross !== null && net !== null ? formatCurrency(gross, 2) : null],
            ['CGT deducted', cgt ? formatCurrency(cgt, 2) : null],
          ]}
          reference={String(entry.id).slice(0, 8).toUpperCase()} />
          </>
        ) : (
          <>
            <EditHeader title={`Edit ${(TYPE_LABEL[entry.entry_type] ?? entry.entry_type).toLowerCase()}`} sub={entry.fundName} onClose={onClose}
              logo={<AmcLogo code={entry.amcCode} name={entry.amcName} size={34} />} />

        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.25, mt: 2 }}>
          <Box sx={{ gridColumn: '1 / -1' }}>{field('trade_date', 'Date', { type: 'date' })}</Box>
          {hasUnits && field('units', isOut ? 'Units out' : 'Units in', { onBlur: fill })}
          {hasUnits && field('nav', 'Price (NAV)', { onBlur: fill })}
          {field('gross_amount', 'Gross amount')}
          {field('net_amount', 'Net amount')}
          {(isOut || entry.cgt) && <Box sx={{ gridColumn: '1 / -1' }}>{field('cgt', 'CGT deducted')}</Box>}
        </Box>

        {err && <Typography sx={{ fontSize: '0.72rem', color: t.neg, mt: 1.25 }}>{err}</Typography>}

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 2.25 }}>
          <IconButton aria-label="Delete transaction" disabled={del.isPending}
            onClick={askDelete}
            sx={{ border: `1px solid ${t.border}`, color: t.neg, width: 40, height: 40 }}>
            <DeleteOutlineRounded fontSize="small" />
          </IconButton>
          <Box sx={{ flex: 1 }} />
          <ButtonBase onClick={() => { setErr(null); setF(saved); setMode('view'); }} sx={{ height: 40, px: 2, borderRadius: 999, border: `1px solid ${t.border}`, fontSize: '0.8rem', fontWeight: 650, fontFamily: 'inherit' }}>Cancel</ButtonBase>
          <ButtonBase onClick={save} disabled={edit.isPending}
            sx={{ height: 40, px: 2.5, borderRadius: 999, bgcolor: t.inv, color: t.invInk, fontSize: '0.8rem', fontWeight: 650, fontFamily: 'inherit', opacity: edit.isPending ? 0.5 : 1 }}>
            {edit.isPending ? 'Saving…' : 'Save'}
          </ButtonBase>
        </Box>
        <Typography sx={{ fontSize: '0.64rem', color: t.muted, mt: 1.5 }}>
          Type and fund cannot change here. To change them, delete this and add it again.
        </Typography>
          </>
        )}
      </Box>
    </Dialog>
  );
}
