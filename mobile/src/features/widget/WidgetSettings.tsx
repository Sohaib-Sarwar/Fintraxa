/**
 * What Android opens from a long-press on the widget (Settings / Reconfigure). The widget is added WITHOUT this
 * screen (widgetFeatures "reconfigurable|configuration_optional", Android's recommended setup — owner, 2026-11-28:
 * "why is it asking me to edit after adding"); it is the same editor as Me › Home-screen widget.
 *
 * Android's rule: this screen must always give a result, and only RESULT_OK keeps a widget being added. "Done"
 * therefore always finishes with 'ok' — saving and redrawing are attempted first, but an error there can never leave
 * the user stuck or lose the widget. Back / Cancel = 'cancel' (an existing widget keeps its look).
 *
 * Runs in its own Android activity, outside the app's root layout, so it brings its own providers and fonts.
 */
import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular';
import { Inter_500Medium } from '@expo-google-fonts/inter/500Medium';
import { Inter_600SemiBold } from '@expo-google-fonts/inter/600SemiBold';
import { Inter_700Bold } from '@expo-google-fonts/inter/700Bold';
import { InterTight_500Medium } from '@expo-google-fonts/inter-tight/500Medium';
import { InterTight_600SemiBold } from '@expo-google-fonts/inter-tight/600SemiBold';
import { InterTight_700Bold } from '@expo-google-fonts/inter-tight/700Bold';
import { InterTight_800ExtraBold } from '@expo-google-fonts/inter-tight/800ExtraBold';
import { useFonts } from 'expo-font';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, BackHandler, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import type { WidgetConfigurationScreenProps } from 'react-native-android-widget';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import type { CardDesignId } from '@/features/today/cardDesigns';
import { haptic } from '@/lib/haptics';
import { Text } from '@/ui/Text';
import { ThemeProvider, useTheme } from '@/ui/theme';
import { font, space } from '@/ui/tokens';
import type { WidgetData } from './earnings';
import { refreshWidgets } from './native';
import { renderFor } from './render';
import { loadAppCard, loadConfig, loadData, resolveCard, saveConfig, type WidgetConfig } from './storage';
import { GlassBackdrop, WidgetEditor } from './WidgetEditor';

export function WidgetSettingsScreen(props: WidgetConfigurationScreenProps) {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold, InterTight_500Medium, InterTight_600SemiBold, InterTight_700Bold, InterTight_800ExtraBold,
  });
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: '#000000' }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <StatusBar style="light" />
          {fontsLoaded || fontError ? <Settings {...props} /> : <View style={styles.screen} />}
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function Settings({ widgetInfo, renderWidget, setResult }: WidgetConfigurationScreenProps) {
  const p = useTheme();
  const insets = useSafeAreaInsets();
  const [cfg, setCfg] = useState<WidgetConfig | null>(null);
  const [data, setData] = useState<WidgetData | null>(null);
  const [appCard, setAppCard] = useState<CardDesignId>('obsidian');
  const [saving, setSaving] = useState(false);
  const finished = useRef(false);

  useEffect(() => {
    let alive = true;
    Promise.all([loadConfig(), loadData(), loadAppCard()])
      .then(([c, d, a]) => { if (alive) { setCfg(c); setData(d); setAppCard(a); } })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!finished.current) { finished.current = true; setResult('cancel'); }
      return true;
    });
    return () => sub.remove();
  }, [setResult]);

  const finish = (result: 'ok' | 'cancel') => {
    if (finished.current) return;
    finished.current = true;
    setResult(result);
  };

  const done = async () => {
    if (finished.current || !cfg) return;
    haptic.tick();
    setSaving(true);
    try {
      await saveConfig(cfg);
      renderWidget(await renderFor(widgetInfo, cfg));
      await refreshWidgets(); // the other Fintraxa widgets share these settings
    } catch (e) {
      console.warn('[widget] save failed', e);
    } finally {
      finish('ok');
    }
  };

  return (
    <View style={styles.screen}>
      <GlassBackdrop card={cfg ? resolveCard(cfg, appCard) : appCard} />
      <View style={[styles.header, { paddingTop: insets.top + space.sm }]}>
        <Pressable onPress={() => finish('cancel')} hitSlop={10} accessibilityRole="button" style={styles.headerBtn}>
          <Text style={styles.cancel}>Cancel</Text>
        </Pressable>
        <Text style={styles.title}>Widget</Text>
        <Pressable onPress={done} disabled={!cfg || saving} hitSlop={10} accessibilityRole="button" accessibilityLabel="Done"
          style={[styles.headerBtn, styles.done, { backgroundColor: p.accentOnDark, opacity: !cfg ? 0.5 : 1 }]}>
          {saving ? <ActivityIndicator size="small" color={p.accentOnDarkInk} /> : <Text style={[styles.doneText, { color: p.accentOnDarkInk }]}>Done</Text>}
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: space.xl, paddingBottom: insets.bottom + space.xxxl }}>
        {cfg ? <WidgetEditor cfg={cfg} onChange={setCfg} data={data} appCard={appCard} /> : <ActivityIndicator style={{ marginTop: space.xxxl }} color="#FFFFFF" />}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#000000' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.xl, paddingBottom: space.md },
  headerBtn: { minWidth: 72, height: 38, justifyContent: 'center' },
  cancel: { color: '#F3F4F2', fontFamily: font.medium, fontSize: 15 },
  title: { color: '#F3F4F2', fontFamily: font.semibold, fontSize: 17 },
  done: { borderRadius: 999, alignItems: 'center', paddingHorizontal: space.lg },
  doneText: { fontFamily: font.semibold, fontSize: 15 },
});
