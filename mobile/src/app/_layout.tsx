import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular';
import { Inter_500Medium } from '@expo-google-fonts/inter/500Medium';
import { Inter_600SemiBold } from '@expo-google-fonts/inter/600SemiBold';
import { Inter_700Bold } from '@expo-google-fonts/inter/700Bold';
import { InterTight_500Medium } from '@expo-google-fonts/inter-tight/500Medium';
import { InterTight_600SemiBold } from '@expo-google-fonts/inter-tight/600SemiBold';
import { InterTight_700Bold } from '@expo-google-fonts/inter-tight/700Bold';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { useFonts } from 'expo-font';
import { Stack, router, useSegments } from 'expo-router';
import * as ScreenCapture from 'expo-screen-capture';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { LockScreen } from '@/features/session/LockScreen';
import { useSession } from '@/features/session/useSession';
import { useAuth } from '@/lib/auth';
import { persister, queryClient, shouldPersist } from '@/lib/queryClient';
import { useApp } from '@/lib/store';
import { ToastHost } from '@/ui/feedback';
import { ThemeProvider, useTheme } from '@/ui/theme';

SplashScreen.preventAutoHideAsync().catch(() => {});
SplashScreen.setOptions({ duration: 200, fade: true });

/**
 * Signed out → Welcome; signed in → Today. Stack.Protected removes the other group's routes but doesn't
 * move you off a route that just became unavailable (launching on "/" signed out showed "Unmatched Route").
 */
function useAuthRedirect(signedIn: boolean) {
  const segments = useSegments();
  const ready = useAuth((s) => s.ready); // wait until the stored session has been read
  const inAuth = segments[0] === '(auth)';
  const open = (segments[0] as string) === 'dev-ui'; // dev-only gallery: reachable signed in or out
  useEffect(() => {
    if (!ready || open) return;
    if (!signedIn && !inAuth) router.replace('/welcome');
    else if (signedIn && inAuth) router.replace('/');
  }, [ready, signedIn, inAuth, open]);
}

function Navigator() {
  const p = useTheme();
  const session = useAuth((s) => s.session);
  const uid = session?.user.id;
  useAuthRedirect(!!session);
  // One persisted cache per user: a new buster when the user changes discards the previous user's cache.
  const persistOptions = useMemo(() => ({
    persister,
    buster: uid ?? 'signed-out',
    maxAge: 7 * 24 * 60 * 60_000,
    dehydrateOptions: { shouldDehydrateQuery: (q: { state: { status: string }; queryKey: readonly unknown[] }) => q.state.status === 'success' && shouldPersist(q.queryKey) },
  }), [uid]);
  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={persistOptions}
      onSuccess={() => { queryClient.resumePausedMutations().catch(() => {}); }}
    >
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: p.bg }, animation: 'fade_from_bottom' }}>
        <Stack.Protected guard={!!session}>
          <Stack.Screen name="(app)" />
        </Stack.Protected>
        <Stack.Protected guard={!session}>
          <Stack.Screen name="(auth)" />
        </Stack.Protected>
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

function Root() {
  const p = useTheme();
  const boot = useSession();
  useRecentsPrivacy();
  useEffect(() => {
    if (boot !== 'starting') SplashScreen.hideAsync().catch(() => {});
  }, [boot]);
  // The navigator is mounted from the first render (Expo Router needs it); the splash covers it while
  // booting, and when locked the lock screen covers it and hides it from TalkBack. Signed-out-while-locked
  // shows only the auth group underneath, never figures: the session isn't readable until unlock.
  const locked = boot === 'locked';
  return (
    <View style={{ flex: 1, backgroundColor: p.bg }}>
      <StatusBar style={p.mode === 'dark' ? 'light' : 'dark'} />
      <View style={{ flex: 1 }} importantForAccessibility={locked ? 'no-hide-descendants' : 'auto'} accessibilityElementsHidden={locked}>
        <Navigator />
      </View>
      {locked ? <View style={StyleSheet.absoluteFill}><LockScreen /></View> : null}
      <ToastHost />
    </View>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold,
    InterTight_500Medium, InterTight_600SemiBold, InterTight_700Bold,
  });
  if (!fontsLoaded && !fontError) return null; // splash stays up (≤ 600 ms target, plan §6.1)
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <Root />
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
