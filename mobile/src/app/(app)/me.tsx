import { useQueryClient } from '@tanstack/react-query';
import * as Application from 'expo-application';
import { BlurTargetView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useEffect, useRef, useState, type ComponentRef, type ReactNode } from 'react';
import { Linking, Platform, Pressable, ScrollView, StyleSheet, Switch, TextInput, View } from 'react-native';
import { useSavePrefs } from '@/data/mutations';
import { useAvatarUrl, useProfile, useUid } from '@/data/queries';
import { useAvatarUpload, useSaveProfile, validateProfile } from '@/features/me/avatar';
import { designOf } from '@/features/today/cardDesigns';
import { authMessage, firstName, lockNow, signIn, signOut, useAuth } from '@/lib/auth';
import { bioLoginHint, clearBioLogin, saveBioLogin } from '@/lib/bioLogin';
import { appVersion, env, isExpoGo } from '@/lib/env';
import { haptic } from '@/lib/haptics';
import { afterRefresh, describe, refreshMyPrices } from '@/lib/refreshPrices';
import { useApp, useTracks, type Material, type Tracks } from '@/lib/store';
import { biometricsAvailable, disableBiometricKey, enableBiometricKey } from '@/lib/vault';
import { BlackGlass, GLASS_INK, GLASS_INK2, GLASS_LINE } from '@/ui/BlackGlass';
import { toast } from '@/ui/feedback';
import { Field } from '@/ui/Field';
import { GlassSheet } from '@/ui/GlassSheet';
import { GlassSlider } from '@/ui/GlassSlider';
import { GlassToggle } from '@/ui/GlassToggle';
import {
  Activity, AppWindow, Camera, Check, ChevronRight, KeyRound, EyeOff, Fingerprint, Globe, Landmark, LineChart, Lock, LogOut, PiggyBank, Plus, RefreshCw, Timer, Vibrate, Wallet, type LucideIcon,
} from '@/ui/icons';
import { Avatar } from '@/ui/Logos';
import { Button, Gap } from '@/ui/primitives';
import { Screen } from '@/ui/Screen';
import { Text } from '@/ui/Text';
import { useTheme } from '@/ui/theme';
import { ACCENT_KEYS, ACCENTS, accentOf, accentOnDarkText, dark, font, isHex, space } from '@/ui/tokens';

/** Metallic accents get a light sweep on their swatch so they read as metal. */
const METALLIC = new Set(['gold', 'champagne', 'silver', 'platinum', 'titanium', 'rosegold', 'bronze']);
const LOCK_OPTIONS = [{ v: 0, label: 'Immediately' }, { v: 1, label: '1 minute' }, { v: 5, label: '5 minutes' }, { v: 15, label: '15 minutes' }];
/** A wider palette for the custom colour (owner: "custom colour"), plus any hex. */
const PALETTE = ['#FF5F6D', '#FF9F43', '#FECA57', '#C8D84A', '#1DD1A1', '#00D2D3', '#54A0FF', '#5F7BFF', '#8854D0', '#C56CF0', '#F368E0', '#FF9FF3',
  '#E17055', '#B8E994', '#82CCDD', '#DFE6E9'];

/** One settings row on black glass: icon · title · value / switch / chevron. Light text in both themes. */
function Row({ icon: Icon, title, value, toggle, onToggle, onPress, disabled, first }: {
  icon: LucideIcon; title: string; value?: string; toggle?: boolean; onToggle?: (v: boolean) => void; onPress?: () => void; disabled?: boolean; first?: boolean;
}) {
  const p = useTheme();
  const isSwitch = toggle !== undefined;
  return (
    <Pressable onPress={() => { if (disabled) return; if (isSwitch) { haptic.tick(); onToggle?.(!toggle); } else onPress?.(); }}
      disabled={disabled || (!isSwitch && !onPress)} accessibilityRole={isSwitch ? 'switch' : 'button'} accessibilityState={{ checked: isSwitch ? !!toggle : undefined, disabled: !!disabled }}
      accessibilityLabel={title} style={({ pressed }) => [styles.row, !first && styles.rowSep, { opacity: disabled ? 0.45 : pressed ? 0.8 : 1 }]}>
      <View style={styles.rowIcon}><Icon size={17} color={GLASS_INK} /></View>
      <Text style={styles.rowTitle} numberOfLines={1}>{title}</Text>
      {value ? <Text style={styles.rowValue}>{value}</Text> : null}
      {isSwitch ? (
        <Switch value={!!toggle} onValueChange={(v) => { haptic.tick(); onToggle?.(v); }} disabled={disabled}
          trackColor={{ false: 'rgba(255,255,255,0.16)', true: p.accentOnDark }} thumbColor={toggle ? p.accentOnDarkInk : '#C9CCC8'} />
      ) : onPress ? <ChevronRight size={17} color={GLASS_INK2} /> : null}
    </Pressable>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <>
      <Text variant="label" tone="ink2" style={styles.section}>{title}</Text>
      <BlackGlass style={{ paddingVertical: 2 }}>{children}</BlackGlass>
    </>
  );
}

/**
 * Me (owner, 2026-11-14 redesign): compact, black Apple glass, only the options that matter — appearance (theme,
 * accent incl. a custom colour, style), what you track, security, a few switches, and sign out. Sheets are glass.
 */
export default function Me() {
  const p = useTheme();
  const qc = useQueryClient();
  const uid = useUid();
  const user = useAuth((s) => s.user);
  const profile = useProfile();
  const tracks = useTracks(uid);
  const app = useApp();
  const savePrefs = useSavePrefs();
  const [bioOk, setBioOk] = useState(false);
  const [sheet, setSheet] = useState<'lock' | 'signout' | 'custom' | 'refresh' | 'profile' | 'biologin' | null>(null);
  const avatar = useAvatarUrl(profile.data?.avatar_path);
  const upload = useAvatarUpload();
  const saveProfile = useSaveProfile();
  const [form, setForm] = useState({ full_name: '', username: '', filer_status: 'filer' as 'filer' | 'non_filer' });
  const formError = validateProfile(form);
  const openProfile = () => {
    setForm({ full_name: profile.data?.full_name ?? '', username: profile.data?.username ?? '', filer_status: profile.data?.filer_status === 'non_filer' ? 'non_filer' : 'filer' });
    setSheet('profile');
  };
  const [hex, setHex] = useState(app.customAccent);
  // Fingerprint sign-in (the button on the sign-in screen): turning it on asks for the password once.
  const [bioLogin, setBioLogin] = useState(false);
  const [bioPw, setBioPw] = useState('');
  const [bioErr, setBioErr] = useState<string | null>(null);
  const [bioBusy, setBioBusy] = useState(false);
  const toggleBioLogin = async (on: boolean) => {
    if (on) { setBioPw(''); setBioErr(null); setSheet('biologin'); return; }
    await clearBioLogin();
    setBioLogin(false);
    toast('Fingerprint sign-in is off', { tone: 'info' });
  };
  const confirmBioLogin = async () => {
    const email = user?.email;
    if (!email || !bioPw) return;
    setBioBusy(true);
    setBioErr(null);
    try {
      await signIn(email, bioPw); // proves the password (same account)
      const ok = await saveBioLogin(email, bioPw);
      if (ok) { haptic.success(); setBioLogin(true); setSheet(null); toast('Fingerprint sign-in is on'); }
      else setBioErr('It wasn’t turned on. Try again.');
    } catch (e) {
      haptic.error();
      setBioErr(authMessage(e));
    } finally {
      setBioBusy(false);
    }
  };
  // What was typed, with or without the '#' (no rewriting while typing — that broke the Android keyboard).
  const hexN = `#${hex.trim().replace(/^#/, '')}`.toUpperCase();
  const [refresh, setRefresh] = useState<{ running: boolean; lines: string[]; error?: string }>({ running: false, lines: [] });
  const abort = useRef<AbortController | null>(null);
  const target = useRef<ComponentRef<typeof View>>(null);

  useEffect(() => { biometricsAvailable().then(setBioOk); bioLoginHint().then((h) => setBioLogin(!!h)); }, []);

  const name = profile.data?.full_name || firstName(user) || 'You';
  const setTrack = (k: keyof Tracks, v: boolean) => {
    const next = { ...tracks, [k]: v };
    if (!next.spending && !next.funds && !next.stocks) { toast('Keep at least one thing to track.', { tone: 'warning' }); return; }
    if (uid) app.setTracks(uid, next);
    savePrefs.mutate({ tracks: next });
  };
  const toggleBiometric = async (on: boolean) => {
    if (on) {
      const ok = await enableBiometricKey();
      if (ok) { app.set({ biometricEnabled: true, biometricUser: uid ?? null }); haptic.success(); toast('Fingerprint unlock is on'); } else toast('Fingerprint unlock wasn’t turned on.', { tone: 'warning' });
    } else {
      await disableBiometricKey();
      app.set({ biometricEnabled: false, biometricUser: null });
      toast('Fingerprint unlock is off', { tone: 'info' });
    }
  };
  const runRefresh = async () => {
    abort.current = new AbortController();
    setSheet('refresh');
    setRefresh({ running: true, lines: [] });
    try {
      const last = await refreshMyPrices((e) => { const line = describe(e); if (line) setRefresh((s) => ({ ...s, lines: [...s.lines, line] })); }, abort.current.signal);
      if (last?.type === 'done') { haptic.success(); await afterRefresh(qc); }
      if (last?.type === 'error' || last?.type === 'busy') setRefresh((s) => ({ ...s, error: last.message }));
    } catch (e) {
      setRefresh((s) => ({ ...s, error: String((e as Error).message) }));
    } finally {
      setRefresh((s) => ({ ...s, running: false }));
    }
  };

  const card = designOf(app.cardDesign);
  const accentName = app.accent === 'custom' ? 'Custom' : ACCENTS[app.accent]?.name ?? 'Lime';
  const lockLabel = LOCK_OPTIONS.find((o) => o.v === app.autoLockMinutes)?.label ?? `${app.autoLockMinutes} min`;
  const swatchFill = (k: (typeof ACCENT_KEYS)[number]) => (p.mode === 'light' ? ACCENTS[k].lightFill ?? ACCENTS[k].fill : ACCENTS[k].fill);

  return (
    <View style={[styles.root, { backgroundColor: p.bg }]}>
      <BlurTargetView ref={target} style={[styles.root, { backgroundColor: p.bg }]}>
        <Screen back title="Me">
          <BlackGlass style={styles.profile} onPress={openProfile} accessibilityLabel="Edit profile">
            <Pressable onPress={() => upload.mutate()} disabled={upload.isPending} accessibilityRole="button" accessibilityLabel="Change profile photo" hitSlop={6}>
              <Avatar uri={avatar.data} name={name} size={60} />
              <View style={[styles.camera, { backgroundColor: p.accentOnDark }]}><Camera size={12} color={p.accentOnDarkInk} strokeWidth={2.4} /></View>
            </Pressable>
            <View style={{ flex: 1 }}>
              <Text style={styles.name} numberOfLines={1}>{name}</Text>
              <Text style={styles.small} numberOfLines={1}>{profile.data?.username ? `@${profile.data.username}` : user?.email}</Text>
            </View>
            <View style={styles.editChip}><Text style={styles.matchText}>Edit</Text></View>
          </BlackGlass>

          <Section title="Appearance">
            <View style={styles.lineCol}>
              <View style={styles.accentHead}>
                <Text style={styles.rowTitle}>Accent · <Text style={{ color: accentOnDarkText(p) }}>{accentName}</Text></Text>
                {card.accent !== app.accent ? (
                  <Pressable onPress={() => { haptic.tick(); app.set({ accent: card.accent }); }} accessibilityRole="button" accessibilityLabel={`Match your ${card.name} card`} style={styles.matchChip}>
                    <View style={[styles.matchDot, { backgroundColor: ACCENTS[card.accent].fill }]} />
                    <Text style={styles.matchText}>Match card</Text>
                  </Pressable>
                ) : null}
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.swatches} accessibilityRole="radiogroup" accessibilityLabel="Accent colour">
                {ACCENT_KEYS.map((k) => {
                  const on = k === app.accent;
                  return (
                    <Pressable key={k} onPress={() => { if (!on) { haptic.tick(); app.set({ accent: k }); } }} accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel={ACCENTS[k].name}
                      style={[styles.swatchRing, { borderColor: on ? swatchFill(k) : 'transparent' }]}>
                      <View style={[styles.swatch, { backgroundColor: swatchFill(k) }]}>
                        {METALLIC.has(k) ? <LinearGradient colors={['rgba(255,255,255,0.65)', 'rgba(255,255,255,0)', 'rgba(0,0,0,0.25)']} locations={[0, 0.5, 1]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[StyleSheet.absoluteFill, { borderRadius: 17 }]} /> : null}
                        {on ? <Check size={15} color={p.mode === 'light' ? ACCENTS[k].lightInk ?? ACCENTS[k].ink : ACCENTS[k].ink} strokeWidth={3} /> : null}
                      </View>
                    </Pressable>
                  );
                })}
                <Pressable onPress={() => { haptic.tick(); setHex(app.customAccent); setSheet('custom'); }} accessibilityRole="radio" accessibilityState={{ checked: app.accent === 'custom' }}
                  accessibilityLabel="Custom colour" style={[styles.swatchRing, { borderColor: app.accent === 'custom' ? app.customAccent : 'transparent' }]}>
                  {app.accent === 'custom' ? (
                    <View style={[styles.swatch, { backgroundColor: app.customAccent }]}><Check size={15} color={accentOf('custom', app.customAccent).ink} strokeWidth={3} /></View>
                  ) : (
                    <View style={[styles.swatch, { overflow: 'hidden' }]}>
                      <LinearGradient colors={['#FF5F6D', '#FECA57', '#1DD1A1', '#54A0FF', '#C56CF0']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
                      <Plus size={16} color="#FFFFFF" strokeWidth={2.6} />
                    </View>
                  )}
                </Pressable>
              </ScrollView>
            </View>
            <View style={[styles.line, styles.rowSep, app.material !== 'glass' && { paddingBottom: space.md }]}>
              <Text style={styles.rowTitle}>Style</Text>
              <GlassToggle<Material> value={app.material} onChange={(v) => app.set({ material: v })} accessibilityLabel="Surface style"
                options={[{ value: 'solid', label: 'Solid' }, { value: 'glass', label: 'Glass' }]} />
            </View>
            {app.material === 'glass' ? (
              <View style={[styles.lineCol, styles.rowSep]}>
                <View style={styles.accentHead}>
                  <Text style={styles.rowTitle}>Transparency</Text>
                  <Text style={styles.rowValue}>{app.glassClear <= 0.2 ? 'Frosted' : app.glassClear >= 0.8 ? 'Clear' : `${Math.round(app.glassClear * 100)}%`}</Text>
                </View>
                <GlassSlider value={app.glassClear} onChange={(v) => app.set({ glassClear: v })} accessibilityLabel="Glass transparency" />
              </View>
            ) : null}
          </Section>

          <Section title="Track">
            <Row first icon={Wallet} title="Spending" toggle={tracks.spending} onToggle={(v) => setTrack('spending', v)} />
            <Row icon={LineChart} title="Mutual funds" toggle={tracks.funds} onToggle={(v) => setTrack('funds', v)} />
            <Row icon={Landmark} title="PSX shares" toggle={tracks.stocks} onToggle={(v) => setTrack('stocks', v)} />
          </Section>

          <Section title="Savings">
            <Row first icon={PiggyBank} title="Savings accounts" onPress={() => { haptic.tick(); router.push('/savings-accounts'); }} />
          </Section>

          <Section title="Security">
            <Row first icon={Fingerprint} title="Fingerprint unlock" toggle={app.biometricEnabled} onToggle={toggleBiometric} disabled={!bioOk} />
            {Platform.OS === 'web' ? null : <Row icon={KeyRound} title="Fingerprint sign-in" toggle={bioLogin} onToggle={toggleBioLogin} disabled={!bioOk} />}
            <Row icon={Timer} title="Auto-lock" value={lockLabel} onPress={() => setSheet('lock')} />
            <Row icon={AppWindow} title="Hide in recent apps" toggle={app.hideInRecents} onToggle={(v) => app.set({ hideInRecents: v })} />
            {app.biometricEnabled ? <Row icon={Lock} title="Lock now" onPress={() => { haptic.light(); lockNow(); }} /> : null}
          </Section>

          <Section title="More">
            <Row first icon={EyeOff} title="Hide amounts" toggle={app.hideAmounts} onToggle={(v) => app.set({ hideAmounts: v })} />
            <Row icon={Vibrate} title="Haptics" toggle={app.haptics} onToggle={(v) => app.set({ haptics: v })} />
            <Row icon={RefreshCw} title="Refresh my prices" onPress={runRefresh} />
            <Row icon={Globe} title="Open on the web" onPress={() => Linking.openURL(`${env.webApp}/home`)} />
            <Row icon={Activity} title="Version" value={`${appVersion}${!isExpoGo && Application.nativeBuildVersion ? ` (${Application.nativeBuildVersion})` : isExpoGo ? ' · Expo Go' : ''}`} />
          </Section>

          <Gap h={space.lg} />
          <Button label="Sign out" kind="secondary" icon={LogOut} onPress={() => setSheet('signout')} />
        </Screen>
      </BlurTargetView>

      {sheet === 'profile' ? (
        <GlassSheet blurTarget={target} smoky title="Profile" onClose={() => setSheet(null)} maxHeight={0.85}>
          <Pressable onPress={() => upload.mutate()} disabled={upload.isPending} accessibilityRole="button" accessibilityLabel="Change profile photo" style={styles.sheetAvatar}>
            <Avatar uri={avatar.data} name={form.full_name || name} size={84} />
            <Text variant="label" style={{ color: accentOnDarkText(p) }}>{upload.isPending ? 'Uploading…' : 'Change photo'}</Text>
          </Pressable>
          <View style={{ gap: space.md }}>
            <Field label="Name" defaultValue={form.full_name} onChangeText={(v) => setForm((f) => ({ ...f, full_name: v }))} autoCapitalize="words" maxLength={80} />
            <Field label="Username" defaultValue={form.username} onChangeText={(v) => setForm((f) => ({ ...f, username: v }))} autoCapitalize="none" autoCorrect={false}
              autoComplete="off" keyboardType="visible-password"
              maxLength={24} error={form.username && formError?.startsWith('Username') ? formError : null} />
            <View style={styles.line}>
              <Text variant="bodyStrong" style={{ flex: 1 }}>Tax status</Text>
              <GlassToggle<'filer' | 'non_filer'> value={form.filer_status} onChange={(v) => setForm((f) => ({ ...f, filer_status: v }))} accessibilityLabel="Tax status"
                options={[{ value: 'filer', label: 'Filer' }, { value: 'non_filer', label: 'Non-filer' }]} />
            </View>
            <Text variant="caption" tone="muted">{user?.email}</Text>
          </View>
          <Gap h={space.lg} />
          <Button label={saveProfile.isPending ? 'Saving…' : 'Save'} loading={saveProfile.isPending} disabled={!!formError}
            onPress={() => saveProfile.mutate({ full_name: form.full_name, username: form.username || null, filer_status: form.filer_status }, { onSuccess: () => setSheet(null) })} />
          <Gap h={space.sm} />
        </GlassSheet>
      ) : null}

      {sheet === 'biologin' ? (
        <GlassSheet blurTarget={target} smoky onClose={() => setSheet(null)} maxHeight={0.7}>
          <View style={styles.outHead}>
            <View style={styles.outIcon}><Fingerprint size={24} color={GLASS_INK} strokeWidth={1.8} /></View>
            <Text style={styles.outTitle}>Fingerprint sign-in</Text>
            <Text style={styles.small}>Enter your password once.</Text>
          </View>
          <Gap h={space.lg} />
          <Field label="Password" value={bioPw} onChangeText={setBioPw} secure autoFocus error={bioErr} returnKeyType="go" onSubmitEditing={confirmBioLogin} />
          <View style={styles.sheetActions}>
            <Pressable onPress={() => setSheet(null)} accessibilityRole="button" style={({ pressed }) => [styles.glassBtn, { opacity: pressed ? 0.75 : 1 }]}>
              <Text style={styles.glassBtnText}>Cancel</Text>
            </Pressable>
            <Pressable onPress={confirmBioLogin} disabled={!bioPw || bioBusy} accessibilityRole="button"
              style={({ pressed }) => [styles.glassBtn, { backgroundColor: '#FFFFFF', opacity: !bioPw || bioBusy ? 0.5 : pressed ? 0.85 : 1 }]}>
              <Text style={[styles.glassBtnText, { color: '#000' }]}>{bioBusy ? 'Checking…' : 'Turn on'}</Text>
            </Pressable>
          </View>
        </GlassSheet>
      ) : null}

      {sheet === 'lock' ? (
        <GlassSheet blurTarget={target} smoky title="Auto-lock" onClose={() => setSheet(null)} maxHeight={0.6}>
          {LOCK_OPTIONS.map((o, i) => (
            <Pressable key={o.v} onPress={() => { app.set({ autoLockMinutes: o.v }); savePrefs.mutate({ auto_lock_minutes: o.v }); setSheet(null); }} accessibilityRole="radio"
              accessibilityState={{ checked: o.v === app.autoLockMinutes }} style={[styles.option, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: GLASS_LINE }]}>
              <Text variant="body" style={{ flex: 1 }}>{o.label}</Text>
              {o.v === app.autoLockMinutes ? <Check size={18} color={p.mode === 'dark' ? p.accent : p.accentDeep} strokeWidth={2.6} /> : null}
            </Pressable>
          ))}
        </GlassSheet>
      ) : null}

      {sheet === 'signout' ? (
        <GlassSheet blurTarget={target} smoky onClose={() => setSheet(null)} maxHeight={0.5}>
          {/* Minimal Apple-glass confirm (owner, 2026-11-15): no tinted block — only the Sign out word is red. */}
          <View style={styles.outHead}>
            <View style={styles.outIcon}><LogOut size={22} color={GLASS_INK} strokeWidth={1.9} /></View>
            <Text style={styles.outTitle}>Sign out?</Text>
            <Text style={styles.small}>Your data stays on this phone for next time.</Text>
          </View>
          <View style={styles.sheetActions}>
            <Pressable onPress={() => setSheet(null)} accessibilityRole="button" style={({ pressed }) => [styles.glassBtn, { opacity: pressed ? 0.75 : 1 }]}>
              <Text style={styles.glassBtnText}>Cancel</Text>
            </Pressable>
            <Pressable onPress={async () => { haptic.light(); setSheet(null); await signOut(); router.replace('/welcome'); }} accessibilityRole="button"
              style={({ pressed }) => [styles.glassBtn, { opacity: pressed ? 0.75 : 1 }]}>
              <Text style={[styles.glassBtnText, { color: dark.neg }]}>Sign out</Text>
            </Pressable>
          </View>
        </GlassSheet>
      ) : null}

      {sheet === 'custom' ? (
        <GlassSheet blurTarget={target} smoky title="Custom colour" onClose={() => setSheet(null)} maxHeight={0.75}>
          <View style={styles.customHead}>
            <View style={[styles.preview, { backgroundColor: isHex(hexN) ? hexN : '#7C9CFF' }]}>
              <Text style={{ color: accentOf('custom', isHex(hexN) ? hexN : null).ink, fontFamily: font.semibold }}>Aa</Text>
            </View>
            <TextInput value={hex} onChangeText={setHex} maxLength={7} autoCapitalize="none" autoCorrect={false} autoComplete="off" keyboardType="visible-password"
              placeholder="#RRGGBB" placeholderTextColor={p.muted} style={[styles.hexInput, { color: p.ink, borderColor: p.border }]} accessibilityLabel="Colour code" />
          </View>
          <View style={styles.palette}>
            {PALETTE.map((c) => (
              <Pressable key={c} onPress={() => { haptic.tick(); setHex(c); }} accessibilityRole="button" accessibilityLabel={c}
                style={[styles.paletteRing, { borderColor: hexN === c ? c : 'transparent' }]}>
                <View style={[styles.paletteDot, { backgroundColor: c }]} />
              </Pressable>
            ))}
          </View>
          <Button label="Use this colour" disabled={!isHex(hexN)} onPress={() => { haptic.success(); app.set({ customAccent: hexN, accent: 'custom' }); setSheet(null); }} />
        </GlassSheet>
      ) : null}

      {sheet === 'refresh' ? (
        <GlassSheet blurTarget={target} smoky title="Refreshing prices" onClose={() => { abort.current?.abort(); setSheet(null); }} maxHeight={0.6}>
          {refresh.lines.map((l, i) => <Text key={i} variant="body" tone={i === refresh.lines.length - 1 && !refresh.running ? 'ink' : 'ink2'} style={{ paddingVertical: 3 }}>• {l}</Text>)}
          {refresh.running ? <Text variant="caption" tone="muted" style={{ marginTop: space.sm }}>Up to a minute…</Text> : null}
          {refresh.error ? <Text variant="body" tone="neg" style={{ marginTop: space.sm }}>{refresh.error}</Text> : null}
          <Gap h={space.lg} />
          <Button label={refresh.running ? 'Running…' : 'Done'} kind="secondary" disabled={refresh.running} onPress={() => setSheet(null)} />
        </GlassSheet>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  profile: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.lg },
  camera: { position: 'absolute', right: -2, bottom: -2, width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#000' },
  editChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.08)' },
  sheetAvatar: { alignItems: 'center', gap: space.sm, marginBottom: space.lg },
  name: { color: GLASS_INK, fontFamily: font.bold, fontSize: 17 },
  small: { color: GLASS_INK2, fontFamily: font.regular, fontSize: 12 },
  section: { marginTop: space.xl, marginBottom: space.sm, marginLeft: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 54 },
  rowSep: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: GLASS_LINE },
  rowIcon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.08)' },
  rowTitle: { flex: 1, color: GLASS_INK, fontFamily: font.medium, fontSize: 14.5 },
  rowValue: { color: GLASS_INK2, fontFamily: font.medium, fontSize: 13 },
  line: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 58 },
  lineCol: { paddingVertical: space.md, gap: space.sm },
  accentHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  matchChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.08)' },
  matchDot: { width: 10, height: 10, borderRadius: 5 },
  matchText: { color: GLASS_INK, fontFamily: font.semibold, fontSize: 11.5 },
  swatches: { gap: 6, paddingVertical: 2 },
  swatchRing: { padding: 2, borderRadius: 22, borderWidth: 2 },
  swatch: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  option: { flexDirection: 'row', alignItems: 'center', minHeight: 52 },
  sheetActions: { flexDirection: 'row', gap: space.sm, marginTop: space.xl, marginBottom: space.sm },
  outHead: { alignItems: 'center', gap: 6, paddingTop: space.sm },
  outIcon: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', marginBottom: space.xs },
  outTitle: { color: GLASS_INK, fontFamily: font.bold, fontSize: 19 },
  glassBtn: { flex: 1, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.07)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)' },
  glassBtnText: { color: GLASS_INK, fontFamily: font.semibold, fontSize: 15.5 },
  customHead: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  preview: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  hexInput: { flex: 1, height: 48, borderRadius: 14, borderWidth: 1, paddingHorizontal: 14, fontFamily: font.num, fontSize: 17, letterSpacing: 1 },
  palette: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: space.lg },
  paletteRing: { padding: 2, borderRadius: 20, borderWidth: 2 },
  paletteDot: { width: 32, height: 32, borderRadius: 16 },
});
