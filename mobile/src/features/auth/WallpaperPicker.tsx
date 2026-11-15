/**
 * Choose the lock-screen / sign-in wallpaper (owner, 2026-11-15: "long press the lock screen and swipe left and right
 * to choose, like Apple"). Opened by a long press on the lock screen or the sign-in landing: each wallpaper is a card
 * in the phone's shape with the Fintraxa mark previewed on it, the neighbours peek at the sides and shrink a little as
 * they leave the centre. Done keeps the one in the middle; Shuffle shows a different one each time. Back closes.
 */
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import { BackHandler, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { Extrapolation, FadeIn, FadeOut, interpolate, useAnimatedScrollHandler, useAnimatedStyle, useSharedValue, type SharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { haptic } from '@/lib/haptics';
import { useApp } from '@/lib/store';
import { Shuffle } from '@/ui/icons';
import { Text } from '@/ui/Text';
import { font } from '@/ui/tokens';
import { WALLPAPERS, type Wallpaper } from './backdrops';

const RATIO = 1080 / 2340;
const GAP = 14;

export function WallpaperPicker({ current, onClose }: { current: string; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const shuffle = useApp((s) => s.wallpaper === null);
  // The card fills the space between the top bar and the name, in the screen's own shape.
  const cardH = Math.min(height - insets.top - insets.bottom - 190, (width * 0.72) / RATIO);
  const cardW = Math.round(cardH * RATIO);
  const step = cardW + GAP;
  const side = (width - cardW) / 2;
  const start = Math.max(0, WALLPAPERS.findIndex((w) => w.id === current));
  const [index, setIndex] = useState(start);
  const x = useSharedValue(start * step);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { onClose(); return true; });
    return () => sub.remove();
  }, [onClose]);

  const onScroll = useAnimatedScrollHandler((e) => { x.set(e.contentOffset.x); });
  const settle = (offset: number) => {
    const i = Math.max(0, Math.min(WALLPAPERS.length - 1, Math.round(offset / step)));
    if (i !== index) { setIndex(i); haptic.tick(); }
  };

  const done = () => { haptic.success(); useApp.getState().set({ wallpaper: WALLPAPERS[index].id }); onClose(); };
  const toggleShuffle = () => { haptic.tick(); useApp.getState().set({ wallpaper: shuffle ? WALLPAPERS[index].id : null }); if (!shuffle) onClose(); };

  return (
    <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(160)} style={[StyleSheet.absoluteFill, styles.root]} accessibilityViewIsModal>
      <Image source={WALLPAPERS[index].source} style={StyleSheet.absoluteFill} contentFit="cover" blurRadius={40} transition={250} />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.55)' }]} />

      <View style={[styles.top, { paddingTop: insets.top + 10 }]}>
        <Pressable onPress={toggleShuffle} accessibilityRole="switch" accessibilityState={{ checked: shuffle }} accessibilityLabel="Shuffle wallpapers"
          style={({ pressed }) => [styles.chip, shuffle && styles.chipOn, { opacity: pressed ? 0.8 : 1 }]}>
          <Shuffle size={15} color={shuffle ? '#000' : '#fff'} strokeWidth={2.2} />
          <Text style={[styles.chipText, shuffle && { color: '#000' }]}>Shuffle</Text>
        </Pressable>
        <Pressable onPress={done} accessibilityRole="button" accessibilityLabel={`Use ${WALLPAPERS[index].name}`}
          style={({ pressed }) => [styles.done, { opacity: pressed ? 0.8 : 1 }]}>
          <Text style={styles.doneText}>Done</Text>
        </Pressable>
      </View>

      <Animated.FlatList
        data={WALLPAPERS}
        keyExtractor={(w) => w.id}
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={step}
        decelerationRate="fast"
        contentContainerStyle={{ paddingHorizontal: side, alignItems: 'center' }}
        ItemSeparatorComponent={() => <View style={{ width: GAP }} />}
        initialScrollIndex={start}
        getItemLayout={(_, i) => ({ length: step, offset: step * i, index: i })}
        onScroll={onScroll}
        scrollEventThrottle={16}
        onMomentumScrollEnd={(e) => settle(e.nativeEvent.contentOffset.x)}
        onScrollEndDrag={(e) => settle(e.nativeEvent.contentOffset.x)}
        style={styles.list}
        renderItem={({ item, index: i }) => <Card w={item} i={i} x={x} step={step} cardW={cardW} cardH={cardH} />}
      />

      <View style={[styles.foot, { paddingBottom: insets.bottom + 22 }]}>
        <Text style={styles.name}>{WALLPAPERS[index].name}</Text>
        <Text style={styles.count}>{index + 1} of {WALLPAPERS.length} · swipe to browse</Text>
      </View>
    </Animated.View>
  );
}

function Card({ w, i, x, step, cardW, cardH }: { w: Wallpaper; i: number; x: SharedValue<number>; step: number; cardW: number; cardH: number }) {
  const style = useAnimatedStyle(() => {
    const d = interpolate(x.get(), [(i - 1) * step, i * step, (i + 1) * step], [1, 0, 1], Extrapolation.CLAMP);
    return { transform: [{ scale: 1 - 0.08 * d }], opacity: 1 - 0.35 * d };
  });
  return (
    <Animated.View style={[{ width: cardW, height: cardH, borderRadius: 30, overflow: 'hidden', backgroundColor: '#111' }, style]}>
      <Image source={w.source} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} />
      <LinearGradient colors={['rgba(0,0,0,0.35)', 'rgba(0,0,0,0)', 'rgba(0,0,0,0)', 'rgba(0,0,0,0.45)']} locations={[0, 0.3, 0.6, 1]} style={StyleSheet.absoluteFill} />
      {/* What the lock screen will look like: the mark and name near the top, "Swipe up" near the bottom. */}
      <View style={[styles.preview, { top: cardH * 0.12 }]}>
        <Image source={require('../../../assets/mark.png')} style={{ width: cardW * 0.16, height: cardW * 0.16 }} contentFit="contain" />
        <Text style={styles.previewMark} numberOfLines={1}>FINTRAXA</Text>
      </View>
      <Text style={[styles.previewSwipe, { bottom: cardH * 0.2 }]} numberOfLines={1}>Swipe up</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: '#000', zIndex: 50, elevation: 50 },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 18 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 34, paddingHorizontal: 14, borderRadius: 17, backgroundColor: 'rgba(255,255,255,0.16)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)' },
  chipOn: { backgroundColor: '#fff', borderColor: '#fff' },
  chipText: { color: '#fff', fontFamily: font.semibold, fontSize: 13, lineHeight: 17 },
  done: { height: 34, paddingHorizontal: 18, borderRadius: 17, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  doneText: { color: '#000', fontFamily: font.semibold, fontSize: 14, lineHeight: 18 },
  list: { flexGrow: 0, marginTop: 18 },
  foot: { position: 'absolute', left: 0, right: 0, bottom: 0, alignItems: 'center', gap: 3 },
  name: { alignSelf: 'stretch', textAlign: 'center', color: '#fff', fontFamily: font.semibold, fontSize: 16, lineHeight: 21 },
  count: { alignSelf: 'stretch', textAlign: 'center', color: 'rgba(255,255,255,0.6)', fontFamily: font.regular, fontSize: 12, lineHeight: 16 },
  preview: { position: 'absolute', left: 0, right: 0, alignItems: 'center', gap: 4 },
  previewMark: { alignSelf: 'stretch', textAlign: 'center', color: '#fff', fontFamily: font.semibold, fontSize: 9, lineHeight: 12, letterSpacing: 3.5, opacity: 0.92 },
  previewSwipe: { position: 'absolute', left: 0, right: 0, textAlign: 'center', color: 'rgba(255,255,255,0.85)', fontFamily: font.medium, fontSize: 9, lineHeight: 12 },
});
