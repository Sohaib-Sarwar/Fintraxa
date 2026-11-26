/**
 * User activity for the session timers (features/session/useSession.ts; policy in @core/session/policy.js).
 * Kept tiny and dependency-light so any surface can report activity: the root view, Modal windows (Android draws
 * them in their own window, outside the root view's touch handler), and on the web build the whole document.
 *
 * "Holds": a screen the app opens itself — file picker, photo picker, fingerprint prompt, a link in the browser —
 * puts the app in the background, but the user hasn't left. `holdSession(fn)` marks that (persisted, so even
 * Android ending the app behind the picker is not treated as closing it) for up to HOLD_MAX_MS.
 */
import { create } from 'zustand';
import { HOLD_MAX_MS } from '@core/session/policy.js';
import { useApp } from './store';

let lastActive = Date.now();
/** Any touch, key or scroll. Also clears an idle warning on screen. */
export function markActive() {
  lastActive = Date.now();
  if (useIdle.getState().warnUntil !== null) useIdle.setState({ warnUntil: null });
}
export const lastActiveAt = () => lastActive;

/** The idle warning ("Still there?"): when the session will lock / end, or null when not warning. */
export const useIdle = create<{ warnUntil: number | null }>(() => ({ warnUntil: null }));

let holds = 0;
/** Until when a screen the app opened may keep the user away (0 = none). */
export const holdUntil = () => (holds > 0 ? useApp.getState().holdUntil : 0);

/** Run `fn` (which opens a system screen) without it counting as leaving the app. */
export async function holdSession<T>(fn: () => Promise<T>): Promise<T> {
  holds += 1;
  useApp.getState().set({ holdUntil: Date.now() + HOLD_MAX_MS });
  try {
    return await fn();
  } finally {
    holds = Math.max(0, holds - 1);
    if (holds === 0) useApp.getState().set({ holdUntil: 0 });
    markActive();
  }
}
