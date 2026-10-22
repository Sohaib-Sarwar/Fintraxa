import { useMemo } from 'react';
import { Box } from '@mui/material';

/**
 * Mount / scroll-in reveal.
 *
 * ReactBits ships this as `animated-content`, built on gsap + ScrollTrigger —
 * roughly 70 kB of new dependency for an entrance. The prop shape below
 * mirrors theirs so call sites read the same; the engine is different, and
 * deliberately so.
 *
 * It is a CSS keyframe animation rather than a JavaScript one, for two
 * reasons:
 *
 *   - Robustness. A JS entrance animation makes the element's visibility
 *     depend on the animation running to completion. requestAnimationFrame is
 *     throttled to a crawl in a background tab, so a login page opened in one
 *     renders its content invisible until the tab is focused — observed here,
 *     not theorised. With `animation-fill-mode: both` the element's resting
 *     style *is* the visible end state, so anything that stops the animation
 *     leaves the content on screen instead of hiding it.
 *   - Cost. This wraps around thirty elements across the dashboards. A
 *     compositor-driven opacity/transform pair costs nothing after the first
 *     frame, where a JS-driven one holds a subscription for its lifetime.
 *
 * `prefers-reduced-motion` is handled by the global rule in `index.css`, which
 * collapses the duration to near-zero; the element still ends up visible,
 * because visible is the resting style.
 */
export default function Reveal({
  children,
  distance = 14,
  direction = 'vertical',
  reverse = false,
  duration = 0.4,
  delay = 0,
  scale = 1,
  /** Animate on scroll into view rather than on mount, where supported. */
  onView = false,
  sx,
  ...rest
}) {
  const axis = direction === 'horizontal' ? 'X' : 'Y';
  const offset = reverse ? -distance : distance;

  const anim = useMemo(() => {
    /* Keyframe names share a global namespace, so they encode the parameters
       and are stripped to characters valid in a CSS identifier. */
    const name = `fxReveal${axis}${String(offset).replace('-', 'n')}s${String(scale).replace('.', '_')}`;
    return {
      name,
      frames: {
        [`@keyframes ${name}`]: {
          from: { opacity: 0, transform: `translate${axis}(${offset}px) scale(${scale})` },
          to: { opacity: 1, transform: 'none' },
        },
      },
    };
  }, [axis, offset, scale]);

  return (
    <Box
      sx={{
        opacity: 1,
        transform: 'none',
        animation: `${anim.name} ${duration}s cubic-bezier(0.22, 1, 0.36, 1) ${delay}s both`,
        ...anim.frames,
        /* Scroll-driven timelines where the browser has them; elsewhere this
           is ignored and the animation simply runs on mount, which is a
           perfectly good fallback. */
        ...(onView ? { animationTimeline: 'view()', animationRange: 'entry 0% cover 25%' } : null),
        ...sx,
      }}
      {...rest}
    >
      {children}
    </Box>
  );
}
