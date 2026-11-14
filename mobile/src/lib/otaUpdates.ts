/**
 * Automatic over-the-air updates (owner, 2026-11-15: "make the updates automatically").
 *
 * - On launch and every time the app comes back to the foreground, ask EAS Update whether a newer bundle exists
 *   for this APK's runtime (the native fingerprint — see app.config.ts) and download it quietly.
 * - A downloaded update is applied when the app next goes to the background (the user is away, so nothing jumps
 *   under their finger); if that cannot happen, expo-updates loads it on the next cold start anyway.
 * - Off in Expo Go and dev builds (`Updates.isEnabled` is false there). Never throws: no network = try later.
 */
import * as Updates from 'expo-updates';
import { useEffect } from 'react';
import { AppState } from 'react-native';

/** Not more than once a minute when the app flips between foreground and background. */
const MIN_GAP_MS = 60_000;

export function useOtaUpdates() {
  useEffect(() => {
    if (__DEV__ || !Updates.isEnabled) return undefined;
    let pending = false;
    let checking = false;
    let lastCheck = 0;

    const check = async () => {
      if (checking || pending || Date.now() - lastCheck < MIN_GAP_MS) return;
      checking = true;
      lastCheck = Date.now();
      try {
        const res = await Updates.checkForUpdateAsync();
        if (res.isAvailable) {
          const got = await Updates.fetchUpdateAsync();
          pending = got.isNew;
        }
      } catch {
        // offline or the server is busy — the next foreground tries again
      } finally {
        checking = false;
      }
    };

    check();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') check();
      else if (state === 'background' && pending) {
        pending = false;
        Updates.reloadAsync().catch(() => { /* applied on the next cold start instead */ });
      }
    });
    return () => sub.remove();
  }, []);
}
