/**
 * Card-design picker, Google Wallet style (owner, 2026-11-14): long-press Home's card → the whole screen blurs
 * (nav included) and the card lifts into a horizontal carousel. The centred card is full size; neighbours peek
 * in, smaller and dimmed, and everything scales/fades continuously with the finger (UI thread, eased snap).
 * Swipe through them and tap a design to use it (owner: no Done button); back or a tap outside cancels.
 * Under the centred design, its matching accent colour is suggested: "Use with Champagne" applies both.
 *
 * Android blur needs a `BlurTargetView`: the tabs layout wraps the navigator in one and passes it here.
 */
import { BlurView } from 'expo-blur';
import { useEffect, useState, type ComponentRef, type RefObject } from 'react';
import { BackHandler, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, {
  Easing, Extrapolation, FadeIn, FadeOut, interpolate, scrollTo, useAnimatedRef, useAnimatedScrollHandler, useAnimatedStyle, useSharedValue, withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN, scheduleOnUI } from 'react-native-worklets';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { haptic } from '@/lib/haptics';
import { useApp } from '@/lib/store';
import { useHidden } from '@/ui/Figures';
import { Text } from '@/ui/Text';
import { ACCENTS, font, space } from '@/ui/tokens';
import { CARD_DESIGNS } from './cardDesigns';
import { useCardPicker } from './cardPickerStore';
import { CARD_RATIO, CardFace } from './NetWorthCard';

const EASE = Easing.bezier(0.2, 0, 0, 1);
const GAP = 14;
/** Endless carousel (owner, 2026-11-15): the designs three times over; after each swipe the scroll re-centres on the
 * middle copy without animation (identical slides, so it is invisible) — there is never an end. */
const N = CARD_DESIGNS.length;
const COPIES = 3;
/** Only cards near the current one are drawn (26 designs × 3 copies would be heavy). */
const NEAR = 6;

function lift() {
  'worklet';
  return {
    initialValues: { opacity: 0, transform: [{ translateY: 28 }, { scale: 0.94 }] },
    animations: {
      opacity: withTiming(1, { duration: 260, easing: EASE }),
      transform: [{ translateY: withTiming(0, { duration: 340, easing: EASE }) }, { scale: withTiming(1, { duration: 340, easing: EASE }) }],
    },
  };
}

function Slide({ index, x, step, children }: { index: number; x: SharedValue<number>; step: number; children: React.ReactNode }) {
  const style = useAnimatedStyle(() => {
    const d = Math.abs(x.get() - index * step) / step;
    return {
      opacity: interpolate(d, [0, 1], [1, 0.45], Extrapolation.CLAMP),
      transform: [
        { scale: interpolate(d, [0, 1], [1, 0.86], Extrapolation.CLAMP) },
        { translateY: interpolate(d, [0, 1], [0, 12], Extrapolation.CLAMP) },
      ],
    };
  });
  return <Animated.View style={style}>{children}</Animated.View>;
}

export function CardPicker({ blurTarget }: { blurTarget: RefObject<ComponentRef<typeof View> | null> }) {
  const card = useCardPicker((s) => s.card);
  const close = useCardPicker((s) => s.close);
  const hidden = useHidden();
  const insets = useSafeAreaInsets();
  const { width: W } = useWindowDimensions();
  const itemW = Math.round(W * 0.8);
  const step = itemW + GAP;
  const side = (W - itemW) / 2;
  const saved = useApp((s) => s.cardDesign);
  const start = N + Math.max(0, CARD_DESIGNS.findIndex((d) => d.id === saved));
  // `pos`: position in the tripled strip; the design is pos % N.
  const [pos, setPos] = useState(start);
  const index = pos % N;
  // Which slide is under the finger, updated DURING the swipe (UI thread → JS only when it changes), so the cards
  // ahead are already drawn when they arrive — no pop-in on a fast flick.
  const [center, setCenter] = useState(start);
  const lastCenter = useSharedValue(start);
  const x = useSharedValue(start * step);
  const ref = useAnimatedRef<Animated.ScrollView>();

  const onScroll = useAnimatedScrollHandler({
    onScroll: (e) => {
      x.set(e.contentOffset.x);
      const g = Math.round(e.contentOffset.x / step);
      if (g !== lastCenter.get()) { lastCenter.set(g); scheduleOnRN(setCenter, g); }
    },
  });

  const accent = useApp((s) => s.accent);
  const choose = (i: number, withAccent = false) => {
    useApp.getState().set(withAccent ? { cardDesign: CARD_DESIGNS[i].id, accent: CARD_DESIGNS[i].accent } : { cardDesign: CARD_DESIGNS[i].id });
    haptic.success();
    close();
  };

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { close(); return true; });
    return () => sub.remove();
  }, [close]);

  if (!card) return null;
  return (
    <Animated.View entering={FadeIn.duration(240).easing(EASE)} exiting={FadeOut.duration(200).easing(EASE)} style={StyleSheet.absoluteFill}>
      <BlurView blurTarget={blurTarget} blurMethod="dimezisBlurViewSdk31Plus" intensity={70} tint="dark" style={StyleSheet.absoluteFill} />
      <Pressable style={[StyleSheet.absoluteFill, styles.scrim]} onPress={close} accessibilityRole="button" accessibilityLabel="Close without changing the design" />

      <View style={[styles.center, { paddingTop: insets.top, paddingBottom: insets.bottom }]} pointerEvents="box-none">
        <Animated.View entering={lift} pointerEvents="box-none">
          <Text style={styles.title} accessibilityRole="header">Card style</Text>
          <Text style={styles.sub}>Swipe, then tap a design to use it</Text>

          <Animated.ScrollView
            ref={ref}
            horizontal
            showsHorizontalScrollIndicator={false}
            snapToInterval={step}
            decelerationRate="fast"
            disableIntervalMomentum
            onScroll={onScroll}
            scrollEventThrottle={16}
            contentContainerStyle={{ paddingHorizontal: side, gap: GAP, paddingVertical: space.lg }}
            onLayout={() => scheduleOnUI(() => { 'worklet'; scrollTo(ref, start * step, 0, false); })}
            onMomentumScrollEnd={(e) => {
              const g = Math.max(0, Math.min(N * COPIES - 1, Math.round(e.nativeEvent.contentOffset.x / step)));
              const centred = N + (g % N);
              if (centred !== g) {
                x.set(centred * step);
                scheduleOnUI(() => { 'worklet'; scrollTo(ref, centred * step, 0, false); });
              }
              if (g % N !== index) haptic.tick();
              setPos(centred);
              lastCenter.set(centred);
              setCenter(centred);
            }}
          >
            {Array.from({ length: N * COPIES }, (_, g) => {
              const d = CARD_DESIGNS[g % N];
              const near = Math.abs(g - center) <= NEAR || Math.abs(g - pos) <= 1;
              return (
                <Slide key={`${g}`} index={g} x={x} step={step}>
                  {near ? (
                    <CardFace design={d.id} label={card.label} value={card.value} holders={card.holders} width={itemW} hidden={hidden}
                      onPress={() => choose(g % N)} />
                  ) : <View style={{ width: itemW, height: itemW / CARD_RATIO, borderRadius: 22, backgroundColor: '#0A0A0B' }} />}
                </Slide>
              );
            })}
          </Animated.ScrollView>

          <Text style={styles.name} accessibilityLiveRegion="polite">{CARD_DESIGNS[index].name}</Text>
          <Text style={styles.count}>{index + 1} / {N}</Text>
          {CARD_DESIGNS[index].accent !== accent ? (
            <Pressable onPress={() => choose(index, true)} accessibilityRole="button" style={({ pressed }) => [styles.match, { opacity: pressed ? 0.8 : 1 }]}
              accessibilityLabel={`Use this card with the matching ${ACCENTS[CARD_DESIGNS[index].accent].name} accent colour`}>
              <View style={[styles.matchDot, { backgroundColor: ACCENTS[CARD_DESIGNS[index].accent].fill }]} />
              <Text style={styles.matchText}>Use with {ACCENTS[CARD_DESIGNS[index].accent].name} accent</Text>
            </Pressable>
          ) : <Text style={styles.current}>{saved === CARD_DESIGNS[index].id ? 'Current design · accent matches' : 'Accent already matches'}</Text>}
        </Animated.View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  scrim: { backgroundColor: 'rgba(0,0,0,0.45)' },
  center: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center' },
  title: { color: '#F5F5F3', fontFamily: font.bold, fontSize: 22, textAlign: 'center' },
  sub: { color: 'rgba(245,245,243,0.6)', fontFamily: font.regular, fontSize: 13, textAlign: 'center', marginTop: 4 },
  name: { color: '#F5F5F3', fontFamily: font.semibold, fontSize: 15, textAlign: 'center', marginTop: space.sm },
  count: { color: 'rgba(245,245,243,0.55)', fontFamily: font.numMedium, fontSize: 12, textAlign: 'center', marginTop: 4 },
  match: { flexDirection: 'row', alignItems: 'center', alignSelf: 'center', gap: 8, marginTop: space.md, paddingHorizontal: 14, paddingVertical: 9,
    borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.10)', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.18)' },
  matchDot: { width: 14, height: 14, borderRadius: 7, borderWidth: 1, borderColor: 'rgba(255,255,255,0.5)' },
  matchText: { color: '#F5F5F3', fontFamily: font.semibold, fontSize: 13 },
  current: { color: 'rgba(245,245,243,0.55)', fontFamily: font.regular, fontSize: 12, textAlign: 'center', marginTop: space.sm },
});
