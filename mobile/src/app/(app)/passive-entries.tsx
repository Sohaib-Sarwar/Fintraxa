import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { type PassiveSource } from '@/data/engines';
import { usePassive } from '@/data/portfolio';
import { SourceIcon, TAX_LABEL, VIEW_LABEL } from '@/features/passive/passiveUi';
import { usePeriod } from '@/features/range/usePeriod';
import { monthLabel, shortDate } from '@/lib/dates';
import { compactNumber, group } from '@/lib/format';
import { EmptyState, Skeleton } from '@/ui/feedback';
import { useHidden } from '@/ui/Figures';
import { StockLogo } from '@/ui/Logos';
import { Plus } from '@/ui/icons';
import { CircleButton, Gap } from '@/ui/primitives';
import { Screen } from '@/ui/Screen';
import { Text } from '@/ui/Text';
import { dark, font, space } from '@/ui/tokens';

const SOURCES: PassiveSource[] = ['mutual_funds', 'dividends', 'savings', 'other'];
const INK = '#F3F4F2';
const INK2 = 'rgba(243,244,242,0.6)';
const num = (v: unknown) => Number(v) || 0;

/** A dark Apple-glass panel (both themes): deep gradient, faint sheen, lit top edge. */
function Glass({ children, style }: { children: ReactNode; style?: object }) {
  return (
    <View style={[styles.glass, style]}>
      <LinearGradient colors={['#0A0A0B', '#000000']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      <LinearGradient colors={['rgba(255,255,255,0.07)', 'rgba(255,255,255,0.015)', 'rgba(255,255,255,0)']} locations={[0, 0.45, 1]} end={{ x: 0.6, y: 0.8 }} style={StyleSheet.absoluteFill} pointerEvents="none" />
      {children}
    </View>
  );
}

/**
 * Every payment behind a passive source (owner, 2026-11-14: tap the Dividends / Savings / Funds card) for the
 * period, newest first, grouped by month, in dark glass: what paid (the stock, the account, the month's fund
 * profit), when, the amount received big, gross and tax small. Dividends (owner, 2026-11-15): + adds one, and each
 * row opens its receipt.
 */
export default function PassiveEntries() {
  const hidden = useHidden();
  const { source: param } = useLocalSearchParams<{ source?: string }>();
  const source: PassiveSource = SOURCES.includes(param as PassiveSource) ? (param as PassiveSource) : 'dividends';
  const period = usePeriod();
  const { analysis: a, events, isLoading } = usePassive(period.upTo, source);
  const rs = (v: number) => (hidden ? '••••' : `Rs ${Math.abs(v) >= 1e7 ? compactNumber(v) : group(v, Math.abs(v) < 1e4 ? 2 : 0)}`);

  const groups = useMemo(() => {
    const rows = (events ?? []).filter((e) => e.date >= period.upTo.start && e.date <= period.upTo.end).sort((x, y) => y.date.localeCompare(x.date));
    const map = new Map<string, typeof rows>();
    for (const e of rows) map.set(e.month, [...(map.get(e.month) ?? []), e]);
    return [...map.entries()];
  }, [events, period.upTo.start, period.upTo.end]);

  const title = source === 'dividends' ? 'Dividend payments' : source === 'savings' ? 'Savings profit' : source === 'mutual_funds' ? 'Fund profit' : 'Passive payments';

  const right = source === 'dividends'
    ? <CircleButton icon={Plus} label="Add a dividend" onPress={() => router.push('/dividend-add')} />
    : undefined;

  return (
    <Screen back title={title} right={right}>
      {isLoading || !a ? (
        <><Skeleton height={110} radius={22} /><Gap h={space.md} /><Skeleton height={260} radius={22} /></>
      ) : (
        <>
          <Glass style={styles.summary}>
            <Text style={styles.small}>{VIEW_LABEL[source]}</Text>
            <Text style={styles.total} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{rs(a.totals.net)}</Text>
            <Text style={styles.small}>{a.totals.count} payment{a.totals.count === 1 ? '' : 's'} · {TAX_LABEL[source]} {rs(a.totals.tax)}</Text>
          </Glass>

          {groups.length ? groups.map(([m, rows]) => (
            <View key={m}>
              <Text variant="label" tone="ink2" style={styles.month}>{monthLabel(m, true)}</Text>
              <Glass>
                {rows.map((e, i) => {
                  const net = num(e.net);
                  const gross = num(e.gross);
                  const tax = num(e.tax);
                  // Dividend events are `div-<row id>` (passive.js); they open the dividend's receipt.
                  const divId = source === 'dividends' && e.id.startsWith('div-') ? e.id.slice(4) : null;
                  return (
                    <Pressable key={e.id} disabled={!divId} onPress={() => divId && router.push({ pathname: '/dividend/[id]', params: { id: divId } })}
                      accessibilityRole={divId ? 'button' : undefined} accessibilityLabel={divId ? `${e.title}, ${shortDate(e.date)}, receipt` : undefined}
                      style={({ pressed }) => [styles.row, i > 0 && styles.rowSep, { opacity: pressed ? 0.75 : 1 }]}>
                      {e.symbol ? <StockLogo symbol={e.symbol} size={36} /> : <SourceIcon source={source} size={36} />}
                      <View style={{ flex: 1, gap: 1 }}>
                        <Text style={styles.name} numberOfLines={1}>{e.title}</Text>
                        <Text style={styles.small} numberOfLines={1}>{shortDate(e.date)}{source === 'dividends' ? '' : ` · ${e.sub}`}</Text>
                      </View>
                      <View style={{ alignItems: 'flex-end', gap: 1 }}>
                        <Text style={[styles.net, { color: net >= 0 ? dark.pos : dark.neg }]}>{rs(net)}</Text>
                        {tax ? <Text style={styles.small}>gross {hidden ? '••' : compactNumber(gross)} · tax {hidden ? '••' : compactNumber(tax)}</Text> : null}
                      </View>
                    </Pressable>
                  );
                })}
              </Glass>
            </View>
          )) : <EmptyState title="No payments" body={`Nothing received in ${period.label}.`} />}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  glass: { borderRadius: 22, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)', borderTopColor: 'rgba(255,255,255,0.20)', paddingHorizontal: space.lg },
  summary: { paddingVertical: space.lg, gap: 2 },
  total: { color: dark.pos, fontFamily: font.numHeavy, fontSize: 30, lineHeight: 36, letterSpacing: -0.6 },
  small: { color: INK2, fontFamily: font.regular, fontSize: 12 },
  month: { marginTop: space.xl, marginBottom: space.sm, marginLeft: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 64, paddingVertical: space.sm },
  rowSep: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(255,255,255,0.08)' },
  name: { color: INK, fontFamily: font.semibold, fontSize: 14.5 },
  net: { fontFamily: font.num, fontSize: 15 },
});
