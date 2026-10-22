import { useMemo } from 'react';
import { Box, Typography } from '@mui/material';
import { AnimatePresence, motion } from 'framer-motion';

/**
 * The text in the hole of a donut chart.
 *
 * Previously each chart rendered its resting total here and hid the whole
 * block on hover (`{activeIdx < 0 && …}`), on the assumption that Recharts was
 * drawing the hovered slice's name and value inside the ring instead. In
 * Recharts 3 it was not — `activeIndex` is no longer a `Pie` prop — so hover
 * simply emptied the middle of the chart. See `pieSector.jsx`.
 *
 * Now the same element carries both states and crossfades between them, which
 * is also better than the old arrangement was ever going to be: the hovered
 * figure is real HTML, so it inherits the theme, the tabular-numerals setting
 * and the user's font size, instead of being SVG `<text>` at a fixed pixel
 * size that ignored all three.
 */
export default function DonutCenter({
  data = [],
  activeIndex = -1,
  restingValue,
  restingLabel,
  format = (n) => String(n),
  nameOf = (d) => d?.shortName || d?.name,
  width = 110,
  compact = false,
}) {
  const total = useMemo(
    () => data.reduce((sum, d) => sum + (Number(d?.value) || 0), 0),
    [data],
  );

  const active = activeIndex >= 0 ? data[activeIndex] : null;
  const pct = active && total > 0 ? (Number(active.value) / total) * 100 : null;

  return (
    <Box
      aria-hidden
      sx={{
        position: 'absolute', top: '50%', left: '50%',
        transform: 'translate(-50%, -50%)',
        textAlign: 'center', pointerEvents: 'none', width,
      }}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={active ? `active-${activeIndex}` : 'resting'}
          initial={{ opacity: 0, scale: 0.94 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.94 }}
          transition={{ duration: 0.14 }}
        >
          {active ? (
            <>
              <Typography noWrap sx={{
                fontSize: compact ? '0.56rem' : '0.6rem', fontWeight: 600,
                color: 'text.secondary', letterSpacing: '0.04em',
                textTransform: 'uppercase', mb: 0.2,
              }}>
                {nameOf(active)}
              </Typography>
              <Typography sx={{
                fontSize: compact ? '0.78rem' : '0.95rem', fontWeight: 700,
                color: 'text.primary', lineHeight: 1.2,
                fontFeatureSettings: '"tnum"',
              }}>
                {format(active.value)}
              </Typography>
              {pct !== null && (
                <Typography sx={{ fontSize: compact ? '0.5rem' : '0.55rem', color: 'text.secondary', mt: 0.1 }}>
                  {pct.toFixed(1)}%
                </Typography>
              )}
            </>
          ) : (
            <>
              <Typography sx={{
                fontSize: compact ? '0.78rem' : '0.95rem', fontWeight: 700,
                color: 'text.primary', lineHeight: 1.2,
                fontFeatureSettings: '"tnum"',
              }}>
                {restingValue}
              </Typography>
              <Typography sx={{ fontSize: compact ? '0.5rem' : '0.55rem', color: 'text.secondary', mt: 0.25 }}>
                {restingLabel}
              </Typography>
            </>
          )}
        </motion.div>
      </AnimatePresence>
    </Box>
  );
}
