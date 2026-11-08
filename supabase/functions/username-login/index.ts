// Sign in with a username instead of an email.
//
// Supabase Auth signs in by email. This function finds the email behind a
// username with the service role (it never reaches the browser), signs in on
// the user's behalf and returns the session for supabase.auth.setSession().
//
// Every failure (unknown username, wrong password) gets the same message and
// status, so usernames cannot be probed. Failed attempts are counted per
// username in fx_private.login_attempts: five in 15 minutes lock that username
// for a while (all requests reach Auth from this function's address, so Auth's
// own per-IP limits cannot do this job). Deployed with verify_jwt = false: it
// is the sign-in itself.
import { createClient } from 'npm:@supabase/supabase-js@2.98.0';

const ALLOWED_ORIGINS = (Deno.env.get('FX_ALLOWED_ORIGINS') ?? Deno.env.get('MF_ALLOWED_ORIGINS') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
const GENERIC = 'Incorrect username or password';
const USERNAME = /^[a-z0-9][a-z0-9._]{1,22}[a-z0-9]$/;

function cors(origin: string | null) {
  const allow = !ALLOWED_ORIGINS.length || (origin && ALLOWED_ORIGINS.includes(origin)) ? (origin ?? '*') : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
}

function key(legacy: string, modern: string): string {
  const v = Deno.env.get(legacy);
  if (v) return v;
  try {
    const keys = JSON.parse(Deno.env.get(modern) ?? '{}');
    return keys.default ?? (Object.values(keys)[0] as string) ?? '';
  } catch {
    return '';
  }
}

Deno.serve(async (req) => {
  const headers = { ...cors(req.headers.get('origin')), 'Content-Type': 'application/json' };
  const reply = (body: unknown, status: number) => new Response(JSON.stringify(body), { status, headers });
  if (req.method === 'OPTIONS') return new Response('ok', { headers });
  if (req.method !== 'POST') return reply({ error: 'Method not allowed' }, 405);

  let body: { username?: unknown; password?: unknown };
  try { body = await req.json(); } catch { return reply({ error: 'Enter your username and password' }, 400); }
  const username = typeof body.username === 'string' ? body.username.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  if (!username || !password) return reply({ error: 'Enter your username and password' }, 400);
  if (!USERNAME.test(username) || password.length > 200) return reply({ error: GENERIC }, 401);

  const url = Deno.env.get('SUPABASE_URL')!;
  const admin = createClient(url, key('SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SECRET_KEYS'), { auth: { persistSession: false, autoRefreshToken: false } });
  const record = (ok: boolean) => admin.rpc('username_login_record', { p_username: username, p_ok: ok });

  try {
    const { data: check, error } = await admin.rpc('username_login_check', { p_username: username });
    if (error) throw error;
    if (check?.locked) return reply({ error: 'Too many attempts. Try again in 15 minutes, or sign in with your email.' }, 429);
    if (!check?.email) { await record(false); return reply({ error: GENERIC }, 401); }

    const anon = createClient(url, key('SUPABASE_ANON_KEY', 'SUPABASE_PUBLISHABLE_KEYS'), { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error: signInError } = await anon.auth.signInWithPassword({ email: check.email, password });
    if (signInError || !data.session) { await record(false); return reply({ error: GENERIC }, 401); }

    await record(true);
    return reply({ access_token: data.session.access_token, refresh_token: data.session.refresh_token }, 200);
  } catch (err) {
    console.error('[username-login]', err instanceof Error ? err.message : err);
    return reply({ error: 'Sign-in is unavailable right now. Try your email instead.' }, 500);
  }
});
