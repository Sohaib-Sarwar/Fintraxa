// Edge Function entry: CORS, client wiring, error envelope. Logic lives in
// handler.js so it is plain JS shared with the Node test suite.
import { createClient } from '@supabase/supabase-js';
import { getDocumentProxy } from 'unpdf';
import { handle, HttpError } from './handler.js';

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

function serviceKey(): string {
  const legacy = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (legacy) return legacy;
  try {
    const keys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}');
    return keys.default ?? Object.values(keys)[0] as string;
  } catch {
    return '';
  }
}

function anonKey(): string {
  const legacy = Deno.env.get('SUPABASE_ANON_KEY');
  if (legacy) return legacy;
  try {
    const keys = JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') ?? '{}');
    return keys.default ?? Object.values(keys)[0] as string;
  } catch {
    return '';
  }
}

Deno.serve(async (req) => {
  const headers = { ...cors(req.headers.get('origin')), 'Content-Type': 'application/json' };
  if (req.method === 'OPTIONS') return new Response('ok', { headers });
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers });

  const url = Deno.env.get('SUPABASE_URL')!;
  const authorization = req.headers.get('Authorization') ?? '';
  const admin = createClient(url, serviceKey(), { auth: { persistSession: false, autoRefreshToken: false } });
  const asUser = createClient(url, anonKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: authorization } },
  });

  try {
    const out = await handle({
      req, admin, asUser,
      openPdf: (bytes: Uint8Array) => getDocumentProxy(bytes),
    });
    return new Response(JSON.stringify(out.body), { status: out.status, headers });
  } catch (err) {
    const e = err instanceof HttpError ? err : new HttpError(500, 'internal', 'Processing failed unexpectedly.', { retryable: true });
    if (!(err instanceof HttpError)) console.error(JSON.stringify({ fn: 'mf-import', stage: 'unhandled', name: (err as Error)?.name }));
    return new Response(JSON.stringify({
      error: e.message, category: e.category, retryable: e.retryable, recovery_action: e.recovery,
      import_id: (err as { importId?: string })?.importId ?? null,
    }), { status: e.status, headers });
  }
});
