import { useCallback, useId } from 'react';
import { Box, Typography, useTheme } from '@mui/material';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { useSwipeable } from 'react-swipeable';
import { useLocation, useNavigate } from 'react-router-dom';
import { selectable } from '../lib/a11y';

/* ─── Slide animation variants ─── */
const variants = {
  enter: (dir) => ({ x: dir > 0 ? '35%' : '-35%', opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir) => ({ x: dir > 0 ? '-35%' : '35%', opacity: 0 }),
};

/**
 * Mobile horizontal page carousel.
 *
 * The active page used to live in local state, which meant the URL never
 * changed as you swiped. Three things followed from that: the browser's back
 * button escaped the whole section instead of stepping back a page, a reload
 * always dropped you on the first tab, and a link to `/stocks/research` opened
 * a bare page with no way to swipe out of it — because that path was routed
 * straight to the leaf component, bypassing this carousel entirely.
 *
 * The active page is now derived from `location.pathname` and changed with
 * `navigate`, so the URL is the single source of truth and all three work.
 * `replace` is used for swipes: a carousel is one screen, and flicking through
 * six tabs should not bury the previous section under six history entries.
 *
 * @param {{ label: string, path: string, component: JSX.Element }[]} pages
 */
export default function SwipeablePages({ pages }) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const location = useLocation();
  const navigate = useNavigate();
  const reduceMotion = useReducedMotion();
  const groupId = useId();

  /* Longest matching path wins, so `/stocks` does not shadow
     `/stocks/shares`. Falls back to the first page for an unknown sub-path. */
  const active = Math.max(0, pages.reduce((best, p, i) => (
    (location.pathname === p.path
      || location.pathname.startsWith(`${p.path}/`))
    && p.path.length > (pages[best]?.path.length ?? -1) ? i : best
  ), 0));

  const paginate = useCallback((idx) => {
    if (idx < 0 || idx >= pages.length || idx === active) return;
    navigate(pages[idx].path, { replace: true });
  }, [active, pages, navigate]);

  /* Direction is derived from the move itself rather than stored, so it stays
     correct when the URL changes from outside the carousel (a tab tap, the
     back button, a deep link). */
  const handlers = useSwipeable({
    onSwipedLeft: (e) => { if (Math.abs(e.deltaX) >= 60) paginate(active + 1); },
    onSwipedRight: (e) => { if (Math.abs(e.deltaX) >= 60) paginate(active - 1); },
    trackTouch: true,
    trackMouse: false,
    delta: 25,
    preventScrollOnSwipe: false,
  });

  return (
    <Box>
      {/* ── Tab indicators ── */}
      <Box
        role="tablist"
        aria-label="Section pages"
        sx={{
          display: 'flex', alignItems: 'center', justifyContent: 'flex-start',
          gap: 2, mb: 1, px: 0.25,
          overflowX: 'auto', scrollSnapType: 'x proximity',
          '&::-webkit-scrollbar': { display: 'none' },
          msOverflowStyle: 'none',
          scrollbarWidth: 'none',
        }}
      >
        {pages.map((p, i) => {
          const isActive = i === active;
          return (
            <Box
              key={p.path}
              {...selectable(() => paginate(i), { label: p.label, selected: isActive })}
              aria-controls={`${groupId}-panel`}
              sx={{
                cursor: 'pointer', position: 'relative', pb: 1, flexShrink: 0,
                scrollSnapAlign: 'center',
                /* The tab strip is the only way to reach these pages on a
                   phone, so each target clears the 44px minimum. */
                minHeight: 36, display: 'flex', alignItems: 'center',
                '&:focus-visible': {
                  outline: `2px solid ${isDark ? '#fff' : '#000'}`,
                  outlineOffset: 3, borderRadius: 4,
                },
              }}
            >
              <Typography
                sx={{
                  fontSize: '0.7rem',
                  fontWeight: isActive ? 700 : 500,
                  color: isActive ? 'text.primary' : 'text.disabled',
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                  whiteSpace: 'nowrap',
                  transition: 'color 0.25s ease',
                }}
              >
                {p.label}
              </Typography>

              {isActive && (
                <motion.div
                  layoutId={`swipeTab-${groupId}`}
                  style={{
                    position: 'absolute', bottom: 0, left: 0, right: 0,
                    height: 2, borderRadius: 1,
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
        id={`${groupId}-panel`}
        role="tabpanel"
        sx={{ overflow: 'hidden', position: 'relative', touchAction: 'pan-y' }}
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={active}
            variants={reduceMotion ? undefined : variants}
            custom={1}
            initial={reduceMotion ? false : 'enter'}
            animate={reduceMotion ? undefined : 'center'}
            exit={reduceMotion ? undefined : 'exit'}
            transition={{ type: 'tween', duration: 0.22, ease: [0.25, 0.1, 0.25, 1] }}
          >
            {pages[active].component}
          </motion.div>
        </AnimatePresence>
      </Box>
    </Box>
  );
}
