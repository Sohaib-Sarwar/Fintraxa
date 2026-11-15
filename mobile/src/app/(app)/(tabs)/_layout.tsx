import { Tabs } from 'expo-router';
import { BlurTargetView, BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useLayoutEffect, useRef, useState, type ComponentRef, type RefObject } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AddMenu, FAB_CENTER_FROM_BOTTOM, FAB_SIZE } from '@/features/nav/AddMenu';
import { useInvestView, type InvestView } from '@/features/nav/investView';
import { CardPicker } from '@/features/today/CardPicker';
import { WorthSheet } from '@/features/today/WorthSheet';
import { useWorthSheet } from '@/features/today/worthSheetStore';
import { RangeSheet } from '@/features/range/RangeSheet';
import { usePeriodSheet } from '@/features/range/usePeriod';
import { useCardPicker } from '@/features/today/cardPickerStore';
import { useUid } from '@/data/queries';
import { haptic } from '@/lib/haptics';
import { useTracks } from '@/lib/store';
import { useTabBarProps, type BarProps } from '@/features/nav/tabBarStore';
import { CandlestickChart, ChartPie, House, PiggyBank, Plus, TrendingUp, Wallet, type LucideIcon } from '@/ui/icons';
import { Text } from '@/ui/Text';
import { useGlass } from '@/ui/glass';
import { useTheme } from '@/ui/theme';

const TABS: Record<string, { icon: LucideIcon; label: string }> = {
  index: { icon: House, label: 'Home' },
  money: { icon: Wallet, label: 'Wallet' },
  invest: { icon: TrendingUp, label: 'Invest' },
  passive: { icon: PiggyBank, label: 'Passive' },
};
const HALVES: Record<InvestView, { icon: LucideIcon; label: string; a11y: string }> = {
  funds: { icon: ChartPie, label: 'Funds', a11y: 'Mutual funds' },
  stocks: { icon: CandlestickChart, label: 'Stocks', a11y: 'Stocks' },
};
const ORDER = ['index', 'money', 'invest', 'passive'];
/** The + belongs where money is logged (owner): Home and Wallet only. */
const WITH_ADD = new Set(['index', 'money']);
const BAR_H = 66;
const ICON_BTN = 46;
/** The selected pill fills free space up to this width, so it never gets too long (owner). */
const PILL_MAX = 140;

/** Rendered by the navigator in place of a tab bar: publishes its props for the real bar (see tabBarStore). */
function BarBridge(props: BarProps) {
  const set = useTabBarProps((s) => s.set);
  useLayoutEffect(() => { set(props); });
  return null;
}

/**
 * Floating nav (owner's STRICT THEME INSPIRATION): a solid dark capsule with round grey icon buttons; the
 * active tab is an accent pill holding a dark circle with the icon, then its label. The accent "+" sits at the
 * right end on Home and Wallet only; on Invest and Passive the capsule takes the full width and Invest shows as
 * two buttons, Funds (pie) and Stocks (candlestick): on Invest the open one is the pill.
 * The pill grows into free space (capped), so items always fill the bar evenly. No layout animations.
 * Always dark Apple glass (owner, 2026-11-14): smoky frosted glass in both themes — the screen behind blurs through a dark tint
 * with a lit top edge, like Apple's Liquid Glass; Android 11 and older get the tint without blur.
 */
function TabBar({ blurTarget }: { blurTarget: RefObject<ComponentRef<typeof View> | null> }) {
  const bar = useTabBarProps((s) => s.props);
  if (!bar) return null;
  return <TabBarInner state={bar.state} navigateToTab={bar.navigateToTab} blurTarget={blurTarget} />;
}

function TabBarInner({ state, navigateToTab, blurTarget }: Pick<BarProps, 'state' | 'navigateToTab'> & { blurTarget: RefObject<ComponentRef<typeof View> | null> }) {
  const p = useTheme();
  const glass = true; // the nav is always glass; with the Glass style its tint follows the transparency setting
  const liquid = useGlass();
  // Dark smoky glass in both themes (owner: "a dark look along with the glassy effect"): light icons on it.
  const idleIcon = '#D5DAD3';
  const idleBg = glass ? 'rgba(255,255,255,0.09)' : p.navItem;
  const insets = useSafeAreaInsets();
  const t = useTracks(useUid());
  const [menu, setMenu] = useState(false);
  const view = useInvestView((s) => s.view);
  const setView = useInvestView((s) => s.setView);
  const hidden = new Set([...(t.spending ? [] : ['money']), ...(t.funds || t.stocks ? [] : ['invest'])]);
  const active = state.routes[state.index];
  const routes = ORDER.map((name) => state.routes.find((r) => r.name === name)).filter((r): r is NonNullable<typeof r> => !!r && !hidden.has(r.name));
  const showAdd = WITH_ADD.has(active?.name ?? '');
  // Where there's no + (Invest, Passive) Invest shows as Funds + Stocks, so the bar stays full.
  const split = !showAdd && t.funds && t.stocks;

  const pill = (Icon: LucideIcon, label: string, a11y: string, key: string) => (
    <View key={key} style={styles.pillWrap}>
      <Pressable accessibilityRole="tab" accessibilityState={{ selected: true }} accessibilityLabel={a11y}
        style={[styles.activePill, { backgroundColor: p.accent }, p.accentRing ? { borderWidth: 1, borderColor: p.accentRing } : null]}>
        <View style={[styles.activeDot, { backgroundColor: p.accentInk }]}><Icon size={18} color={p.accent} strokeWidth={2.2} /></View>
        <Text maxFontSizeMultiplier={1.1} style={[styles.pillLabel, { color: p.accentInk }]} numberOfLines={1}>{label}</Text>
      </Pressable>
    </View>
  );
  const circle = (Icon: LucideIcon, a11y: string, key: string, onPress: () => void) => (
    <Pressable key={key} accessibilityRole="tab" accessibilityState={{ selected: false }} accessibilityLabel={a11y} onPress={onPress} hitSlop={4}
      style={({ pressed }) => [styles.iconBtn, { backgroundColor: idleBg, opacity: pressed ? 0.8 : 1 }]}>
      <Icon size={20} color={idleIcon} strokeWidth={1.9} />
    </Pressable>
  );

  const items = routes.flatMap((r) => {
    const focused = r.key === active?.key;
    const { icon, label } = TABS[r.name];
    if (r.name === 'invest' && split) {
      // Funds and Stocks as their own buttons: the open one is the pill (on Invest), the others round buttons.
      return (['funds', 'stocks'] as InvestView[]).map((v) => (focused && v === view
        ? pill(HALVES[v].icon, HALVES[v].label, HALVES[v].a11y, `invest-${v}`)
        : circle(HALVES[v].icon, HALVES[v].a11y, `invest-${v}`, () => {
          haptic.tick();
          setView(v);
          if (!focused) navigateToTab(r.key);
        })));
    }
    if (focused) return [pill(icon, label, label, r.key)];
    return [circle(icon, label, r.key, () => {
      haptic.tick();
      // Every fresh visit to Invest opens Mutual funds first (stocks-only users go straight to stocks).
      if (r.name === 'invest') setView(t.funds ? 'funds' : 'stocks');
      navigateToTab(r.key);
    })];
  });

  return (
    <>
      <View pointerEvents="box-none" style={[styles.wrap, { bottom: insets.bottom + FAB_CENTER_FROM_BOTTOM - BAR_H / 2 }]}>
        <View style={styles.row}>
          {glass ? (
            <View style={[styles.bar, styles.glassBar, { borderColor: 'rgba(255,255,255,0.12)', borderTopColor: 'rgba(255,255,255,0.26)' }]}>
              <BlurView blurTarget={blurTarget} blurMethod="dimezisBlurViewSdk31Plus" intensity={60} blurReductionFactor={2} tint="dark" style={StyleSheet.absoluteFill} />
              {/* Smoky dark tint, then a faint sheen on the upper half for the glass edge. */}
              <View style={[StyleSheet.absoluteFill, { backgroundColor: `rgba(10,10,12,${liquid.on ? liquid.tintAlpha.toFixed(2) : '0.58'})` }]} pointerEvents="none" />
              <LinearGradient colors={['rgba(255,255,255,0.10)', 'rgba(255,255,255,0)']} end={{ x: 0.5, y: 0.6 }}
                style={StyleSheet.absoluteFill} pointerEvents="none" />
              {items}
            </View>
          ) : (
            <View style={[styles.bar, styles.solidBar, { backgroundColor: p.nav, borderColor: 'rgba(255,255,255,0.10)' }]}>{items}</View>
          )}
          {showAdd ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Add: expense, income or upload"
              onPress={() => { haptic.light(); setMenu(true); }}
              style={({ pressed }) => [styles.fab, glass ? styles.glassFab : styles.solidFab, { backgroundColor: p.accent, transform: [{ scale: pressed ? 0.93 : 1 }] }, p.accentRing ? { borderWidth: 1, borderColor: p.accentRing } : null]}
            >
              <Plus size={28} color={p.accentInk} strokeWidth={2.6} />
            </Pressable>
          ) : null}
        </View>
      </View>
      <AddMenu open={menu} onClose={() => setMenu(false)} />
    </>
  );
}

export default function TabsLayout() {
  const uid = useUid();
  const t = useTracks(uid);
  const invest = t.funds || t.stocks;
  const p = useTheme();
  const picking = useCardPicker((s) => !!s.card);
  const periodOpen = usePeriodSheet((s) => s.open);
  const worthOpen = useWorthSheet((s) => !!s.data);
  // The navigator is the blur target (glass nav, card picker); the nav itself is drawn outside it.
  const target = useRef<ComponentRef<typeof View>>(null);
  return (
    <View style={[styles.fill, { backgroundColor: p.bg }]}>
      <BlurTargetView ref={target} style={[styles.fill, { backgroundColor: p.bg }]}>
        <Tabs screenOptions={{
          headerShown: false,
          // No navigator transition: each page's content plays the Funds ↔ Stocks motion itself on focus (Screen).
          // Scenes paint the app background, so nothing flashes.
          sceneStyle: { backgroundColor: p.bg },
          animation: 'none',
        }} tabBar={(props) => <BarBridge {...props} />}>
          <Tabs.Screen name="index" />
          <Tabs.Screen name="money" options={{ href: t.spending ? undefined : null }} />
          <Tabs.Screen name="invest" options={{ href: invest ? undefined : null }} />
          <Tabs.Screen name="passive" />
        </Tabs>
      </BlurTargetView>
      <TabBar blurTarget={target} />
      {picking ? <CardPicker blurTarget={target} /> : null}
      {periodOpen ? <RangeSheet blurTarget={target} /> : null}
      {worthOpen ? <WorthSheet blurTarget={target} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  wrap: { position: 'absolute', left: 12, right: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  bar: {
    flex: 1, height: BAR_H, borderRadius: BAR_H / 2, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6, paddingHorizontal: 9,
  },
  solidBar: { shadowColor: '#000', shadowOpacity: 0.55, shadowRadius: 22, shadowOffset: { width: 0, height: 10 }, elevation: 18 },
  // No elevation on glass: Android draws the shadow behind a translucent view, which shows through as a grey blob.
  glassBar: { overflow: 'hidden' },
  iconBtn: { width: ICON_BTN, height: ICON_BTN, borderRadius: ICON_BTN / 2, alignItems: 'center', justifyContent: 'center' },
  pillWrap: { flexGrow: 1, flexShrink: 1, maxWidth: PILL_MAX },
  activePill: { height: 48, borderRadius: 24, flexDirection: 'row', alignItems: 'center', paddingLeft: 5, paddingRight: 12, gap: 7 },
  activeDot: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  pillLabel: { flex: 1, textAlign: 'center', fontFamily: 'Inter_600SemiBold', fontSize: 13 },
  fab: { width: FAB_SIZE, height: FAB_SIZE, borderRadius: FAB_SIZE / 2, alignItems: 'center', justifyContent: 'center' },
  solidFab: { shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 16 },
  glassFab: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.45)', shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 8 },
});
