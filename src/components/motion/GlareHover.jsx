import { useRef } from 'react';
import { Box } from '@mui/material';

/**
 * A single sheet of light sweeping across a surface on hover.
 *
 * Ported from ReactBits `glare-hover` (via the reactbits MCP server). The
 * original renders its own bordered card; here it is a transparent overlay
 * that lies on top of whatever it wraps, so an existing MUI `Card` keeps its
 * own background, border and radius and simply gains the sweep.
 *
 * Driven by `background-position` on a composited layer, so the sweep runs off
 * the main thread. Hidden from pointer events and from assistive technology.
 */
export default function GlareHover({
  children,
  glareColor = '#ffffff',
  glareOpacity = 0.12,
  glareAngle = -45,
  glareSize = 220,
  transitionDuration = 700,
  borderRadius = 'inherit',
  disabled = false,
  sx,
  ...rest
}) {
  const overlayRef = useRef(null);

  const hex = glareColor.replace('#', '');
  let rgba = glareColor;
  if (/^[\dA-Fa-f]{6}$/.test(hex)) {
    rgba = `rgba(${parseInt(hex.slice(0, 2), 16)}, ${parseInt(hex.slice(2, 4), 16)}, ${parseInt(hex.slice(4, 6), 16)}, ${glareOpacity})`;
  }

  const move = (to, animate) => {
    const el = overlayRef.current;
    if (!el) return;
    el.style.transition = animate ? `background-position ${transitionDuration}ms ease` : 'none';
    el.style.backgroundPosition = to;
  };

  return (
    <Box
      onMouseEnter={disabled ? undefined : () => { move('-100% -100%', false); requestAnimationFrame(() => move('100% 100%', true)); }}
      onMouseLeave={disabled ? undefined : () => move('-100% -100%', true)}
      sx={{ position: 'relative', borderRadius, ...sx }}
      {...rest}
    >
      {children}
      {!disabled && (
        <Box
          ref={overlayRef}
          aria-hidden
          sx={{
            position: 'absolute', inset: 0, borderRadius, pointerEvents: 'none',
            background: `linear-gradient(${glareAngle}deg, hsla(0,0%,0%,0) 60%, ${rgba} 70%, hsla(0,0%,0%,0) 100%)`,
            backgroundSize: `${glareSize}% ${glareSize}%, 100% 100%`,
            backgroundRepeat: 'no-repeat',
            backgroundPosition: '-100% -100%, 0 0',
            '@media (prefers-reduced-motion: reduce)': { display: 'none' },
          }}
        />
      )}
    </Box>
  );
}
