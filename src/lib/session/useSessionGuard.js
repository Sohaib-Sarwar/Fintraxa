/**
 * Web session guard (2026-11-26; rules in ./policy.js): 15 minutes without activity → a one-minute warning → sign out
 * of this browser with the reason; 12 hours after the user last signed in → sign in again.
 *
 * Activity = pointer, mouse movement, keys, wheel, touch, scroll — in ANY tab of the app: tabs share the last activity
 * through localStorage (`fx.activity`), so reading in one tab never signs the user out of another, and a sign-out
 * reaches every tab (supabase-js broadcasts it). Browsers slow timers in background tabs, so the session is also
 * checked the moment a tab becomes visible again.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuthStore } from '../../store/authStore';
import { WEB_IDLE_MS, WEB_WARN_MS, authTimeFromToken, sessionState } from './policy';

const KEY = 'fx.activity';
const TICK_MS = 5_000;
const EVENTS = ['pointerdown', 'mousemove', 'keydown', 'wheel', 'touchstart', 'scroll'];

const readShared = () => { try { return Number(localStorage.getItem(KEY)) || 0; } catch { return 0; } };
const writeShared = (t) => { try { localStorage.setItem(KEY, String(t)); } catch { /* private mode */ } };

/** @returns {{ warnUntil: number|null, stay: () => void, signOutNow: () => void }} */
export function useSessionGuard() {
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const [warnUntil, setWarnUntil] = useState(null);
  const last = useRef(0); // set by mark() when the guard starts
  const lastWrite = useRef(0);
  const warnRef = useRef(null);

  const setWarn = useCallback((v) => { if (warnRef.current !== v) { warnRef.current = v; setWarnUntil(v); } }, []);

  const mark = useCallback(() => {
    const now = Date.now();
    last.current = now;
    if (now - lastWrite.current > 5_000) { lastWrite.current = now; writeShared(now); }
    if (warnRef.current !== null) setWarn(null);
  }, [setWarn]);

  const check = useCallback(() => {
    const { session, endSession } = useAuthStore.getState();
    if (!session) { setWarn(null); return; }
    const now = Date.now();
    const st = sessionState({
      now, lastActive: Math.max(last.current, readShared()), idleMs: WEB_IDLE_MS, warnMs: WEB_WARN_MS,
      authAt: authTimeFromToken(session.access_token),
    });
    if (st.state === 'expired') { setWarn(null); endSession('expired'); return; }
    if (st.state === 'idle') { setWarn(null); endSession('idle', WEB_IDLE_MS / 60_000); return; }
    if (st.state === 'warn') { if (warnRef.current === null) setWarn(now + st.msLeft); return; }
    setWarn(null);
  }, [setWarn]);

  useEffect(() => {
    if (!userId) return undefined;
    // Signing in / opening the app is activity (refs only: no warning can be up yet).
    last.current = Date.now();
    lastWrite.current = last.current;
    writeShared(last.current);
    let throttle = 0;
    const onActivity = (e) => {
      // While the warning is up only an explicit choice counts (its buttons, the backdrop, Esc), so a passing mouse
      // can't dismiss it unread.
      if (warnRef.current !== null) return;
      // Mouse movement is frequent: count it at most once a second.
      if (e.type === 'mousemove') { const t = Date.now(); if (t - throttle < 1000) return; throttle = t; }
      mark();
    };
    const onStorage = (e) => {
      if (e.key !== KEY) return;
      const t = Number(e.newValue) || 0;
      if (t > last.current) { last.current = t; if (warnRef.current !== null) setWarn(null); }
    };
    const onVisible = () => { if (document.visibilityState === 'visible') check(); };
    EVENTS.forEach((ev) => window.addEventListener(ev, onActivity, { capture: true, passive: true }));
    window.addEventListener('storage', onStorage);
    document.addEventListener('visibilitychange', onVisible);
    const timer = setInterval(check, TICK_MS);
    return () => {
      EVENTS.forEach((ev) => window.removeEventListener(ev, onActivity, { capture: true }));
      window.removeEventListener('storage', onStorage);
      document.removeEventListener('visibilitychange', onVisible);
      clearInterval(timer);
    };
  }, [userId, mark, check, setWarn]);

  const signOutNow = useCallback(() => { setWarn(null); useAuthStore.getState().signOut().catch(() => {}); }, [setWarn]);
  return { warnUntil, stay: mark, signOutNow };
}
