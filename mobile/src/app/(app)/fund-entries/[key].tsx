import { router, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useFundsAnalysis } from '@/data/portfolio';
import { ALL_TIME_START, monthLabel, shortDate, todayIso } from '@/lib/dates';
import { money, units } from '@/lib/format';
import { EmptyState, Skeleton } from '@/ui/feedback';
import { useHidden } from '@/ui/Figures';
import { ArrowDownLeft, ArrowUpRight, RotateCcw } from '@/ui/icons';
import { AmcLogo } from '@/ui/Logos';
import { BlackGlass, GLASS_INK, GLASS_INK2, GLASS_LINE } from '@/ui/BlackGlass';
import { Gap } from '@/ui/primitives';
import { Screen } from '@/ui/Screen';
import { Text } from '@/ui/Text';
import { font, space } from '@/ui/tokens';

const ENTRY: Record<string, string> = {
  purchase: 'Purchase', redemption: 'Redemption', switch_in: 'Switch in', switch_out: 'Switch out',
  cgt_refund_reinvest: 'CGT refund reinvested', capital_refund_units: 'Capital refund (units)', dividend_reinvest: 'Dividend reinvested',
};

/**
 * Every transaction of one fund (owner, 2026-11-14: linked from the fund page), newest first, grouped by month:
 * type, date, units at the NAV, and the amount. Reversed entries are left out.
 */
export default function FundEntries() {
  const hidden = useHidden();
  const { key } = useLocalSearchParams<{ key: string }>();
  const range = useMemo(() => ({ start: ALL_TIME_START, end: todayIso() }), []);
  const { analysis, isLoading } = useFundsAnalysis(range);
  const x = analysis?.allPositions.find((pos) => pos.key === key);

  const groups = useMemo(() => {
    const rows = [...(x?.entries ?? [])].filter((e) => !e.reverses_entry_id)
      .sort((a, b) => String(b.trade_date).localeCompare(String(a.trade_date)));
    const map = new Map<string, typeof rows>();
    for (const e of rows) {
      const m = String(e.trade_date).slice(0, 7);
      map.set(m, [...(map.get(m) ?? []), e]);
    }
    return [...map.entries()];
  }, [x]);

  if (isLoading && !analysis) return <Screen back title="Transactions"><Skeleton height={80} radius={20} /><Gap h={space.lg} /><Skeleton height={300} radius={20} /></Screen>;
  if (!x) return <Screen back title="Transactions"><EmptyState title="Fund not found" body="It may have been removed from your ledger." /></Screen>;

  return (
    <Screen back title="Transactions">
      <BlackGlass style={styles.fund}>
        <AmcLogo code={x.amcCode} name={x.amcName} size={40} />
        <View style={{ flex: 1 }}>
          <Text style={styles.fundName} numberOfLines={2}>{x.fundName ?? 'Fund'}</Text>
          <Text style={styles.small}>{groups.reduce((n, [, r]) => n + r.length, 0)} transactions</Text>
        </View>
      </BlackGlass>

      {groups.length ? groups.map(([m, rows]) => (
        <View key={m}>
          <Text variant="label" tone="ink2" style={styles.month}>{monthLabel(m, true)}</Text>
          <BlackGlass style={{ paddingVertical: 0 }}>
            {rows.map((e, i) => {
              const u = Number(e.unit_delta ?? 0);
              const amt = (e.gross_amount ?? e.net_amount) as string | null;
              const nav = e.nav ? Number(e.nav) : null;
              const type = String(e.entry_type);
              const Icon = u > 0 ? ArrowDownLeft : u < 0 ? ArrowUpRight : RotateCcw;
              return (
                <Pressable key={String(e.id)} onPress={() => router.push({ pathname: '/fund-entry/[id]', params: { id: String(e.id), key: x.key } })} accessibilityRole="button"
                  style={({ pressed }) => [styles.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: GLASS_LINE }, { opacity: pressed ? 0.75 : 1 }]}>
                  <View style={styles.icon}>
                    <Icon size={17} color={GLASS_INK} />
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={styles.title} numberOfLines={1}>{ENTRY[type] ?? String(e.original_label ?? type).replace(/_/g, ' ')}</Text>
                    <Text style={styles.small} numberOfLines={1}>
                      {shortDate(String(e.trade_date))} · {u > 0 ? '+' : ''}{units(u)} units{nav ? ` @ ${money(nav, { decimals: 4 }).replace('Rs ', '')}` : ''}
                    </Text>
                  </View>
                  {amt ? <Text style={styles.amt}>{money(amt, { hidden })}</Text> : null}
                </Pressable>
              );
            })}
          </BlackGlass>
        </View>
      )) : <EmptyState title="No transactions" body="This fund has no entries in your ledger." />}
    </Screen>
  );
}

const styles = StyleSheet.create({
  fund: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  fundName: { color: GLASS_INK, fontFamily: font.semibold, fontSize: 15, lineHeight: 20 },
  small: { color: GLASS_INK2, fontFamily: font.regular, fontSize: 12 },
  title: { color: GLASS_INK, fontFamily: font.semibold, fontSize: 14.5 },
  month: { marginTop: space.xl, marginBottom: space.sm, marginLeft: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 64, paddingVertical: space.sm },
  icon: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.08)' },
  amt: { color: GLASS_INK, fontFamily: font.num, fontSize: 14.5 },
});
