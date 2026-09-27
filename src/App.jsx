import { useEffect, useMemo, Suspense, lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider, CssBaseline } from '@mui/material';
import { Snackbar, Alert, Dialog, DialogContent, DialogActions, Button, Typography, Box } from '@mui/material';
import { useAuthStore } from './store/authStore';
import { useAppStore } from './store/appStore';
import { buildTheme } from './theme';
import AppLayout from './components/layout/AppLayout';
import AuthPage from './features/auth/AuthPage';
import InstallPrompt from './components/InstallPrompt';
import InfiniteSpinner from './components/InfiniteSpinner';
import ErrorBoundary from './components/ErrorBoundary';

// Lazy load feature modules
const IEDashboard = lazy(() => import('./features/income-expense/Dashboard'));
const HomeDashboard = lazy(() => import('./features/home/Dashboard'));
const AddTransaction = lazy(() => import('./features/income-expense/AddTransaction'));
const Transactions = lazy(() => import('./features/income-expense/Transactions'));
const MFSection = lazy(() => import('./features/mutual-funds/MFSection'));
const AddFund = lazy(() => import('./features/mutual-funds/AddFund'));
const FundAnalytics = lazy(() => import('./features/mutual-funds/Analytics'));
const PSXSection = lazy(() => import('./features/psx-stocks/PSXSection'));
const SharesPage = lazy(() => import('./features/psx-stocks/SharesPage'));
const StockTransactions = lazy(() => import('./features/psx-stocks/StockTransactions'));
const StockAnalytics = lazy(() => import('./features/psx-stocks/Analytics'));
const StockResearch = lazy(() => import('./features/psx-stocks/Research'));
const StockTools = lazy(() => import('./features/psx-stocks/Tools'));

const Loader = () => <InfiniteSpinner size={80} minHeight="50vh" />;

/** One boundary and one suspense fence per route, so a crash or a failed chunk
 *  load takes down that screen and not the whole shell — the nav stays usable. */
const page = (Element) => (
  <ErrorBoundary>
    <Suspense fallback={<Loader />}><Element /></Suspense>
  </ErrorBoundary>
);
const FullLoader = () => <InfiniteSpinner size={96} minHeight="100dvh" showBrand />;

function ProtectedRoute({ children }) {
  const user = useAuthStore((s) => s.user);
  const loading = useAuthStore((s) => s.loading);
  if (loading) return <FullLoader />;
  if (!user) return <Navigate to="/auth" replace />;
  return children;
}

export default function App() {
  const initialize = useAuthStore((s) => s.initialize);
  const user = useAuthStore((s) => s.user);
  const loading = useAuthStore((s) => s.loading);
  const themeMode = useAppStore((s) => s.themeMode);
  const snackbar = useAppStore((s) => s.snackbar);
  const hideSnackbar = useAppStore((s) => s.hideSnackbar);
  const confirmDialog = useAppStore((s) => s.confirmDialog);
  const hideConfirm = useAppStore((s) => s.hideConfirm);

  const theme = useMemo(() => buildTheme(themeMode), [themeMode]);

  useEffect(() => { initialize(); }, [initialize]);

  // Remove the HTML initial-loader once React takes over
  useEffect(() => {
    const el = document.getElementById('initial-loader');
    if (el) el.remove();
  }, []);

  if (loading) return <FullLoader />;

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Routes>
        <Route
          path="/auth"
          element={user ? <Navigate to="/home" replace /> : <ErrorBoundary><AuthPage /></ErrorBoundary>}
        />
        <Route path="/" element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
          <Route index element={page(IEDashboard)} />
          <Route path="home" element={page(HomeDashboard)} />
          {/* Income/Expense (Finance) — keep "/" paths for backward compatibility */}
          <Route path="add-transaction" element={page(AddTransaction)} />
          <Route path="transactions" element={page(Transactions)} />
          {/* Mutual Funds */}
          <Route path="funds" element={page(MFSection)} />
          <Route path="funds/add" element={page(AddFund)} />
          <Route path="funds/analytics" element={page(FundAnalytics)} />
          {/* PSX Stocks */}
          <Route path="stocks" element={page(PSXSection)} />
          <Route path="stocks/shares" element={page(SharesPage)} />
          <Route path="stocks/transactions" element={page(StockTransactions)} />
          <Route path="stocks/analytics" element={page(StockAnalytics)} />
          <Route path="stocks/research" element={page(StockResearch)} />
          <Route path="stocks/tools" element={page(StockTools)} />
        </Route>
        {/* Anything else — a stale bookmark, a typo, a link from an older
            version — lands on the dashboard rather than a blank screen. */}
        <Route path="*" element={<Navigate to={user ? '/home' : '/auth'} replace />} />
      </Routes>

      {/* Global Snackbar */}
      <InstallPrompt />
      <Snackbar open={snackbar.open} autoHideDuration={3000} onClose={hideSnackbar}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert onClose={hideSnackbar} severity={snackbar.severity} variant="filled" sx={{ borderRadius: 3 }}>
          {snackbar.message}
        </Alert>
      </Snackbar>

      {/* Confirmation Dialog */}
      <Dialog open={confirmDialog.open} onClose={hideConfirm} maxWidth="xs" fullWidth
        PaperProps={{ sx: { borderRadius: 4, p: 0 } }}>
        <DialogContent sx={{ pt: 4, pb: 2 }}>
          <Box sx={{ textAlign: 'center' }}>
            <Box sx={{
              width: 48, height: 48, borderRadius: '14px', display: 'flex',
              alignItems: 'center', justifyContent: 'center', mx: 'auto', mb: 2,
              bgcolor: themeMode === 'dark' ? 'rgba(220,38,38,0.1)' : 'rgba(220,38,38,0.06)',
            }}>
              <Box component="span" sx={{ fontSize: '1.3rem' }}>⚠</Box>
            </Box>
            <Typography sx={{ fontSize: '0.95rem', fontWeight: 700, mb: 0.5 }}>
              {confirmDialog.title}
            </Typography>
            <Typography sx={{ fontSize: '0.78rem', color: 'text.secondary', lineHeight: 1.5 }}>
              {confirmDialog.message}
            </Typography>
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 3, gap: 1 }}>
          <Button onClick={hideConfirm} color="inherit"
            sx={{
              flex: 1, borderRadius: 2.5, py: 1.2, fontSize: '0.82rem', fontWeight: 600,
              bgcolor: themeMode === 'dark' ? 'rgba(255,255,255,0.06)' : '#f5f5f5',
              '&:hover': { bgcolor: themeMode === 'dark' ? 'rgba(255,255,255,0.1)' : '#eee' },
            }}>
            Cancel
          </Button>
          <Button onClick={() => { confirmDialog.onConfirm?.(); hideConfirm(); }}
            variant="contained"
            sx={{
              flex: 1, borderRadius: 2.5, py: 1.2, fontSize: '0.82rem', fontWeight: 600,
              bgcolor: '#dc2626',
              '&:hover': { bgcolor: '#b91c1c' },
            }}>
            Confirm
          </Button>
        </DialogActions>
      </Dialog>
    </ThemeProvider>
  );
}
