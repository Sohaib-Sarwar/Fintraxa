import { useState, useMemo, useEffect, useCallback } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Box, Typography, IconButton, Avatar, useMediaQuery, useTheme, Tooltip,
  BottomNavigation, BottomNavigationAction,
} from '@mui/material';
import {
  HomeRounded as HomeIcon,
  SpaceDashboardRounded as DashboardIcon,
  CandlestickChartRounded as StocksIcon,
  PieChartRounded as FundsIcon,
  AddCircleOutlineRounded as AddIcon,
  ReceiptLongRounded as TransactionsIcon,
  QueryStatsRounded as AnalyticsIcon,
  ExploreRounded as BrowseIcon,
  AccountBalanceWalletRounded as WalletIcon,
  ScienceRounded as ResearchIcon,
  BuildRounded as ToolsIcon,
} from '@mui/icons-material';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuthStore } from '../../store/authStore';
import { useAppStore } from '../../store/appStore';
import FintraxaLogo from '../FintraxaLogo';
import ProfilePanel from '../ProfilePanel';
import PullToRefresh from '../PullToRefresh';

/* ─── Section Definitions ─── */
const sections = [
  {
    id: 'home',
    label: 'Home',
    navLabel: 'Home',
    icon: <HomeIcon />,
    basePath: '/home',
    pages: [
      { label: 'Dashboard', path: '/home', icon: <HomeIcon sx={{ fontSize: 20 }} /> },
    ],
  },
  {
    id: 'finance',
    label: 'Finance',
    navLabel: 'Personal Finance',
    icon: <WalletIcon />,
    basePath: '/',
    pages: [
      { label: 'Dashboard', path: '/', icon: <DashboardIcon sx={{ fontSize: 20 }} /> },
      { label: 'Add', path: '/add-transaction', icon: <AddIcon sx={{ fontSize: 20 }} /> },
      { label: 'Transactions', path: '/transactions', icon: <TransactionsIcon sx={{ fontSize: 20 }} /> },
    ],
  },
  {
    id: 'funds',
    label: 'Mutual Funds',
    navLabel: 'Mutual Funds',
    icon: <FundsIcon />,
    basePath: '/funds',
    pages: [
      { label: 'Portfolio', path: '/funds', icon: <FundsIcon sx={{ fontSize: 20 }} /> },
      { label: 'Add Fund', path: '/funds/add', icon: <AddIcon sx={{ fontSize: 20 }} /> },
      { label: 'Analytics', path: '/funds/analytics', icon: <AnalyticsIcon sx={{ fontSize: 20 }} /> },
    ],
  },
  {
    id: 'stocks',
    label: 'PSX Stocks',
    navLabel: 'PSX Equities',
    icon: <StocksIcon />,
    basePath: '/stocks',
    pages: [
      { label: 'Portfolio', path: '/stocks', icon: <StocksIcon sx={{ fontSize: 20 }} /> },
      { label: 'Shares', path: '/stocks/shares', icon: <BrowseIcon sx={{ fontSize: 20 }} /> },
      { label: 'Trades', path: '/stocks/transactions', icon: <TransactionsIcon sx={{ fontSize: 20 }} /> },
      { label: 'Analytics', path: '/stocks/analytics', icon: <AnalyticsIcon sx={{ fontSize: 20 }} /> },
      { label: 'Research', path: '/stocks/research', icon: <ResearchIcon sx={{ fontSize: 20 }} /> },
      { label: 'Tools', path: '/stocks/tools', icon: <ToolsIcon sx={{ fontSize: 20 }} /> },
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
  const isDark = theme.palette.mode === 'dark';
  const isMobile = useMediaQuery('(max-width:768px)');
  const user = useAuthStore((s) => s.user);
  const loadUserPreferences = useAppStore((s) => s.loadUserPreferences);
  const fetchExchangeRates = useAppStore((s) => s.fetchExchangeRates);
  const [sidebarHovered, setSidebarHovered] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  /* Pull-to-refresh handler — reloads current page data */
  const handlePullRefresh = useCallback(async () => {
    await new Promise((r) => setTimeout(r, 600));
    window.location.reload();
  }, []);

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
  const currentTab = useMemo(() => {
    const idx = sections.findIndex((s) =>
      s.pages.some((p) => (p.path === '/' ? location.pathname === '/' : location.pathname.startsWith(p.path)))
    );
    return idx >= 0 ? idx : 0;
  }, [location.pathname]);

  const isPageActive = (path) => path === '/' ? location.pathname === '/' : location.pathname === path;
  const sidebarW = sidebarHovered ? SIDEBAR_EXPANDED : SIDEBAR_COLLAPSED;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100dvh', position: 'relative' }}>

      {/* ═══════════════════════════════════════════
          DESKTOP: Floating Navbar + Floating Sidebar
          ═══════════════════════════════════════════ */}
      {!isMobile && (
        <>
          {/* ─── Floating Top Navbar ─── */}
          <Box
            component="nav"
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
              onClick={() => navigate('/home')}
              sx={{
                display: 'flex', alignItems: 'center', gap: 1, cursor: 'pointer',
                mr: 1.25, pr: 1.75,
                borderRight: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'}`,
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
                      onClick={() => navigate(sec.basePath)}
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
                        transition: 'all 0.2s ease',
                        '&:hover': {
                          bgcolor: isActive
                            ? (isDark ? 'rgba(255,255,255,0.88)' : 'rgba(0,0,0,0.86)')
                            : (isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)'),
                          color: isActive ? (isDark ? '#000' : '#fff') : 'text.primary',
                          transform: 'translateY(-1px)',
                        },
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
                  sx={{
                    width: 38, height: 38, borderRadius: 2.5,
                    transition: 'all 0.2s ease',
                    '&:hover': { transform: 'scale(1.08)' },
                  }}
                >
                  <Avatar sx={{ width: 28, height: 28, bgcolor: isDark ? '#fff' : '#000', color: isDark ? '#000' : '#fff', fontSize: '0.7rem', fontWeight: 700 }}>
                    {user?.email?.[0]?.toUpperCase()}
                  </Avatar>
                </IconButton>
              </Tooltip>
            </Box>
          </Box>

          {/* ─── Floating Sidebar (hidden on Home) ─── */}
          {!isHomeSection && <Box
            onMouseEnter={() => setSidebarHovered(true)}
            onMouseLeave={() => setSidebarHovered(false)}
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
                      onClick={() => navigate(page.path)}
                      sx={{
                        display: 'flex', alignItems: 'center', justifyContent: sidebarHovered ? 'flex-start' : 'center', gap: 1.5,
                        px: sidebarHovered ? 1.5 : 0.5, py: 1.1,
                        borderRadius: 2.5, cursor: 'pointer', position: 'relative',
                        color: isActive ? (isDark ? '#000' : '#fff') : 'text.secondary',
                        bgcolor: isActive ? (isDark ? '#fff' : '#000') : 'transparent',
                        transition: 'all 0.15s ease',
                        overflow: 'hidden', minHeight: 42,
                        '&:hover': {
                          bgcolor: isActive ? (isDark ? 'rgba(255,255,255,0.85)' : 'rgba(0,0,0,0.8)') : (isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)'),
                          color: isActive ? (isDark ? '#000' : '#fff') : 'text.primary',
                        },
                        ...(isActive && { boxShadow: isDark ? '0 4px 12px rgba(255,255,255,0.15)' : '0 4px 12px rgba(0,0,0,0.2)' }),
                      }}
                    >
                      <Box sx={{
                        flexShrink: 0,
                        width: 26,
                        height: 26,
                        display: 'grid',
                        placeItems: 'center',
                        '& .MuiSvgIcon-root': { fontSize: 20, display: 'block' },
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
            <Box sx={{
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
          </Box>}
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
                '& .MuiSvgIcon-root': { fontSize: 18 },
              }}>
                {currentSection?.icon}
              </Box>
              <Typography sx={{ flex: 1, fontSize: '0.95rem', fontWeight: 700, letterSpacing: '-0.03em', color: 'text.primary' }}>
                {currentSection?.label}
              </Typography>
            </>
          )}
          <IconButton size="small" onClick={() => setProfileOpen(true)} sx={{ p: 0.5 }}>
            <Avatar sx={{ width: 30, height: 30, bgcolor: isDark ? '#fff' : '#000', color: isDark ? '#000' : '#fff', fontSize: '0.7rem', fontWeight: 700 }}>
              {user?.email?.[0]?.toUpperCase()}
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
        <Box sx={{
          flex: 1,
          px: { xs: 1, sm: 1.5, md: 3 },
          pt: { xs: 1, md: 3 },
          pb: isMobile ? 'calc(60px + env(safe-area-inset-bottom, 0px) + 8px)' : 3,
          maxWidth: 1000, width: '100%', mx: 'auto',
        }}>
          {isMobile ? (
            <PullToRefresh onRefresh={handlePullRefresh}>
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
                '& .MuiSvgIcon-root': { fontSize: 21 },
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
