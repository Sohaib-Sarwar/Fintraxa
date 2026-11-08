import { Box, ButtonBase, IconButton, Typography, useMediaQuery } from '@mui/material';
import { ChevronLeftRounded, ChevronRightRounded } from '@mui/icons-material';
import { useFx, FONT_NUM } from './tokens';

/** Page numbers to show: first, last, the current one and its neighbours, with gaps as null. */
function pageList(page, pages) {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i);
  const keep = new Set([0, pages - 1, page - 1, page, page + 1].filter((i) => i >= 0 && i < pages));
  if (page <= 2) [1, 2, 3].forEach((i) => keep.add(i));
  if (page >= pages - 3) [pages - 4, pages - 3, pages - 2].forEach((i) => keep.add(i));
  const sorted = [...keep].sort((a, b) => a - b);
  const out = [];
  sorted.forEach((i, k) => { if (k && i - sorted[k - 1] > 1) out.push(null); out.push(i); });
  return out;
}

/**
 * The footer of every list (transactions, trades, fund transactions, dividends):
 * "1–10 of 38", numbered pages, previous / next. Pair with `usePaged` from ./hooks.
 */
export default function Pagination({ page, pages, total, size, onPage, noun = 'rows' }) {
  const t = useFx();
  const mobile = useMediaQuery('(max-width:600px)');
  if (!total) return null;
  const from = page * size + 1;
  const to = Math.min(total, (page + 1) * size);
  const nav = { width: 32, height: 32, border: `1px solid ${t.border}`, borderRadius: '10px', color: t.ink };
  return (
    // Count on the left, pages in the middle: the right edge stays clear of the floating Xyro button.
    <Box component="nav" aria-label="Pages" sx={{ display: 'grid', gridTemplateColumns: { xs: 'auto 1fr', sm: '1fr auto 1fr' }, alignItems: 'center', gap: 1.5, px: { xs: 1.5, md: 2.25 }, py: 1.25, borderTop: `1px solid ${t.hairline}`, flexShrink: 0 }}>
      <Typography sx={{ fontSize: '0.74rem', color: t.muted, fontFamily: FONT_NUM }}>
        <Box component="b" sx={{ color: t.ink, fontWeight: 650 }}>{from}–{to}</Box> of {total} {noun}
      </Typography>
      {pages > 1 && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, justifySelf: { xs: 'end', sm: 'center' } }}>
          <IconButton size="small" aria-label="Previous page" disabled={page === 0} onClick={() => onPage(page - 1)} sx={nav}><ChevronLeftRounded fontSize="small" /></IconButton>
          {mobile ? (
            <Typography sx={{ fontSize: '0.76rem', fontFamily: FONT_NUM, px: 1, color: t.ink2 }}>{page + 1} / {pages}</Typography>
          ) : pageList(page, pages).map((i, k) => (i === null
            ? <Box key={`gap-${k}`} component="span" sx={{ width: 22, textAlign: 'center', color: t.muted, fontSize: '0.76rem' }}>…</Box>
            : (
              <ButtonBase key={i} onClick={() => onPage(i)} aria-label={`Page ${i + 1}`} aria-current={i === page ? 'page' : undefined}
                sx={{
                  minWidth: 32, height: 32, px: 0.75, borderRadius: '10px', fontFamily: FONT_NUM, fontSize: '0.78rem', fontWeight: 650,
                  bgcolor: i === page ? t.inv : 'transparent', color: i === page ? t.invInk : t.ink2, transition: 'background-color .15s',
                  '@media (hover: hover)': { '&:hover': { bgcolor: i === page ? t.inv : t.hover } },
                }}>{i + 1}</ButtonBase>
            )))}
          <IconButton size="small" aria-label="Next page" disabled={page >= pages - 1} onClick={() => onPage(page + 1)} sx={nav}><ChevronRightRounded fontSize="small" /></IconButton>
        </Box>
      )}
    </Box>
  );
}
