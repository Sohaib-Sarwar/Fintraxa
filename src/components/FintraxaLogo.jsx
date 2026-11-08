import { Box } from '@mui/material';

/**
 * The brand mark.
 *
 * This used to point at `/icons/fintraxa logo.png` — a 690 kB, 1024px PNG,
 * downloaded in full to draw a 26px logo in the navbar, and with a space in
 * the filename. There were three byte-identical copies of it in `public/`.
 * It is now a 15 kB 256px WebP, which is still 3x the largest size the mark
 * is ever rendered at (80px on the mobile auth screen).
 *
 * `width`/`height` are set so the surrounding layout never reflows when the
 * image lands, and it is eager + high priority because the mark is above the
 * fold on every screen including the login page.
 */
const LOGO_SRC = '/brand/mark-256.png'; // the gold mark, transparent (scripts/build-brand-logo.mjs)

export default function FintraxaLogo({ size = 40, sx }) {
  const s = Number(size);
  const img = (
    <Box
      component="img"
      src={LOGO_SRC}
      alt="Fintraxa"
      width={s}
      height={s}
      decoding="async"
      fetchPriority="high"
      sx={{
        display: 'block',
        flexShrink: 0,
        objectFit: 'contain',
      }}
    />
  );
  if (!sx) return img;
  return <Box sx={{ display: 'inline-flex', ...sx }}>{img}</Box>;
}

/**
 * The navbar lockup: the gold mark and the wordmark on one black pill, read as
 * a single badge in both themes. In dark mode a hairline rim keeps the black
 * pill distinct from the dark glass behind it.
 */
export function BrandLockup({ height = 40, isDark = false }) {
  const mark = Math.round(height * 0.72);
  return (
    <Box sx={{
      display: 'inline-flex', alignItems: 'center', gap: 0.75, height, pl: `${Math.round(height * 0.16)}px`, pr: `${Math.round(height * 0.38)}px`,
      borderRadius: 999, bgcolor: '#000', flexShrink: 0,
      border: `1px solid ${isDark ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.9)'}`,
      boxShadow: isDark ? 'inset 0 1px 0 rgba(255,255,255,0.08)' : 'inset 0 1px 0 rgba(255,255,255,0.12), 0 4px 14px -6px rgba(0,0,0,0.45)',
    }}>
      <Box component="img" src={LOGO_SRC} alt="" width={mark} height={mark} decoding="async" fetchPriority="high"
        sx={{ display: 'block', objectFit: 'contain' }} />
      <Box component="span" sx={{ fontSize: `${(height * 0.4).toFixed(1)}px`, fontWeight: 800, letterSpacing: '-0.03em', color: '#f5efe7', lineHeight: 1, whiteSpace: 'nowrap' }}>
        Fintraxa
      </Box>
    </Box>
  );
}
