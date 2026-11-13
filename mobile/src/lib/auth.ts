/**
 * Auth state and actions. Email sign-in goes straight to Supabase; usernames go through the existing
 * `username-login` Edge Function (lockout and safe errors are enforced there, as on the web).
 * Links in emails (confirm, reset) open the web app, which already handles them — no extra Supabase
 * redirect setting is needed for the phone.
 */
import type { Session, User } from '@supabase/supabase-js';
import { create } from 'zustand';
import { env } from './env';
import { forgetCache } from './queryClient';
import { useApp } from './store';
import { supabase, wipeStoredSession } from './supabase';
import { closeVault, disableBiometricKey } from './vault';

type AuthState = {
  ready: boolean;
  session: Session | null;
  user: User | null;
  locked: boolean;
  /** Why the user landed on the sign-in screen, when it wasn't their choice. */
  notice: string | null;
  setNotice: (n: string | null) => void;
  setLocked: (l: boolean) => void;
};

export const useAuth = create<AuthState>((set) => ({
  ready: false,
  session: null,
  user: null,
  locked: false,
  notice: null,
  setNotice: (notice) => set({ notice }),
  setLocked: (locked) => set({ locked }),
}));

let subscribed = false;
/** Called once the vault is open: reads the stored session and follows changes. */
export async function startAuth() {
  if (!subscribed) {
    subscribed = true;
    supabase.auth.onAuthStateChange((_event, session) => {
      useAuth.setState({ session, user: session?.user ?? null, ready: true });
    });
  }
  const { data } = await supabase.auth.getSession();
  useAuth.setState({ session: data.session, user: data.session?.user ?? null, ready: true });
}

const looksLikeEmail = (s: string) => /@/.test(s);

/** Plain-language errors (plan §6.1); never raw server text. */
export function authMessage(e: unknown): string {
  const err = e as { message?: string; status?: number; friendly?: boolean };
  if (err?.friendly && err.message) return err.message;
  const m = String(err?.message ?? '');
  if (/invalid login credentials/i.test(m)) return 'That email and password don’t match. Try again or reset your password.';
  if (/email not confirmed/i.test(m)) return 'Confirm your email first — we sent you a link when you signed up.';
  if (/network|fetch|timed? ?out/i.test(m)) return 'No connection. Check your internet and try again.';
  if (/rate limit|too many/i.test(m)) return 'Too many attempts. Wait a minute and try again.';
  if (/already registered|already exists/i.test(m)) return 'An account with this email already exists. Sign in instead.';
  if (/password should be|weak password/i.test(m)) return 'Choose a stronger password: at least 8 characters.';
  return 'Something went wrong. Please try again.';
}

export async function signIn(identifier: string, password: string) {
  const id = identifier.trim();
  if (looksLikeEmail(id)) {
    const { error } = await supabase.auth.signInWithPassword({ email: id.toLowerCase(), password });
    if (error) throw error;
    return;
  }
  const { data, error } = await supabase.functions.invoke('username-login', { body: { username: id.toLowerCase(), password } });
  if (error) {
    let message = 'Sign-in is unavailable right now. Try your email instead.';
    try { message = (await (error as { context?: Response }).context?.json())?.error || message; } catch { /* network: keep default */ }
    throw Object.assign(new Error(message), { friendly: true });
  }
  const { error: setErr } = await supabase.auth.setSession({ access_token: data.access_token, refresh_token: data.refresh_token });
  if (setErr) throw setErr;
}

export async function signUp(fullName: string, email: string, password: string) {
  const { data, error } = await supabase.auth.signUp({
    email: email.trim().toLowerCase(),
    password,
    options: { data: { full_name: fullName.trim() }, emailRedirectTo: `${env.webApp}/auth` },
  });
  if (error) throw error;
  return { needsConfirmation: !data.session };
}

export async function sendReset(email: string) {
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), { redirectTo: `${env.webApp}/auth` });
  if (error) throw error;
}

/** Sign out: revoke on the server when possible, then wipe the session, cache and this user's local marks. */
export async function signOut() {
  const uid = useAuth.getState().user?.id;
  const { error } = await supabase.auth.signOut().catch((e) => ({ error: e }));
  await wipeStoredSession();
  await forgetCache();
  if (uid) useApp.getState().forgetUser(uid);
  if (useApp.getState().biometricEnabled) {
    await disableBiometricKey().catch(() => {});
    useApp.getState().set({ biometricEnabled: false, biometricUser: null });
  }
  useAuth.setState({ session: null, user: null, locked: false });
  if (error) console.warn('[auth] server sign-out failed; local session removed');
}

export function lockNow() {
  if (!useApp.getState().biometricEnabled) return;
  supabase.auth.stopAutoRefresh();
  closeVault();
  useAuth.setState({ locked: true });
}

export function firstName(user: User | null, profileName?: string | null): string {
  const full = profileName || (user?.user_metadata?.full_name as string) || (user?.user_metadata?.name as string) || '';
  const first = String(full).trim().split(/\s+/)[0]
    || String(user?.email ?? '').split('@')[0].replace(/[._\d]+/g, ' ').trim().split(' ')[0];
  return first ? first.charAt(0).toUpperCase() + first.slice(1) : '';
}
