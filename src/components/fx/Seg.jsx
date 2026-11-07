import { useLayoutEffect, useRef, useState } from 'react';
import { Box, ButtonBase } from '@mui/material';
import { useFx } from './tokens';

/**
 * Segmented control. One "thumb" glides to the selected option; hover is a
 * soft tint. Nothing scales or slides in (the owner found that shaky).
 * `value` may match no option (e.g. a custom date range): then no thumb.
 */
export default function Seg({ options, value, onChange, label, size = 'md', inverse = false, sx }) {
  const t = useFx();
  const ref = useRef(null);
  const [thumb, setThumb] = useState(null);
  const [animate, setAnimate] = useState(false);

  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return undefined;
    const place = () => {
      const el = root.querySelector('[aria-pressed="true"]');
      setThumb(el ? { x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight } : null);
    };
    place();
    const id = requestAnimationFrame(() => setAnimate(true));
    const ro = new ResizeObserver(place);
    ro.observe(root);
    return () => { cancelAnimationFrame(id); ro.disconnect(); };
  }, [value, options.length]);

  const sm = size === 'sm';
  return (
    <Box ref={ref} role="group" aria-label={label} sx={{
      position: 'relative', isolation: 'isolate', display: 'inline-flex', gap: '2px', p: '3px', borderRadius: 999,
      bgcolor: t.surface2, border: `1px solid ${t.border}`, maxWidth: '100%', overflowX: 'auto', scrollbarWidth: 'none',
      '&::-webkit-scrollbar': { display: 'none' }, flexShrink: 0, ...sx,
    }}>
      {thumb && (
        <Box aria-hidden sx={{
          position: 'absolute', left: 0, top: 0, zIndex: 0, borderRadius: 999, pointerEvents: 'none',
          width: thumb.w, height: thumb.h, transform: `translate(${thumb.x}px, ${thumb.y}px)`,
          bgcolor: inverse ? t.inv : (t.surface === '#ffffff' ? '#fff' : t.surface3),
          boxShadow: inverse || t.surface !== '#ffffff' ? 'none' : '0 1px 2px rgba(0,0,0,.08), 0 2px 8px rgba(0,0,0,.06)',
          transition: animate ? 'transform .34s cubic-bezier(.3,.7,.2,1), width .34s cubic-bezier(.3,.7,.2,1)' : 'none',
        }} />
      )}
      {options.map((o) => {
        const on = o.value === value;
        return (
          <ButtonBase key={o.value} aria-pressed={on} onClick={() => onChange(o.value)} title={o.title}
            sx={{
              position: 'relative', zIndex: 1, px: sm ? 1.25 : 1.6, py: sm ? 0.5 : 0.7, borderRadius: 999,
              fontSize: sm ? '0.72rem' : '0.78rem', fontWeight: 600, whiteSpace: 'nowrap', fontFamily: 'inherit',
              color: on ? (inverse ? t.invInk : t.ink) : t.muted, transition: 'color .16s ease, background-color .16s ease',
              '@media (hover: hover)': { '&:hover': on ? {} : { color: t.ink, bgcolor: t.hover } },
            }}>
            {o.label}
          </ButtonBase>
        );
      })}
    </Box>
  );
}
