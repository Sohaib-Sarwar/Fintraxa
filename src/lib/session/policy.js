/**
 * Session policy for web and phone (owner, 2026-11-26: "users get logged out while using the app — handle sessions
 * like banking / fintech apps, production level"). Pure, no React, no network: tested in
 * scripts/psx/session-policy.test.mjs; the phone imports it as @core/session/policy.js.
 *
 * Grounding:
 *  - NIST SP 800-63B (rev. 3 §7.2 / rev. 4 §5): reauthenticate after a period of inactivity and after an overall
 *    limit regardless of activity; activity resets the inactivity timer; a successful reauthentication resets both.
 *    AAL2: ≤ 30 min inactivity (rev. 3; rev. 4 allows up to 1 h) and 12 h overall (rev. 3; rev. 4 allows up to 24 h).
 *  - OWASP Session Management Cheat Sheet: idle 2–5 min for high-value apps, 15–30 min for low-risk ones; an absolute
 *    timeout as well; warn before expiry; logout must invalidate the session on the server.
 *  - Banking apps (common practice): short idle lock on the phone with biometric re-entry, a countdown warning
 *    ("Still there?") before an idle sign-out, signing out of THIS device only (a separate "sign out of all devices"),
 *    and a clear reason on the sign-in screen.
 *
 * Fintraxa's choices:
 *  - Phone: idle in the app = the Auto-lock setting (min 1 min, default 5) with a 30 s warning; away in the background
 *    for the Auto-lock time → lock (fingerprint) or sign out. Screens the app itself opens (file / photo picker,
 *    fingerprint prompt, a link) are not "leaving" for up to 10 min.
 *  - Web (desktop): idle 15 min with a 60 s warning, shared across tabs.
 *  - Both: 12 h overall since the user last authenticated (password or a fresh sign-in), then sign in again.
 *  - Automatic and normal sign-outs end THIS device's session only (supabase `scope: 'local'`); "Sign out of all
 *    devices" is explicit (`scope: 'global'`). Before 2026-11-26 every sign-out was global (supabase-js default), so a
 *    phone closing or timing out signed the user out of the web app too — the reported "logged out while using it".
 */

export const MINUTE = 60_000;
/** Overall limit since the user last authenticated (NIST AAL2, rev. 3). */
export const MAX_SESSION_MS = 12 * 60 * MINUTE;
/** Phone: warning shown this long before an idle lock / sign-out. */
export const PHONE_WARN_MS = 30_000;
/** Web: idle limit and its warning. */
export const WEB_IDLE_MS = 15 * MINUTE;
export const WEB_WARN_MS = 60_000;
/** A screen the app opened itself (picker, prompt, link) may keep the user away this long without a lock. */
export const HOLD_MAX_MS = 10 * MINUTE;

/** Phone idle limit for an Auto-lock setting in minutes (0 = lock as soon as the app is left; idle still ≥ 1 min). */
export const phoneIdleMs = (autoLockMinutes) => Math.max(1, Number(autoLockMinutes) || 0) * MINUTE;

/**
 * Where an open session stands right now.
 * @param {{ now: number, lastActive: number, idleMs: number, warnMs: number, authAt?: number | null, maxMs?: number }} p
 * @returns {{ state: 'active'|'warn'|'idle'|'expired', msLeft: number }}
 *   warn: within `warnMs` of the idle limit (msLeft = time until it); idle: the idle limit is reached;
 *   expired: the overall limit since authentication is reached (wins over idle).
 */
export function sessionState({ now, lastActive, idleMs, warnMs, authAt = null, maxMs = MAX_SESSION_MS }) {
  if (authAt && now - authAt >= maxMs) return { state: 'expired', msLeft: 0 };
  const left = idleMs - (now - lastActive);
  if (left <= 0) return { state: 'idle', msLeft: 0 };
  if (left <= warnMs) return { state: 'warn', msLeft: left };
  return { state: 'active', msLeft: left };
}

/**
 * Coming back to the app after it was in the background.
 * @param {{ now: number, leftAt: number | null | undefined, autoLockMinutes: number, holdUntil?: number }} p
 * @returns {'keep'|'lock'} lock when away for the Auto-lock time (0 = any time), unless a screen the app itself
 *   opened is still within its hold.
 */
export function onReturn({ now, leftAt, autoLockMinutes, holdUntil = 0 }) {
  if (leftAt === null || leftAt === undefined) return 'keep';
  if (holdUntil && now <= holdUntil) return 'keep';
  return now - leftAt >= (Number(autoLockMinutes) || 0) * MINUTE ? 'lock' : 'keep';
}

/**
 * A fresh start of the app with a stored session.
 *  - Phone app (native): starting again means it was closed (back-button exit, swiped away) → end the session
 *    (owner's rule, 2026-11-15) — except the restart that applies an update, and Android ending the app while a
 *    screen the app opened was in front (photo / file picker) within its hold.
 *  - Phone web (/m): a reload or the browser restoring the same tab (`sameTab`) is not closing the app; the session
 *    continues if it was used within the Auto-lock time. A new tab / reopened installed app is a fresh start → end.
 * @param {{ web: boolean, now: number, lastActiveAt: number, autoLockMinutes: number, holdUntil?: number, sameTab?: boolean, updating?: boolean }} p
 * @returns {'continue'|'end'}
 */
export function onColdStart({ web, now, lastActiveAt, autoLockMinutes, holdUntil = 0, sameTab = false, updating = false }) {
  if (updating) return 'continue';
  if (holdUntil && now <= holdUntil) return 'continue';
  if (web && sameTab && lastActiveAt && now - lastActiveAt < phoneIdleMs(autoLockMinutes)) return 'continue';
  return 'end';
}

/**
 * When the user last authenticated for this session (ms), from the access token's `amr` claim (Supabase puts the
 * method and its time there; it survives token refreshes and changes only on a new sign-in). null when unreadable.
 */
export function authTimeFromToken(accessToken, decode = defaultDecode) {
  try {
    const part = String(accessToken ?? '').split('.')[1];
    if (!part) return null;
    const claims = JSON.parse(decode(part));
    const stamps = (Array.isArray(claims?.amr) ? claims.amr : []).map((a) => Number(a?.timestamp)).filter((n) => Number.isFinite(n) && n > 0);
    if (stamps.length) return Math.max(...stamps) * 1000;
    return null;
  } catch {
    return null;
  }
}

function defaultDecode(b64url) {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(b64url.length / 4) * 4, '=');
  if (typeof globalThis.atob === 'function') {
    const bin = globalThis.atob(b64);
    try { return decodeURIComponent(Array.from(bin, (c) => `%${c.charCodeAt(0).toString(16).padStart(2, '0')}`).join('')); } catch { return bin; }
  }
  return globalThis.Buffer.from(b64, 'base64').toString('utf8');
}

/** "0:27" */
export function countdown(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

const minutesText = (m) => `${m} minute${m === 1 ? '' : 's'}`;

/**
 * What the sign-in screen says when the user didn't choose to sign out. Reasons:
 *   idle (with minutes), away (in the background longer than Auto-lock; minutes 0 = "Immediately"), expired (overall limit), revoked (ended on the server: "sign out of all devices", a password
 *   change, or the session was removed), everywhere (the user chose "sign out of all devices").
 * @param {string} reason
 * @param {{ minutes?: number | null }} [opts]
 * @returns {{ title: string, text: string } | null}
 */
export function signOutNotice(reason, { minutes = null } = {}) {
  switch (reason) {
    case 'idle':
      return { title: 'Signed out for your security', text: `You were inactive for ${minutes ? minutesText(minutes) : 'a while'}. Sign in again to continue.` };
    case 'away':
      return {
        title: 'Signed out for your security',
        text: minutes ? `You were away from the app for more than ${minutesText(minutes)}. Sign in again to continue.`
          : 'Auto-lock is set to Immediately, so leaving the app signs you out. You can change it in Me › Security.',
      };
    case 'expired':
      return { title: 'Please sign in again', text: 'For your security, a session lasts at most 12 hours. Sign in again to continue.' };
    case 'revoked':
      return { title: 'Your session ended', text: 'You were signed out because this session was ended — for example by “Sign out of all devices” or a password change. Sign in again to continue.' };
    case 'everywhere':
      return { title: 'Signed out everywhere', text: 'You are signed out on all your devices and browsers.' };
    default:
      return null;
  }
}
