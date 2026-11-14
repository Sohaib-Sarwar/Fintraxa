import { FlashList } from '@shopify/flash-list';
import Decimal from 'decimal.js';
import { BlurTargetView } from 'expo-blur';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState, type ComponentRef, type ReactNode } from 'react';
import { Pressable, StyleSheet, TextInput, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { Easing, FadeInDown, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TransactionRow } from '@/features/money/TransactionRow';
import { RangeButton } from '@/features/range/RangeButton';
import { RangeSheet } from '@/features/range/RangeSheet';
import { useTransactions } from '@/data/queries';
import { byDay } from '@/data/selectors';
import type { Txn } from '@/data/types';
import { addDays, addMonths, monthOf, shortDate, todayIso } from '@/lib/dates';
import { autoDecimals, compactNumber, group, money } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { effectiveEnd, rangeLabel, resolveRange, type RangeChoice } from '@/lib/range';
import { useApp } from '@/lib/store';
import { CardArt } from '@/features/today/cardDesigns';
import { EmptyState } from '@/ui/feedback';
import { Money, useHidden } from '@/ui/Figures';
import { Check, ChevronDown, ChevronLeft, LayoutGrid, Pencil, ReceiptText, Search, Trash2, X } from '@/ui/icons';
import { Button } from '@/ui/primitives';
import { useDeleteTransaction } from '@/data/mutations';
import { GlassSheet } from '@/ui/GlassSheet';
import { LinearGradient as ExpoLinearGradient } from 'expo-linear-gradient';
import { CategoryIcon } from '@/ui/Logos';
import { Text } from '@/ui/Text';
import { useTheme } from '@/ui/theme';
import { font, SCREEN_PAD, space } from '@/ui/tokens';

type Kind = 'debit' | 'credit';
const ICON = 40;
type Pos = 'only' | 'first' | 'mid' | 'last';
type Item = { kind: 'summary' } | { kind: 'day'; date: string; total: number; count: number } | { kind: 'row'; t: Txn; pos: Pos };

const WEEKDAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** A month from Wallet's card → the matching preset (This month / Last month) or that exact month. */
function choiceFor(start?: string, end?: string): RangeChoice | null {
  if (!start || !end) return null;
  const today = todayIso();
  if (start === `${monthOf(today)}-01`) return { id: 'mtd' };
  if (start === `${addMonths(monthOf(today), -1)}-01`) return { id: 'lm' };
  return { id: 'custom', start, end };
}

/** Day header text: "Today" / "Yesterday" / weekday, plus the date ("14 Nov", with the year if not this year). */
function dayParts(iso: string, today: string) {
  const [y, m, d] = iso.split('-').map(Number);
  const date = `${d} ${MON[m - 1]}${String(y) !== today.slice(0, 4) ? ` ${y}` : ''}`;
  if (iso === today) return { main: 'Today', sub: date };
  if (iso === addDays(today, -1)) return { main: 'Yesterday', sub: date };
  return { main: WEEKDAY[new Date(y, m - 1, d).getDay()], sub: date };
}

/**
 * Expenses or Income for a period (owner, 2026-11-14 redesign). Opened from Wallet's card with
 * `?type=debit|credit&start&end`: the page shows only that side — money out, or money in — never a mix.
 * Header: glass back · title · period button (top right). Then the main card (the chosen card art under dark glass:
 * label + count chip, total, Per day / Largest glass tiles) and one row of glass controls — search (a bar when there
 * is room, else an icon that expands) and category. Rows are light glass panels per day.
 * Days follow as grouped cards under clear day headers with each day's total.
 */
/**
 * Responsive search (owner): a round glass icon by default, so the category pill gets the row and shows its full
 * name. Tap → the icon widens smoothly into a full search bar while the category pill fades and gives way;
 * ✕ (or emptying it and leaving) shrinks it back the same way. Width and fade run on the UI thread, eased.
 */
function SearchAndCategory({ rowW, onRowW, open, onOpen, onClose, q, setQ, title, edge, fill, category }: {
  rowW: number; onRowW: (w: number) => void; open: boolean; onOpen: () => void; onClose: () => void; q: string; setQ: (v: string) => void;
  title: string; edge: StyleProp<ViewStyle>; fill: [string, string]; category: ReactNode;
}) {
  const p = useTheme();
  const k = useSharedValue(open ? 1 : 0);
  const width = useSharedValue(rowW);
  const input = useRef<ComponentRef<typeof TextInput>>(null);
  useEffect(() => { width.set(rowW); }, [rowW, width]);
  useEffect(() => {
    k.set(withTiming(open ? 1 : 0, { duration: 300, easing: Easing.bezier(0.2, 0, 0, 1) }));
    if (open) { const t = setTimeout(() => input.current?.focus(), 120); return () => clearTimeout(t); }
    input.current?.blur();
    return undefined;
  }, [open, k]);
  const searchStyle = useAnimatedStyle(() => ({ width: ICON + Math.max(0, width.get() - ICON) * k.get() }));
  const fieldStyle = useAnimatedStyle(() => ({ opacity: Math.max(0, (k.get() - 0.35) / 0.65) }));
  const catStyle = useAnimatedStyle(() => ({ opacity: 1 - k.get(), marginLeft: 8 * (1 - k.get()) }));
  return (
    <View style={styles.controls} onLayout={(e) => onRowW(Math.round(e.nativeEvent.layout.width))}>
      <Animated.View style={[styles.searchBox, edge, searchStyle]}>
        <ExpoLinearGradient colors={fill} style={StyleSheet.absoluteFill} />
        <Pressable onPress={open ? () => input.current?.focus() : onOpen} hitSlop={6} accessibilityRole="button"
          accessibilityLabel={open ? 'Search field' : `Search ${title.toLowerCase()}`} style={styles.searchIcon}>
          <Search size={17} color={p.ink} />
        </Pressable>
        <Animated.View style={[styles.searchFieldInner, fieldStyle]} pointerEvents={open ? 'auto' : 'none'}>
          <TextInput ref={input} value={q} onChangeText={setQ} placeholder={`Search ${title.toLowerCase()}`} placeholderTextColor={p.muted}
            style={[styles.input, { color: p.ink }]} accessibilityLabel={`Search ${title.toLowerCase()} by note or amount`} returnKeyType="search"
            selectionColor={p.accent} cursorColor={p.accent} autoCorrect={false} onBlur={() => { if (!q) onClose(); }} />
          <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close search" style={styles.searchClose}>
            <X size={16} color={p.ink2} />
          </Pressable>
        </Animated.View>
      </Animated.View>
      <Animated.View style={[styles.catWrap, catStyle]} pointerEvents={open ? 'none' : 'auto'}>{category}</Animated.View>
    </View>
  );
}

export default function Transactions() {
  const p = useTheme();
  const hidden = useHidden();
  const insets = useSafeAreaInsets();
  const txns = useTransactions();
  const params = useLocalSearchParams<{ type?: string; start?: string; end?: string }>();
  const kind: Kind = params.type === 'credit' ? 'credit' : 'debit';
  const globalChoice = useApp((s) => s.range);
  const [choice, setChoice] = useState<RangeChoice>(() => choiceFor(params.start, params.end) ?? globalChoice);
  const [category, setCategory] = useState<string | null>(null);
  const [catOpen, setCatOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [rowW, setRowW] = useState(0);
  const cardDesign = useApp((s) => s.cardDesign);
  const [q, setQ] = useState('');
  const [rangeOpen, setRangeOpen] = useState(false);
  const [action, setAction] = useState<Txn | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const remove = useDeleteTransaction();
  const target = useRef<ComponentRef<typeof View>>(null);
  const today = todayIso();
  const range = resolveRange(choice, today);
  const label = rangeLabel(range, today);
  const income = kind === 'credit';
  const dark = p.mode === 'dark';

  // This side's transactions in the period (before the category / search filters).
  const sideRows = useMemo(() => (txns.data ?? []).filter((t) => t.type === kind && t.date >= range.start && t.date <= range.end), [txns.data, kind, range.start, range.end]);

  // Category chips: what this side has in the period, biggest first.
  const chips = useMemo(() => {
    const map = new Map<string, { id: string; name: string; icon: string | null; total: Decimal }>();
    for (const t of sideRows) {
      const id = t.category_id ?? 'none';
      const cur = map.get(id) ?? { id, name: t.categories?.name ?? 'Uncategorised', icon: t.categories?.icon ?? null, total: new Decimal(0) };
      cur.total = cur.total.plus(t.amount);
      map.set(id, cur);
    }
    return [...map.values()].sort((a, b) => b.total.comparedTo(a.total)).map((c) => ({ ...c, total: Number(c.total.toFixed(2)) }));
  }, [sideRows]);

  const { items, sticky, total, count, perDay, largest, share } = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const rows = sideRows.filter((t) => (!category || (t.category_id ?? 'none') === category)
      && (!needle || (t.categories?.name ?? '').toLowerCase().includes(needle) || (t.notes ?? '').toLowerCase().includes(needle) || String(t.amount).startsWith(needle.replace(/,/g, ''))));
    // The summary panel is item 0, so day indices are the list's own (sticky headers line up exactly).
    const out: Item[] = [{ kind: 'summary' }];
    const idx: number[] = [];
    for (const d of byDay(rows)) {
      idx.push(out.length);
      const dayTotal = d.rows.reduce((s, t) => s.plus(t.amount), new Decimal(0));
      out.push({ kind: 'day', date: d.date, total: Number(dayTotal.toFixed(2)), count: d.rows.length });
      d.rows.forEach((t, i) => out.push({ kind: 'row', t, pos: d.rows.length === 1 ? 'only' : i === 0 ? 'first' : i === d.rows.length - 1 ? 'last' : 'mid' }));
    }
    const sum = rows.reduce((s, t) => s.plus(t.amount), new Decimal(0));
    const all = sideRows.reduce((s, t) => s.plus(t.amount), new Decimal(0));
    const end = effectiveEnd(range, today);
    const days = Math.max(1, Math.round((new Date(`${end}T00:00:00`).getTime() - new Date(`${range.start < '2000-01-02' && rows.length ? rows[rows.length - 1].date : range.start}T00:00:00`).getTime()) / 86_400_000) + 1);
    const big = rows.reduce((m, t) => Math.max(m, Number(t.amount)), 0);
    return {
      items: out, sticky: idx, total: Number(sum.toFixed(2)), count: rows.length,
      perDay: Number(sum.dividedBy(days).toFixed(0)), largest: big,
      share: category && !all.isZero() ? Number(sum.dividedBy(all).times(100).toFixed(1)) : null,
    };
  }, [sideRows, category, q, range, today]);

  const chosen = chips.find((c) => c.id === category) ?? null;
  const allTotal = useMemo(() => Number(sideRows.reduce((s, t) => s.plus(t.amount), new Decimal(0)).toFixed(2)), [sideRows]);
  const title = income ? 'Income' : 'Expenses';

  const glassEdge = { borderColor: dark ? 'rgba(255,255,255,0.12)' : 'rgba(16,20,12,0.10)', borderBottomColor: dark ? 'rgba(255,255,255,0.26)' : 'rgba(16,20,12,0.18)' };
  const glassFill: [string, string] = dark ? ['rgba(255,255,255,0.12)', 'rgba(255,255,255,0.04)'] : ['rgba(255,255,255,0.98)', 'rgba(232,235,228,0.95)'];
  const header = (
    <View style={styles.top}>
      <Pressable onPress={() => router.back()} hitSlop={8} accessibilityRole="button" accessibilityLabel="Back"
        style={({ pressed }) => [styles.iconBtn, glassEdge, { opacity: pressed ? 0.8 : 1 }]}>
        <ExpoLinearGradient colors={glassFill} style={StyleSheet.absoluteFill} />
        <ChevronLeft size={19} color={p.ink} />
      </Pressable>
      <Text style={[styles.title, { color: p.ink }]} numberOfLines={1} accessibilityRole="header">{title}</Text>
      <RangeButton label={label} onPress={() => setRangeOpen(true)} />
    </View>
  );

  const expanded = searchOpen || !!q;
  // Glass rows: a quiet translucent panel per day with a lit top edge (minimal, realistic).
  const rowGlass = dark
    ? { bg: 'rgba(255,255,255,0.045)', border: 'rgba(255,255,255,0.08)', lit: 'rgba(255,255,255,0.16)' }
    : { bg: 'rgba(255,255,255,0.78)', border: 'rgba(16,20,12,0.08)', lit: 'rgba(255,255,255,1)' };


  const summary = (
    <View>
      {/* Main card: the chosen card art under a dark smoky glass wash, lit edge, white figures. */}
      <View style={[styles.panel, { borderColor: 'rgba(255,255,255,0.12)', borderTopColor: 'rgba(255,255,255,0.28)' }]}>
        <CardArt id={cardDesign} />
        <ExpoLinearGradient colors={['rgba(8,8,10,0.58)', 'rgba(8,8,10,0.84)']} style={StyleSheet.absoluteFill} />
        <ExpoLinearGradient colors={['rgba(255,255,255,0.10)', 'rgba(255,255,255,0)']} start={{ x: 0, y: 0 }} end={{ x: 0.7, y: 0.6 }} style={StyleSheet.absoluteFill} />
        <View style={styles.panelTop}>
          <Text style={styles.panelLabel} numberOfLines={1}>{income ? 'Earned' : 'Spent'}{chosen ? ` · ${chosen.name}` : ''}</Text>
          <View style={styles.countChip}><Text style={styles.countText}>{count} {count === 1 ? 'transaction' : 'transactions'}</Text></View>
        </View>
        <Text style={styles.total} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
          {hidden ? 'Rs ••••' : `Rs ${Math.abs(total) >= 1e7 ? compactNumber(total) : group(total, autoDecimals(total))}`}
        </Text>
        {share !== null ? <Text style={styles.panelSmall}>{share}% of all {income ? 'income' : 'spending'}</Text> : null}
        <View style={styles.tiles}>
          {[{ k: 'Per day', v: perDay }, { k: 'Largest', v: largest }].map((x) => (
            <View key={x.k} style={styles.tile}>
              <Text style={styles.panelSmall}>{x.k}</Text>
              <Text style={styles.tileNum} numberOfLines={1}>{hidden ? '••••' : `Rs ${Math.abs(x.v) >= 1e6 ? compactNumber(x.v) : group(x.v, 0)}`}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Search and category — one row (the period sits in the header). */}
      <SearchAndCategory rowW={rowW} onRowW={setRowW} open={expanded} onOpen={() => { haptic.tick(); setSearchOpen(true); }}
        onClose={() => { setQ(''); setSearchOpen(false); }} q={q} setQ={setQ} title={title} edge={glassEdge} fill={glassFill}
        category={
          <Pressable onPress={() => { haptic.tick(); setCatOpen(true); }} accessibilityRole="button" accessibilityLabel={`Category: ${chosen?.name ?? 'all'}. Change`}
            style={({ pressed }) => [styles.catBtn, glassEdge, { opacity: pressed ? 0.8 : 1 }]}>
            <ExpoLinearGradient colors={glassFill} style={StyleSheet.absoluteFill} />
            {chosen ? <CategoryIcon icon={chosen.icon} size={22} tone="neutral" /> : <LayoutGrid size={15} color={p.ink2} />}
            <Text style={[styles.catText, { color: p.ink }]} numberOfLines={1}>{chosen?.name ?? 'All categories'}</Text>
            <ChevronDown size={14} color={p.ink2} strokeWidth={2.2} />
          </Pressable>
        } />
    </View>
  );

  return (
    <View style={[styles.root, { backgroundColor: p.bg }]}>
      <BlurTargetView ref={target} style={[styles.root, { backgroundColor: p.bg, paddingTop: insets.top }]}>
        <Animated.View entering={FadeInDown.duration(260)} style={{ flex: 1 }}>
        {header}
        <FlashList
          data={items}
          keyExtractor={(it) => (it.kind === 'summary' ? 'summary' : it.kind === 'day' ? `d-${it.date}` : it.t.id)}
          getItemType={(it) => (it.kind === 'row' ? `row-${it.pos}` : it.kind)}
          stickyHeaderIndices={sticky}
          contentContainerStyle={{ paddingHorizontal: SCREEN_PAD, paddingBottom: insets.bottom + space.xxl }}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => {
            if (item.kind === 'summary') {
              // Same structure with or without results, so the search field never remounts (keeps the keyboard).
              return (
                <>{summary}{count ? null : <EmptyState title={`No ${title.toLowerCase()}`} body={q || category ? 'Nothing matches this filter.' : `Nothing recorded in ${label}.`} />}</>
              );
            }
            if (item.kind === 'day') {
              const d = dayParts(item.date, today);
              return (
                <View style={[styles.day, { backgroundColor: p.bg }]}>
                  <Text style={[styles.dayMain, { color: p.ink }]}>{d.main}</Text>
                  <Text style={[styles.daySub, { color: p.muted }]}>{d.sub}</Text>
                  <View style={{ flex: 1 }} />
                  <Money value={item.total} variant="label" tone="ink2" />
                </View>
              );
            }
            const first = item.pos === 'first' || item.pos === 'only';
            const last = item.pos === 'last' || item.pos === 'only';
            return (
              <View style={[styles.row, { backgroundColor: rowGlass.bg, borderColor: rowGlass.border },
                first && [styles.rowFirst, { borderTopColor: rowGlass.lit }], last && styles.rowLast, !first && { borderTopWidth: 0 }]}>
                {!first ? <View style={[styles.sep, { backgroundColor: rowGlass.border }]} /> : null}
                <TransactionRow t={item.t} onLongPress={setAction} />
              </View>
            );
          }}
        />
        </Animated.View>
      </BlurTargetView>

      {catOpen ? (
      <GlassSheet blurTarget={target} onClose={() => setCatOpen(false)} title={income ? 'Income category' : 'Expense category'} maxHeight={0.75}>
        {[{ id: null as string | null, name: 'All categories', icon: null as string | null, total: allTotal }, ...chips].map((c, i) => {
          const on = c.id === category;
          return (
            <Pressable key={c.id ?? 'all'} onPress={() => { haptic.tick(); setCategory(c.id); setCatOpen(false); }} accessibilityRole="radio" accessibilityState={{ checked: on }}
              style={({ pressed }) => [styles.option, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: dark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.08)' }, { opacity: pressed ? 0.75 : 1 }]}>
              {c.id ? <CategoryIcon icon={c.icon} size={36} tone="neutral" />
                : <View style={[styles.allIcon, { backgroundColor: dark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.06)' }]}><LayoutGrid size={17} color={p.ink2} /></View>}
              <Text variant="body" style={{ flex: 1, fontFamily: on ? font.semibold : font.regular }} numberOfLines={1}>{c.name}</Text>
              <Money value={c.total} variant="label" tone="ink2" />
              <View style={[styles.radio, { borderColor: on ? p.accent : p.borderStrong, backgroundColor: on ? p.accent : 'transparent' }]}>
                {on ? <Check size={12} color={p.accentInk} strokeWidth={3} /> : null}
              </View>
            </Pressable>
          );
        })}
      </GlassSheet>
      ) : null}

      {action ? (
        <GlassSheet blurTarget={target} smoky onClose={() => { setAction(null); setConfirmDelete(false); }} maxHeight={0.6}
          title={confirmDelete ? 'Delete this transaction?' : action.categories?.name ?? 'Transaction'}>
          {confirmDelete ? (
            <>
              <Text variant="body" tone="ink2">It’s removed from your totals everywhere. You can undo for 5 seconds.</Text>
              <View style={styles.sheetActions}>
                <Button label="Keep it" kind="secondary" style={{ flex: 1 }} onPress={() => setConfirmDelete(false)} />
                <Button label="Delete" kind="danger" style={{ flex: 1 }} onPress={() => { const t = action; setAction(null); setConfirmDelete(false); remove(t); }} />
              </View>
            </>
          ) : (
            <>
              <Text variant="caption" tone="muted" style={{ marginBottom: space.sm }}>{money(action.amount, { hidden, decimals: 2 })} · {shortDate(action.date)}</Text>
              {[
                { k: 'receipt', label: 'View receipt', icon: ReceiptText, go: () => { const id = action.id; setAction(null); router.push({ pathname: '/transaction/[id]', params: { id } }); } },
                { k: 'edit', label: 'Edit', icon: Pencil, go: () => { const id = action.id; setAction(null); router.push({ pathname: '/add', params: { id } }); } },
                { k: 'delete', label: 'Delete', icon: Trash2, go: () => { haptic.warning(); setConfirmDelete(true); }, danger: true },
              ].map((o, i) => (
                <Pressable key={o.k} onPress={o.go} accessibilityRole="button" style={({ pressed }) => [styles.sheetRow, i > 0 && styles.sheetSep, { opacity: pressed ? 0.75 : 1 }]}>
                  <View style={[styles.sheetIcon, o.danger && { backgroundColor: 'rgba(255,123,114,0.14)' }]}><o.icon size={18} color={o.danger ? '#FF7B72' : p.ink} /></View>
                  <Text variant="bodyStrong" style={o.danger ? { color: '#FF7B72' } : null}>{o.label}</Text>
                </Pressable>
              ))}
            </>
          )}
        </GlassSheet>
      ) : null}

      {rangeOpen ? <RangeSheet blurTarget={target} range={range} onChoose={(c) => setChoice(c)} onClose={() => setRangeOpen(false)} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  sheetRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 56 },
  sheetSep: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(255,255,255,0.08)' },
  sheetIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.08)' },
  sheetActions: { flexDirection: 'row', gap: space.sm, marginTop: space.xl, marginBottom: space.sm },
  root: { flex: 1 },
  top: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: SCREEN_PAD, height: 60 },
  title: { flex: 1, fontFamily: font.bold, fontSize: 22, letterSpacing: -0.4 },
  searchBox: { height: ICON, borderRadius: ICON / 2, borderWidth: 1, overflow: 'hidden', flexDirection: 'row', alignItems: 'center' },
  searchIcon: { width: ICON - 2, height: ICON - 2, alignItems: 'center', justifyContent: 'center' },
  searchFieldInner: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  searchClose: { paddingHorizontal: 12, height: ICON, justifyContent: 'center' },
  catWrap: { flex: 1, minWidth: 0 },
  iconBtn: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  input: { flex: 1, fontFamily: font.regular, fontSize: 15, padding: 0 },
  panel: { borderRadius: 24, borderWidth: 1, overflow: 'hidden', paddingHorizontal: space.lg, paddingTop: space.lg, paddingBottom: space.lg, marginTop: space.xs,
    backgroundColor: '#0A0A0B' },
  panelTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  panelLabel: { flex: 1, color: 'rgba(245,245,243,0.72)', fontFamily: font.medium, fontSize: 13 },
  countChip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.10)', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.18)' },
  countText: { color: 'rgba(245,245,243,0.85)', fontFamily: font.numMedium, fontSize: 11.5 },
  tiles: { flexDirection: 'row', gap: space.sm, marginTop: space.md },
  tile: { flex: 1, gap: 2, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.12)', borderTopColor: 'rgba(255,255,255,0.22)' },
  tileNum: { color: '#F5F5F3', fontFamily: font.num, fontSize: 15.5, lineHeight: 21 },
  panelSmall: { color: 'rgba(245,245,243,0.6)', fontFamily: font.regular, fontSize: 12 },
  total: { color: '#F5F5F3', fontFamily: font.numHeavy, fontSize: 36, lineHeight: 44, letterSpacing: -1, marginTop: 2, fontVariant: ['tabular-nums'],
    textShadowColor: 'rgba(0,0,0,0.4)', textShadowRadius: 8, textShadowOffset: { width: 0, height: 1 } },
  controls: { flexDirection: 'row', alignItems: 'center', marginTop: space.md, marginBottom: space.xs, minHeight: 40 },
  catBtn: { flexDirection: 'row', alignItems: 'center', gap: 7, height: 40, paddingLeft: 9, paddingRight: 12, borderRadius: 20, borderWidth: 1, overflow: 'hidden' },
  catText: { flex: 1, fontFamily: font.semibold, fontSize: 13.5 },
  option: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 58 },
  allIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  day: { flexDirection: 'row', alignItems: 'baseline', gap: 8, paddingTop: space.xl, paddingBottom: space.sm, paddingHorizontal: 4 },
  dayMain: { fontFamily: font.semibold, fontSize: 14.5 },
  daySub: { fontFamily: font.medium, fontSize: 13 },
  row: { paddingHorizontal: space.lg, borderLeftWidth: StyleSheet.hairlineWidth, borderRightWidth: StyleSheet.hairlineWidth },
  rowFirst: { borderTopLeftRadius: 20, borderTopRightRadius: 20, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 2 },
  rowLast: { borderBottomLeftRadius: 20, borderBottomRightRadius: 20, borderBottomWidth: StyleSheet.hairlineWidth, paddingBottom: 2 },
  sep: { position: 'absolute', top: 0, left: 68, right: space.lg, height: StyleSheet.hairlineWidth },
});
