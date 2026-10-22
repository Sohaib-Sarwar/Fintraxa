import { Suspense, lazy, useMemo } from 'react';
import { useMediaQuery } from '@mui/material';
import { useLocation } from 'react-router-dom';
import SwipeablePages from '../../components/SwipeablePages';
import InfiniteSpinner from '../../components/InfiniteSpinner';

const Dashboard = lazy(() => import('./Dashboard'));
const SharesPage = lazy(() => import('./SharesPage'));
const StockTransactions = lazy(() => import('./StockTransactions'));
const Analytics = lazy(() => import('./Analytics'));
const Research = lazy(() => import('./Research'));
const Tools = lazy(() => import('./Tools'));

const Loader = () => <InfiniteSpinner size={64} minHeight="40vh" />;
const wrap = (El) => <Suspense fallback={<Loader />}><El /></Suspense>;

/* See MFSection: every `/stocks/*` path routes here so the phone carousel and
   the address bar agree. Research and Tools were previously unreachable on
   mobile — the bottom tab only goes to `/stocks`, and nothing on that screen
   linked any deeper. */
const PAGES = [
  { label: 'Portfolio', path: '/stocks', component: wrap(Dashboard) },
  { label: 'Shares', path: '/stocks/shares', component: wrap(SharesPage) },
  { label: 'Trades', path: '/stocks/transactions', component: wrap(StockTransactions) },
  { label: 'Analytics', path: '/stocks/analytics', component: wrap(Analytics) },
  { label: 'Research', path: '/stocks/research', component: wrap(Research) },
  { label: 'Tools', path: '/stocks/tools', component: wrap(Tools) },
];

export default function PSXSection() {
  const isMobile = useMediaQuery('(max-width:768px)');
  const { pathname } = useLocation();

  const current = useMemo(
    () => PAGES.find((p) => p.path === pathname) ?? PAGES[0],
    [pathname],
  );

  if (!isMobile) return current.component;

  return <SwipeablePages pages={PAGES} />;
}
