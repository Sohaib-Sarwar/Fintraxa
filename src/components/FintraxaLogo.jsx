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
const LOGO_SRC = '/fintraxa-mark.webp';

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
        borderRadius: `${s * 0.2}px`,
        objectFit: 'contain',
      }}
    />
  );
  if (!sx) return img;
  return <Box sx={{ display: 'inline-flex', ...sx }}>{img}</Box>;
}
