/**
 * The widget's settings (owner, 2026-11-28 redesign: "the edit page UI is too bad"), in the app's own style — the
 * black-glass sections of Me. Used by the in-app page (Me › Home-screen widget) and by the screen Android opens from
 * a long-press on the widget. One look for every Fintraxa widget on the phone.
 */
import { Image } from 'expo-image';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, View, useWindowDimensions } from 'react-native';
import type { PassiveSource } from '@/data/engines';
import { CARD_DESIGNS, designOf, type CardDesignId } from '@/features/today/cardDesigns';
import { haptic } from '@/lib/haptics';
import { BlackGlass, GLASS_INK, GLASS_INK2, GLASS_LINE } from '@/ui/BlackGlass';
import { GlassToggle } from '@/ui/GlassToggle';
import { Check } from '@/ui/icons';
import { Text } from '@/ui/Text';
import { useTheme } from '@/ui/theme';
import { font, space } from '@/ui/tokens';
import {
  FIGURE_HELP, FIGURE_NAMES, SLEEP_PRESETS, SOURCE_NAMES, WIDGET_SOURCES, hour12, rupees, widgetFigures,
  type RateBasis, type SmallFigure, type WidgetData,
} from './earnings';
import { MAX_FIGURES, resolveCard, type WidgetConfig } from './storage';
import { WidgetFace } from './WidgetFace';

const FIGURES: SmallFigure[] = ['overnight', 'yesterday', 'month', 'received', 'average'];
const SOURCE_HELP: Record<PassiveSource, string> = {
  mutual_funds: 'Realized profit, after CGT', dividends: 'After tax withheld', savings: 'Bank profit, after tax', other: 'Other income marked passive',
};
const BASES: { value: RateBasis; label: string }[] = [{ value: 'fy', label: 'Tax year' }, { value: '12m', label: '12 months' }, { value: 'all', label: 'All time' }];

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <View>
      <Text variant="label" tone="ink2" style={styles.section}>{title}</Text>
      <BlackGlass style={{ paddingVertical: 2 }}>{children}</BlackGlass>
      {note ? <Text style={styles.note}>{note}</Text> : null}
    </View>
  );
}

function SwitchRow({ title, sub, value, onChange, first }: { title: string; sub?: string; value: boolean; onChange: (v: boolean) => void; first?: boolean }) {
  const p = useTheme();
  return (
    <Pressable onPress={() => { haptic.tick(); onChange(!value); }} accessibilityRole="switch" accessibilityState={{ checked: value }} accessibilityLabel={title}
      style={({ pressed }) => [styles.row, !first && styles.rowSep, pressed && { opacity: 0.8 }]}>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle}>{title}</Text>
        {sub ? <Text style={styles.rowSub}>{sub}</Text> : null}
      </View>
      <Switch value={value} onValueChange={(v) => { haptic.tick(); onChange(v); }}
        trackColor={{ false: 'rgba(255,255,255,0.16)', true: p.accentOnDark }} thumbColor={value ? p.accentOnDarkInk : '#C9CCC8'} />
    </Pressable>
  );
}

export function WidgetEditor({ cfg, onChange, data, appCard }: {
  cfg: WidgetConfig; onChange: (c: WidgetConfig) => void; data: Pick<WidgetData, 'events'> | null; appCard: CardDesignId;
}) {
  const p = useTheme();
  const { width } = useWindowDimensions();
  const set = (patch: Partial<WidgetConfig>) => onChange({ ...cfg, ...patch });
  const card = resolveCard(cfg, appCard);
  const used = new Set((data?.events ?? []).map((e) => e.s));
  const sources = WIDGET_SOURCES.filter((s) => s !== 'other' || used.has('other'));
  const previewW = Math.min(width - 2 * space.xl, 420);
  const [openedAt] = useState(() => Date.now());

  const toggleFigure = (f: SmallFigure) => {
    haptic.tick();
    set({ figures: cfg.figures.includes(f) ? cfg.figures.filter((x) => x !== f) : [...cfg.figures, f].slice(0, MAX_FIGURES) });
  };
  const rate = data ? widgetFigures(data, { sources: cfg.sources, basis: cfg.basis, sleep: cfg.sleep, now: openedAt }) : null;
  const sleepKey = `${cfg.sleep.from}-${cfg.sleep.to}`;

  const cards: { id: CardDesignId | 'app'; img: CardDesignId; name: string }[] = [
    { id: 'app', img: appCard, name: 'Same as app' },
    ...CARD_DESIGNS.map((d) => ({ id: d.id, img: d.id, name: d.name })),
  ];

  return (
    <View>
      {/* The two sizes as they sit on the home screen, counting live. */}
      <View style={styles.preview}>
        <WidgetFace data={data} cfg={cfg} card={card} width={previewW} size="medium" />
        <View style={styles.smallRow}>
          <WidgetFace data={data} cfg={cfg} card={card} width={Math.round((previewW - space.md) / 2)} size="small" />
          <View style={styles.smallNote}>
            <Text style={styles.noteStrong}>Earned today</Text>
            <Text style={styles.noteText}>
              {data
                ? `Counts up from midnight at your average passive income${rate && rate.avgPerMonth > 0 ? '' : ' (none in this period yet)'}. The home screen refreshes it every 30 minutes and whenever you leave the app.`
                : 'Open Home once so the widget has your figures. After that it works offline.'}
            </Text>
          </View>
        </View>
      </View>

      <Section title="Card">
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.cards}>
          {cards.map((c) => {
            const on = cfg.card === c.id;
            return (
              <Pressable key={c.id} onPress={() => { haptic.tick(); set({ card: c.id }); }} accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={c.name}
                style={styles.cardItem}>
                <View style={[styles.thumb, { borderColor: on ? p.accentOnDark : 'transparent' }]}>
                  <Image source={designOf(c.img).source} style={StyleSheet.absoluteFill} contentFit="cover" />
                  {on ? <View style={[styles.tick, { backgroundColor: p.accentOnDark }]}><Check size={12} color={p.accentOnDarkInk} strokeWidth={3} /></View> : null}
                </View>
                <Text style={[styles.cardName, on && { color: GLASS_INK }]} numberOfLines={1}>{c.name}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </Section>

      <Section title={`Small figures · up to ${MAX_FIGURES}`} note={cfg.figures.length ? undefined : 'Only the big figure will show.'}>
        {FIGURES.map((f, i) => {
          const on = cfg.figures.includes(f);
          const full = !on && cfg.figures.length >= MAX_FIGURES;
          return (
            <Pressable key={f} onPress={() => toggleFigure(f)} disabled={full} accessibilityRole="checkbox" accessibilityState={{ checked: on, disabled: full }}
              accessibilityLabel={`${FIGURE_NAMES[f]}. ${FIGURE_HELP[f]}`} style={({ pressed }) => [styles.row, i > 0 && styles.rowSep, { opacity: full ? 0.4 : pressed ? 0.8 : 1 }]}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>{FIGURE_NAMES[f]}</Text>
                <Text style={styles.rowSub}>{FIGURE_HELP[f]}</Text>
              </View>
              <View style={[styles.check, on && { backgroundColor: p.accentOnDark, borderColor: p.accentOnDark }]}>
                {on ? <Text style={[styles.checkNum, { color: p.accentOnDarkInk }]}>{cfg.figures.indexOf(f) + 1}</Text> : null}
              </View>
            </Pressable>
          );
        })}
      </Section>

      <Section title="Income to count">
        {sources.map((s, i) => (
          <SwitchRow key={s} first={i === 0} title={SOURCE_NAMES[s]} sub={SOURCE_HELP[s]} value={cfg.sources.includes(s)}
            onChange={(v) => set({ sources: v ? [...cfg.sources, s] : cfg.sources.filter((x) => x !== s) })} />
        ))}
      </Section>

      <Section title="Average over"
        note={rate && rate.avgPerMonth > 0 ? `${rupees(rate.average, 2)} a month on average · ${rupees(rate.yesterday, 2)} a day` : undefined}>
        <View style={styles.pad}>
          <GlassToggle options={BASES} value={cfg.basis} onChange={(basis) => set({ basis })} accessibilityLabel="Average over" />
        </View>
      </Section>

      {cfg.figures.includes('overnight') ? (
        <Section title="Overnight hours">
          <View style={styles.pad}>
            <GlassToggle options={SLEEP_PRESETS.map((s) => ({ value: `${s.from}-${s.to}`, label: `${hour12(s.from)}–${hour12(s.to)}` }))}
              value={sleepKey} onChange={(v) => { const [from, to] = v.split('-').map(Number); set({ sleep: { from, to } }); }} accessibilityLabel="Overnight hours" />
          </View>
        </Section>
      ) : null}

      <Section title="Privacy">
        <SwitchRow first title="Hide amounts" sub="Shows •••••• on the home screen" value={cfg.hide} onChange={(hide) => set({ hide })} />
      </Section>
    </View>
  );
}

const styles = StyleSheet.create({
  preview: { alignItems: 'center', gap: space.md, marginTop: space.sm },
  smallRow: { flexDirection: 'row', gap: space.md, alignSelf: 'stretch', alignItems: 'center' },
  smallNote: { flex: 1, gap: 4 },
  noteStrong: { color: GLASS_INK, fontFamily: font.semibold, fontSize: 13.5 },
  noteText: { color: GLASS_INK2, fontFamily: font.regular, fontSize: 12.5, lineHeight: 17 },
  section: { marginTop: space.xl, marginBottom: space.sm, marginLeft: 4 },
  note: { color: GLASS_INK2, fontFamily: font.regular, fontSize: 12.5, marginTop: space.sm, marginLeft: 4 },
  pad: { paddingVertical: space.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 58, paddingVertical: space.sm },
  rowSep: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: GLASS_LINE },
  rowTitle: { color: GLASS_INK, fontFamily: font.medium, fontSize: 14.5 },
  rowSub: { color: GLASS_INK2, fontFamily: font.regular, fontSize: 12.5, marginTop: 2 },
  check: { width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.28)', alignItems: 'center', justifyContent: 'center' },
  checkNum: { fontFamily: font.bold, fontSize: 12 },
  cards: { gap: space.md, paddingVertical: space.md },
  cardItem: { width: 96, gap: 6 },
  thumb: { width: 96, height: 61, borderRadius: 12, overflow: 'hidden', borderWidth: 2 },
  tick: { position: 'absolute', right: 5, top: 5, width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  cardName: { color: GLASS_INK2, fontFamily: font.medium, fontSize: 11.5 },
});
