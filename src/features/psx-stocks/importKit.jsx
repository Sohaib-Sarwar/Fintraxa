/**
 * Shared upload UI: drop zone, per-file live progress, error card with
 * password unlock, and the finished state. Used by trade-confirmation and
 * dividend-report uploads.
 */
import { useRef, useState } from 'react';
import { Box, Typography, ButtonBase, InputBase, IconButton } from '@mui/material';
import { UploadFileRounded, PictureAsPdfRounded, CloseRounded, LockRounded, ErrorOutlineRounded } from '@mui/icons-material';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { useFx, FONT_NUM } from '../../components/fx';

/** Drag-and-drop or click to choose PDFs. Keyboard: Enter / Space opens the picker. */
export function DropZone({ onFiles, multiple = true, title, hint, compact }) {
  const t = useFx();
  const input = useRef(null);
  const [over, setOver] = useState(false);
  const take = (list) => { const files = [...(list ?? [])]; if (files.length) onFiles(multiple ? files : files.slice(0, 1)); };
  return (
    <ButtonBase
      onClick={() => input.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); take(e.dataTransfer.files); }}
      aria-label={title}
      sx={{
        width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1,
        py: compact ? 3 : 5, px: 2, borderRadius: '18px', fontFamily: 'inherit', textAlign: 'center',
        border: `1.5px dashed ${over ? t.ink : t.border}`, bgcolor: over ? t.surface3 : t.surface2,
        transition: 'border-color .18s, background-color .18s, transform .18s', transform: over ? 'scale(1.01)' : 'none',
        '&:hover': { borderColor: t.ink2 }, '&:focus-visible': { outline: `2px solid ${t.ink}`, outlineOffset: 2 },
      }}>
      <Box sx={{ width: 46, height: 46, borderRadius: '14px', display: 'grid', placeItems: 'center', bgcolor: t.surface, border: `1px solid ${t.border}` }}>
        <UploadFileRounded sx={{ fontSize: 22, color: t.ink }} />
      </Box>
      <Typography sx={{ fontSize: '0.88rem', fontWeight: 700 }}>{title}</Typography>
      <Typography sx={{ fontSize: '0.72rem', color: t.muted, maxWidth: 380 }}>{hint}</Typography>
      <input ref={input} type="file" hidden accept="application/pdf,.pdf" multiple={multiple}
        onChange={(e) => { take(e.target.files); e.target.value = ''; }} />
    </ButtonBase>
  );
}

function StepIcon({ status }) {
  const t = useFx();
  const reduce = useReducedMotion();
  const size = 20;
  if (status === 'active') {
    return (
      <Box sx={{ position: 'relative', width: size, height: size }}>
        <Box sx={{ position: 'absolute', inset: 0, borderRadius: '50%', border: `2px solid ${t.hairline}` }} />
        <motion.span style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: `2px solid transparent`, borderTopColor: t.ink, borderRightColor: t.ink }}
          animate={reduce ? {} : { rotate: 360 }} transition={{ repeat: Infinity, ease: 'linear', duration: 0.8 }} />
      </Box>
    );
  }
  if (status === 'done' || status === 'warn' || status === 'error') {
    const bg = status === 'done' ? t.pos : status === 'warn' ? '#d08a1a' : t.neg;
    return (
      <motion.span initial={reduce ? false : { scale: 0.3, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 520, damping: 26 }}
        style={{ width: size, height: size, borderRadius: '50%', background: bg, display: 'grid', placeItems: 'center' }}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          {status === 'done' && <motion.path d="M5 12.5l4.2 4.2L19 7" initial={reduce ? false : { pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.28, delay: 0.05 }} />}
          {status === 'warn' && <path d="M12 7v6M12 17h.01" />}
          {status === 'error' && <path d="M7 7l10 10M17 7L7 17" />}
        </svg>
      </motion.span>
    );
  }
  return <Box sx={{ width: size, height: size, borderRadius: '50%', border: `2px solid ${t.hairline}` }} />;
}

/**
 * One file being processed: name, a progress bar and the step list.
 * job: { id, name, steps: [{ key, label, status, detail }], error?: { code, message } }
 */
export function FileProgress({ job, onUnlock, onRemove }) {
  const t = useFx();
  const reduce = useReducedMotion();
  const [pwd, setPwd] = useState('');
  const done = job.steps.filter((s) => s.status !== 'pending' && s.status !== 'active').length;
  const pct = job.error ? 100 : Math.round((done / job.steps.length) * 100);
  const needsPassword = job.error && (job.error.code === 'password' || job.error.code === 'wrong_password');
  return (
    <motion.div layout initial={reduce ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.24 }}>
      <Box sx={{ border: `1px solid ${job.error ? t.neg : t.border}`, borderRadius: '16px', p: 1.5, bgcolor: t.surface }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <PictureAsPdfRounded sx={{ fontSize: 20, color: job.error ? t.neg : t.ink2 }} />
          <Typography noWrap sx={{ fontSize: '0.8rem', fontWeight: 650, flex: 1, minWidth: 0 }}>{job.name}</Typography>
          <Typography sx={{ fontFamily: FONT_NUM, fontSize: '0.7rem', color: t.muted }}>{job.error ? 'Needs attention' : `${pct}%`}</Typography>
          {onRemove && job.error && <IconButton size="small" aria-label={`Remove ${job.name}`} onClick={() => onRemove(job.id)}><CloseRounded sx={{ fontSize: 16 }} /></IconButton>}
        </Box>
        <Box sx={{ height: 4, borderRadius: 999, bgcolor: t.hairline, mt: 1, overflow: 'hidden' }}>
          <motion.div initial={false} animate={{ width: `${pct}%` }} transition={{ duration: reduce ? 0 : 0.35, ease: 'easeOut' }}
            style={{ height: '100%', borderRadius: 999, background: job.error ? t.neg : t.ink }} />
        </Box>
        <Box component="ol" sx={{ listStyle: 'none', p: 0, m: 0, mt: 1.25, display: 'grid', gap: 0.85 }}>
          <AnimatePresence initial={false}>
            {job.steps.filter((s) => s.status !== 'pending' || !job.error).map((s) => (
              <motion.li key={s.key} layout initial={reduce ? false : { opacity: 0, x: -6 }} animate={{ opacity: s.status === 'pending' ? 0.45 : 1, x: 0 }} transition={{ duration: 0.2 }}
                style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <StepIcon status={s.status} />
                <Box sx={{ minWidth: 0 }}>
                  <Typography sx={{ fontSize: '0.76rem', fontWeight: s.status === 'active' ? 650 : 550, color: s.status === 'pending' ? t.muted : t.ink, lineHeight: '20px' }}>{s.label}</Typography>
                  {s.detail && <Typography sx={{ fontSize: '0.7rem', color: s.status === 'error' ? t.neg : s.status === 'warn' ? '#b5761a' : t.muted }}>{s.detail}</Typography>}
                </Box>
              </motion.li>
            ))}
          </AnimatePresence>
        </Box>
        {job.error && (
          <Box sx={{ mt: 1.25, display: 'flex', gap: 1, alignItems: 'flex-start' }}>
            {needsPassword ? <LockRounded sx={{ fontSize: 18, color: t.neg, mt: '1px' }} /> : <ErrorOutlineRounded sx={{ fontSize: 18, color: t.neg, mt: '1px' }} />}
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography sx={{ fontSize: '0.74rem', color: t.ink }}>{job.error.message}</Typography>
              {needsPassword && onUnlock && (
                <Box component="form" onSubmit={(e) => { e.preventDefault(); if (pwd) onUnlock(job.id, pwd); }} sx={{ display: 'flex', gap: 0.75, mt: 1 }}>
                  <InputBase type="password" value={pwd} onChange={(e) => setPwd(e.target.value)} placeholder="PDF password" autoComplete="off"
                    inputProps={{ 'aria-label': `Password for ${job.name}` }}
                    sx={{ flex: 1, height: 34, px: 1.25, borderRadius: '10px', border: `1px solid ${t.border}`, bgcolor: t.surface2, fontSize: '0.78rem', '&.Mui-focused': { borderColor: t.ink } }} />
                  <ButtonBase type="submit" disabled={!pwd} sx={{ height: 34, px: 1.75, borderRadius: 999, bgcolor: t.inv, color: t.invInk, fontSize: '0.74rem', fontWeight: 650, fontFamily: 'inherit', opacity: pwd ? 1 : 0.45 }}>Unlock</ButtonBase>
                </Box>
              )}
            </Box>
          </Box>
        )}
      </Box>
    </motion.div>
  );
}

/** Finished: a check that draws itself, a title, a line of detail, optional logos, Done. */
export function DoneMark({ title, sub, children, onDone }) {
  const t = useFx();
  const reduce = useReducedMotion();
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', py: 4, px: 2 }}>
      <motion.div initial={reduce ? false : { scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 380, damping: 22 }}>
        <Box sx={{ width: 72, height: 72, borderRadius: '50%', bgcolor: t.posSoft, display: 'grid', placeItems: 'center' }}>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke={t.pos} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <motion.path d="M5 12.5l4.2 4.2L19 7" initial={reduce ? false : { pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.45, delay: 0.15, ease: 'easeOut' }} />
          </svg>
        </Box>
      </motion.div>
      <motion.div initial={reduce ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
        <Typography sx={{ fontSize: '1.05rem', fontWeight: 750, mt: 2 }}>{title}</Typography>
        {sub && <Typography sx={{ fontSize: '0.78rem', color: t.muted, mt: 0.5 }}>{sub}</Typography>}
        {children && <Box sx={{ mt: 1.75, display: 'flex', justifyContent: 'center', gap: 1, flexWrap: 'wrap' }}>{children}</Box>}
      </motion.div>
      <ButtonBase onClick={onDone} autoFocus sx={{ mt: 3, height: 40, px: 3.5, borderRadius: 999, bgcolor: t.inv, color: t.invInk, fontSize: '0.82rem', fontWeight: 650, fontFamily: 'inherit' }}>Done</ButtonBase>
    </Box>
  );
}
