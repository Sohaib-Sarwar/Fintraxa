import Decimal from 'decimal.js';
import { router, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTransactions } from '@/data/queries';
import { longDate } from '@/lib/dates';
import { money } from '@/lib/format';
import { EmptyState, Skeleton } from '@/ui/feedback';
import { useHidden } from '@/ui/Figures';
import { BankLogo, CategoryIcon } from '@/ui/Logos';
import { Receipt } from '@/ui/Receipt';
import { Screen } from '@/ui/Screen';
import { space } from '@/ui/tokens';

const KIND: Record<string, string> = { active: 'Earned income', passive: 'Passive income', spend: 'Spending', transfer: 'Moved to savings or investments' };

/**
 * One income / expense as a formal receipt (black glass), filling the screen with no scrolling (owner, 2026-11-15).
 * Savings profit shows its bank's logo, the account, the gross profit, the tax the bank withheld (and its rate) and
 * the net credited. Edit / Delete live on the list's long-press sheet.
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

  return (
    <Screen back title="Receipt" scroll={false}>
      <View style={{ flex: 1, paddingBottom: insets.bottom + space.md }}>
        <Receipt
          fill
          icon={savings ? <BankLogo symbol={acct!.bank_symbol} size={52} /> : <CategoryIcon icon={t.categories?.icon} size={52} tone="glass" />}
          title={savings ? acct!.name : t.categories?.name ?? 'Uncategorised'}
          subtitle={savings ? acct!.bank_name ?? 'Savings profit' : credit ? 'Money in' : 'Money out'}
          amount={`${credit ? '+' : '−'}${rs(t.amount)}`}
          positive={credit}
          status={savings ? 'Savings profit credited' : KIND[t.categories?.kind ?? (credit ? 'active' : 'spend')]}
          rows={[
            { label: 'Date', value: longDate(t.date) },
            ...(savings ? [] : [{ label: 'Type', value: credit ? 'Income (credit)' : 'Expense (debit)' }]),
            { label: 'Category', value: t.categories?.name ?? 'Uncategorised' },
            ...(acct ? [{ label: 'Bank', value: `${acct.bank_name ?? ''}${acct.name ? ` · ${acct.name}` : ''}` }] : []),
            ...(gross && tax.gt(0) ? [
              { label: savings ? 'Gross profit' : 'Gross', value: rs(gross.toFixed(2)) },
              { label: `Tax withheld${rate ? ` (${rate.toDecimalPlaces(1).toString()}%)` : ''}`, value: `−${rs(tax.toFixed(2))}` },
              { label: savings ? 'Net received' : 'Net', value: rs(t.amount) },
            ] : []),
            ...(t.notes ? [{ label: 'Note', value: t.notes }] : []),
            { label: 'Recorded', value: longDate(t.created_at.slice(0, 10)) },
          ]}
          reference={t.id.slice(0, 8).toUpperCase()}
        />
      </View>
    </Screen>
  );
}
