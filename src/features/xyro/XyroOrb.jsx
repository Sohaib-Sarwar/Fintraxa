import { Box } from '@mui/material';

/**
 * Xyro's orb (public/xyro-orb.webp, built by scripts/build-xyro-orb.mjs).
 * animated: a slow float and a soft blue glow, for the launcher. The global
 * reduced-motion rule in index.css stills it.
 */
export default function XyroOrb({ size = 28, animated = false, sx }) {
  return (
    <Box aria-hidden sx={{
      width: size, height: size, flexShrink: 0, position: 'relative', display: 'grid', placeItems: 'center',
      ...(animated ? {
        animation: 'xyro-float 4.8s ease-in-out infinite',
        '@keyframes xyro-float': { '0%, 100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-3px)' } },
        '&::after': {
          content: '""', position: 'absolute', inset: '18%', borderRadius: '50%', zIndex: -1,
          background: 'radial-gradient(circle, rgba(80,160,255,0.55) 0%, transparent 70%)', filter: 'blur(8px)',
          animation: 'xyro-glow 4.8s ease-in-out infinite',
        },
        '@keyframes xyro-glow': { '0%, 100%': { opacity: 0.45 }, '50%': { opacity: 0.9 } },
      } : {}),
      ...sx,
    }}>
      <Box component="img" src="/xyro-orb.webp" alt="" width={size} height={size} draggable={false}
        sx={{ width: size, height: size, display: 'block', objectFit: 'contain', userSelect: 'none' }} />
    </Box>
  );
}
