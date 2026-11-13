import * as Application from 'expo-application';
import { Download, X } from '@/ui/icons';
import { useState } from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLatestRelease } from '@/data/queries';
import type { Release } from '@/data/types';
import { isExpoGo } from '@/lib/env';
import { Button } from '@/ui/primitives';
import { Text } from '@/ui/Text';
import { useTheme } from '@/ui/theme';
import { SCREEN_PAD, space } from '@/ui/tokens';

/** "Fintraxa 1.3 is available" (plan §12.3): dismissible, opens the APK link in the browser. */
export function UpdateBanner() {
  const p = useTheme();
  const release = useLatestRelease(!isExpoGo);
  const [dismissed, setDismissed] = useState<number | null>(null);
  const code = Number(Application.nativeBuildVersion ?? 0);
  const r = release.data;
  if (isExpoGo || !r || !code || r.version_code <= code || dismissed === r.version_code) return null;
  return (
    <View style={[styles.banner, { backgroundColor: p.accentSoft, borderColor: p.border }]}>
      <Download size={18} color={p.ink} />
      <Pressable style={{ flex: 1 }} onPress={() => Linking.openURL(r.apk_url)} accessibilityRole="link" accessibilityLabel={`Download Fintraxa ${r.version_name}`}>
        <Text variant="bodyStrong">Fintraxa {r.version_name} is available</Text>
        <Text variant="caption" tone="ink2" numberOfLines={2}>{r.notes || 'Tap to download the new version.'}</Text>
      </Pressable>
      <Pressable onPress={() => setDismissed(r.version_code)} hitSlop={12} accessibilityRole="button" accessibilityLabel="Dismiss">
        <X size={18} color={p.ink2} />
      </Pressable>
    </View>
  );
}

/** Blocking screen when this build is older than min_supported_code (a backend change would break it). */
export function ForcedUpdate({ release }: { release: Release }) {
  const p = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.forced, { backgroundColor: p.bg, paddingTop: insets.top + space.xxxl, paddingBottom: insets.bottom + space.xl }]}>
      <View style={{ gap: space.md }}>
        <Text variant="title">Update Fintraxa to continue</Text>
        <Text variant="body" tone="ink2">This version can no longer talk to the server safely. Version {release.version_name} fixes that — your data is safe and waiting.</Text>
        {release.notes ? <Text variant="body" tone="ink2">{release.notes}</Text> : null}
      </View>
      <Button label={`Download ${release.version_name}`} icon={Download} onPress={() => Linking.openURL(release.apk_url)} />
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, marginBottom: space.lg },
  forced: { flex: 1, paddingHorizontal: SCREEN_PAD, justifyContent: 'space-between' },
});
