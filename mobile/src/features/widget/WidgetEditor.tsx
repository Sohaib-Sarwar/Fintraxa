/**
 * The widget's settings (owner, 2026-11-28: "remove extra things, only what's needed, Apple dark glass"): a live
 * preview in both sizes, the card, which figures sit under the big one, and hiding amounts. Nothing else — the rate is
 * the web counter's (this tax year, all passive income) and Overnight uses 11 pm – 7 am.
 *
 * `GlassBackdrop` is the page behind it: the chosen card, heavily blurred and darkened, so the glass sections read
 * like Apple's dark materials. Used by Me › Home-screen widget and the long-press screen.
 */
import { Image } from 'expo-image';
import { Pressable, ScrollView, StyleSheet, Switch, View, useWindowDimensions } from 'react-native';
import { useState } from 'react';
import { CARD_DESIGNS, designOf, type CardDesignId } from '@/features/today/cardDesigns';
import { haptic } from '@/lib/haptics';
import { BlackGlass, GLASS_INK, GLASS_INK2, GLASS_LINE } from '@/ui/BlackGlass';
import { GlassToggle } from '@/ui/GlassToggle';
import { Check } from '@/ui/icons';
import { Text } from '@/ui/Text';
import { useTheme } from '@/ui/theme';
import { font, space } from '@/ui/tokens';
import { FIGURE_HELP, FIGURE_NAMES, type SmallFigure, type WidgetData } from './earnings';
import { MAX_FIGURES, resolveCard, type WidgetConfig } from './storage';
import { WidgetFace } from './WidgetFace';

const FIGURES: SmallFigure[] = ['month', 'yesterday', 'overnight', 'average'];

/** The page behind the editor: the card, blurred and darkened (Apple's dark material). */
export function GlassBackdrop({ card }: { card: CardDesignId }) {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Image source={designOf(card).source} style={StyleSheet.absoluteFill} contentFit="cover" blurRadius={60} transition={250} />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.62)' }]} />
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View>
      <Text style={styles.section}>{title}</Text>
      <BlackGlass liquid style={{ paddingVertical: 2 }}>{children}</BlackGlass>
    </View>
  );
}

export function WidgetEditor({ cfg, onChange, data, appCard }: {
  cfg: WidgetConfig; onChange: (c: WidgetConfig) => void; data: Pick<WidgetData, 'events'> | null; appCard: CardDesignId;
}) {
  const p = useTheme();
  const { width } = useWindowDimensions();
  const [size, setSize] = useState<'medium' | 'small'>('medium');
  const set = (patch: Partial<WidgetConfig>) => onChange({ ...cfg, ...patch });
  const card = resolveCard(cfg, appCard);
  const full = Math.min(width - 2 * space.xl, 420);
  const pw = size === 'medium' ? full : Math.round(full * 0.52);

  const toggleFigure = (f: SmallFigure) => {
    haptic.tick();
    set({ figures: cfg.figures.includes(f) ? cfg.figures.filter((x) => x !== f) : [...cfg.figures, f].slice(0, MAX_FIGURES) });
  };
  const cards: { id: CardDesignId | 'app'; img: CardDesignId; name: string }[] = [
    { id: 'app', img: appCard, name: 'Same as app' },
    ...CARD_DESIGNS.map((d) => ({ id: d.id, img: d.id, name: d.name })),
  ];

  return (
    <View>
      <View style={[styles.preview, { height: Math.round(full * 0.52) + 8 }]}>
        <WidgetFace data={data} cfg={cfg} card={card} width={pw} size={size} />
      </View>
      <View style={styles.sizes}>
        <GlassToggle options={[{ value: 'medium', label: 'Medium' }, { value: 'small', label: 'Small' }]} value={size} onChange={setSize} accessibilityLabel="Preview size" />
      </View>

      <Section title="Card">
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.cards}>
          {cards.map((c) => {
            const on = cfg.card === c.id;
            return (
              <Pressable key={c.id} onPress={() => { haptic.tick(); set({ card: c.id }); }} accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={c.name} style={styles.cardItem}>
                <View style={[styles.thumb, { borderColor: on ? p.accentOnDark : 'rgba(255,255,255,0.10)' }]}>
                  <Image source={designOf(c.img).source} style={StyleSheet.absoluteFill} contentFit="cover" />
                  {on ? <View style={[styles.tick, { backgroundColor: p.accentOnDark }]}><Check size={12} color={p.accentOnDarkInk} strokeWidth={3} /></View> : null}
                </View>
                <Text style={[styles.cardName, on && { color: GLASS_INK }]} numberOfLines={1}>{c.name}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </Section>

      <Section title={`Under the amount · up to ${MAX_FIGURES}`}>
        {FIGURES.map((f, i) => {
          const on = cfg.figures.includes(f);
          const blocked = !on && cfg.figures.length >= MAX_FIGURES;
          return (
            <Pressable key={f} onPress={() => toggleFigure(f)} disabled={blocked} accessibilityRole="checkbox" accessibilityState={{ checked: on, disabled: blocked }}
              accessibilityLabel={`${FIGURE_NAMES[f]}. ${FIGURE_HELP[f]}`} style={({ pressed }) => [styles.row, i > 0 && styles.rowSep, { opacity: blocked ? 0.4 : pressed ? 0.8 : 1 }]}>
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

      <Section title="Privacy">
        <View style={styles.row}>
          <Text style={[styles.rowTitle, { flex: 1 }]}>Hide amounts</Text>
          <Switch value={cfg.hide} onValueChange={(hide) => { haptic.tick(); set({ hide }); }}
            trackColor={{ false: 'rgba(255,255,255,0.16)', true: p.accentOnDark }} thumbColor={cfg.hide ? p.accentOnDarkInk : '#C9CCC8'} />
        </View>
      </Section>
    </View>
  );
}

const styles = StyleSheet.create({
  preview: { alignItems: 'center', justifyContent: 'center', marginTop: space.md },
  sizes: { alignSelf: 'center', marginTop: space.md, width: 220 },
  section: { color: GLASS_INK2, fontFamily: font.semibold, fontSize: 13, letterSpacing: 0.2, marginTop: space.xl, marginBottom: space.sm, marginLeft: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 56, paddingVertical: space.sm },
  rowSep: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: GLASS_LINE },
  rowTitle: { color: GLASS_INK, fontFamily: font.medium, fontSize: 15 },
  rowSub: { color: GLASS_INK2, fontFamily: font.regular, fontSize: 12.5, marginTop: 2 },
  check: { width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.28)', alignItems: 'center', justifyContent: 'center' },
  checkNum: { fontFamily: font.bold, fontSize: 12 },
  cards: { gap: space.md, paddingVertical: space.md },
  cardItem: { width: 92, gap: 6 },
  thumb: { width: 92, height: 58, borderRadius: 12, overflow: 'hidden', borderWidth: 2 },
  tick: { position: 'absolute', right: 5, top: 5, width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  cardName: { color: GLASS_INK2, fontFamily: font.medium, fontSize: 11.5 },
});
