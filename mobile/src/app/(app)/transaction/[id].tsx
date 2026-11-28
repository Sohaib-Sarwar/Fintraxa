import Decimal from 'decimal.js';
import { useLocalSearchParams } from 'expo-router';
import { useTransactions } from '@/data/queries';
import { money } from '@/lib/format';
import { useHidden } from '@/ui/Figures';
import { BankLogo, CategoryIcon } from '@/ui/Logos';
import { receiptDate, receiptFileName, ReceiptScreen, type ReceiptRow } from '@/ui/Receipt';

const KIND: Record<string, string> = { active: 'Income', passive: 'Passive income', spend: 'Expense', transfer: 'Moved to savings or investments' };

/**
 * One income / expense as a formal receipt (black glass), filling the screen with no scrolling (owner, 2026-11-15).
 * Only what a bank slip shows (owner, 2026-11-26): amount, category, date, account, note. Savings profit shows its
 * bank's logo, the account, the gross profit, the tax the bank withheld (and its rate) and the net credited.
 * Edit / Delete live on the list's long-press sheet. Download (top right) saves the slip as an image.
 */
export default function TransactionDetail() {
  const hidden = useHidden();
  const { id } = useLocalSearchParams<{ id: string }>();
  const txns = useTransactions();
  const t = txns.data?.find((x) => x.id === id);

  if (!t) return <ReceiptScreen receipt={null} file="" loading={txns.isLoading} missing={{ title: 'Transaction not found', body: 'It may have been deleted.' }} />;

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
    <ReceiptScreen
      file={receiptFileName(savings ? acct!.name : category, t.date)}
      receipt={{
        icon: savings ? <BankLogo symbol={acct!.bank_symbol} size={48} /> : <CategoryIcon icon={t.categories?.icon} size={48} tone="glass" />,
        title: savings ? acct!.name : category,
        subtitle: savings ? acct!.bank_name ?? undefined : undefined,
        amount: `${credit ? '+' : '−'}${rs(t.amount)}`,
        positive: credit,
        status: savings ? 'Savings profit' : KIND[t.categories?.kind ?? (credit ? 'active' : 'spend')] ?? (credit ? 'Income' : 'Expense'),
        rows,
        reference: t.id.slice(0, 8).toUpperCase(),
      }}
    />
  );
}
