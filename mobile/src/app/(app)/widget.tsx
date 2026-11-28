/**
 * Me › Home-screen widget (owner, 2026-11-28: "edit should be in settings", "Apple dark glass"). The chosen card,
 * blurred, behind black-glass sections. Every change is saved at once and redraws the widgets on the home screen.
 * "Add to home screen" asks the launcher to place one; when it can't, the page says how to add it by hand.
 */
import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePassive } from '@/data/portfolio';
import { fromEvents } from '@/features/widget/earnings';
import { pinWidget, refreshWidgets, widgetsAvailable } from '@/features/widget/native';
import { loadConfig, resolveCard, saveConfig, type WidgetConfig } from '@/features/widget/storage';
import { GlassBackdrop, WidgetEditor } from '@/features/widget/WidgetEditor';
import { ALL_TIME_START, todayIso } from '@/lib/dates';
import { haptic } from '@/lib/haptics';
import { useApp } from '@/lib/store';
import { toast } from '@/ui/feedback';
import { ChevronLeft } from '@/ui/icons';
import { Button, CircleButton } from '@/ui/primitives';
import { Text } from '@/ui/Text';
import { font, space } from '@/ui/tokens';

export default function WidgetPage() {
  const insets = useSafeAreaInsets();
  const appCard = useApp((s) => s.cardDesign);
  const [allTime] = useState(() => ({ start: ALL_TIME_START, end: todayIso() }));
  const { events } = usePassive(allTime);
  const data = useMemo(() => (events ? { events: fromEvents(events) } : null), [events]);
  const [cfg, setCfg] = useState<WidgetConfig | null>(null);
  useEffect(() => { loadConfig().then(setCfg).catch(() => {}); }, []);

  // Save and redraw shortly after the last change (a burst of taps is one save).
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const change = (next: WidgetConfig) => {
    setCfg(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { saveConfig(next).then(() => refreshWidgets()).catch(() => {}); }, 400);
  };
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const add = async () => {
    haptic.tick();
    const ok = await pinWidget();
    if (!ok) toast('Long-press an empty spot on your home screen, tap Widgets, then choose Fintraxa.', { tone: 'info' });
  };

  return (
    <View style={styles.screen}>
      <GlassBackdrop card={cfg ? resolveCard(cfg, appCard) : appCard} />
      <View style={[styles.header, { paddingTop: insets.top + space.sm }]}>
        <CircleButton icon={ChevronLeft} label="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
        <Text style={styles.title} accessibilityRole="header">Widget</Text>
        <View style={{ width: 44 }} />
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: space.xl, paddingBottom: insets.bottom + space.xxl }} showsVerticalScrollIndicator={false}>
        {cfg ? <WidgetEditor cfg={cfg} onChange={change} data={data} appCard={appCard} /> : null}
        {widgetsAvailable ? <Button label="Add to home screen" onPress={add} style={{ marginTop: space.xxl }} /> : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#000000' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.xl, paddingBottom: space.sm },
  title: { color: '#F3F4F2', fontFamily: font.semibold, fontSize: 17 },
});
