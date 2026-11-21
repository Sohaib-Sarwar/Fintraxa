import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { type PassiveSource } from '@/data/engines';
import { describeUpcoming, useCheckDividendsNow, useUpcoming } from '@/data/upcoming';
import { usePassive } from '@/data/portfolio';
import { SourceIcon, TAX_LABEL, VIEW_LABEL } from '@/features/passive/passiveUi';
import { usePeriod } from '@/features/range/usePeriod';
import { monthLabel, shortDate } from '@/lib/dates';
import { compactNumber, group } from '@/lib/format';
import { EmptyState, Skeleton } from '@/ui/feedback';
import { useHidden } from '@/ui/Figures';
import { BankLogo, StockLogo } from '@/ui/Logos';
import { ChevronRight, Plus, RefreshCw, X } from '@/ui/icons';
import { CircleButton, Gap } from '@/ui/primitives';
import { toast } from '@/ui/feedback';
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

  // Upcoming dividends (owner, 2026-11-22): announced on PSX for stocks held, not counted until approved.
  const upcoming = useUpcoming();
  const check = useCheckDividendsNow();
  const pending = useMemo(() => (upcoming.data ?? []).filter((u) => !only || u.symbol === only), [upcoming.data, only]);
  const checkNow = () => check.mutate(undefined, {
    onSuccess: (r) => {
      const n = r?.found?.length ?? 0;
      toast(n ? `${n} cash dividend${n === 1 ? '' : 's'} announced on your stocks${r?.sync?.matched ? `; ${r.sync.matched} already on file` : ''}.` : 'No new cash dividends on your stocks.', { title: 'Checked PSX' });
    },
    onError: () => toast('The check did not finish. It also runs every night on its own.', { tone: 'error' }),
  });

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

          {source === 'dividends' ? (
            <View>
              <View style={styles.upHead}>
                <Text variant="label" tone="ink2" style={{ flex: 1 }}>Upcoming{pending.length ? ` · ${pending.length}` : ''}</Text>
                <Pressable onPress={checkNow} disabled={check.isPending} hitSlop={8} accessibilityRole="button" accessibilityLabel="Check PSX for dividends now" style={styles.checkBtn}>
                  <RefreshCw size={13} color={INK} strokeWidth={2.4} />
                  <Text style={styles.checkText}>{check.isPending ? 'Checking PSX…' : 'Check now'}</Text>
                </Pressable>
              </View>
              {pending.length ? (
                <Glass>
                  {pending.map((u, i) => {
                    const d = describeUpcoming(u);
                    const tint = d.stage === 'due' ? dark.warn : d.stage === 'entitled' ? dark.pos : INK2;
                    return (
                      <Pressable key={u.id} onPress={() => router.push({ pathname: '/upcoming-dividend/[id]', params: { id: u.id } })}
                        accessibilityRole="button" accessibilityLabel={`${u.symbol} ${d.title}, about ${rs(d.net)} after tax, ${d.stageLabel}. Open`}
                        style={({ pressed }) => [styles.row, i > 0 && styles.rowSep, { opacity: pressed ? 0.75 : 1 }]}>
                        <StockLogo symbol={u.symbol} size={36} />
                        <View style={{ flex: 1, gap: 1 }}>
                          <Text style={styles.name} numberOfLines={1}>{u.symbol} <Text style={styles.small}>· {d.title}</Text></Text>
                          <Text style={[styles.small, { color: tint }]} numberOfLines={1}>{d.stageLabel} · {d.stage === 'hold' ? `hold to ${shortDate(u.announcement.last_cum_date)}` : `by ${shortDate(u.announcement.expected_pay_by ?? u.announcement.book_closure_from)}`}</Text>
                        </View>
                        <View style={{ alignItems: 'flex-end', gap: 1 }}>
                          <Text style={[styles.net, { color: INK }]}>{rs(d.net)}</Text>
                          <Text style={styles.small}>expected</Text>
                        </View>
                        <ChevronRight size={16} color={INK2} />
                      </Pressable>
                    );
                  })}
                </Glass>
              ) : (
                <Glass style={styles.upEmpty}><Text style={styles.small}>{upcoming.isLoading ? 'Loading…' : 'None announced on your stocks right now. PSX is checked every night.'}</Text></Glass>
              )}
            </View>
          ) : null}

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
  upHead: { flexDirection: 'row', alignItems: 'center', marginTop: space.xl, marginBottom: space.sm, marginLeft: 4 },
  checkBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 28, paddingHorizontal: 12, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.10)' },
  checkText: { color: INK, fontFamily: font.semibold, fontSize: 12 },
  upEmpty: { paddingVertical: space.md },
});
