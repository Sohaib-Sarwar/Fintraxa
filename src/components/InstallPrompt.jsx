import { useState, useEffect } from 'react';
import { Box, ButtonBase, Typography, IconButton, useMediaQuery } from '@mui/material';
import { CloseRounded, IosShareRounded } from '@mui/icons-material';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { useFx } from './fx';

const SNOOZE_KEY = 'fintraxa.install.snoozedUntil';
const SNOOZE_DAYS = 14;
const snoozed = () => { try { return Number(localStorage.getItem(SNOOZE_KEY) || 0) > Date.now(); } catch { return false; } };
const snooze = () => { try { localStorage.setItem(SNOOZE_KEY, String(Date.now() + SNOOZE_DAYS * 86_400_000)); } catch { /* private mode: ask again next visit */ } };
const standalone = () => window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
// iPhone / iPad Safari never fires beforeinstallprompt; it installs from the Share sheet.
const isIosSafari = () => /iphone|ipad|ipod/i.test(navigator.userAgent) && /safari/i.test(navigator.userAgent) && !/crios|fxios|edgios/i.test(navigator.userAgent);

/**
 * "Install Fintraxa" card, on desktop and phones. Chromium browsers hand us
 * their install prompt (beforeinstallprompt) and the card's button opens it;
 * on iOS Safari the card explains Share, then Add to Home Screen. "Not now"
 * hides it for two weeks; an installed app never sees it.
 * Desktop: bottom-left (Xyro lives bottom-right). Phones: above the tab bar.
 */
export default function InstallPrompt() {
  const t = useFx();
  const reduce = useReducedMotion();
  const isMobile = useMediaQuery('(max-width:900px)');
  const [deferred, setDeferred] = useState(null);
  const [mode, setMode] = useState(null); // null | 'prompt' | 'ios'

  useEffect(() => {
    if (standalone() || snoozed()) return undefined;
    let timer;
    const handler = (e) => {
      e.preventDefault();
      setDeferred(e);
      timer = setTimeout(() => setMode('prompt'), 4000); // not during the first paint
    };
    const installed = () => { setMode(null); setDeferred(null); };
    window.addEventListener('beforeinstallprompt', handler);
    window.addEventListener('appinstalled', installed);
    if (isIosSafari()) timer = setTimeout(() => setMode('ios'), 4000);
    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
      window.removeEventListener('appinstalled', installed);
      clearTimeout(timer);
    };
  }, []);

  const install = async () => {
    if (!deferred) return;
    deferred.prompt();
    const { outcome } = await deferred.userChoice;
    setDeferred(null);
    setMode(null);
    if (outcome !== 'accepted') snooze();
  };
  const dismiss = () => { snooze(); setMode(null); };

  return (
    <AnimatePresence>
      {mode && (
        <motion.div role="dialog" aria-label="Install Fintraxa"
          initial={reduce ? false : { opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={reduce ? { opacity: 0 } : { opacity: 0, y: 24 }}
          transition={{ type: 'spring', damping: 26, stiffness: 300 }}
          style={{
            position: 'fixed', zIndex: 1400,
            ...(isMobile
              ? { left: 12, right: 12, bottom: 'calc(env(safe-area-inset-bottom, 0px) + 76px)' }
              : { left: 24, bottom: 24, width: 360 }),
          }}>
          <Box sx={{
            display: 'flex', alignItems: 'center', gap: 1.5, p: 1.5, borderRadius: '20px',
            bgcolor: t.surface === '#ffffff' ? 'rgba(255,255,255,0.86)' : 'rgba(18,18,20,0.86)',
            backdropFilter: 'blur(24px) saturate(170%)', WebkitBackdropFilter: 'blur(24px) saturate(170%)',
            border: t.glass.border, boxShadow: t.shadowLg,
          }}>
            {/* The installed icon itself: the gold mark on black. */}
            <Box component="img" src="/icons/icon-192.png" alt="" width={48} height={48} sx={{ borderRadius: '12px', flexShrink: 0, display: 'block' }} />
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography sx={{ fontSize: '0.86rem', fontWeight: 700, color: t.ink, lineHeight: 1.3 }}>Install Fintraxa</Typography>
              <Typography sx={{ fontSize: '0.7rem', color: t.muted, lineHeight: 1.35 }}>
                {mode === 'ios'
                  ? <>Tap <IosShareRounded sx={{ fontSize: 13, verticalAlign: '-2px' }} /> Share, then Add to Home Screen.</>
                  : isMobile ? 'Open it from your home screen, full screen.' : 'Open it from your desktop or dock, in its own window.'}
              </Typography>
              {mode === 'prompt' && (
                <Box sx={{ display: 'flex', gap: 0.75, mt: 1 }}>
                  <ButtonBase onClick={install} sx={{ height: 30, px: 1.75, borderRadius: 999, bgcolor: t.inv, color: t.invInk, fontSize: '0.74rem', fontWeight: 700, fontFamily: 'inherit' }}>
                    Install
                  </ButtonBase>
                  <ButtonBase onClick={dismiss} sx={{ height: 30, px: 1.5, borderRadius: 999, ...t.glass, color: t.ink2, fontSize: '0.74rem', fontWeight: 650, fontFamily: 'inherit' }}>
                    Not now
                  </ButtonBase>
                </Box>
              )}
            </Box>
            <IconButton onClick={dismiss} size="small" aria-label="Close" sx={{ alignSelf: 'flex-start', flexShrink: 0 }}>
              <CloseRounded sx={{ fontSize: 18, color: t.muted }} />
            </IconButton>
          </Box>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
