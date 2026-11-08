/**
 * Which model answers: chosen by Xyro, never by the user.
 *
 * Google retires model versions on its own schedule (2.0, then 2.5 …), so a
 * hard-coded name stops working one day. Instead Xyro reads the models the
 * user's key can call (models.list), keeps that list on the device for a day,
 * and picks the fastest family available: Flash-Lite, then Flash, newest
 * version first, stable before preview. Pro and other slow, thinking-first
 * models are used only if nothing faster exists.
 */
import { listModels } from './gemini.js';

const NS = 'fintraxa.xyro';
const TTL_MS = 24 * 60 * 60 * 1000;
const LIST_TIMEOUT_MS = 5000;
const key = (uid) => `${NS}.${uid || 'anon'}.models`;

/** Used only when the list cannot be read at all (newest families first). */
export const GUESS_MODELS = ['gemini-3.5-flash-lite', 'gemini-3.5-flash', 'gemini-3-flash-lite', 'gemini-3-flash', 'gemini-2.5-flash-lite', 'gemini-2.5-flash'];

const versionOf = (id) => Number((String(id).match(/^gemini-(\d+(?:\.\d+)?)/i) ?? [])[1] ?? 0);
const isPreview = (id) => /(preview|exp|experimental|-latest|\d{2}-\d{2}$)/i.test(id);

/** Fastest first: Flash-Lite, Flash, then anything else; newest version; stable before preview. */
export function pickFastModels(ids, limit = 4) {
  const family = (id) => (/-flash-lite/i.test(id) ? 0 : /-flash/i.test(id) ? 1 : /-pro/i.test(id) ? 3 : 2);
  const usable = [...new Set(ids)].filter((id) => /^gemini-\d/i.test(id) && !/(embedding|image|tts|audio|live|vision|aqa|learnlm|robotics|computer-use|thinking)/i.test(id));
  return usable.sort((a, b) => family(a) - family(b) || versionOf(b) - versionOf(a) || Number(isPreview(a)) - Number(isPreview(b)) || a.localeCompare(b)).slice(0, limit);
}

/** { ids, labels: { id: display name }, at } or null. */
export function getCachedModels(uid) {
  try {
    const v = JSON.parse(globalThis.localStorage?.getItem(key(uid)) ?? 'null');
    return v && Array.isArray(v.ids) ? { labels: {}, ...v } : null;
  } catch { return null; }
}
/** list: model ids, or { id, label } from listModels. */
export function setCachedModels(uid, list) {
  const ids = list.map((m) => (typeof m === 'string' ? m : m.id));
  const labels = Object.fromEntries(list.filter((m) => typeof m !== 'string' && m.label).map((m) => [m.id, m.label]));
  try { globalThis.localStorage?.setItem(key(uid), JSON.stringify({ ids, labels, at: Date.now() })); } catch { /* not remembered */ }
  return { ids, labels, at: Date.now() };
}

/** Every chat model the key can use, fastest first: the options shown in Settings. */
export const modelOptions = (cached) => (cached?.ids?.length ? pickFastModels(cached.ids, Infinity) : []);

/**
 * The models to try for a setting: 'auto' → the fastest available; a chosen id →
 * that one first, then the fastest others (so a retired choice never breaks the chat).
 */
export async function chainFor(uid, apiKey, setting, o) {
  const fast = await modelsFor(uid, apiKey, o);
  // A saved model the key no longer lists (retired, or saved by an older version) counts as automatic.
  const known = getCachedModels(uid)?.ids;
  if (!setting || setting === 'auto' || (known?.length && !known.includes(setting))) return fast;
  return [setting, ...fast.filter((m) => m !== setting)];
}
export function clearCachedModels(uid) {
  try { globalThis.localStorage?.removeItem(key(uid)); } catch { /* nothing to clear */ }
}

/**
 * The models to try, in order, for this key. Reads the cached list (refreshed
 * daily); fetches it when missing, giving up after a few seconds so a question
 * is never held up by the lookup.
 */
export async function modelsFor(uid, apiKey, { fetchImpl, now = Date.now() } = {}) {
  const cached = getCachedModels(uid);
  if (cached?.ids?.length && now - cached.at < TTL_MS) return pickFastModels(cached.ids);
  // One lookup at a time per user: the panel's warm-up and a quick first question share it.
  if (inflight.has(uid)) return inflight.get(uid);
  const run = lookup(uid, apiKey, fetchImpl, cached).finally(() => inflight.delete(uid));
  inflight.set(uid, run);
  return run;
}

const inflight = new Map();
async function lookup(uid, apiKey, fetchImpl, cached) {
  try {
    const list = await Promise.race([
      listModels(apiKey, fetchImpl),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), LIST_TIMEOUT_MS)),
    ]);
    const ids = list.map((m) => m.id);
    if (ids.length) setCachedModels(uid, list);
    const picked = pickFastModels(ids);
    if (picked.length) return picked;
  } catch { /* fall through */ }
  return cached?.ids?.length ? pickFastModels(cached.ids) : GUESS_MODELS;
}
