import { router, useLocalSearchParams } from 'expo-router';
import { Pencil, Trash2 } from '@/ui/icons';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useDeleteTransaction } from '@/data/mutations';
import { useTransactions } from '@/data/queries';
import { dayHeading, shortDate, todayIso } from '@/lib/dates';
import { money } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { EmptyState } from '@/ui/feedback';
import { useHidden } from '@/ui/Figures';
import { CategoryIcon } from '@/ui/Logos';
import { Button, Card, Divider, Gap } from '@/ui/primitives';
import { Screen } from '@/ui/Screen';
import { Sheet } from '@/ui/Sheet';
import { Text } from '@/ui/Text';
import { space } from '@/ui/tokens';

const KIND: Record<string, string> = { active: 'Earned income', passive: 'Passive income', spend: 'Spending', transfer: 'Moved to savings or investments' };

export default function TransactionDetail() {
  const hidden = useHidden();
  const { id } = useLocalSearchParams<{ id: string }>();
  const txns = useTransactions();
  const remove = useDeleteTransaction();
  const [confirm, setConfirm] = useState(false);
  const t = txns.data?.find((x) => x.id === id);

  if (!t) {
    return <Screen back><EmptyState title="Transaction not found" body="It may have been deleted." action="Go back" onAction={() => router.back()} /></Screen>;
  }
  const credit = t.type === 'credit';
  const rows: [string, string][] = [
    ['Date', (() => { const h = dayHeading(t.date, todayIso()); return h === 'Today' || h === 'Yesterday' ? `${h}, ${shortDate(t.date)}` : shortDate(t.date); })()],
    ['Type', KIND[t.categories?.kind ?? (credit ? 'active' : 'spend')]],
    ...(t.savings_accounts?.name ? [['Account', t.savings_accounts.name] as [string, string]] : []),
    ...(t.notes ? [['Note', t.notes] as [string, string]] : []),
  ];
  return (
    <Screen back>
      <View style={styles.head}>
        <CategoryIcon icon={t.categories?.icon} size={64} tone={credit ? 'income' : 'neutral'} />
        <Text variant="headline">{t.categories?.name ?? 'Uncategorised'}</Text>
        <Text variant="hero" tone={credit ? 'pos' : 'ink'} style={{ fontVariant: ['tabular-nums'] }}>
          {credit ? '+' : '−'}{money(t.amount, { hidden, decimals: 2 })}
        </Text>
      </View>
      <Card padded={false} style={{ paddingHorizontal: space.lg }}>
        {rows.map(([k, v], i) => (
          <View key={k}>
            {i > 0 ? <Divider /> : null}
            <View style={styles.row}>
              <Text variant="body" tone="ink2">{k}</Text>
              <Text variant="bodyStrong" style={styles.value}>{v}</Text>
            </View>
          </View>
        ))}
      </Card>
      <Gap h={space.xl} />
      <Button label="Edit" kind="secondary" icon={Pencil} onPress={() => router.push({ pathname: '/add', params: { id: t.id } })} />
      <Gap h={space.md} />
      <Button label="Delete" kind="danger" icon={Trash2} onPress={() => { haptic.warning(); setConfirm(true); }} />

      <Sheet open={confirm} onClose={() => setConfirm(false)} title="Delete this transaction?">
        <Text variant="body" tone="ink2">It’s removed from your totals everywhere. You can undo for 5 seconds.</Text>
        <Gap h={space.xl} />
        <Button label="Delete" kind="danger" onPress={() => { setConfirm(false); remove(t); router.back(); }} />
        <Gap h={space.md} />
        <Button label="Keep it" kind="secondary" onPress={() => setConfirm(false)} />
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { alignItems: 'center', gap: space.sm, paddingVertical: space.xl },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 52, gap: space.lg },
  value: { flexShrink: 1, textAlign: 'right' },
});
