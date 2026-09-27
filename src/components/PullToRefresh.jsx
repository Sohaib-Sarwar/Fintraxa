import { useState, useRef, useCallback, useEffect } from 'react';
import { Box, useTheme, useMediaQuery } from '@mui/material';
import { motion, useAnimation } from 'framer-motion';

const THRESHOLD = 80;
const MAX_PULL = 120;
const SPINNER_SIZE = 32;
const DEAD_ZONE = 15; // px of downward movement before pull engages

/**
 * PullToRefresh — wraps children with a pull-down-to-reload gesture (mobile only).
 * Only activates when the page is scrolled to the very top and the user
 * deliberately pulls downward past a dead-zone.
 */
export default function PullToRefresh({ onRefresh, children }) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const isMobile = useMediaQuery('(max-width:768px)');

  const [pulling, setPulling] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);

  const startY = useRef(0);
  const containerRef = useRef(null);
  const spinnerControls = useAnimation();

  // Whether this touch gesture is eligible for pull-to-refresh
  const eligible = useRef(false);
  // Whether pull has been activated (past dead-zone)
  const activated = useRef(false);

  /** Check every scrollable ancestor + window are at scroll-top === 0 */
  const isAtTop = useCallback(() => {
    if (window.scrollY > 0 || document.documentElement.scrollTop > 0) return false;
    let node = containerRef.current;
    while (node && node !== document.documentElement) {
      if (node.scrollTop > 0) return false;
      node = node.parentElement;
    }
    return true;
  }, []);

  const handleTouchStart = useCallback((e) => {
    if (refreshing) return;
    activated.current = false;
    // Only mark eligible if we are truly at top right now
    if (isAtTop()) {
      eligible.current = true;
      startY.current = e.touches[0].clientY;
    } else {
      eligible.current = false;
    }
  }, [refreshing, isAtTop]);

  const handleTouchMove = useCallback((e) => {
    if (refreshing || !eligible.current) return;

    const touchY = e.touches[0].clientY;
    const delta = touchY - startY.current;

    // If user scrolled up (negative delta), they're scrolling content — cancel eligibility
    if (delta < -5) {
      eligible.current = false;
      if (pulling) {
        setPulling(false);
        setPullDistance(0);
      }
      return;
    }

    // Re-check we're still at top (user might have scrolled content sideways or momentum scroll)
    if (!isAtTop()) {
      eligible.current = false;
      if (pulling) {
        setPulling(false);
        setPullDistance(0);
      }
      return;
    }

    // Dead-zone: only activate pull after user has moved finger down enough
    if (!activated.current) {
      if (delta >= DEAD_ZONE) {
        activated.current = true;
        // Reset start position to current so the visible pull starts from 0
        startY.current = touchY;
      }
      return;
    }

    // Now we're pulling
    const pullDelta = touchY - startY.current;
    const dist = Math.min(pullDelta * 0.45, MAX_PULL);
    if (dist > 0) {
      setPullDistance(dist);
      setPulling(true);
      e.preventDefault(); // prevent native scroll/overscroll
    }
  }, [refreshing, pulling, isAtTop]);

  const handleTouchEnd = useCallback(async () => {
    eligible.current = false;
    activated.current = false;

    if (!pulling) return;

    if (pullDistance >= THRESHOLD && onRefresh) {
      setRefreshing(true);
      setPullDistance(THRESHOLD * 0.6);
      spinnerControls.start({
        rotate: 360,
        transition: { repeat: Infinity, duration: 0.8, ease: 'linear' },
      });
      try {
        await onRefresh();
      } catch (_) { /* silent */ }
      spinnerControls.stop();
      setRefreshing(false);
    }

    setPulling(false);
    setPullDistance(0);
  }, [pulling, pullDistance, onRefresh, spinnerControls]);

  // Attach non-passive touchmove so we can preventDefault
  useEffect(() => {
    const el = containerRef.current;
    if (!el || !isMobile) return;
    const opts = { passive: false };
    el.addEventListener('touchmove', handleTouchMove, opts);
    return () => el.removeEventListener('touchmove', handleTouchMove, opts);
  }, [handleTouchMove, isMobile]);

  if (!isMobile) return children;

  const progress = Math.min(pullDistance / THRESHOLD, 1);
  const spinnerOpacity = Math.max(0, (progress - 0.2) / 0.8);
  const spinnerScale = 0.4 + progress * 0.6;

  return (
    <Box
      ref={containerRef}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      sx={{ position: 'relative', minHeight: '100%' }}
    >
      {/* Spinner indicator */}
      <Box
        sx={{
          position: 'absolute',
          top: 0,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 10,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: pullDistance,
          overflow: 'hidden',
          pointerEvents: 'none',
          transition: pulling ? 'none' : 'height 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
        }}
      >
        <motion.div
          animate={spinnerControls}
          style={{
            width: SPINNER_SIZE,
            height: SPINNER_SIZE,
            opacity: spinnerOpacity,
            transform: `scale(${spinnerScale})`,
          }}
        >
          <svg
            width={SPINNER_SIZE}
            height={SPINNER_SIZE}
            viewBox="0 0 32 32"
            fill="none"
            style={{
              transform: `rotate(${pullDistance * 3}deg)`,
              transition: pulling ? 'none' : 'transform 0.3s ease',
            }}
          >
            <circle
              cx="16" cy="16" r="12"
              stroke={isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)'}
              strokeWidth="2.5"
              fill="none"
            />
            <path
              d={`M16 4 A12 12 0 0 1 ${16 + 12 * Math.sin(progress * Math.PI * 1.5)} ${16 - 12 * Math.cos(progress * Math.PI * 1.5)}`}
              stroke={isDark ? '#fff' : '#000'}
              strokeWidth="2.5"
              strokeLinecap="round"
              fill="none"
            />
          </svg>
        </motion.div>
      </Box>

      {/* Content with pull-down translation */}
      <Box
        sx={{
          transform: `translateY(${pullDistance}px)`,
          transition: pulling ? 'none' : 'transform 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
        }}
      >
        {children}
      </Box>
    </Box>
  );
}
