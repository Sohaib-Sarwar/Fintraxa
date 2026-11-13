import { router } from 'expo-router';
import { ChevronLeft } from '@/ui/icons';
import { useState, type ReactNode } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IconButton } from './primitives';
import { Text } from './Text';
import { useTheme } from './theme';
import { SCREEN_PAD, space } from './tokens';

type Props = {
  title?: string;
  /** Small line above the title (e.g. "Good evening"). */
  eyebrow?: string;
  right?: ReactNode;
  back?: boolean;
  children: ReactNode;
  onRefresh?: () => Promise<unknown>;
  scroll?: boolean;
  /** Extra bottom space so content clears the tab bar. */
  tabBar?: boolean;
};

/** Edge-to-edge screen: safe areas, large title, pull-to-refresh with the accent spinner. */
export function Screen({ title, eyebrow, right, back, children, onRefresh, scroll = true, tabBar = false }: Props) {
  const p = useTheme();
  const insets = useSafeAreaInsets();
  const [refreshing, setRefreshing] = useState(false);
  const refresh = onRefresh ? async () => {
    setRefreshing(true);
    try { await onRefresh(); } finally { setRefreshing(false); }
  } : undefined;

  const header = (title || back || right) ? (
    <View style={[styles.header, { paddingTop: insets.top + space.sm }]}>
      <View style={styles.headerRow}>
        {back ? <View style={{ marginLeft: -12 }}><IconButton icon={ChevronLeft} label="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} size={26} /></View> : null}
        <View style={{ flex: 1 }} />
        {right}
      </View>
      {eyebrow ? <Text variant="label" tone="ink2">{eyebrow}</Text> : null}
      {title ? <Text variant="title" accessibilityRole="header" numberOfLines={2}>{title}</Text> : null}
    </View>
  ) : <View style={{ height: insets.top }} />;

  const bottom = (tabBar ? 96 : space.xxl) + insets.bottom;
  if (!scroll) {
    return <View style={[styles.flex, { backgroundColor: p.bg }]}>{header}<View style={[styles.flex, { paddingHorizontal: SCREEN_PAD }]}>{children}</View></View>;
  }
  return (
    <ScrollView
      style={[styles.flex, { backgroundColor: p.bg }]}
      contentContainerStyle={{ paddingBottom: bottom }}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      refreshControl={refresh ? <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={p.accent} colors={[p.accentInk]} progressBackgroundColor={p.accent} progressViewOffset={insets.top} /> : undefined}
    >
      {header}
      <View style={{ paddingHorizontal: SCREEN_PAD }}>{children}</View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { paddingHorizontal: SCREEN_PAD, paddingBottom: space.md },
  headerRow: { flexDirection: 'row', alignItems: 'center', minHeight: 48 },
});
