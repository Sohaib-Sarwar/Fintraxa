/**
 * Bottom sheet (plan §7.3/§7.5): springs up from the bottom, closes on the back gesture/button (before the
 * screen does), on a backdrop tap, or by dragging the handle down. RN Modal + Reanimated + Gesture Handler
 * (all in Expo Go). The drag runs as a UI-thread worklet; only the "close" decision hops to JS.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { GestureDetector, GestureHandlerRootView, usePanGesture } from 'react-native-gesture-handler';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';
import { Text } from './Text';
import { useTheme } from './theme';
import { radius, SCREEN_PAD, space } from './tokens';

type Props = {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  /** Fraction of the screen height the sheet may use at most. */
  maxHeight?: number;
  scroll?: boolean;
  footer?: ReactNode;
};

const SPRING = { damping: 26, stiffness: 260, mass: 0.9 };

export function Sheet({ open, onClose, title, children, maxHeight = 0.9, scroll = true, footer }: Props) {
  const p = useTheme();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  // Stay mounted while the closing animation runs; mounting on open is derived during render.
  const [mounted, setMounted] = useState(open);
  if (open && !mounted) setMounted(true);
  const y = useSharedValue(height);
  const fade = useSharedValue(0);

  useEffect(() => {
    if (open) {
      y.value = height;
      y.value = withSpring(0, SPRING);
      fade.value = withTiming(1, { duration: 220 });
    } else {
      fade.value = withTiming(0, { duration: 180 });
      y.value = withTiming(height, { duration: 220, easing: Easing.in(Easing.cubic) }, (done) => { if (done) scheduleOnRN(setMounted, false); });
    }
  }, [open, height, y, fade]);

  const drag = usePanGesture({
    activeOffsetY: 8,
    failOffsetX: [-24, 24],
    onUpdate: (e) => { 'worklet'; y.set(Math.max(0, e.translationY)); },
    onDeactivate: (e) => {
      'worklet';
      if (e.translationY > 120 || e.velocityY > 1100) scheduleOnRN(onClose);
      else y.set(withSpring(0, SPRING));
    },
  });

  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
  const backdropStyle = useAnimatedStyle(() => ({ opacity: fade.value }));

  if (!mounted) return null;
  const Body = scroll ? ScrollView : View;
  return (
    <Modal visible transparent animationType="none" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      <GestureHandlerRootView style={styles.fill}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.fill}>
          <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: p.scrim }, backdropStyle]}>
            <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" />
          </Animated.View>
          <Animated.View
            accessibilityViewIsModal
            style={[styles.sheet, { backgroundColor: p.surface, maxHeight: height * maxHeight, paddingBottom: Math.max(insets.bottom, space.lg) }, p.mode === 'light' && styles.shadow, sheetStyle]}
          >
            <GestureDetector gesture={drag}>
              <View style={styles.handleArea}>
                <View style={[styles.handle, { backgroundColor: p.surface3 }]} />
                {title ? <Text variant="headline" style={styles.title} accessibilityRole="header">{title}</Text> : null}
              </View>
            </GestureDetector>
            <Body style={styles.body} contentContainerStyle={scroll ? { paddingBottom: space.lg } : undefined} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              {children}
            </Body>
            {footer ? <View style={styles.footer}>{footer}</View> : null}
          </Animated.View>
        </KeyboardAvoidingView>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, borderTopLeftRadius: radius.sheet, borderTopRightRadius: radius.sheet },
  shadow: { shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 24, shadowOffset: { width: 0, height: -6 }, elevation: 16 },
  handleArea: { paddingTop: 10, paddingBottom: space.sm, paddingHorizontal: SCREEN_PAD },
  handle: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, marginBottom: space.md },
  title: { marginBottom: space.xs },
  body: { paddingHorizontal: SCREEN_PAD, flexGrow: 0 },
  footer: { paddingHorizontal: SCREEN_PAD, paddingTop: space.md },
});
