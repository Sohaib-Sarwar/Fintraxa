/** Receipt text helpers (no React), shared by every receipt and tested on their own. */

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "14 Nov 2026": the one date format on every receipt (a slip's format, no weekday). */
export function receiptDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return iso;
  return `${d} ${MON[m - 1]} ${y}`;
}

/** The downloaded image's name: ("Food & Dining", "2026-11-14") → "fintraxa-receipt-food-dining-2026-11-14.png". */
export function receiptFileName(...parts: (string | null | undefined)[]): string {
  const slug = ['fintraxa', 'receipt', ...parts].filter(Boolean).join('-').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `${slug.slice(0, 80).replace(/-$/, '')}.png`;
}
