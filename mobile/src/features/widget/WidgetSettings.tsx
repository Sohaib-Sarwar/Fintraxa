/**
 * The widget's settings (owner, 2026-11-28): opens when the widget is added and from the home screen
 * (long-press the widget → Settings / the pencil). Card design, what counts as passive income, the period the
 * average is taken over, the small figures, sleep hours for "Overnight", and hiding amounts. The preview at the top
 * is the real widget drawn natively at its size; under it "Earned today" counts live, second by second, at the rate.
 *
 * Runs in its own Android activity (react-native-android-widget), outside the app's navigation and providers, so
 * it loads its own fonts and uses plain React Native views with the app's tokens.
 */
import { useFonts } from 'expo-font';
import { Image } from 'expo-image';
import { useEffect, useMemo, useRef, useState } from 'react';
import { BackHandler, Pressable, ScrollView, StatusBar, StyleSheet, Switch, Text, View, useWindowDimensions } from 'react-native';
import { WidgetPreview, type WidgetConfigurationScreenProps } from 'react-native-android-widget';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular';
import { Inter_500Medium } from '@expo-google-fonts/inter/500Medium';
import { Inter_600SemiBold } from '@expo-google-fonts/inter/600SemiBold';
import { Inter_700Bold } from '@expo-google-fonts/inter/700Bold';
import { InterTight_600SemiBold } from '@expo-google-fonts/inter-tight/600SemiBold';
import { InterTight_800ExtraBold } from '@expo-google-fonts/inter-tight/800ExtraBold';
import type { PassiveSource } from '@/data/engines';
import { CARD_DESIGNS } from '@/features/today/cardDesigns';
import { dark, space } from '@/ui/tokens';
import {
  BASIS_NAMES, FIGURE_HELP, FIGURE_NAMES, SLEEP_PRESETS, SOURCE_NAMES, WIDGET_SOURCES, liveDecimals, rupees, sleepLabel, widgetFigures,
  type RateBasis, type SmallFigure, type WidgetData,
} from './earnings';
import { EarningsWidget } from './EarningsWidget';
import { MAX_FIGURES, loadConfig, loadData, saveConfig, type WidgetConfig } from './storage';

const C = dark;
const FIGURES: SmallFigure[] = ['overnight', 'yesterday', 'month', 'received', 'average'];
const BASES: RateBasis[] = ['fy', '12m', 'all'];

/** "Earned today", repainted 10 times a second at the rate (the web's counter). */
function LiveCounter({ data, cfg }: { data: WidgetData; cfg: WidgetConfig }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 100); return () => clearInterval(id); }, []);
  const f = widgetFigures(data, { sources: cfg.sources, basis: cfg.basis, sleep: cfg.sleep, now });
  return (
    <View style={styles.live} accessibilityLabel={`Earned today ${rupees(f.today, 2)}`}>
      <Text style={styles.liveLabel}>Earned today, live</Text>
      <Text style={styles.liveValue} numberOfLines={1} adjustsFontSizeToFit>{cfg.hide ? 'Rs ••••••' : rupees(f.today, liveDecimals(f.today))}</Text>
      <Text style={styles.liveNote}>
        {f.perSecond > 0
          ? `${rupees(f.average, 2)} a month on average after tax (${BASIS_NAMES[cfg.basis].toLowerCase()}), counted second by second.`
          : 'No passive income in this period yet.'}
      </Text>
    </View>
  );
}

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {note ? <Text style={styles.sectionNote}>{note}</Text> : null}
      {children}
    </View>
  );
}

function Chip({ label, on, onPress, disabled }: { label: string; on: boolean; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="checkbox" accessibilityState={{ checked: on, disabled }}
      style={({ pressed }) => [styles.chip, on && styles.chipOn, disabled && { opacity: 0.4 }, pressed && { opacity: 0.75 }]}>
      <Text style={[styles.chipText, on && styles.chipTextOn]}>{label}</Text>
    </Pressable>
  );
}

export function WidgetSettingsScreen(props: WidgetConfigurationScreenProps) {
  return <SafeAreaProvider><Settings {...props} /></SafeAreaProvider>;
}

function Settings({ widgetInfo, renderWidget, setResult }: WidgetConfigurationScreenProps) {
  const insets = useSafeAreaInsets();
  const [fontsLoaded] = useFonts({ Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold, InterTight_600SemiBold, InterTight_800ExtraBold });
  const [cfg, setCfg] = useState<WidgetConfig | null>(null);
  const [data, setData] = useState<WidgetData | null | undefined>(undefined);
  // The preview's clock: set when the saved figures load, then every 30 s.
  const [now, setNow] = useState(0);
  const { width: screenW } = useWindowDimensions();
  const done = useRef(false);

  useEffect(() => {
    let alive = true;
    Promise.all([loadConfig(widgetInfo.widgetId), loadData()]).then(([c, d]) => { if (alive) { setCfg(c); setData(d); setNow(Date.now()); } });
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => { alive = false; clearInterval(id); };
  }, [widgetInfo.widgetId]);

  // Back = cancel (a new widget is not added; an existing one keeps its settings).
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { if (!done.current) { done.current = true; setResult('cancel'); } return true; });
    return () => sub.remove();
  }, [setResult]);

  const used = useMemo(() => new Set((data?.events ?? []).map((e) => e.s)), [data]);
  const sources = WIDGET_SOURCES.filter((s) => s !== 'other' || used.has('other'));

  if (!cfg || data === undefined || !fontsLoaded) return <View style={styles.screen} />;

  const set = (patch: Partial<WidgetConfig>) => setCfg({ ...cfg, ...patch });
  const toggleSource = (s: PassiveSource) => set({ sources: cfg.sources.includes(s) ? cfg.sources.filter((x) => x !== s) : [...cfg.sources, s] });
  const toggleFigure = (f: SmallFigure) => set({ figures: cfg.figures.includes(f) ? cfg.figures.filter((x) => x !== f) : [...cfg.figures, f].slice(0, MAX_FIGURES) });

  // The preview: the widget at its real size (dp), scaled down to fit the screen if needed.
  const wW = Math.max(160, widgetInfo.width || 340);
  const wH = Math.max(80, widgetInfo.height || 170);
  const scale = Math.min(1, (screenW - 2 * space.xl) / wW);
  const draw = (w: number, h: number, at: number) => {
    const figures = data ? widgetFigures(data, { sources: cfg.sources, basis: cfg.basis, sleep: cfg.sleep, now: at }) : null;
    return <EarningsWidget width={w} height={h} card={cfg.card} figures={figures} show={cfg.figures} hide={cfg.hide} builtAt={data?.builtAt ?? null} now={at} />;
  };

  const save = async () => {
    if (done.current) return;
    done.current = true;
    await saveConfig(widgetInfo.widgetId, cfg);
    renderWidget(draw(widgetInfo.width, widgetInfo.height, Date.now()));
    setResult('ok');
  };

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" />
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: space.xxl + insets.top }]}>
        <Text style={styles.title}>Passive income widget</Text>
        <Text style={styles.subtitle}>What the widget on your home screen shows. Tap the widget to open Fintraxa.</Text>

        <View style={[styles.previewWrap, { height: wH * scale }]}>
          <View style={{ width: wW, height: wH, marginVertical: -(wH * (1 - scale)) / 2, transform: [{ scale }] }}>
            <WidgetPreview width={wW} height={wH} renderWidget={({ width, height }) => draw(width, height, now)} />
          </View>
        </View>

        {data ? <LiveCounter data={data} cfg={cfg} /> : (
          <View style={styles.live}><Text style={styles.liveNote}>Open Fintraxa and sign in once; the widget then works on its own, offline too.</Text></View>
        )}

        <Section title="Card">
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm, paddingRight: space.xl }}>
            {CARD_DESIGNS.map((d) => {
              const on = d.id === cfg.card;
              return (
                <Pressable key={d.id} onPress={() => set({ card: d.id })} accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={d.name}
                  style={[styles.cardThumb, on && styles.cardThumbOn]}>
                  <Image source={d.source} style={styles.cardImg} contentFit="cover" />
                </Pressable>
              );
            })}
          </ScrollView>
          <Text style={styles.cardName}>{CARD_DESIGNS.find((d) => d.id === cfg.card)?.name}</Text>
        </Section>

        <Section title="Count income from" note="Mutual funds = realized profit after CGT. Dividends and savings profit = after tax withheld.">
          <View style={styles.chips}>
            {sources.map((s) => <Chip key={s} label={SOURCE_NAMES[s]} on={cfg.sources.includes(s)} onPress={() => toggleSource(s)} />)}
          </View>
        </Section>

        <Section title="Average over" note="The rate is your average passive income a month in this period, like the counter on the web.">
          <View style={styles.chips}>
            {BASES.map((b) => <Chip key={b} label={BASIS_NAMES[b]} on={cfg.basis === b} onPress={() => set({ basis: b })} />)}
          </View>
        </Section>

        <Section title={`Small figures · up to ${MAX_FIGURES}`}>
          {FIGURES.map((f) => {
            const on = cfg.figures.includes(f);
            const full = !on && cfg.figures.length >= MAX_FIGURES;
            return (
              <Pressable key={f} onPress={() => toggleFigure(f)} disabled={full} accessibilityRole="checkbox" accessibilityState={{ checked: on, disabled: full }}
                style={({ pressed }) => [styles.row, full && { opacity: 0.4 }, pressed && { opacity: 0.75 }]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>{FIGURE_NAMES[f]}</Text>
                  <Text style={styles.rowNote}>{FIGURE_HELP[f]}</Text>
                </View>
                <View style={[styles.check, on && styles.checkOn]}>{on ? <Text style={styles.checkMark}>{cfg.figures.indexOf(f) + 1}</Text> : null}</View>
              </Pressable>
            );
          })}
        </Section>

        {cfg.figures.includes('overnight') ? (
          <Section title="Sleep hours" note="Used for Overnight.">
            <View style={styles.chips}>
              {SLEEP_PRESETS.map((s) => (
                <Chip key={`${s.from}-${s.to}`} label={sleepLabel(s)} on={cfg.sleep.from === s.from && cfg.sleep.to === s.to} onPress={() => set({ sleep: s })} />
              ))}
            </View>
          </Section>
        ) : null}

        <View style={[styles.row, styles.section]}>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>Hide amounts</Text>
            <Text style={styles.rowNote}>Show •••••• on the home screen</Text>
          </View>
          <Switch value={cfg.hide} onValueChange={(hide) => set({ hide })} trackColor={{ true: C.ink, false: C.surface3 }} thumbColor={cfg.hide ? '#000000' : C.ink2} />
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: space.xl + insets.bottom }]}>
        <Pressable onPress={() => { if (!done.current) { done.current = true; setResult('cancel'); } }} style={({ pressed }) => [styles.btn, styles.btnGhost, pressed && { opacity: 0.75 }]} accessibilityRole="button">
          <Text style={[styles.btnText, { color: C.ink }]}>Cancel</Text>
        </Pressable>
        <Pressable onPress={save} style={({ pressed }) => [styles.btn, styles.btnMain, pressed && { opacity: 0.85 }]} accessibilityRole="button">
          <Text style={[styles.btnText, { color: '#000000' }]}>Save</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#000000' },
  content: { padding: space.xl, paddingTop: space.xxl, paddingBottom: space.xxxl },
  title: { color: C.ink, fontFamily: 'Inter_700Bold', fontSize: 22 },
  subtitle: { color: C.muted, fontFamily: 'Inter_400Regular', fontSize: 13.5, lineHeight: 19, marginTop: 4 },
  previewWrap: { marginTop: space.xl, alignItems: 'center', overflow: 'visible' },
  live: { marginTop: space.lg, padding: space.lg, borderRadius: 20, backgroundColor: C.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: C.borderStrong },
  liveLabel: { color: C.ink2, fontFamily: 'Inter_500Medium', fontSize: 12.5 },
  liveValue: { color: C.ink, fontFamily: 'InterTight_800ExtraBold', fontSize: 34, letterSpacing: -0.8, marginTop: 2, fontVariant: ['tabular-nums'] },
  liveNote: { color: C.muted, fontFamily: 'Inter_400Regular', fontSize: 12.5, lineHeight: 17, marginTop: 4 },
  section: { marginTop: space.xxl },
  sectionTitle: { color: C.ink, fontFamily: 'Inter_600SemiBold', fontSize: 15 },
  sectionNote: { color: C.muted, fontFamily: 'Inter_400Regular', fontSize: 12.5, lineHeight: 17, marginTop: 2 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.md },
  chip: { paddingHorizontal: 14, height: 38, borderRadius: 999, justifyContent: 'center', backgroundColor: C.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: C.borderStrong },
  chipOn: { backgroundColor: C.ink, borderColor: C.ink },
  chipText: { color: C.ink, fontFamily: 'Inter_500Medium', fontSize: 13.5 },
  chipTextOn: { color: '#000000', fontFamily: 'Inter_600SemiBold' },
  cardThumb: { marginTop: space.md, width: 104, height: 66, borderRadius: 12, overflow: 'hidden', borderWidth: 2, borderColor: 'transparent' },
  cardThumbOn: { borderColor: C.ink },
  cardImg: { width: '100%', height: '100%' },
  cardName: { color: C.ink2, fontFamily: 'Inter_500Medium', fontSize: 12.5, marginTop: space.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.hairline },
  rowTitle: { color: C.ink, fontFamily: 'Inter_500Medium', fontSize: 14.5 },
  rowNote: { color: C.muted, fontFamily: 'Inter_400Regular', fontSize: 12.5, marginTop: 1 },
  check: { width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, borderColor: C.borderStrong, alignItems: 'center', justifyContent: 'center' },
  checkOn: { backgroundColor: C.ink, borderColor: C.ink },
  checkMark: { color: '#000000', fontFamily: 'Inter_700Bold', fontSize: 12 },
  footer: { flexDirection: 'row', gap: space.sm, padding: space.lg, paddingBottom: space.xl, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.hairline, backgroundColor: '#000000' },
  btn: { flex: 1, height: 50, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  btnGhost: { backgroundColor: C.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: C.borderStrong },
  btnMain: { backgroundColor: C.ink },
  btnText: { fontFamily: 'Inter_600SemiBold', fontSize: 15 },
});
