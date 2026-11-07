import { Box, ButtonBase, Typography } from '@mui/material';
import { FONT_NUM } from './tokens';
import { formatCurrency } from '../../lib/formatters';

/** "Rs 324,261" + ".32" in a softer tone, like the reference card. */
export function SplitMoney({ value, size = '2.4rem', dim = 'rgba(255,255,255,0.42)', color = '#fff' }) {
  const text = value === null || value === undefined ? '—' : formatCurrency(value, 2);
  const i = text.lastIndexOf('.');
  const main = i > 0 ? text.slice(0, i) : text;
  const dec = i > 0 ? text.slice(i) : '';
  return (
    <Box component="span" data-numeric sx={{ fontFamily: FONT_NUM, fontWeight: 600, fontSize: size, letterSpacing: '-0.045em', lineHeight: 1, color, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
      {main}<Box component="span" sx={{ color: dim }}>{dec}</Box>
    </Box>
  );
}

/**
 * Dark summary card: a headline amount, and stacked tinted panels for the
 * figures behind it (after the "CARD UI" reference). Always dark, in both
 * themes, so it reads as the one hero element on the page.
 *
 * panels: [{ items: [{ label, value, color?, onClick? }], tone: 'indigo' | 'lavender' }]
 */
export default function ValueCard({ title, badge, value, panels = [], footnote }) {
  return (
    <Box sx={{
      position: 'relative', borderRadius: '26px', overflow: 'hidden', minHeight: '100%', display: 'flex', flexDirection: 'column',
      background: 'linear-gradient(180deg, #2b2b2e 0%, #141415 38%, #111112 100%)', color: '#fff',
      border: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 1px 2px rgba(0,0,0,.2), 0 18px 40px -18px rgba(20,16,60,.55)',
    }}>
      <Box sx={{ px: { xs: 2.25, md: 3 }, pt: { xs: 2.25, md: 2.75 }, pb: 2.5, flex: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
          <Typography sx={{ fontSize: '0.92rem', fontWeight: 500, color: 'rgba(255,255,255,0.92)' }}>{title}</Typography>
          {badge && (
            <Box component="span" sx={{ px: 1.5, py: 0.5, borderRadius: 999, fontSize: '0.74rem', fontWeight: 650, color: '#4ade80', bgcolor: 'rgba(34,197,94,0.12)', border: '1px solid rgba(74,222,128,0.25)', whiteSpace: 'nowrap' }}>
              {badge}
            </Box>
          )}
        </Box>
        <Box sx={{ mt: { xs: 2.5, md: 3.5 } }}>
          <SplitMoney value={value} size="clamp(1.9rem, 3.4vw, 2.75rem)" />
        </Box>
        {footnote && <Typography sx={{ mt: 1, fontSize: '0.74rem', color: 'rgba(255,255,255,0.55)' }}>{footnote}</Typography>}
      </Box>
      <Box sx={{ px: 1, pb: 1, display: 'flex', flexDirection: 'column' }}>
        {panels.map((p, i) => <Panel key={i} {...p} first={i === 0} />)}
      </Box>
    </Box>
  );
}

const TONES = {
  indigo: { bg: 'linear-gradient(180deg, #4f46e5 0%, #6366f1 100%)', ink: '#ffffff', sub: 'rgba(255,255,255,0.72)', edge: 'rgba(255,255,255,0.18)' },
  lavender: { bg: 'linear-gradient(180deg, #a78bfa 0%, #c4b5fd 100%)', ink: '#2e1065', sub: 'rgba(46,16,101,0.66)', edge: 'rgba(255,255,255,0.35)' },
};

function Panel({ items, tone = 'indigo', first }) {
  const c = TONES[tone] ?? TONES.indigo;
  return (
    <Box sx={{
      position: 'relative', mt: first ? 0 : '-14px', zIndex: first ? 1 : 2, borderRadius: '22px', background: c.bg,
      border: `1px solid ${c.edge}`, px: { xs: 2, md: 2.5 }, pt: 1.75, pb: first ? 3.25 : 1.75,
      display: 'grid', gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))`, gap: 1.5,
    }}>
      {items.map((it) => {
        const inner = (
          <Box sx={{ minWidth: 0, textAlign: 'left' }}>
            <Typography sx={{ fontSize: '0.72rem', fontWeight: 600, color: c.sub, whiteSpace: 'nowrap' }}>{it.label}</Typography>
            <Typography data-numeric sx={{ fontFamily: FONT_NUM, fontSize: { xs: '1.02rem', md: '1.18rem' }, fontWeight: 650, letterSpacing: '-0.03em', color: it.color ?? c.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {it.value}
            </Typography>
          </Box>
        );
        return it.onClick ? (
          <ButtonBase key={it.label} onClick={it.onClick} aria-label={`${it.label}: open analytics`}
            sx={{ display: 'block', borderRadius: '12px', fontFamily: 'inherit', textAlign: 'left', mx: -0.75, px: 0.75, py: 0.25, '&:hover': { bgcolor: 'rgba(255,255,255,0.12)' } }}>
            {inner}
          </ButtonBase>
        ) : <Box key={it.label}>{inner}</Box>;
      })}
    </Box>
  );
}
