import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useFundsAnalysis } from '@/data/portfolio';
import { useRecentUploads, type RecentUpload, type UploadKind } from '@/features/upload/recent';
import { ALL_TIME_START, monthLabel, shortDate, todayIso } from '@/lib/dates';
import { group, units } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { BlackGlass, GLASS_INK, GLASS_INK2, GLASS_LINE } from '@/ui/BlackGlass';
import { EmptyState, Skeleton } from '@/ui/feedback';
import { useHidden } from '@/ui/Figures';
import { GlassToggle } from '@/ui/GlassToggle';
import { CandlestickChart, ChevronDown, ChevronRight, HandCoins, LayoutGrid, LineChart, Plus } from '@/ui/icons';
import { AmcLogo, BrokerLogo, StockLogo } from '@/ui/Logos';
import { CircleButton, Gap } from '@/ui/primitives';
import { Screen } from '@/ui/Screen';
import { Text } from '@/ui/Text';
import { alpha, dark, font, space } from '@/ui/tokens';

type Filter = 'all' | UploadKind;
const NOUN: Record<UploadKind, [string, string]> = { trades: ['trade', 'trades'], dividends: ['dividend', 'dividends'], fund: ['entry', 'entries'] };
const TONE = { pos: dark.pos, warn: dark.warn, neg: dark.neg, muted: GLASS_INK2 } as const;
const ENTRY: Record<string, string> = {
  purchase: 'Purchase', redemption: 'Redemption', switch_in: 'Switch in', switch_out: 'Switch out', dividend_reinvest: 'Dividend reinvested',
  cgt_refund_reinvest: 'CGT refund', capital_refund_units: 'Capital refund', bonus_units: 'Bonus units', transfer_in: 'Transfer in', transfer_out: 'Transfer out',
};
type FundLine = { id: string; key: string; fund: string; amc: string | null; type: string; date: string; units: number; amount: number | null };

function Logo({ u }: { u: RecentUpload }) {
  if (u.kind === 'trades') return <BrokerLogo code={u.code ?? ''} size={40} />;
  if (u.kind === 'fund') return <AmcLogo code={u.code} name={u.title} size={40} />;
  return <View style={styles.cdc}><Text style={styles.cdcText}>CDC</Text></View>;
}

/**
 * Recent uploads (owner, 2026-11-14: the icon on Upload) — trade confirmations, CDC dividend reports and fund
 * statements, from the web or the phone, newest first by month. Trades and dividends open to show what they added.
 */
export default function Uploads() {
  const hidden = useHidden();
  const { items, isLoading, refetch } = useRecentUploads();
  const [filter, setFilter] = useState<Filter>('all');
  const [open, setOpen] = useState<string | null>(null);
  // What each fund statement added: ledger entries by `source_import_id` (reversals left out).
  const all = useMemo(() => ({ start: ALL_TIME_START, end: todayIso() }), []);
  const funds = useFundsAnalysis(all);
  const byImport = useMemo(() => {
    const map = new Map<string, FundLine[]>();
    for (const x of funds.analysis?.allPositions ?? []) {
      for (const e of x.entries) {
        const imp = e.source_import_id as string | null | undefined;
        if (!imp || e.reverses_entry_id) continue;
        const amount = e.gross_amount ?? e.net_amount;
        map.set(imp, [...(map.get(imp) ?? []), {
          id: String(e.id), key: x.key, fund: x.fundName ?? 'Fund', amc: x.amcCode ?? null, type: String(e.entry_type ?? ''), date: String(e.trade_date ?? ''),
          units: Number(e.unit_delta ?? 0), amount: amount === null || amount === undefined ? null : Number(amount),
        }]);
      }
    }
    for (const rows of map.values()) rows.sort((a, b) => b.date.localeCompare(a.date));
    return map;
  }, [funds.analysis]);

  const months = useMemo(() => {
    const map = new Map<string, RecentUpload[]>();
    for (const u of items) if (filter === 'all' || u.kind === filter) map.set(u.at.slice(0, 7), [...(map.get(u.at.slice(0, 7)) ?? []), u]);
    return [...map.entries()];
  }, [items, filter]);

  return (
    <Screen back title="Recent uploads" onRefresh={refetch} right={<CircleButton icon={Plus} label="Upload" onPress={() => router.replace('/upload')} />}>
      <View style={styles.filter}>
        <GlassToggle<Filter> value={filter} onChange={(v) => { setFilter(v); setOpen(null); }} accessibilityLabel="Show"
          options={[{ value: 'all', icon: LayoutGrid, label: 'All' }, { value: 'trades', icon: CandlestickChart, label: 'Trades' },
            { value: 'dividends', icon: HandCoins, label: 'Dividends' }, { value: 'fund', icon: LineChart, label: 'Fund statements' }]} />
      </View>

      {isLoading && !items.length ? (
        <><Skeleton height={64} radius={22} /><Gap h={space.sm} /><Skeleton height={200} radius={22} /></>
      ) : months.length ? months.map(([m, rows]) => (
        <View key={m}>
          <Text variant="label" tone="ink2" style={styles.month}>{monthLabel(m, true)}</Text>
          <BlackGlass style={{ paddingVertical: 0 }}>
            {rows.map((u, i) => {
              const fundLines = u.importId ? byImport.get(u.importId) ?? [] : [];
              const expandable = u.kind !== 'fund' || fundLines.length > 0;
              const isOpen = open === u.id;
              const Chevron = isOpen ? ChevronDown : ChevronRight;
              return (
                <View key={u.id} style={i > 0 ? styles.sep : null}>
                  <Pressable disabled={!expandable} onPress={() => { haptic.tick(); setOpen(isOpen ? null : u.id); }} accessibilityRole="button" accessibilityState={{ expanded: isOpen }}
                    accessibilityLabel={`${u.title}, ${u.count} ${NOUN[u.kind][u.count === 1 ? 0 : 1]}`} style={({ pressed }) => [styles.row, { opacity: pressed ? 0.8 : 1 }]}>
                    <Logo u={u} />
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={styles.title} numberOfLines={1}>{u.title}</Text>
                      <Text style={styles.small} numberOfLines={1}>
                        {u.count} {NOUN[u.kind][u.count === 1 ? 0 : 1]}{u.from ? ` · ${shortDate(u.from)}${u.to && u.to !== u.from ? ` – ${shortDate(u.to)}` : ''}` : ''}
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: 4 }}>
                      <Text style={styles.small}>{shortDate(u.at.slice(0, 10))}</Text>
                      {u.status && !expandable ? (
                        <View style={[styles.chip, { backgroundColor: alpha(u.statusTone === 'muted' ? '#FFFFFF' : TONE[u.statusTone ?? 'muted'], u.statusTone === 'muted' ? 0.08 : 0.14) }]}>
                          <Text style={[styles.chipText, { color: TONE[u.statusTone ?? 'muted'] }]}>{u.status}</Text>
                        </View>
                      ) : (
                        <View style={styles.inlineEnd}>
                          {u.status ? <Text style={[styles.chipText, { color: TONE[u.statusTone ?? 'muted'] }]}>{u.status}</Text> : null}
                          {expandable ? <Chevron size={16} color={GLASS_INK2} /> : null}
                        </View>
                      )}
                    </View>
                  </Pressable>
                  {isOpen ? (
                    <Animated.View entering={FadeIn.duration(200)} style={styles.items}>
                      {u.trades?.map((t) => (
                        <Pressable key={t.id} onPress={() => router.push({ pathname: '/stock-trade/[id]', params: { id: t.id } })} accessibilityRole="button"
                          style={({ pressed }) => [styles.item, { opacity: pressed ? 0.75 : 1 }]}>
                          <StockLogo symbol={t.symbol} size={28} />
                          <Text style={styles.itemTitle} numberOfLines={1}>{t.type === 'buy' ? 'Bought' : 'Sold'} {t.symbol}</Text>
                          <Text style={styles.small}>{units(t.quantity)} @ {hidden ? '••' : group(Number(t.price), 2)}</Text>
                        </Pressable>
                      ))}
                      {fundLines.map((f) => (
                        <Pressable key={f.id} onPress={() => router.push({ pathname: '/fund-entry/[id]', params: { id: f.id, key: f.key } })} accessibilityRole="button"
                          style={({ pressed }) => [styles.item, { opacity: pressed ? 0.75 : 1 }]}>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.itemTitle} numberOfLines={1}>{ENTRY[f.type] ?? f.type.replace(/_/g, ' ')} · {shortDate(f.date)}</Text>
                            <Text style={styles.small} numberOfLines={1}>{f.fund}</Text>
                          </View>
                          <View style={{ alignItems: 'flex-end' }}>
                            <Text style={styles.itemTitle}>{f.amount === null ? '' : hidden ? '••••' : group(Math.abs(f.amount), 0)}</Text>
                            <Text style={styles.small}>{f.units ? `${f.units > 0 ? '+' : '−'}${units(Math.abs(f.units))} u` : ''}</Text>
                          </View>
                        </Pressable>
                      ))}
                      {u.dividends?.map((d) => (
                        <View key={d.id} style={styles.item}>
                          <StockLogo symbol={d.symbol} size={28} />
                          <Text style={styles.itemTitle} numberOfLines={1}>{d.symbol} · {shortDate(d.payment_date)}</Text>
                          <Text style={[styles.small, { color: dark.pos }]}>+{hidden ? '••••' : group(Number(d.net_amount), 2)}</Text>
                        </View>
                      ))}
                    </Animated.View>
                  ) : null}
                </View>
              );
            })}
          </BlackGlass>
        </View>
      )) : <EmptyState title="No uploads yet" body="Trade confirmations, dividend reports and fund statements you upload show here." action="Upload" onAction={() => router.replace('/upload')} />}
    </Screen>
  );
}

const styles = StyleSheet.create({
  filter: { alignItems: 'center', marginBottom: space.xs },
  month: { marginTop: space.lg, marginBottom: space.sm, marginLeft: 4 },
  sep: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: GLASS_LINE },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 66, paddingVertical: space.sm },
  cdc: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.1)' },
  cdcText: { color: GLASS_INK, fontFamily: font.bold, fontSize: 11 },
  title: { color: GLASS_INK, fontFamily: font.semibold, fontSize: 14.5 },
  small: { color: GLASS_INK2, fontFamily: font.regular, fontSize: 12 },
  chip: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8 },
  chipText: { fontFamily: font.semibold, fontSize: 10.5 },
  items: { marginLeft: 52, marginBottom: space.sm, paddingLeft: space.md, borderLeftWidth: 1, borderLeftColor: GLASS_LINE },
  item: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 44 },
  inlineEnd: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  itemTitle: { flex: 1, color: GLASS_INK, fontFamily: font.medium, fontSize: 13 },
});
