/**
 * The PSX price a holding is worth "now": the published board, unless a newer price exists.
 *
 * The board (psx/stocks.json) republishes once a working day. A refresh from Settings
 * (Edge Function refresh-prices) fetches the user's held symbols straight from PSX and stores
 * them in psx_price_history under PSX's own "as of" date. Where that date is newer than the
 * board's session, the stored price replaces the board's for that symbol, so every page that
 * values holdings (usePsxPortfolio) moves with it. Same date: the board wins.
 *
 * live:     symbol → board record ({ current, change, change_pct, … })
 * history:  symbol → [{ date, close, change?, change_pct? }], oldest first
 * boardAsOf 'YYYY-MM-DD' of the board's session, or null
 * boardFetchedAt  when the board was fetched (ISO), stamped on its records as `fetched_at` / `as_of`
 * A refreshed price carries its own `fetched_at` (psx_price_history.captured_at).
 */
export function preferNewerPrices(live, history, boardAsOf, boardFetchedAt = null) {
  const out = { ...live };
  if (boardFetchedAt) {
    for (const [k, rec] of Object.entries(out)) out[k] = { ...rec, fetched_at: rec?.fetched_at ?? boardFetchedAt, as_of: rec?.as_of ?? boardAsOf };
  }
  for (const [symbol, list] of Object.entries(history ?? {})) {
    const last = list?.[list.length - 1];
    if (!last || !(Number(last.close) > 0)) continue;
    if (boardAsOf && last.date <= boardAsOf) continue;
    if (!boardAsOf && out[symbol]?.current) continue;
    out[symbol] = {
      ...(out[symbol] ?? { symbol }),
      current: Number(last.close),
      change: last.change === null || last.change === undefined ? null : Number(last.change),
      change_pct: last.change_pct === null || last.change_pct === undefined ? null : Number(last.change_pct),
      as_of: last.date,
      fetched_at: last.captured_at ?? null,
      refreshed: true,
    };
  }
  return out;
}
