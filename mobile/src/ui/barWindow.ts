/** At most this many bars on any chart (owner, 2026-11-15: "max 6 months… for all pages"). */
export const MAX_BARS = 6;

/** The newest MAX_BARS bars, or the six ending at the selected bar when an older month is selected. */
export function barWindow<B extends { key: string }>(all: B[], selected?: string | null): B[] {
  if (all.length <= MAX_BARS) return all;
  const sel = selected ? all.findIndex((b) => b.key === selected) : -1;
  const end = sel >= 0 && sel < all.length - MAX_BARS ? sel + 1 : all.length;
  return all.slice(Math.max(0, end - MAX_BARS), end);
}
