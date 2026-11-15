import { BlurTargetView } from 'expo-blur';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentRef, type ReactNode } from 'react';
import { BackHandler, KeyboardAvoidingView, Pressable, StyleSheet, TextInput, View } from 'react-native';
import Animated, { Easing, FadeInLeft, FadeInRight } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AddDone } from '@/features/money/AddDone';
import { checkAmount, newTxnId, useAddTransaction, useUpdateTransaction } from '@/data/mutations';
import { useCategories, useTransactions, useUid } from '@/data/queries';
import type { Category } from '@/data/types';
import { pressKey } from '@/lib/amount';
import { addDays, longDate, shortDate, todayIso } from '@/lib/dates';
import { group } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { DatePicker } from '@/ui/DatePicker';
import { ArrowLeft, ArrowRight, CalendarDays, Check, ChevronDown, LayoutGrid, NotebookPen, Pencil, Search, X } from '@/ui/icons';
import { Keypad } from '@/ui/Keypad';
import { CategoryIcon } from '@/ui/Logos';
import { Button, Chip, IconButton } from '@/ui/primitives';
import { GlassSheet } from '@/ui/GlassSheet';
import { Text } from '@/ui/Text';
import { useTheme } from '@/ui/theme';
import { font, SCREEN_PAD, space } from '@/ui/tokens';

type Kind = 'debit' | 'credit';
type Step = 'amount' | 'details' | 'done';
const matches = (c: Category, k: Kind) => (k === 'debit' ? c.type === 'expense' || c.type === 'debit' : c.type === 'income' || c.type === 'credit');
const EASE = Easing.bezier(0.2, 0, 0, 1);
const NOTE_MAX = 120;

/**
 * Add / edit income or expense (owner, 2026-11-14), two screens:
 *  1. Amount — big figure + keypad (recent amounts as chips), Continue.
 *  2. Details on one screen, no scrolling: amount summary, then Category (dropdown to a searchable list, most
 *     used first), Date (the blurred "Select Date" dialog) and Note; Save.
 * Then a finish screen with a done animation and the saved details. The type comes from the + menu
 * (`?type=credit|debit`) or the edited row and can't be switched here: Income shows only income.
 * `?id=` edits an existing transaction.
 */
/** One row of the details form: icon, small label, value, chevron (a formal dropdown field). */
function Field({ label, value, leading, onPress, a11y, placeholder = false }: { label: string; value: string; leading: ReactNode; onPress: () => void; a11y: string; placeholder?: boolean }) {
  const p = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={a11y} style={({ pressed }) => [styles.field, { opacity: pressed ? 0.75 : 1 }]}>
      {leading}
      <View style={{ flex: 1 }}>
        <Text variant="caption" tone="muted">{label}</Text>
        <Text variant="bodyStrong" numberOfLines={2} style={placeholder ? { color: p.muted, fontFamily: font.regular } : null}>{value}</Text>
      </View>
      <ChevronDown size={18} color={p.muted} />
    </Pressable>
  );
}

export default function AddTransaction() {
  const p = useTheme();
  const insets = useSafeAreaInsets();
  const uid = useUid();
  const { id: editId, type: typeParam } = useLocalSearchParams<{ id?: string; type?: string }>();
  const txns = useTransactions();
  const cats = useCategories();
  const editing = editId ? txns.data?.find((t) => t.id === editId) : undefined;
  const kind: Kind = editing?.type ?? (typeParam === 'credit' ? 'credit' : 'debit');

  const [step, setStep] = useState<Step>('amount');
  const [back, setBack] = useState(false);
  const [amount, setAmount] = useState(editing ? String(Number(editing.amount)) : '');
  const [categoryId, setCategoryId] = useState<string | null>(editing?.category_id ?? null);
  const [date, setDate] = useState(editing?.date ?? todayIso());
  const [note, setNote] = useState(editing?.notes ?? '');
  const [error, setError] = useState<string | null>(null);
  const [dateOpen, setDateOpen] = useState(false);
  const [catOpen, setCatOpen] = useState(false);
  const [query, setQuery] = useState('');
  const blurTarget = useRef<ComponentRef<typeof View>>(null);
  const add = useAddTransaction(cats.data);
  const update = useUpdateTransaction();

  const forKind = useMemo(() => (cats.data ?? []).filter((c) => matches(c, kind)), [cats.data, kind]);
  const ranked = useMemo(() => {
    const uses = new Map<string, number>();
    for (const t of txns.data ?? []) if (t.type === kind && t.category_id) uses.set(t.category_id, (uses.get(t.category_id) ?? 0) + 1);
    return [...forKind].sort((a, b) => (uses.get(b.id) ?? 0) - (uses.get(a.id) ?? 0) || a.name.localeCompare(b.name));
  }, [forKind, txns.data, kind]);
  const selected = forKind.find((c) => c.id === categoryId) ?? null;
  const shown = query.trim() ? ranked.filter((c) => c.name.toLowerCase().includes(query.trim().toLowerCase())) : ranked;

  // Recent distinct amounts of this type (the selected category's first, when there is one).
  const quick = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    const rows = (txns.data ?? []).filter((t) => t.type === kind);
    for (const t of [...rows.filter((t) => categoryId && t.category_id === categoryId), ...rows]) {
      const a = String(Number(t.amount));
      if (!seen.has(a)) { seen.add(a); out.push(a); }
      if (out.length >= 4) break;
    }
    return out;
  }, [txns.data, categoryId, kind]);

  const close = useCallback(() => (router.canGoBack() ? router.back() : router.replace('/')), []);
  const goDetails = () => {
    const problem = checkAmount(amount);
    if (problem) { haptic.error(); setError(problem); return; }
    haptic.light();
    setBack(false);
    setStep('details');
  };
  const goAmount = useCallback(() => { setBack(true); setStep('amount'); }, []);

  // Android back: closes the date picker, then steps back, then leaves.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (dateOpen) return false; // the picker handles it
      if (step === 'details') { goAmount(); return true; }
      if (step === 'done') { close(); return true; }
      return false;
    });
    return () => sub.remove();
  }, [step, dateOpen, goAmount, close]);

  const save = () => {
    if (!categoryId) { haptic.error(); setError('Choose a category.'); return; }
    const row = { id: editing?.id ?? newTxnId(), user_id: uid!, amount: String(Number(amount)), type: kind, category_id: categoryId, date, notes: note.trim() || null };
    if (editing) update.mutate(row);
    else add.mutate(row);
    haptic.success();
    setStep('done');
  };

  const another = () => {
    setAmount(''); setCategoryId(null); setNote(''); setDate(todayIso()); setError(null); setBack(true); setStep('amount');
  };

  const display = amount ? group(amount.endsWith('.') ? amount.slice(0, -1) : amount, amount.includes('.') ? Math.min(2, amount.split('.')[1].length) : 0) + (amount.endsWith('.') ? '.' : '') : '0';
  const isExpense = kind === 'debit';
  const title = editing ? (isExpense ? 'Edit expense' : 'Edit income') : isExpense ? 'New expense' : 'New income';
  const enter = (back ? FadeInLeft : FadeInRight).duration(280).easing(EASE);
  const today = todayIso();

  const header = (
    <View style={styles.top}>
      {step === 'details'
        ? <IconButton icon={ArrowLeft} label="Back to amount" onPress={goAmount} />
        : <IconButton icon={X} label="Close" onPress={close} />}
      <View style={styles.topMid}>
        <Text variant="bodyStrong" accessibilityRole="header">{title}</Text>
        <View style={styles.steps} accessibilityLabel={`Step ${step === 'amount' ? 1 : 2} of 2`}>
          <View style={[styles.stepDot, { backgroundColor: p.accent, width: step === 'amount' ? 22 : 8 }]} />
          <View style={[styles.stepDot, { backgroundColor: step === 'details' ? p.accent : p.surface3, width: step === 'details' ? 22 : 8 }]} />
        </View>
      </View>
      <View style={{ width: 48 }} />
    </View>
  );

  return (
    <View style={[styles.root, { backgroundColor: p.bg }]}>
      <BlurTargetView ref={blurTarget} style={[styles.root, { backgroundColor: p.bg, paddingTop: insets.top, paddingBottom: Math.max(insets.bottom, space.md) }]}>
        {header}

        {step === 'amount' ? (
          <Animated.View key="amount" entering={enter} style={styles.root}>
            <View style={styles.amountBox} accessibilityRole="text" accessibilityLabel={`Amount ${amount || 'zero'} rupees`}>
              <Text variant="label" tone="muted">Amount</Text>
              <View style={styles.amountRow}>
                <Text style={[styles.currency, { color: p.muted }]}>Rs</Text>
                <Text style={[styles.amount, { color: amount ? p.ink : p.muted }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.45}>{display}</Text>
              </View>
              {error ? <Text variant="label" tone="neg" accessibilityLiveRegion="assertive">{error}</Text> : null}
            </View>

            <View style={{ flex: 1 }} />
            {quick.length ? (
              <View style={styles.quick}>
                {quick.map((q) => <Chip key={q} label={group(q, q.includes('.') ? 2 : 0)} selected={q === amount} onPress={() => { setAmount(q); setError(null); }} accessibilityLabel={`Use ${q} rupees`} />)}
              </View>
            ) : null}
            <View style={{ paddingHorizontal: SCREEN_PAD - 8 }}>
              <Keypad onKey={(k) => { setAmount((a) => pressKey(a, k)); setError(null); }} />
            </View>
            <View style={styles.footer}>
              <Button label="Continue" icon={ArrowRight} onPress={goDetails} />
            </View>
          </Animated.View>
        ) : step === 'details' ? (
          <Animated.View key="details" entering={enter} style={styles.root}>
            <KeyboardAvoidingView behavior="padding" style={[styles.root, styles.detailsBody]}>
              {/* Amount summary: tap to change it. */}
              <Pressable onPress={goAmount} accessibilityRole="button" accessibilityLabel={`Amount Rs ${display}. Change`}
                style={({ pressed }) => [styles.summary, { backgroundColor: p.surface, borderColor: p.border, opacity: pressed ? 0.85 : 1 }]}>
                <View style={{ flex: 1 }}>
                  <Text variant="caption" tone="muted">{isExpense ? 'Expense amount' : 'Income amount'}</Text>
                  <Text style={[styles.summaryAmount, { color: p.ink }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>Rs {display}</Text>
                </View>
                <View style={[styles.editBtn, { backgroundColor: p.surface2 }]}><Pencil size={16} color={p.ink2} /></View>
              </Pressable>

              <View style={[styles.form, { backgroundColor: p.surface, borderColor: p.border }]}>
                <Field label="Category" onPress={() => { haptic.tick(); setCatOpen(true); }} a11y={`Category: ${selected?.name ?? 'not chosen'}. Change`}
                  leading={selected ? <CategoryIcon icon={selected.icon} size={40} tone="accent" /> : <View style={[styles.fieldIcon, { backgroundColor: p.surface2 }]}><LayoutGrid size={18} color={p.ink2} /></View>}
                  value={selected?.name ?? 'Select a category'} placeholder={!selected} />
                <View style={[styles.sep, { backgroundColor: p.border }]} />
                <Field label="Date" onPress={() => { haptic.tick(); setDateOpen(true); }} a11y={`Date: ${longDate(date)}. Change`}
                  leading={<View style={[styles.fieldIcon, { backgroundColor: p.surface2 }]}><CalendarDays size={18} color={p.ink2} /></View>}
                  value={date === today ? `Today, ${shortDate(date)}` : date === addDays(today, -1) ? `Yesterday, ${shortDate(date)}` : longDate(date)} />
                <View style={[styles.sep, { backgroundColor: p.border }]} />
                <View style={styles.field}>
                  <View style={[styles.fieldIcon, { backgroundColor: p.surface2 }]}><NotebookPen size={18} color={p.ink2} /></View>
                  <View style={{ flex: 1 }}>
                    <Text variant="caption" tone="muted">Note</Text>
                    <TextInput
                      value={note}
                      onChangeText={setNote}
                      placeholder="Optional"
                      placeholderTextColor={p.muted}
                      maxLength={NOTE_MAX}
                      returnKeyType="done"
                      style={[styles.noteInput, { color: p.ink }]}
                      accessibilityLabel="Note"
                      selectionColor={p.accent}
                      cursorColor={p.accent}
                    />
                  </View>
                </View>
              </View>

              <View style={{ flex: 1 }} />
              {error ? <Text variant="label" tone="neg" align="center" style={{ marginBottom: space.sm }} accessibilityLiveRegion="assertive">{error}</Text> : null}
              <Button label={editing ? 'Save changes' : isExpense ? 'Save expense' : 'Save income'} onPress={save} />
            </KeyboardAvoidingView>
          </Animated.View>
        ) : null}
      </BlurTargetView>

      {dateOpen ? (
        <DatePicker value={date} blurTarget={blurTarget} onClose={() => setDateOpen(false)} onPick={(d) => { setDate(d); setDateOpen(false); }} />
      ) : null}

      {catOpen ? (
      <GlassSheet blurTarget={blurTarget} onClose={() => { setCatOpen(false); setQuery(''); }} title={isExpense ? 'Expense category' : 'Income category'} maxHeight={0.8}>
        {forKind.length > 8 ? (
          <View style={[styles.search, { backgroundColor: p.surface2, borderColor: p.border }]}>
            <Search size={17} color={p.muted} />
            <TextInput value={query} onChangeText={setQuery} placeholder="Search categories" placeholderTextColor={p.muted}
              style={[styles.searchInput, { color: p.ink }]} accessibilityLabel="Search categories" selectionColor={p.accent} cursorColor={p.accent} />
          </View>
        ) : null}
        {shown.length ? shown.map((c, i) => {
          const on = c.id === categoryId;
          return (
            <Pressable key={c.id} accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel={c.name}
              onPress={() => { haptic.tick(); setCategoryId(c.id); setError(null); setCatOpen(false); setQuery(''); }}
              style={({ pressed }) => [styles.option, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: p.mode === 'dark' ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.08)' }, { opacity: pressed ? 0.75 : 1 }]}>
              <CategoryIcon icon={c.icon} size={40} tone={on ? 'accent' : 'neutral'} />
              <Text variant="body" style={{ flex: 1, fontFamily: on ? font.semibold : font.regular }} numberOfLines={1}>{c.name}</Text>
              <View style={[styles.radio, { borderColor: on ? p.accent : p.borderStrong, backgroundColor: on ? p.accent : 'transparent' }]}>
                {on ? <Check size={13} color={p.accentInk} strokeWidth={3} /> : null}
              </View>
            </Pressable>
          );
        }) : (
          <Text variant="body" tone="muted" style={{ paddingVertical: space.lg }}>
            {forKind.length ? 'No category matches.' : `No ${isExpense ? 'expense' : 'income'} categories yet. Add them in Fintraxa on the web.`}
          </Text>
        )}
      </GlassSheet>
      ) : null}

      {step === 'done' ? (
        <AddDone kind={kind} amount={String(Number(amount))} category={selected} date={date} note={note} editing={!!editing} onDone={close} onAnother={another} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8, paddingVertical: space.sm },
  topMid: { alignItems: 'center', gap: 6 },
  steps: { flexDirection: 'row', gap: 5 },
  stepDot: { height: 4, borderRadius: 2 },
  amountBox: { alignItems: 'center', paddingHorizontal: SCREEN_PAD, paddingTop: space.xxxl, gap: space.sm },
  amountRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8, maxWidth: '100%' },
  currency: { fontFamily: font.numMedium, fontSize: 26 },
  amount: { fontFamily: font.numBold, fontSize: 60, lineHeight: 70, letterSpacing: -1.5, fontVariant: ['tabular-nums'] },
  quick: { flexDirection: 'row', gap: space.sm, paddingHorizontal: SCREEN_PAD, marginBottom: space.sm, justifyContent: 'center', flexWrap: 'wrap' },
  footer: { paddingHorizontal: SCREEN_PAD, paddingTop: space.sm },
  detailsBody: { paddingHorizontal: SCREEN_PAD, paddingTop: space.md },
  summary: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md, borderRadius: 22, borderWidth: StyleSheet.hairlineWidth },
  summaryAmount: { fontFamily: font.numBold, fontSize: 28, lineHeight: 34, letterSpacing: -0.6, fontVariant: ['tabular-nums'] },
  editBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  form: { marginTop: space.lg, borderRadius: 22, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: space.lg },
  field: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 72, paddingVertical: space.sm },
  fieldIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  sep: { height: StyleSheet.hairlineWidth, marginLeft: 52 },
  noteInput: { fontFamily: font.semibold, fontSize: 15, lineHeight: 21, padding: 0, marginTop: 1 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 46, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 14, marginBottom: space.sm },
  searchInput: { flex: 1, fontFamily: font.regular, fontSize: 15, padding: 0 },
  option: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 60 },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
});
