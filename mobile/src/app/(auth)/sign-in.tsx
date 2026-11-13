import { router } from 'expo-router';
import { Info } from '@/ui/icons';
import { useRef, useState, type ComponentRef } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, View, type TextInput } from 'react-native';
import { authMessage, signIn, useAuth } from '@/lib/auth';
import { haptic } from '@/lib/haptics';
import { Field } from '@/ui/Field';
import { Button, Gap } from '@/ui/primitives';
import { Screen } from '@/ui/Screen';
import { Text } from '@/ui/Text';
import { useTheme } from '@/ui/theme';
import { space } from '@/ui/tokens';

type InputRef = ComponentRef<typeof TextInput>;

/** One field for email or username (plan §6.1); usernames go through `username-login` like the web. */
export default function SignIn() {
  const p = useTheme();
  const notice = useAuth((s) => s.notice);
  const [id, setId] = useState('');
  const [pw, setPw] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const pwRef = useRef<InputRef>(null);

  const submit = async () => {
    if (!id.trim() || !pw) { setError('Enter your email or username and your password.'); return; }
    setBusy(true);
    setError(null);
    try {
      await signIn(id, pw);
      haptic.success();
      useAuth.getState().setNotice(null);
      // The protected (app) group takes over as soon as the session lands.
    } catch (e) {
      haptic.error();
      setError(authMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen back title="Welcome back">
        <Text variant="body" tone="ink2">Sign in to see where you stand today.</Text>
        {notice ? (
          <View style={[styles.notice, { backgroundColor: p.accentSoft }]} accessibilityLiveRegion="polite">
            <Info size={18} color={p.ink} />
            <Text variant="label" style={{ flex: 1 }}>{notice}</Text>
          </View>
        ) : null}
        <Gap h={space.xxl} />
        <Field label="Email or username" value={id} onChangeText={setId} autoCapitalize="none" autoComplete="username" textContentType="username"
          autoCorrect={false} keyboardType="email-address" returnKeyType="next" onSubmitEditing={() => pwRef.current?.focus()} />
        <Gap h={space.lg} />
        <Field ref={pwRef} label="Password" value={pw} onChangeText={setPw} secure autoComplete="current-password" textContentType="password"
          returnKeyType="go" onSubmitEditing={submit} error={error} />
        <Pressable onPress={() => router.push('/forgot')} hitSlop={10} style={styles.forgot} accessibilityRole="link">
          <Text variant="label" tone="accent">Forgot password?</Text>
        </Pressable>
        <Gap h={space.xl} />
        <Button label="Sign in" onPress={submit} loading={busy} />
        <Gap h={space.lg} />
        <Pressable onPress={() => router.replace('/sign-up')} hitSlop={10} accessibilityRole="link" style={{ alignSelf: 'center' }}>
          <Text variant="label" tone="ink2">New to Fintraxa? <Text variant="label" tone="accent">Create an account</Text></Text>
        </Pressable>
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  notice: { flexDirection: 'row', gap: space.sm, alignItems: 'flex-start', padding: space.md, borderRadius: 14, marginTop: space.lg },
  forgot: { alignSelf: 'flex-end', marginTop: space.md, minHeight: 32, justifyContent: 'center' },
});
