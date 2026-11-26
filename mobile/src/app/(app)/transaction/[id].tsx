import Decimal from 'decimal.js';
import { router, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTransactions } from '@/data/queries';
import { money } from '@/lib/format';
import { EmptyState, Skeleton } from '@/ui/feedback';
import { useHidden } from '@/ui/Figures';
import { BankLogo, CategoryIcon } from '@/ui/Logos';
import { Receipt, receiptDate, type ReceiptRow } from '@/ui/Receipt';
import { Screen } from '@/ui/Screen';
import { space } from '@/ui/tokens';

const KIND: Record<string, string> = { active: 'Income', passive: 'Passive income', spend: 'Expense', transfer: 'Moved to savings or investments' };

/**
 * One income / expense as a formal receipt (black glass), filling the screen with no scrolling (owner, 2026-11-15).
 * Only what a bank slip shows (owner, 2026-11-26): amount, category, date, account, note. Savings profit shows its
 * bank's logo, the account, the gross profit, the tax the bank withheld (and its rate) and the net credited.
 * Edit / Delete live on the list's long-press sheet.
 */
export default function TransactionDetail() {
  const hidden = useHidden();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const txns = useTransactions();
  const t = txns.data?.find((x) => x.id === id);

  if (!t && txns.isLoading) return <Screen back title="Receipt"><Skeleton height={420} radius={28} /></Screen>;
  if (!t) return <Screen back title="Receipt"><EmptyState title="Transaction not found" body="It may have been deleted." action="Go back" onAction={() => router.back()} /></Screen>;

  const rs = (v: string | number) => money(v, { hidden, decimals: 2 });
  const credit = t.type === 'credit';
  const acct = t.savings_accounts ?? null;
  const gross = t.gross_amount !== null && t.gross_amount !== undefined ? new Decimal(String(t.gross_amount)) : null;
  const tax = gross ? gross.minus(String(t.amount)) : new Decimal(0);
  const rate = gross && gross.gt(0) ? tax.dividedBy(gross).times(100) : null;
  const savings = !!acct && !!gross;
  const category = t.categories?.name ?? 'Uncategorised';

  const rows: ReceiptRow[] = [
    { label: 'Date', value: receiptDate(t.date) },
    // The title is the account for savings profit, so the category still needs its row; otherwise the title is it.
    ...(savings ? [{ label: 'Category', value: category }] : []),
    ...(acct && !savings ? [{ label: 'Account', value: [acct.bank_name, acct.name].filter(Boolean).join(' · ') }] : []),
    ...(gross && tax.gt(0) ? [
      { label: savings ? 'Gross profit' : 'Gross amount', value: rs(gross.toFixed(2)) },
      { label: `Tax withheld${rate ? ` (${rate.toDecimalPlaces(1).toString()}%)` : ''}`, value: `−${rs(tax.toFixed(2))}` },
      { label: savings ? 'Net credited' : 'Net amount', value: rs(t.amount), strong: true },
    ] : []),
    ...(t.notes ? [{ label: 'Note', value: t.notes }] : []),
  ];

  return (
    <Screen back title="Receipt" scroll={false}>
      <View style={{ flex: 1, paddingBottom: insets.bottom + space.md }}>
        <Receipt
          fill
          icon={savings ? <BankLogo symbol={acct!.bank_symbol} size={52} /> : <CategoryIcon icon={t.categories?.icon} size={52} tone="glass" />}
          title={savings ? acct!.name : category}
          subtitle={savings ? acct!.bank_name ?? undefined : undefined}
          amount={`${credit ? '+' : '−'}${rs(t.amount)}`}
          positive={credit}
          status={savings ? 'Savings profit' : KIND[t.categories?.kind ?? (credit ? 'active' : 'spend')] ?? (credit ? 'Income' : 'Expense')}
          rows={rows}
          reference={t.id.slice(0, 8).toUpperCase()}
        />
      </View>
    </Screen>
  );
}
