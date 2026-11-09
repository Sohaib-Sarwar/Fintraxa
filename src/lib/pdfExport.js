/**
 * Save on-screen "sheets" as an A4 PDF file, straight to a download (no print dialog).
 *
 * Each sheet is rendered with html2canvas at a fixed A4-proportioned width, so the layout is the
 * same on any screen, then cut into pages. Cuts fall on block boundaries (elements marked
 * `.fx-keep`, table rows, direct children), never through a row, so a page ends where its last
 * whole block ends. Every page gets the watermark and a footer drawn onto it, and the pages are
 * written as JPEG images into a minimal PDF (no PDF library needed: one image per page). Sheets
 * flow on from one to the next when there is room, so pages are filled rather than left half blank.
 *
 * sheets     HTMLElement[]   in order; a sheet continues on the previous page when it fits
 * filename   'Statement.pdf'
 * footer     text at the bottom left of every page ("Page n of N" goes on the right)
 * watermark  image URL, drawn faintly in a staggered pattern over every page
 * background page colour (the sheet's own, so a dark-mode statement downloads dark, as receipts do)
 * muted      footer text colour
 */
const PAGE_W = 880;                                  // CSS px; A4 is 210 × 297 mm
const PAGE_H = Math.round(PAGE_W * 297 / 210);       // 1245
const SCALE = 2;
const TOP = 30;                                      // top margin on every page, CSS px
const FOOT = 44;                                     // footer band, CSS px
const A4_PT = [595.28, 841.89];

export async function downloadSheetsAsPdf(sheets, { filename, footer = '', watermark, background = '#ffffff', muted = '#8a8f97' } = {}) {
  const { default: html2canvas } = await import('html2canvas');
  const mark = watermark ? await loadImage(watermark).catch(() => null) : null;
  const pages = [];
  for (const sheet of sheets) {
    let marks = [];
    const canvas = await html2canvas(sheet, {
      scale: SCALE, backgroundColor: background, useCORS: true, logging: false,
      windowWidth: 1280, x: 0, y: 0, scrollX: 0, scrollY: 0,
      // Laid out and measured in the copy, at A4 width and a desktop viewport, whatever the screen.
      onclone: (doc, el) => { prepareClone(el); marks = breakPoints(el); },
    });
    flow(pages, canvas, marks.map((y) => y * SCALE));
  }
  const total = pages.length;
  const jpegs = [];
  for (let i = 0; i < total; i += 1) {
    const page = compose(pages[i], { mark, footer, background, muted, label: `Page ${i + 1} of ${total}` });
    jpegs.push(await toJpeg(page));
  }
  save(buildPdf(jpegs), filename);
}

/** Tops and bottoms of the blocks a page may break between, in CSS px from the sheet's top. */
function breakPoints(el) {
  const top = el.getBoundingClientRect().top;
  const ys = new Set();
  el.querySelectorAll('.fx-keep, tr, .fx-sheet-body > *').forEach((n) => {
    const r = n.getBoundingClientRect();
    if (r.height > 0) { ys.add(Math.round(r.top - top)); ys.add(Math.round(r.bottom - top)); }
  });
  // A heading (.fx-keep-next) never ends a page: it stays with the first ~140px that follow it.
  const hold = [...el.querySelectorAll('.fx-keep-next')].map((n) => {
    const r = n.getBoundingClientRect();
    return [r.top - top, r.bottom - top + 140];
  });
  return [...ys].filter((y) => !hold.some(([a, b]) => y > a + 1 && y < b)).sort((a, b) => a - b);
}

/** The captured copy: A4 width, no screen chrome, nothing scrolling, figures with normal tracking. */
function prepareClone(el) {
  Object.assign(el.style, { width: `${PAGE_W}px`, maxWidth: 'none', margin: '0', borderRadius: '0', boxShadow: 'none', overflow: 'visible' });
  // The watermark and footer are drawn onto every page instead.
  el.querySelectorAll('.fx-wm, .fx-footer').forEach((w) => { w.style.display = 'none'; });
  el.querySelectorAll('.fx-scroll').forEach((s) => { s.style.overflow = 'visible'; });
  // html2canvas places text with canvas metrics, which ignore tracking and OpenType figure
  // settings, so either opens gaps inside figures ("(3,617.50 )", "15 %"). Plain text in the copy.
  el.querySelectorAll('*').forEach((n) => {
    n.style.letterSpacing = 'normal'; n.style.fontVariantNumeric = 'normal'; n.style.fontFeatureSettings = 'normal';
  });
  for (let p = el.parentElement; p; p = p.parentElement) Object.assign(p.style, { overflow: 'visible', height: 'auto', maxHeight: 'none' });
}

/**
 * Lay a sheet's canvas onto pages, continuing on the last page when the next block fits there, so
 * a short summary is followed by the lot details on the same page instead of leaving it half empty.
 * Every cut falls on a block boundary; only a block taller than a whole page is cut mid-way.
 * Page: { pieces: [{ canvas, y }], used } in canvas px; later pages start below a top margin.
 */
function flow(pages, canvas, marks) {
  const limit = (PAGE_H - FOOT) * SCALE;
  const newPage = () => { const pg = { pieces: [], used: pages.length ? TOP * SCALE : 0 }; pages.push(pg); return pg; };
  const pick = (start, avail, fresh) => {
    if (start + avail >= canvas.height) return canvas.height;
    const fit = marks.filter((y) => y > start + (fresh ? avail * 0.35 : 0) && y <= start + avail);
    if (fit.length) return fit[fit.length - 1];
    return fresh ? start + avail : null;
  };
  let start = 0;
  while (start < canvas.height - 2) {
    let page = pages[pages.length - 1] ?? newPage();
    let end = pick(start, limit - page.used, page.pieces.length === 0);
    if (end === null) { page = newPage(); end = pick(start, limit - page.used, true); }
    const part = document.createElement('canvas');
    part.width = canvas.width; part.height = end - start;
    part.getContext('2d').drawImage(canvas, 0, start, canvas.width, end - start, 0, 0, canvas.width, end - start);
    page.pieces.push({ canvas: part, y: page.used });
    page.used += end - start;
    start = end;
    if (start < canvas.height - 2) newPage();
  }
}

function compose({ pieces }, { mark, footer, label, background, muted }) {
  const W = PAGE_W * SCALE; const H = PAGE_H * SCALE;
  const page = document.createElement('canvas');
  page.width = W; page.height = H;
  const ctx = page.getContext('2d');
  ctx.fillStyle = background; ctx.fillRect(0, 0, W, H);
  for (const piece of pieces) ctx.drawImage(piece.canvas, 0, piece.y);
  // The watermark: small marks in a staggered diagonal pattern over the page, as on screen.
  if (mark) {
    const step = 200 * SCALE; const size = 78 * SCALE; const R = Math.hypot(W, H) / 2;
    ctx.save();
    ctx.globalAlpha = 0.06;
    ctx.filter = 'grayscale(1)';
    ctx.translate(W / 2, H / 2);
    ctx.rotate((-18 * Math.PI) / 180);
    for (let y = -R, row = 0; y < R; y += step, row += 1) {
      for (let x = -R + (row % 2 ? step / 2 : 0); x < R; x += step) ctx.drawImage(mark, x - size / 2, y - size / 2, size, size);
    }
    ctx.restore();
  }
  ctx.fillStyle = muted;
  ctx.font = `500 ${10 * SCALE}px 'Inter Variable', Inter, -apple-system, 'Segoe UI', sans-serif`;
  ctx.textBaseline = 'middle';
  const y = H - (FOOT / 2) * SCALE;
  ctx.textAlign = 'left'; ctx.fillText(footer, 36 * SCALE, y);
  ctx.textAlign = 'right'; ctx.fillText(label, W - 36 * SCALE, y);
  return page;
}

const loadImage = (src) => new Promise((resolve, reject) => {
  const img = new Image(); img.onload = () => resolve(img); img.onerror = reject; img.src = src;
});

const toJpeg = (canvas) => new Promise((resolve) => canvas.toBlob(async (b) => resolve({
  bytes: new Uint8Array(await b.arrayBuffer()), w: canvas.width, h: canvas.height,
}), 'image/jpeg', 0.92));

/** A minimal PDF: one A4 page per JPEG, the image filling the page. */
export function buildPdf(images) {
  const enc = new TextEncoder();
  const chunks = []; const offsets = []; let length = 0;
  const push = (part) => { const b = typeof part === 'string' ? enc.encode(part) : part; chunks.push(b); length += b.length; };
  const obj = (n, body) => { offsets[n] = length; push(`${n} 0 obj\n`); body(); push('\nendobj\n'); };
  const [pw, ph] = A4_PT;
  const n = images.length;
  // 1 catalog, 2 pages, then per page: page, contents, image.
  const ids = images.map((_, i) => ({ page: 3 + i * 3, content: 4 + i * 3, image: 5 + i * 3 }));
  push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
  obj(1, () => push('<< /Type /Catalog /Pages 2 0 R >>'));
  obj(2, () => push(`<< /Type /Pages /Count ${n} /Kids [${ids.map((x) => `${x.page} 0 R`).join(' ')}] >>`));
  images.forEach((img, i) => {
    const id = ids[i];
    obj(id.page, () => push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pw} ${ph}] /Resources << /XObject << /Im${i} ${id.image} 0 R >> >> /Contents ${id.content} 0 R >>`));
    const draw = `q ${pw} 0 0 ${ph} 0 0 cm /Im${i} Do Q`;
    obj(id.content, () => push(`<< /Length ${draw.length} >>\nstream\n${draw}\nendstream`));
    obj(id.image, () => {
      push(`<< /Type /XObject /Subtype /Image /Width ${img.w} /Height ${img.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${img.bytes.length} >>\nstream\n`);
      push(img.bytes);
      push('\nendstream');
    });
  });
  const xref = length;
  const count = 3 + n * 3;
  push(`xref\n0 ${count}\n0000000000 65535 f \n`);
  for (let k = 1; k < count; k += 1) push(`${String(offsets[k]).padStart(10, '0')} 00000 n \n`);
  push(`trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
  return new Blob(chunks, { type: 'application/pdf' });
}

function save(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
