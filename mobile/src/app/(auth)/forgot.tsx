import { router } from 'expo-router';
import { MailCheck } from '@/ui/icons';
import { useState } from 'react';
import { authMessage, sendReset } from '@/lib/auth';
import { EmptyState } from '@/ui/feedback';
import { Field } from '@/ui/Field';
import { Button, Gap } from '@/ui/primitives';
import { Screen } from '@/ui/Screen';
import { Text } from '@/ui/Text';
import { useTheme } from '@/ui/theme';
import { space } from '@/ui/tokens';

/** The reset link opens the web app's existing "set a new password" screen; then sign in here. */
export default function Forgot() {
  const p = useTheme();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async () => {
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) { setError('Enter the email you signed up with.'); return; }
    setBusy(true);
    setError(null);
    try {
      await sendReset(email);
      setSent(true);
    } catch (e) {
      setError(authMessage(e));
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <Screen back>
        <EmptyState icon={<MailCheck size={40} color={p.accent} />} title="Reset link sent"
          body="If an account uses that email, a link is on its way. Open it on any device to choose a new password, then sign in here."
          action="Back to sign in" onAction={() => router.replace('/sign-in')} />
      </Screen>
    );
  }
  return (
    <Screen back title="Reset your password">
      <Text variant="body" tone="ink2">We’ll email you a link to choose a new one.</Text>
      <Gap h={space.xxl} />
      <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" error={error} returnKeyType="send" onSubmitEditing={submit} />
      <Gap h={space.xl} />
      <Button label="Send reset link" onPress={submit} loading={busy} />
    </Screen>
  );
}
