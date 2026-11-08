import { Box, ButtonBase, Typography } from '@mui/material';
import { motion, useReducedMotion } from 'framer-motion';
import { useFx } from '../../components/fx';

/**
 * Expense / Income: two halves of one glass capsule. The chosen side carries
 * its colour (deep red out, green in) and a sliding tint follows the choice.
 * Arrow keys switch, like a radio group.
 *
 * options: [{ value, label, hint, Icon }]  (exactly two)
 */
export default function TypeSwitch({ value, onChange, options, expenseInk }) {
  const t = useFx();
  const reduce = useReducedMotion();
  const idx = Math.max(0, options.findIndex((o) => o.value === value));
  const color = (o) => (o.value === 'credit' ? t.pos : expenseInk);
  const onKey = (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    onChange(options[idx === 0 ? 1 : 0].value);
  };
  return (
    <Box role="radiogroup" aria-label="Transaction type" onKeyDown={onKey}
      sx={{ position: 'relative', display: 'grid', gridTemplateColumns: '1fr 1fr', p: '4px', borderRadius: '18px', ...t.glass }}>
      <Box component={motion.div} aria-hidden initial={false}
        animate={{ x: `${idx * 100}%` }} transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 520, damping: 40 }}
        sx={{
          position: 'absolute', top: 4, bottom: 4, left: 4, width: 'calc(50% - 4px)', borderRadius: '14px',
          ...t.glassThumb, border: `1px solid ${t.border}`,
        }} />
      {options.map((o, i) => {
        const on = i === idx;
        const c = color(o);
        return (
          <ButtonBase key={o.value} role="radio" aria-checked={on} tabIndex={on ? 0 : -1} onClick={() => onChange(o.value)}
            sx={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1, py: 1, px: 1.25, borderRadius: '14px', fontFamily: 'inherit' }}>
            <Box sx={{
              width: 30, height: 30, borderRadius: '50%', display: 'grid', placeItems: 'center', flexShrink: 0, transition: 'all .2s',
              bgcolor: on ? `${c}1f` : 'transparent', color: on ? c : t.muted,
            }}>
              <o.Icon sx={{ fontSize: 17 }} />
            </Box>
            <Box sx={{ textAlign: 'left', minWidth: 0 }}>
              <Typography sx={{ fontSize: '0.86rem', fontWeight: 700, lineHeight: 1.15, color: on ? c : t.ink2, transition: 'color .2s' }}>{o.label}</Typography>
              <Typography sx={{ fontSize: '0.66rem', color: t.muted, lineHeight: 1.2 }}>{o.hint}</Typography>
            </Box>
          </ButtonBase>
        );
      })}
    </Box>
  );
}
