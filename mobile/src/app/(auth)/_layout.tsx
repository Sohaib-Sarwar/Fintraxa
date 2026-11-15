import { Stack } from 'expo-router';

// Signed out, every protected route falls back here; `welcome` is the stack's base screen.
export const unstable_settings = { anchor: 'welcome' };

export default function AuthLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, animation: 'fade', contentStyle: { backgroundColor: '#030604' } }}>
      <Stack.Screen name="welcome" options={{ animation: 'fade' }} />
      <Stack.Screen name="sign-in" />
      <Stack.Screen name="sign-up" />
      <Stack.Screen name="forgot" />
    </Stack>
  );
}
