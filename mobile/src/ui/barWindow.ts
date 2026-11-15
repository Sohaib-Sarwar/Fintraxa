/** At most this many bars on any chart (owner, 2026-11-15: "max 6 months… for all pages"). */
export const MAX_BARS = 6;

/** The newest MAX_BARS bars, or the six ending at the selected bar when an older month is selected. */
export function barWindow<B extends { key: string }>(all: B[], selected?: string | null): B[] {
  if (all.length <= MAX_BARS) return all;
  const sel = selected ? all.findIndex((b) => b.key === selected) : -1;
  const end = sel >= 0 && sel < all.length - MAX_BARS ? sel + 1 : all.length;
  return all.slice(Math.max(0, end - MAX_BARS), end);
}

/**
 * Pages of six (owner, 2026-11-15: "if the range is longer than 6 months, swipe right for the previous 6, and so on"):
 * page 0 is the newest six months, page 1 the six before them, …; the oldest page may hold fewer.
 */
export const barPages = (count: number) => Math.max(1, Math.ceil(count / MAX_BARS));

/** The bars on `page` (0 = newest), oldest first as drawn. */
export function barPage<B>(all: B[], page: number): B[] {
  const end = all.length - Math.max(0, page) * MAX_BARS;
  return end <= 0 ? [] : all.slice(Math.max(0, end - MAX_BARS), end);
}

/** The page that shows `key` (0 when it isn't there). */
export function pageOf<B extends { key: string }>(all: B[], key?: string | null): number {
  const i = key ? all.findIndex((b) => b.key === key) : -1;
  return i < 0 ? 0 : Math.floor((all.length - 1 - i) / MAX_BARS);
}
