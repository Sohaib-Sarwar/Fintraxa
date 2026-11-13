import { Stack } from 'expo-router';
import { useTheme } from '@/ui/theme';

// Signed out, every protected route falls back here; `welcome` is the stack's base screen.
export const unstable_settings = { anchor: 'welcome' };

export default function AuthLayout() {
  const p = useTheme();
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: p.bg }, animation: 'slide_from_right' }}>
      <Stack.Screen name="welcome" options={{ animation: 'fade' }} />
      <Stack.Screen name="sign-in" />
      <Stack.Screen name="sign-up" />
      <Stack.Screen name="forgot" />
    </Stack>
  );
}
