import { FlashList } from '@shopify/flash-list';
import { router } from 'expo-router';
import { ChevronLeft, Search, X } from '@/ui/icons';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TransactionRow } from '@/features/money/TransactionRow';
import { useTransactions } from '@/data/queries';
import { byDay, dayNet } from '@/data/selectors';
import type { Txn } from '@/data/types';
import { dayHeading, todayIso } from '@/lib/dates';
import { EmptyState } from '@/ui/feedback';
import { Money } from '@/ui/Figures';
import { Chip, IconButton } from '@/ui/primitives';
import { Text } from '@/ui/Text';
import { useTheme } from '@/ui/theme';
import { font, SCREEN_PAD, space } from '@/ui/tokens';

type Item = { kind: 'header'; date: string; net: number } | { kind: 'row'; t: Txn };
type Filter = 'all' | 'debit' | 'credit';

/** Every transaction, fast (FlashList v2), with sticky day headers, search and a type filter. */
export default function Transactions() {
  const p = useTheme();
  const insets = useSafeAreaInsets();
  const txns = useTransactions();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const today = todayIso();

  const { items, sticky } = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const rows = (txns.data ?? []).filter((t) => (filter === 'all' || t.type === filter)
      && (!needle || (t.categories?.name ?? '').toLowerCase().includes(needle) || (t.notes ?? '').toLowerCase().includes(needle) || String(t.amount).startsWith(needle.replace(/,/g, ''))));
    const out: Item[] = [];
    const idx: number[] = [];
    for (const d of byDay(rows)) {
      idx.push(out.length);
      out.push({ kind: 'header', date: d.date, net: dayNet(d.rows) });
      for (const t of d.rows) out.push({ kind: 'row', t });
    }
    return { items: out, sticky: idx };
  }, [txns.data, q, filter]);

  return (
    <View style={[styles.root, { backgroundColor: p.bg, paddingTop: insets.top }]}>
      <View style={styles.top}>
        <IconButton icon={ChevronLeft} label="Back" onPress={() => router.back()} size={26} />
        <Text variant="headline">Transactions</Text>
        <View style={{ width: 48 }} />
      </View>
      <View style={{ paddingHorizontal: SCREEN_PAD, gap: space.md, paddingBottom: space.sm }}>
        <View style={[styles.search, { backgroundColor: p.surface2, borderColor: p.border }]}>
          <Search size={18} color={p.muted} />
          <TextInput value={q} onChangeText={setQ} placeholder="Search category, note or amount" placeholderTextColor={p.muted}
            style={[styles.input, { color: p.ink }]} accessibilityLabel="Search transactions" returnKeyType="search" selectionColor={p.accent} autoCorrect={false} />
          {q ? <Pressable onPress={() => setQ('')} hitSlop={12} accessibilityRole="button" accessibilityLabel="Clear search"><X size={18} color={p.ink2} /></Pressable> : null}
        </View>
        <View style={styles.filters}>
          {(['all', 'debit', 'credit'] as const).map((f) => (
            <Chip key={f} label={f === 'all' ? 'All' : f === 'debit' ? 'Spending' : 'Income'} selected={filter === f} onPress={() => setFilter(f)} />
          ))}
        </View>
      </View>
      {items.length ? (
        <FlashList
          data={items}
          keyExtractor={(it) => (it.kind === 'header' ? `h-${it.date}` : it.t.id)}
          getItemType={(it) => it.kind}
          stickyHeaderIndices={sticky}
          contentContainerStyle={{ paddingHorizontal: SCREEN_PAD, paddingBottom: insets.bottom + space.xxl }}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (item.kind === 'header' ? (
            <View style={[styles.header, { backgroundColor: p.bg }]}>
              <Text variant="label" tone="ink2">{dayHeading(item.date, today)}</Text>
              <Money value={item.net} variant="caption" tone="muted" sign />
            </View>
          ) : <TransactionRow t={item.t} />)}
        />
      ) : (
        <EmptyState title={q ? 'No matches' : 'No transactions yet'} body={q ? 'Try a category name, a word from the note, or an amount.' : 'Tap + on the home screen to log one.'} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8, minHeight: 56 },
  search: { flexDirection: 'row', alignItems: 'center', gap: space.sm, height: 48, borderRadius: 14, paddingHorizontal: 14, borderWidth: StyleSheet.hairlineWidth },
  input: { flex: 1, fontFamily: font.regular, fontSize: 15 },
  filters: { flexDirection: 'row', gap: space.sm },
  header: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: space.lg, paddingBottom: 4 },
});
