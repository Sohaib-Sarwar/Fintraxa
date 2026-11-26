import { useEffect, useState } from 'react';
import { Box, Dialog, DialogContent, Typography, ButtonBase } from '@mui/material';
import { TimerOutlined } from '@mui/icons-material';
import { useFx, FONT_NUM } from './fx';
import { countdown } from '../lib/session/policy';
import { useSessionGuard } from '../lib/session/useSessionGuard';

/**
 * "Are you still there?" (banking-app pattern, 2026-11-26): one minute before an idle sign-out, with the countdown,
 * "Stay signed in" (focused) and "Sign out". Mounted once in AppLayout; the rules live in useSessionGuard / policy.js.
 */
export default function SessionTimeoutDialog() {
  const t = useFx();
  const { warnUntil, stay, signOutNow } = useSessionGuard();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (warnUntil === null) return undefined;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [warnUntil]);

  const open = warnUntil !== null;
  const left = open ? Math.max(0, warnUntil - now) : 0;
  return (
    <Dialog open={open} onClose={stay} maxWidth="xs" fullWidth aria-labelledby="session-timeout-title" aria-describedby="session-timeout-text"
      slotProps={{ paper: { sx: { borderRadius: '24px', bgcolor: t.surface, backgroundImage: 'none' } } }}>
      <DialogContent sx={{ p: 3, textAlign: 'center' }}>
        <Box sx={{ width: 52, height: 52, borderRadius: '50%', bgcolor: t.surface2, display: 'grid', placeItems: 'center', mx: 'auto', mb: 1.5 }}>
          <TimerOutlined sx={{ fontSize: 26, color: t.ink }} />
        </Box>
        <Typography id="session-timeout-title" sx={{ fontSize: '1.08rem', fontWeight: 750 }}>Are you still there?</Typography>
        <Typography id="session-timeout-text" sx={{ fontSize: '0.82rem', color: t.muted, mt: 0.5 }}>
          For your security, you’ll be signed out after 15 minutes without activity.
        </Typography>
        <Typography role="timer" aria-live="off" data-numeric sx={{ fontFamily: FONT_NUM, fontSize: '2.4rem', fontWeight: 650, letterSpacing: '-0.04em', my: 1.25 }}>
          {countdown(left)}
        </Typography>
        <Box sx={{ display: 'flex', gap: 1, justifyContent: 'center' }}>
          <ButtonBase onClick={signOutNow}
            sx={{ height: 42, px: 2.25, borderRadius: 999, border: `1px solid ${t.border}`, fontSize: '0.82rem', fontWeight: 650, fontFamily: 'inherit', color: t.ink }}>
            Sign out
          </ButtonBase>
          <ButtonBase onClick={stay} autoFocus
            sx={{ height: 42, px: 2.75, borderRadius: 999, bgcolor: t.inv, color: t.invInk, fontSize: '0.82rem', fontWeight: 700, fontFamily: 'inherit' }}>
            Stay signed in
          </ButtonBase>
        </Box>
      </DialogContent>
    </Dialog>
  );
}
