import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { forgetUserData } from '../lib/queryClient';
import { signOutNotice } from '../lib/session/policy';

/**
 * Why the user was signed out, for the sign-in page (shared by all tabs through localStorage). 'manual' = the user
 * chose it (no notice). Anything else is explained (lib/session/policy.js signOutNotice).
 */
const REASON_KEY = 'fx.signout.reason';
function rememberReason(reason, extra = {}) {
  try { localStorage.setItem(REASON_KEY, JSON.stringify({ reason, ...extra, at: Date.now() })); } catch { /* private mode */ }
}
function readReason() {
  try { return JSON.parse(localStorage.getItem(REASON_KEY) || 'null'); } catch { return null; }
}
/** The notice for the latest sign-out, if it is recent and was not the user's choice (peek; see clearSignOutReason). */
export function peekSignOutNotice(now = Date.now()) {
  const r = readReason();
  if (!r || now - (r.at ?? 0) > 10 * 60_000) return null;
  const n = signOutNotice(r.reason, { minutes: r.minutes ?? null });
  return n ? { ...n, session: true } : null;
}
export function clearSignOutReason() {
  try { localStorage.removeItem(REASON_KEY); } catch { /* private mode */ }
}

/** True while this tab is signing out on purpose — any other SIGNED_OUT means the server ended the session. */
let signingOut = false;

/** The live onAuthStateChange subscription, so a second initialize() replaces
 *  rather than stacks. StrictMode mounts twice in development, and without
 *  this every reload added another listener that never went away. */
let authSubscription = null;

export const useAuthStore = create((set) => ({
  user: null,
  session: null,
  loading: true,
  /** Set when the session could not be read at all — a dead client or no network. */
  initError: null,

  initialize: async () => {
    try {
      const { data, error } = await supabase.auth.getSession();
      if (error) throw error;
      const session = data?.session ?? null;
      set({ session, user: session?.user ?? null, loading: false, initError: null });
    } catch (err) {
      // Previously the error was destructured away, so an unreachable auth
      // server left `loading: true` forever behind the full-screen spinner.
      // Failing to a signed-out state at least lets the login screen render
      // and say what went wrong.
      set({ session: null, user: null, loading: false, initError: err });
    }

    authSubscription?.unsubscribe();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      // Signed out (here, in another tab, or the session was revoked): drop this user's cached data.
      if (event === 'SIGNED_OUT') {
        forgetUserData().catch(() => {});
        // Not this tab's doing and no other tab recorded why (idle, manual…) in the last half minute: the server
        // ended the session (refresh token revoked — "sign out of all devices", a password change).
        const r = readReason();
        if (!signingOut && useAuthStore.getState().session && (!r || Date.now() - (r.at ?? 0) > 30_000)) rememberReason('revoked');
      }
      // PASSWORD_RECOVERY arrives when the user follows a reset link. Treating
      // it as an ordinary sign-in would drop them on the dashboard instead of
      // the "set a new password" screen, so it is kept distinguishable.
      set({
        session,
        user: session?.user ?? null,
        loading: false,
        recovering: event === 'PASSWORD_RECOVERY',
      });
    });
    authSubscription = subscription;
  },

  /** Drop the listener — for a full teardown, not for ordinary sign-out. */
  teardown: () => {
    authSubscription?.unsubscribe();
    authSubscription = null;
  },

  signUp: async (email, password, fullName) => {
    const normalizedEmail = String(email || '').trim().toLowerCase();
    const { data, error } = await supabase.auth.signUp({
      email: normalizedEmail,
      password,
      options: {
        data: { full_name: fullName },
        // Without this the confirmation link uses the project's Site URL, which
        // points at whichever environment was configured last. Pinning it to the
        // current origin means a preview deployment confirms back to itself.
        emailRedirectTo: `${window.location.origin}/auth`,
      },
    });
    if (error) throw error;
    return data;
  },

  signIn: async (email, password) => {
    const normalizedEmail = String(email || '').trim().toLowerCase();
    const { data, error } = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password,
    });
    if (error) throw error;
    return data;
  },

  /**
   * Sign in with a username: the username-login Edge Function finds the email
   * server-side, signs in, and returns the session, installed here. Its error
   * messages are already safe to show (identical for unknown name / wrong password).
   */
  signInWithUsername: async (username, password) => {
    const { data, error } = await supabase.functions.invoke('username-login', {
      body: { username: String(username || '').trim().toLowerCase(), password },
    });
    if (error) {
      let message = 'Sign-in is unavailable right now. Try your email instead.';
      try { message = (await error.context.json()).error || message; } catch { /* network error: keep the default */ }
      throw Object.assign(new Error(message), { friendly: true });
    }
    const { data: session, error: setErr } = await supabase.auth.setSession({ access_token: data.access_token, refresh_token: data.refresh_token });
    if (setErr) throw setErr;
    return session;
  },

  resetPassword: async (email) => {
    const normalizedEmail = String(email || '').trim().toLowerCase();
    const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
      redirectTo: `${window.location.origin}/auth`,
    });
    if (error) throw error;
  },

  updatePassword: async (password) => {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw error;
    set({ recovering: false });
  },

  /**
   * Sign out of THIS browser (scope 'local', 2026-11-26). supabase-js defaults to 'global', which ended the user's
   * sessions on every device — signing out here, or the phone app closing / timing out, threw the user out of the
   * other app mid-use. `reason` is recorded for the sign-in page ('manual' = the user's choice, no notice).
   */
  signOut: async ({ reason = 'manual', minutes = null, everywhere = false } = {}) => {
    signingOut = true;
    rememberReason(reason, { minutes });
    const { error } = await supabase.auth.signOut({ scope: everywhere ? 'global' : 'local' }).catch((e) => ({ error: e }));
    // Local state is cleared either way — the user asked to be signed out and
    // the UI must reflect that — but the error is surfaced rather than
    // discarded, so a failed server-side revocation is not reported as success.
    set({ user: null, session: null, recovering: false });
    signingOut = false;
    await forgetUserData().catch(() => {});
    if (error) throw error;
  },

  /** Sign out of every device and browser (Settings › Security). */
  signOutEverywhere: async () => useAuthStore.getState().signOut({ reason: 'everywhere', everywhere: true }),

  /** End the session for a reason the user didn't choose (idle, 12-hour limit); never throws. */
  endSession: async (reason, minutes = null) => {
    if (!useAuthStore.getState().session) return;
    await useAuthStore.getState().signOut({ reason, minutes }).catch(() => {});
  },
}));
