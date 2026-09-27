import { Suspense, lazy } from 'react';
import { useMediaQuery } from '@mui/material';
import SwipeablePages from '../../components/SwipeablePages';
import InfiniteSpinner from '../../components/InfiniteSpinner';

const Dashboard = lazy(() => import('./Dashboard'));
const AddFund = lazy(() => import('./AddFund'));
const Analytics = lazy(() => import('./Analytics'));

const Loader = () => <InfiniteSpinner size={64} minHeight="40vh" />;

export default function MFSection() {
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
    { label: 'Add Fund', component: <Suspense fallback={<Loader />}><AddFund /></Suspense> },
    { label: 'Analytics', component: <Suspense fallback={<Loader />}><Analytics /></Suspense> },
  ];

  return <SwipeablePages pages={pages} />;
}
