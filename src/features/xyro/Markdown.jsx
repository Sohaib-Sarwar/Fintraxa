import { Fragment } from 'react';
import { Box, Typography } from '@mui/material';
import { useFx, FONT_NUM } from '../../components/fx';
import { parseMarkdown } from '../../lib/xyro/markdown';

/** Inline tokens as elements: text is always text, never HTML. */
function Inline({ tokens }) {
  const t = useFx();
  return tokens.map((x, i) => {
    // Bold amounts read as figures: the number font, tabular.
    if (x.t === 'b') return <Box key={i} component="strong" sx={{ fontWeight: 700, color: t.ink, ...(/\d/.test(x.v) ? { fontFamily: FONT_NUM, letterSpacing: '-0.01em' } : {}) }}>{x.v}</Box>;
    if (x.t === 'i') return <Box key={i} component="em">{x.v}</Box>;
    if (x.t === 'code') return <Box key={i} component="code" sx={{ fontFamily: FONT_NUM, fontSize: '0.92em', px: 0.5, py: '1px', borderRadius: '6px', bgcolor: t.surface2 }}>{x.v}</Box>;
    return <Fragment key={i}>{x.v}</Fragment>;
  });
}

/** A chat answer in markdown, rendered safely (see src/lib/xyro/markdown.js). */
export default function Markdown({ text, accent }) {
  const t = useFx();
  const blocks = parseMarkdown(text);
  return (
    <Box sx={{ fontSize: '0.84rem', lineHeight: 1.6, color: t.ink, '& > * + *': { mt: 1.1 }, wordBreak: 'break-word', '& > p:first-of-type': { fontSize: '0.88rem' } }}>
      {blocks.map((b, i) => {
        if (b.type === 'h') {
          return (
            <Typography key={i} sx={{ display: 'flex', alignItems: 'center', gap: 0.75, fontSize: b.level <= 2 ? '0.92rem' : '0.84rem', fontWeight: 700, color: t.ink, pt: i ? 0.5 : 0 }}>
              <Box component="span" sx={{ width: 3, height: '1em', borderRadius: 2, bgcolor: accent ?? t.ink }} /><Inline tokens={b.inline} />
            </Typography>
          );
        }
        if (b.type === 'ul' || b.type === 'ol') {
          return (
            <Box key={i} component={b.type} start={b.type === 'ol' ? b.start : undefined} sx={{
              m: 0, pl: b.type === 'ol' ? 2.5 : 0, listStyle: b.type === 'ul' ? 'none' : undefined, '& li + li': { mt: 0.55 }, '& li::marker': { color: t.muted, fontWeight: 600 },
              ...(b.type === 'ul' ? { '& li': { position: 'relative', pl: 1.75 }, '& li::before': { content: '""', position: 'absolute', left: 4, top: '0.62em', width: 6, height: 6, borderRadius: '50%', bgcolor: accent ?? t.muted } } : {}),
            }}>
              {b.items.map((it, j) => <li key={j}><Inline tokens={it} /></li>)}
            </Box>
          );
        }
        if (b.type === 'table') {
          return (
            <Box key={i} sx={{ overflowX: 'auto', borderRadius: '12px', border: `1px solid ${t.border}`, scrollbarWidth: 'none', '&::-webkit-scrollbar': { display: 'none' } }}>
              <Box component="table" sx={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem', '& th, & td': { px: 1.1, py: 0.65, whiteSpace: 'nowrap' }, '& th': { color: t.muted, fontWeight: 600, fontSize: '0.7rem', bgcolor: t.surface2 }, '& tbody td': { borderTop: `1px solid ${t.hairline}` }, '& tbody tr:last-of-type td': { fontWeight: /total/i.test(b.rows.at(-1)?.[0]?.map((x) => x.v).join('') ?? '') ? 700 : 400 } }}>
                <thead><tr>{b.head.map((c, j) => <th key={j} style={{ textAlign: b.align?.[j] ?? 'left' }}><Inline tokens={c} /></th>)}</tr></thead>
                <tbody>{b.rows.map((r, j) => <tr key={j}>{r.map((c, k) => <Box component="td" key={k} sx={{ textAlign: b.align?.[k] ?? 'left', fontFamily: b.align?.[k] === 'right' ? FONT_NUM : 'inherit' }}><Inline tokens={c} /></Box>)}</tr>)}</tbody>
              </Box>
            </Box>
          );
        }
        if (b.type === 'code') return <Box key={i} component="pre" sx={{ m: 0, p: 1.25, borderRadius: '10px', bgcolor: t.surface2, fontFamily: FONT_NUM, fontSize: '0.76rem', overflowX: 'auto' }}>{b.text}</Box>;
        return <Typography key={i} component="p" sx={{ m: 0, fontSize: 'inherit', lineHeight: 'inherit' }}><Inline tokens={b.inline} /></Typography>;
      })}
    </Box>
  );
}
