import { Tabs, router } from 'expo-router';
import { CircleUser, House, Plus, TrendingUp, Wallet, type LucideIcon } from '@/ui/icons';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useUid } from '@/data/queries';
import { haptic } from '@/lib/haptics';
import { useTracks } from '@/lib/store';
import { Text } from '@/ui/Text';
import { useTheme } from '@/ui/theme';

const ICONS: Record<string, { icon: LucideIcon; label: string }> = {
  index: { icon: House, label: 'Today' },
  money: { icon: Wallet, label: 'Money' },
  invest: { icon: TrendingUp, label: 'Invest' },
  me: { icon: CircleUser, label: 'Me' },
};

type BarProps = { state: { index: number; routes: { key: string; name: string }[] }; navigation: { navigate: (name: string) => void; emit: (e: { type: 'tabPress'; target: string; canPreventDefault: true }) => { defaultPrevented: boolean } } };

/**
 * Bottom bar (plan §4): Today · Money · [+] · Invest · Me. The centre button is an action, not a tab —
 * it opens Add (expense first). Tabs the user doesn't track are hidden (href: null → not in routes).
 */
function TabBar({ state, navigation }: BarProps) {
  const p = useTheme();
  const insets = useSafeAreaInsets();
  const t = useTracks(useUid());
  // Tabs the user doesn't track are hidden (also set as href: null below, which keeps them out of links).
  const hidden = new Set([...(t.spending ? [] : ['money']), ...(t.funds || t.stocks ? [] : ['invest'])]);
  const routes = state.routes.filter((r) => ICONS[r.name] && !hidden.has(r.name));
  const half = Math.ceil(routes.length / 2);
  const tab = (r: { key: string; name: string }) => {
    const focused = state.routes[state.index]?.key === r.key;
    const { icon: Icon, label } = ICONS[r.name];
    return (
      <Pressable
        key={r.key}
        accessibilityRole="tab"
        accessibilityState={{ selected: focused }}
        accessibilityLabel={label}
        onPress={() => {
          const e = navigation.emit({ type: 'tabPress', target: r.key, canPreventDefault: true });
          if (!focused && !e.defaultPrevented) { haptic.tick(); navigation.navigate(r.name); }
        }}
        style={styles.tab}
      >
        <Icon size={23} color={focused ? p.ink : p.muted} strokeWidth={focused ? 2.2 : 1.8} />
        <Text variant="caption" style={{ color: focused ? p.ink : p.muted, fontFamily: focused ? 'Inter_600SemiBold' : 'Inter_500Medium', fontSize: 11 }}>{label}</Text>
      </Pressable>
    );
  };
  return (
    <View style={[styles.bar, { backgroundColor: p.bg, borderTopColor: p.border, paddingBottom: Math.max(insets.bottom, 8) }]}>
      {routes.slice(0, half).map(tab)}
      <View style={styles.fabSlot}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add a transaction"
          onPress={() => { haptic.light(); router.push('/add'); }}
          style={({ pressed }) => [styles.fab, { backgroundColor: p.accent, transform: [{ scale: pressed ? 0.94 : 1 }] }]}
        >
          <Plus size={28} color={p.accentInk} strokeWidth={2.4} />
        </Pressable>
      </View>
      {routes.slice(half).map(tab)}
    </View>
  );
}

export default function TabsLayout() {
  const uid = useUid();
  const t = useTracks(uid);
  const invest = t.funds || t.stocks;
  return (
    <Tabs screenOptions={{ headerShown: false, animation: 'shift' }} tabBar={(props) => <TabBar {...(props as unknown as BarProps)} />}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="money" options={{ href: t.spending ? undefined : null }} />
      <Tabs.Screen name="invest" options={{ href: invest ? undefined : null }} />
      <Tabs.Screen name="me" />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'flex-start', borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 8, position: 'absolute', left: 0, right: 0, bottom: 0 },
  tab: { flex: 1, alignItems: 'center', gap: 3, minHeight: 52, justifyContent: 'center' },
  fabSlot: { width: 76, alignItems: 'center' },
  fab: { width: 58, height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center', marginTop: -22,
    shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 8 },
});
