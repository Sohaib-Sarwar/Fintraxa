import { router } from 'expo-router';
import { MailCheck } from '@/ui/icons';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable } from 'react-native';
import { authMessage, signUp } from '@/lib/auth';
import { haptic } from '@/lib/haptics';
import { EmptyState } from '@/ui/feedback';
import { Field } from '@/ui/Field';
import { Button, Gap } from '@/ui/primitives';
import { Screen } from '@/ui/Screen';
import { Text } from '@/ui/Text';
import { useTheme } from '@/ui/theme';
import { space } from '@/ui/tokens';

export default function SignUp() {
  const p = useTheme();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [errors, setErrors] = useState<{ name?: string; email?: string; pw?: string; form?: string }>({});
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async () => {
    const e: typeof errors = {};
    if (!name.trim()) e.name = 'Tell us your name.';
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) e.email = 'Enter a valid email address.';
    if (pw.length < 8) e.pw = 'Use at least 8 characters.';
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    try {
      const { needsConfirmation } = await signUp(name, email, pw);
      haptic.success();
      if (needsConfirmation) setSent(true);
    } catch (err) {
      haptic.error();
      setErrors({ form: authMessage(err) });
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <Screen back>
        <EmptyState icon={<MailCheck size={40} color={p.accent} />} title="Check your email"
          body={`We sent a confirmation link to ${email.trim()}. Open it, then come back and sign in.`} action="Go to sign in" onAction={() => router.replace('/sign-in')} />
      </Screen>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen back title="Create your account">
        <Text variant="body" tone="ink2">Track funds, shares and spending in one place. Free, no ads.</Text>
        <Gap h={space.xxl} />
        <Field label="Your name" value={name} onChangeText={setName} autoComplete="name" textContentType="name" error={errors.name} />
        <Gap h={space.lg} />
        <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" textContentType="emailAddress" error={errors.email} />
        <Gap h={space.lg} />
        <Field label="Password" value={pw} onChangeText={setPw} secure autoComplete="new-password" textContentType="newPassword" error={errors.pw ?? errors.form} />
        <Text variant="caption" tone="muted" style={{ marginTop: 6 }}>At least 8 characters.</Text>
        <Gap h={space.xl} />
        <Button label="Create account" onPress={submit} loading={busy} />
        <Gap h={space.lg} />
        <Pressable onPress={() => router.replace('/sign-in')} hitSlop={10} accessibilityRole="link" style={{ alignSelf: 'center' }}>
          <Text variant="label" tone="ink2">Already have an account? <Text variant="label" tone="accent">Sign in</Text></Text>
        </Pressable>
      </Screen>
    </KeyboardAvoidingView>
  );
}
