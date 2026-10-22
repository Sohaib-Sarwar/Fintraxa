import { Box } from '@mui/material';

/**
 * Text with a highlight travelling through it.
 *
 * ReactBits' `shiny-text` drives this from a `useAnimationFrame` loop, which
 * means a React-adjacent callback running every frame for as long as the text
 * is mounted. The effect is a moving `background-position` on a clipped
 * gradient, so a CSS keyframe animation does the same thing on the compositor
 * and costs nothing once started — and it stops cleanly under
 * `prefers-reduced-motion`, where the frame loop would have kept running.
 */
export default function ShinyText({
  children,
  speed = 4,
  color = 'rgba(255,255,255,0.58)',
  shineColor = '#ffffff',
  disabled = false,
  sx,
  ...rest
}) {
  if (disabled) return <Box component="span" sx={{ color, ...sx }} {...rest}>{children}</Box>;

  return (
    <Box
      component="span"
      sx={{
        display: 'inline-block',
        color,
        backgroundImage: `linear-gradient(110deg, transparent 35%, ${shineColor} 50%, transparent 65%)`,
        backgroundSize: '220% 100%',
        backgroundClip: 'text',
        WebkitBackgroundClip: 'text',
        animation: `fintraxaShine ${speed}s linear infinite`,
        '@keyframes fintraxaShine': {
          '0%': { backgroundPosition: '180% 0' },
          '100%': { backgroundPosition: '-80% 0' },
        },
        '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
        ...sx,
      }}
      {...rest}
    >
      {children}
    </Box>
  );
}
