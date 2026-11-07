/**
 * Rebuild visual rows from positioned PDF text items.
 *
 * Why: in the NBP, MCB and UBL statements the text *stream* is in column
 * order, not row order — reading it top to bottom puts amounts next to the
 * wrong transaction. Every glyph run carries its page coordinates, so rows
 * are rebuilt geometrically: cluster runs that share a baseline, order each
 * cluster left to right.
 *
 * Each line keeps
 *   text   — a character-grid rendering (values sit under their headers),
 *            used as human-readable evidence;
 *   cells  — runs merged into words/phrases with their x-extent, used by the
 *            per-AMC parsers to assign every value to its column.
 *
 * Pure function of its input; `extractPdfLines` adapts pdf.js output.
 */

/**
 * @typedef {{ str: string, x: number, y: number, w: number, h: number }} TextItem
 * @typedef {{ text: string, x0: number, x1: number }} Cell
 * @typedef {{ id: string, page: number, n: number, y: number, text: string, cells: Cell[] }} Line
 */

// Control characters and non-breaking spaces become plain spaces.
const clean = (s) => s.replace(/\p{Cc}/gu, ' ').replace(/\u00a0/g, ' ');

/**
 * @param {TextItem[]} items
 * @param {number} page 1-based
 * @returns {Line[]}
 */
export function buildPageLines(items, page) {
  const runs = items
    .map((it) => ({ ...it, str: clean(it.str) }))
    .filter((it) => it.str.trim() !== '');
  if (runs.length === 0) return [];

  const heights = runs.map((r) => r.h || 0).filter((h) => h > 0).sort((a, b) => a - b);
  const medianH = heights.length ? heights[Math.floor(heights.length / 2)] : 8;
  const tolerance = Math.max(1.5, medianH * 0.45);

  // Median glyph advance: the unit for both the grid and cell merging.
  const advances = runs
    .filter((r) => r.w > 0 && r.str.trim().length >= 2)
    .map((r) => r.w / r.str.length)
    .sort((a, b) => a - b);
  const em = Math.max(1, advances.length ? advances[Math.floor(advances.length / 2)] : medianH * 0.5);
  const minX = Math.min(...runs.map((r) => r.x));

  runs.sort((a, b) => b.y - a.y || a.x - b.x);   // PDF y grows upward
  const rows = [];
  for (const r of runs) {
    const row = rows.find((c) => Math.abs(c.y - r.y) <= tolerance);
    if (row) {
      row.runs.push(r);
      row.y = row.runs.reduce((s, x) => s + x.y, 0) / row.runs.length;   // anchored mean, no drift
    } else {
      rows.push({ y: r.y, runs: [r] });
    }
  }
  rows.sort((a, b) => b.y - a.y);

  return rows.map((row, i) => {
    row.runs.sort((a, b) => a.x - b.x);

    // Cells: runs closer than ~1 glyph belong to the same word/phrase.
    /** @type {Cell[]} */
    const cells = [];
    for (const r of row.runs) {
      const x1 = r.x + (r.w || r.str.length * em);
      const last = cells[cells.length - 1];
      const gap = last ? r.x - last.x1 : Infinity;
      if (last && gap <= em * 1.1) {
        const sep = gap > em * 0.15 && !/\s$/.test(last.text) && !/^\s/.test(r.str) ? ' ' : '';
        last.text += sep + r.str;
        last.x1 = Math.max(last.x1, x1);
      } else {
        cells.push({ text: r.str, x0: r.x, x1 });
      }
    }
    for (const c of cells) c.text = c.text.replace(/\s+/g, ' ').trim();

    let text = '';
    for (const c of cells) {
      const col = Math.round((c.x0 - minX) / em);
      if (text.length < col) text += ' '.repeat(col - text.length);
      else if (text.length) text += ' ';
      text += c.text;
    }

    return {
      id: `p${page}-l${i + 1}`,
      page,
      n: i + 1,
      y: Math.round(row.y * 10) / 10,
      text: text.replace(/\s+$/g, ''),
      cells: cells.filter((c) => c.text !== ''),
    };
  });
}

/**
 * @param {any} pdf pdf.js PDFDocumentProxy
 * @returns {Promise<Line[][]>} lines per page
 */
export async function extractPdfLines(pdf) {
  const pages = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    const items = content.items
      .filter((it) => typeof it.str === 'string')
      .map((it) => ({
        str: it.str,
        x: it.transform[4],
        y: it.transform[5],
        w: it.width,
        h: it.height || Math.abs(it.transform[3]) || 0,
      }));
    pages.push(buildPageLines(items, p));
    page.cleanup?.();
  }
  return pages;
}
