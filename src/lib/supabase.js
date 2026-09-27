import { createClient } from '@supabase/supabase-js';

/**
 * The Supabase client.
 *
 * The key here is a *publishable* one. It is compiled into the bundle and is
 * meant to be public; every row it can reach is decided by RLS on the server,
 * which is where this app's authorisation actually lives. A service-role key
 * must never appear in this file or in any VITE_-prefixed variable — Vite
 * inlines those into client JavaScript.
 */

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;

// `sb_publishable_…` is the current format; the legacy JWT `anon` key is still
// accepted under the same variable name, so an older deployment keeps working.
const supabaseKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
  || import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  // Previously this logged and carried on, constructing a client against an
  // empty URL. Every query then failed with an opaque network error and the UI
  // rendered a confident, entirely wrong "Rs 0" balance. A missing environment
  // variable is a deployment fault, and it should look like one immediately.
  throw new Error(
    '[Fintraxa] Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY. '
    + 'Set both in .env.local for local development, and in the Vercel project '
    + 'settings for a deployment.',
  );
}

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    // Needed for the email-confirmation and password-recovery links, which
    // come back with the session in the URL fragment.
    detectSessionInUrl: true,
    flowType: 'pkce',
  },
});
