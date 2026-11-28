/**
 * The widget as the editor shows it: the same face as the home-screen widget (EarningsWidget.tsx), drawn with
 * React Native so "Earned today" counts smoothly, ten times a second, at the passive rate.
 */
import { Image } from 'expo-image';
import { useMemo, useState, useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { CardArt, designOf, type CardDesignId } from '@/features/today/cardDesigns';
import { Text } from '@/ui/Text';
import { font } from '@/ui/tokens';
import { FIGURE_NAMES, liveDecimals, rupees, rupeesShort, widgetFigures, type SmallFigure, type WidgetData } from './earnings';
import type { WidgetConfig } from './storage';

const INK = '#F5F5F3';
const INK2 = 'rgba(245,245,243,0.66)';
const LINE = 'rgba(255,255,255,0.22)';
const MASK = '••••••';
const MINUTE = 60_000;

export function WidgetFace({ data, cfg, card, width, size }: {
  data: Pick<WidgetData, 'events'> | null; cfg: WidgetConfig; card: CardDesignId; width: number; size: 'medium' | 'small';
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 100); return () => clearInterval(id); }, []);
  // The figures are worked out once a minute; between, the rate carries the time-based ones forward.
  const minute = Math.floor(now / MINUTE);
  const base = useMemo(
    () => (data ? widgetFigures(data, { sources: cfg.sources, basis: cfg.basis, sleep: cfg.sleep, now: minute * MINUTE }) : null),
    [data, cfg.sources, cfg.basis, cfg.sleep, minute],
  );
  const since = (now - minute * MINUTE) / 1000;
  const today = base ? base.today + base.perSecond * since : 0;
  const month = base ? base.month + base.perSecond * since : 0;
  const value = (k: SmallFigure) => (base ? (k === 'month' ? month : base[k]) : 0);

  const small = size === 'small';
  const w = width;
  const h = small ? width : Math.round(width / 2);
  const k = w / (small ? 170 : 340);
  const show = cfg.figures.slice(0, small ? 1 : 3);
  const d = designOf(card);
  const big = cfg.hide ? MASK : rupees(today, liveDecimals(today)).replace(/^Rs /, '');

  return (
    <View style={[styles.card, { width: w, height: h, borderRadius: 24 * Math.min(1, k), padding: 16 * k }]}
      accessibilityLabel={cfg.hide ? 'Widget preview, amounts hidden' : `Widget preview. Earned today ${rupees(today, 2)}`}>
      <CardArt id={card} />
      <View style={styles.top}>
        <Text style={[styles.label, { fontSize: 12.5 * k }]}>Earned today</Text>
        {d.mark === false ? null : <Image source={require('../../../assets/mark.png')} style={{ width: 26 * k, height: 26 * k }} contentFit="contain" />}
      </View>
      <View style={styles.bigRow}>
        <Text style={[styles.big, { fontSize: (small ? 26 : 40) * k, lineHeight: (small ? 31 : 47) * k }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5}>{big}</Text>
        <Text style={[styles.pkr, { fontSize: 11 * k, marginBottom: 6 * k }]}>PKR</Text>
      </View>
      <View style={styles.bottom}>
        {show.map((f, i) => (
          <View key={f} style={[styles.holder, i > 0 && { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: LINE, paddingLeft: 10 * k, marginLeft: 10 * k }]}>
            <Text style={[styles.label, { fontSize: 10.5 * k }]} numberOfLines={1}>{FIGURE_NAMES[f]}</Text>
            <Text style={[styles.small, { fontSize: 14 * k }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
              {cfg.hide ? MASK : rupeesShort(value(f))}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const shadow = { textShadowColor: 'rgba(0,0,0,0.45)', textShadowRadius: 6, textShadowOffset: { width: 0, height: 1 } };
const styles = StyleSheet.create({
  card: { overflow: 'hidden', justifyContent: 'space-between', backgroundColor: '#0A0A0B', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.12)' },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  label: { color: INK2, fontFamily: font.medium, letterSpacing: 0.2, ...shadow },
  bigRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 6 },
  big: { flexShrink: 1, color: INK, fontFamily: font.numHeavy, letterSpacing: -1, fontVariant: ['tabular-nums'], ...shadow },
  pkr: { color: INK2, fontFamily: font.medium, letterSpacing: 0.6, ...shadow },
  bottom: { flexDirection: 'row', alignItems: 'flex-end', minHeight: 1 },
  holder: { flex: 1, minWidth: 0 },
  small: { color: INK, fontFamily: font.num, marginTop: 1, fontVariant: ['tabular-nums'], ...shadow },
});
