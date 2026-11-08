/**
 * Read a PDF in the browser: positioned lines (for trade confirmations) and
 * the plain text stream (for dividend reports, the same text a copy-paste
 * gives). The file never leaves the device; only approved rows are saved.
 *
 * pdf.js comes from unpdf (the build the mf-import Edge Function uses), loaded
 * on demand so it is not in the main bundle. Errors are PdfError with a code
 * and a message fit for the user.
 */
import { buildPageLines } from '../../../supabase/functions/_shared/mf/pdfRows.js';

export const MAX_PDF_BYTES = 10 * 1024 * 1024;

export class PdfError extends Error {
  constructor(message, code) { super(message); this.name = 'PdfError'; this.code = code; }
}

const looksLikePdf = (bytes) => {
  // "%PDF" within the first KB (some generators prepend a few bytes).
  const head = bytes.subarray(0, 1024);
  for (let i = 0; i < head.length - 3; i++) if (head[i] === 0x25 && head[i + 1] === 0x50 && head[i + 2] === 0x44 && head[i + 3] === 0x46) return true;
  return false;
};

/**
 * @param {File} file
 * @param {{ password?: string }} [o]
 * @returns {Promise<{ lines: object[], text: string, pages: number }>}
 * @throws {PdfError} codes: not_pdf | too_big | empty_file | password | wrong_password | damaged | no_text
 */
export async function readPdf(file, { password } = {}) {
  if (!file) throw new PdfError('No file was chosen.', 'empty_file');
  if (file.size === 0) throw new PdfError('This file is empty.', 'empty_file');
  if (file.size > MAX_PDF_BYTES) throw new PdfError('This file is larger than 10 MB. Confirmations and dividend reports are usually well under 1 MB.', 'too_big');
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!looksLikePdf(bytes)) throw new PdfError('This is not a PDF. Upload the PDF your broker or CDC sent you.', 'not_pdf');

  const { getDocumentProxy } = await import('unpdf');
  let pdf;
  try {
    // isEvalSupported: false keeps pdf.js inside the app's Content-Security-Policy (no eval).
    pdf = await getDocumentProxy(bytes, { password: password || undefined, isEvalSupported: false });
  } catch (e) {
    if (e?.name === 'PasswordException') {
      throw password
        ? new PdfError('That password did not open the file. Brokers often use your CNIC number without dashes.', 'wrong_password')
        : new PdfError('This PDF is password-protected. Enter its password to read it.', 'password');
    }
    throw new PdfError('This PDF could not be opened. It may be damaged or incomplete; download it again.', 'damaged');
  }

  try {
    const lines = [];
    let text = '';
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const content = await page.getTextContent();
      const items = content.items.filter((it) => typeof it.str === 'string');
      lines.push(...buildPageLines(items.map((it) => ({
        str: it.str, x: it.transform[4], y: it.transform[5], w: it.width, h: it.height || Math.abs(it.transform[3]) || 0,
      })), p));
      text += `${items.map((it) => it.str + (it.hasEOL ? '\n' : ' ')).join('')}\n`;
      page.cleanup?.();
    }
    if (!lines.length) throw new PdfError('This PDF has no readable text. If it is a scanned image, download the original PDF instead.', 'no_text');
    return { lines, text, pages: pdf.numPages };
  } finally {
    pdf.destroy?.();
  }
}
