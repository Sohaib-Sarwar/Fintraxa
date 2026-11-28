/**
 * Passive income's card, two pages (owner, 2026-11-28): swipe left from the period card to the live card, the
 * web's "earned since you logged in" counter with the widget's logic — Earned today counting up from midnight to the
 * fourth decimal, with Last night, Yesterday and This month underneath. Same card face and swipe (blur, scale,
 * fade) as Wallet's month cards. Figures: features/widget/earnings.ts (the web's passive rate, this tax year, all
 * passive income; This month = what was actually received, as on the period card).
 */
import { BlurTargetView, BlurView } from 'expo-blur';
import { useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import Animated, { Extrapolation, interpolate, useAnimatedScrollHandler, useAnimatedStyle, useSharedValue, type SharedValue } from 'react-native-reanimated';
import type { PassiveEvent } from '@/data/engines';
import { CARD_DESIGNS, type CardDesignId } from '@/features/today/cardDesigns';
import { useCardPicker } from '@/features/today/cardPickerStore';
import { CardFace, CARD_RATIO, useCardInk, type Holder } from '@/features/today/NetWorthCard';
import { fromEvents, liveDecimals, rupees, SLEEP_PRESETS, sleepLabel, widgetFigures, WIDGET_SOURCES } from '@/features/widget/earnings';
import { haptic } from '@/lib/haptics';
import { useApp } from '@/lib/store';
import { useHidden } from '@/ui/Figures';
import { Text } from '@/ui/Text';
import { font, space } from '@/ui/tokens';
import { useLiveSheet } from './LiveSheet';

const AnimatedFlatList = Animated.createAnimatedComponent(FlatList<number>);
const MINUTE = 60_000;
const SLEEP = SLEEP_PRESETS[1]; // 11 pm – 7 am, as on the widget

type Rate = { at: number; today: number; perSecond: number };

/** The big figure on the live card: repaints itself 10 times a second (like the web), the card does not. */
function LiveFigure({ rate, size, hidden }: { rate: Rate | null; size: number; hidden: boolean }) {
  const c = useCardInk();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 100); return () => clearInterval(id); }, []);
  // A new day starts at midnight: from then on "today" counts from zero.
  const midnight = new Date(now); midnight.setHours(0, 0, 0, 0);
  const value = !rate ? 0 : rate.at < midnight.getTime()
    ? rate.perSecond * ((now - midnight.getTime()) / 1000)
    : rate.today + rate.perSecond * ((now - rate.at) / 1000);
  const text = hidden ? '••••••' : rupees(value, liveDecimals(value)).replace(/^Rs /, '');
  return (
    <Text style={[c.shadow && styles.shadow, { color: c.ink, fontFamily: font.numHeavy, fontSize: size, lineHeight: size * 1.18, letterSpacing: -1, fontVariant: ['tabular-nums'] }]}
      numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6} accessibilityLabel={hidden ? 'Amount hidden' : `Earned today ${rupees(value, 2)}`}>
      {text}
    </Text>
  );
}

function Page({ index, x, width, children }: { index: number; x: SharedValue<number>; width: number; children: React.ReactNode }) {
  const target = useRef<ComponentRef<typeof View>>(null);
  const card = useAnimatedStyle(() => {
    const d = Math.min(1, Math.abs(x.get() - index * width) / width);
    return { opacity: interpolate(d, [0, 1], [1, 0.4], Extrapolation.CLAMP), transform: [{ scale: interpolate(d, [0, 1], [1, 0.92], Extrapolation.CLAMP) }] };
  });
  const blur = useAnimatedStyle(() => ({ opacity: Math.min(1, (Math.abs(x.get() - index * width) / width) * 1.6) }));
  return (
    <View style={{ width }}>
      <Animated.View style={card}>
        <BlurTargetView ref={target}>{children}</BlurTargetView>
        <Animated.View pointerEvents="none" style={[styles.blur, blur]}>
          <BlurView blurTarget={target} blurMethod="dimezisBlurViewSdk31Plus" intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
        </Animated.View>
      </Animated.View>
    </View>
  );
}

export function PassiveCardPager({ total, holders, events }: { total: number; holders: Holder[]; events: PassiveEvent[] | null }) {
  const hidden = useHidden();
  const chosen = useApp((s) => s.cardDesign);
  const open = useCardPicker((s) => s.open);
  const [w, setW] = useState(0);
  const [page, setPage] = useState(0);
  const x = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler({ onScroll: (e) => { x.set(e.contentOffset.x); } });

  // The live card's figures, worked out once a minute (the counter itself runs on the rate in between).
  const [minute, setMinute] = useState(() => Math.floor(Date.now() / MINUTE));
  useEffect(() => { const id = setInterval(() => setMinute(Math.floor(Date.now() / MINUTE)), 15_000); return () => clearInterval(id); }, []);
  const stored = useMemo(() => (events ? fromEvents(events) : null), [events]);
  const figs = useMemo(() => (stored ? widgetFigures({ events: stored }, { sources: WIDGET_SOURCES, basis: 'fy', sleep: SLEEP, now: minute * MINUTE }) : null), [stored, minute]);
  const rate: Rate | null = figs ? { at: minute * MINUTE, today: figs.today, perSecond: figs.perSecond } : null;
  const liveHolders: Holder[] = [
    { label: 'Last night', value: figs?.overnight ?? 0 },
    { label: 'Yesterday', value: figs?.yesterday ?? 0 },
    { label: 'This month', value: figs?.month ?? 0 },
  ];
  const openLive = useLiveSheet((s) => s.open);
  const explain = () => {
    if (!figs) return;
    haptic.light();
    const sleepHours = (SLEEP.to - SLEEP.from + 24) % 24 || 24;
    openLive({
      avgPerMonth: figs.average, months: figs.months, perSecond: figs.perSecond, perDay: figs.yesterday, perNight: figs.perSecond * sleepHours * 3600,
      month: figs.month, period: 'This tax year', sleep: sleepLabel(SLEEP), sleepHours,
    });
  };
  // Both pages wear the card design chosen for the app (owner, 2026-11-28: "same card background as all").
  const design: CardDesignId = CARD_DESIGNS.some((d) => d.id === chosen) ? chosen : CARD_DESIGNS[0].id;

  return (
    <View>
      <View onLayout={(e) => setW(Math.round(e.nativeEvent.layout.width))} style={!w ? { aspectRatio: CARD_RATIO } : null}>
        {w ? (
          <AnimatedFlatList
            data={[0, 1]}
            keyExtractor={(i) => String(i)}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onScroll={onScroll}
            scrollEventThrottle={16}
            getItemLayout={(_, i) => ({ length: w, offset: w * i, index: i })}
            onMomentumScrollEnd={(e) => {
              const i = Math.round(e.nativeEvent.contentOffset.x / w);
              if (i !== page) { setPage(i); haptic.tick(); }
            }}
            renderItem={({ item }) => (
              <Page index={item} x={x} width={w}>
                {item === 0 ? (
                  <CardFace design={design} label="Passive income" value={total} holders={holders} width={w} hidden={hidden}
                    onLongPress={() => { haptic.light(); open({ label: 'Passive income', value: total, holders: holders.map(({ label, value }) => ({ label, value })) }); }} />
                ) : (
                  <CardFace design={design} label="Earned today" value={0} holders={liveHolders} width={w} hidden={hidden} onPress={explain}
                    figure={(size) => <LiveFigure rate={rate} size={size} hidden={hidden} />} />
                )}
              </Page>
            )}
            accessibilityLabel="Passive income cards. Swipe left for the live counter"
          />
        ) : null}
      </View>
      <View style={styles.dots} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {[0, 1].map((i) => <View key={i} style={[styles.dot, i === page && styles.dotOn]} />)}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  blur: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden', borderRadius: 22 },
  shadow: { textShadowColor: 'rgba(0,0,0,0.45)', textShadowRadius: 6, textShadowOffset: { width: 0, height: 1 } },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: space.sm },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.22)' },
  dotOn: { width: 16, backgroundColor: 'rgba(255,255,255,0.8)' },
});
