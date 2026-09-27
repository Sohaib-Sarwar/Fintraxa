import { useState, useEffect } from 'react';
import { Box, Button, Typography, IconButton, useTheme } from '@mui/material';
import { GetAppRounded, CloseRounded } from '@mui/icons-material';
import { motion, AnimatePresence } from 'framer-motion';

export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showBanner, setShowBanner] = useState(false);
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  useEffect(() => {
    // Don't show if already installed as PWA
    if (window.matchMedia('(display-mode: standalone)').matches) return;

    const handler = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      // Show banner after a short delay so it doesn't interrupt initial load
      setTimeout(() => setShowBanner(true), 3000);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setShowBanner(false);
      setDeferredPrompt(null);
    }
  };

  const handleDismiss = () => {
    setShowBanner(false);
    // Don't show again for this session
    setDeferredPrompt(null);
  };

  return (
    <AnimatePresence>
      {showBanner && (
        <motion.div
          initial={{ opacity: 0, y: 80 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 80 }}
          transition={{ type: 'spring', damping: 22, stiffness: 260 }}
          style={{
            position: 'fixed',
            bottom: 'calc(env(safe-area-inset-bottom, 0px) + 62px)',
            left: 12,
            right: 12,
            zIndex: 1400,
          }}
        >
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1.5,
              p: 1.5,
              pl: 2,
              borderRadius: '16px',
              bgcolor: isDark ? 'rgba(20,20,20,0.92)' : 'rgba(255,255,255,0.95)',
              backdropFilter: 'blur(20px)',
              WebkitBackdropFilter: 'blur(20px)',
              border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)'}`,
              boxShadow: isDark
                ? '0 16px 40px rgba(0,0,0,0.6)'
                : '0 16px 40px rgba(0,0,0,0.12)',
            }}
          >
            <GetAppRounded sx={{ fontSize: 28, color: isDark ? '#fff' : '#000', flexShrink: 0 }} />
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography sx={{ fontSize: '0.82rem', fontWeight: 700, color: 'text.primary', lineHeight: 1.3 }}>
                Install Fintraxa
              </Typography>
              <Typography sx={{ fontSize: '0.68rem', color: 'text.secondary', lineHeight: 1.3 }}>
                Add to home screen for the full app experience
              </Typography>
            </Box>
            <Button
              onClick={handleInstall}
              size="small"
              sx={{
                borderRadius: '10px',
                px: 2,
                py: 0.8,
                fontSize: '0.72rem',
                fontWeight: 700,
                textTransform: 'none',
                bgcolor: isDark ? '#fff' : '#000',
                color: isDark ? '#000' : '#fff',
                flexShrink: 0,
                '&:hover': { bgcolor: isDark ? '#e0e0e0' : '#222' },
              }}
            >
              Install
            </Button>
            <IconButton onClick={handleDismiss} size="small" sx={{ flexShrink: 0 }}>
              <CloseRounded sx={{ fontSize: 18, color: 'text.secondary' }} />
            </IconButton>
          </Box>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
