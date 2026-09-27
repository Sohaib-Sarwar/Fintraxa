import { create } from 'zustand';
import { supabase } from '../lib/supabase';

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

  signOut: async () => {
    const { error } = await supabase.auth.signOut();
    // Local state is cleared either way — the user asked to be signed out and
    // the UI must reflect that — but the error is surfaced rather than
    // discarded, so a failed server-side revocation is not reported as success.
    set({ user: null, session: null, recovering: false });
    if (error) throw error;
  },
}));
