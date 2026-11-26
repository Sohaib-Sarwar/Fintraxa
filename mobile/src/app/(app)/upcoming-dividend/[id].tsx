import { BlurTargetView } from 'expo-blur';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { BackHandler, KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { friendlyError } from '@/data/mutations';
import { describeUpcoming, useApproveUpcoming, useRejectUpcoming, useUpcoming } from '@/data/upcoming';
import { longDate, shortDate, todayIso } from '@/lib/dates';
import { group, units } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { BlackGlass, GLASS_INK, GLASS_INK2, GLASS_LINE } from '@/ui/BlackGlass';
import { DatePicker } from '@/ui/DatePicker';
import { toast } from '@/ui/feedback';
import { CalendarDays, ChevronRight, X } from '@/ui/icons';
import { StockLogo } from '@/ui/Logos';
import { Button, IconButton } from '@/ui/primitives';
import { Text } from '@/ui/Text';
import { dark, font, SCREEN_PAD, space } from '@/ui/tokens';

const clean = (v: string) => v.replace(/[^0-9.]/g, '').replace(/^(\d*\.?\d{0,2}).*$/, '$1');

/**
 * Approve an upcoming dividend (owner, 2026-11-22: "less scrolly, only what's needed"): the stock and its stage, the
 * expected amount with one gross/tax line, two key dates, then what arrived and when. The server (dividends_save)
 * never adds a dividend that is already on file.
 */
export default function UpcomingDividend() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const list = useUpcoming();
  const approve = useApproveUpcoming();
  const reject = useRejectUpcoming();
  const target = useRef<ComponentRef<typeof View>>(null);
  const u = (list.data ?? []).find((x) => x.id === id) ?? null;
  const d = u ? describeUpcoming(u) : null;
  const [net, setNet] = useState<string | null>(null);
  const [date, setDate] = useState<string | null>(null);
  const [dateOpen, setDateOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { if (dateOpen) { setDateOpen(false); return true; } return false; });
    return () => sub.remove();
  }, [dateOpen]);

  const top = (title: string) => (
    <View style={styles.top}>
      <IconButton icon={X} label="Close" onPress={close} />
      <Text style={styles.title} accessibilityRole="header">{title}</Text>
      <View style={{ width: 48 }} />
    </View>
  );

  if (!u || !d) {
    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        {top('Dividend')}
        <Text style={[styles.sub, { textAlign: 'center', marginTop: space.xl }]}>{list.isLoading ? 'Loading…' : 'No longer waiting.'}</Text>
      </View>
    );
  }

  const a = u.announcement;
  const netVal = net ?? d.net.toFixed(2);
  const dateVal = date ?? d.suggestDate;
  const tint = d.stage === 'due' ? dark.warn : d.stage === 'entitled' ? dark.pos : GLASS_INK2;
  const ratePct = Math.round(Number(u.tax_rate) * 1000) / 10;
  const keyDates: [string, string][] = d.stage === 'hold'
    ? [['Hold till', shortDate(a.last_cum_date)], ['Ex-date', shortDate(a.ex_date)]]
    : [['Ex-date', shortDate(a.ex_date)], ['Pay by', a.expected_pay_by ? shortDate(a.expected_pay_by) : '—']];

  const save = async () => {
    const n = Number(netVal);
    if (!(n > 0)) { setError('Enter the amount received.'); haptic.error(); return; }
    if (n > d.gross) { setError(`Can’t exceed the gross Rs ${group(d.gross, 2)}.`); haptic.error(); return; }
    setError(null);
    try {
      const r = await approve.mutateAsync({ id: u.id, paymentDate: dateVal, net: n });
      haptic.success();
      toast(r?.added ? `Rs ${group(n, 2)} added to your dividends` : 'It was already in your dividends, so it was linked, not added again', { title: `${u.symbol} confirmed` });
      close();
    } catch (e) { haptic.error(); setError(friendlyError(e)); }
  };
  const dismiss = async () => {
    try { await reject.mutateAsync(u.id); haptic.tick(); toast(`${u.symbol} removed`, { tone: 'info' }); close(); }
    catch (e) { setError(friendlyError(e)); }
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <BlurTargetView ref={target} style={styles.root}>
        {top(d.canApprove ? 'Approve dividend' : 'Upcoming dividend')}
        <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 140 }]} keyboardShouldPersistTaps="handled">
            <BlackGlass style={styles.card}>
              <View style={styles.head}>
                <StockLogo symbol={u.symbol} size={42} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.sym}>{u.symbol}</Text>
                  <Text style={styles.sub} numberOfLines={1}>{d.title}</Text>
                </View>
                <View style={[styles.chip, { borderColor: tint }]}><Text style={[styles.chipText, { color: tint }]}>{d.stageLabel}</Text></View>
              </View>
              <View style={styles.rule} />
              <Text style={styles.sub}>Expected</Text>
              <Text style={styles.netBig} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>Rs {group(d.net, 2)}</Text>
              <Text style={styles.sub} numberOfLines={1}>{units(d.shares)} × Rs {Number(u.dps).toFixed(2)} = Rs {group(d.gross, 2)} · tax {ratePct}%</Text>
              <View style={styles.dates}>
                {keyDates.map(([k, v]) => (
                  <View key={k} style={styles.dateCell}>
                    <Text style={styles.sub}>{k}</Text>
                    <Text style={styles.dateVal}>{v}</Text>
                  </View>
                ))}
              </View>
              {d.note ? <Text style={[styles.sub, { color: dark.warn, marginTop: space.sm }]} numberOfLines={2}>Final dividend: subject to the AGM on {shortDate(a.agm_date!)}.</Text> : null}
            </BlackGlass>

            {d.canApprove ? (
              <BlackGlass style={styles.group}>
                <View style={styles.line}>
                  <Text style={[styles.label, { flex: 1 }]}>Received</Text>
                  <Text style={styles.unit}>Rs</Text>
                  <TextInput value={netVal} onChangeText={(v) => { setNet(clean(v)); setError(null); }} keyboardType="decimal-pad" selectTextOnFocus
                    style={styles.input} accessibilityLabel="Amount received, rupees" />
                </View>
                <Pressable style={[styles.line, styles.lineSep]} onPress={() => { haptic.tick(); setDateOpen(true); }} accessibilityRole="button" accessibilityLabel={`Payment date: ${longDate(dateVal)}. Change`}>
                  <Text style={[styles.label, { flex: 1 }]}>Paid on</Text>
                  <CalendarDays size={16} color={GLASS_INK2} />
                  <Text style={styles.value}>{shortDate(dateVal)}</Text>
                  <ChevronRight size={17} color={GLASS_INK2} />
                </Pressable>
              </BlackGlass>
            ) : null}
            {error ? <Text style={styles.error} accessibilityLiveRegion="polite">{error}</Text> : null}
          </ScrollView>
        </KeyboardAvoidingView>
        <View style={[styles.foot, { paddingBottom: insets.bottom + space.md }]}>
          {d.canApprove ? <Button label="Approve" onPress={save} loading={approve.isPending} disabled={approve.isPending} /> : null}
          <Button label={d.canApprove ? 'Not received' : 'Remove'} kind="ghost" onPress={dismiss} loading={reject.isPending} disabled={reject.isPending} />
        </View>
      </BlurTargetView>
      {dateOpen ? <DatePicker title="Paid on" value={dateVal} max={todayIso()} blurTarget={target} onClose={() => setDateOpen(false)} onPick={(v) => { setDate(v); setDateOpen(false); }} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.sm, height: 56 },
  title: { color: GLASS_INK, fontFamily: font.semibold, fontSize: 17 },
  scroll: { paddingHorizontal: SCREEN_PAD, gap: space.md, paddingTop: space.sm },
  card: { paddingVertical: space.lg },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  sym: { color: GLASS_INK, fontFamily: font.bold, fontSize: 17 },
  chip: { paddingHorizontal: 10, height: 26, borderRadius: 13, borderWidth: 1, justifyContent: 'center' },
  chipText: { fontFamily: font.semibold, fontSize: 11.5 },
  rule: { height: StyleSheet.hairlineWidth, backgroundColor: GLASS_LINE, marginVertical: space.md },
  sub: { color: GLASS_INK2, fontFamily: font.regular, fontSize: 12.5 },
  netBig: { color: dark.pos, fontFamily: font.numHeavy, fontSize: 32, lineHeight: 38, letterSpacing: -0.6 },
  dates: { flexDirection: 'row', gap: space.sm, marginTop: space.md },
  dateCell: { flex: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: 'rgba(255,255,255,0.06)' },
  dateVal: { color: GLASS_INK, fontFamily: font.semibold, fontSize: 14.5, marginTop: 2 },
  group: { paddingVertical: space.xs },
  line: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 52 },
  lineSep: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: GLASS_LINE },
  label: { color: GLASS_INK, fontFamily: font.medium, fontSize: 15 },
  value: { color: GLASS_INK, fontFamily: font.num, fontSize: 15 },
  unit: { color: GLASS_INK2, fontFamily: font.medium, fontSize: 15 },
  input: { minWidth: 90, textAlign: 'right', color: GLASS_INK, fontFamily: font.num, fontSize: 18, paddingVertical: 6 },
  error: { color: dark.neg, fontFamily: font.medium, fontSize: 13, paddingHorizontal: 4 },
  foot: { position: 'absolute', left: SCREEN_PAD, right: SCREEN_PAD, bottom: 0, gap: 4 },
});
