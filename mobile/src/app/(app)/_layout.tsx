import * as Application from 'expo-application';
import { Stack, router } from 'expo-router';
import { useEffect, useRef } from 'react';
import { useLatestRelease, usePrefs, useUid } from '@/data/queries';
import { ForcedUpdate } from '@/features/me/UpdateBanner';
import { isExpoGo } from '@/lib/env';
import { ALL_TRACKS, useApp } from '@/lib/store';
import { useTheme } from '@/ui/theme';

export const unstable_settings = { anchor: '(tabs)' };

/** Mirror account-wide preferences (user_preferences) onto the device; the server copy wins. */
function usePrefsSync(uid: string | undefined) {
  const prefs = usePrefs();
  useEffect(() => {
    if (!uid || !prefs.data) return;
    const t = prefs.data.tracks ?? {};
    useApp.getState().setTracks(uid, { spending: t.spending ?? true, funds: t.funds ?? true, stocks: t.stocks ?? true });
    if (typeof prefs.data.auto_lock_minutes === 'number') useApp.getState().set({ autoLockMinutes: prefs.data.auto_lock_minutes });
  }, [uid, prefs.data]);
}

export default function AppLayout() {
  const p = useTheme();
  const uid = useUid();
  const onboarded = useApp((s) => (uid ? !!s.onboarded[uid] : true));
  usePrefsSync(uid);

  // First sign-in on this phone: ask what to track (then offer fingerprint unlock).
  const sent = useRef(false);
  useEffect(() => {
    if (!uid || onboarded || sent.current) return;
    sent.current = true;
    if (!useApp.getState().tracks[uid]) useApp.getState().setTracks(uid, ALL_TRACKS);
    const t = setTimeout(() => router.replace('/onboarding'), 0);
    return () => clearTimeout(t);
  }, [uid, onboarded]);

  // Forced update: only a real Fintraxa build has a meaningful versionCode (Expo Go reports its own).
  const release = useLatestRelease(!isExpoGo);
  const code = Number(Application.nativeBuildVersion ?? 0);
  if (!isExpoGo && release.data && code > 0 && code < release.data.min_supported_code) return <ForcedUpdate release={release.data} />;

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: p.bg }, animation: 'slide_from_right' }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="add" options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }} />
      <Stack.Screen name="onboarding" options={{ animation: 'fade', gestureEnabled: false }} />
      <Stack.Screen name="biometrics" options={{ animation: 'fade', gestureEnabled: false }} />
    </Stack>
  );
}
