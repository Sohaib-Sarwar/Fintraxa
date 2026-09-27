import { useState, useCallback } from 'react';
import { Box, Typography, useTheme } from '@mui/material';
import { motion, AnimatePresence } from 'framer-motion';
import { useSwipeable } from 'react-swipeable';

/* ─── Slide animation variants ─── */
const variants = {
  enter: (dir) => ({ x: dir > 0 ? '35%' : '-35%', opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir) => ({ x: dir > 0 ? '-35%' : '35%', opacity: 0 }),
};

/**
 * SwipeablePages — mobile-only horizontal page carousel
 *
 * @param {{ label: string, component: JSX.Element }[]} pages
 */
export default function SwipeablePages({ pages, initialIndex = 0 }) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const [[active, dir], setPage] = useState([initialIndex, 0]);

  /* Navigate to a specific page index */
  const paginate = useCallback(
    (idx) => {
      if (idx < 0 || idx >= pages.length || idx === active) return;
      setPage([idx, idx > active ? 1 : -1]);
    },
    [active, pages.length],
  );

  /* Swipe handlers — 60 px minimum horizontal distance */
  const handlers = useSwipeable({
    onSwipedLeft: (e) => {
      if (Math.abs(e.deltaX) < 60) return;
      paginate(active + 1);
    },
    onSwipedRight: (e) => {
      if (Math.abs(e.deltaX) < 60) return;
      paginate(active - 1);
    },
    trackTouch: true,
    trackMouse: false,
    delta: 25,
    preventScrollOnSwipe: false,
  });

  return (
    <Box>
      {/* ── Tab indicators ── */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 2,
          mb: 1,
          px: 0.25,
          overflowX: 'auto',
          '&::-webkit-scrollbar': { display: 'none' },
          msOverflowStyle: 'none',
          scrollbarWidth: 'none',
        }}
      >
        {pages.map((p, i) => {
          const isActive = i === active;
          return (
            <Box
              key={i}
              onClick={() => paginate(i)}
              sx={{ cursor: 'pointer', position: 'relative', pb: 1 }}
            >
              <Typography
                sx={{
                  fontSize: '0.7rem',
                  fontWeight: isActive ? 700 : 500,
                  color: isActive ? 'text.primary' : 'text.disabled',
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                  whiteSpace: 'nowrap',
                  transition: 'color 0.25s ease, font-weight 0.25s ease',
                }}
              >
                {p.label}
              </Typography>

              {/* Animated underline */}
              {isActive && (
                <motion.div
                  layoutId="swipeTab"
                  style={{
                    position: 'absolute',
                    bottom: 0,
                    left: 0,
                    right: 0,
                    height: 2,
                    borderRadius: 1,
                    background: isDark ? '#fff' : '#000',
                  }}
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                />
              )}
            </Box>
          );
        })}
      </Box>

      {/* ── Swipeable content ── */}
      <Box
        {...handlers}
        sx={{ overflow: 'hidden', position: 'relative', touchAction: 'pan-y' }}
      >
        <AnimatePresence mode="wait" custom={dir} initial={false}>
          <motion.div
            key={active}
            custom={dir}
            variants={variants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ type: 'tween', duration: 0.22, ease: [0.25, 0.1, 0.25, 1] }}
          >
            {pages[active].component}
          </motion.div>
        </AnimatePresence>
      </Box>
    </Box>
  );
}
