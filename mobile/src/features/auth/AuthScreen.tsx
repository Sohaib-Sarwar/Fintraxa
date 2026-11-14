/**
 * Signed-out start (owner, 2026-11-15): a lock-screen-style landing — a portrait wallpaper cut for the S24 Ultra
 * (nature, beaches, night skies, stars, planet), the Fintraxa mark, and "Swipe up". Swiping up (the content follows
 * the finger) or tapping the arrow: with fingerprint sign-in set up, the fingerprint prompt opens at once; otherwise
 * — or if it is cancelled — a light glass sheet rises with the sign-in form, riding on the keyboard so the fields
 * never hide behind it. A small "Create account" link opens the same sheet for sign-up. The form is the web
 * AuthPage's: underlined fields, the same checks and messages. The mark doubles as the loader while signing in.
 */
import { BlurTargetView } from 'expo-blur';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef, useState, type ComponentRef, type ReactNode } from 'react';
import { Dimensions, Keyboard, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, {
  Easing, FadeIn, FadeInDown, FadeOut, FadeOutUp, interpolate, Extrapolation, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';
import { authMessage, signIn, signUp, useAuth } from '@/lib/auth';
import { bioLogin, bioLoginHint, canOfferBioLogin } from '@/lib/bioLogin';
import { haptic } from '@/lib/haptics';
import { GlassSheet } from '@/ui/GlassSheet';
import { Check, ChevronUp, Eye, EyeOff, Mail, User, X } from '@/ui/icons';
import { SheetFrame } from '@/ui/SheetFrame';
import { Text } from '@/ui/Text';
import { font, space } from '@/ui/tokens';
import { pickBackdrop } from './backdrops';
import { FingerprintGlyph } from './FingerprintGlyph';
import { LogoLoader } from './LogoLoader';

const EASE = Easing.bezier(0.2, 0, 0, 1);
const INK = '#FFFFFF';
const INK2 = 'rgba(255,255,255,0.65)';
const USERNAME_RE = /^[a-z0-9][a-z0-9._]{1,22}[a-z0-9]$/i;
/**
 * Galaxy S24 Ultra: the ultrasonic in-display sensor sits at the bottom centre, "not too close to the bottom edge"
 * (Samsung support; GSMArena review). Samsung publishes no exact figure, so its centre is taken as 16% of the screen
 * height above the bottom edge — the one number to adjust if it needs to sit higher or lower.
 */
const SENSOR_FROM_BOTTOM = 0.16;
const SWIPE = 90;

type Mode = 'in' | 'up';
type Errors = { name?: string; email?: string; password?: string; confirm?: string };

/** The web's underlined field: text on one line, an icon (or the show/hide eye) at the end, the error under it. */
function Line({ value, onChangeText, placeholder, icon, error, secure, inputRef, ...rest }: {
  value: string; onChangeText: (v: string) => void; placeholder: string; icon?: ReactNode; error?: string; secure?: boolean;
  inputRef?: React.Ref<ComponentRef<typeof TextInput>>;
} & Omit<React.ComponentProps<typeof TextInput>, 'value' | 'onChangeText' | 'placeholder' | 'secureTextEntry'>) {
  const [focus, setFocus] = useState(false);
  const [show, setShow] = useState(false);
  return (
    <View>
      <View style={[styles.line, { borderBottomColor: error ? 'rgba(248,113,113,0.85)' : focus ? INK : 'rgba(255,255,255,0.3)' }]}>
        <TextInput ref={inputRef} value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor="rgba(255,255,255,0.55)"
          secureTextEntry={secure && !show} style={styles.input} selectionColor={INK} cursorColor={INK} accessibilityLabel={placeholder}
          onFocus={() => setFocus(true)} onBlur={() => setFocus(false)} {...rest} />
        {secure ? (
          <Pressable onPress={() => setShow((v) => !v)} hitSlop={10} accessibilityRole="button" accessibilityLabel={show ? 'Hide password' : 'Show password'}>
            {show ? <EyeOff size={17} color={INK2} /> : <Eye size={17} color={INK2} />}
          </Pressable>
        ) : icon}
      </View>
      <Text style={styles.error} accessibilityLiveRegion="polite">{error ?? ''}</Text>
    </View>
  );
}

/** Frosted notification at the top (the web's GlassNotice): a check, a title, one line; closes itself. */
function Notice({ notice, onClose }: { notice: { title: string; text: string } | null; onClose: () => void }) {
  useEffect(() => {
    if (!notice) return undefined;
    const t = setTimeout(onClose, 6000);
    return () => clearTimeout(t);
  }, [notice, onClose]);
  if (!notice) return null;
  return (
    <Animated.View entering={FadeInDown.duration(320).easing(EASE)} exiting={FadeOutUp.duration(220)} style={styles.notice} accessibilityLiveRegion="polite">
      <LinearGradient colors={['rgba(255,255,255,0.16)', 'rgba(255,255,255,0.06)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      <View style={styles.noticeIcon}><Check size={18} color={INK} strokeWidth={2.6} /></View>
      <View style={{ flex: 1 }}>
        <Text style={styles.noticeTitle}>{notice.title}</Text>
        <Text style={styles.noticeText}>{notice.text}</Text>
      </View>
      <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close notification"><X size={15} color={INK2} /></Pressable>
    </Animated.View>
  );
}

export function AuthScreen({ initial = 'in' }: { initial?: Mode }) {
  const insets = useSafeAreaInsets();
  const target = useRef<ComponentRef<typeof View>>(null);
  const [bg] = useState(pickBackdrop);
  const [bgReady, setBgReady] = useState(false);
  /** The sign-in / sign-up sheet; null = the landing. Opening on /sign-up shows the sign-up sheet at once. */
  const [sheet, setSheet] = useState<Mode | null>(initial === 'up' ? 'up' : null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ title: string; text: string } | null>(() => {
    const n = useAuth.getState().notice;
    return n ? { title: 'Signed out', text: n } : null;
  });
  const [bioHint, setBioHint] = useState<string | null>(null);
  const [bioOffer, setBioOffer] = useState(false);
  const [bioSheet, setBioSheet] = useState(false);
  const pwRef = useRef<ComponentRef<typeof TextInput>>(null);
  const authNotice = useAuth((s) => s.notice);

  useEffect(() => { bioLoginHint().then(setBioHint); canOfferBioLogin().then(setBioOffer); }, []);
  useEffect(() => { if (authNotice) useAuth.getState().setNotice(null); }, [authNotice]);

  const openSheet = (m: Mode) => {
    setErrors({}); setError(null); setPassword(''); setConfirm('');
    setSheet(m);
  };
  const clear = (k: keyof Errors) => setErrors((e) => (e[k] ? { ...e, [k]: undefined } : e));

  /** Swipe up / tap: fingerprint first when it is set up; the sign-in sheet otherwise (or when it is cancelled). */
  const unlock = async () => {
    if (busy || sheet) return;
    haptic.light();
    if (!bioHint) { openSheet('in'); return; }
    setBusy(true);
    try {
      const r = await bioLogin();
      if (r === 'ok') { haptic.success(); return; }
      if (r === 'unavailable') { setBioHint(null); setBioSheet(true); return; }
      openSheet('in');
    } catch (e) {
      haptic.error();
      setBioHint(await bioLoginHint());
      openSheet('in');
      setError(authMessage(e));
    } finally {
      setBusy(false);
    }
  };

  /** The web's checks (AuthPage validateForm). */
  const validate = (up: boolean): Errors => {
    const next: Errors = {};
    const em = email.trim();
    if (up && !name.trim()) next.name = 'Enter your name';
    const byUsername = !up && em && !em.includes('@');
    if (!em) next.email = up ? 'Enter your email' : 'Enter your email or username';
    else if (byUsername && !USERNAME_RE.test(em)) next.email = 'Usernames are 3 to 24 letters, numbers, dots or underscores';
    else if (!byUsername && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) next.email = 'Enter a valid email';
    if (!password.trim()) next.password = 'Enter your password';
    else if (password.length < 6) next.password = 'Use at least 6 characters';
    if (up && !confirm) next.confirm = 'Confirm your password';
    else if (up && confirm !== password) next.confirm = 'Passwords do not match';
    return next;
  };

  const submit = async (close: () => void) => {
    Keyboard.dismiss(); // the keyboard goes away as soon as Sign in / Create account is tapped
    const up = sheet === 'up';
    setError(null); setNotice(null);
    const next = validate(up);
    setErrors(next);
    if (Object.keys(next).length) { haptic.error(); return; }
    setBusy(true);
    try {
      if (up) {
        const { needsConfirmation } = await signUp(name, email, password);
        haptic.success();
        if (needsConfirmation) {
          close();
          setNotice({ title: 'Account created', text: 'Check your email to confirm it, then sign in.' });
        }
      } else {
        await signIn(email, password);
        haptic.success();
      }
    } catch (e) {
      haptic.error();
      setError(authMessage(e));
    } finally {
      setBusy(false);
    }
  };

  // ── Swipe up: the landing follows the finger, then hands over. ──
  const drag = useSharedValue(0);
  const nudge = useSharedValue(0);
  useEffect(() => {
    nudge.set(withRepeat(withSequence(withTiming(1, { duration: 900, easing: Easing.inOut(Easing.sin) }), withTiming(0, { duration: 900, easing: Easing.inOut(Easing.sin) })), -1, false));
  }, [nudge]);
  const pan = usePanGesture({
    activeOffsetY: [-12, 12],
    onUpdate: (e) => { 'worklet'; drag.set(Math.min(0, e.translationY)); },
    onDeactivate: (e) => {
      'worklet';
      const go = e.translationY < -SWIPE || e.velocityY < -700;
      drag.set(withTiming(0, { duration: 320, easing: Easing.bezier(0.2, 0, 0, 1) }));
      if (go) scheduleOnRN(unlock);
    },
  });
  const content = useAnimatedStyle(() => ({
    transform: [{ translateY: drag.get() * 0.6 }],
    opacity: interpolate(drag.get(), [-220, 0], [0.2, 1], Extrapolation.CLAMP),
  }));
  const arrow = useAnimatedStyle(() => ({ transform: [{ translateY: -8 * nudge.get() }], opacity: 0.55 + 0.45 * nudge.get() }));

  const sensorBottom = Math.round(Dimensions.get('screen').height * SENSOR_FROM_BOTTOM);
  const up = sheet === 'up';

  return (
    <View style={styles.root}>
      <BlurTargetView ref={target} style={StyleSheet.absoluteFill}>
        <Image source={bg} style={StyleSheet.absoluteFill} contentFit="cover" transition={500} onLoad={() => setBgReady(true)} accessibilityIgnoresInvertColors />
        <LinearGradient colors={['rgba(0,0,0,0.35)', 'rgba(0,0,0,0)', 'rgba(0,0,0,0.05)', 'rgba(0,0,0,0.55)']} locations={[0, 0.3, 0.6, 1]} style={StyleSheet.absoluteFill} />
      </BlurTargetView>

      <GestureDetector gesture={pan}>
        <Animated.View style={[StyleSheet.absoluteFill, content]}>
          {/* The mark and name, high on the screen like a lock-screen clock. */}
          <Animated.View entering={FadeIn.duration(600)} style={[styles.brand, { top: insets.top + 80 }]}>
            <LogoLoader size={72} loading={busy || !bgReady} />
            <Text style={styles.wordmark}>FINTRAXA</Text>
          </Animated.View>

          {/* Swipe up — and the fingerprint at the S24 Ultra sensor spot when fingerprint sign-in is on. */}
          <Pressable onPress={unlock} accessibilityRole="button" accessibilityLabel={bioHint ? 'Swipe up to sign in with fingerprint' : 'Swipe up to sign in'}
            style={[styles.swipe, { bottom: sensorBottom + (bioHint ? 64 : -12) }]}>
            <Animated.View style={arrow}><ChevronUp size={26} color={INK} strokeWidth={2.2} /></Animated.View>
            <Text style={styles.swipeText}>Swipe up</Text>
          </Pressable>
          {bioHint ? (
            <Pressable onPress={unlock} hitSlop={12} accessibilityRole="button" accessibilityLabel={`Sign in with fingerprint as ${bioHint}`}
              style={[styles.sensor, { bottom: sensorBottom - 30 }]}>
              <FingerprintGlyph size={42} color="rgba(255,255,255,0.9)" />
            </Pressable>
          ) : null}

          <Pressable onPress={() => { haptic.tick(); openSheet('up'); }} hitSlop={10} accessibilityRole="link" style={[styles.create, { bottom: insets.bottom + space.lg }]}>
            <Text style={styles.createText}>Create account</Text>
          </Pressable>
        </Animated.View>
      </GestureDetector>

      {sheet ? (
        <SheetFrame blurTarget={target} intensity={28} scrim={0.15} onClose={() => setSheet(null)} maxHeight={Dimensions.get('window').height * 0.9}
          panelStyle={[styles.panel, { paddingBottom: Math.max(insets.bottom, space.lg) + space.sm }]}
          decor={<LinearGradient colors={['rgba(255,255,255,0.10)', 'rgba(255,255,255,0)']} style={styles.sheen} pointerEvents="none" />}
          handle={<View style={styles.handle} />}>
          {(close) => (
            <Animated.View key={sheet} entering={FadeIn.duration(220)}>
              <Text style={styles.title} accessibilityRole="header">{up ? 'Create account' : 'Sign in'}</Text>
              {error ? (
                <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(150)} style={styles.alert}>
                  <Text style={styles.alertText}>{error}</Text>
                </Animated.View>
              ) : null}
              {up ? (
                <Line value={name} onChangeText={(v) => { setName(v); clear('name'); }} placeholder="Your name" autoComplete="name" textContentType="name"
                  icon={<User size={16} color={INK2} />} error={errors.name} returnKeyType="next" />
              ) : null}
              <Line value={email} onChangeText={(v) => { setEmail(v); clear('email'); }} placeholder={up ? 'Your email' : 'Email or username'}
                autoCapitalize="none" autoCorrect={false} keyboardType="email-address" autoComplete={up ? 'email' : 'username'} textContentType={up ? 'emailAddress' : 'username'}
                icon={<Mail size={16} color={INK2} />} error={errors.email} returnKeyType="next" onSubmitEditing={() => pwRef.current?.focus()} autoFocus={!up} />
              <Line inputRef={pwRef} value={password} onChangeText={(v) => { setPassword(v); clear('password'); }} placeholder={up ? 'Create password' : 'Password'} secure
                autoComplete={up ? 'new-password' : 'current-password'} textContentType={up ? 'newPassword' : 'password'} error={errors.password}
                returnKeyType={up ? 'next' : 'go'} onSubmitEditing={up ? undefined : () => submit(close)} />
              {up ? (
                <Line value={confirm} onChangeText={(v) => { setConfirm(v); clear('confirm'); }} placeholder="Confirm password" secure autoComplete="new-password"
                  error={errors.confirm} returnKeyType="go" onSubmitEditing={() => submit(close)} />
              ) : null}
              <Pressable onPress={() => submit(close)} disabled={busy} accessibilityRole="button"
                style={({ pressed }) => [styles.primary, { opacity: busy ? 0.6 : pressed ? 0.85 : 1 }]}>
                <Text style={styles.primaryText}>{busy ? (up ? 'Creating…' : 'Signing in…') : up ? 'Create account' : 'Sign in'}</Text>
              </Pressable>
            </Animated.View>
          )}
        </SheetFrame>
      ) : null}

      <View style={[styles.noticeWrap, { top: insets.top + space.md }]} pointerEvents="box-none">
        <Notice notice={notice} onClose={() => setNotice(null)} />
      </View>

      {bioSheet ? (
        <GlassSheet blurTarget={target} smoky onClose={() => setBioSheet(false)} maxHeight={0.5}>
          <View style={styles.sheetHead}>
            <View style={styles.sheetIcon}><FingerprintGlyph size={30} color={INK} /></View>
            <Text style={styles.sheetTitle}>{bioOffer ? 'Fingerprint sign-in is off' : 'No fingerprint on this phone'}</Text>
            <Text style={[styles.small, { textAlign: 'center' }]}>
              {bioOffer ? 'Sign in with your password, then turn it on in Me › Security.' : 'Add a fingerprint in your phone’s settings first.'}
            </Text>
          </View>
          <Pressable onPress={() => { setBioSheet(false); openSheet('in'); }} accessibilityRole="button" style={({ pressed }) => [styles.sheetBtn, { opacity: pressed ? 0.8 : 1 }]}>
            <Text style={styles.primaryText}>Sign in with password</Text>
          </Pressable>
        </GlassSheet>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#030604' },
  brand: { position: 'absolute', left: 0, right: 0, alignItems: 'center', gap: 6 },
  wordmark: { color: INK, fontFamily: font.semibold, fontSize: 15, lineHeight: 20, letterSpacing: 6, opacity: 0.92 },
  swipe: { position: 'absolute', left: 0, right: 0, alignItems: 'center', gap: 2 },
  swipeText: { color: INK, fontFamily: font.medium, fontSize: 13, lineHeight: 18, letterSpacing: 0.4, opacity: 0.85 },
  sensor: { position: 'absolute', alignSelf: 'center', width: 60, height: 60, alignItems: 'center', justifyContent: 'center' },
  create: { position: 'absolute', alignSelf: 'center', paddingHorizontal: 12, paddingVertical: 6 },
  createText: { color: INK2, fontFamily: font.medium, fontSize: 12.5, lineHeight: 18, textDecorationLine: 'underline' },
  panel: {
    position: 'absolute', left: 0, right: 0, bottom: 0, borderTopLeftRadius: 28, borderTopRightRadius: 28, overflow: 'hidden',
    paddingHorizontal: space.xl, paddingTop: 10, backgroundColor: 'rgba(8,10,12,0.42)',
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.18)', borderTopColor: 'rgba(255,255,255,0.32)',
  },
  sheen: { position: 'absolute', top: 0, left: 0, right: 0, height: 120 },
  handle: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, marginBottom: space.md, backgroundColor: 'rgba(255,255,255,0.35)' },
  title: { color: INK, fontFamily: font.bold, fontSize: 22, lineHeight: 30, letterSpacing: -0.4, marginBottom: space.sm },
  line: { flexDirection: 'row', alignItems: 'center', gap: 8, borderBottomWidth: 1 },
  input: { flex: 1, color: INK, fontFamily: font.regular, fontSize: 15, lineHeight: 20, paddingVertical: 10 },
  error: { minHeight: 16, color: '#FCA5A5', fontFamily: font.regular, fontSize: 11.5, lineHeight: 16, marginTop: 2 },
  alert: { borderRadius: 12, borderWidth: 1, borderColor: 'rgba(239,68,68,0.3)', backgroundColor: 'rgba(239,68,68,0.14)', padding: space.md, marginBottom: space.md },
  alertText: { color: '#FCA5A5', fontFamily: font.medium, fontSize: 12.5, lineHeight: 17 },
  small: { color: INK2, fontFamily: font.regular, fontSize: 12.5, lineHeight: 18 },
  primary: { height: 50, borderRadius: 25, backgroundColor: INK, alignItems: 'center', justifyContent: 'center', marginTop: space.md },
  primaryText: { color: '#000', fontFamily: font.bold, fontSize: 15, lineHeight: 20 },
  noticeWrap: { position: 'absolute', left: space.lg, right: space.lg },
  notice: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, borderRadius: 16, overflow: 'hidden',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.22)', backgroundColor: 'rgba(20,24,22,0.86)' },
  noticeIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.14)' },
  noticeTitle: { color: INK, fontFamily: font.bold, fontSize: 14, lineHeight: 19 },
  noticeText: { color: 'rgba(255,255,255,0.75)', fontFamily: font.regular, fontSize: 12, lineHeight: 17 },
  sheetHead: { alignItems: 'center', gap: 8, paddingTop: space.sm, paddingBottom: space.xl },
  sheetIcon: { width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)', marginBottom: space.xs },
  sheetTitle: { color: INK, fontFamily: font.bold, fontSize: 18, lineHeight: 24 },
  sheetBtn: { height: 52, borderRadius: 26, backgroundColor: INK, alignItems: 'center', justifyContent: 'center', marginBottom: space.sm },
});
