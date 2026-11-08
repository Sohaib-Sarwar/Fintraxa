import { Suspense, lazy, useMemo } from 'react';
import PageSkeleton from '../../components/PageSkeleton';
import { useMediaQuery } from '@mui/material';
import { useLocation } from 'react-router-dom';
import SwipeablePages from '../../components/SwipeablePages';

const Dashboard = lazy(() => import('./Dashboard'));
const AddFund = lazy(() => import('./AddFund'));
const Analytics = lazy(() => import('./Analytics'));
const Imports = lazy(() => import('./Imports'));
const MFTransactions = lazy(() => import('./MFTransactions'));

const wrap = (El) => <Suspense fallback={<PageSkeleton />}><El /></Suspense>;

/* The URL is the source of truth for which page is showing, on both layouts.
   `/funds/add` and `/funds/analytics` route here now rather than straight to
   the leaf component, so on a phone they open the carousel at the right tab
   instead of a dead-end page with no sub-navigation. */
const PAGES = [
  { label: 'Portfolio', path: '/funds', component: wrap(Dashboard) },
  { label: 'Add Fund', path: '/funds/add', component: wrap(AddFund) },
  { label: 'Analytics', path: '/funds/analytics', component: wrap(Analytics) },
  { label: 'Transactions', path: '/funds/transactions', component: wrap(MFTransactions) },
  { label: 'Imports', path: '/funds/imports', component: wrap(Imports) },
];

export default function MFSection() {
  const isMobile = useMediaQuery('(max-width:768px)');
  const { pathname } = useLocation();

  const current = useMemo(
    () => PAGES.find((p) => p.path === pathname) ?? PAGES[0],
    [pathname],
  );

  /* Desktop — the sidebar is the sub-navigation, so render just the one page. */
  if (!isMobile) return current.component;

  return <SwipeablePages pages={PAGES} />;
}
