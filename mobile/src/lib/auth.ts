/**
 * Auth state and actions. Email sign-in goes straight to Supabase; usernames go through the existing
 * `username-login` Edge Function (lockout and safe errors are enforced there, as on the web).
 * Links in emails (confirm, reset) open the web app, which already handles them — no extra Supabase
 * redirect setting is needed for the phone.
 */
import type { Session, User } from '@supabase/supabase-js';
import { create } from 'zustand';
import { signOutNotice } from '@core/session/policy.js';
import { env } from './env';
import { claimCache, forgetCache } from './queryClient';
import { useApp } from './store';
import { supabase, wipeStoredSession } from './supabase';
import { closeVault, disableBiometricKey } from './vault';

type AuthState = {
  ready: boolean;
  session: Session | null;
  user: User | null;
  locked: boolean;
  /** Why the user landed on the sign-in screen, when it wasn't their choice. */
  notice: { title: string; text: string } | null;
  /** "Use password" on the lock screen: the sign-in screen opens straight on the password box. */
  wantPassword: boolean;
  setNotice: (n: { title: string; text: string } | null) => void;
  setLocked: (l: boolean) => void;
};

export const useAuth = create<AuthState>((set) => ({
  ready: false,
  session: null,
  user: null,
  locked: false,
  notice: null,
  wantPassword: false,
  setNotice: (notice) => set({ notice }),
  setLocked: (locked) => set({ locked }),
}));

let subscribed = false;
/** True while this app is signing out on purpose — any other SIGNED_OUT means the server ended the session. */
let signingOut = false;
/** Called once the vault is open: reads the stored session and follows changes. */
export async function startAuth() {
  if (!subscribed) {
    subscribed = true;
    supabase.auth.onAuthStateChange((event, session) => {
      // The refresh token was revoked or expired on the server (signed out of all devices elsewhere, password
      // changed, session removed): say so on the sign-in screen instead of dropping the user there silently.
      if (event === 'SIGNED_OUT' && !signingOut && useAuth.getState().session) useAuth.setState({ notice: signOutNotice('revoked') });
      publish(session).catch(() => {});
    });
  }
  const { data } = await supabase.auth.getSession();
  await publish(data.session);
}

/**
 * Publishes the session. A different account than the one whose data is cached on this phone first wipes that
 * cache (claimCache), so another user's figures can never paint — the cache now survives automatic sign-outs.
 */
async function publish(session: Session | null) {
  if (session?.user.id) await claimCache(session.user.id).catch(() => {});
  useAuth.setState({ session, user: session?.user ?? null, ready: true });
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

/**
 * Sign out of THIS device: revoke this session on the server when possible, then wipe it here — a normal sign-out,
 * not "forget this device" (owner, 2026-11-15): the encrypted cache and this user's local marks stay, so signing back
 * in paints at once. They are wiped the moment a different account signs in (`publish` → `claimCache`), or from
 * Android's Settings › Apps › Fintraxa › Storage › Clear storage. `keepData: false` is the explicit wipe.
 *
 * `scope: 'local'` (2026-11-26): supabase-js defaults to 'global', which revoked the user's sessions on every device —
 * the phone closing or timing out signed them out of the web app mid-use. `everywhere` is the explicit "Sign out of
 * all devices".
 */
export async function signOut({ keepData = true, everywhere = false }: { keepData?: boolean; everywhere?: boolean } = {}) {
  const uid = useAuth.getState().user?.id;
  signingOut = true;
  const { error } = await supabase.auth.signOut({ scope: everywhere ? 'global' : 'local' }).catch((e) => ({ error: e }));
  await wipeStoredSession();
  if (!keepData) {
    await forgetCache();
    if (uid) useApp.getState().forgetUser(uid);
    // The home-screen widget forgets the figures too (it keeps its settings).
    await import('@/features/widget/storage').then((m) => m.clearData()).catch(() => {});
    await import('@/features/widget/native').then((m) => m.refreshWidgets()).catch(() => {});
  }
  if (useApp.getState().biometricEnabled) {
    await disableBiometricKey().catch(() => {});
    useApp.getState().set({ biometricEnabled: false, biometricUser: null });
  }
  useAuth.setState({ session: null, user: null, locked: false });
  signingOut = false;
  if (error) console.warn('[auth] server sign-out failed; local session removed');
}

/** Sign out of every device and browser (Me › Security). */
export async function signOutEverywhere() {
  await signOut({ everywhere: true });
  useAuth.setState({ notice: signOutNotice('everywhere') });
}

/**
 * End the session for a reason the user didn't choose (idle, 12-hour limit): the notice is set FIRST, so the sign-in
 * screen that mounts when the session clears already has it.
 */
export async function endSession(reason: 'idle' | 'away' | 'expired', minutes?: number) {
  if (!useAuth.getState().session) return;
  useAuth.setState({ notice: signOutNotice(reason, { minutes }) });
  await signOut();
}

/**
 * Auto-lock (owner, 2026-11-15): with fingerprint unlock on, lock (fingerprint to come back); with it off there is
 * nothing to unlock with, so sign out (the sign-in landing; the APK's fingerprint sign-in still makes that quick).
 * Idle and away say why, with the real time (it used to say "a minute" whatever the setting); closing doesn't.
 */
export async function autoLock(reason: 'idle' | 'away' | 'closed') {
  if (!useAuth.getState().session || useAuth.getState().locked) return;
  if (useApp.getState().biometricEnabled) { lockNow(); return; }
  const minutes = useApp.getState().autoLockMinutes;
  if (reason === 'idle') { await endSession('idle', Math.max(1, minutes)); return; }
  if (reason === 'away') { await endSession('away', minutes); return; }
  await signOut();
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
