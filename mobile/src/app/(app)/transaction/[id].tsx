import { router, useLocalSearchParams } from 'expo-router';
import { useTransactions } from '@/data/queries';
import { longDate } from '@/lib/dates';
import { money } from '@/lib/format';
import { EmptyState } from '@/ui/feedback';
import { useHidden } from '@/ui/Figures';
import { CategoryIcon } from '@/ui/Logos';
import { Receipt } from '@/ui/Receipt';
import { Screen } from '@/ui/Screen';

const KIND: Record<string, string> = { active: 'Earned income', passive: 'Passive income', spend: 'Spending', transfer: 'Moved to savings or investments' };

/** One income / expense as a formal receipt (black glass). Edit / Delete live on the list's long-press sheet. */
export default function TransactionDetail() {
  const hidden = useHidden();
  const { id } = useLocalSearchParams<{ id: string }>();
  const txns = useTransactions();
  const t = txns.data?.find((x) => x.id === id);

  if (!t) return <Screen back title="Receipt"><EmptyState title="Transaction not found" body="It may have been deleted." action="Go back" onAction={() => router.back()} /></Screen>;
  const credit = t.type === 'credit';
  const gross = t.gross_amount !== null && t.gross_amount !== undefined ? Number(t.gross_amount) : null;
  const tax = gross !== null ? gross - Number(t.amount) : 0;
  return (
    <Screen back title="Receipt">
      <Receipt
        icon={<CategoryIcon icon={t.categories?.icon} size={56} tone="glass" />}
        title={t.categories?.name ?? 'Uncategorised'}
        subtitle={credit ? 'Money in' : 'Money out'}
        amount={`${credit ? '+' : '−'}${money(t.amount, { hidden, decimals: 2 })}`}
        positive={credit}
        status={KIND[t.categories?.kind ?? (credit ? 'active' : 'spend')]}
        rows={[
          { label: 'Date', value: longDate(t.date) },
          { label: 'Type', value: credit ? 'Income (credit)' : 'Expense (debit)' },
          { label: 'Category', value: t.categories?.name ?? 'Uncategorised' },
          ...(gross !== null && tax > 0 ? [{ label: 'Gross', value: money(gross, { hidden, decimals: 2 }) }, { label: 'Tax withheld', value: money(tax, { hidden, decimals: 2 }) }] : []),
          ...(t.savings_accounts?.name ? [{ label: 'Account', value: `${t.savings_accounts.name}${t.savings_accounts.bank_name ? ` · ${t.savings_accounts.bank_name}` : ''}` }] : []),
          ...(t.notes ? [{ label: 'Note', value: t.notes }] : []),
          { label: 'Recorded', value: longDate(t.created_at.slice(0, 10)) },
        ]}
        reference={t.id.slice(0, 8).toUpperCase()}
      />
    </Screen>
  );
}
