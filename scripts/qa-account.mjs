/**
 * Ensure the QA account exists: sign in with QA_EMAIL / QA_PASSWORD from
 * .env.local, or sign up if it does not exist yet. Prints only the user id.
 *
 * After first sign-up, an operator marks it as QA (server-side app_metadata,
 * which users cannot edit) so it may use mf_qa_purge_my_data():
 *   update auth.users set raw_app_meta_data = raw_app_meta_data || '{"qa": true}' where id = '<id>';
 */
import { createClient } from '@supabase/supabase-js';
import { loadEnv, requireEnv } from './lib/env.mjs';

const env = loadEnv();
requireEnv(env, 'VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY', 'QA_EMAIL', 'QA_PASSWORD');
const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });

let { data, error } = await supabase.auth.signInWithPassword({ email: env.QA_EMAIL, password: env.QA_PASSWORD });
if (error && /invalid login credentials/i.test(error.message)) {
  const up = await supabase.auth.signUp({ email: env.QA_EMAIL, password: env.QA_PASSWORD, options: { data: { full_name: 'QA Tester' } } });
  if (up.error) { console.error('sign-up failed:', up.error.message); process.exit(1); }
  console.log(JSON.stringify({ created: true, user_id: up.data.user?.id, session: !!up.data.session, needs_confirmation: !up.data.session }));
  process.exit(0);
}
if (error) { console.error('sign-in failed:', error.message); process.exit(1); }
console.log(JSON.stringify({ created: false, user_id: data.user.id, qa: data.user.app_metadata?.qa === true }));
