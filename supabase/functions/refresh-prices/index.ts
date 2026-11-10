// Edge Function entry: auth, CORS, the streamed response. Logic lives in handler.js (plain JS,
// shared with the Node tests).
//
// Two callers:
//   * the app (Settings > Market prices), with the signed-in user's JWT: that user's holdings,
//     streamed back one JSON object per line as each step finishes.
//   * pg_cron, with the x-cron-secret header (checked against Vault by snapshot_verify_cron_secret,
//     as portfolio-snapshot does): everyone's holdings, answered with the finished run.
// verify_jwt is off because the cron call has no JWT; both paths authenticate here.
import { createClient } from '@supabase/supabase-js';
import { refresh } from './handler.js';

const QUOTES_URL = Deno.env.get('MARKET_QUOTES_URL') ?? 'https://pk-finance-cron.pk-microservice.workers.dev/v1/quotes';
const FUNDS_URL = Deno.env.get('MARKET_FUNDS_URL') ?? 'https://sohaib-sarwar.github.io/PSX-MUFAP-MicroService/api/mufap/funds.json';
const ALLOWED_ORIGINS = (Deno.env.get('MF_ALLOWED_ORIGINS') ?? '').split(',').map((s) => s.trim()).filter(Boolean);

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

async function quotes(body: unknown) {
  const res = await fetch(QUOTES_URL, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    signal: AbortSignal.timeout(45_000),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error ?? `market service answered ${res.status}`);
  return json;
}

/** slug → MUFAP's fund name, category and manager, from the published fund list (the same slugs mf_funds links to). */
async function mufapIndex() {
  const res = await fetch(FUNDS_URL, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) return new Map();
  const body = await res.json();
  return new Map((body?.data ?? []).map((r: { slug: string; fund_name: string; category: string; amc?: string }) => [r.slug, { fund_name: r.fund_name, category: r.category, amc: r.amc ?? null }]));
}

Deno.serve(async (req) => {
  const base = cors(req.headers.get('origin'));
  if (req.method === 'OPTIONS') return new Response('ok', { headers: base });
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { ...base, 'Content-Type': 'application/json' } });

  const url = Deno.env.get('SUPABASE_URL')!;
  const admin = createClient(url, key('SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SECRET_KEYS'), { auth: { persistSession: false, autoRefreshToken: false } });
  const jsonHeaders = { ...base, 'Content-Type': 'application/json' };

  // ── scheduled: everyone's holdings ──
  const cronSecret = req.headers.get('x-cron-secret');
  if (cronSecret) {
    const { data: ok } = await admin.rpc('snapshot_verify_cron_secret', { p_secret: cronSecret });
    if (ok !== true) return new Response(JSON.stringify({ error: 'Not allowed' }), { status: 401, headers: jsonHeaders });
    try {
      const run = await refresh({ userId: null, admin, quotes, mufapIndex });
      return new Response(JSON.stringify({ id: run?.id, status: run?.status, psx: run?.psx_updated, funds: run?.mufap_updated, ms: run?.duration_ms }), { headers: jsonHeaders });
    } catch (err) {
      const status = (err as { status?: number })?.status === 429 ? 429 : 500;
      console.error('[refresh-prices] scheduled run', (err as Error).message);
      return new Response(JSON.stringify({ error: String((err as Error).message) }), { status, headers: jsonHeaders });
    }
  }

  // ── a signed-in user: their holdings, streamed ──
  const asUser = createClient(url, key('SUPABASE_ANON_KEY', 'SUPABASE_PUBLISHABLE_KEYS'), {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });
  const { data: auth } = await asUser.auth.getUser();
  if (!auth?.user) return new Response(JSON.stringify({ error: 'Sign in again.' }), { status: 401, headers: jsonHeaders });

  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (event: unknown) => controller.enqueue(enc.encode(`${JSON.stringify(event)}\n`));
      try {
        await refresh({ userId: auth.user.id, admin, quotes, emit, mufapIndex });
      } catch (err) {
        const status = (err as { status?: number })?.status;
        if (status === 429) emit({ type: 'busy', message: String((err as Error).message) });
        // Other errors were already reported by the handler as an `error` event.
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { ...base, 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-store' } });
});
