import { useState } from 'react';
import { Box } from '@mui/material';

/** AMCs with a logo in public/amc-logos (built by scripts/build-amc-logos.mjs). */
const HAS_LOGO = new Set(['atlas', 'mcb', 'meezan', 'nbp', 'ubl']);

/**
 * Rounded-square AMC mark. Falls back to initials on a neutral tile for any
 * AMC without a logo (or if the image fails to load).
 */
export default function AmcLogo({ code, name, size = 36 }) {
  const [failed, setFailed] = useState(false);
  const radius = Math.round(size * 0.22);
  if (code && HAS_LOGO.has(code) && !failed) {
    return (
      <Box component="img" src={`/amc-logos/${code}.webp`} alt={name ? `${name} logo` : ''} width={size} height={size}
        loading="lazy" decoding="async" onError={() => setFailed(true)}
        sx={{ width: size, height: size, borderRadius: `${radius}px`, flexShrink: 0, display: 'block',
          boxShadow: '0 0 0 1px rgba(0,0,0,0.06)', bgcolor: '#fff' }} />
    );
  }
  const initials = String(name ?? code ?? '?').replace(/\b(limited|ltd|asset|management|investment|investments|company|fund managers?)\b/gi, '')
    .trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';
  return (
    <Box aria-hidden sx={{
      width: size, height: size, borderRadius: `${radius}px`, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
      bgcolor: 'action.selected', color: 'text.secondary', fontWeight: 800, fontSize: size * 0.34, letterSpacing: '-0.02em',
    }}>
      {initials}
    </Box>
  );
}
