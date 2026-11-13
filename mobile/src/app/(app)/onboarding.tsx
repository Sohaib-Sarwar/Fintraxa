import { router } from 'expo-router';
import { Check, Landmark, LineChart, Wallet, type LucideIcon } from '@/ui/icons';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSavePrefs } from '@/data/mutations';
import { usePrefs, useUid } from '@/data/queries';
import { haptic } from '@/lib/haptics';
import { useApp, type Tracks } from '@/lib/store';
import { biometricsAvailable } from '@/lib/vault';
import { Button } from '@/ui/primitives';
import { Text } from '@/ui/Text';
import { useTheme } from '@/ui/theme';
import { SCREEN_PAD, space } from '@/ui/tokens';

const OPTIONS: { key: keyof Tracks; icon: LucideIcon; title: string; body: string }[] = [
  { key: 'spending', icon: Wallet, title: 'Spending', body: 'Income, expenses and what you save each month' },
  { key: 'funds', icon: LineChart, title: 'Mutual funds', body: 'Holdings from your AMC statements, profit and CGT' },
  { key: 'stocks', icon: Landmark, title: 'PSX shares', body: 'Your shares, today’s moves, dividends and tax' },
];

/** First run (plan §6.1 step 5): what to track decides which tabs and cards appear. Changeable in Me. */
export default function Onboarding() {
  const p = useTheme();
  const insets = useSafeAreaInsets();
  const uid = useUid();
  const prefs = usePrefs();
  const save = useSavePrefs();
  const server = prefs.data?.tracks;
  const [t, setT] = useState<Tracks>({ spending: server?.spending ?? true, funds: server?.funds ?? true, stocks: server?.stocks ?? true });
  const none = !t.spending && !t.funds && !t.stocks;

  const finish = async () => {
    if (!uid || none) return;
    useApp.getState().setTracks(uid, t);
    save.mutate({ tracks: t });
    useApp.getState().markOnboarded(uid);
    haptic.success();
    const askBio = !useApp.getState().biometricAsked[uid] && !useApp.getState().biometricEnabled && (await biometricsAvailable());
    router.replace(askBio ? '/biometrics' : '/');
  };

  return (
    <View style={[styles.root, { backgroundColor: p.bg, paddingTop: insets.top + space.xxxl, paddingBottom: insets.bottom + space.xl }]}>
      <View style={{ gap: space.sm }}>
        <Text variant="title" accessibilityRole="header">What do you want to track?</Text>
        <Text variant="body" tone="ink2">We’ll only show what you use. You can change this any time in Me.</Text>
      </View>
      <View style={{ gap: space.md, marginTop: space.xxl, flex: 1 }}>
        {OPTIONS.map((o) => {
          const on = t[o.key];
          const Icon = o.icon;
          return (
            <Pressable key={o.key} accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={`${o.title}. ${o.body}`}
              onPress={() => { haptic.tick(); setT((x) => ({ ...x, [o.key]: !x[o.key] })); }}
              style={({ pressed }) => [styles.option, { backgroundColor: p.surface, borderColor: on ? p.accent : p.border, opacity: pressed ? 0.85 : 1 }]}>
              <View style={[styles.icon, { backgroundColor: on ? p.accentSoft : p.surface2 }]}><Icon size={22} color={p.ink} /></View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="bodyStrong">{o.title}</Text>
                <Text variant="caption" tone="ink2">{o.body}</Text>
              </View>
              <View style={[styles.check, { borderColor: on ? p.accent : p.border, backgroundColor: on ? p.accent : 'transparent' }]}>
                {on ? <Check size={16} color={p.accentInk} strokeWidth={3} /> : null}
              </View>
            </Pressable>
          );
        })}
      </View>
      {none ? <Text variant="label" tone="neg" align="center" style={{ marginBottom: space.md }}>Pick at least one.</Text> : null}
      <Button label="Continue" onPress={finish} disabled={none} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: SCREEN_PAD },
  option: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg, borderRadius: 20, borderWidth: 1.5, minHeight: 76 },
  icon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  check: { width: 26, height: 26, borderRadius: 13, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
});
