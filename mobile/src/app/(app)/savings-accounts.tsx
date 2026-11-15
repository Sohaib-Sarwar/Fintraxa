import { useQueryClient } from '@tanstack/react-query';
import { BlurTargetView } from 'expo-blur';
import { useLocalSearchParams } from 'expo-router';
import { useRef, useState, type ComponentRef } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { friendlyError } from '@/data/mutations';
import { BANKS, bankName } from '@/data/engines';
import { TXNS_KEY, useProfile, useSavingsAccounts, useUid } from '@/data/queries';
import type { SavingsAccount } from '@/data/types';
import { haptic } from '@/lib/haptics';
import { supabase } from '@/lib/supabase';
import { BlackGlass, GLASS_INK, GLASS_INK2, GLASS_LINE } from '@/ui/BlackGlass';
import { EmptyState, Skeleton, toast } from '@/ui/feedback';
import { GlassSheet } from '@/ui/GlassSheet';
import { Check, ChevronRight, Plus } from '@/ui/icons';
import { BankLogo } from '@/ui/Logos';
import { Button, CircleButton, Gap } from '@/ui/primitives';
import { Screen } from '@/ui/Screen';
import { Text } from '@/ui/Text';
import { dark, font, space } from '@/ui/tokens';

/** Withholding on bank profit in Pakistan: active filer 20%, non-filer 40% (web: SAVINGS_TAX_RATES). */
const RATES = [{ value: 0.2, label: '20% filer' }, { value: 0.4, label: '40% non-filer' }];
type Form = { id?: string; bank_symbol: string; name: string; profit_rate: string; tax_rate: number };

/** The web's checks (useSavingsAccounts.validateAccount): a message, or null when it can be saved. */
function check(f: Form, existing: SavingsAccount[]): string | null {
  const name = f.name.trim();
  if (!f.bank_symbol) return 'Choose the bank.';
  if (!name) return 'Give the account a name.';
  if (name.length > 60) return 'Keep the name under 60 characters.';
  if (existing.some((a) => a.id !== f.id && a.name.trim().toLowerCase() === name.toLowerCase())) return 'You already have an account with that name.';
  if (f.profit_rate.trim() !== '') {
    const r = Number(f.profit_rate.replace('%', ''));
    if (!Number.isFinite(r) || r < 0 || r > 100) return 'The profit rate must be between 0% and 100%.';
  }
  return null;
}

/**
 * Savings accounts (owner, 2026-11-15: "settings in Me to add a bank for savings profit"): the banks your savings
 * profit is paid into, with their logos (UBL Ameen, MCB Islamic, Raqami and the PSX banks). The same table as the
 * web's Savings accounts dialog; an account already used by profit entries is archived rather than deleted.
 */
export default function SavingsAccounts() {
  const { add } = useLocalSearchParams<{ add?: string }>();
  const uid = useUid();
  const qc = useQueryClient();
  const profile = useProfile();
  const accounts = useSavingsAccounts();
  const target = useRef<ComponentRef<typeof View>>(null);
  const blank = (): Form => ({ bank_symbol: '', name: '', profit_rate: '', tax_rate: profile.data?.filer_status === 'non_filer' ? 0.4 : 0.2 });
  // Opened from the income form's "Add a savings account": straight to the form.
  const [form, setForm] = useState<Form | null>(() => (add ? blank() : null));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const list = accounts.data ?? [];

  const pickBank = (symbol: string) => {
    haptic.tick();
    setForm((f) => (f ? {
      ...f, bank_symbol: symbol,
      // Suggest "<Bank> savings" until the user names it themselves (the web's rule).
      name: !f.name || BANKS.some((b) => f.name === `${b.name} savings`) ? `${bankName(symbol)} savings` : f.name,
    } : f));
    setError(null);
  };

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['savings-accounts'] });
    qc.invalidateQueries({ queryKey: [TXNS_KEY] }); // profit entries show the account's name and bank
  };

  const save = async () => {
    if (!form || !uid) return;
    const why = check(form, list);
    if (why) { haptic.error(); setError(why); return; }
    setBusy(true);
    const row = {
      bank_symbol: form.bank_symbol, bank_name: bankName(form.bank_symbol), name: form.name.trim(),
      profit_rate: form.profit_rate.trim() === '' ? null : Number(form.profit_rate.replace('%', '')), tax_rate: form.tax_rate,
    };
    const { error: e } = form.id
      ? await supabase.from('savings_accounts').update(row).eq('id', form.id)
      : await supabase.from('savings_accounts').insert({ ...row, user_id: uid });
    setBusy(false);
    if (e) { haptic.error(); setError(friendlyError(e)); return; }
    haptic.success();
    toast(form.id ? 'Account saved' : 'Savings account added');
    setForm(null);
    refresh();
  };

  const setArchived = async (a: SavingsAccount, archived: boolean) => {
    const { error: e } = await supabase.from('savings_accounts').update({ archived }).eq('id', a.id);
    if (e) { toast(friendlyError(e), { tone: 'error' }); return; }
    haptic.success();
    toast(archived ? 'Account archived' : 'Account restored', { tone: 'info' });
    setForm(null);
    refresh();
  };

  const editing = form?.id ? list.find((a) => a.id === form.id) : undefined;

  return (
    <View style={styles.root}>
      <BlurTargetView ref={target} style={styles.root}>
        <Screen back title="Savings accounts" right={<CircleButton icon={Plus} label="Add a savings account" onPress={() => { setError(null); setForm(blank()); }} />}>
          {accounts.isLoading && !accounts.data ? <Skeleton height={180} radius={22} /> : list.length ? (
            <BlackGlass style={{ paddingVertical: 0 }}>
              {list.map((a, i) => (
                <Pressable key={a.id} onPress={() => { haptic.tick(); setError(null); setForm({ id: a.id, bank_symbol: a.bank_symbol, name: a.name, profit_rate: a.profit_rate === null ? '' : String(a.profit_rate), tax_rate: a.tax_rate }); }}
                  accessibilityRole="button" accessibilityLabel={`${a.name}, ${a.bank_name}. Edit`}
                  style={({ pressed }) => [styles.row, i > 0 && styles.sep, { opacity: pressed ? 0.75 : a.archived ? 0.5 : 1 }]}>
                  <BankLogo symbol={a.bank_symbol} size={40} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={styles.name} numberOfLines={1}>{a.name}</Text>
                    <Text style={styles.small} numberOfLines={1}>
                      {a.bank_name} · tax {Math.round(a.tax_rate * 100)}%{a.profit_rate !== null ? ` · profit ${a.profit_rate}%` : ''}{a.archived ? ' · archived' : ''}
                    </Text>
                  </View>
                  <ChevronRight size={17} color={GLASS_INK2} />
                </Pressable>
              ))}
            </BlackGlass>
          ) : (
            <EmptyState title="No savings accounts yet" body="Add the bank your savings profit is paid into. Profit you record then shows the bank and its tax."
              action="Add a savings account" onAction={() => setForm(blank())} />
          )}
          <Gap h={space.md} />
          <Text style={[styles.small, { paddingHorizontal: 4 }]}>Banks withhold 20% of profit for filers and 40% for non-filers. Record the gross profit; the tax and the amount credited are worked out.</Text>
        </Screen>
      </BlurTargetView>

      {form ? (
        <GlassSheet blurTarget={target} smoky title={form.id ? 'Edit account' : 'Add a savings account'} onClose={() => setForm(null)} maxHeight={0.9}>
          <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 560 }}>
            <Text style={styles.head}>Bank</Text>
            <View style={styles.banks}>
              {BANKS.map((b) => {
                const on = form.bank_symbol === b.symbol;
                return (
                  <Pressable key={b.symbol} onPress={() => pickBank(b.symbol)} accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel={b.name}
                    style={({ pressed }) => [styles.bank, on && styles.bankOn, { opacity: pressed ? 0.75 : 1 }]}>
                    <BankLogo symbol={b.symbol} size={34} />
                    <Text style={[styles.bankName, on && { color: GLASS_INK }]} numberOfLines={2}>{b.name}</Text>
                    {on ? <View style={styles.tick}><Check size={10} color="#000" strokeWidth={3.2} /></View> : null}
                  </Pressable>
                );
              })}
            </View>

            <Text style={styles.head}>Name</Text>
            <TextInput value={form.name} onChangeText={(v) => { setForm({ ...form, name: v }); setError(null); }} placeholder="e.g. UBL savings" placeholderTextColor={GLASS_INK2}
              style={styles.input} maxLength={60} accessibilityLabel="Account name" />

            <Text style={styles.head}>Profit rate (optional)</Text>
            <View style={styles.inputRow}>
              <TextInput value={form.profit_rate} onChangeText={(v) => { setForm({ ...form, profit_rate: v.replace(/[^0-9.]/g, '') }); setError(null); }}
                keyboardType="decimal-pad" placeholder="e.g. 9.5" placeholderTextColor={GLASS_INK2} style={[styles.input, { flex: 1 }]} accessibilityLabel="Profit rate, percent a year" />
              <Text style={styles.small}>% a year</Text>
            </View>

            <Text style={styles.head}>Tax withheld on profit</Text>
            <View style={{ flexDirection: 'row', gap: space.sm }}>
              {RATES.map((r) => {
                const on = Math.abs(form.tax_rate - r.value) < 1e-9;
                return (
                  <Pressable key={r.value} onPress={() => { haptic.tick(); setForm({ ...form, tax_rate: r.value }); }} accessibilityRole="radio" accessibilityState={{ checked: on }}
                    style={[styles.rate, on && styles.rateOn]}>
                    <Text style={[styles.rateText, on && { color: '#000' }]}>{r.label}</Text>
                  </Pressable>
                );
              })}
            </View>

            {error ? <Text style={styles.error} accessibilityLiveRegion="polite">{error}</Text> : null}
            <Gap h={space.lg} />
            <Button label={form.id ? 'Save' : 'Add account'} onPress={save} loading={busy} disabled={busy} />
            {editing ? (
              <Button label={editing.archived ? 'Restore account' : 'Archive account'} kind="ghost" style={{ marginTop: space.sm }}
                onPress={() => setArchived(editing, !editing.archived)} />
            ) : null}
          </ScrollView>
        </GlassSheet>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md },
  sep: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: GLASS_LINE },
  name: { color: GLASS_INK, fontFamily: font.semibold, fontSize: 15 },
  small: { color: GLASS_INK2, fontFamily: font.regular, fontSize: 12, lineHeight: 17 },
  head: { color: GLASS_INK2, fontFamily: font.semibold, fontSize: 12, letterSpacing: 0.3, marginTop: space.md, marginBottom: space.sm },
  banks: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  bank: { width: '31.5%', alignItems: 'center', gap: 6, paddingVertical: 10, paddingHorizontal: 4, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'transparent' },
  bankOn: { borderColor: 'rgba(255,255,255,0.55)', backgroundColor: 'rgba(255,255,255,0.10)' },
  bankName: { color: GLASS_INK2, fontFamily: font.medium, fontSize: 11, lineHeight: 14, textAlign: 'center' },
  tick: { position: 'absolute', top: 6, right: 6, width: 16, height: 16, borderRadius: 8, backgroundColor: '#F3F4F2', alignItems: 'center', justifyContent: 'center' },
  input: { height: 46, borderRadius: 12, paddingHorizontal: 14, backgroundColor: 'rgba(255,255,255,0.08)', color: GLASS_INK, fontFamily: font.regular, fontSize: 15 },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  rate: { flex: 1, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.08)' },
  rateOn: { backgroundColor: '#F3F4F2' },
  rateText: { color: GLASS_INK, fontFamily: font.semibold, fontSize: 13 },
  error: { color: dark.neg, fontFamily: font.medium, fontSize: 13, marginTop: space.md },
});
