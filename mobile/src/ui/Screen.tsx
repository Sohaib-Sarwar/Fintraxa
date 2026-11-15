import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { KeyboardAvoidingView, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft } from './icons';
import { CircleButton } from './primitives';
import { Text } from './Text';
import { useTheme } from './theme';
import { NAV_CLEARANCE, SCREEN_PAD, space } from './tokens';

type Props = {
  /** Large title at the left of the header row (tab screens). */
  title?: string;
  /** Detail screens: round back button, title centred. */
  back?: boolean;
  right?: ReactNode;
  /** Fully custom header row (Home's greeting). */
  header?: ReactNode;
  children: ReactNode;
  onRefresh?: () => Promise<unknown>;
  scroll?: boolean;
  /** Extra bottom space so content clears the floating nav. */
  tabBar?: boolean;
  /** Override the bottom space (above the safe area); Home uses it to sit its cards right above the nav. */
  bottomSpace?: number;
  /** Height of the scrolling viewport, once laid out (Home sizes its cards to fill it). */
  onViewport?: (height: number) => void;
};

/**
 * Edge-to-edge screen with ONE compact header row directly under the status bar (no empty rows — the old
 * header stacked an empty 48 dp action row above the title, which read as a blank gap on every screen).
 */
export function Screen({ title, back, right, header, children, onRefresh, scroll = true, tabBar = false, bottomSpace, onViewport }: Props) {
  const p = useTheme();
  const insets = useSafeAreaInsets();
  const [refreshing, setRefreshing] = useState(false);
  const refresh = onRefresh ? async () => {
    setRefreshing(true);
    try { await onRefresh(); } finally { setRefreshing(false); }
  } : undefined;

  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const row = header ?? (back ? (
    <View style={styles.row}>
      <CircleButton icon={ChevronLeft} label="Back" onPress={goBack} />
      <Text variant="headline" numberOfLines={1} style={styles.centerTitle} accessibilityRole="header">{title ?? ''}</Text>
      <View style={styles.side}>{right ?? <View style={{ width: 44 }} />}</View>
    </View>
  ) : title || right ? (
    <View style={styles.row}>
      <Text variant="title" numberOfLines={1} style={{ flex: 1 }} accessibilityRole="header">{title ?? ''}</Text>
      {right ? <View style={styles.side}>{right}</View> : null}
    </View>
  ) : null);

  const top = <View style={{ paddingTop: insets.top + space.sm, paddingHorizontal: SCREEN_PAD, paddingBottom: row ? space.md : 0 }}>{row}</View>;
  const bottom = (bottomSpace ?? (tabBar ? NAV_CLEARANCE : space.xxl)) + insets.bottom;

  // Dark theme is flat pitch black (owner); the light theme keeps its faint glow.
  const glow = p.mode === 'dark' ? null : <LinearGradient pointerEvents="none" colors={[p.glow, 'transparent']} start={{ x: 0.85, y: 0 }} end={{ x: 0.3, y: 0.55 }} style={styles.glow} />;
  if (!scroll) {
    return <View style={[styles.flex, { backgroundColor: p.bg }]}>{glow}{top}<View style={[styles.flex, { paddingHorizontal: SCREEN_PAD }]}>{children}</View></View>;
  }
  // Inputs stay above the keyboard (edge-to-edge Android doesn't resize the window any more).
  return (
    <KeyboardAvoidingView behavior="padding" style={[styles.flex, { backgroundColor: p.bg }]}>
    {glow}
    <ScrollView
      style={styles.flex}
      onLayout={onViewport ? (e) => onViewport(e.nativeEvent.layout.height) : undefined}
      contentContainerStyle={{ paddingBottom: bottom }}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      refreshControl={refresh ? <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={p.accent} colors={[p.accentInk]} progressBackgroundColor={p.accent} progressViewOffset={insets.top} /> : undefined}
    >
      {top}
      <View style={{ paddingHorizontal: SCREEN_PAD }}>{children}</View>
    </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  glow: { position: 'absolute', top: 0, left: 0, right: 0, height: 460 },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 44, gap: space.md },
  centerTitle: { flex: 1, textAlign: 'center' },
  side: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minWidth: 44, justifyContent: 'flex-end' },
});
