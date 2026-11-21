// Edge Function entry: auth and I/O for the upcoming-dividends scan. Logic lives in handler.js (plain JS, shared with
// the Node tests). Two callers, as refresh-prices:
//   * pg_cron (x-cron-secret, checked by snapshot_verify_cron_secret): everyone's held stocks, nightly;
//   * the app's "Check now" (the user's JWT): that user's stocks only.
// verify_jwt is off because the cron call has no JWT; both paths authenticate here.
import { createClient } from '@supabase/supabase-js';
import { scan } from './handler.js';

const BOARD_URL = Deno.env.get('MARKET_STOCKS_URL') ?? 'https://sohaib-sarwar.github.io/PSX-MUFAP-MicroService/api/psx/stocks.json';
const ALLOWED_ORIGINS = (Deno.env.get('MF_ALLOWED_ORIGINS') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36';

function cors(origin: string | null) {
  const allow = !ALLOWED_ORIGINS.length || (origin && ALLOWED_ORIGINS.includes(origin)) ? (origin ?? '*') : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
}

function key(legacyName: string, listName: string): string {
  const legacy = Deno.env.get(legacyName);
  if (legacy) return legacy;
  try {
    const keys = JSON.parse(Deno.env.get(listName) ?? '{}');
    return keys.default ?? Object.values(keys)[0] as string;
  } catch {
    return '';
  }
}

async function fetchText(url: string, ms: number): Promise<string> {
  const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept': 'text/html,application/xhtml+xml' }, signal: AbortSignal.timeout(ms) });
  if (!res.ok) throw new Error(`${new URL(url).host} answered ${res.status}`);
  return await res.text();
}

async function board() {
  const res = await fetch(BOARD_URL, { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) return [];
  const body = await res.json();
  return (body?.data ?? []).map((s: { symbol: string; name: string }) => ({ symbol: s.symbol, name: s.name }));
}

// Gemini with URL context reads a PSX company letter (fallback only; see letterReader.js). Key: Edge Function secret.
const GEMINI_KEY = Deno.env.get('GEMINI_API_KEY') ?? '';
const GEMINI_MODEL = Deno.env.get('GEMINI_MODEL') ?? 'gemini-3.5-flash-lite';
async function generate(prompt: string): Promise<string> {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_KEY },
    body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], tools: [{ url_context: {} }], generationConfig: { temperature: 0 } }),
    signal: AbortSignal.timeout(45_000),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${String(body?.error?.message ?? '').slice(0, 160)}`);
  const meta = body?.candidates?.[0]?.urlContextMetadata?.urlMetadata ?? [];
  if (meta.length && !meta.some((m: { urlRetrievalStatus?: string }) => m.urlRetrievalStatus === 'URL_RETRIEVAL_STATUS_SUCCESS')) throw new Error('The letter could not be opened.');
  return (body?.candidates?.[0]?.content?.parts ?? []).map((p: { text?: string }) => p.text ?? '').join('');
}

/** Pakistan's calendar day. */
const todayPkt = () => new Date(Date.now() + 5 * 3_600_000).toISOString().slice(0, 10);

Deno.serve(async (req) => {
  const base = cors(req.headers.get('origin'));
  if (req.method === 'OPTIONS') return new Response('ok', { headers: base });
  const json = { ...base, 'Content-Type': 'application/json' };
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: json });

  const url = Deno.env.get('SUPABASE_URL')!;
  const admin = createClient(url, key('SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SECRET_KEYS'), { auth: { persistSession: false, autoRefreshToken: false } });
  const deps = { admin, fetchText, board, generate: GEMINI_KEY ? generate : null, today: todayPkt() };

  const cronSecret = req.headers.get('x-cron-secret');
  let userId: string | null = null;
  if (cronSecret) {
    const { data: ok } = await admin.rpc('snapshot_verify_cron_secret', { p_secret: cronSecret });
    if (ok !== true) return new Response(JSON.stringify({ error: 'Not allowed' }), { status: 401, headers: json });
  } else {
    const asUser = createClient(url, key('SUPABASE_ANON_KEY', 'SUPABASE_PUBLISHABLE_KEYS'), {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    });
    const { data: auth } = await asUser.auth.getUser();
    if (!auth?.user) return new Response(JSON.stringify({ error: 'Sign in again.' }), { status: 401, headers: json });
    userId = auth.user.id;
  }

  try {
    const result = await scan({ ...deps, userId });
    console.log('[dividends-scan]', userId ? 'user' : 'scheduled', JSON.stringify({ ...result, found: result.found.length }));
    return new Response(JSON.stringify(result), { headers: json });
  } catch (err) {
    console.error('[dividends-scan]', (err as Error).message);
    return new Response(JSON.stringify({ error: 'The dividend check failed. Try again later.' }), { status: 500, headers: json });
  }
});
