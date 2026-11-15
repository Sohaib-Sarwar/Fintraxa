/**
 * The frame every glass bottom sheet uses (owner, 2026-11-14: "smooth, follows my finger up and down"):
 * a blurred, dimmed backdrop and a panel that glides up on open. Drag the panel down and it follows the finger
 * while the backdrop fades with it; past 120 dp (or a flick) it closes, otherwise it glides back. Dragging up
 * gives a little rubber-band resistance. Back and a tap outside close it with the same glide. All on the UI
 * thread; eased timing, no springs.
 *
 * `dragWholePanel`: the whole panel drags (sheets without scrolling); otherwise only the handle area does, so
 * a list inside can scroll. Rendered in-page so Android can blur the page's `BlurTargetView`.
 */
import { BlurView } from 'expo-blur';
import { useCallback, useEffect, type ComponentRef, type ReactNode, type RefObject } from 'react';
import { BackHandler, Pressable, StyleSheet, useWindowDimensions, View, type StyleProp, type ViewStyle } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, { Easing, Extrapolation, interpolate, useAnimatedKeyboard, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { useTheme } from './theme';
import { alpha } from './tokens';

const EASE = Easing.bezier(0.2, 0, 0, 1);
const OPEN = { duration: 340, easing: EASE };
const SETTLE = { duration: 260, easing: EASE };
const CLOSE = { duration: 240, easing: Easing.in(Easing.cubic) };

export function SheetFrame({ blurTarget, intensity, scrim, panelStyle, onClose, handle, decor, dragWholePanel = false, maxHeight, children }: {
  blurTarget: RefObject<ComponentRef<typeof View> | null>; intensity: number; scrim: number; panelStyle: StyleProp<ViewStyle>;
  onClose: () => void; handle: ReactNode; dragWholePanel?: boolean; children: (close: () => void) => ReactNode;
  /** Absolute decoration on the PANEL itself (e.g. the glass sheen), so the panel's rounded corners clip it. */
  decor?: ReactNode;
  /** The panel's normal max height; while the keyboard is up it shrinks to fit above it. */
  maxHeight?: number;
}) {
  const p = useTheme();
  const { height } = useWindowDimensions();
  const y = useSharedValue(height);
  // Keyboard-aware (owner, 2026-11-15): Android draws edge-to-edge, so the window no longer resizes for the
  // keyboard — the panel rides on top of it instead, and shrinks so its inputs stay visible.
  const kb = useAnimatedKeyboard();

  useEffect(() => { y.set(withTiming(0, OPEN)); }, [y]);

  const close = useCallback(() => {
    y.set(withTiming(height, CLOSE, (done) => { if (done) scheduleOnRN(onClose); }));
  }, [y, height, onClose]);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { close(); return true; });
    return () => sub.remove();
  }, [close]);

  const pan = usePanGesture({
    activeOffsetY: [-8, 8],
    failOffsetX: [-24, 24],
    onUpdate: (e) => {
      'worklet';
      const t = e.translationY;
      y.set(t >= 0 ? t : -Math.sqrt(-t) * 3); // rubber band upward
    },
    onDeactivate: (e) => {
      'worklet';
      if (e.translationY > 120 || e.velocityY > 900) y.set(withTiming(height, CLOSE, (done) => { if (done) scheduleOnRN(onClose); }));
      else y.set(withTiming(0, SETTLE));
    },
  });

  const panel = useAnimatedStyle(() => {
    const k = kb.height.get();
    return maxHeight
      ? { transform: [{ translateY: y.get() - k }], maxHeight: k > 0 ? Math.min(maxHeight, height - k - 56) : maxHeight }
      : { transform: [{ translateY: y.get() - k }] };
  });
  const backdrop = useAnimatedStyle(() => ({ opacity: interpolate(y.get(), [0, height * 0.55], [1, 0], Extrapolation.CLAMP) }));
  const dark = p.mode === 'dark';

  const body = children(close);
  return (
    <View style={StyleSheet.absoluteFill}>
      <Animated.View style={[StyleSheet.absoluteFill, backdrop]}>
        <BlurView blurTarget={blurTarget} blurMethod="dimezisBlurViewSdk31Plus" intensity={intensity} blurReductionFactor={2} tint={dark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
        <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: alpha('#000000', scrim) }]} onPress={close}
          accessibilityRole="button" accessibilityLabel="Close" />
      </Animated.View>
      {dragWholePanel ? (
        <GestureDetector gesture={pan}>
          <Animated.View accessibilityViewIsModal style={[panelStyle, panel]}>{decor}{handle}{body}</Animated.View>
        </GestureDetector>
      ) : (
        <Animated.View accessibilityViewIsModal style={[panelStyle, panel]}>
          {decor}
          <GestureDetector gesture={pan}><View>{handle}</View></GestureDetector>
          {body}
        </Animated.View>
      )}
    </View>
  );
}
