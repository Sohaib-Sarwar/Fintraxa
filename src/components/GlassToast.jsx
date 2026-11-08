import { useEffect, useRef } from 'react';
import { Box, Typography, useTheme } from '@mui/material';
import { CheckRounded, CloseRounded, PriorityHighRounded, InfoRounded } from '@mui/icons-material';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';

const TONE = {
  success: { color: '#34c759', Icon: CheckRounded, title: 'Done' },
  error: { color: '#ff3b30', Icon: CloseRounded, title: 'Something went wrong' },
  warning: { color: '#ff9f0a', Icon: PriorityHighRounded, title: 'Heads up' },
  info: { color: '#0a84ff', Icon: InfoRounded, title: 'Fintraxa' },
};
const SHOW_MS = 3600;

/**
 * App-wide notification, after Apple's banners: a frosted glass card that drops
 * in from the top, the Fintraxa icon, a short title and the message, a small
 * tinted mark for success / error. Swipe up, click or wait to dismiss.
 * Driven by useAppStore().showSnackbar(message, severity).
 */
export default function GlassToast({ open, id, message, severity = 'success', onClose }) {
  const dark = useTheme().palette.mode === 'dark';
  const reduce = useReducedMotion();
  const timer = useRef(null);
  const tone = TONE[severity] ?? TONE.info;

  useEffect(() => {
    if (!open) return undefined;
    clearTimeout(timer.current);
    timer.current = setTimeout(onClose, severity === 'error' ? SHOW_MS + 1800 : SHOW_MS);
    return () => clearTimeout(timer.current);
  }, [open, id, severity, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div key={id ?? 'toast'} role={severity === 'error' ? 'alert' : 'status'} aria-live={severity === 'error' ? 'assertive' : 'polite'}
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: -28, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, y: -22, scale: 0.97 }}
          transition={{ type: 'spring', stiffness: 420, damping: 32 }}
          drag={reduce ? false : 'y'} dragConstraints={{ top: 0, bottom: 0 }} dragElastic={{ top: 0.6, bottom: 0.1 }}
          onDragEnd={(_, info) => { if (info.offset.y < -24) onClose(); }}
          onClick={onClose}
          style={{
            position: 'fixed', zIndex: 2000, left: 0, right: 0, margin: '0 auto',
            top: 'calc(env(safe-area-inset-top, 0px) + 14px)', width: 'min(400px, calc(100vw - 24px))', cursor: 'pointer',
          }}>
          <Box sx={{
            display: 'flex', alignItems: 'center', gap: 1.25, px: 1.5, py: 1.25, borderRadius: '22px',
            color: dark ? '#f5f5f7' : '#0b0c0e',
            background: dark
              ? 'linear-gradient(180deg, rgba(44,44,48,0.72) 0%, rgba(28,28,31,0.66) 100%)'
              : 'linear-gradient(180deg, rgba(255,255,255,0.78) 0%, rgba(246,247,249,0.70) 100%)',
            backdropFilter: 'blur(30px) saturate(190%)', WebkitBackdropFilter: 'blur(30px) saturate(190%)',
            border: dark ? '1px solid rgba(255,255,255,0.12)' : '1px solid rgba(255,255,255,0.7)',
            boxShadow: dark
              ? '0 18px 48px -18px rgba(0,0,0,0.85), inset 0 1px 0 rgba(255,255,255,0.10)'
              : '0 18px 48px -18px rgba(10,12,16,0.35), 0 2px 6px rgba(10,12,16,0.05), inset 0 1px 0 rgba(255,255,255,0.95)',
          }}>
            <Box sx={{ position: 'relative', flexShrink: 0 }}>
              <Box component="img" src="/icons/icon-192.png" alt="" width={38} height={38} sx={{ display: 'block', borderRadius: '10px' }} />
              <Box sx={{
                position: 'absolute', right: -5, bottom: -5, width: 18, height: 18, borderRadius: '50%', bgcolor: tone.color,
                display: 'grid', placeItems: 'center', border: `2px solid ${dark ? '#1c1c1f' : '#ffffff'}`,
              }}>
                <tone.Icon sx={{ fontSize: 11, color: '#fff' }} />
              </Box>
            </Box>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 1 }}>
                <Typography sx={{ fontSize: '0.8rem', fontWeight: 700, lineHeight: 1.3 }}>{tone.title}</Typography>
                <Typography sx={{ fontSize: '0.66rem', color: dark ? 'rgba(245,245,247,0.5)' : 'rgba(11,12,14,0.45)', flexShrink: 0 }}>now</Typography>
              </Box>
              <Typography sx={{ fontSize: '0.78rem', lineHeight: 1.35, color: dark ? 'rgba(245,245,247,0.82)' : 'rgba(11,12,14,0.78)', overflowWrap: 'anywhere' }}>{message}</Typography>
            </Box>
          </Box>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
