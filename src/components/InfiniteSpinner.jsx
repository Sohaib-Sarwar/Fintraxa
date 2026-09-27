import { Box, Typography, useTheme } from '@mui/material';

const keyframes = `
@keyframes infinityDash {
  0%   { stroke-dashoffset: 685; }
  100% { stroke-dashoffset: -685; }
}
`;

/**
 * Infinity-loop spinner used as a lazy-load / Suspense fallback.
 * Uses CSS animation (not SMIL) for reliable cross-browser support.
 */
export default function InfiniteSpinner({ size = 96, minHeight = '60vh', showBrand = false }) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const stroke = isDark ? '#ffffff' : '#000000';

  return (
    <Box sx={{
      display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center',
      minHeight, gap: 2,
    }}>
      <style>{keyframes}</style>
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 300 150"
        width={size}
        height={size / 2}
      >
        <path
          fill="none"
          stroke={stroke}
          strokeWidth="14"
          strokeLinecap="round"
          strokeDasharray="300 385"
          strokeDashoffset="0"
          d="M275 75c0 31-27 50-50 50-58 0-92-100-150-100-28 0-50 22-50 50s23 50 50 50c58 0 92-100 150-100 24 0 50 19 50 50Z"
          style={{ animation: 'infinityDash 2s linear infinite' }}
        />
      </svg>
      {showBrand && (
        <Typography sx={{
          fontSize: '0.72rem', fontWeight: 600, letterSpacing: '0.12em',
          textTransform: 'uppercase', color: isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.25)',
        }}>
          Fintraxa
        </Typography>
      )}
    </Box>
  );
}
