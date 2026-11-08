/**
 * Google Gemini over plain fetch (no SDK): list the models a key can use and
 * stream an answer. The key travels only in the x-goog-api-key header, never
 * in a URL, and is never logged.
 */
const BASE = 'https://generativelanguage.googleapis.com/v1beta';

export class XyroError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

/** HTTP status + Google's error body → one plain sentence the user can act on. */
export function mapError(status, body) {
  const msg = String(body?.error?.message ?? '');
  const reason = JSON.stringify(body?.error?.details ?? '');
  // `detail` keeps the provider's own words for Settings, where they help fix a key.
  const err = (code, text) => Object.assign(new XyroError(code, text), { detail: msg || null });
  if (status === 400 && /api key|API_KEY_INVALID/i.test(msg + reason)) return err('invalid_key', 'The API key was not accepted. Check it in Settings, Xyro AI.');
  if (status === 401 || status === 403) return err('invalid_key', /SERVICE_DISABLED|has not been used|disabled/i.test(msg + reason)
    ? 'The Generative Language API is turned off for this key’s project. Enable it in Google Cloud, or create the key in Google AI Studio.'
    : 'This API key is not allowed to answer here (check its restrictions). Fix it in Settings, Xyro AI.');
  if (status === 429) return err('quota', 'The free limit for this key is used up for now. Wait a minute and try again.');
  if (status === 404) return err('model', 'Xyro could not find a model this key can use. Check the key in Settings, Xyro AI.');
  if (status >= 500) return err('unavailable', 'Xyro’s AI service is busy right now. Try again in a moment.');
  return err('request', msg ? `Xyro could not answer: ${msg}` : 'Xyro could not answer that request.');
}

/**
 * Thinking settings to try, least thinking first: answers are lookups in
 * precomputed tables, and thinking is most of the wait before the first word.
 * Gemini 3+ Flash / Flash-Lite: "minimal", then "low". 2.5 Flash / Flash-Lite:
 * off (budget 0). 2.5 Pro: its minimum (128). If a model refuses a setting the
 * next one is tried, and the one that worked is remembered for the session.
 */
export function thinkingLadder(model) {
  const id = String(model ?? '').toLowerCase();
  if (/gemini-2\.5-flash/.test(id)) return [{ thinkingBudget: 0 }];
  if (/gemini-2\.5-pro/.test(id)) return [{ thinkingBudget: 128 }];
  if (/gemini-[3-9][\d.]*-flash/.test(id)) return [{ thinkingLevel: 'minimal' }, { thinkingLevel: 'low' }];
  if (/gemini-[3-9]/.test(id)) return [{ thinkingLevel: 'low' }];
  return [];
}
/** The first setting to try for a model (kept for callers and tests). */
export const thinkingFor = (model) => thinkingLadder(model)[0] ?? null;
const workingStep = new Map(); // model → index into its ladder that the API accepted

/** The JSON body for generateContent / streamGenerateContent. */
export function buildRequest({ system, history, model, thinking = true, step = 0 }) {
  const think = thinking ? (thinkingLadder(model)[step] ?? null) : null;
  return {
    systemInstruction: { parts: [{ text: system }] },
    contents: history.filter((m) => m.text && !m.error).map((m) => ({ role: m.role === 'model' ? 'model' : 'user', parts: [{ text: m.apiText ?? m.text }] })),
    generationConfig: { temperature: 0.2, topP: 0.9, maxOutputTokens: 4096, ...(think ? { thinkingConfig: think } : {}) },
  };
}

/** Text + finish state from one streamed chunk. */
export function readChunk(json) {
  if (json?.promptFeedback?.blockReason) return { text: '', blocked: true };
  const cand = json?.candidates?.[0];
  const text = (cand?.content?.parts ?? []).map((p) => (p.thought ? '' : p.text ?? '')).join('');
  return { text, blocked: cand?.finishReason === 'SAFETY' || cand?.finishReason === 'PROHIBITED_CONTENT', finish: cand?.finishReason ?? null };
}

/**
 * Split an SSE buffer into complete `data:` payloads; returns [payloads, rest].
 * Events are separated by a blank line; a payload may span several data lines.
 */
export function splitSse(buffer) {
  const out = [];
  const norm = buffer.replace(/\r\n/g, '\n');
  const events = norm.split('\n\n');
  const rest = events.pop() ?? '';
  for (const ev of events) {
    const data = ev.split('\n').filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trimStart()).join('\n');
    if (data && data !== '[DONE]') out.push(data);
  }
  return [out, rest];
}

/**
 * Stream an answer. onText receives the text so far after each chunk.
 * @returns {Promise<string>} the full answer
 */
export async function streamAnswer({
  apiKey, model, system, history, signal, onText, fetchImpl = globalThis.fetch, thinking = true,
  firstWordMs = FIRST_WORD_MS, idleMs = IDLE_MS, step = workingStep.get(model) ?? 0,
}) {
  if (!apiKey) throw new XyroError('no_key', 'Add your API key in Settings, Xyro AI.');
  // Our own abort, linked to the caller's: a model that goes quiet (no first word in
  // firstWordMs, or a gap of idleMs mid-answer) is cut off with code 'slow' so the
  // next model can answer, instead of the chat hanging on "Writing your answer".
  const ctrl = new AbortController();
  const onOuterAbort = () => ctrl.abort();
  if (signal?.aborted) ctrl.abort(); else signal?.addEventListener('abort', onOuterAbort, { once: true });
  let timedOut = false;
  let timer = null;
  const arm = (ms) => { clearTimeout(timer); timer = setTimeout(() => { timedOut = true; ctrl.abort(); }, ms); };
  const slow = () => new XyroError('slow', 'Xyro took too long to answer. Try again.');
  arm(firstWordMs);
  try {
    return await streamOnce();
  } catch (e) {
    if (timedOut && !signal?.aborted) throw slow();
    throw e;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener?.('abort', onOuterAbort);
  }

  async function streamOnce() {
  let res;
  try {
    res = await fetchImpl(`${BASE}/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify(buildRequest({ system, history, model, thinking, step })),
      signal: ctrl.signal,
    });
  } catch (e) {
    if (e?.name === 'AbortError') throw e;
    throw new XyroError('network', 'Could not reach Xyro’s AI service. Check your connection and try again.');
  }
  if (!res.ok) {
    let body = null;
    try { body = await res.json(); } catch { /* not JSON */ }
    // A model that does not take this thinking setting: ask again with its default.
    if (res.status === 400 && thinking && /thinking/i.test(String(body?.error?.message ?? ''))) {
      clearTimeout(timer);
      const next = step + 1;
      const more = next < thinkingLadder(model).length;
      if (more) workingStep.set(model, next);
      return streamAnswer({ apiKey, model, system, history, signal, onText, fetchImpl, thinking: more, step: more ? next : 0, firstWordMs, idleMs });
    }
    throw mapError(res.status, body);
  }
  let full = ''; let blocked = false; let buffer = '';
  const take = (payload) => {
    let json;
    try { json = JSON.parse(payload); } catch { return; }
    if (json?.error) throw mapError(json.error.code ?? 500, json);
    const c = readChunk(json);
    if (c.blocked) blocked = true;
    if (c.text) { full += c.text; arm(idleMs); onText?.(full); }
  };
  if (res.body?.getReader) {
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += dec.decode(value, { stream: true });
      const [payloads, rest] = splitSse(buffer);
      buffer = rest;
      payloads.forEach(take);
    }
    buffer += dec.decode();
  } else {
    buffer = await res.text();
  }
  const [last] = splitSse(`${buffer}\n\n`);
  last.forEach(take);
  if (!full && blocked) throw new XyroError('blocked', 'Xyro could not answer that one. Try asking it a different way.');
  if (!full) throw new XyroError('empty', 'Xyro came back empty. Try again.');
  return full;
  }
}

/** No first word within this long: the model is stuck or overloaded; try the next one. */
export const FIRST_WORD_MS = 12_000;
/** A pause this long in the middle of an answer counts as stalled. */
export const IDLE_MS = 15_000;

/**
 * The system chooses the model, fastest first. Answers are lookups in
 * precomputed tables, so a small model with thinking off is both quick and
 * accurate; the larger Flash models follow only as fallbacks. Preview and
 * "thinking-first" models are left out: they are what made answers hang.
 */
export const FAST_MODELS = ['gemini-3.5-flash-lite', 'gemini-3.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.5-flash'];

const sleep = (ms, signal) => new Promise((resolve, reject) => {
  const id = setTimeout(resolve, ms);
  signal?.addEventListener('abort', () => { clearTimeout(id); reject(Object.assign(new Error('aborted'), { name: 'AbortError' })); }, { once: true });
});
/** Proven, widely available models to fall back on when the chosen one is overloaded. */
export const FALLBACK_MODELS = FAST_MODELS.slice(1);

/**
 * streamAnswer with resilience: an overloaded or unavailable model (5xx, 429,
 * 404) is retried once after a short pause, then the next model in line is
 * tried (the chosen one first, then FALLBACK_MODELS). A bad key, a blocked
 * prompt or a stop by the user ends it at once. Retries only happen before any
 * text has streamed, so an answer is never duplicated.
 * onModel(model) reports a switch, so the chat can say which one answered.
 */
export async function answerWithFallback({ model, fallbacks = FALLBACK_MODELS, onModel, signal, onText, ...rest }) {
  const chain = [...new Set([model, ...fallbacks].filter(Boolean))];
  let lastErr;
  for (const [i, m] of chain.entries()) {
    for (let attempt = 0; attempt < (i === 0 ? 2 : 1); attempt += 1) {
      let streamed = false;
      try {
        if (i > 0 || attempt > 0) onModel?.(m);
        return await streamAnswer({ ...rest, model: m, signal, onText: (so) => { streamed = true; onText?.(so); } });
      } catch (e) {
        if (e?.name === 'AbortError' || streamed) throw e;
        lastErr = e;
        if (!['unavailable', 'quota', 'model', 'empty', 'slow'].includes(e?.code)) throw e;
        if (e.code === 'slow' || e.code === 'model') break; // a stuck or missing model: straight to the next one
        if (attempt === 0 && i === 0) await sleep(800, signal);
      }
    }
  }
  throw lastErr;
}

/** Models this key can call generateContent with, newest Flash first. */
export async function listModels(apiKey, fetchImpl = globalThis.fetch) {
  let res;
  try {
    res = await fetchImpl(`${BASE}/models?pageSize=200`, { headers: { 'x-goog-api-key': apiKey } });
  } catch {
    throw new XyroError('network', 'Could not reach Google to check the key. Check your connection and try again.');
  }
  if (!res.ok) {
    let body = null;
    try { body = await res.json(); } catch { /* not JSON */ }
    throw mapError(res.status, body);
  }
  const data = await res.json();
  return rankModels((data?.models ?? [])
    .filter((m) => (m.supportedGenerationMethods ?? []).includes('generateContent'))
    .map((m) => ({ id: String(m.name).replace(/^models\//, ''), label: m.displayName || String(m.name).replace(/^models\//, '') }))
    .filter((m) => /^gemini-/i.test(m.id)));
}

const versionOf = (id) => Number((id.match(/^gemini-(\d+(?:\.\d+)?)/i) ?? [])[1] ?? 0);
/** Stable Flash first (newest version), then Flash previews, then Pro, then the rest. */
export function rankModels(models) {
  const tier = (id) => {
    const preview = /(preview|exp|latest)/i.test(id) ? 1 : 0;
    if (/-flash$/i.test(id)) return 0 + preview;
    if (/-flash/i.test(id) && !/lite/i.test(id)) return 2 + preview;
    if (/-pro/i.test(id)) return 4 + preview;
    return 6 + preview;
  };
  return [...models].sort((a, b) => tier(a.id) - tier(b.id) || versionOf(b.id) - versionOf(a.id) || a.id.localeCompare(b.id));
}
