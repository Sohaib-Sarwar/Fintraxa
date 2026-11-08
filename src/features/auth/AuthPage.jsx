import { useState, useEffect, useRef, useSyncExternalStore } from 'react';
import { Box, Button, Typography, Alert, CircularProgress, IconButton, InputBase, useMediaQuery } from '@mui/material';
import { User, Eye, EyeOff, Mail, Download, Share, X, ArrowRight } from 'lucide-react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { useAuthStore } from '../../store/authStore';

/* Backdrop: one of several night, sea, space and leaf photos (Unsplash, free
   to use), picked at random on each visit: see ./backdrops.js and
   scripts/build-auth-bg.mjs. */
import { pickBackdrop } from './backdrops';
import { getInstallEvent, onInstallEvent, promptInstall } from '../../lib/installPrompt';

/** The Fintraxa mark on its own (transparent PNG), centred. */
function Mark({ size }) {
  return <Box component="img" src="/brand/mark-256.png" alt="Fintraxa" width={size} height={size}
    sx={{ display: 'block', mx: 'auto', objectFit: 'contain', filter: 'drop-shadow(0 10px 24px rgba(0,0,0,0.45))' }} />;
}

const EASE = [0.65, 0, 0.35, 1];
/** Hover fill: `fill` sweeps across from the left and the text turns `ink`. */
const sweep = (fill, ink) => ({
  position: 'relative', overflow: 'hidden', isolation: 'isolate',
  '&::before': {
    content: '""', position: 'absolute', inset: 0, zIndex: -1, bgcolor: fill,
    transform: 'scaleX(0)', transformOrigin: 'left center', transition: 'transform .38s cubic-bezier(.65,0,.35,1)',
  },
  transition: 'color .38s cubic-bezier(.65,0,.35,1)',
  '@media (hover: hover)': { '&:hover': { color: ink, '&::before': { transform: 'scaleX(1)' } } },
  '&:focus-visible': { color: ink, '&::before': { transform: 'scaleX(1)' } },
  '@media (prefers-reduced-motion: reduce)': { '&::before': { transition: 'none' }, transition: 'none' },
});
const SLIDE_S = 0.7;

const getFriendlyAuthError = (error, isSignUp) => {
  const raw = (error?.message || '').toLowerCase();
  if (!raw) return isSignUp ? 'Could not create the account. Try again.' : 'Could not sign in. Try again.';
  if (raw.includes('invalid login credentials')) return 'Incorrect email or password.';
  if (raw.includes('email not confirmed')) return 'Verify your email before signing in.';
  if (raw.includes('user already registered') || raw.includes('already been registered')) return 'This email already has an account. Sign in instead.';
  if (raw.includes('password') && (raw.includes('weak') || raw.includes('least'))) return 'Password is too weak. Use at least 6 characters.';
  if (raw.includes('invalid email') || raw.includes('unable to validate email')) return 'Enter a valid email address.';
  if (raw.includes('too many requests') || raw.includes('rate limit')) return 'Too many attempts. Wait a moment and try again.';
  if (raw.includes('network') || raw.includes('fetch')) {
    return typeof navigator !== 'undefined' && navigator.onLine === false
      ? 'You appear to be offline. Check your connection.'
      : 'Cannot reach the sign-in server. Check your connection and try again.';
  }
  return isSignUp ? 'Account creation failed. Check your details and try again.' : 'Sign in failed. Check your details and try again.';
};

/** An underlined field, like the reference: text on a single line, the line turns green on focus. */
function Field({ icon, error, ...props }) {
  return (
    <Box>
      <Box sx={{
        display: 'flex', alignItems: 'center', gap: 1, borderBottom: `1px solid ${error ? 'rgba(248,113,113,0.8)' : 'rgba(255,255,255,0.28)'}`,
        transition: 'border-color .2s ease', '&:focus-within': { borderColor: error ? '#f87171' : '#fff' },
      }}>
        <InputBase fullWidth {...props} sx={{
          color: '#fff', fontSize: '0.88rem', py: 1.1,
          '& input::placeholder': { color: 'rgba(255,255,255,0.55)', opacity: 1 },
          // Chrome's autofill slab would break the glass: paint it back to the card's colour.
          '& input:-webkit-autofill': { WebkitBoxShadow: '0 0 0 1000px rgba(12,18,14,0.98) inset', WebkitTextFillColor: '#fff', caretColor: '#fff' },
        }} />
        <Box sx={{ color: 'rgba(255,255,255,0.5)', display: 'flex', flexShrink: 0 }}>{icon}</Box>
      </Box>
      <Typography role={error ? 'alert' : undefined} sx={{ minHeight: 18, fontSize: '0.68rem', color: '#fca5a5', mt: 0.4 }}>{error || ''}</Typography>
    </Box>
  );
}

export default function AuthPage() {
  const reduce = useReducedMotion();
  const [bg] = useState(pickBackdrop); // chosen once per visit
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showConfirmPw, setShowConfirmPw] = useState(false);
  const [fullName, setFullName] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [showPw, setShowPw] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(null); // { title, text } shown as a glass notification
  // The browser's install offer, caught at page load (lib/installPrompt.js).
  const deferredPrompt = useSyncExternalStore(onInstallEvent, getInstallEvent, () => null);
  const [installDismissed, setInstallDismissed] = useState(false);
  const signIn = useAuthStore((s) => s.signIn);
  const signInWithUsername = useAuthStore((s) => s.signInWithUsername);
  const signUp = useAuthStore((s) => s.signUp);
  const resetPassword = useAuthStore((s) => s.resetPassword);

  const isMobile = useMediaQuery('(max-width:900px)');
  const isStandalone = typeof window !== 'undefined' && window.matchMedia('(display-mode: standalone)').matches;
  const isIOS = typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent);
  const showInstall = isMobile && !isStandalone && !installDismissed;

  const handleInstallClick = async () => {
    if ((await promptInstall()) === 'accepted') setInstallDismissed(true);
  };


  const validateForm = () => {
    const next = {};
    const em = email.trim();
    if (isSignUp && !fullName.trim()) next.fullName = 'Enter your name';
    // Sign-in takes an email or a username; sign-up needs an email.
    const byUsername = !isSignUp && em && !em.includes('@');
    if (!em) next.email = isSignUp ? 'Enter your email' : 'Enter your email or username';
    else if (byUsername && !/^[a-z0-9][a-z0-9._]{1,22}[a-z0-9]$/i.test(em)) next.email = 'Usernames are 3 to 24 letters, numbers, dots or underscores';
    else if (!byUsername && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) next.email = 'Enter a valid email';
    if (!password.trim()) next.password = 'Enter your password';
    else if (password.length < 6) next.password = 'Use at least 6 characters';
    if (isSignUp && !confirmPassword) next.confirmPassword = 'Confirm your password';
    else if (isSignUp && confirmPassword !== password) next.confirmPassword = 'Passwords do not match';
    return next;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(''); setSuccess(null); setFieldErrors({});
    const next = validateForm();
    if (Object.keys(next).length) { setFieldErrors(next); return; }
    setLoading(true);
    try {
      const em = email.trim().toLowerCase();
      if (isSignUp) {
        await signUp(em, password, fullName);
        setSuccess({ title: 'Account created', text: 'Check your email to confirm it, then sign in.' });
        setIsSignUp(false);
      } else if (!em.includes('@')) {
        await signInWithUsername(em, password);
      } else {
        await signIn(em, password);
      }
    } catch (err) {
      console.error('[Fintraxa Auth]', err?.message || err);
      setError(err?.friendly ? err.message : getFriendlyAuthError(err, isSignUp));
    } finally { setLoading(false); }
  };

  /* Supabase answers the same whether or not the address has an account, so the
     message does not say which: "no account found" would leak who is registered. */
  const handleForgotPassword = async () => {
    const em = email.trim().toLowerCase();
    setError(''); setSuccess(null);
    if (!em || !/\S+@\S+\.\S+/.test(em)) { setFieldErrors({ email: 'Enter your email first, then tap Forgot password' }); return; }
    setResetting(true);
    try { await resetPassword(em); setSuccess({ title: 'Check your inbox', text: 'If that email has an account, a reset link is on its way.' }); } catch (err) {
      console.error('[Fintraxa Auth] reset', err?.message || err);
      setError('Could not send the reset email. Try again shortly.');
    } finally { setResetting(false); }
  };

  const switchTo = (up) => {
    if (up === isSignUp) return;
    setIsSignUp(up);
    setError(''); setSuccess(null); setFieldErrors({});
    setPassword(''); setShowPw(false); setConfirmPassword(''); setShowConfirmPw(false);
  };
  const clearField = (k) => setFieldErrors((prev) => (prev[k] ? { ...prev, [k]: '' } : prev));

  const notices = (
    <Box role="status" aria-live="polite">
      <AnimatePresence>
        {error && (
          <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <Alert severity="error" sx={{ mb: 2, borderRadius: 2, bgcolor: 'rgba(239,68,68,0.14)', color: '#fca5a5', border: '1px solid rgba(239,68,68,0.3)', fontSize: '0.76rem', '& .MuiAlert-icon': { color: '#fca5a5' } }}>{error}</Alert>
          </motion.div>
        )}
      </AnimatePresence>
    </Box>
  );

  /** One form; `up` picks sign-up or sign-in fields. */
  const form = (up) => (
    <Box component="form" onSubmit={handleSubmit} noValidate sx={{ width: '100%', maxWidth: 320 }}>
      <Typography component="h1" sx={{ fontSize: '1.55rem', fontWeight: 750, color: '#fff', letterSpacing: '-0.02em', mb: 2.5 }}>
        {up ? 'Sign up' : 'Sign in'}
      </Typography>
      {notices}
      {up && (
        <Field placeholder="Your name" value={fullName} autoComplete="name" icon={<User size={16} />} error={fieldErrors.fullName}
          onChange={(e) => { setFullName(e.target.value); clearField('fullName'); }} inputProps={{ 'aria-label': 'Your name' }} />
      )}
      <Field placeholder={up ? 'Your email' : 'Email or username'} type={up ? 'email' : 'text'} value={email} autoComplete={up ? 'email' : 'username'}
        icon={<Mail size={16} />} error={fieldErrors.email}
        onChange={(e) => { setEmail(e.target.value); clearField('email'); }}
        inputProps={{ 'aria-label': up ? 'Email address' : 'Email or username', autoCapitalize: 'none', spellCheck: false }} />
      <Field placeholder={up ? 'Create password' : 'Password'} type={showPw ? 'text' : 'password'} value={password}
        autoComplete={up ? 'new-password' : 'current-password'} error={fieldErrors.password}
        onChange={(e) => { setPassword(e.target.value); clearField('password'); }} inputProps={{ 'aria-label': 'Password' }}
        icon={(
          <IconButton onClick={() => setShowPw((v) => !v)} size="small" aria-label={showPw ? 'Hide password' : 'Show password'} sx={{ color: 'rgba(255,255,255,0.6)', p: '4px', mr: '-4px' }}>
            {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
          </IconButton>
        )} />
      {up && (
        <Field placeholder="Confirm password" type={showConfirmPw ? 'text' : 'password'} value={confirmPassword} autoComplete="new-password"
          error={fieldErrors.confirmPassword} inputProps={{ 'aria-label': 'Confirm password' }}
          onChange={(e) => { setConfirmPassword(e.target.value); clearField('confirmPassword'); }}
          icon={(
            <IconButton onClick={() => setShowConfirmPw((v) => !v)} size="small" aria-label={showConfirmPw ? 'Hide password' : 'Show password'} sx={{ color: 'rgba(255,255,255,0.6)', p: '4px', mr: '-4px' }}>
              {showConfirmPw ? <EyeOff size={16} /> : <Eye size={16} />}
            </IconButton>
          )} />
      )}
      {!up && (
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: -0.5 }}>
          <Button type="button" onClick={handleForgotPassword} disabled={resetting || loading}
            sx={{ p: 0, minWidth: 0, textTransform: 'none', fontSize: '0.74rem', fontWeight: 500, color: 'rgba(255,255,255,0.7)', '&:hover': { color: '#fff', bgcolor: 'transparent' } }}>
            {resetting ? 'Sending…' : 'Forgot password?'}
          </Button>
        </Box>
      )}
      <Button fullWidth type="submit" disabled={loading} endIcon={loading ? null : <ArrowRight size={16} />}
        sx={{
          mt: 2.25, py: '11px', borderRadius: '6px', textTransform: 'none', fontSize: '0.9rem', fontWeight: 700,
          color: '#000', bgcolor: '#fff', border: '1px solid #fff', boxShadow: '0 10px 26px -12px rgba(0,0,0,0.6)',
          ...sweep('#000', '#fff'),
          '&:hover': { bgcolor: '#fff' }, '&:active': { transform: 'translateY(1px)' },
          '&.Mui-disabled': { bgcolor: 'rgba(255,255,255,0.55)', color: 'rgba(0,0,0,0.6)' },
        }}>
        {loading ? <CircularProgress size={18} sx={{ color: '#000' }} /> : (up ? 'Sign up' : 'Sign in')}
      </Button>
      <Typography sx={{ mt: 2, textAlign: 'center', fontSize: '0.78rem', color: 'rgba(255,255,255,0.7)' }}>
        {up ? 'Already a member?' : 'New to Fintraxa?'}{' '}
        <Box component="button" type="button" onClick={() => switchTo(!up)} sx={{
          all: 'unset', cursor: 'pointer', color: '#fff', fontWeight: 700, px: 0.75, py: '2px', borderRadius: '4px',
          boxShadow: 'inset 0 -1px 0 rgba(255,255,255,0.7)', ...sweep('#fff', '#000'),
        }}>
          {up ? 'Sign in here' : 'Create an account'}
        </Box>
      </Typography>
    </Box>
  );

  const backdrop = {
    minHeight: '100dvh', position: 'relative', overflow: 'hidden', bgcolor: '#030604',
    backgroundImage: `url(${isMobile ? bg.mobile : bg.desktop}), url(${bg.lqip})`,
    backgroundSize: 'cover, cover', backgroundPosition: 'center, center', backgroundRepeat: 'no-repeat, no-repeat',
  };
  const glass = { bgcolor: 'rgba(4,8,6,0.62)', backdropFilter: 'blur(18px) saturate(140%)', WebkitBackdropFilter: 'blur(18px) saturate(140%)', border: '1px solid rgba(255,255,255,0.08)' };
  const headline = (up) => (up
    ? { title: "Let's get started", line: 'Track spending, funds and shares in one place.' }
    : { title: 'Welcome back', line: 'Your money, right where you left it.' });

  /* ─── Phones: one card; the form slides left for Sign up, right for Sign in. ─── */
  if (isMobile) {
    const h = headline(isSignUp);
    return (
      <Box component="main" sx={{ ...backdrop, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2, px: 2, py: 4 }}>
        <GlassNotice notice={success} onClose={() => setSuccess(null)} />
        <Mark size={84} />
        <Box sx={{ ...glass, width: '100%', maxWidth: 400, borderRadius: '18px', px: 3, py: 3.25, overflow: 'hidden' }}>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={isSignUp ? 'up' : 'in'}
              initial={reduce ? { opacity: 0 } : { opacity: 0, x: isSignUp ? 40 : -40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, x: isSignUp ? -40 : 40 }}
              transition={{ duration: 0.35, ease: EASE }}>
              <Typography sx={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.6)', mb: 1 }}>{h.line}</Typography>
              {form(isSignUp)}
            </motion.div>
          </AnimatePresence>
        </Box>
        <AnimatePresence>
          {showInstall && (
            <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 14 }} transition={{ delay: 0.3, duration: 0.3 }} style={{ width: '100%', maxWidth: 400 }}>
              <Box sx={{ ...glass, borderRadius: '14px', p: 1.25, pl: 1.5, display: 'flex', alignItems: 'center', gap: 1.25 }}>
                <Box component="img" src="/icons/icon-192.png" alt="" width={36} height={36} sx={{ borderRadius: '9px', flexShrink: 0, display: 'block' }} />
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography sx={{ fontSize: '0.78rem', fontWeight: 700, color: '#fff', lineHeight: 1.3 }}>Install as app</Typography>
                  {isIOS
                    ? <Typography component="span" sx={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.6)', display: 'flex', alignItems: 'center', gap: 0.4, flexWrap: 'wrap' }}>Tap <Share size={12} /> then <strong>Add to Home Screen</strong></Typography>
                    : <Typography sx={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.55)' }}>{deferredPrompt ? 'Full screen, from your home screen' : 'Use the browser menu, then Install app'}</Typography>}
                </Box>
                {!isIOS && deferredPrompt && (
                  <Button onClick={handleInstallClick} size="small" startIcon={<Download size={14} />}
                    sx={{ borderRadius: '6px', px: 1.5, py: 0.5, minWidth: 'auto', fontSize: '0.7rem', fontWeight: 700, textTransform: 'none', bgcolor: '#fff', color: '#000', ...sweep('#000', '#fff'), '&:hover': { bgcolor: '#fff' } }}>
                    Install
                  </Button>
                )}
                <IconButton onClick={() => setInstallDismissed(true)} size="small" aria-label="Dismiss install prompt" sx={{ color: 'rgba(255,255,255,0.55)', p: '5px' }}><X size={14} /></IconButton>
              </Box>
            </motion.div>
          )}
        </AnimatePresence>
      </Box>
    );
  }

  /* ─── Desktop: one card in two halves. The headline panel slides left for
         Sign up (form on the right) and right for Sign in (form on the left). ─── */
  const slide = reduce ? 'none' : `transform ${SLIDE_S}s cubic-bezier(${EASE.join(',')})`;
  const half = (up) => ({
    position: 'absolute', top: 0, bottom: 0, width: '50%', [up ? 'right' : 'left']: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center', px: 5,
    opacity: isSignUp === up ? 1 : 0, transform: isSignUp === up ? 'none' : `translateX(${up ? '-24px' : '24px'})`,
    transition: reduce ? 'none' : `opacity .35s ease ${isSignUp === up ? SLIDE_S * 0.45 : 0}s, transform .45s ease ${isSignUp === up ? SLIDE_S * 0.45 : 0}s`,
    pointerEvents: isSignUp === up ? 'auto' : 'none',
  });
  return (
    <Box component="main" sx={{ ...backdrop, display: 'grid', placeItems: 'center', p: 4 }}>
      <GlassNotice notice={success} onClose={() => setSuccess(null)} />
      <Box component={motion.div} initial={reduce ? false : { opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE }}
        sx={{ ...glass, position: 'relative', width: 'min(960px, 100%)', height: 'min(600px, calc(100dvh - 64px))', minHeight: 540, borderRadius: '14px', overflow: 'hidden', boxShadow: '0 40px 100px -30px rgba(0,0,0,0.85)' }}>
        <Box sx={half(false)} aria-hidden={isSignUp} inert={isSignUp}>{form(false)}</Box>
        <Box sx={half(true)} aria-hidden={!isSignUp} inert={!isSignUp}>{form(true)}</Box>

        {/* The headline panel: over the form that is not in use, sliding across. */}
        <Box sx={{
          position: 'absolute', top: 0, bottom: 0, left: 0, width: '50%', zIndex: 2, overflow: 'hidden',
          transform: isSignUp ? 'translateX(0)' : 'translateX(100%)', transition: slide, willChange: 'transform',
          borderRight: isSignUp ? '1px solid rgba(255,255,255,0.08)' : 0, borderLeft: isSignUp ? 0 : '1px solid rgba(255,255,255,0.08)',
        }}>
          {/* The leaves behind the card, blurred, so the panel reads as frosted glass over the plant. */}
          <Box aria-hidden sx={{ position: 'absolute', inset: '-40px', backgroundImage: `url(${bg.desktop})`, backgroundSize: 'cover', backgroundPosition: 'left center', filter: 'blur(22px) brightness(0.55) saturate(1.1)' }} />
          <Box aria-hidden sx={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(0,0,0,0.25), rgba(0,0,0,0.55))' }} />
          {/* The mark, large and centred, with the headline under it. */}
          <Box sx={{ position: 'relative', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', p: 5, gap: 3.5 }}>
            <Mark size={128} />
            <AnimatePresence mode="wait" initial={false}>
              <motion.div key={isSignUp ? 'up' : 'in'}
                initial={reduce ? { opacity: 0 } : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={reduce ? { opacity: 0 } : { opacity: 0, y: -12 }}
                transition={{ duration: 0.35, ease: EASE, delay: 0.1 }}>
                <Typography component="h2" sx={{ fontSize: '2.6rem', fontWeight: 800, color: '#fff', letterSpacing: '-0.03em', lineHeight: 1.05 }}>
                  {headline(isSignUp).title}
                </Typography>
                <Typography sx={{ mt: 1.5, fontSize: '0.95rem', color: 'rgba(255,255,255,0.78)', maxWidth: 330, mx: 'auto' }}>{headline(isSignUp).line}</Typography>
              </motion.div>
            </AnimatePresence>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}

/**
 * A frosted-glass notification at the top: a check that draws itself, a title
 * and one line. Closes on its own after a few seconds, or with the ✕.
 */
function GlassNotice({ notice, onClose }) {
  const reduce = useReducedMotion();
  const timer = useRef(null);
  useEffect(() => {
    if (!notice) return undefined;
    clearTimeout(timer.current);
    timer.current = setTimeout(onClose, 6000);
    return () => clearTimeout(timer.current);
  }, [notice, onClose]);
  return (
    <AnimatePresence>
      {notice && (
        <motion.div role="status" aria-live="polite"
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: -24, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, y: -16 }} transition={{ type: 'spring', stiffness: 380, damping: 30 }}
          style={{ position: 'fixed', top: 'calc(env(safe-area-inset-top, 0px) + 20px)', left: 0, right: 0, margin: '0 auto', width: 'min(400px, calc(100vw - 32px))', zIndex: 50 }}>
          <Box sx={{
            display: 'flex', alignItems: 'center', gap: 1.5, p: 1.5, pr: 1, borderRadius: '16px', color: '#fff',
            background: 'linear-gradient(135deg, rgba(255,255,255,0.16), rgba(255,255,255,0.06))',
            backdropFilter: 'blur(22px) saturate(160%)', WebkitBackdropFilter: 'blur(22px) saturate(160%)',
            border: '1px solid rgba(255,255,255,0.22)', boxShadow: '0 20px 50px -20px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.25)',
          }}>
            <Box sx={{ width: 36, height: 36, borderRadius: '50%', display: 'grid', placeItems: 'center', bgcolor: 'rgba(255,255,255,0.14)', flexShrink: 0 }}>
              <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden>
                <motion.path d="M5 12.5 L10 17.5 L19 7.5" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"
                  initial={{ pathLength: reduce ? 1 : 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.45, delay: 0.15, ease: 'easeOut' }} />
              </svg>
            </Box>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography sx={{ fontSize: '0.86rem', fontWeight: 700, lineHeight: 1.3 }}>{notice.title}</Typography>
              <Typography sx={{ fontSize: '0.74rem', color: 'rgba(255,255,255,0.75)', lineHeight: 1.4 }}>{notice.text}</Typography>
            </Box>
            <IconButton onClick={onClose} size="small" aria-label="Close notification" sx={{ color: 'rgba(255,255,255,0.7)', alignSelf: 'flex-start' }}><X size={15} /></IconButton>
          </Box>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
