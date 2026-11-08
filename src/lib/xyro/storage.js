/**
 * Xyro's local state: the Gemini API key, the chosen model and the chat
 * sessions. Everything lives in this browser's localStorage, namespaced by the
 * signed-in user's id, and never leaves the device except the key itself,
 * which goes to Google with each question. Every access is wrapped: storage
 * can be unavailable (private windows, blocked site data).
 */
import { useSyncExternalStore } from 'react';

const NS = 'fintraxa.xyro';
const EVENT = 'fintraxa:xyro-config';
/** 'auto' = Xyro picks the fastest model the key can use (lib/xyro/models.js); otherwise a model id the user chose. */
export const DEFAULT_MODEL = 'auto';
export const MAX_SESSIONS = 30;
export const MAX_MESSAGES = 100;

const k = (uid, name) => `${NS}.${uid || 'anon'}.${name}`;
const read = (key) => { try { return globalThis.localStorage?.getItem(key) ?? null; } catch { return null; } };
const write = (key, value) => {
  try {
    if (value === null || value === undefined) globalThis.localStorage?.removeItem(key);
    else globalThis.localStorage?.setItem(key, value);
  } catch { /* storage unavailable: the value just isn't remembered */ }
  try { globalThis.dispatchEvent?.(new Event(EVENT)); } catch { /* not in a browser */ }
};

export const getApiKey = (uid) => read(k(uid, 'key'));
export const setApiKey = (uid, key) => write(k(uid, 'key'), key ? String(key).trim() : null);
export const getModel = (uid) => read(k(uid, 'model')) || DEFAULT_MODEL;
export const setModel = (uid, model) => write(k(uid, 'model'), model || null);

/** Sessions, newest first: [{ id, title, createdAt, updatedAt, summary?, messages: [{ role: 'user'|'model', text, at, error? }] }] */
export function getSessions(uid) {
  try {
    const list = JSON.parse(read(k(uid, 'sessions')) ?? '[]');
    return Array.isArray(list) ? list.filter((s) => s && s.id && Array.isArray(s.messages)) : [];
  } catch { return []; }
}
export function saveSessions(uid, sessions) {
  const trimmed = [...sessions]
    .filter((s) => s.messages.length)
    .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
    .slice(0, MAX_SESSIONS)
    .map((s) => ({ ...s, messages: s.messages.slice(-MAX_MESSAGES) }));
  write(k(uid, 'sessions'), JSON.stringify(trimmed));
}
export const clearSessions = (uid) => {
  write(k(uid, 'sessions'), null);
  try { globalThis.dispatchEvent?.(new Event('fintraxa:xyro-cleared')); } catch { /* not in a browser */ }
};

/** A title from the first question: short, one line. */
export const titleFrom = (text) => {
  const t = String(text ?? '').replace(/\s+/g, ' ').trim();
  return t.length > 48 ? `${t.slice(0, 46).trimEnd()}…` : t || 'New chat';
};
export const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

/** { apiKey, model } for a user, re-read whenever settings change (in this tab or another). */
const subscribe = (cb) => {
  globalThis.addEventListener?.(EVENT, cb);
  globalThis.addEventListener?.('storage', cb);
  return () => { globalThis.removeEventListener?.(EVENT, cb); globalThis.removeEventListener?.('storage', cb); };
};
export function useXyroConfig(uid) {
  const apiKey = useSyncExternalStore(subscribe, () => getApiKey(uid), () => null);
  const model = useSyncExternalStore(subscribe, () => getModel(uid), () => DEFAULT_MODEL);
  return { apiKey, model, hasKey: !!apiKey };
}
