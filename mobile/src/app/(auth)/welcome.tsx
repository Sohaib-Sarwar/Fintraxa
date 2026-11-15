import { AuthScreen } from '@/features/auth/AuthScreen';

/** Signed out, the app opens straight on the glass sign-in (owner, 2026-11-15) — sign up is one tap away on it. */
export default function Welcome() {
  return <AuthScreen initial="in" />;
}
