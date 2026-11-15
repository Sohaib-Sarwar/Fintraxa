/**
 * Wallet's month card (owner, 2026-11-14): swipe left/right through months. Each month is its own card — the
 * current month in the user's chosen design, earlier months in the next designs along — showing Spent as the
 * big figure and Earned (active income), Saved and Passive income as the small ones. While swiping, a real
 * blur fades over the card that is leaving and off the one arriving, with a slight scale and fade (UI thread).
 *
 * Android blur: each page wraps its card in a `BlurTargetView` and lays a `BlurView` of it on top, whose
 * opacity follows the swipe. Android 11 and older get the fade and scale without blur.
 */
import { BlurTargetView, BlurView } from 'expo-blur';
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import Animated, { Extrapolation, interpolate, useAnimatedScrollHandler, useAnimatedStyle, useSharedValue, type SharedValue } from 'react-native-reanimated';
import { haptic } from '@/lib/haptics';
import { useApp } from '@/lib/store';
import { useHidden } from '@/ui/Figures';
import { CARD_DESIGNS } from '../today/cardDesigns';
import { useCardPicker } from '../today/cardPickerStore';
import { CardFace, CARD_RATIO, type Holder } from '../today/NetWorthCard';

const AnimatedFlatList = Animated.createAnimatedComponent(FlatList<string>);

export type MonthFigures = { label: string; spent: number; holders: Holder[]; onPress?: () => void; aside?: React.ReactNode };

function Page({ index, x, width, design, fig, onLongPress }: {
  index: number; x: SharedValue<number>; width: number; design: (typeof CARD_DESIGNS)[number]['id']; fig: MonthFigures; onLongPress: () => void;
}) {
  const hidden = useHidden();
  const target = useRef<ComponentRef<typeof View>>(null);
  const card = useAnimatedStyle(() => {
    const d = Math.min(1, Math.abs(x.get() - index * width) / width);
    return { opacity: interpolate(d, [0, 1], [1, 0.4], Extrapolation.CLAMP), transform: [{ scale: interpolate(d, [0, 1], [1, 0.92], Extrapolation.CLAMP) }] };
  });
  const blur = useAnimatedStyle(() => ({ opacity: Math.min(1, (Math.abs(x.get() - index * width) / width) * 1.6) }));
  return (
    <View style={{ width }}>
      <Animated.View style={card}>
        <BlurTargetView ref={target}>
          <CardFace design={design} label={fig.label} value={fig.spent} holders={fig.holders} width={width} hidden={hidden}
            onPress={fig.onPress} onLongPress={onLongPress} aside={fig.aside} />
        </BlurTargetView>
        <Animated.View pointerEvents="none" style={[styles.blur, { borderRadius: 22 }, blur]}>
          <BlurView blurTarget={target} blurMethod="dimezisBlurViewSdk31Plus" intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
        </Animated.View>
      </Animated.View>
    </View>
  );
}

/** `months` oldest → newest; `month` is the one shown; `figures(month)` gives each card's numbers. */
export function MonthCardPager({ months, month, onChange, figures }: {
  months: string[]; month: string; onChange: (m: string) => void; figures: (m: string) => MonthFigures;
}) {
  const [w, setW] = useState(0);
  const chosen = useApp((s) => s.cardDesign);
  const base = Math.max(0, CARD_DESIGNS.findIndex((d) => d.id === chosen));
  const index = Math.max(0, months.indexOf(month));
  const x = useSharedValue(index * w);
  const list = useRef<FlatList<string>>(null);
  const shown = useRef(index);
  const open = useCardPicker((s) => s.open);
  const onScroll = useAnimatedScrollHandler({ onScroll: (e) => { x.set(e.contentOffset.x); } });

  // A month picked elsewhere (a chart bar) scrolls the cards there.
  useEffect(() => {
    if (w && index !== shown.current) { shown.current = index; list.current?.scrollToIndex({ index, animated: true }); }
  }, [index, w]);

  return (
    <View onLayout={(e) => setW(Math.round(e.nativeEvent.layout.width))} style={!w ? { aspectRatio: CARD_RATIO } : null}>
      {w ? (
        <AnimatedFlatList
          ref={list}
          data={months}
          keyExtractor={(m) => m}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          initialScrollIndex={index}
          getItemLayout={(_, i) => ({ length: w, offset: w * i, index: i })}
          onScroll={onScroll}
          scrollEventThrottle={16}
          windowSize={3}
          initialNumToRender={3}
          onMomentumScrollEnd={(e) => {
            const i = Math.max(0, Math.min(months.length - 1, Math.round(e.nativeEvent.contentOffset.x / w)));
            if (i !== shown.current) { shown.current = i; haptic.tick(); onChange(months[i]); }
          }}
          renderItem={({ item, index: i }) => {
            const fig = figures(item);
            // Newest month = the chosen design; each month back takes the next design along.
            const design = CARD_DESIGNS[(base + (months.length - 1 - i)) % CARD_DESIGNS.length].id;
            return <Page index={i} x={x} width={w} design={design} fig={fig}
              onLongPress={() => { haptic.light(); open({ label: fig.label, value: fig.spent, holders: fig.holders.map(({ label, value }) => ({ label, value })) }); }} />;
          }}
          accessibilityLabel="Months. Swipe left or right to change month"
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  blur: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden' },
});
