import { Box, IconButton, Tooltip, Typography } from '@mui/material';
import { CloseRounded, DeleteOutlineRounded, EditOutlined, FileDownloadOutlined } from '@mui/icons-material';
import { useFx, FONT_NUM } from './fx';

/**
 * One receipt for every record (income / expense, PSX trade, fund transaction),
 * shaped like a ticket after the "receipts UI" reference: the Fintraxa mark large
 * in the centre, what happened and the amount, a perforation with side notches,
 * then only the details that matter, closed by a scalloped edge.
 *
 * It sits on `cut` (the colour behind it: the dialog's surface) and is drawn in
 * the current theme; Download saves exactly this, on that same colour.
 *
 * label     what the record is ("Expense", "Buy", "Redemption")
 * tone      'pos' | 'neg' | 'neutral'  colours the amount
 * amount    already formatted, with its sign
 * subject   { logo, title, sub }  the category, stock or fund, with its logo
 * rows      [[label, value]]  the details; empty values are skipped
 * reference short id printed at the foot
 */
export default function Receipt({ boxRef, label, tone = 'neutral', amount, date, subject, rows = [], reference }) {
  const t = useFx();
  const cut = t.surface;
  const color = tone === 'pos' ? t.pos : tone === 'neg' ? t.neg : t.ink;
  const shown = rows.filter(([, v]) => v !== null && v !== undefined && v !== '');
  const hole = (side) => ({ position: 'absolute', top: '50%', [side]: -11, width: 22, height: 22, borderRadius: '50%', bgcolor: cut, transform: 'translateY(-50%)' });
  return (
    // The padding keeps the scallops inside what Download captures.
    <Box ref={boxRef} sx={{ bgcolor: cut, p: '2px', pb: '10px' }}>
      <Box sx={{ position: 'relative', overflow: 'hidden', borderRadius: '22px 22px 0 0', bgcolor: t.surface2, color: t.ink, textAlign: 'center' }}>
        <Box sx={{ px: 2.5, pt: 3, pb: 2.25 }}>
          <Box component="img" src="/brand/mark-256.png" alt="Fintraxa" width={88} height={88}
            sx={{ display: 'block', mx: 'auto', objectFit: 'contain', filter: 'drop-shadow(0 8px 18px rgba(0,0,0,.18))' }} />
          <Typography sx={{ fontSize: '0.78rem', fontWeight: 650, color: t.ink2, mt: 1.5 }}>{label}</Typography>
          <Typography data-numeric sx={{ fontFamily: FONT_NUM, fontSize: '2.1rem', fontWeight: 650, letterSpacing: '-0.04em', lineHeight: 1.15, color }}>{amount}</Typography>
          {subject && (
            <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 1, mt: 1.5, pl: 0.6, pr: 1.5, py: 0.6, borderRadius: 999, bgcolor: t.surface, border: `1px solid ${t.border}`, maxWidth: '100%' }}>
              <Box sx={{ display: 'flex', flexShrink: 0 }}>{subject.logo}</Box>
              <Box sx={{ textAlign: 'left', minWidth: 0 }}>
                <Typography noWrap sx={{ fontSize: '0.84rem', fontWeight: 700, lineHeight: 1.25 }}>{subject.title}</Typography>
                {subject.sub && <Typography noWrap sx={{ fontSize: '0.66rem', color: t.muted, lineHeight: 1.25 }}>{subject.sub}</Typography>}
              </Box>
            </Box>
          )}
        </Box>

        {/* Perforation */}
        <Box sx={{ position: 'relative', height: 22 }}>
          <Box sx={hole('left')} />
          <Box sx={hole('right')} />
          <Box sx={{ position: 'absolute', top: '50%', left: 20, right: 20, borderTop: `2px dashed ${t.border}` }} />
        </Box>

        <Box sx={{ px: 2.5, pt: 1, pb: 2.75, textAlign: 'left' }}>
          {date && <Row k="Date" v={date} t={t} />}
          {shown.map(([k, v]) => <Row key={k} k={k} v={v} t={t} />)}
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 1.25, pt: 1, borderTop: `1px dashed ${t.border}`, fontSize: '0.62rem', color: t.muted }}>
            <span>Recorded in Fintraxa</span>
            {reference && <Box component="span" sx={{ fontFamily: FONT_NUM }}>Ref {reference}</Box>}
          </Box>
        </Box>

        {/* Scalloped tear-off edge */}
        <Box aria-hidden sx={{ position: 'absolute', left: 0, right: 0, bottom: -9, display: 'flex', justifyContent: 'space-around', px: 0.5 }}>
          {Array.from({ length: 11 }, (_, i) => <Box key={i} sx={{ width: 18, height: 18, borderRadius: '50%', bgcolor: cut }} />)}
        </Box>
      </Box>
    </Box>
  );
}

/**
 * Above the receipt: small icon actions (delete, download, edit) and close.
 * Edit opens the form on its own; the receipt is only for reading and saving.
 */
export function ReceiptToolbar({ onDelete, onDownload, onEdit, onClose, busy }) {
  const t = useFx();
  const btn = { width: 38, height: 38, border: `1px solid ${t.border}`, color: t.ink };
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 1.5 }}>
      <Tooltip title="Delete" arrow>
        <span><IconButton aria-label="Delete" onClick={onDelete} disabled={busy} sx={{ ...btn, color: t.neg }}><DeleteOutlineRounded sx={{ fontSize: 19 }} /></IconButton></span>
      </Tooltip>
      <Tooltip title="Download receipt" arrow>
        <IconButton aria-label="Download receipt" onClick={onDownload} sx={btn}><FileDownloadOutlined sx={{ fontSize: 19 }} /></IconButton>
      </Tooltip>
      <Tooltip title="Edit" arrow>
        <IconButton aria-label="Edit" onClick={onEdit} sx={btn}><EditOutlined sx={{ fontSize: 18 }} /></IconButton>
      </Tooltip>
      <Box sx={{ flex: 1 }} />
      <IconButton size="small" aria-label="Close" onClick={onClose}><CloseRounded fontSize="small" /></IconButton>
    </Box>
  );
}

/** Top of the edit view: what is being edited, and close. */
export function EditHeader({ title, sub, logo, onClose }) {
  const t = useFx();
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, mb: 2 }}>
      {logo}
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography sx={{ fontSize: '1rem', fontWeight: 750, letterSpacing: '-0.01em' }}>{title}</Typography>
        {sub && <Typography noWrap sx={{ fontSize: '0.72rem', color: t.muted }}>{sub}</Typography>}
      </Box>
      <IconButton size="small" aria-label="Close" onClick={onClose}><CloseRounded fontSize="small" /></IconButton>
    </Box>
  );
}

function Row({ k, v, t }) {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, py: 0.55, fontSize: '0.8rem' }}>
      <Box component="span" sx={{ color: t.muted, flexShrink: 0 }}>{k}</Box>
      <Box component="span" sx={{ fontFamily: FONT_NUM, fontWeight: 600, textAlign: 'right', minWidth: 0, overflowWrap: 'anywhere' }}>{v}</Box>
    </Box>
  );
}
