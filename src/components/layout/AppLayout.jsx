import { useState, useMemo, useEffect, useCallback } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Box, Typography, IconButton, Avatar, useMediaQuery, useTheme, Tooltip,
  BottomNavigation, BottomNavigationAction,
} from '@mui/material';
import {
  Home, LayoutDashboard, CandlestickChart, PieChart, Plus,
  ReceiptText, TrendingUp, Compass, Wallet, FlaskConical, Wrench,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../../store/authStore';
import { useAppStore } from '../../store/appStore';
import FintraxaLogo from '../FintraxaLogo';
import ProfilePanel from '../ProfilePanel';
import PullToRefresh from '../PullToRefresh';
import SubNav from '../SubNav';
import { clickable } from '../../lib/a11y';

/* Icons are lucide here and across the auth screen — the app chrome is one
   coherent outline-weight layer. Feature pages keep the MUI Rounded set, and
   `categories.icon` must stay MUI: the column stores MUI icon *names*
   ('Work', 'Restaurant', …) chosen by the user, so swapping that picker would
   orphan every saved category. */
const icon = (I) => <I size={19} strokeWidth={1.9} />;
const pageIcon = (I) => <I size={18} strokeWidth={1.9} />;

/* ─── Section Definitions ─── */
const sections = [
  {
    id: 'home',
    label: 'Home',
    navLabel: 'Home',
    icon: icon(Home),
    basePath: '/home',
    pages: [
      { label: 'Dashboard', path: '/home', icon: pageIcon(Home) },
    ],
  },
  {
    id: 'finance',
    label: 'Finance',
    navLabel: 'Personal Finance',
    icon: icon(Wallet),
    basePath: '/',
    pages: [
      { label: 'Dashboard', path: '/', icon: pageIcon(LayoutDashboard) },
      { label: 'Add', path: '/add-transaction', icon: pageIcon(Plus) },
      { label: 'Transactions', path: '/transactions', icon: pageIcon(ReceiptText) },
    ],
  },
  {
    id: 'funds',
    label: 'Mutual Funds',
    navLabel: 'Mutual Funds',
    icon: icon(PieChart),
    basePath: '/funds',
    pages: [
      { label: 'Portfolio', path: '/funds', icon: pageIcon(PieChart) },
      { label: 'Add Fund', path: '/funds/add', icon: pageIcon(Plus) },
      { label: 'Analytics', path: '/funds/analytics', icon: pageIcon(TrendingUp) },
    ],
  },
  {
    id: 'stocks',
    label: 'PSX Stocks',
    navLabel: 'PSX Equities',
    icon: icon(CandlestickChart),
    basePath: '/stocks',
    pages: [
      { label: 'Portfolio', path: '/stocks', icon: pageIcon(CandlestickChart) },
      { label: 'Shares', path: '/stocks/shares', icon: pageIcon(Compass) },
      { label: 'Trades', path: '/stocks/transactions', icon: pageIcon(ReceiptText) },
      { label: 'Analytics', path: '/stocks/analytics', icon: pageIcon(TrendingUp) },
      { label: 'Research', path: '/stocks/research', icon: pageIcon(FlaskConical) },
      { label: 'Tools', path: '/stocks/tools', icon: pageIcon(Wrench) },
    ],
  },
];

/* ─── Glass Style Helper ─── */
const glass = (isDark, opacity = 0.6) => ({
  bgcolor: isDark ? `rgba(10,10,10,${opacity})` : `rgba(255,255,255,${opacity})`,
  backdropFilter: 'blur(24px) saturate(180%)',
  WebkitBackdropFilter: 'blur(24px) saturate(180%)',
  border: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'}`,
});

/* ─── Sidebar Width ─── */
const SIDEBAR_COLLAPSED = 62;
const SIDEBAR_EXPANDED = 200;

export default function AppLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const theme = useTheme();
  const queryClient = useQueryClient();
  const isDark = theme.palette.mode === 'dark';
  const isMobile = useMediaQuery('(max-width:768px)');
  const user = useAuthStore((s) => s.user);
  const loadUserPreferences = useAppStore((s) => s.loadUserPreferences);
  const fetchExchangeRates = useAppStore((s) => s.fetchExchangeRates);
  const [sidebarHovered, setSidebarHovered] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  /* Pull-to-refresh.
     This used to `window.location.reload()` behind an artificial 600 ms wait:
     a full document reload, re-downloading the bundle, re-running auth and
     throwing away every cached query — to refresh one screen. Refetching the
     active queries gets the same data, keeps the app mounted, and resolves as
     soon as the network does rather than after a fixed delay. */
  const handlePullRefresh = useCallback(
    () => queryClient.refetchQueries({ type: 'active' }),
    [queryClient],
  );

  /* Load user prefs & exchange rates on mount */
  useEffect(() => {
    if (user?.id) loadUserPreferences(user.id);
    fetchExchangeRates();
  }, [user?.id, loadUserPreferences, fetchExchangeRates]);

  /* Which section is active */
  const activeSection = useMemo(() => {
    const path = location.pathname;
    if (path.startsWith('/home')) return 'home';
    if (path.startsWith('/stocks')) return 'stocks';
    if (path.startsWith('/funds')) return 'funds';
    return 'finance';
  }, [location.pathname]);

  const isHomeSection = activeSection === 'home';
  const currentSection = sections.find((s) => s.id === activeSection);

  /* Mobile tab index */
  const currentTab = useMemo(
    () => Math.max(0, sections.findIndex((s) => s.id === activeSection)),
    [activeSection],
  );

  const isPageActive = (path) => (path === '/' ? location.pathname === '/' : location.pathname === path);
  const sidebarW = sidebarHovered ? SIDEBAR_EXPANDED : SIDEBAR_COLLAPSED;

  /* Funds and Stocks carry their own tab strip inside the swipe carousel;
     Finance has no carousel, so its three pages need chips of their own. */
  const mobileSubNav = isMobile && activeSection === 'finance' ? currentSection.pages : null;

  const focusRing = {
    '&:focus-visible': {
      outline: `2px solid ${isDark ? '#fff' : '#000'}`,
      outlineOffset: 2,
    },
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100dvh', position: 'relative' }}>
      {/* Keyboard and screen-reader users land on the nav on every route
          change; this lets them jump past it to the page itself. */}
      <Box
        component="a"
        href="#main-content"
        sx={{
          position: 'absolute', left: 12, top: -60, zIndex: 2000,
          px: 2, py: 1, borderRadius: 2, fontSize: '0.8rem', fontWeight: 700,
          bgcolor: 'background.paper', color: 'text.primary',
          border: '1px solid', borderColor: 'divider', textDecoration: 'none',
          transition: 'top .15s ease',
          '&:focus': { top: 12 },
        }}
      >
        Skip to content
      </Box>

      {/* ═══════════════════════════════════════════
          DESKTOP: Floating Navbar + Floating Sidebar
          ═══════════════════════════════════════════ */}
      {!isMobile && (
        <>
          {/* ─── Floating Top Navbar ─── */}
          <Box
            component="nav"
            aria-label="Main"
            sx={{
              position: 'fixed',
              top: 16,
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 1300,
              display: 'grid',
              gridTemplateColumns: 'auto 1fr auto',
              alignItems: 'center',
              columnGap: 1,
              px: 2.25,
              py: 1,
              borderRadius: '9999px',
              ...glass(isDark, 0.62),
              backdropFilter: 'blur(32px) saturate(185%)',
              WebkitBackdropFilter: 'blur(32px) saturate(185%)',
              boxShadow: isDark
                ? '0 18px 52px rgba(0,0,0,0.62), 0 6px 20px rgba(0,0,0,0.36), inset 0 1px 0 rgba(255,255,255,0.06)'
                : '0 18px 52px rgba(0,0,0,0.15), 0 6px 20px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.82)',
              width: 'min(1160px, calc(100vw - 32px))',
            }}
          >
            {/* Logo */}
            <Box
              {...clickable(() => navigate('/home'), { label: 'Fintraxa home' })}
              sx={{
                display: 'flex', alignItems: 'center', gap: 1, cursor: 'pointer',
                mr: 1.25, pr: 1.75, borderRadius: 2,
                borderRight: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'}`,
                ...focusRing,
              }}
            >
              <FintraxaLogo size={26} />
              <Typography sx={{
                fontSize: '0.95rem', fontWeight: 800, letterSpacing: '-0.04em',
                color: 'text.primary',
              }}>
                Fintraxa
              </Typography>
            </Box>

            {/* Centered Section Buttons */}
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 1 }}>
              {sections.map((sec) => {
                const isActive = activeSection === sec.id;
                return (
                  <Tooltip key={sec.id} title={sec.label} arrow>
                    <Box
                      {...clickable(() => navigate(sec.basePath), { label: sec.label, selected: isActive })}
                      sx={{
                        height: 40,
                        px: 1.35,
                        borderRadius: '9999px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 0.9,
                        cursor: 'pointer',
                        color: isActive ? (isDark ? '#000' : '#fff') : 'text.secondary',
                        bgcolor: isActive ? (isDark ? '#fff' : '#000') : 'transparent',
                        border: `1px solid ${isActive
                          ? (isDark ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.7)')
                          : (isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)')}`,
                        transition: 'background-color 0.2s ease, color 0.2s ease, transform 0.2s ease',
                        '&:hover': {
                          bgcolor: isActive
                            ? (isDark ? 'rgba(255,255,255,0.88)' : 'rgba(0,0,0,0.86)')
                            : (isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)'),
                          color: isActive ? (isDark ? '#000' : '#fff') : 'text.primary',
                          transform: 'translateY(-1px)',
                        },
                        '@media (prefers-reduced-motion: reduce)': {
                          transition: 'none',
                          '&:hover': { transform: 'none' },
                        },
                        ...focusRing,
                      }}
                    >
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {sec.icon}
                      </Box>
                      <Typography sx={{
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        letterSpacing: '0.025em',
                        textTransform: 'uppercase',
                        whiteSpace: 'nowrap',
                      }}>
                        {sec.navLabel}
                      </Typography>
                    </Box>
                  </Tooltip>
                );
              })}
            </Box>

            {/* Right: Profile Avatar only */}
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 0.5 }}>
              <Tooltip title="Profile" arrow>
                <IconButton
                  onClick={() => setProfileOpen(true)}
                  aria-label="Open profile and settings"
                  sx={{
                    width: 38, height: 38, borderRadius: 2.5,
                    transition: 'transform 0.2s ease',
                    '&:hover': { transform: 'scale(1.08)' },
                    '@media (prefers-reduced-motion: reduce)': { transition: 'none', '&:hover': { transform: 'none' } },
                  }}
                >
                  <Avatar sx={{ width: 28, height: 28, bgcolor: isDark ? '#fff' : '#000', color: isDark ? '#000' : '#fff', fontSize: '0.7rem', fontWeight: 700 }}>
                    {user?.email?.[0]?.toUpperCase() ?? '?'}
                  </Avatar>
                </IconButton>
              </Tooltip>
            </Box>
          </Box>

          {/* ─── Floating Sidebar (hidden on Home) ─── */}
          {!isHomeSection && (
            <Box
              component="nav"
              aria-label={`${currentSection?.label} pages`}
              onMouseEnter={() => setSidebarHovered(true)}
              onMouseLeave={() => setSidebarHovered(false)}
              onFocusCapture={() => setSidebarHovered(true)}
              onBlurCapture={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget)) setSidebarHovered(false);
              }}
              sx={{
                position: 'fixed',
                top: 90,
                left: 20,
                bottom: 20,
                width: sidebarW,
                zIndex: 1200,
                borderRadius: '28px',
                ...glass(isDark, 0.55),
                boxShadow: isDark
                  ? '0 22px 56px rgba(0,0,0,0.65), 0 8px 22px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.06)'
                  : '0 22px 56px rgba(0,0,0,0.14), 0 8px 22px rgba(0,0,0,0.07), inset 0 1px 0 rgba(255,255,255,0.75)',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                transition: 'width 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
              }}
            >
              {/* Section Header */}
              <Box sx={{
                px: 1.5, pt: 2.5, pb: 1.5,
                display: 'flex', alignItems: 'center', gap: 1.5,
                borderBottom: `1px solid ${isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)'}`,
                minHeight: 52,
              }}>
                <Box sx={{
                  width: 34, height: 34, borderRadius: 2, display: 'flex',
                  alignItems: 'center', justifyContent: 'center',
                  bgcolor: isDark ? '#fff' : '#000', color: isDark ? '#000' : '#fff', flexShrink: 0,
                }}>
                  {currentSection?.icon}
                </Box>
                <AnimatePresence>
                  {sidebarHovered && (
                    <motion.div
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -8 }}
                      transition={{ duration: 0.2 }}
                    >
                      <Typography sx={{
                        fontSize: '0.82rem', fontWeight: 700, color: 'text.primary',
                        whiteSpace: 'nowrap', letterSpacing: '-0.01em',
                      }}>
                        {currentSection?.label}
                      </Typography>
                    </motion.div>
                  )}
                </AnimatePresence>
              </Box>

              {/* Page Links */}
              <Box sx={{ flex: 1, py: 1.5, px: 1, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                {currentSection?.pages.map((page) => {
                  const isActive = isPageActive(page.path);
                  return (
                    <Tooltip key={page.path} title={sidebarHovered ? '' : page.label} placement="right" arrow>
                      <Box
                        {...clickable(() => navigate(page.path), { label: page.label, selected: isActive })}
                        sx={{
                          display: 'flex', alignItems: 'center', justifyContent: sidebarHovered ? 'flex-start' : 'center', gap: 1.5,
                          px: sidebarHovered ? 1.5 : 0.5, py: 1.1,
                          borderRadius: 2.5, cursor: 'pointer', position: 'relative',
                          color: isActive ? (isDark ? '#000' : '#fff') : 'text.secondary',
                          bgcolor: isActive ? (isDark ? '#fff' : '#000') : 'transparent',
                          transition: 'background-color 0.15s ease, color 0.15s ease',
                          overflow: 'hidden', minHeight: 42,
                          '&:hover': {
                            bgcolor: isActive ? (isDark ? 'rgba(255,255,255,0.85)' : 'rgba(0,0,0,0.8)') : (isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)'),
                            color: isActive ? (isDark ? '#000' : '#fff') : 'text.primary',
                          },
                          ...(isActive && { boxShadow: isDark ? '0 4px 12px rgba(255,255,255,0.15)' : '0 4px 12px rgba(0,0,0,0.2)' }),
                          ...focusRing,
                        }}
                      >
                        <Box sx={{
                          flexShrink: 0, width: 26, height: 26,
                          display: 'grid', placeItems: 'center',
                        }}>
                          {page.icon}
                        </Box>
                        <AnimatePresence>
                          {sidebarHovered && (
                            <motion.span
                              initial={{ opacity: 0, x: -6 }}
                              animate={{ opacity: 1, x: 0 }}
                              exit={{ opacity: 0, x: -6 }}
                              transition={{ duration: 0.18 }}
                              style={{ whiteSpace: 'nowrap', fontSize: '0.78rem', fontWeight: isActive ? 600 : 500 }}
                            >
                              {page.label}
                            </motion.span>
                          )}
                        </AnimatePresence>
                      </Box>
                    </Tooltip>
                  );
                })}
              </Box>

              {/* Section Indicator Dots */}
              <Box aria-hidden sx={{
                px: 1, pb: 2, pt: 1,
                borderTop: `1px solid ${isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)'}`,
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.75,
              }}>
                {sections.filter((s) => s.id !== 'home').map((sec) => (
                  <Box
                    key={sec.id}
                    sx={{
                      width: sec.id === activeSection ? 18 : 6,
                      height: 6, borderRadius: 3,
                      bgcolor: sec.id === activeSection ? (isDark ? '#fff' : '#000') : (isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.1)'),
                      transition: 'all 0.25s ease',
                    }}
                  />
                ))}
              </Box>
            </Box>
          )}
        </>
      )}

      {/* ═══════════════════════════════════════════
          MOBILE: Full-bleed Header + Bottom Nav
          ═══════════════════════════════════════════ */}
      {isMobile && (
        <Box
          component="header"
          sx={{
            position: 'fixed', top: 0, left: 0, right: 0, zIndex: 1200,
            display: 'flex', alignItems: 'center',
            px: 1.75,
            pt: 'calc(env(safe-area-inset-top, 0px) + 8px)',
            pb: 1,
            minHeight: 'calc(env(safe-area-inset-top, 0px) + 52px)',
            bgcolor: isDark ? 'rgba(0,0,0,0.85)' : 'rgba(255,255,255,0.85)',
            backdropFilter: 'blur(28px) saturate(180%)',
            WebkitBackdropFilter: 'blur(28px) saturate(180%)',
            borderBottom: `0.5px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'}`,
          }}
        >
          {isHomeSection ? (
            <>
              <FintraxaLogo size={30} sx={{ mr: 1 }} />
              <Typography sx={{ flex: 1, fontSize: '1.05rem', fontWeight: 800, letterSpacing: '-0.04em', color: 'text.primary' }}>
                Fintraxa
              </Typography>
            </>
          ) : (
            <>
              <Box sx={{
                width: 30, height: 30, borderRadius: 2, display: 'flex',
                alignItems: 'center', justifyContent: 'center',
                bgcolor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)',
                color: 'text.primary', mr: 1,
              }}>
                {currentSection?.icon}
              </Box>
              <Typography sx={{ flex: 1, fontSize: '0.95rem', fontWeight: 700, letterSpacing: '-0.03em', color: 'text.primary' }}>
                {currentSection?.label}
              </Typography>
            </>
          )}
          <IconButton size="small" onClick={() => setProfileOpen(true)} aria-label="Open profile and settings" sx={{ p: 0.5 }}>
            <Avatar sx={{ width: 30, height: 30, bgcolor: isDark ? '#fff' : '#000', color: isDark ? '#000' : '#fff', fontSize: '0.7rem', fontWeight: 700 }}>
              {user?.email?.[0]?.toUpperCase() ?? '?'}
            </Avatar>
          </IconButton>
        </Box>
      )}

      {/* ─── Main Content ─── */}
      <Box sx={{
        flex: 1,
        ml: isMobile ? 0 : (isHomeSection ? 0 : `${SIDEBAR_COLLAPSED + 40}px`),
        mt: isMobile ? 'calc(env(safe-area-inset-top, 0px) + 52px)' : '88px',
        display: 'flex', flexDirection: 'column', minHeight: 0,
      }}>
        <Box
          id="main-content"
          component="main"
          sx={{
            flex: 1,
            px: { xs: 1, sm: 1.5, md: 3 },
            pt: { xs: 1, md: 3 },
            pb: isMobile ? 'calc(60px + env(safe-area-inset-bottom, 0px) + 8px)' : 3,
            maxWidth: 1000, width: '100%', mx: 'auto',
          }}
        >
          {isMobile ? (
            <PullToRefresh onRefresh={handlePullRefresh}>
              {mobileSubNav && <SubNav links={mobileSubNav} />}
              <Outlet />
            </PullToRefresh>
          ) : (
            <Outlet />
          )}
        </Box>
      </Box>

      {/* ─── Mobile Bottom Nav ─── */}
      {isMobile && (
        <Box sx={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 1200 }}>
          <BottomNavigation
            value={currentTab}
            onChange={(_, v) => navigate(sections[v].basePath)}
            showLabels
            sx={{
              bgcolor: isDark ? 'rgba(0,0,0,0.92)' : 'rgba(255,255,255,0.92)',
              backdropFilter: 'blur(32px) saturate(180%)',
              WebkitBackdropFilter: 'blur(32px) saturate(180%)',
              border: 'none',
              borderTop: `0.5px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)'}`,
              height: 54,
              '& .MuiBottomNavigationAction-root': {
                minWidth: 0, gap: 0.15, py: 0.5, bgcolor: 'transparent',
                color: isDark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.3)',
                transition: 'color 0.2s ease',
                '&.Mui-selected': { color: isDark ? '#fff' : '#000' },
              },
              '& .MuiBottomNavigationAction-label': {
                fontSize: '0.54rem', fontWeight: 600, letterSpacing: '0.02em',
                '&.Mui-selected': { fontSize: '0.54rem', fontWeight: 700 },
              },
            }}
          >
            {sections.map((s) => (
              <BottomNavigationAction key={s.id} label={s.label} icon={s.icon} />
            ))}
          </BottomNavigation>
          {/* Safe area spacer below nav — matches bg for both themes */}
          <Box sx={{
            height: 'env(safe-area-inset-bottom, 0px)',
            bgcolor: isDark ? '#000' : '#fff',
          }} />
        </Box>
      )}

      {/* ─── Profile Panel ─── */}
      <ProfilePanel open={profileOpen} onClose={() => setProfileOpen(false)} />
    </Box>
  );
}
