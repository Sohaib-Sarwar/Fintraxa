/**
 * The browser's "install this app" offer, caught as early as possible.
 *
 * Chromium fires `beforeinstallprompt` once, shortly after the page loads. The
 * install card mounts later (after the lazy app shell and sign-in), so a listener
 * added there missed the event and the card never appeared on desktop. This module
 * is imported first thing in main.jsx: it holds the event and tells whoever asks.
 */
let deferred = null;
let installed = false;
const listeners = new Set();
const emit = () => listeners.forEach((fn) => fn(deferred));

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // we show our own card, then the browser's dialog on Install
    deferred = e;
    emit();
  });
  window.addEventListener('appinstalled', () => {
    installed = true;
    deferred = null;
    emit();
  });
}

/** The held event, or null when the browser has not offered (or it was used). */
export const getInstallEvent = () => deferred;
export const wasInstalled = () => installed;

/** Call `fn(event | null)` whenever the offer appears or goes away. Returns an unsubscribe. */
export function onInstallEvent(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Open the browser's install dialog. Resolves 'accepted' | 'dismissed' | 'unavailable'. */
export async function promptInstall() {
  const e = deferred;
  if (!e) return 'unavailable';
  deferred = null; // an event can be prompted only once
  e.prompt();
  const { outcome } = await e.userChoice;
  emit();
  return outcome;
}

/** Already running as an installed app. */
export const isStandalone = () => typeof window !== 'undefined'
  && (window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true);
