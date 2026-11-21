/**
 * The formal result of "Refresh my prices": what was updated (price, the day it is for, where it came from)
 * and what was not (with the reason), from the finished run (`market_refresh_runs` row: psx_* counts and
 * `details` written by the Edge Function refresh-prices/handler.js). Shared by web and mobile (@core/market/refreshSummary.js).
 */
import { stampDate, stampTime } from './priceStamp.js';

const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

const PSX_REASON = {
  not_found: 'Not found on PSX: check the symbol.',
  no_price: 'PSX shows no price for it (not traded, or suspended).',
  unavailable: 'PSX did not answer in time. Try again in a minute.',
};

function fundReason(f, amc) {
  const m = (amc?.managers ?? []).find((x) => x.amc === f.amc);
  if (m && m.status !== 'ok') return `${f.amc}’s website did not answer, and MUFAP has no newer price.`;
  if (f.amc && (amc?.unsupported ?? []).includes(f.amc)) return `MUFAP refused the request and ${f.amc} is not yet read directly.`;
  if (m?.status === 'ok') return `${f.amc} has not published a price for it yet.`;
  return 'No published price was found for it.';
}

function fundSource(f, amc) {
  if (f.source !== 'amc') return 'MUFAP';
  const m = (amc?.managers ?? []).find((x) => x.amc === f.amc);
  return m?.via === 'gemini_url_context' ? `${f.amc ?? 'Fund manager'} website (read via Google)` : `${f.amc ?? 'Fund manager'} website`;
}

/**
 * run → {
 *   tone: 'ok' | 'partial' | 'failed', headline, sub,
 *   updated: [{ kind: 'stock'|'fund', name, price, dp, date, source }],
 *   notUpdated: [{ kind, name, reason }],
 * }
 */
export function refreshSummary(run) {
  if (!run) return null;
  const d = run.details ?? {};
  const updated = []; const notUpdated = [];
  for (const q of d.psx ?? []) {
    if (q.status === 'ok' && q.price > 0) {
      updated.push({ kind: 'stock', name: q.symbol, price: Number(q.price), dp: 2, date: q.as_of ? String(q.as_of).slice(0, 10) : null, source: /screener/i.test(String(q.as_of_text ?? '')) ? 'PSX screener (all stocks page)' : 'PSX company page' });
    } else {
      notUpdated.push({ kind: 'stock', name: q.symbol, reason: PSX_REASON[q.status] ?? 'PSX gave no price for it.' });
    }
  }
  for (const f of d.funds ?? []) {
    if (f.price > 0 && f.nav_date) {
      updated.push({ kind: 'fund', name: f.name, price: Number(f.price), dp: 4, date: f.nav_date, source: fundSource(f, d.amc), priceKind: f.kind === 'repurchase' ? 'Repurchase' : 'NAV' });
    } else {
      notUpdated.push({ kind: 'fund', name: f.name, reason: fundReason(f, d.amc) });
    }
  }
  const stocks = (d.psx ?? []).length; const funds = (d.funds ?? []).length;
  const okS = updated.filter((u) => u.kind === 'stock').length; const okF = updated.filter((u) => u.kind === 'fund').length;
  const total = stocks + funds;
  const tone = total === 0 ? 'ok' : notUpdated.length === 0 ? 'ok' : updated.length === 0 ? 'failed' : 'partial';
  const part = (ok, n, w) => (n === 0 ? null : ok === n ? `all ${plural(n, w)}` : `${ok} of ${plural(n, w)}`);
  const parts = [part(okS, stocks, 'stock'), part(okF, funds, 'fund')].filter(Boolean);
  const headline = total === 0 ? 'Nothing to refresh: you hold no stocks or funds.'
    : tone === 'ok' ? `Prices updated: ${parts.join(' and ')}.`
      : tone === 'failed' ? 'No prices could be updated.'
        : `Partly updated: ${parts.join(' and ')}.`;
  const at = stampTime(run.finished_at);
  const sub = [at ? `Finished ${at}` : null, run.duration_ms ? `in ${(run.duration_ms / 1000).toFixed(1)} s` : null].filter(Boolean).join(' ');
  return { tone, headline, sub, updated, notUpdated };
}

/** One line per updated item: 'OGDC  Rs 312.55 · 20 Nov 2026 · PSX'. */
export const updatedLine = (u) => `Rs ${u.price.toFixed(u.dp)} · ${stampDate(u.date) ?? 'date unknown'} · ${u.source}`;
