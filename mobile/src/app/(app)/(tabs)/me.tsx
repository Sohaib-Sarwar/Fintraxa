import { useQueryClient } from '@tanstack/react-query';
import * as Application from 'expo-application';
import { router } from 'expo-router';
import {
  Activity, AppWindow, EyeOff, Fingerprint, Globe, Lock, LogOut, RefreshCw, ShieldCheck, Timer, Vibrate, Wallet, LineChart, Landmark,
} from '@/ui/icons';
import { useEffect, useRef, useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { useSavePrefs } from '@/data/mutations';
import { useProfile, useUid } from '@/data/queries';
import { firstName, lockNow, signOut, useAuth } from '@/lib/auth';
import { appVersion, env, isExpoGo } from '@/lib/env';
import { haptic } from '@/lib/haptics';
import { afterRefresh, describe, refreshMyPrices } from '@/lib/refreshPrices';
import { useApp, useTracks, type ThemePref, type Tracks } from '@/lib/store';
import { biometricMode, biometricsAvailable, disableBiometricKey, enableBiometricKey } from '@/lib/vault';
import { toast } from '@/ui/feedback';
import { Button, Card, Divider, Gap, SectionHeader } from '@/ui/primitives';
import { Screen } from '@/ui/Screen';
import { Segmented } from '@/ui/Segmented';
import { SettingRow } from '@/ui/SettingRow';
import { Sheet } from '@/ui/Sheet';
import { Text } from '@/ui/Text';
import { useTheme } from '@/ui/theme';
import { space } from '@/ui/tokens';

const LOCK_OPTIONS = [{ v: 0, label: 'Immediately' }, { v: 1, label: 'After 1 minute' }, { v: 5, label: 'After 5 minutes' }, { v: 15, label: 'After 15 minutes' }];

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
  const [lockSheet, setLockSheet] = useState(false);
  const [signOutSheet, setSignOutSheet] = useState(false);
  const [refresh, setRefresh] = useState<{ open: boolean; running: boolean; lines: string[]; error?: string }>({ open: false, running: false, lines: [] });
  const abort = useRef<AbortController | null>(null);

  useEffect(() => { biometricsAvailable().then(setBioOk); }, []);

  const name = profile.data?.full_name || firstName(user) || 'You';
  const setTrack = (k: keyof Tracks, v: boolean) => {
    const next = { ...tracks, [k]: v };
    if (!next.spending && !next.funds && !next.stocks) { toast('Keep at least one thing to track.'); return; }
    if (uid) app.setTracks(uid, next);
    savePrefs.mutate({ tracks: next });
  };

  const toggleBiometric = async (on: boolean) => {
    if (on) {
      const ok = await enableBiometricKey();
      if (ok) { app.set({ biometricEnabled: true, biometricUser: uid ?? null }); haptic.success(); toast('Fingerprint unlock is on'); } else toast('Fingerprint unlock wasn’t turned on.');
    } else {
      await disableBiometricKey();
      app.set({ biometricEnabled: false, biometricUser: null });
      toast('Fingerprint unlock is off');
    }
  };

  const setAutoLock = (v: number) => {
    app.set({ autoLockMinutes: v });
    savePrefs.mutate({ auto_lock_minutes: v });
    setLockSheet(false);
  };

  const runRefresh = async () => {
    abort.current = new AbortController();
    setRefresh({ open: true, running: true, lines: [] });
    try {
      const last = await refreshMyPrices((e) => {
        const line = describe(e);
        if (line) setRefresh((s) => ({ ...s, lines: [...s.lines, line] }));
      }, abort.current.signal);
      if (last?.type === 'done') { haptic.success(); await afterRefresh(qc); }
      if (last?.type === 'error' || last?.type === 'busy') setRefresh((s) => ({ ...s, error: last.message }));
    } catch (e) {
      setRefresh((s) => ({ ...s, error: String((e as Error).message) }));
    } finally {
      setRefresh((s) => ({ ...s, running: false }));
    }
  };

  const lockLabel = LOCK_OPTIONS.find((o) => o.v === app.autoLockMinutes)?.label ?? `After ${app.autoLockMinutes} minutes`;
  return (
    <Screen title="Me" tabBar>
      <Card style={styles.profile}>
        <View style={[styles.avatar, { backgroundColor: p.accent }]}><Text variant="title" style={{ color: p.accentInk }}>{name.slice(0, 1).toUpperCase()}</Text></View>
        <View style={{ flex: 1 }}>
          <Text variant="headline" numberOfLines={1}>{name}</Text>
          <Text variant="caption" tone="ink2" numberOfLines={1}>{profile.data?.username ? `@${profile.data.username} · ` : ''}{user?.email}</Text>
        </View>
      </Card>

      <SectionHeader title="What you track" />
      <Card padded={false} style={styles.group}>
        <SettingRow icon={Wallet} title="Spending" subtitle="Income, expenses and savings" toggle={tracks.spending} onToggle={(v) => setTrack('spending', v)} />
        <Divider inset={46} />
        <SettingRow icon={LineChart} title="Mutual funds" toggle={tracks.funds} onToggle={(v) => setTrack('funds', v)} />
        <Divider inset={46} />
        <SettingRow icon={Landmark} title="PSX shares" toggle={tracks.stocks} onToggle={(v) => setTrack('stocks', v)} />
      </Card>

      <SectionHeader title="Security" />
      <Card padded={false} style={styles.group}>
        <SettingRow icon={Fingerprint} title="Unlock with fingerprint"
          subtitle={!bioOk ? 'Add a fingerprint in your phone’s settings first' : biometricMode === 'gate' ? 'In Expo Go the fingerprint guards the app; installed builds also lock the key to it' : 'Your session key is locked to your fingerprint'}
          toggle={app.biometricEnabled} onToggle={toggleBiometric} disabled={!bioOk} />
        <Divider inset={46} />
        <SettingRow icon={Timer} title="Auto-lock" value={lockLabel} onPress={() => setLockSheet(true)} disabled={!app.biometricEnabled} />
        <Divider inset={46} />
        <SettingRow icon={AppWindow} title="Hide content in recent apps" subtitle="Also blocks screenshots of Fintraxa" toggle={app.hideInRecents} onToggle={(v) => app.set({ hideInRecents: v })} />
        {app.biometricEnabled ? (
          <>
            <Divider inset={46} />
            <SettingRow icon={Lock} title="Lock now" onPress={() => { haptic.light(); lockNow(); }} />
          </>
        ) : null}
      </Card>

      <SectionHeader title="Display" />
      <Card style={{ gap: space.md }}>
        <Text variant="label" tone="ink2">Theme</Text>
        <Segmented<ThemePref> options={[{ value: 'system', label: 'System' }, { value: 'dark', label: 'Dark' }, { value: 'light', label: 'Light' }]}
          value={app.themePref} onChange={(v) => app.set({ themePref: v })} accessibilityLabel="Theme" />
      </Card>
      <Gap h={space.md} />
      <Card padded={false} style={styles.group}>
        <SettingRow icon={EyeOff} title="Hide amounts" subtitle="Or tap the eye next to any big number" toggle={app.hideAmounts} onToggle={(v) => app.set({ hideAmounts: v })} />
        <Divider inset={46} />
        <SettingRow icon={Vibrate} title="Haptic feedback" toggle={app.haptics} onToggle={(v) => app.set({ haptics: v })} />
      </Card>

      <SectionHeader title="Market data" />
      <Card padded={false} style={styles.group}>
        <SettingRow icon={RefreshCw} title="Refresh my prices" subtitle="Fetch the latest prices for what you hold, now" onPress={runRefresh} />
      </Card>

      <SectionHeader title="About" />
      <Card padded={false} style={styles.group}>
        <SettingRow icon={Activity} title="Version" value={`${appVersion}${!isExpoGo && Application.nativeBuildVersion ? ` (${Application.nativeBuildVersion})` : isExpoGo ? ' · Expo Go' : ''}`} />
        <Divider inset={46} />
        <SettingRow icon={Globe} title="Open Fintraxa on the web" subtitle="Imports, research and reports" onPress={() => Linking.openURL(`${env.webApp}/home`)} />
        <Divider inset={46} />
        <SettingRow icon={ShieldCheck} title="Your data" subtitle="Encrypted on this phone; nothing is shared or sold. No ads." />
      </Card>

      <Gap h={space.xl} />
      <Button label="Sign out" kind="secondary" icon={LogOut} onPress={() => setSignOutSheet(true)} />

      <Sheet open={lockSheet} onClose={() => setLockSheet(false)} title="Lock Fintraxa">
        {LOCK_OPTIONS.map((o) => (
          <SettingRow key={o.v} title={o.label} value={o.v === app.autoLockMinutes ? 'Selected' : undefined} onPress={() => setAutoLock(o.v)} />
        ))}
        <Text variant="caption" tone="muted" style={{ marginTop: space.sm }}>After this long in the background, your fingerprint is needed again.</Text>
      </Sheet>

      <Sheet open={signOutSheet} onClose={() => setSignOutSheet(false)} title="Sign out of Fintraxa?">
        <Text variant="body" tone="ink2">Saved figures on this phone are deleted. Your data stays safe on the server.</Text>
        <Gap h={space.xl} />
        <Button label="Sign out" kind="danger" onPress={async () => { setSignOutSheet(false); await signOut(); router.replace('/welcome'); }} />
        <Gap h={space.md} />
        <Button label="Cancel" kind="secondary" onPress={() => setSignOutSheet(false)} />
      </Sheet>

      <Sheet open={refresh.open} onClose={() => { abort.current?.abort(); setRefresh({ open: false, running: false, lines: [] }); }} title="Refreshing your prices">
        {refresh.lines.map((l, i) => (
          <Text key={i} variant="body" tone={i === refresh.lines.length - 1 && !refresh.running ? 'ink' : 'ink2'} style={{ paddingVertical: 4 }}>• {l}</Text>
        ))}
        {refresh.running ? <Text variant="caption" tone="muted" style={{ marginTop: space.sm }}>This takes up to a minute…</Text> : null}
        {refresh.error ? <Text variant="body" tone="neg" style={{ marginTop: space.sm }}>{refresh.error}</Text> : null}
        <Gap h={space.lg} />
        <Button label={refresh.running ? 'Running…' : 'Close'} kind="secondary" disabled={refresh.running}
          onPress={() => setRefresh({ open: false, running: false, lines: [] })} />
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  profile: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
  avatar: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  group: { paddingHorizontal: space.lg },
});
