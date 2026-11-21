import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { type PassiveSource } from '@/data/engines';
import { useUpcoming } from '@/data/upcoming';
import { usePassive } from '@/data/portfolio';
import { SourceIcon, TAX_LABEL, VIEW_LABEL } from '@/features/passive/passiveUi';
import { usePeriod } from '@/features/range/usePeriod';
import { monthLabel, shortDate } from '@/lib/dates';
import { compactNumber, group } from '@/lib/format';
import { EmptyState, Skeleton } from '@/ui/feedback';
import { useHidden } from '@/ui/Figures';
import { BankLogo, StockLogo } from '@/ui/Logos';
import { CalendarClock, Plus, X } from '@/ui/icons';
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
  const { source: param, symbol: only } = useLocalSearchParams<{ source?: string; symbol?: string }>();
  const source: PassiveSource = SOURCES.includes(param as PassiveSource) ? (param as PassiveSource) : 'dividends';
  const period = usePeriod();
  const { analysis: a, events, isLoading } = usePassive(period.upTo, source);
  const rs = (v: number) => (hidden ? '••••' : `Rs ${Math.abs(v) >= 1e7 ? compactNumber(v) : group(v, Math.abs(v) < 1e4 ? 2 : 0)}`);

  // Opened from a stock's page (owner, 2026-11-15): only that stock's dividends, in the same period.
  const inPeriod = useMemo(() => (events ?? []).filter((e) => e.date >= period.upTo.start && e.date <= period.upTo.end && (!only || e.symbol === only)),
    [events, period.upTo.start, period.upTo.end, only]);
  const shown = useMemo(() => (only ? {
    net: inPeriod.reduce((s, e) => s + num(e.net), 0), tax: inPeriod.reduce((s, e) => s + num(e.tax), 0), count: inPeriod.length,
  } : null), [only, inPeriod]);

  const groups = useMemo(() => {
    const rows = [...inPeriod].sort((x, y) => y.date.localeCompare(x.date));
    const map = new Map<string, typeof rows>();
    for (const e of rows) map.set(e.month, [...(map.get(e.month) ?? []), e]);
    return [...map.entries()];
  }, [inPeriod]);

  const title = source === 'dividends' ? 'Dividend payments' : source === 'savings' ? 'Savings profit' : source === 'mutual_funds' ? 'Fund profit' : 'Passive payments';

  // Upcoming dividends (owner, 2026-11-22): an icon in the summary card opens their own page; a dot when any wait.
  const upcoming = useUpcoming();
  const waiting = (upcoming.data ?? []).length;

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
            {source === 'dividends' && !only ? (
              <Pressable onPress={() => router.push('/upcoming-dividends')} hitSlop={8} style={styles.upBtn}
                accessibilityRole="button" accessibilityLabel={waiting ? `Upcoming dividends, ${waiting} waiting` : 'Upcoming dividends'}>
                <CalendarClock size={18} color={INK} strokeWidth={2.1} />
                {waiting ? <View style={styles.upDot} /> : null}
              </Pressable>
            ) : null}
            {only ? (
              <View style={styles.filterRow}>
                <StockLogo symbol={only} size={20} />
                <Text style={[styles.small, { flex: 1 }]} numberOfLines={1}>{only} · {period.label}</Text>
                <Pressable onPress={() => router.setParams({ symbol: undefined })} hitSlop={10} accessibilityRole="button" accessibilityLabel={`Show every stock, not only ${only}`} style={styles.clear}>
                  <X size={13} color={INK} strokeWidth={2.4} />
                </Pressable>
              </View>
            ) : <Text style={styles.small}>{VIEW_LABEL[source]}</Text>}
            <Text style={styles.total} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{rs(shown?.net ?? a.totals.net)}</Text>
            <Text style={styles.small}>{shown?.count ?? a.totals.count} payment{(shown?.count ?? a.totals.count) === 1 ? '' : 's'} · {TAX_LABEL[source]} {rs(shown?.tax ?? a.totals.tax)}</Text>
          </Glass>

          {groups.length ? groups.map(([m, rows]) => (
            <View key={m}>
              <Text variant="label" tone="ink2" style={styles.month}>{monthLabel(m, true)}</Text>
              <Glass>
                {rows.map((e, i) => {
                  const net = num(e.net);
                  const gross = num(e.gross);
                  const tax = num(e.tax);
                  // Rows open their receipt (owner, 2026-11-15): dividends are `div-<row id>`, savings profit and other
                  // passive income `tx-<transaction id>` (passive.js); monthly fund profit has no single receipt.
                  const divId = e.id.startsWith('div-') ? e.id.slice(4) : null;
                  const txId = e.id.startsWith('tx-') ? e.id.slice(3) : null;
                  const open = divId ? () => router.push({ pathname: '/dividend/[id]', params: { id: divId } })
                    : txId ? () => router.push({ pathname: '/transaction/[id]', params: { id: txId } }) : null;
                  return (
                    <Pressable key={e.id} disabled={!open} onPress={() => open?.()}
                      accessibilityRole={open ? 'button' : undefined} accessibilityLabel={open ? `${e.title}, ${shortDate(e.date)}, receipt` : undefined}
                      style={({ pressed }) => [styles.row, i > 0 && styles.rowSep, { opacity: pressed ? 0.75 : 1 }]}>
                      {source === 'savings' && e.symbol ? <BankLogo symbol={e.symbol} size={36} /> : e.symbol ? <StockLogo symbol={e.symbol} size={36} /> : <SourceIcon source={source} size={36} />}
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
  filterRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  clear: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.12)' },
  total: { color: dark.pos, fontFamily: font.numHeavy, fontSize: 30, lineHeight: 36, letterSpacing: -0.6 },
  small: { color: INK2, fontFamily: font.regular, fontSize: 12 },
  month: { marginTop: space.xl, marginBottom: space.sm, marginLeft: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 64, paddingVertical: space.sm },
  rowSep: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(255,255,255,0.08)' },
  name: { color: INK, fontFamily: font.semibold, fontSize: 14.5 },
  net: { fontFamily: font.num, fontSize: 15 },
  upBtn: { position: 'absolute', top: space.md, right: space.md, zIndex: 1, width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.10)', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.18)' },
  upDot: { position: 'absolute', top: 7, right: 8, width: 8, height: 8, borderRadius: 4, backgroundColor: dark.pos, borderWidth: 1.5, borderColor: '#000' },
});
