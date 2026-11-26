/**
 * Upcoming dividends (owner, 2026-11-22): rows of `upcoming_dividends` joined to their PSX announcement
 * (`psx_dividend_announcements`), written nightly by the Edge Function `dividends-scan` for held stocks only.
 * This file turns one into plain, formal wording; shared by web and phone (@core/psx/upcomingDividends.js).
 * Nothing here counts in any figure: only an approved one becomes a dividend (RPC upcoming_dividend_approve).
 *
 * Stages (PKT calendar day):
 *   hold     — on or before the last cum-dividend day: still qualifies only if held to the end of that day;
 *   entitled — past the ex-date, before the expected payment date: qualified, waiting for the money;
 *   due      — past the expected payment date: should have arrived; approve it with what came in.
 */
import { stampDate } from '../market/priceStamp.js';

export const UPCOMING_SELECT = 'id, symbol, shares::text, dps::text, gross::text, tax_rate::text, tax::text, net::text, filer_status, status, dividend_id, created_at, '
  + 'announcement:psx_dividend_announcements(id, company_name, announced_on, period, dividend_type, interim_no, percent::text, dps::text, face_value::text, '
  + 'book_closure_from, book_closure_to, agm_date, ex_date, last_cum_date, expected_pay_by, source, source_url)';

const ORD = { 1: '1st', 2: '2nd', 3: '3rd', 4: '4th' };
const todayPkt = (now = Date.now()) => new Date(now + 5 * 3_600_000).toISOString().slice(0, 10);

/** 'Final dividend' / '3rd interim dividend' / 'Interim dividend'. */
export function typeLabel(a) {
  if (a?.dividend_type === 'final') return 'Final dividend';
  if (a?.dividend_type === 'special') return 'Special dividend';
  return a?.interim_no ? `${ORD[a.interim_no] ?? `${a.interim_no}th`} interim dividend` : 'Interim dividend';
}

/** One upcoming row → what the screens show. */
export function describeUpcoming(u, now = Date.now()) {
  const a = u?.announcement ?? {};
  const today = todayPkt(now);
  const stage = a.last_cum_date && today <= a.last_cum_date ? 'hold'
    : a.expected_pay_by && today > a.expected_pay_by ? 'due' : 'entitled';
  const shares = Number(u.shares);
  const sharesText = `${shares.toLocaleString('en-US', { maximumFractionDigits: 4 })} share${shares === 1 ? '' : 's'}`;
  const finalPending = a.dividend_type === 'final' && a.agm_date && today < a.agm_date;
  const status = {
    hold: `Keep holding until the close on ${stampDate(a.last_cum_date)} to qualify (ex-date ${stampDate(a.ex_date)}).`,
    entitled: `Qualified with ${sharesText}. Payment expected by ${stampDate(a.expected_pay_by)}.`,
    due: `Payment was due by ${stampDate(a.expected_pay_by)}. Approve it with the amount you received.`,
  }[stage];
  const ratePct = Math.round(Number(u.tax_rate) * 1000) / 10;
  return {
    stage,
    stageLabel: { hold: 'Hold to qualify', entitled: 'Qualified', due: 'Payment due' }[stage],
    title: typeLabel(a),
    perShare: `Rs ${Number(u.dps).toFixed(2)} per share${a.percent ? ` (${Number(a.percent)}%)` : ''}`,
    status,
    note: finalPending ? `A final dividend is only recommended until the AGM on ${stampDate(a.agm_date)} approves it.` : null,
    gross: Number(u.gross), tax: Number(u.tax), net: Number(u.net), shares,
    taxLabel: `Tax ${ratePct}% (${u.filer_status === 'non_filer' ? 'non-filer' : u.filer_status === 'filer' ? 'filer' : 'filer rate assumed; set your status in Profile'})`,
    dates: [
      ['Ex-date', stampDate(a.ex_date)],
      ['Last day to hold', stampDate(a.last_cum_date)],
      ['Book closure', a.book_closure_to && a.book_closure_to !== a.book_closure_from ? `${stampDate(a.book_closure_from)} – ${stampDate(a.book_closure_to)}` : stampDate(a.book_closure_from)],
      ...(a.agm_date ? [['AGM', stampDate(a.agm_date)]] : []),
      ['Payment expected by', stampDate(a.expected_pay_by)],
    ],
    source: a.source === 'psx_letter_ai' ? 'The company’s PSX letter (read by AI, checked twice)' : 'PSX financial announcements',
    sourceUrl: a.source_url ?? null,
    // Prefill for approval: the expected net and the expected payment day (never after today).
    suggestDate: a.expected_pay_by && a.expected_pay_by < today ? a.expected_pay_by : today,
    canApprove: stage !== 'hold',
  };
}

/**
 * What "Check now" tells the user (owner, 2026-11-26: "it said 8 dividends announced but nothing is upcoming — I have
 * already added them; notifications should make sense"). Counts only what is still waiting for the user; PSX's
 * announcements that are already recorded are mentioned as such, never as new.
 * @param scan     the dividends-scan response ({ sync: { waiting, recorded, … } })
 * @param waiting  the pending list's length after the refetch (used when an older server gives no `waiting`)
 * @returns {{ tone: 'success'|'info', title: string, text: string }}
 */
export function checkSummary(scan, waiting = null) {
  const s = scan?.sync ?? {};
  const n = Number.isFinite(s.waiting) ? s.waiting : Number(waiting ?? 0);
  const done = Number.isFinite(s.recorded) ? s.recorded : 0;
  const plural = (k, one, many) => `${k} ${k === 1 ? one : many}`;
  if (n > 0) {
    return {
      tone: 'success',
      title: plural(n, 'dividend to confirm', 'dividends to confirm'),
      text: `${plural(n, 'dividend', 'dividends')} announced on your stocks ${n === 1 ? 'is' : 'are'} waiting for you to confirm when paid.${done ? ` ${done} recent ${done === 1 ? 'one is' : 'ones are'} already recorded.` : ''}`,
    };
  }
  if (done > 0) {
    return { tone: 'info', title: 'You’re up to date', text: `No dividends waiting. The ${plural(done, 'recent dividend', 'recent dividends')} announced on your stocks ${done === 1 ? 'is' : 'are'} already recorded.` };
  }
  return { tone: 'info', title: 'You’re up to date', text: 'No cash dividends announced on your stocks right now. PSX is checked every night.' };
}

/** Newest-first order that puts what needs action first: due, then qualified, then hold-to-qualify. */
export function sortUpcoming(rows) {
  const rank = { due: 0, entitled: 1, hold: 2 };
  return [...(rows ?? [])].sort((x, y) => {
    const a = describeUpcoming(x); const b = describeUpcoming(y);
    return (rank[a.stage] - rank[b.stage]) || String(x.announcement?.book_closure_from).localeCompare(String(y.announcement?.book_closure_from));
  });
}
