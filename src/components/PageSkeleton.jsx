import { Box, Skeleton } from '@mui/material';
import { useFx } from './fx';

/**
 * What a page looks like while its code or first data is on the way: the same
 * frame as the real page (title, summary card, two panels), so nothing jumps
 * when the content lands. Replaces the empty area and spinner that used to
 * sit inside the navbar and sidebar for a few seconds after a reload.
 *
 * variant: 'dashboard' (summary + chart + donut) or 'list' (filters + rows).
 */
export default function PageSkeleton({ variant = 'dashboard' }) {
  const t = useFx();
  const card = { borderRadius: '20px', bgcolor: t.surface, border: `1px solid ${t.border}` };
  const bar = (w, h = 14, sx) => <Skeleton variant="rounded" animation="wave" width={w} height={h} sx={{ borderRadius: '8px', ...sx }} />;
  return (
    <Box role="status" aria-label="Loading" aria-busy="true" sx={{ animation: 'fx-skel-in .25s ease both', '@keyframes fx-skel-in': { from: { opacity: 0 }, to: { opacity: 1 } } }}>
      <Box sx={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', mb: 2.25, gap: 2 }}>
        <Box>{bar(200, 26)}{bar(120, 12, { mt: 1 })}</Box>
        <Box sx={{ display: { xs: 'none', sm: 'flex' }, gap: 1 }}>{bar(150, 34, { borderRadius: 999 })}{bar(96, 34, { borderRadius: 999 })}</Box>
      </Box>
      {variant === 'list' ? (
        <Box sx={{ ...card, p: 2.25 }}>
          <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>{bar(70, 30, { borderRadius: 999 })}{bar(70, 30, { borderRadius: 999 })}{bar(70, 30, { borderRadius: 999 })}</Box>
          {Array.from({ length: 8 }).map((_, i) => (
            <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 1.1, borderTop: i ? `1px solid ${t.hairline}` : 0 }}>
              <Skeleton variant="circular" animation="wave" width={32} height={32} />
              <Box sx={{ flex: 1 }}>{bar('40%', 12)}{bar('25%', 10, { mt: 0.75 })}</Box>
              {bar(90, 14)}
            </Box>
          ))}
        </Box>
      ) : (
        <>
          <Box sx={{ ...card, p: { xs: 2, md: 3 }, mb: 2, display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr auto' }, gap: 3, alignItems: 'end' }}>
            <Box>{bar(70, 12)}{bar('min(320px, 80%)', 44, { mt: 1.25 })}{bar(220, 11, { mt: 1.25 })}</Box>
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(90px, 1fr))', gap: 3 }}>
              {[0, 1, 2].map((i) => <Box key={i}>{bar(70, 11)}{bar(96, 20, { mt: 0.75 })}{bar(60, 10, { mt: 0.75 })}</Box>)}
            </Box>
          </Box>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '7fr 5fr' }, gap: 2 }}>
            <Box sx={{ ...card, p: 2.25, height: { xs: 280, md: 'calc(100dvh - 430px)' }, minHeight: 260 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>{bar(180, 16)}{bar(120, 28, { borderRadius: 999 })}</Box>
              <Skeleton variant="rounded" animation="wave" sx={{ borderRadius: '14px', height: 'calc(100% - 48px)' }} />
            </Box>
            <Box sx={{ ...card, p: 2.25, height: { xs: 320, md: 'calc(100dvh - 430px)' }, minHeight: 260, display: 'flex', flexDirection: 'column' }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>{bar(110, 16)}{bar(150, 28, { borderRadius: 999 })}</Box>
              <Box sx={{ flex: 1, display: 'grid', placeItems: 'center' }}><Skeleton variant="circular" animation="wave" width={190} height={190} /></Box>
            </Box>
          </Box>
        </>
      )}
    </Box>
  );
}
