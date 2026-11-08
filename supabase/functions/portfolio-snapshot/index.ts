// portfolio-snapshot: daily snapshots of each user's holdings and portfolio.
//
// Two callers:
//   * pg_cron (nightly), with the x-cron-secret header: every user who needs it.
//   * the app, with the signed-in user's JWT: that user only (after a statement
//     upload or a trade, so the charts catch up without waiting for the night).
// verify_jwt is off because the cron call has no JWT; both paths authenticate here.
import { createClient } from '@supabase/supabase-js';
import { run } from './handler.js';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json(405, { error: 'Use POST' });
  try {
    const secret = req.headers.get('x-cron-secret');
    if (secret) {
      const { data: ok } = await admin.rpc('snapshot_verify_cron_secret', { p_secret: secret });
      if (ok !== true) return json(401, { error: 'Not allowed' });
      const results = await run(admin);
      return json(200, { users: results.length, failed: results.filter((r) => r.error).length });
    }
    const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
    if (!token) return json(401, { error: 'Sign in first' });
    const { data: { user }, error } = await admin.auth.getUser(token);
    if (error || !user) return json(401, { error: 'Sign in first' });
    const [result] = await run(admin, { userId: user.id });
    return json(200, result ?? { days: 0 });
  } catch (e) {
    console.error('[portfolio-snapshot]', (e as Error).message);
    return json(500, { error: 'Snapshot failed' });
  }
});
