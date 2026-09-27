import { Suspense, lazy } from 'react';
import { useMediaQuery } from '@mui/material';
import SwipeablePages from '../../components/SwipeablePages';
import InfiniteSpinner from '../../components/InfiniteSpinner';

const Dashboard = lazy(() => import('./Dashboard'));
const SharesPage = lazy(() => import('./SharesPage'));
const StockTransactions = lazy(() => import('./StockTransactions'));
const Analytics = lazy(() => import('./Analytics'));
const Research = lazy(() => import('./Research'));
const Tools = lazy(() => import('./Tools'));

const Loader = () => <InfiniteSpinner size={64} minHeight="40vh" />;

export default function PSXSection() {
  const isMobile = useMediaQuery('(max-width:768px)');

  /* Desktop — show Dashboard only (sidebar handles sub-page nav) */
  if (!isMobile) {
    return (
      <Suspense fallback={<Loader />}>
        <Dashboard />
      </Suspense>
    );
  }

  /* Mobile — all pages in a swipeable carousel */
  const pages = [
    { label: 'Portfolio', component: <Suspense fallback={<Loader />}><Dashboard /></Suspense> },
    { label: 'Shares', component: <Suspense fallback={<Loader />}><SharesPage /></Suspense> },
    { label: 'Trades', component: <Suspense fallback={<Loader />}><StockTransactions /></Suspense> },
    { label: 'Analytics', component: <Suspense fallback={<Loader />}><Analytics /></Suspense> },
    { label: 'Research', component: <Suspense fallback={<Loader />}><Research /></Suspense> },
    { label: 'Tools', component: <Suspense fallback={<Loader />}><Tools /></Suspense> },
  ];

  return <SwipeablePages pages={pages} />;
}
