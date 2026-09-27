import { createTheme } from '@mui/material/styles';

export function buildTheme(mode = 'light') {
  const isDark = mode === 'dark';
  const borderColor = isDark ? '#1c1c1c' : '#f0f0f0';
  const focusColor = isDark ? '#ffffff' : '#111111';
  const focusRing = isDark ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.16)';

  return createTheme({
    palette: {
      mode,
      primary: { main: '#0d9488', light: '#14b8a6', dark: '#0f766e' },
      secondary: { main: isDark ? '#9ca3af' : '#6b7280' },
      success: { main: '#10b981', light: isDark ? '#064e3b' : '#d1fae5' },
      error: { main: '#ef4444', light: isDark ? '#7f1d1d' : '#fee2e2' },
      warning: { main: '#f59e0b', light: isDark ? '#78350f' : '#fef3c7' },
      info: { main: '#3b82f6', light: isDark ? '#1e3a5f' : '#dbeafe' },
      background: {
        default: isDark ? '#000000' : '#ffffff',
        paper: isDark ? '#111111' : '#ffffff',
      },
      text: {
        primary: isDark ? '#f5f5f5' : '#111111',
        secondary: isDark ? '#777777' : '#888888',
      },
      divider: borderColor,
    },
    typography: {
      fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      h4: { fontWeight: 700, letterSpacing: '-0.025em' },
      h5: { fontWeight: 700, letterSpacing: '-0.015em' },
      h6: { fontWeight: 600, letterSpacing: '-0.01em' },
      subtitle1: { fontWeight: 500, fontSize: '0.938rem' },
      subtitle2: { fontWeight: 600, fontSize: '0.813rem' },
      body1: { fontSize: '0.875rem' },
      body2: { fontSize: '0.813rem' },
      caption: { fontSize: '0.75rem', letterSpacing: '0.02em' },
      overline: { fontSize: '0.625rem', letterSpacing: '0.1em', fontWeight: 700, textTransform: 'uppercase' },
      button: { textTransform: 'none', fontWeight: 600, fontSize: '0.875rem' },
    },
    shape: { borderRadius: 12 },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          body: { transition: 'background-color 0.25s ease, color 0.25s ease' },
          '*': { WebkitTapHighlightColor: 'transparent' },
        },
      },
      MuiCard: {
        styleOverrides: {
          root: {
            borderRadius: 16,
            boxShadow: isDark ? 'none' : '0 1px 3px rgba(0,0,0,0.04)',
            border: `1px solid ${borderColor}`,
            backgroundImage: 'none',
            transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
          },
        },
      },
      MuiButton: {
        styleOverrides: {
          root: { borderRadius: 10, padding: '10px 24px' },
          contained: {
            boxShadow: 'none',
            '&:hover': { boxShadow: 'none' },
          },
          outlined: { borderColor: isDark ? '#333' : '#e0e0e0' },
        },
      },
      MuiChip: {
        styleOverrides: { root: { borderRadius: 8, fontWeight: 500, fontSize: '0.75rem' } },
      },
      MuiMenuItem: {
        styleOverrides: {
          root: {
            '&.Mui-selected': {
              backgroundColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)',
            },
            '&.Mui-selected:hover': {
              backgroundColor: isDark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.12)',
            },
          },
        },
      },
      MuiTextField: {
        styleOverrides: {
          root: { '& .MuiOutlinedInput-root': { borderRadius: 10 } },
        },
      },
      MuiOutlinedInput: {
        styleOverrides: {
          root: {
            borderRadius: 10,
            transition: 'box-shadow 0.2s ease, border-color 0.2s ease',
            '& .MuiOutlinedInput-notchedOutline': {
              borderColor: isDark ? '#2a2a2a' : '#d9d9d9',
            },
            '&:hover .MuiOutlinedInput-notchedOutline': {
              borderColor: focusColor,
            },
            '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
              borderColor: focusColor,
              borderWidth: 1.5,
            },
            '&.Mui-focused': {
              boxShadow: `0 0 0 3px ${focusRing}`,
            },
          },
        },
      },
      MuiInputLabel: {
        styleOverrides: {
          root: {
            '&.Mui-focused': {
              color: focusColor,
            },
          },
        },
      },
      MuiInput: {
        styleOverrides: {
          underline: {
            '&:before': {
              borderBottomColor: isDark ? '#2a2a2a' : '#d9d9d9',
            },
            '&:hover:not(.Mui-disabled):before': {
              borderBottomColor: focusColor,
            },
            '&:after': {
              borderBottomColor: focusColor,
            },
          },
        },
      },
      MuiDialog: {
        styleOverrides: {
          paper: {
            borderRadius: 20, padding: 8, backgroundImage: 'none',
            '&::-webkit-scrollbar': { display: 'none' },
            scrollbarWidth: 'none',
            msOverflowStyle: 'none',
          },
        },
      },
      MuiDialogContent: {
        styleOverrides: {
          root: {
            '&::-webkit-scrollbar': { display: 'none' },
            scrollbarWidth: 'none',
            msOverflowStyle: 'none',
          },
        },
      },
      MuiBottomNavigation: {
        styleOverrides: {
          root: {
            height: 64,
            backgroundImage: 'none',
            backgroundColor: isDark ? '#000000' : '#ffffff',
            borderTop: `1px solid ${borderColor}`,
          },
        },
      },
      MuiDrawer: { styleOverrides: { paper: { backgroundImage: 'none' } } },
      MuiAppBar: { styleOverrides: { root: { backgroundImage: 'none' } } },
      MuiPaper: { styleOverrides: { root: { backgroundImage: 'none' } } },
      MuiTab: { styleOverrides: { root: { textTransform: 'none', fontWeight: 600 } } },
      MuiSkeleton: {
        styleOverrides: {
          root: { borderRadius: 12, backgroundColor: isDark ? '#1a1a1a' : '#f5f5f5' },
        },
      },
    },
  });
}
