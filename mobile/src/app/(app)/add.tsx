import { router, useLocalSearchParams } from 'expo-router';
import { Check, X } from '@/ui/icons';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import Animated, { ZoomIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { checkAmount, newTxnId, useAddTransaction, useUpdateTransaction } from '@/data/mutations';
import { useCategories, useTransactions, useUid } from '@/data/queries';
import type { Category } from '@/data/types';
import { addDays, shortDate, todayIso } from '@/lib/dates';
import { group } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { Calendar } from '@/ui/Calendar';
import { pressKey } from '@/lib/amount';
import { Keypad } from '@/ui/Keypad';
import { CategoryIcon } from '@/ui/Logos';
import { Button, Chip, IconButton } from '@/ui/primitives';
import { Segmented } from '@/ui/Segmented';
import { Sheet } from '@/ui/Sheet';
import { Text } from '@/ui/Text';
import { useTheme } from '@/ui/theme';
import { font, SCREEN_PAD, space } from '@/ui/tokens';

type Kind = 'debit' | 'credit';
const matches = (c: Category, k: Kind) => (k === 'debit' ? c.type === 'expense' || c.type === 'debit' : c.type === 'income' || c.type === 'credit');

/**
 * Add expense / income (plan §6.3): `+` → amount → category → Save. Expense first, keypad ready, the
 * user's most-used categories first, the last amounts used in that category as one-tap chips.
 * `?id=` opens the same sheet to edit an existing transaction.
 */
export default function AddTransaction() {
  const p = useTheme();
  const insets = useSafeAreaInsets();
  const uid = useUid();
  const { id: editId, type: typeParam } = useLocalSearchParams<{ id?: string; type?: string }>();
  const txns = useTransactions();
  const cats = useCategories();
  const editing = editId ? txns.data?.find((t) => t.id === editId) : undefined;

  const [kind, setKind] = useState<Kind>(editing?.type ?? (typeParam === 'credit' ? 'credit' : 'debit'));
  const [amount, setAmount] = useState(editing ? String(Number(editing.amount)) : '');
  const [categoryId, setCategoryId] = useState<string | null>(editing?.category_id ?? null);
  const [date, setDate] = useState(editing?.date ?? todayIso());
  const [note, setNote] = useState(editing?.notes ?? '');
  const [error, setError] = useState<string | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [dateOpen, setDateOpen] = useState(false);
  const [done, setDone] = useState(false);
  const add = useAddTransaction(cats.data);
  const update = useUpdateTransaction();

  const forKind = useMemo(() => (cats.data ?? []).filter((c) => matches(c, kind)), [cats.data, kind]);
  const ranked = useMemo(() => {
    const uses = new Map<string, number>();
    for (const t of txns.data ?? []) if (t.type === kind && t.category_id) uses.set(t.category_id, (uses.get(t.category_id) ?? 0) + 1);
    return [...forKind].sort((a, b) => (uses.get(b.id) ?? 0) - (uses.get(a.id) ?? 0) || a.name.localeCompare(b.name));
  }, [forKind, txns.data, kind]);
  const top = ranked.slice(0, 7);
  const selected = forKind.find((c) => c.id === categoryId) ?? null;
  const chips = selected && !top.some((c) => c.id === selected.id) ? [selected, ...top.slice(0, 6)] : top;

  const quick = useMemo(() => {
    if (!categoryId) return [];
    const seen = new Set<string>();
    const out: string[] = [];
    for (const t of txns.data ?? []) {
      if (t.category_id !== categoryId || t.type !== kind) continue;
      const a = String(Number(t.amount));
      if (!seen.has(a)) { seen.add(a); out.push(a); }
      if (out.length >= 4) break;
    }
    return out;
  }, [txns.data, categoryId, kind]);

  const switchKind = (k: Kind) => { setKind(k); setCategoryId(null); setError(null); };

  const save = () => {
    const problem = checkAmount(amount) ?? (!categoryId ? 'Choose a category.' : null);
    if (problem) { haptic.error(); setError(problem); return; }
    const row = { id: editing?.id ?? newTxnId(), user_id: uid!, amount: String(Number(amount)), type: kind, category_id: categoryId!, date, notes: note.trim() || null };
    if (editing) update.mutate(row);
    else add.mutate(row);
    haptic.success();
    setDone(true);
    setTimeout(() => (router.canGoBack() ? router.back() : router.replace('/')), 420);
  };

  const display = amount ? group(amount.endsWith('.') ? amount.slice(0, -1) : amount, amount.includes('.') ? Math.min(2, amount.split('.')[1].length) : 0) + (amount.endsWith('.') ? '.' : '') : '0';
  const dateChip = date === todayIso() ? 'Today' : date === addDays(todayIso(), -1) ? 'Yesterday' : shortDate(date);

  return (
    <View style={[styles.root, { backgroundColor: p.bg, paddingTop: insets.top, paddingBottom: Math.max(insets.bottom, space.md) }]}>
      <View style={styles.top}>
        <IconButton icon={X} label="Close" onPress={() => router.back()} />
        <View style={{ width: 220 }}>
          <Segmented options={[{ value: 'debit', label: 'Expense' }, { value: 'credit', label: 'Income' }]} value={kind} onChange={switchKind} accessibilityLabel="Transaction type" />
        </View>
        <View style={{ width: 48 }} />
      </View>

      <View style={styles.amountBox} accessibilityRole="text" accessibilityLabel={`Amount ${amount || 'zero'} rupees`}>
        <Text variant="label" tone="ink2">{editing ? 'Edit amount' : kind === 'debit' ? 'You spent' : 'You received'}</Text>
        <View style={styles.amountRow}>
          <Text style={[styles.currency, { color: p.ink2 }]}>Rs</Text>
          <Text style={[styles.amount, { color: amount ? (kind === 'credit' ? p.pos : p.ink) : p.muted }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5}>{display}</Text>
        </View>
        {error ? <Text variant="label" tone="neg" accessibilityLiveRegion="assertive">{error}</Text> : null}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} keyboardShouldPersistTaps="handled">
        {chips.map((c) => (
          <Chip key={c.id} label={c.name} selected={c.id === categoryId} onPress={() => { setCategoryId(c.id); setError(null); }}
            icon={<CategoryIcon icon={c.icon} size={22} tone={c.id === categoryId ? 'selected' : 'neutral'} />} />
        ))}
        {forKind.length > chips.length ? <Chip label="More…" onPress={() => setMoreOpen(true)} /> : null}
      </ScrollView>

      <View style={styles.meta}>
        <Chip label={dateChip} onPress={() => setDateOpen(true)} accessibilityLabel={`Date: ${dateChip}. Change`} />
        <TextInput
          value={note}
          onChangeText={setNote}
          placeholder="Add a note"
          placeholderTextColor={p.muted}
          maxLength={120}
          style={[styles.note, { backgroundColor: p.surface2, color: p.ink, borderColor: p.border }]}
          accessibilityLabel="Note"
          returnKeyType="done"
          selectionColor={p.accent}
        />
      </View>

      <View style={{ flex: 1 }} />
      {quick.length ? (
        <View style={styles.quick}>
          {quick.map((q) => <Chip key={q} label={group(q, q.includes('.') ? 2 : 0)} onPress={() => { setAmount(q); setError(null); }} accessibilityLabel={`Use ${q} rupees`} />)}
        </View>
      ) : null}
      <View style={{ paddingHorizontal: SCREEN_PAD - 8 }}>
        <Keypad onKey={(k) => { setAmount((a) => pressKey(a, k)); setError(null); }} />
      </View>
      <View style={{ paddingHorizontal: SCREEN_PAD, paddingTop: space.sm }}>
        <Button label={editing ? 'Save changes' : kind === 'debit' ? 'Save expense' : 'Save income'} onPress={save} disabled={done} />
      </View>

      {done ? (
        <View style={[StyleSheet.absoluteFill, styles.doneWrap]} pointerEvents="none">
          <Animated.View entering={ZoomIn.springify().damping(14)} style={[styles.done, { backgroundColor: p.accent }]}>
            <Check size={40} color={p.accentInk} strokeWidth={3} />
          </Animated.View>
        </View>
      ) : null}

      <Sheet open={moreOpen} onClose={() => setMoreOpen(false)} title="All categories">
        <View style={styles.grid}>
          {ranked.map((c) => (
            <Pressable key={c.id} style={styles.gridItem} accessibilityRole="button" accessibilityLabel={c.name}
              onPress={() => { haptic.tick(); setCategoryId(c.id); setError(null); setMoreOpen(false); }}>
              <CategoryIcon icon={c.icon} size={48} tone={c.id === categoryId ? 'selected' : 'neutral'} />
              <Text variant="caption" align="center" numberOfLines={2}>{c.name}</Text>
            </Pressable>
          ))}
        </View>
      </Sheet>
      <Sheet open={dateOpen} onClose={() => setDateOpen(false)} title="Date">
        <Calendar value={date} onChange={(d) => { setDate(d); setDateOpen(false); }} />
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8, paddingVertical: space.sm },
  amountBox: { alignItems: 'center', paddingHorizontal: SCREEN_PAD, paddingTop: space.lg, gap: 4, minHeight: 120 },
  amountRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8, maxWidth: '100%' },
  currency: { fontFamily: font.numMedium, fontSize: 24 },
  amount: { fontFamily: font.numBold, fontSize: 56, lineHeight: 64, letterSpacing: -1.5, fontVariant: ['tabular-nums'] },
  chips: { paddingHorizontal: SCREEN_PAD, gap: space.sm, paddingVertical: space.md },
  meta: { flexDirection: 'row', gap: space.sm, paddingHorizontal: SCREEN_PAD, alignItems: 'center' },
  note: { flex: 1, height: 40, borderRadius: 12, paddingHorizontal: 14, fontFamily: font.regular, fontSize: 14, borderWidth: StyleSheet.hairlineWidth },
  quick: { flexDirection: 'row', gap: space.sm, paddingHorizontal: SCREEN_PAD, marginBottom: space.sm, justifyContent: 'center' },
  doneWrap: { alignItems: 'center', justifyContent: 'center' },
  done: { width: 96, height: 96, borderRadius: 48, alignItems: 'center', justifyContent: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  gridItem: { width: '25%', alignItems: 'center', gap: 6, paddingVertical: space.md },
});
