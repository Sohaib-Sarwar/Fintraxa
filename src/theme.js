import { createTheme } from '@mui/material/styles';

export function buildTheme(mode = 'light') {
  const isDark = mode === 'dark';
  const borderColor = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(10,12,16,0.08)';
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
        default: isDark ? '#000000' : '#f4f5f6',
        paper: isDark ? '#0c0c0d' : '#ffffff',
      },
      text: {
        primary: isDark ? '#f5f5f5' : '#111111',
        // #777 on #000 is 4.1:1 and #888 on #fff is 3.5:1 — both below the
        // 4.5:1 WCAG AA minimum for body text, and this colour carries the
        // dates, units and sub-labels on every card. Nudged to clear it.
        secondary: isDark ? '#9a9a9a' : '#6b6b6b',
      },
      divider: borderColor,
    },
    typography: {
      // Text: Monety (body) and Artonex (headings), loaded from public/fonts
      // once licensed files are added; Inter until then. Figures: Inter Tight
      // with tabular digits (see '.currency, [data-numeric]' below).
      fontFamily: "'Monety', 'Inter Variable', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      h4: { fontWeight: 700, letterSpacing: '-0.025em', fontFamily: "'Artonex', 'Monety', 'Inter Variable', 'Inter', sans-serif" },
      h5: { fontWeight: 700, letterSpacing: '-0.015em', fontFamily: "'Artonex', 'Monety', 'Inter Variable', 'Inter', sans-serif" },
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
          body: { transition: 'background-color 0.25s ease, color 0.25s ease', fontFeatureSettings: "'cv11', 'ss01'" },
          '*': { WebkitTapHighlightColor: 'transparent' },
          // Figures are compared down a column all over this app — holdings,
          // transactions, P&L. Proportional digits make those columns ragged.
          '.currency, [data-numeric]': { fontVariantNumeric: 'tabular-nums', fontFamily: "'Inter Tight Variable', 'Inter Tight', 'Inter Variable', 'Inter', sans-serif", letterSpacing: '-0.01em' },
          '.recharts-text': { fontFamily: "'Inter Tight Variable', 'Inter Tight', 'Inter Variable', 'Inter', sans-serif" },
        },
      },
      MuiCard: {
        styleOverrides: {
          root: {
            borderRadius: 20,
            boxShadow: isDark ? 'none' : '0 1px 2px rgba(10,12,16,.04), 0 6px 20px -8px rgba(10,12,16,.08)',
            border: `1px solid ${borderColor}`,
            backgroundImage: 'none',
            transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
          },
        },
      },
      MuiButton: {
        styleOverrides: {
          // 44px is the smallest comfortable touch target; the default dense
          // button fell under it on phones.
          root: { borderRadius: 10, padding: '10px 24px', minHeight: 40 },
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
      MuiIconButton: {
        styleOverrides: {
          root: {
            '&:focus-visible': { outline: `2px solid ${focusColor}`, outlineOffset: 2 },
          },
        },
      },
      MuiTooltip: {
        defaultProps: {
          // Tooltips carry real information here (the freshness tooltip, the
          // collapsed sidebar labels) and a touch user could not reach any of
          // it without a long press that gave no feedback.
          enterTouchDelay: 200,
          leaveTouchDelay: 4000,
        },
      },
    },
  });
}
