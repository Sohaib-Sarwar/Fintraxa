import * as Application from 'expo-application';
import { BlurTargetView } from 'expo-blur';
import { Stack, router } from 'expo-router';
import { useEffect, useRef, type ComponentRef } from 'react';
import { View } from 'react-native';
import { useLatestRelease, usePrefs, useUid } from '@/data/queries';
import { ForcedUpdate } from '@/features/me/UpdateBanner';
import { RangeSheet } from '@/features/range/RangeSheet';
import { usePeriodSheet } from '@/features/range/usePeriod';
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
  // The global period sheet (every RangeButton without its own sheet) is drawn here, over the whole stack, so it
  // opens on pushed pages too — stock and fund pages (owner, 2026-11-15: "the date filter there isn't working").
  const periodOpen = usePeriodSheet((s) => s.open);
  const stackRef = useRef<ComponentRef<typeof View>>(null);
  const code = Number(Application.nativeBuildVersion ?? 0);
  if (!isExpoGo && release.data && code > 0 && code < release.data.min_supported_code) return <ForcedUpdate release={release.data} />;

  // Opened pages slide in from the right like iOS (the previous page moves a little left and dims), and back slides
  // them out (owner, 2026-11-15: "smooth Apple-style page switching"). Add rises from the bottom.
  return (
    <View style={{ flex: 1, backgroundColor: p.bg }}>
    <BlurTargetView ref={stackRef} style={{ flex: 1, backgroundColor: p.bg }}>
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: p.bg }, animation: 'ios_from_right' }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="add" options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }} />
      <Stack.Screen name="dividend-add" options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }} />
      <Stack.Screen name="upcoming-dividend/[id]" options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }} />
      <Stack.Screen name="onboarding" options={{ animation: 'fade', gestureEnabled: false }} />
      <Stack.Screen name="biometrics" options={{ animation: 'fade', gestureEnabled: false }} />
    </Stack>
    </BlurTargetView>
    {periodOpen ? <RangeSheet blurTarget={stackRef} /> : null}
    </View>
  );
}
