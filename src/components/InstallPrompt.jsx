import { useState, useEffect, useSyncExternalStore } from 'react';
import { Box, ButtonBase, Typography, IconButton, useMediaQuery } from '@mui/material';
import { CloseRounded, IosShareRounded } from '@mui/icons-material';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { useFx } from './fx';
import { getInstallEvent, onInstallEvent, promptInstall, isStandalone } from '../lib/installPrompt';

const SNOOZE_KEY = 'fintraxa.install.snoozedUntil';
const SNOOZE_DAYS = 3;
const DELAY_MS = 3500; // not during the first paint
const snoozed = () => { try { return Number(localStorage.getItem(SNOOZE_KEY) || 0) > Date.now(); } catch { return false; } };
const snooze = () => { try { localStorage.setItem(SNOOZE_KEY, String(Date.now() + SNOOZE_DAYS * 86_400_000)); } catch { /* private mode: ask again next visit */ } };
const ua = () => (typeof navigator === 'undefined' ? '' : navigator.userAgent);
// iPhone / iPad Safari never fires beforeinstallprompt; it installs from the Share sheet.
const isIosSafari = () => /iphone|ipad|ipod/i.test(ua()) && /safari/i.test(ua()) && !/crios|fxios|edgios/i.test(ua());
// Safari on a Mac (17+) installs from File › Add to Dock, also without the event.
const isMacSafari = () => /macintosh/i.test(ua()) && /safari/i.test(ua()) && !/chrome|chromium|crios|edg|firefox|fxios|opr/i.test(ua()) && !('ontouchend' in document);

/**
 * "Install Fintraxa" card, on desktop and phones, a few seconds after the app opens.
 * Chrome / Edge / Brave hand over their install offer (caught at page load by
 * lib/installPrompt.js) and Install opens the browser's own dialog. Safari on iPhone
 * or Mac gets the two steps instead. "Not now" hides it for three days; an installed
 * app never sees it. Desktop: bottom-left (Xyro lives bottom-right). Phones: above the tab bar.
 */
export default function InstallPrompt() {
  const t = useFx();
  const reduce = useReducedMotion();
  const isMobile = useMediaQuery('(max-width:900px)');
  const offer = useSyncExternalStore(onInstallEvent, getInstallEvent, () => null);
  const [ready, setReady] = useState(false);
  const [closed, setClosed] = useState(() => isStandalone() || snoozed());

  useEffect(() => {
    const timer = setTimeout(() => setReady(true), DELAY_MS);
    const done = () => setClosed(true);
    window.addEventListener('appinstalled', done);
    return () => { clearTimeout(timer); window.removeEventListener('appinstalled', done); };
  }, []);

  const mode = closed || !ready ? null : offer ? 'prompt' : isIosSafari() ? 'ios' : isMacSafari() ? 'mac' : null;

  const install = async () => {
    const outcome = await promptInstall();
    setClosed(true);
    if (outcome !== 'accepted') snooze();
  };
  const dismiss = () => { snooze(); setClosed(true); };

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
              : { left: 24, bottom: 24, width: 380 }),
          }}>
          <Box sx={{
            display: 'flex', alignItems: 'center', gap: 1.5, p: 1.5, borderRadius: '20px',
            bgcolor: t.surface === '#ffffff' ? 'rgba(255,255,255,0.88)' : 'rgba(18,18,20,0.88)',
            backdropFilter: 'blur(24px) saturate(170%)', WebkitBackdropFilter: 'blur(24px) saturate(170%)',
            border: t.glass.border, boxShadow: t.shadowLg,
          }}>
            {/* The installed icon itself: the gold mark on black. */}
            <Box sx={{ width: 52, height: 52, borderRadius: '14px', bgcolor: '#000', flexShrink: 0, display: 'grid', placeItems: 'center', boxShadow: '0 6px 16px -8px rgba(0,0,0,.6)' }}>
              <Box component="img" src="/icons/icon-192.png" alt="" width={52} height={52} sx={{ borderRadius: '14px', display: 'block' }} />
            </Box>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography sx={{ fontSize: '0.88rem', fontWeight: 700, color: t.ink, lineHeight: 1.3 }}>Install Fintraxa</Typography>
              <Typography sx={{ fontSize: '0.71rem', color: t.muted, lineHeight: 1.4 }}>
                {mode === 'ios' && <>Tap <IosShareRounded sx={{ fontSize: 13, verticalAlign: '-2px' }} /> Share, then Add to Home Screen.</>}
                {mode === 'mac' && <>In Safari, choose File, then Add to Dock.</>}
                {mode === 'prompt' && (isMobile ? 'Open it from your home screen, full screen.' : 'Open it from your desktop, taskbar or dock, in its own window.')}
              </Typography>
              {mode === 'prompt' && (
                <Box sx={{ display: 'flex', gap: 0.75, mt: 1 }}>
                  <ButtonBase onClick={install} sx={{ height: 30, px: 1.75, borderRadius: 999, bgcolor: t.inv, color: t.invInk, fontSize: '0.74rem', fontWeight: 700, fontFamily: 'inherit' }}>
                    Install app
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
