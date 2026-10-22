import { useState, useEffect, useMemo } from 'react';
import {
  Box, TextField, Button, Typography, Alert, CircularProgress,
  InputAdornment, IconButton, useMediaQuery, Link,
} from '@mui/material';
import {
  User, Eye, EyeOff, Mail,
  LayoutDashboard, PieChart, CandlestickChart, Sparkles, ShieldCheck,
  Check, Circle, Download, Smartphone, Share, X, ArrowRight,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuthStore } from '../../store/authStore';
import FintraxaLogo from '../../components/FintraxaLogo';
import GlassPanel from '../../components/GlassPanel';
import { Reveal, ShinyText } from '../../components/motion';

/* The plate generated for this screen. Two crops: the 16:9 original for wide
   viewports, and a portrait cut framed on the teal bloom for phones, where
   centre-cropping the wide one would land on empty black. */
const BG_DESKTOP = '/login-bg.webp';
const BG_MOBILE = '/login-bg-mobile.webp';

/* A 20px blur of the plate, inlined. It paints on the first frame, so the
   screen fades from roughly the right colours into the photograph instead of
   flashing black — and it costs ~0.1 kB rather than a request. */
const BG_LQIP = 'data:image/webp;base64,UklGRkgAAABXRUJQVlA4IDwAAABwAwCdASoUAAsAPu1iqU2ppaOiMAgBMB2JZwDA3DKKybYaDQAA/vB1yqiz2y6S/WuqwwOT4';

const pillInput = {
  '& .MuiInputBase-root': { minHeight: 46 },
  '& .MuiOutlinedInput-root': {
    borderRadius: '36px',
    bgcolor: 'rgba(255,255,255,0.05)',
    color: '#fff',
    fontSize: '0.84rem',
    transition: 'background-color .2s ease, box-shadow .2s ease',
    '& fieldset': { borderColor: 'rgba(255,255,255,0.22)', borderRadius: '36px', transition: 'border-color .2s ease' },
    '&:hover fieldset': { borderColor: 'rgba(255,255,255,0.42)' },
    '&.Mui-focused': { bgcolor: 'rgba(255,255,255,0.08)', boxShadow: '0 0 0 3px rgba(13,148,136,0.28)' },
    '&.Mui-focused fieldset': { borderColor: 'rgba(45,212,191,0.75)', borderWidth: 1 },
    '&.Mui-error fieldset': { borderColor: 'rgba(248,113,113,0.65)' },
  },
  '& .MuiInputBase-input': {
    pl: '17px', pr: '8px', color: '#fff', py: '11px',
    '&::placeholder': { color: 'rgba(255,255,255,0.4)', opacity: 1 },
    /* Chrome paints its own slab over autofilled fields, which destroys the
       glass. A long inset shadow is the only way to override it. */
    '&:-webkit-autofill': {
      WebkitBoxShadow: '0 0 0 1000px rgba(22,26,30,0.96) inset',
      WebkitTextFillColor: '#fff',
      caretColor: '#fff',
      transition: 'background-color 9999s ease-in-out 0s',
    },
  },
  '& .MuiInputAdornment-root': { mr: '10px', color: 'rgba(255,255,255,0.4)' },
};

const helperSx = { ml: 2, mt: 0.4, mb: -0.5, color: 'rgba(255,255,255,0.72)', fontSize: '0.68rem' };

const getPasswordChecks = (pw) => ({
  minLength: pw.length >= 6,
  hasUpper: /[A-Z]/.test(pw),
  hasLower: /[a-z]/.test(pw),
  hasNumber: /\d/.test(pw),
  hasSpecial: /[!@#$%^&*(),.?":{}|<>_\-+=[\]\\;'`~]/.test(pw),
});

const getPasswordStrength = (checks) => {
  const passed = Object.values(checks).filter(Boolean).length;
  if (passed <= 1) return { label: 'Weak', color: 'rgba(248,113,113,0.9)', pct: 20 };
  if (passed === 2) return { label: 'Fair', color: 'rgba(251,191,36,0.9)', pct: 40 };
  if (passed === 3) return { label: 'Good', color: 'rgba(251,191,36,0.95)', pct: 60 };
  if (passed === 4) return { label: 'Strong', color: 'rgba(45,212,191,0.9)', pct: 80 };
  return { label: 'Excellent', color: 'rgba(45,212,191,1)', pct: 100 };
};

const features = [
  { Icon: LayoutDashboard, title: 'Expense & Income', desc: 'Every transaction, budget and cash-flow trend in one ledger.' },
  { Icon: PieChart, title: 'Mutual Funds', desc: 'MUFAP-listed funds valued at the repurchase price, not at cost.' },
  { Icon: CandlestickChart, title: 'PSX Equities', desc: 'Pakistan Stock Exchange holdings priced off the daily board.' },
  { Icon: Sparkles, title: 'Smart Analytics', desc: 'Sector exposure, Graham value and dividend-safety scoring.' },
  { Icon: ShieldCheck, title: 'Secure & Private', desc: 'Row-level security — your records are reachable only by you.' },
];

const getFriendlyAuthError = (error, isSignUp) => {
  const rawMessage = (error?.message || '').toLowerCase();

  if (!rawMessage) {
    return isSignUp
      ? 'Unable to create account right now. Please try again.'
      : 'Unable to sign in right now. Please try again.';
  }

  if (rawMessage.includes('invalid login credentials')) return 'Incorrect email or password. Please try again.';
  if (rawMessage.includes('email not confirmed')) return 'Please verify your email before signing in.';
  if (rawMessage.includes('user already registered') || rawMessage.includes('already been registered')) {
    return 'This email is already registered. Please login instead.';
  }
  if (rawMessage.includes('password') && (rawMessage.includes('weak') || rawMessage.includes('least'))) {
    return 'Password is too weak. Use at least 6 characters.';
  }
  if (rawMessage.includes('invalid email') || rawMessage.includes('unable to validate email')) {
    return 'Please enter a valid email address.';
  }
  if (rawMessage.includes('too many requests') || rawMessage.includes('rate limit')) {
    return 'Too many attempts. Please wait a moment and try again.';
  }
  if (rawMessage.includes('network') || rawMessage.includes('fetch') || rawMessage.includes('failed to fetch')) {
    const isOffline = typeof navigator !== 'undefined' && navigator.onLine === false;
    if (isOffline) return 'You appear to be offline. Please check your internet connection.';
    return 'Cannot reach the authentication server. Disable VPN/ad-blocker and verify Supabase URL/key.';
  }

  return isSignUp
    ? 'Account creation failed. Please verify details and try again.'
    : 'Sign in failed. Please verify your details and try again.';
};

export default function AuthPage() {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [showPw, setShowPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);
  const [pwFocused, setPwFocused] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [installDismissed, setInstallDismissed] = useState(false);
  const signIn = useAuthStore((s) => s.signIn);
  const signUp = useAuthStore((s) => s.signUp);
  const resetPassword = useAuthStore((s) => s.resetPassword);

  /* 768 split the layout mid-tablet, where the two-column desktop view had
     less room for the form than a phone does. 900 keeps both columns usable. */
  const isMobile = useMediaQuery('(max-width:900px)');

  const isStandalone = typeof window !== 'undefined' && window.matchMedia('(display-mode: standalone)').matches;
  const isIOS = typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent);
  const showInstall = isMobile && !isStandalone && !installDismissed;

  useEffect(() => {
    if (!isMobile) return undefined;
    const handler = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, [isMobile]);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setInstallDismissed(true);
      setDeferredPrompt(null);
    }
  };

  const pwChecks = getPasswordChecks(password);
  const pwStrength = getPasswordStrength(pwChecks);

  const validateForm = () => {
    const nextErrors = {};
    const trimmedEmail = email.trim();
    const trimmedFullName = fullName.trim();

    if (isSignUp && !trimmedFullName) nextErrors.fullName = 'Enter your full name';
    if (!trimmedEmail) nextErrors.email = 'Enter your email address';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) nextErrors.email = 'Use a valid email format';

    if (!password.trim()) nextErrors.password = 'Enter your password';
    else if (password.length < 6) nextErrors.password = 'Use at least 6 characters';

    if (isSignUp && !confirmPassword.trim()) nextErrors.confirmPassword = 'Confirm your password';
    else if (isSignUp && password !== confirmPassword) nextErrors.confirmPassword = 'Passwords do not match';

    return nextErrors;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setFieldErrors({});

    const nextErrors = validateForm();
    if (Object.keys(nextErrors).length > 0) {
      setFieldErrors(nextErrors);
      return;
    }

    setLoading(true);
    try {
      const normalizedEmail = email.trim().toLowerCase();
      if (isSignUp) {
        await signUp(normalizedEmail, password, fullName);
        setSuccess('Account created! Check your email to confirm.');
        setIsSignUp(false);
      } else {
        await signIn(normalizedEmail, password);
      }
    } catch (err) {
      console.error('[Fintraxa Auth]', err?.message || err, err);
      setError(getFriendlyAuthError(err, isSignUp));
    } finally { setLoading(false); }
  };

  /* Password recovery. Supabase replies identically whether or not the address
     is registered, so the confirmation below deliberately does not reveal
     which — "no account found" would be an account-enumeration oracle. */
  const handleForgotPassword = async () => {
    const normalizedEmail = email.trim().toLowerCase();
    setError('');
    setSuccess('');
    if (!normalizedEmail || !/\S+@\S+\.\S+/.test(normalizedEmail)) {
      setFieldErrors({ email: 'Enter your email first, then tap Forgot Password' });
      return;
    }
    setResetting(true);
    try {
      await resetPassword(normalizedEmail);
      setSuccess('If that email has an account, a reset link is on its way.');
    } catch (err) {
      console.error('[Fintraxa Auth] reset', err?.message || err);
      setError('Could not send the reset email. Please try again shortly.');
    } finally {
      setResetting(false);
    }
  };

  const toggle = () => {
    setIsSignUp((v) => !v);
    setError('');
    setSuccess('');
    setFieldErrors({});
    setEmail('');
    setPassword('');
    setConfirmPassword('');
    setShowPw(false);
    setShowConfirmPw(false);
    setFullName('');
  };

  const clearField = (key) => setFieldErrors((prev) => (prev[key] ? { ...prev, [key]: '' } : prev));

  /* One background declaration shared by both layouts: the inlined placeholder
     sits beneath the real plate, so neither layer ever shows bare black. */
  const backdrop = useMemo(() => ({
    backgroundColor: '#05070a',
    backgroundImage: `url(${isMobile ? BG_MOBILE : BG_DESKTOP}), url(${BG_LQIP})`,
    backgroundSize: 'cover, cover',
    backgroundPosition: 'center, center',
    backgroundRepeat: 'no-repeat, no-repeat',
  }), [isMobile]);

  const formCard = (
    <Reveal distance={18} duration={0.45} style={{ width: '100%', maxWidth: 384, position: 'relative', zIndex: 2 }}>
      <GlassPanel radius={22} blur={30} sx={{ px: isMobile ? 2.75 : 3.25, pt: isMobile ? 3 : 3.5, pb: isMobile ? 3 : 3.25 }}>
        {!isMobile && (
          <Box sx={{ display: 'flex', justifyContent: 'center', mb: 1.5 }}>
            <FintraxaLogo size={36} />
          </Box>
        )}
        <Typography component="h1" sx={{
          textAlign: 'center', fontSize: '1.5rem', fontWeight: 700,
          color: '#fff', letterSpacing: '-0.02em', mb: 0.4,
        }}>
          {isSignUp ? 'Create account' : 'Welcome back'}
        </Typography>
        <Typography sx={{ textAlign: 'center', fontSize: '0.74rem', color: 'rgba(255,255,255,0.5)', mb: 2.4 }}>
          {isSignUp ? 'Start tracking in under a minute' : 'Sign in to your Fintraxa account'}
        </Typography>

        {/* Announced, not merely shown — a screen-reader user submitting the
            form previously got silence on both failure and success. */}
        <Box role="status" aria-live="polite">
          <AnimatePresence>
            {error && (
              <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <Alert severity="error" sx={{ mb: 2.5, borderRadius: 2.5, bgcolor: 'rgba(239,68,68,0.14)', color: '#fca5a5', border: '1px solid rgba(239,68,68,0.3)', fontSize: '0.78rem', '& .MuiAlert-icon': { color: '#fca5a5' } }}>{error}</Alert>
              </motion.div>
            )}
            {success && (
              <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <Alert severity="success" sx={{ mb: 2.5, borderRadius: 2.5, bgcolor: 'rgba(13,148,136,0.16)', color: '#5eead4', border: '1px solid rgba(13,148,136,0.34)', fontSize: '0.78rem', '& .MuiAlert-icon': { color: '#5eead4' } }}>{success}</Alert>
              </motion.div>
            )}
          </AnimatePresence>
        </Box>

        <AnimatePresence mode="wait">
          <motion.form
            key={isSignUp ? 'signup' : 'login'}
            initial={{ opacity: 0, x: isSignUp ? 20 : -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: isSignUp ? -20 : 20 }}
            transition={{ duration: 0.2 }}
            onSubmit={handleSubmit}
            noValidate
          >
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.4 }}>
              {isSignUp && (
                <TextField fullWidth placeholder="Full name" value={fullName}
                  autoComplete="name"
                  onChange={(e) => { setFullName(e.target.value); clearField('fullName'); }}
                  error={Boolean(fieldErrors.fullName)}
                  helperText={fieldErrors.fullName || ' '}
                  slotProps={{
                    formHelperText: { sx: helperSx },
                    htmlInput: { 'aria-label': 'Full name' },
                    input: { endAdornment: <InputAdornment position="end"><User size={17} /></InputAdornment> },
                  }}
                  sx={pillInput}
                />
              )}
              <TextField fullWidth placeholder="Email" type="email" value={email}
                autoComplete="email"
                onChange={(e) => { setEmail(e.target.value); clearField('email'); }}
                error={Boolean(fieldErrors.email)}
                helperText={fieldErrors.email || ' '}
                slotProps={{
                  formHelperText: { sx: helperSx },
                  htmlInput: { 'aria-label': 'Email address' },
                  input: { endAdornment: <InputAdornment position="end"><Mail size={17} /></InputAdornment> },
                }}
                sx={pillInput}
              />
              <TextField fullWidth placeholder="Password" type={showPw ? 'text' : 'password'}
                value={password}
                autoComplete={isSignUp ? 'new-password' : 'current-password'}
                onChange={(e) => { setPassword(e.target.value); clearField('password'); }}
                onFocus={() => isSignUp && setPwFocused(true)}
                onBlur={() => setPwFocused(false)}
                error={Boolean(fieldErrors.password)}
                helperText={(!isSignUp || !pwFocused) ? (fieldErrors.password || ' ') : ' '}
                slotProps={{
                  formHelperText: { sx: helperSx },
                  htmlInput: { 'aria-label': 'Password' },
                  input: {
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton onClick={() => setShowPw((v) => !v)} edge="end" size="small"
                          aria-label={showPw ? 'Hide password' : 'Show password'}
                          sx={{ color: 'rgba(255,255,255,0.75)', p: '6px', mr: '2px' }}>
                          {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
                        </IconButton>
                      </InputAdornment>
                    ),
                  },
                }}
                sx={pillInput}
              />

              {/* Strength meter and checklist, sign-up only */}
              <AnimatePresence>
                {isSignUp && (pwFocused || password.length > 0) && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.18 }}
                    style={{ overflow: 'hidden' }}
                  >
                    <Box sx={{ mt: -0.5, mb: 0.5, px: 0.5 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.9 }}>
                        <Box
                          role="progressbar"
                          aria-label="Password strength"
                          aria-valuenow={pwStrength.pct}
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-valuetext={pwStrength.label}
                          sx={{ flex: 1, height: 3, bgcolor: 'rgba(255,255,255,0.12)', borderRadius: 2, overflow: 'hidden' }}
                        >
                          <Box sx={{ width: `${pwStrength.pct}%`, height: '100%', bgcolor: pwStrength.color, borderRadius: 2, transition: 'width .25s ease, background-color .25s ease' }} />
                        </Box>
                        <Typography sx={{ fontSize: '0.62rem', fontWeight: 700, color: pwStrength.color, minWidth: 52 }}>{pwStrength.label}</Typography>
                      </Box>
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
                        {[
                          { key: 'minLength', label: '6+ chars' },
                          { key: 'hasUpper', label: 'Uppercase' },
                          { key: 'hasLower', label: 'Lowercase' },
                          { key: 'hasNumber', label: 'Number' },
                          { key: 'hasSpecial', label: 'Symbol' },
                        ].map((item) => (
                          <Box key={item.key} sx={{ display: 'flex', alignItems: 'center', gap: 0.4 }}>
                            {pwChecks[item.key]
                              ? <Check size={12} color="rgba(45,212,191,0.95)" strokeWidth={3} />
                              : <Circle size={11} color="rgba(255,255,255,0.28)" />}
                            <Typography sx={{ fontSize: '0.6rem', color: pwChecks[item.key] ? 'rgba(255,255,255,0.78)' : 'rgba(255,255,255,0.38)', transition: 'color .15s' }}>
                              {item.label}
                            </Typography>
                          </Box>
                        ))}
                      </Box>
                    </Box>
                  </motion.div>
                )}
              </AnimatePresence>

              {isSignUp && (
                <TextField fullWidth placeholder="Confirm password" type={showConfirmPw ? 'text' : 'password'}
                  value={confirmPassword}
                  autoComplete="new-password"
                  onChange={(e) => { setConfirmPassword(e.target.value); clearField('confirmPassword'); }}
                  error={Boolean(fieldErrors.confirmPassword)}
                  helperText={fieldErrors.confirmPassword || ' '}
                  slotProps={{
                    formHelperText: { sx: helperSx },
                    htmlInput: { 'aria-label': 'Confirm password' },
                    input: {
                      endAdornment: (
                        <InputAdornment position="end">
                          <IconButton onClick={() => setShowConfirmPw((v) => !v)} edge="end" size="small"
                            aria-label={showConfirmPw ? 'Hide password' : 'Show password'}
                            sx={{ color: 'rgba(255,255,255,0.75)', p: '6px', mr: '2px' }}>
                            {showConfirmPw ? <EyeOff size={18} /> : <Eye size={18} />}
                          </IconButton>
                        </InputAdornment>
                      ),
                    },
                  }}
                  sx={pillInput}
                />
              )}
            </Box>

            {!isSignUp && (
              /* "Remember Me" used to sit here as a checkbox wired to nothing —
                 the session persists either way, so the control only ever
                 misrepresented what it did. Removed rather than faked. */
              <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 1.3, mb: 0.25 }}>
                <Button type="button" onClick={handleForgotPassword} disabled={resetting || loading}
                  sx={{
                    p: 0, minWidth: 0, textTransform: 'none',
                    fontSize: '0.76rem', fontWeight: 500, color: 'rgba(255,255,255,0.78)',
                    '&:hover': { color: '#5eead4', bgcolor: 'transparent' },
                    '&.Mui-disabled': { color: 'rgba(255,255,255,0.4)' },
                  }}
                >
                  {resetting ? 'Sending…' : 'Forgot password?'}
                </Button>
              </Box>
            )}

            <Button fullWidth variant="contained" type="submit" disabled={loading}
              endIcon={loading ? null : <ArrowRight size={16} />}
              sx={{
                mt: 2, py: '11px', borderRadius: '34px', textTransform: 'none',
                fontSize: '0.86rem', fontWeight: 700, letterSpacing: '0.01em',
                color: '#04100e',
                background: 'linear-gradient(135deg, #ffffff 0%, #d7fbf4 100%)',
                boxShadow: '0 10px 28px rgba(13,148,136,0.3)',
                transition: 'transform .16s ease, box-shadow .16s ease, filter .16s ease',
                '&:hover': { filter: 'brightness(1.04)', boxShadow: '0 14px 34px rgba(13,148,136,0.42)', transform: 'translateY(-1px)' },
                '&:active': { transform: 'translateY(0)' },
                '&:disabled': { background: 'rgba(255,255,255,0.32)', color: 'rgba(4,16,14,0.55)', boxShadow: 'none' },
                '@media (prefers-reduced-motion: reduce)': { transition: 'none', '&:hover': { transform: 'none' } },
              }}
            >
              {loading ? <CircularProgress size={18} sx={{ color: '#04100e' }} /> : (isSignUp ? 'Create account' : 'Sign in')}
            </Button>
          </motion.form>
        </AnimatePresence>

        <Typography sx={{ textAlign: 'center', mt: 2, fontSize: '0.76rem', color: 'rgba(255,255,255,0.6)' }}>
          {isSignUp ? 'Already have an account?' : "Don't have an account?"}{' '}
          <Link component="button" type="button" onClick={toggle} underline="hover"
            sx={{ color: '#5eead4', fontWeight: 700, fontSize: '0.76rem', verticalAlign: 'baseline' }}>
            {isSignUp ? 'Sign in' : 'Create one'}
          </Link>
        </Typography>
      </GlassPanel>
    </Reveal>
  );

  const installCard = (
    <AnimatePresence>
      {showInstall && (
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 18 }}
          transition={{ delay: 0.35, duration: 0.3 }}
          style={{ width: '100%', maxWidth: 384 }}
        >
          <GlassPanel radius={16} blur={18} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, p: 1.75, pl: 2 }}>
            <IconButton onClick={() => setInstallDismissed(true)} size="small" aria-label="Dismiss install prompt"
              sx={{ position: 'absolute', top: 5, right: 5, color: 'rgba(255,255,255,0.45)', p: '4px', zIndex: 1 }}>
              <X size={13} />
            </IconButton>
            <Box sx={{
              width: 38, height: 38, borderRadius: '11px', flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              bgcolor: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.12)', color: '#fff',
            }}>
              <Smartphone size={19} />
            </Box>
            <Box sx={{ flex: 1, minWidth: 0, pr: 1 }}>
              <Typography sx={{ fontSize: '0.78rem', fontWeight: 700, color: '#fff', lineHeight: 1.3 }}>
                Install as app
              </Typography>
              {isIOS ? (
                <Typography component="span" sx={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.55)', lineHeight: 1.4, mt: 0.25, display: 'flex', alignItems: 'center', gap: 0.4, flexWrap: 'wrap' }}>
                  Tap <Share size={12} /> then <strong>Add to Home Screen</strong>
                </Typography>
              ) : (
                <Typography sx={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.5)', lineHeight: 1.35 }}>
                  {deferredPrompt ? 'Full-screen, offline-ready' : 'Use the browser menu → Install app'}
                </Typography>
              )}
            </Box>
            {!isIOS && deferredPrompt && (
              <Button onClick={handleInstallClick} size="small" startIcon={<Download size={14} />}
                sx={{
                  borderRadius: '10px', px: 1.75, py: 0.7, flexShrink: 0, minWidth: 'auto',
                  fontSize: '0.7rem', fontWeight: 700, textTransform: 'none',
                  bgcolor: '#fff', color: '#000', '&:hover': { bgcolor: 'rgba(240,240,240,1)' },
                }}>
                Install
              </Button>
            )}
          </GlassPanel>
        </motion.div>
      )}
    </AnimatePresence>
  );

  /* ─── Mobile ─── */
  if (isMobile) {
    return (
      <Box component="main" sx={{
        minHeight: '100dvh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 2,
        px: 2, py: 4, position: 'relative', overflow: 'hidden',
        ...backdrop,
        '&::before': {
          content: '""', position: 'absolute', inset: 0, zIndex: 1,
          background: 'linear-gradient(180deg, rgba(3,6,9,0.82) 0%, rgba(3,6,9,0.5) 45%, rgba(3,6,9,0.86) 100%)',
        },
      }}>
        <Box sx={{ position: 'relative', zIndex: 2, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.75, mb: 0.5 }}>
          <FintraxaLogo size={62} />
          <Typography sx={{ fontSize: '1.35rem', fontWeight: 800, letterSpacing: '-0.045em', color: '#fff' }}>
            Fintraxa
          </Typography>
          <ShinyText sx={{ fontSize: '0.68rem', letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 600 }}>
            Personal finance, Pakistan
          </ShinyText>
        </Box>
        <Box sx={{ position: 'relative', zIndex: 2, width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
          {formCard}
          {installCard}
        </Box>
      </Box>
    );
  }

  /* ─── Desktop: one background plate, glass brand panel left, form right ─── */
  return (
    <Box component="main" sx={{
      minHeight: '100dvh', display: 'flex', position: 'relative', overflow: 'hidden',
      ...backdrop,
      '&::before': {
        content: '""', position: 'absolute', inset: 0, zIndex: 0,
        background: 'linear-gradient(100deg, rgba(3,6,9,0.9) 0%, rgba(3,6,9,0.62) 42%, rgba(3,6,9,0.42) 100%)',
      },
    }}>
      {/* Left — Apple-style liquid-glass brand panel */}
      <Box sx={{
        width: { md: '46%', lg: '42%' }, flexShrink: 0, zIndex: 1,
        display: 'flex', alignItems: 'center', p: { md: 3.5, lg: 5 },
      }}>
        <GlassPanel
          radius={30}
          blur={34}
          /* `overflow: hidden` clipped the last feature and the footer on any
             laptop under ~900px tall. The panel scrolls instead, with the bar
             hidden so the glass edge stays clean, and the vertical rhythm is
             tightened so scrolling is rarely needed at all. */
          sx={{
            width: '100%', maxHeight: '92dvh',
            overflowY: 'auto', overscrollBehavior: 'contain',
            '&::-webkit-scrollbar': { display: 'none' },
            scrollbarWidth: 'none',
            px: { md: 3.5, lg: 4.5 }, py: { md: 3.5, lg: 4.5 },
          }}
        >
          <Reveal distance={-14} duration={0.5}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
              <FintraxaLogo size={46} />
              <Box>
                <Typography sx={{ fontSize: '1.55rem', fontWeight: 800, letterSpacing: '-0.045em', color: '#fff', lineHeight: 1.05 }}>
                  Fintraxa
                </Typography>
                <ShinyText sx={{ fontSize: '0.6rem', letterSpacing: '0.17em', textTransform: 'uppercase', fontWeight: 700 }}>
                  Wealth, tracked
                </ShinyText>
              </Box>
            </Box>
            <Typography sx={{
              fontSize: '0.92rem', fontWeight: 300, color: 'rgba(255,255,255,0.56)',
              mb: 3, lineHeight: 1.6, maxWidth: 340,
            }}>
              One ledger for spending, MUFAP funds and PSX holdings.
              Valued on live market data, never guesswork.
            </Typography>
          </Reveal>

          <Box component="ul" sx={{ display: 'flex', flexDirection: 'column', gap: 1.85, listStyle: 'none', p: 0, m: 0 }}>
            {features.map((f, i) => (
              <Reveal key={f.title} direction="horizontal" reverse distance={20}
                duration={0.4} delay={0.12 + i * 0.07}>
                <Box component="li" sx={{ display: 'flex', alignItems: 'flex-start', gap: 2, listStyle: 'none' }}>
                  <Box sx={{
                    width: 42, height: 42, borderRadius: '13px', flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#5eead4',
                    bgcolor: 'rgba(255,255,255,0.055)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.12)',
                  }}>
                    <f.Icon size={19} strokeWidth={1.75} />
                  </Box>
                  <Box>
                    <Typography sx={{ fontSize: '0.86rem', fontWeight: 600, color: '#fff', mb: 0.3 }}>{f.title}</Typography>
                    <Typography sx={{ fontSize: '0.73rem', color: 'rgba(255,255,255,0.45)', lineHeight: 1.55 }}>{f.desc}</Typography>
                  </Box>
                </Box>
              </Reveal>
            ))}
          </Box>

          <Box sx={{ mt: 3, pt: 2, borderTop: '1px solid rgba(255,255,255,0.09)' }}>
            <Typography sx={{ fontSize: '0.64rem', color: 'rgba(255,255,255,0.3)', letterSpacing: '0.09em', textTransform: 'uppercase' }}>
              Fintraxa &copy; {new Date().getFullYear()} &nbsp;&middot;&nbsp; Encrypted &amp; row-level secured
            </Typography>
          </Box>
        </GlassPanel>
      </Box>

      {/* Right — the form */}
      <Box sx={{
        flex: 1, zIndex: 1, position: 'relative',
        display: 'flex', alignItems: 'center', justifyContent: 'center', p: 4,
      }}>
        {formCard}
      </Box>
    </Box>
  );
}
