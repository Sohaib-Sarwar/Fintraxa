// Edge Function entry for doc-intake: CORS, auth, storage and pdf.js wiring. Logic lives in handler.js
// (plain JS shared with the Node test suite). Deployed with verify_jwt ON; the user is also checked here.
import { createClient } from '@supabase/supabase-js';
import { getDocumentProxy } from 'unpdf';
import { BUCKET, handle, HttpError } from './handler.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

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

Deno.serve(async (req) => {
  const headers = { ...CORS, 'Content-Type': 'application/json' };
  if (req.method === 'OPTIONS') return new Response('ok', { headers });
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers });

  const url = Deno.env.get('SUPABASE_URL')!;
  const admin = createClient(url, serviceKey(), { auth: { persistSession: false, autoRefreshToken: false } });
  try {
    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    const { data: auth, error: authErr } = await admin.auth.getUser(token);
    if (authErr || !auth?.user) throw new HttpError(401, 'unauthorized', 'Sign in again to upload documents.');
    const body = await req.json().catch(() => ({}));

    const out = await handle({
      body,
      userId: auth.user.id,
      download: async (path: string) => {
        const { data, error } = await admin.storage.from(BUCKET).download(path);
        if (error || !data) return null;
        return new Uint8Array(await data.arrayBuffer());
      },
      remove: async (path: string) => { await admin.storage.from(BUCKET).remove([path]); },
      openPdf: (bytes: Uint8Array, password?: string) => getDocumentProxy(bytes, { password, isEvalSupported: false }),
      log: (o: object) => console.log(JSON.stringify(o)),
    });
    return new Response(JSON.stringify(out), { status: 200, headers });
  } catch (err) {
    const e = err instanceof HttpError ? err : new HttpError(500, 'internal', 'Reading the document failed. Please try again.');
    if (!(err instanceof HttpError)) console.error(JSON.stringify({ fn: 'doc-intake', stage: 'unhandled', name: (err as Error)?.name }));
    return new Response(JSON.stringify({ error: e.message, code: e.code }), { status: e.status, headers });
  }
});
