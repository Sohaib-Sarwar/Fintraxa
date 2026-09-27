import { Box } from '@mui/material';

const LOGO_SRC = '/icons/fintraxa logo.png';

export default function FintraxaLogo({ size = 40, sx = {} }) {
  const s = Number(size);
  const img = (
    <img
      src={LOGO_SRC}
      alt="Fintraxa"
      width={s}
      height={s}
      style={{
        display: 'block',
        flexShrink: 0,
        borderRadius: s * 0.2,
        objectFit: 'contain',
      }}
    />
  );
  if (Object.keys(sx).length === 0) return img;
  return <Box sx={{ display: 'inline-flex', ...sx }}>{img}</Box>;
}
