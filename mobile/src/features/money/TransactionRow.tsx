import { router } from 'expo-router';
import { memo } from 'react';
import type { Txn } from '@/data/types';
import { shortDate } from '@/lib/dates';
import { money } from '@/lib/format';
import { useHidden } from '@/ui/Figures';
import { ListRow } from '@/ui/ListRow';
import { CategoryIcon } from '@/ui/Logos';
import { Text } from '@/ui/Text';

/** One transaction: category icon · category + note · signed amount (green only for money in). */
export const TransactionRow = memo(function TransactionRow({ t, showDate = false }: { t: Txn; showDate?: boolean }) {
  const hidden = useHidden();
  const credit = t.type === 'credit';
  const transfer = t.categories?.kind === 'transfer';
  const name = t.categories?.name ?? 'Uncategorised';
  const sub = [t.notes, showDate ? shortDate(t.date) : null, transfer ? 'Moved to savings/investments' : null].filter(Boolean).join(' · ');
  const amount = money(t.amount, { hidden });
  return (
    <ListRow
      leading={<CategoryIcon icon={t.categories?.icon} tone={credit ? 'income' : 'neutral'} />}
      title={name}
      subtitle={sub || null}
      trailing={<Text variant="num" tone={credit ? 'pos' : transfer ? 'ink2' : 'ink'}>{credit ? `+${amount}` : amount}</Text>}
      onPress={() => router.push({ pathname: '/transaction/[id]', params: { id: t.id } })}
      accessibilityLabel={`${name}, ${credit ? 'received' : 'spent'} ${hidden ? 'hidden amount' : amount}${t.notes ? `, ${t.notes}` : ''}, ${shortDate(t.date)}`}
    />
  );
});
