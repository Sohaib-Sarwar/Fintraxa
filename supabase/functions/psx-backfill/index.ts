// psx-backfill: missing PSX closes for held stocks, from PSX's daily market summaries.
// Called by pg_cron (nightly) and by a trigger right after a trade in a stock with no
// prices around its date; both send the x-cron-secret header (same secret as the
// portfolio-snapshot function). verify_jwt is off for that reason; the secret is checked here.
import { createClient } from '@supabase/supabase-js';
import { unzipSync } from 'fflate';
import { collect } from './run.js';

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

async function download(day: string): Promise<Uint8Array | null> {
  const res = await fetch(`https://dps.psx.com.pk/download/mkt_summary/${day}.Z`, { headers: { 'User-Agent': UA } });
  if (res.status === 404) return null;                 // no session that day (holiday)
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  return bytes[0] === 0x50 && bytes[1] === 0x4b ? bytes : null; // not a zip: treated as no file
}

function unzip(bytes: Uint8Array): string {
  const files = unzipSync(bytes);
  const first = Object.values(files)[0];
  if (!first) throw new Error('empty archive');
  return new TextDecoder('latin1').decode(first);
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'Use POST' });
  try {
    const secret = req.headers.get('x-cron-secret');
    const { data: ok } = await admin.rpc('snapshot_verify_cron_secret', { p_secret: secret ?? '' });
    if (ok !== true) return json(401, { error: 'Not allowed' });

    const { data: work, error } = await admin.rpc('psx_backfill_work', { p_days: 40 });
    if (error) throw new Error(error.message);
    if (!work?.length) return json(200, { closes: 0, days: 0, note: 'nothing missing' });

    // Stay well inside the function's time limit; the rest is done on the next run.
    const result = await collect(work, {
      download, unzip, deadline: Date.now() + 100_000,
      pause: () => new Promise((r) => setTimeout(r, 400)),  // be gentle with the exchange
    });
    const { data: saved, error: saveErr } = await admin.rpc('psx_backfill_save', { p_closes: result.closes, p_days: result.days });
    if (saveErr) throw new Error(saveErr.message);
    return json(200, { ...saved, failed: result.failed });
  } catch (e) {
    console.error('[psx-backfill]', (e as Error).message);
    return json(500, { error: 'Backfill failed' });
  }
});
