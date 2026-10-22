import { Box } from '@mui/material';

/**
 * Apple-style "liquid glass".
 *
 * What sells the material is not the blur on its own — it is four layers
 * agreeing with each other:
 *
 *   1. a saturated backdrop blur, so colour bleeds through rather than grey;
 *   2. a very low-alpha fill, lighter at the top, as if lit from above;
 *   3. a hairline inner highlight on the top edge and a darker one beneath,
 *      which is what reads as thickness;
 *   4. a wide, soft, downward shadow to lift it off the backdrop.
 *
 * `backdrop-filter` is unsupported in Firefox when the user has not enabled
 * it, and the fallback — a nearly transparent panel over a photograph — is
 * unreadable. The `@supports not` branch swaps in an opaque fill for that
 * case, so the text underneath never loses contrast.
 */
export default function GlassPanel({
  children,
  tint = 'rgba(255,255,255,0.055)',
  tintTop = 'rgba(255,255,255,0.1)',
  blur = 28,
  radius = 24,
  border = 'rgba(255,255,255,0.14)',
  elevation = '0 24px 64px rgba(0,0,0,0.45)',
  fallback = 'rgba(14,16,20,0.9)',
  sx,
  ...rest
}) {
  return (
    <Box
      sx={{
        position: 'relative',
        borderRadius: `${radius}px`,
        border: `1px solid ${border}`,
        backgroundImage: `linear-gradient(160deg, ${tintTop} 0%, ${tint} 42%, rgba(255,255,255,0.02) 100%)`,
        backdropFilter: `blur(${blur}px) saturate(165%)`,
        WebkitBackdropFilter: `blur(${blur}px) saturate(165%)`,
        boxShadow: `${elevation}, inset 0 1px 0 rgba(255,255,255,0.16), inset 0 -1px 0 rgba(0,0,0,0.3)`,
        '@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px)))': {
          backgroundImage: 'none',
          backgroundColor: fallback,
        },
        ...sx,
      }}
      {...rest}
    >
      {/* The specular edge: a bright arc along the top-left, fading out before
          it reaches the bottom. Without it the panel reads as flat frosting. */}
      <Box
        aria-hidden
        sx={{
          position: 'absolute', inset: 0, borderRadius: 'inherit', pointerEvents: 'none',
          background: 'radial-gradient(120% 80% at 12% 0%, rgba(255,255,255,0.14) 0%, rgba(255,255,255,0) 55%)',
        }}
      />
      <Box sx={{ position: 'relative' }}>{children}</Box>
    </Box>
  );
}
