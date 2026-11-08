/**
 * A small, safe markdown reader for chat answers: paragraphs, headings,
 * bullet and numbered lists, tables, fenced code, **bold**, *italic* and
 * `code`. It returns plain data that React renders as elements, so nothing a
 * model writes is ever injected as HTML. Tolerates half-written input while
 * an answer is still streaming.
 */

/** Inline text → [{ t: 'text'|'b'|'i'|'code', v }] */
export function parseInline(src) {
  const out = [];
  const re = /(`[^`\n]+`)|(\*\*[^*\n]+\*\*|__[^_\n]+__)|(\*[^*\s][^*\n]*\*|_[^_\s][^_\n]*_)/g;
  let last = 0;
  let m;
  while ((m = re.exec(src))) {
    if (m.index > last) out.push({ t: 'text', v: src.slice(last, m.index) });
    if (m[1]) out.push({ t: 'code', v: m[1].slice(1, -1) });
    else if (m[2]) out.push({ t: 'b', v: m[2].slice(2, -2) });
    else out.push({ t: 'i', v: m[3].slice(1, -1) });
    last = m.index + m[0].length;
  }
  if (last < src.length) out.push({ t: 'text', v: src.slice(last) });
  // A dangling "**" from a half-streamed answer reads better without the stars.
  return out.map((x) => (x.t === 'text' ? { ...x, v: x.v.replace(/\*\*/g, '') } : x)).filter((x) => x.v !== '');
}

const isTableRow = (l) => /^\s*\|.*\|\s*$/.test(l);
const isDivider = (l) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(l);
const cells = (l) => l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => parseInline(c.trim()));
const UL = /^\s*[-*•]\s+(.*)$/;
const OL = /^\s*(\d+)[.)]\s+(.*)$/;

/** Markdown → blocks: { type: 'p'|'h'|'ul'|'ol'|'table'|'code', ... } */
export function parseMarkdown(src) {
  const lines = String(src ?? '').replace(/\r\n/g, '\n').split('\n');
  const blocks = [];
  let para = [];
  const flush = () => { if (para.length) { blocks.push({ type: 'p', inline: parseInline(para.join(' ')) }); para = []; } };
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (/^\s*```/.test(line)) {
      flush();
      const body = [];
      for (i += 1; i < lines.length && !/^\s*```/.test(lines[i]); i += 1) body.push(lines[i]);
      blocks.push({ type: 'code', text: body.join('\n') });
      continue;
    }
    if (!line.trim()) { flush(); continue; }
    const h = line.match(/^\s*(#{1,4})\s+(.*)$/);
    if (h) { flush(); blocks.push({ type: 'h', level: h[1].length, inline: parseInline(h[2]) }); continue; }
    if (isTableRow(line) && i + 1 < lines.length && isDivider(lines[i + 1])) {
      flush();
      const head = cells(line);
      // Column alignment from the divider (---: right, :---: centre); a column of amounts is right-aligned anyway.
      const align = lines[i + 1].trim().replace(/^\|/, '').replace(/\|$/, '').split('|')
        .map((c) => (/^\s*:-+:\s*$/.test(c) ? 'center' : /-:\s*$/.test(c) ? 'right' : 'left'));
      const rows = [];
      for (i += 2; i < lines.length && isTableRow(lines[i]); i += 1) rows.push(cells(lines[i]));
      i -= 1;
      const numeric = (k) => rows.length > 0 && rows.every((r) => /^[\s+−-]*(rs\.?\s*)?[\d,.]+%?\s*$/i.test((r[k] ?? []).map((x) => x.v).join('')));
      blocks.push({ type: 'table', head, rows, align: head.map((_, k) => (align[k] === 'left' && numeric(k) ? 'right' : align[k] ?? 'left')) });
      continue;
    }
    const ul = line.match(UL); const ol = !ul && line.match(OL);
    if (ul || ol) {
      flush();
      const type = ul ? 'ul' : 'ol';
      const items = [];
      for (; i < lines.length; i += 1) {
        const m = type === 'ul' ? lines[i].match(UL) : lines[i].match(OL);
        if (m) items.push(parseInline(type === 'ul' ? m[1] : m[2]));
        else if (lines[i].trim() && /^\s{2,}/.test(lines[i]) && items.length) items[items.length - 1].push({ t: 'text', v: ` ${lines[i].trim()}` });
        else break;
      }
      i -= 1;
      blocks.push({ type, items, start: ol ? Number(ol[1]) : 1 });
      continue;
    }
    para.push(line.trim());
  }
  flush();
  return blocks;
}
