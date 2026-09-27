import { useState, useEffect } from 'react';
import {
  Box, TextField, Button, Typography, Alert, CircularProgress,
  InputAdornment, IconButton, useMediaQuery, Checkbox, FormControlLabel,
} from '@mui/material';
import {
  PersonRounded as PersonIcon,
  LockRounded as LockIcon,
  Visibility, VisibilityOff,
  SpaceDashboardRounded as DashboardIcon,
  PieChartRounded as FundsIcon,
  CandlestickChartRounded as StocksIcon,
  AutoGraphRounded as AnalyticsIcon,
  ShieldRounded as SecurityIcon,
  CheckCircleOutlineRounded as CheckIcon,
  RadioButtonUncheckedRounded as UncheckIcon,
  GetAppRounded as GetAppIcon,
  PhoneIphoneRounded as PhoneIcon,
  IosShareRounded as ShareIcon,
  CloseRounded as CloseIcon,
} from '@mui/icons-material';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuthStore } from '../../store/authStore';
import FintraxaLogo from '../../components/FintraxaLogo';

const pillInput = {
  '& .MuiInputBase-root': { minHeight: 42 },
  '& .MuiOutlinedInput-root': {
    borderRadius: '36px',
    bgcolor: 'rgba(255,255,255,0.045)',
    color: '#fff',
    fontSize: '0.82rem',
    '& fieldset': { borderColor: 'rgba(255,255,255,0.28)', borderRadius: '36px' },
    '&:hover fieldset': { borderColor: 'rgba(255,255,255,0.5)' },
    '&.Mui-focused fieldset': { borderColor: 'rgba(255,255,255,0.6)', borderWidth: 1 },
  },
  '& .MuiInputBase-input': {
    pl: '15px', pr: '8px', color: '#fff', py: '10px',
    '&::placeholder': { color: 'rgba(255,255,255,0.42)', opacity: 1 },
  },
  '& .MuiInputAdornment-root': { mr: '8px' },
  '& .MuiInputAdornment-root .MuiSvgIcon-root': { color: 'rgba(255,255,255,0.42)', fontSize: 17 },
};

const getPasswordChecks = (pw) => ({
  minLength: pw.length >= 6,
  hasUpper: /[A-Z]/.test(pw),
  hasLower: /[a-z]/.test(pw),
  hasNumber: /\d/.test(pw),
  hasSpecial: /[!@#$%^&*(),.?":{}|<>_\-+=\[\]\\;'`~]/.test(pw),
});

const getPasswordStrength = (checks) => {
  const passed = Object.values(checks).filter(Boolean).length;
  if (passed <= 1) return { label: 'Weak', color: 'rgba(239,68,68,0.85)', pct: 20 };
  if (passed === 2) return { label: 'Fair', color: 'rgba(251,191,36,0.85)', pct: 40 };
  if (passed === 3) return { label: 'Good', color: 'rgba(251,191,36,0.9)', pct: 60 };
  if (passed === 4) return { label: 'Strong', color: 'rgba(74,222,128,0.85)', pct: 80 };
  return { label: 'Excellent', color: 'rgba(74,222,128,0.95)', pct: 100 };
};

const features = [
  { icon: <DashboardIcon sx={{ fontSize: 26 }} />, title: 'Expense & Income', desc: 'Track every transaction, set budgets and monitor cash flow in real time.' },
  { icon: <FundsIcon sx={{ fontSize: 26 }} />, title: 'Mutual Funds', desc: 'Invest in MUFAP-listed funds, monitor NAV and track portfolio growth.' },
  { icon: <StocksIcon sx={{ fontSize: 26 }} />, title: 'PSX Equities', desc: 'Manage Pakistan Stock Exchange holdings with live price tracking.' },
  { icon: <AnalyticsIcon sx={{ fontSize: 26 }} />, title: 'Smart Analytics', desc: 'Rich charts and insights to help you make better financial decisions.' },
  { icon: <SecurityIcon sx={{ fontSize: 26 }} />, title: 'Secure & Private', desc: 'Bank-grade encryption keeps your financial data safe at all times.' },
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
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [installDismissed, setInstallDismissed] = useState(false);
  const signIn = useAuthStore((s) => s.signIn);
  const signUp = useAuthStore((s) => s.signUp);
  const isMobile = useMediaQuery('(max-width:768px)');

  const isStandalone = typeof window !== 'undefined' && window.matchMedia('(display-mode: standalone)').matches;
  const isIOS = typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent);
  const showInstall = isMobile && !isStandalone && !installDismissed;

  useEffect(() => {
    if (!isMobile) return;
    const handler = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, [isMobile]);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setInstallDismissed(true);
        setDeferredPrompt(null);
      }
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
    }
    finally { setLoading(false); }
  };

  const toggle = () => {
    setIsSignUp(!isSignUp);
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

  const formCard = (
    <motion.div
      initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}
      style={{ width: '100%', maxWidth: 368, position: 'relative', zIndex: 2 }}
    >
      <Box sx={{
        bgcolor: 'rgba(72,78,88,0.16)',
        backdropFilter: 'blur(18px) saturate(135%)',
        WebkitBackdropFilter: 'blur(18px) saturate(135%)',
        border: '1px solid rgba(255,255,255,0.2)',
        borderRadius: '16px',
        px: isMobile ? 2.5 : 3,
        pt: isMobile ? 3 : 3.25,
        pb: isMobile ? 2.75 : 3,
        boxShadow: '0 16px 44px rgba(0,0,0,0.34)',
      }}>
        {/* Show logo inside card only on desktop */}
        {!isMobile && (
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', mb: 1.25 }}>
            <FintraxaLogo size={34} />
          </Box>
        )}
        <Typography sx={{
          textAlign: 'center',
          fontSize: '1.52rem',
          fontWeight: 700,
          color: '#fff',
          letterSpacing: '-0.01em',
          mb: 2.2,
        }}>
          {isSignUp ? 'Sign Up' : 'Login'}
        </Typography>

        <AnimatePresence>
          {error && (
            <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <Alert severity="error" sx={{ mb: 2.5, borderRadius: 2, bgcolor: 'rgba(239,68,68,0.15)', color: '#fca5a5', border: '1px solid rgba(239,68,68,0.3)', fontSize: '0.8rem' }}>{error}</Alert>
            </motion.div>
          )}
          {success && (
            <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <Alert severity="success" sx={{ mb: 2.5, borderRadius: 2, bgcolor: 'rgba(16,185,129,0.15)', color: '#6ee7b7', border: '1px solid rgba(16,185,129,0.3)', fontSize: '0.8rem' }}>{success}</Alert>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence mode="wait">
          <motion.form
            key={isSignUp ? 'signup' : 'login'}
            initial={{ opacity: 0, x: isSignUp ? 24 : -24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: isSignUp ? -24 : 24 }}
            transition={{ duration: 0.2 }}
            onSubmit={handleSubmit}
            noValidate
          >
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              {isSignUp && (
                <TextField fullWidth placeholder="Full Name" value={fullName}
                  onChange={(e) => {
                    setFullName(e.target.value);
                    setFieldErrors((prev) => ({ ...prev, fullName: '' }));
                  }}
                  error={Boolean(fieldErrors.fullName)}
                  helperText={fieldErrors.fullName || ' '}
                  FormHelperTextProps={{ sx: { ml: 1.5, mt: 0.4, mb: -0.5, color: 'rgba(255,255,255,0.72)', fontSize: '0.68rem' } }}
                  sx={pillInput}
                  InputProps={{ endAdornment: <InputAdornment position="end"><PersonIcon /></InputAdornment> }}
                />
              )}
              <TextField fullWidth placeholder="Email"
                type="email" value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setFieldErrors((prev) => ({ ...prev, email: '' }));
                }}
                error={Boolean(fieldErrors.email)}
                helperText={fieldErrors.email || ' '}
                FormHelperTextProps={{ sx: { ml: 1.5, mt: 0.4, mb: -0.5, color: 'rgba(255,255,255,0.72)', fontSize: '0.68rem' } }}
                sx={pillInput}
                InputProps={{ endAdornment: <InputAdornment position="end"><PersonIcon /></InputAdornment> }}
              />
              <TextField fullWidth placeholder="Password" type={showPw ? 'text' : 'password'}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setFieldErrors((prev) => ({ ...prev, password: '' }));
                }}
                onFocus={() => isSignUp && setPwFocused(true)}
                onBlur={() => setPwFocused(false)}
                error={Boolean(fieldErrors.password)}
                helperText={(!isSignUp || !pwFocused) ? (fieldErrors.password || ' ') : ' '}
                FormHelperTextProps={{ sx: { ml: 1.5, mt: 0.4, mb: -0.5, color: 'rgba(255,255,255,0.72)', fontSize: '0.68rem' } }}
                sx={pillInput}
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton onClick={() => setShowPw(!showPw)} edge="end" size="small"
                        sx={{ color: 'rgba(255,255,255,0.82)', p: '5px', mr: '2px' }}>
                        {showPw ? <VisibilityOff sx={{ fontSize: 19 }} /> : <Visibility sx={{ fontSize: 19 }} />}
                      </IconButton>
                    </InputAdornment>
                  ),
                }}
              />
              {/* Password strength & checklist (sign up only) */}
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
                      {/* Strength bar */}
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.75 }}>
                        <Box sx={{ flex: 1, height: 3, bgcolor: 'rgba(255,255,255,0.12)', borderRadius: 2, overflow: 'hidden' }}>
                          <Box sx={{ width: `${pwStrength.pct}%`, height: '100%', bgcolor: pwStrength.color, borderRadius: 2, transition: 'width 0.2s, background-color 0.2s' }} />
                        </Box>
                        <Typography sx={{ fontSize: '0.62rem', fontWeight: 600, color: pwStrength.color, minWidth: 48 }}>{pwStrength.label}</Typography>
                      </Box>
                      {/* Checklist */}
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                        {[
                          { key: 'minLength', label: '6+ chars' },
                          { key: 'hasUpper', label: 'Uppercase' },
                          { key: 'hasLower', label: 'Lowercase' },
                          { key: 'hasNumber', label: 'Number' },
                          { key: 'hasSpecial', label: 'Symbol' },
                        ].map((item) => (
                          <Box key={item.key} sx={{ display: 'flex', alignItems: 'center', gap: 0.35 }}>
                            {pwChecks[item.key]
                              ? <CheckIcon sx={{ fontSize: 12, color: 'rgba(74,222,128,0.9)' }} />
                              : <UncheckIcon sx={{ fontSize: 12, color: 'rgba(255,255,255,0.28)' }} />}
                            <Typography sx={{ fontSize: '0.6rem', color: pwChecks[item.key] ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.38)', transition: 'color 0.15s' }}>
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
                <TextField fullWidth placeholder="Confirm Password" type={showConfirmPw ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => {
                    setConfirmPassword(e.target.value);
                    setFieldErrors((prev) => ({ ...prev, confirmPassword: '' }));
                  }}
                  error={Boolean(fieldErrors.confirmPassword)}
                  helperText={fieldErrors.confirmPassword || ' '}
                  FormHelperTextProps={{ sx: { ml: 1.5, mt: 0.4, mb: -0.5, color: 'rgba(255,255,255,0.72)', fontSize: '0.68rem' } }}
                  sx={pillInput}
                  InputProps={{
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton onClick={() => setShowConfirmPw(!showConfirmPw)} edge="end" size="small"
                          sx={{ color: 'rgba(255,255,255,0.82)', p: '5px', mr: '2px' }}>
                          {showConfirmPw ? <VisibilityOff sx={{ fontSize: 19 }} /> : <Visibility sx={{ fontSize: 19 }} />}
                        </IconButton>
                      </InputAdornment>
                    ),
                  }}
                />
              )}
            </Box>

            {!isSignUp && (
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mt: 1.4, mb: 0.25 }}>
                <FormControlLabel
                  sx={{ m: 0 }}
                  control={
                    <Checkbox checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)}
                      size="small" sx={{
                        color: 'rgba(255,255,255,0.55)',
                        '&.Mui-checked': { color: '#fff' },
                        p: '3px',
                        mr: '4px',
                      }} />
                  }
                  label={
                    <Typography sx={{ fontSize: '0.78rem', fontWeight: 600, color: '#fff' }}>Remember Me</Typography>
                  }
                />
                <Typography sx={{
                  fontSize: '0.78rem', fontWeight: 500,
                  color: 'rgba(255,255,255,0.8)',
                  cursor: 'pointer',
                  '&:hover': { color: '#fff' },
                }}>
                  Forgot Password?
                </Typography>
              </Box>
            )}

            <Button fullWidth variant="contained" type="submit" disabled={loading}
              sx={{
                mt: 1.8,
                py: '9px',
                borderRadius: '34px',
                textTransform: 'none',
                fontSize: '0.84rem',
                fontWeight: 600,
                letterSpacing: '0.01em',
                bgcolor: '#fff',
                color: '#18181f',
                boxShadow: 'none',
                '&:hover': { bgcolor: 'rgba(240,240,240,1)', boxShadow: 'none' },
                '&:disabled': { bgcolor: 'rgba(255,255,255,0.4)', color: 'rgba(30,30,40,0.6)', boxShadow: 'none' },
              }}
            >
              {loading ? <CircularProgress size={18} sx={{ color: '#18181f' }} /> : (isSignUp ? 'Sign Up' : 'Submit')}
            </Button>
          </motion.form>
        </AnimatePresence>

        <Typography sx={{ textAlign: 'center', mt: 1.9, fontSize: '0.75rem', color: 'rgba(255,255,255,0.65)' }}>
          {isSignUp ? 'Already have an account?' : "Don't have an account?"}{' '}
          <Box component="span" onClick={toggle}
            sx={{ color: '#fff', fontWeight: 600, cursor: 'pointer', '&:hover': { textDecoration: 'underline' } }}>
            {isSignUp ? 'Login' : 'Register'}
          </Box>
        </Typography>
      </Box>
    </motion.div>
  );

  if (isMobile) {
    return (
      <Box sx={{
        minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        px: 2, py: 3, position: 'relative', overflow: 'hidden',
        backgroundImage: 'url(/background.jpg)',
        backgroundSize: 'cover', backgroundPosition: 'center',
        '&::before': { content: '""', position: 'absolute', inset: 0, bgcolor: 'rgba(0,0,0,0.52)', zIndex: 1 },
      }}>
        {/* Logo centered between top and form */}
        <Box sx={{
          position: 'absolute',
          top: '12%',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 2,
        }}>
          <FintraxaLogo size={80} />
        </Box>
        {/* Form centered on page */}
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, zIndex: 2, width: '100%', maxWidth: 368, px: 0 }}>
          {formCard}
          {/* PWA Install Prompt — mobile only */}
          <AnimatePresence>
            {showInstall && (
              <motion.div
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 18 }}
                transition={{ delay: 0.4, duration: 0.35 }}
                style={{ width: '100%' }}
              >
                <Box sx={{
                  display: 'flex', alignItems: 'center', gap: 1.5,
                  p: 1.75, pl: 2,
                  borderRadius: '14px',
                  bgcolor: 'rgba(255,255,255,0.08)',
                  backdropFilter: 'blur(16px)',
                  WebkitBackdropFilter: 'blur(16px)',
                  border: '1px solid rgba(255,255,255,0.15)',
                  position: 'relative',
                }}>
                  <IconButton
                    onClick={() => setInstallDismissed(true)}
                    size="small"
                    sx={{ position: 'absolute', top: 6, right: 6, color: 'rgba(255,255,255,0.4)', p: '3px' }}
                  >
                    <CloseIcon sx={{ fontSize: 14 }} />
                  </IconButton>
                  <Box sx={{
                    width: 38, height: 38, borderRadius: '10px', flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    bgcolor: 'rgba(255,255,255,0.1)',
                    border: '1px solid rgba(255,255,255,0.12)',
                  }}>
                    <PhoneIcon sx={{ fontSize: 20, color: '#fff' }} />
                  </Box>
                  <Box sx={{ flex: 1, minWidth: 0, pr: 1 }}>
                    <Typography sx={{ fontSize: '0.78rem', fontWeight: 700, color: '#fff', lineHeight: 1.3 }}>
                      Install as App
                    </Typography>
                    {isIOS ? (
                      <Typography sx={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.55)', lineHeight: 1.4, mt: 0.25 }}>
                        Tap <ShareIcon sx={{ fontSize: 12, verticalAlign: 'middle', mx: 0.25 }} /> then <strong>&quot;Add to Home Screen&quot;</strong>
                      </Typography>
                    ) : deferredPrompt ? (
                      <Typography sx={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.5)', lineHeight: 1.35 }}>
                        Get the full native experience
                      </Typography>
                    ) : (
                      <Typography sx={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.5)', lineHeight: 1.35 }}>
                        Use browser menu &gt; &quot;Install app&quot; or &quot;Add to Home Screen&quot;
                      </Typography>
                    )}
                  </Box>
                  {!isIOS && deferredPrompt && (
                    <Button
                      onClick={handleInstallClick}
                      size="small"
                      startIcon={<GetAppIcon sx={{ fontSize: '15px !important' }} />}
                      sx={{
                        borderRadius: '10px', px: 1.75, py: 0.7,
                        fontSize: '0.7rem', fontWeight: 700, textTransform: 'none',
                        bgcolor: '#fff', color: '#000', flexShrink: 0,
                        minWidth: 'auto',
                        '&:hover': { bgcolor: 'rgba(240,240,240,1)' },
                      }}
                    >
                      Install
                    </Button>
                  )}
                </Box>
              </motion.div>
            )}
          </AnimatePresence>
        </Box>
      </Box>
    );
  }

  return (
    <Box sx={{ minHeight: '100dvh', display: 'flex' }}>
      {/* Left: Pure black branding panel */}
      <Box sx={{
        width: '42%', flexShrink: 0,
        bgcolor: '#000',
        display: 'flex', flexDirection: 'column', justifyContent: 'center',
        px: 7, py: 6,
        borderRight: '1px solid #1a1a1a',
        position: 'relative', overflow: 'hidden',
      }}>
        <motion.div initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2.5 }}>
            <FintraxaLogo size={44} />
            <Typography sx={{ fontSize: '1.6rem', fontWeight: 800, letterSpacing: '-0.04em', color: '#fff' }}>Fintraxa</Typography>
          </Box>
          <Typography sx={{ fontSize: '0.95rem', fontWeight: 300, color: 'rgba(255,255,255,0.4)', mb: 5, lineHeight: 1.6, maxWidth: 320 }}>
            Your all-in-one personal finance platform for Pakistan.
          </Typography>
        </motion.div>

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {features.map((f, i) => (
            <motion.div key={i}
              initial={{ opacity: 0, x: -24 }} animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.15 + i * 0.1, duration: 0.35 }}
            >
              <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2 }}>
                <Box sx={{
                  width: 44, height: 44, borderRadius: 2.5, flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  bgcolor: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.07)',
                  color: 'rgba(255,255,255,0.75)',
                }}>
                  {f.icon}
                </Box>
                <Box>
                  <Typography sx={{ fontSize: '0.875rem', fontWeight: 600, color: '#fff', mb: 0.25 }}>{f.title}</Typography>
                  <Typography sx={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.35)', lineHeight: 1.5 }}>{f.desc}</Typography>
                </Box>
              </Box>
            </motion.div>
          ))}
        </Box>

        <Box sx={{ mt: 'auto', pt: 5 }}>
          <Typography sx={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.2)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            Fintraxa &copy; {new Date().getFullYear()} &nbsp;&middot;&nbsp; Secure &amp; Encrypted
          </Typography>
        </Box>
      </Box>

      {/* Right: background image + glassmorphism form */}
      <Box sx={{
        flex: 1, position: 'relative',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        p: 4,
        backgroundImage: 'url(/background.jpg)',
        backgroundSize: 'cover', backgroundPosition: 'center',
        '&::before': { content: '""', position: 'absolute', inset: 0, bgcolor: 'rgba(0,0,0,0.48)', zIndex: 1 },
      }}>
        {formCard}
      </Box>
    </Box>
  );
}
