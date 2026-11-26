/**
 * Session policy (src/lib/session/policy.js): idle warning and expiry, the 12-hour limit, returning from the
 * background, cold starts (phone app vs phone web), the auth time read from the token, and the sign-in notices.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MINUTE, MAX_SESSION_MS, PHONE_WARN_MS, WEB_IDLE_MS, WEB_WARN_MS, HOLD_MAX_MS, phoneIdleMs, sessionState, onReturn, onColdStart,
  authTimeFromToken, countdown, signOutNotice,
} from '../../src/lib/session/policy.js';

const T0 = Date.UTC(2026, 10, 26, 8, 0, 0);

test('idle: active, then a warning before the limit, then idle; activity resets it', () => {
  const idleMs = phoneIdleMs(5);
  assert.equal(idleMs, 5 * MINUTE);
  assert.deepEqual(sessionState({ now: T0 + 4 * MINUTE, lastActive: T0, idleMs, warnMs: PHONE_WARN_MS }), { state: 'active', msLeft: MINUTE });
  assert.deepEqual(sessionState({ now: T0 + 5 * MINUTE - 20_000, lastActive: T0, idleMs, warnMs: PHONE_WARN_MS }), { state: 'warn', msLeft: 20_000 });
  assert.equal(sessionState({ now: T0 + 5 * MINUTE, lastActive: T0, idleMs, warnMs: PHONE_WARN_MS }).state, 'idle');
  // A touch 10 s before the limit: active again for the full window.
  assert.equal(sessionState({ now: T0 + 5 * MINUTE, lastActive: T0 + 5 * MINUTE - 10_000, idleMs, warnMs: PHONE_WARN_MS }).state, 'active');
  // "Immediately" still gives a minute in the app (it only means: lock as soon as the app is left).
  assert.equal(phoneIdleMs(0), MINUTE);
  // Web: 15 minutes, warned in the last minute.
  assert.equal(sessionState({ now: T0 + 14.5 * MINUTE, lastActive: T0, idleMs: WEB_IDLE_MS, warnMs: WEB_WARN_MS }).state, 'warn');
});

test('the 12-hour limit since sign-in ends a session even while it is in use', () => {
  const s = sessionState({ now: T0 + MAX_SESSION_MS, lastActive: T0 + MAX_SESSION_MS - 1000, idleMs: WEB_IDLE_MS, warnMs: WEB_WARN_MS, authAt: T0 });
  assert.deepEqual(s, { state: 'expired', msLeft: 0 });
  assert.equal(sessionState({ now: T0 + MAX_SESSION_MS - 1, lastActive: T0 + MAX_SESSION_MS - 1, idleMs: WEB_IDLE_MS, warnMs: WEB_WARN_MS, authAt: T0 }).state, 'active');
  // No auth time known: no overall limit applied (never sign out on a guess).
  assert.equal(sessionState({ now: T0 + 2 * MAX_SESSION_MS, lastActive: T0 + 2 * MAX_SESSION_MS, idleMs: WEB_IDLE_MS, warnMs: WEB_WARN_MS }).state, 'active');
});

test('returning from the background: lock only after the Auto-lock time; screens the app opened are not leaving', () => {
  assert.equal(onReturn({ now: T0 + 4 * MINUTE, leftAt: T0, autoLockMinutes: 5 }), 'keep');
  assert.equal(onReturn({ now: T0 + 5 * MINUTE, leftAt: T0, autoLockMinutes: 5 }), 'lock');
  assert.equal(onReturn({ now: T0 + 1000, leftAt: T0, autoLockMinutes: 0 }), 'lock');
  // The file picker was open for 3 minutes with "Immediately": not a lock.
  assert.equal(onReturn({ now: T0 + 3 * MINUTE, leftAt: T0, autoLockMinutes: 0, holdUntil: T0 + HOLD_MAX_MS }), 'keep');
  // ...but a hold expires.
  assert.equal(onReturn({ now: T0 + 11 * MINUTE, leftAt: T0, autoLockMinutes: 5, holdUntil: T0 + HOLD_MAX_MS }), 'lock');
  assert.equal(onReturn({ now: T0, leftAt: null, autoLockMinutes: 0 }), 'keep');
});

test('cold start: the phone app ends the session when it was closed; the phone web keeps it on a reload', () => {
  const base = { now: T0 + MINUTE, lastActiveAt: T0, autoLockMinutes: 5 };
  assert.equal(onColdStart({ ...base, web: false }), 'end');
  assert.equal(onColdStart({ ...base, web: false, updating: true }), 'continue');
  assert.equal(onColdStart({ ...base, web: false, holdUntil: T0 + HOLD_MAX_MS }), 'continue', 'Android ended the app behind the photo picker');
  assert.equal(onColdStart({ ...base, web: true, sameTab: true }), 'continue', 'reload / restored tab');
  assert.equal(onColdStart({ ...base, web: true, sameTab: false }), 'end', 'new tab or reopened app');
  assert.equal(onColdStart({ ...base, now: T0 + 6 * MINUTE, web: true, sameTab: true }), 'end', 'idle longer than Auto-lock');
});

test('auth time comes from the token amr claim; refreshes keep it; garbage gives null', () => {
  const enc = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const token = (claims) => `${enc({ alg: 'HS256' })}.${enc(claims)}.sig`;
  const t = 1795000000;
  assert.equal(authTimeFromToken(token({ sub: 'u', iat: t + 3600, amr: [{ method: 'password', timestamp: t }] })), t * 1000);
  assert.equal(authTimeFromToken(token({ amr: [{ method: 'password', timestamp: t }, { method: 'otp', timestamp: t + 60 }] })), (t + 60) * 1000);
  assert.equal(authTimeFromToken(token({ sub: 'u' })), null);
  assert.equal(authTimeFromToken('not-a-jwt'), null);
  assert.equal(authTimeFromToken(null), null);
});

test('countdown and the sign-in notices', () => {
  assert.equal(countdown(27_400), '0:28');
  assert.equal(countdown(60_000), '1:00');
  assert.equal(countdown(-5), '0:00');
  assert.match(signOutNotice('idle', { minutes: 5 }).text, /inactive for 5 minutes/);
  assert.match(signOutNotice('idle', { minutes: 1 }).text, /inactive for 1 minute\./);
  assert.match(signOutNotice('away', { minutes: 5 }).text, /away from the app for more than 5 minutes/);
  assert.match(signOutNotice('away', { minutes: 0 }).text, /set to Immediately/);
  assert.match(signOutNotice('expired').text, /12 hours/);
  assert.match(signOutNotice('revoked').title, /session ended/);
  assert.equal(signOutNotice('manual'), null);
});
