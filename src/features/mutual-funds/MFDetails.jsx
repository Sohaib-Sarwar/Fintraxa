import { useState } from 'react';
import { Box, Dialog, DialogContent, Typography, IconButton, useMediaQuery } from '@mui/material';
import { CloseRounded, EditRounded } from '@mui/icons-material';
import { formatCurrency, formatNumber } from '../../lib/formatters';
import { useFx, FONT_NUM, signColor, GainCard } from '../../components/fx';
import { TYPE_LABEL, fmtDate } from './mfLabels';
import AmcLogo from './AmcLogo';
import EntryEditor from './EntryEditor';

const signed = (v) => (v === null || v === undefined ? '—' : `${v > 0 ? '+' : v < 0 ? '−' : ''}${formatCurrency(Math.abs(v), 2)}`);

/** One fund: what it is worth, what it cost, what it made — and every transaction, editable. */
export function FundDetailsDialog({ open, onClose, position: p, rangeLabel }) {
  const t = useFx();
  const isMobile = useMediaQuery('(max-width:768px)');
  const [editing, setEditing] = useState(null);
  if (!p) return null;
  const entries = [...(p.entries ?? [])].sort((a, b) => b.trade_date.localeCompare(a.trade_date) || (b.seq ?? 0) - (a.seq ?? 0));
  const cell = { fontFamily: FONT_NUM, letterSpacing: '-0.02em', textAlign: 'right', whiteSpace: 'nowrap' };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth fullScreen={isMobile}
      slotProps={{ paper: { sx: { borderRadius: isMobile ? 0 : '26px', bgcolor: t.surface, backgroundImage: 'none', p: 0 } } }}>
      <DialogContent sx={{ p: isMobile ? 2 : 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2.5 }}>
          <AmcLogo code={p.amcCode} name={p.amcName} size={46} />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography sx={{ fontSize: '1.1rem', fontWeight: 750, letterSpacing: '-0.02em' }}>{p.fundName ?? 'Fund'}</Typography>
            <Typography sx={{ fontSize: '0.74rem', color: t.muted }}>{[p.amcName, p.unitClass, p.account?.account_ref_masked && `Account ${p.account.account_ref_masked}`].filter(Boolean).join(' · ')}</Typography>
          </Box>
          <IconButton aria-label="Close" onClick={onClose}><CloseRounded /></IconButton>
        </Box>

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' }, gap: 1.25, mb: 1.5 }}>
          <Stat label="Value" value={p.value === null ? '—' : formatCurrency(p.value, 2)} />
          <Stat label="Invested" value={formatCurrency(p.invested, 2)} />
          <Stat label="Units" value={formatNumber(p.units, 4)} />
          <Stat label="Price" value={p.price ? formatNumber(p.price.value, 4) : '—'} sub={p.price ? fmtDate(p.price.date) : null} />
        </Box>

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 1.5, mb: 2.5 }}>
          <GainCard kind="realized" compact title={`Realized · ${rangeLabel ?? ''}`} net={p.realized.net} gross={p.realized.gross} tax={p.realized.cgt} />
          <GainCard kind="unrealized" compact title="Unrealized" net={p.unrealized.net} gross={p.unrealized.gross} tax={p.unrealized.tax} />
        </Box>

        {p.sales?.length > 0 && (
          <Section title={`Sales in ${rangeLabel ?? 'range'}`}>
            <Table head={['Date', 'Units', 'Proceeds', 'FIFO cost', 'Gain', 'CGT']} rows={p.sales.map((s) => [
              fmtDate(s.date), formatNumber(s.units, 4), formatNumber(s.proceeds, 2), formatNumber(s.cost, 2),
              <Box key="g" component="span" sx={{ color: signColor(t, s.gain) }}>{signed(s.gain)}</Box>, formatNumber(s.cgt, 2),
            ])} cell={cell} />
          </Section>
        )}

        {p.isOpen && p.lots?.length > 0 && (
          <Section title="Units held, oldest first">
            <Table head={['Bought', 'Units', 'Cost', 'Cost / unit']} rows={p.lots.map((l) => [
              fmtDate(l.date), formatNumber(l.units, 4), l.costKnown ? formatNumber(l.cost, 2) : 'unknown', l.costKnown && l.units > 0 ? formatNumber(l.cost / l.units, 4) : '—',
            ])} cell={cell} />
          </Section>
        )}

        <Section title={`Transactions · ${entries.length}`}>
          <Box sx={{ maxHeight: 320, overflow: 'auto' }}>
            {entries.map((e) => {
              const u = e.unit_delta !== null && e.unit_delta !== undefined ? Number(e.unit_delta) : null;
              const amt = u !== null && u < 0 ? (e.net_amount ?? e.gross_amount) : (e.gross_amount ?? e.net_amount);
              return (
                <Box key={e.id} sx={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr auto 32px' : '96px 1fr 120px 120px 32px', gap: 1.25, alignItems: 'center', py: 0.75, borderTop: `1px solid ${t.hairline}`, fontSize: '0.76rem' }}>
                  {!isMobile && <Box sx={{ fontFamily: FONT_NUM, color: t.ink2 }}>{fmtDate(e.trade_date)}</Box>}
                  <Box sx={{ minWidth: 0 }}>
                    <Typography noWrap sx={{ fontSize: '0.76rem', fontWeight: 600 }}>{TYPE_LABEL[e.entry_type] ?? e.entry_type}</Typography>
                    {isMobile && <Typography sx={{ fontSize: '0.66rem', color: t.muted }}>{fmtDate(e.trade_date)}</Typography>}
                  </Box>
                  {!isMobile && <Box sx={{ ...cell, color: u < 0 ? t.neg : u > 0 ? t.pos : t.ink2 }}>{u === null ? '—' : `${u > 0 ? '+' : ''}${formatNumber(u, 4)}`}</Box>}
                  <Box sx={cell}>{amt ? formatNumber(Number(amt), 2) : '—'}</Box>
                  <IconButton size="small" aria-label="Edit or delete" onClick={() => setEditing({ ...e, fundName: p.fundName, amcCode: p.amcCode, amcName: p.amcName })}>
                    <EditRounded sx={{ fontSize: 15 }} />
                  </IconButton>
                </Box>
              );
            })}
          </Box>
        </Section>
        {editing && <EntryEditor entry={editing} onClose={() => setEditing(null)} />}
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, value, sub }) {
  const t = useFx();
  return (
    <Box sx={{ bgcolor: t.surface2, borderRadius: '14px', px: 1.5, py: 1.1 }}>
      <Typography sx={{ fontSize: '0.66rem', color: t.muted, fontWeight: 600 }}>{label}</Typography>
      <Typography data-numeric noWrap sx={{ fontFamily: FONT_NUM, fontSize: '0.98rem', fontWeight: 650, letterSpacing: '-0.03em' }}>{value}</Typography>
      {sub && <Typography sx={{ fontSize: '0.62rem', color: t.muted }}>{sub}</Typography>}
    </Box>
  );
}

function Section({ title, children }) {
  return (
    <Box sx={{ mb: 2 }}>
      <Typography sx={{ fontSize: '0.8rem', fontWeight: 700, mb: 0.75 }}>{title}</Typography>
      {children}
    </Box>
  );
}

function Table({ head, rows, cell }) {
  const t = useFx();
  return (
    <Box sx={{ overflowX: 'auto' }}>
      <Box component="table" sx={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.74rem', '& th': { color: t.muted, fontWeight: 600, fontSize: '0.66rem', textAlign: 'right', pb: 0.5, px: 1 }, '& th:first-of-type, & td:first-of-type': { textAlign: 'left', pl: 0 }, '& td': { ...cell, py: 0.6, px: 1, borderTop: `1px solid ${t.hairline}` } }}>
        <thead><tr>{head.map((h) => <th key={h}>{h}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)}</tbody>
      </Box>
    </Box>
  );
}
