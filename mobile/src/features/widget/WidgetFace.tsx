/**
 * The widget as the editor shows it: the same face and geometry as the home-screen widget (EarningsWidget.tsx,
 * layout.ts), drawn with React Native so "Earned today" rolls live, second by second, like the widget's ticker.
 */
import { Image } from 'expo-image';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, FadeOutUp } from 'react-native-reanimated';
import { CardArt, designOf, type CardDesignId } from '@/features/today/cardDesigns';
import { Text } from '@/ui/Text';
import { font } from '@/ui/tokens';
import { FIGURE_NAMES, liveDecimals, rupees, rupeesShort, widgetFigures, type WidgetData } from './earnings';
import { widgetLayout } from './layout';
import type { WidgetConfig } from './storage';

const INK = '#F5F5F3';
const INK_LABEL = 'rgba(245,245,243,0.9)';
const INK2 = 'rgba(245,245,243,0.7)';
const LINE = 'rgba(255,255,255,0.2)';
const MASK = '••••••';
const MINUTE = 60_000;

export function WidgetFace({ data, cfg, card, width, height }: {
  data: Pick<WidgetData, 'events'> | null; cfg: WidgetConfig; card: CardDesignId; width: number; height: number;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id); }, []);
  // Figures once a minute; between, the rate carries "today" forward each second (what the widget's ticker does).
  const minute = Math.floor(now / MINUTE);
  const base = useMemo(
    () => (data ? widgetFigures(data, { sources: cfg.sources, basis: cfg.basis, sleep: cfg.sleep, now: minute * MINUTE }) : null),
    [data, cfg.sources, cfg.basis, cfg.sleep, minute],
  );
  const today = base ? base.today + base.perSecond * ((now - minute * MINUTE) / 1000) : 0;
  const l = widgetLayout(width, height, cfg.figures.length);
  const show = base ? cfg.figures.slice(0, l.figures) : [];
  const big = cfg.hide ? MASK : rupees(today, liveDecimals(today)).replace(/^Rs /, '');
  const slotH = height - l.slot.top - l.slot.bottom;
  const bigSize = Math.min(l.bigMax, Math.floor((width - l.slot.left - l.slot.right) / ((big.length + 2.6 * 0.32) * 0.6)));

  return (
    <View style={[styles.card, { width, height }]} accessibilityLabel={cfg.hide ? 'Widget preview, amounts hidden' : `Widget preview. Earned today ${rupees(today, 2)}`}>
      <CardArt id={card} />
      <View style={[StyleSheet.absoluteFill, { paddingHorizontal: l.pad, paddingVertical: l.mode === 'row' ? 8 : l.pad }]}>
        <View style={[styles.top, { height: l.topH }]}>
          <Text style={[styles.label, { fontSize: l.label }]} numberOfLines={1}>Earned today</Text>
          {l.mark && designOf(card).mark !== false ? <Image source={require('../../../assets/mark.png')} style={{ width: l.mark, height: l.mark }} contentFit="contain" /> : null}
        </View>
        <View style={{ position: 'absolute', left: l.slot.left, right: l.slot.right, top: l.slot.top, height: slotH, justifyContent: 'center', overflow: 'hidden' }}>
          {base ? (
            <Animated.View key={big} entering={FadeInDown.duration(220)} exiting={FadeOutUp.duration(200)} style={styles.bigRow}>
              <Text style={[styles.big, { fontSize: bigSize, lineHeight: Math.round(bigSize * 1.12) }]} numberOfLines={1}>{big}</Text>
              <Text style={[styles.pkr, { fontSize: Math.max(10, Math.round(bigSize * 0.32)), marginBottom: Math.round(bigSize * 0.16) }]}>PKR</Text>
            </Animated.View>
          ) : <Text style={[styles.label, { fontSize: l.label }]}>Open Home once to show your figures.</Text>}
        </View>
        {show.length ? (
          <View style={[l.mode === 'tall' ? styles.list : styles.row, { position: 'absolute', left: l.pad, right: l.pad, bottom: l.pad, height: l.bottomH }]}>
            {show.map((f, i) => (
              <View key={f} style={l.mode === 'tall'
                ? [styles.listRow, { height: l.rowH }]
                : [styles.holder, i > 0 && { borderLeftWidth: StyleSheet.hairlineWidth * 2, borderLeftColor: LINE, paddingLeft: 10, marginLeft: 10 }]}>
                <Text style={[styles.figLabel, { fontSize: l.figLabel }]} numberOfLines={1}>{FIGURE_NAMES[f]}</Text>
                <Text style={[styles.figValue, { fontSize: l.figValue }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                  {cfg.hide ? MASK : rupeesShort(base![f])}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>
    </View>
  );
}

const shadow = { textShadowColor: 'rgba(0,0,0,0.4)', textShadowRadius: 6, textShadowOffset: { width: 0, height: 1 } };
const styles = StyleSheet.create({
  card: { overflow: 'hidden', borderRadius: 26, backgroundColor: '#0A0A0B' },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  label: { color: INK_LABEL, fontFamily: font.medium, ...shadow },
  bigRow: { flexDirection: 'row', alignItems: 'flex-end' },
  big: { color: INK, fontFamily: font.numHeavy, letterSpacing: -0.8, fontVariant: ['tabular-nums'], ...shadow },
  pkr: { color: INK2, fontFamily: font.medium, marginLeft: 4, ...shadow },
  row: { flexDirection: 'row', alignItems: 'flex-end' },
  list: { flexDirection: 'column' },
  listRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: StyleSheet.hairlineWidth * 2, borderTopColor: LINE },
  holder: { flex: 1, minWidth: 0 },
  figLabel: { color: INK2, fontFamily: font.medium, ...shadow },
  figValue: { color: INK, fontFamily: font.num, marginTop: 2, fontVariant: ['tabular-nums'], ...shadow },
});
