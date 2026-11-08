import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Box, ButtonBase, Tooltip, useMediaQuery, useTheme } from '@mui/material';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { xyroTheme } from './theme';
import XyroOrb from './XyroOrb';
import XyroChat from './XyroChat';

/**
 * Xyro: the floating orb at the bottom right and the chat it opens, either as
 * a side window on the right or expanded to a large centred window. On phones
 * the chat is a full-screen sheet. Esc closes it. Other parts of the app can
 * open it with `window.dispatchEvent(new Event('fintraxa:open-xyro'))`.
 */
export default function XyroLauncher() {
  const mode = useTheme().palette.mode;
  const x = xyroTheme(mode);
  const isMobile = useMediaQuery('(max-width:768px)');
  const reduce = useReducedMotion();
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener('fintraxa:open-xyro', onOpen);
    return () => window.removeEventListener('fintraxa:open-xyro', onOpen);
  }, []);
  // Settings opened from inside the chat: step aside so the dialog is not covered.
  useEffect(() => {
    const onSettings = () => setOpen(false);
    window.addEventListener('fintraxa:open-settings', onSettings);
    return () => window.removeEventListener('fintraxa:open-settings', onSettings);
  }, []);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape' && !e.defaultPrevented) setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const full = isMobile;
  const big = !full && expanded;
  const ease = reduce ? { duration: 0 } : { type: 'spring', stiffness: 380, damping: 36, mass: 0.9 };
  const panelSx = full
    ? { inset: 0, borderRadius: 0 }
    : big
      ? { inset: 0, m: 'auto', width: 'min(980px, calc(100vw - 48px))', height: 'min(860px, calc(100dvh - 48px))', borderRadius: '28px' }
      : { top: 12, right: 12, bottom: 12, width: 'min(420px, calc(100vw - 24px))', borderRadius: '24px' };

  return createPortal(
    <>
      <AnimatePresence>
        {!open && (
          <motion.div key="xyro-orb" initial={reduce ? false : { scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={reduce ? { opacity: 0 } : { scale: 0.6, opacity: 0 }} transition={ease}
            style={{ position: 'fixed', right: isMobile ? 16 : 24, bottom: isMobile ? 'calc(76px + env(safe-area-inset-bottom, 0px) + 72px)' : 24, zIndex: 1300 }}>
            <Tooltip title="Ask Xyro" placement="left" arrow>
              <ButtonBase onClick={() => setOpen(true)} aria-label="Open Xyro, your money assistant" aria-haspopup="dialog"
                sx={{
                  width: 60, height: 60, borderRadius: '50%', display: 'grid', placeItems: 'center',
                  bgcolor: x.glass, border: `1px solid ${x.glassBorder}`, backdropFilter: x.blur, WebkitBackdropFilter: x.blur,
                  boxShadow: mode === 'dark' ? '0 14px 34px -10px rgba(0,0,0,0.9), 0 0 0 1px rgba(255,255,255,0.04)' : '0 14px 34px -12px rgba(40,60,120,0.45)',
                  transition: 'transform .2s', '&:hover': { transform: 'translateY(-2px)' }, '&:active': { transform: 'scale(0.96)' },
                  '&:focus-visible': { outline: `2px solid ${x.accent}`, outlineOffset: 3 },
                }}>
                <XyroOrb size={46} animated />
              </ButtonBase>
            </Tooltip>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {open && big && (
          <motion.div key="xyro-scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={reduce ? { duration: 0 } : { duration: 0.2 }}
            onClick={() => setExpanded(false)}
            style={{ position: 'fixed', inset: 0, zIndex: 1299, background: mode === 'dark' ? 'rgba(0,0,0,0.55)' : 'rgba(20,20,40,0.18)', backdropFilter: 'blur(3px)' }} />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {open && (
          <Box key="xyro-panel" component={motion.section} role="dialog" aria-label="Xyro chat" aria-modal={big || full ? true : undefined}
            initial={reduce ? false : full ? { y: '100%' } : big ? { opacity: 0, scale: 0.96 } : { opacity: 0, x: 40 }}
            animate={full ? { y: 0 } : { opacity: 1, x: 0, scale: 1 }}
            exit={reduce ? { opacity: 0 } : full ? { y: '100%' } : big ? { opacity: 0, scale: 0.96 } : { opacity: 0, x: 40 }}
            transition={ease}
            sx={{
              position: 'fixed', zIndex: 1300, overflow: 'hidden', display: 'flex', flexDirection: 'column',
              border: full ? 0 : `1px solid ${x.glassBorder}`, boxShadow: x.shadow, bgcolor: x.glass,
              backdropFilter: x.blur, WebkitBackdropFilter: x.blur, ...panelSx,
            }}>
            <XyroChat expanded={big} isMobile={isMobile} onToggleExpand={() => setExpanded((v) => !v)} onClose={() => setOpen(false)} />
          </Box>
        )}
      </AnimatePresence>
    </>,
    document.body,
  );
}
