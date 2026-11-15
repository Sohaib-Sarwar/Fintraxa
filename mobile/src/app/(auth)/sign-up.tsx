import { AuthScreen } from '@/features/auth/AuthScreen';

/** Sign up — the same screen, opened on the Sign up side; the form slides between the two in place. */
export default function SignUp() {
  return <AuthScreen initial="up" />;
}
