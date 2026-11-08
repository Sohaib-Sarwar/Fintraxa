import { Box } from '@mui/material';
import { useAppStore } from '../store/appStore';

/**
 * Full-screen boot loader: the gold mark breathing over a thin sliding bar.
 *
 * Every animation here is transform/opacity only, so it runs on the
 * compositor and keeps moving while the main thread is busy parsing the app
 * and restoring data. (The old infinity loop animated an SVG stroke, which the
 * browser paints on the main thread: it froze half-way whenever JavaScript was
 * busy.) It is pixel-identical to the loader in index.html, so the hand-over
 * from the static page to React is invisible.
 */
export default function BrandLoader() {
  const dark = useAppStore((s) => s.themeMode) === 'dark';
  return (
    <Box role="status" aria-label="Loading Fintraxa" sx={{
      minHeight: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '22px',
      bgcolor: dark ? '#000' : '#fff',
      '@keyframes fx-breathe': { '0%, 100%': { opacity: 0.55, transform: 'scale(0.96)' }, '50%': { opacity: 1, transform: 'scale(1)' } },
      '@keyframes fx-slide': { '0%': { transform: 'translateX(-100%)' }, '100%': { transform: 'translateX(250%)' } },
    }}>
      <Box component="img" src="/brand/mark-256.png" alt="" width={64} height={64}
        sx={{ display: 'block', willChange: 'transform, opacity', animation: 'fx-breathe 1.8s ease-in-out infinite', '@media (prefers-reduced-motion: reduce)': { animation: 'none' } }} />
      <Box sx={{ position: 'relative', width: 120, height: 3, borderRadius: 999, overflow: 'hidden', bgcolor: dark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.08)' }}>
        <Box sx={{
          position: 'absolute', inset: 0, width: '40%', borderRadius: 999, willChange: 'transform',
          background: 'linear-gradient(90deg, transparent, #d9b48f, transparent)',
          animation: 'fx-slide 1.2s cubic-bezier(.45,.05,.55,.95) infinite',
          '@media (prefers-reduced-motion: reduce)': { animation: 'none', transform: 'translateX(75%)' },
        }} />
      </Box>
    </Box>
  );
}
