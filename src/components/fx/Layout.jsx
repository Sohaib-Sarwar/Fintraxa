import { Box, ButtonBase, Tooltip, Typography, IconButton, useMediaQuery } from '@mui/material';
import { InfoOutlined, ChevronLeftRounded, ChevronRightRounded, NorthEastRounded, SouthEastRounded } from '@mui/icons-material';
import { useFx, FONT_NUM } from './tokens';
import RangeFilter from './RangeFilter';
import { useDateRange, shortDate, effectiveEnd } from '../../lib/dateRange';

/** Page title on the left, the global range filter (and any actions) on the right. */
export function PageHeader({ title, icon, actions, filter = true, sub }) {
  const t = useFx();
  const isMobile = useMediaQuery('(max-width:768px)');
  const { range } = useDateRange();
  const period = range.id === 'all' ? 'All time' : `${shortDate(range.start)} – ${shortDate(effectiveEnd(range))}`;
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, mb: isMobile ? 1.25 : 1.75, flexWrap: 'wrap', flexShrink: 0 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, minWidth: 0 }}>
        {icon}
        <Box sx={{ minWidth: 0 }}>
          <Typography component="h1" sx={{ fontSize: isMobile ? '1.15rem' : '1.4rem', fontWeight: 750, letterSpacing: '-0.03em', lineHeight: 1.15, color: t.ink }}>{title}</Typography>
          {sub !== false && <Typography sx={{ fontSize: '0.7rem', color: t.muted, mt: 0.15 }}>{sub ?? (filter ? period : '')}</Typography>}
        </Box>
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, ml: 'auto' }}>
        {actions}
        {filter && <RangeFilter />}
      </Box>
    </Box>
  );
}

/** Card with an optional title row. */
export function FxCard({ title, right, children, sx, bodySx, onClick, ...rest }) {
  const t = useFx();
  return (
    <Box component="section" onClick={onClick} {...rest} sx={{
      bgcolor: t.surface, border: `1px solid ${t.border}`, borderRadius: '20px', p: { xs: 1.5, md: 2 }, boxShadow: t.shadow,
      minWidth: 0, display: 'flex', flexDirection: 'column', ...sx,
    }}>
      {(title || right) && (
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, mb: 1.25, flexWrap: 'wrap', flexShrink: 0 }}>
          {title && <Typography component="h2" sx={{ fontSize: '0.86rem', fontWeight: 700, letterSpacing: '-0.01em', color: t.ink }}>{title}</Typography>}
          {right}
        </Box>
      )}
      <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', ...bodySx }}>{children}</Box>
    </Box>
  );
}

/** Number in the figure face, tabular. */
export function Num({ children, sx, ...rest }) {
  return <Box component="span" data-numeric sx={{ fontFamily: FONT_NUM, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em', ...sx }} {...rest}>{children}</Box>;
}

export function Delta({ value, suffix = '%' }) {
  const t = useFx();
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  const up = value >= 0;
  const Icon = up ? NorthEastRounded : SouthEastRounded;
  return (
    <Box component="span" sx={{
      display: 'inline-flex', alignItems: 'center', gap: '2px', pl: '5px', pr: 1, py: '2px', borderRadius: 999, fontSize: '0.7rem', fontWeight: 650,
      color: up ? t.pos : t.neg, bgcolor: up ? t.posSoft : t.negSoft, fontFamily: FONT_NUM,
    }}>
      <Icon sx={{ fontSize: 12 }} />{Math.abs(value).toFixed(2)}{suffix}
    </Box>
  );
}

export function Chip({ children, tone }) {
  const t = useFx();
  const c = tone === 'pos' ? [t.pos, t.posSoft] : tone === 'neg' ? [t.neg, t.negSoft] : tone === 'warn' ? [t.warn, t.warnSoft] : [t.ink2, t.surface2];
  return (
    <Box component="span" sx={{
      display: 'inline-flex', alignItems: 'center', gap: 0.5, px: 1, py: '2px', borderRadius: 999, fontSize: '0.68rem', fontWeight: 620,
      whiteSpace: 'nowrap', color: c[0], bgcolor: c[1], border: tone ? '1px solid transparent' : `1px solid ${t.border}`,
    }}>{children}</Box>
  );
}

/**
 * KPI tile. Hover shows how the figure is worked out; click (if given)
 * opens the detail. The value is in the figure face.
 */
export function Kpi({ label, value, color, foot, logic, onClick, icon, loading }) {
  const t = useFx();
  const body = (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75, minWidth: 0, height: '100%' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
        <Typography sx={{ fontSize: '0.74rem', fontWeight: 600, color: t.muted, display: 'flex', alignItems: 'center', gap: 0.5, whiteSpace: 'nowrap' }}>
          {label}{logic && <InfoOutlined sx={{ fontSize: 12, opacity: 0.6 }} />}
        </Typography>
        {icon && <Box sx={{ width: 28, height: 28, borderRadius: 999, display: 'grid', placeItems: 'center', border: `1px solid ${t.border}`, color: t.ink2, flexShrink: 0 }}>{icon}</Box>}
      </Box>
      <Num sx={{ fontSize: { xs: '1.08rem', sm: '1.3rem', lg: '1.5rem' }, fontWeight: 600, lineHeight: 1.1, color: color ?? t.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', opacity: loading ? 0.3 : 1 }}>
        {value}
      </Num>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, color: t.muted, fontSize: '0.7rem', minHeight: 20, flexWrap: 'wrap' }}>{foot}</Box>
    </Box>
  );
  const card = (
    <ButtonBase component="div" disabled={!onClick} onClick={onClick} aria-label={onClick ? `${label}: open details` : undefined}
      sx={{
        display: 'block', textAlign: 'left', width: '100%', height: '100%', bgcolor: t.surface, border: `1px solid ${t.border}`,
        borderRadius: '20px', p: { xs: 1.5, md: 1.75 }, boxShadow: t.shadow, cursor: onClick ? 'pointer' : 'default', fontFamily: 'inherit',
        transition: 'border-color .16s, background-color .16s', '@media (hover: hover)': { '&:hover': onClick ? { borderColor: t.muted } : {} },
      }}>
      {body}
    </ButtonBase>
  );
  return logic ? <Tooltip title={logic} arrow placement="top" enterDelay={300}>{card}</Tooltip> : card;
}

/** "1–6 of 14" with prev/next and dots. */
export function Pager({ page, pages, total, size, onPage }) {
  const t = useFx();
  if (total <= size) return null;
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, pt: 1, flexShrink: 0 }}>
      <Typography sx={{ fontSize: '0.7rem', color: t.muted, fontFamily: FONT_NUM }}>{page * size + 1}–{Math.min(total, (page + 1) * size)} of {total}</Typography>
      <Box sx={{ display: 'flex', gap: '5px' }} aria-hidden>
        {pages <= 12 && Array.from({ length: pages }, (_, i) => (
          <Box key={i} sx={{ width: i === page ? 14 : 5, height: 5, borderRadius: 999, bgcolor: i === page ? t.ink : t.surface3, transition: 'width .25s' }} />
        ))}
      </Box>
      <Box sx={{ display: 'flex', gap: 0.5 }}>
        <IconButton size="small" aria-label="Previous page" disabled={page === 0} onClick={() => onPage(page - 1)} sx={{ border: `1px solid ${t.border}`, width: 28, height: 28 }}><ChevronLeftRounded fontSize="small" /></IconButton>
        <IconButton size="small" aria-label="Next page" disabled={page >= pages - 1} onClick={() => onPage(page + 1)} sx={{ border: `1px solid ${t.border}`, width: 28, height: 28 }}><ChevronRightRounded fontSize="small" /></IconButton>
      </Box>
    </Box>
  );
}

/** Desktop: a page that fills the viewport exactly (no page scroll). Mobile: normal flow. */
export function FitPage({ children, sx }) {
  const isMobile = useMediaQuery('(max-width:900px)');
  return (
    <Box sx={{
      display: 'flex', flexDirection: 'column', minHeight: 0,
      ...(isMobile ? {} : { height: 'calc(100dvh - 88px - 40px)', overflow: 'hidden' }),
      ...sx,
    }}>
      {children}
    </Box>
  );
}
