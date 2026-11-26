import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular';
import { Inter_500Medium } from '@expo-google-fonts/inter/500Medium';
import { Inter_600SemiBold } from '@expo-google-fonts/inter/600SemiBold';
import { Inter_700Bold } from '@expo-google-fonts/inter/700Bold';
import { InterTight_500Medium } from '@expo-google-fonts/inter-tight/500Medium';
import { InterTight_600SemiBold } from '@expo-google-fonts/inter-tight/600SemiBold';
import { InterTight_700Bold } from '@expo-google-fonts/inter-tight/700Bold';
import { InterTight_800ExtraBold } from '@expo-google-fonts/inter-tight/800ExtraBold';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { useFonts } from 'expo-font';
import { Stack, router, useSegments } from 'expo-router';
import * as ScreenCapture from 'expo-screen-capture';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { LockScreen } from '@/features/session/LockScreen';
import { SignInCurtain, useCurtain } from '@/features/session/SignInCurtain';
import { useOtaUpdates } from '@/lib/otaUpdates';
import { IdleWarning } from '@/features/session/IdleWarning';
import { markActive, useSession } from '@/features/session/useSession';
import { useAuth } from '@/lib/auth';
import { isExpoGo } from '@/lib/env';
import { CACHE_VERSION, persister, queryClient, shouldPersist, useCacheOwner } from '@/lib/queryClient';
import { useApp } from '@/lib/store';
import { ToastHost } from '@/ui/feedback';
import { ThemeProvider, useTheme } from '@/ui/theme';

SplashScreen.preventAutoHideAsync().catch(() => {});
if (!isExpoGo) SplashScreen.setOptions({ duration: 200, fade: true }); // not supported in Expo Go

/**
 * The one auth guard: signed out → Welcome, signed in → Today. (Stack.Protected was dropped: toggling its
 * route sets while the launch URL "/" pointed into the hidden group threw "Linking did not produce an
 * initial navigation state" / ROUTE_NAMES_CHANGED in Expo Router 58.) Returns true once the user is on the
 * right side, so the splash can stay up until then — no flash of the wrong screen.
 */
function useAuthRedirect(signedIn: boolean): boolean {
  const segments = useSegments();
  const ready = useAuth((s) => s.ready); // wait until the stored session has been read
  const inAuth = segments[0] === '(auth)';
  const open = (segments[0] as string) === 'dev-ui'; // dev-only gallery: reachable signed in or out
  const settled = ready && (open || signedIn !== inAuth);
  useEffect(() => {
    if (!ready || open) return;
    if (!signedIn && !inAuth) router.replace('/welcome');
    else if (signedIn && inAuth) router.replace('/');
  }, [ready, signedIn, inAuth, open]);
  return settled;
}

function Navigator({ onSettled }: { onSettled: (v: boolean) => void }) {
  const p = useTheme();
  const session = useAuth((s) => s.session);
  const uid = session?.user.id;
  const settled = useAuthRedirect(!!session);
  useEffect(() => { onSettled(settled); }, [settled, onSettled]);
  // A fixed buster (owner, 2026-11-15: "load instantly from cache"). It used to be the user id, but the cache is
  // restored before the session is read — uid undefined → buster 'signed-out' → mismatch → TanStack DELETED the
  // stored cache on every launch. Per-user isolation is `useCacheOwner` (and sign-out wipes the cache).
  useCacheOwner(uid);
  const persistOptions = useMemo(() => ({
    persister,
    buster: CACHE_VERSION,
    maxAge: 7 * 24 * 60 * 60_000,
    dehydrateOptions: { shouldDehydrateQuery: (q: { state: { status: string }; queryKey: readonly unknown[] }) => q.state.status === 'success' && shouldPersist(q.queryKey) },
  }), []);
  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={persistOptions}
      onSuccess={() => { queryClient.resumePausedMutations().catch(() => {}); }}
    >
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: p.bg }, animation: 'fade' }}>
        <Stack.Screen name="(app)" />
        <Stack.Screen name="(auth)" />
      </Stack>
    </PersistQueryClientProvider>
  );
}

/** "Hide app content in recent apps" (default on): Android FLAG_SECURE also blocks screenshots. */
function useRecentsPrivacy() {
  const hide = useApp((s) => s.hideInRecents);
  useEffect(() => {
    if (Platform.OS === 'web') return;
    (hide ? ScreenCapture.preventScreenCaptureAsync('recents') : ScreenCapture.allowScreenCaptureAsync('recents')).catch(() => {});
  }, [hide]);
}

function Root({ fontsReady }: { fontsReady: boolean }) {
  const p = useTheme();
  const boot = useSession();
  const [settled, setSettled] = useState(false);
  useRecentsPrivacy();
  useOtaUpdates();
  // Splash stays until fonts are in and the user is on the right screen (or the lock screen is up) — and, signed in,
  // until Home has its figures on screen (at most 2.5 s more), so the app opens on a finished page (owner, 2026-11-15).
  const signedIn = useAuth((s) => !!s.session);
  const homeReady = useCurtain((s) => s.ready);
  const [waited, setWaited] = useState(false);
  useEffect(() => { const t = setTimeout(() => setWaited(true), 2500); return () => clearTimeout(t); }, []);
  useEffect(() => {
    if (fontsReady && (boot === 'locked' || (boot === 'ready' && settled && (!signedIn || homeReady || waited)))) SplashScreen.hideAsync().catch(() => {});
  }, [fontsReady, boot, settled, signedIn, homeReady, waited]);
  // The navigator is mounted from the first render (Expo Router needs it); the splash covers it while
  // booting, and when locked the lock screen covers it and hides it from TalkBack. Signed-out-while-locked
  // shows only the auth group underneath, never figures: the session isn't readable until unlock.
  const locked = boot === 'locked';
  return (
    <View style={{ flex: 1, backgroundColor: p.bg }}>
      <StatusBar style={p.mode === 'dark' ? 'light' : 'dark'} />
      {/* Any touch counts as activity for auto-lock (useSession.ts; web: the whole document, lib/activity.ts). */}
      <View style={{ flex: 1 }} onTouchStart={markActive} importantForAccessibility={locked ? 'no-hide-descendants' : 'auto'} accessibilityElementsHidden={locked}>
        <Navigator onSettled={setSettled} />
      </View>
      {/* Sign-in → Home: the landing's loader until Home is ready, then an unlock-style reveal. */}
      <SignInCurtain />
      {/* "Still there?" before an idle lock / sign-out (useSession.ts). */}
      <IdleWarning />
      {locked ? <View style={StyleSheet.absoluteFill}><LockScreen /></View> : null}
      <ToastHost />
    </View>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold,
    InterTight_500Medium, InterTight_600SemiBold, InterTight_700Bold,
    InterTight_800ExtraBold,
  });
  // The navigator renders from the very first frame (Expo Router requires it); the splash hides the
  // fallback font until Inter is loaded (≤ 600 ms target, plan §6.1).
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <Root fontsReady={fontsLoaded || !!fontError} />
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
