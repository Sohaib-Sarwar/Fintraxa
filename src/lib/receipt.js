const SCALE = 3;

/**
 * Save a receipt element as a PNG in the colours it is drawn in, so a dark-mode
 * user downloads a dark receipt and a light-mode user a light one.
 *
 * The element is captured as it is, then placed on a larger canvas with an even
 * margin and a small footer line (when and where it was saved). Composing on a
 * canvas, rather than restyling the page before capture, keeps the dialog's own
 * layout from clipping anything.
 *
 * background  the colour behind the receipt (it shows through its cut-outs)
 * muted       footer text colour
 */
export async function downloadReceipt(node, filename, background, muted = '#80858d') {
  // html2canvas is large and only needed here, so it loads on demand.
  const { default: html2canvas } = await import('html2canvas');
  const inner = await html2canvas(node, {
    scale: SCALE, backgroundColor: background, useCORS: true, logging: false,
    // html2canvas places letters one by one, so tight negative tracking opens gaps
    // inside figures ("1 2,024"); the captured copy uses normal tracking.
    onclone: (doc) => doc.querySelectorAll('[data-numeric]').forEach((el) => { el.style.letterSpacing = 'normal'; }),
  });
  const pad = 28 * SCALE;
  const foot = 30 * SCALE;
  const out = document.createElement('canvas');
  out.width = inner.width + pad * 2;
  out.height = inner.height + pad + foot;
  const ctx = out.getContext('2d');
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.drawImage(inner, pad, pad);
  const when = new Date().toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
  ctx.fillStyle = muted;
  ctx.font = `500 ${10.5 * SCALE}px 'Inter Variable', Inter, -apple-system, 'Segoe UI', sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`Downloaded from Fintraxa, ${when}`, out.width / 2, inner.height + pad + foot / 2);
  const a = document.createElement('a');
  a.download = filename;
  a.href = out.toDataURL('image/png');
  a.click();
}

/** "08 Nov 2026" */
export const receiptDate = (d) => (d ? new Date(`${d}T00:00:00`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : null);
