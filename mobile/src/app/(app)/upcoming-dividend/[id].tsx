import { BlurTargetView } from 'expo-blur';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { BackHandler, KeyboardAvoidingView, Linking, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
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
 * One upcoming dividend (owner, 2026-11-22): what PSX announced, whether you qualify and when it should arrive, the
 * expected gross / tax / net, and — once paid — approve it with the amount and date you actually received.
 * Approving goes through dividends_save on the server, so a dividend already on file is never added twice.
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

  if (!u || !d) {
    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <View style={styles.top}><IconButton icon={X} label="Close" onPress={close} /><Text style={styles.title}>Upcoming dividend</Text><View style={{ width: 48 }} /></View>
        <Text style={[styles.sub, { textAlign: 'center', marginTop: space.xl }]}>{list.isLoading ? 'Loading…' : 'This dividend is no longer waiting for you.'}</Text>
      </View>
    );
  }

  const netVal = net ?? d.net.toFixed(2);
  const dateVal = date ?? d.suggestDate;
  const save = async () => {
    const n = Number(netVal);
    if (!(n > 0)) { setError('Type the amount you received.'); haptic.error(); return; }
    if (n > d.gross) { setError(`That is more than the gross dividend (Rs ${group(d.gross, 2)}).`); haptic.error(); return; }
    setError(null);
    try {
      const r = await approve.mutateAsync({ id: u.id, paymentDate: dateVal, net: n });
      haptic.success();
      toast(r?.added ? `Rs ${group(n, 2)} added to your dividends` : 'It was already on file, so nothing was added twice', { title: `${u.symbol} dividend approved` });
      close();
    } catch (e) { haptic.error(); setError(friendlyError(e)); }
  };
  const dismiss = async () => {
    try { await reject.mutateAsync(u.id); haptic.tick(); toast(`${u.symbol} removed from upcoming dividends`, { tone: 'info' }); close(); }
    catch (e) { setError(friendlyError(e)); }
  };
  const tint = d.stage === 'due' ? dark.warn : d.stage === 'entitled' ? dark.pos : GLASS_INK2;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <BlurTargetView ref={target} style={styles.root}>
        <View style={styles.top}>
          <IconButton icon={X} label="Close" onPress={close} />
          <Text style={styles.title} accessibilityRole="header">Upcoming dividend</Text>
          <View style={{ width: 48 }} />
        </View>
        <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 150 }]} keyboardShouldPersistTaps="handled">
            <BlackGlass style={styles.hero}>
              <View style={styles.heroHead}>
                <StockLogo symbol={u.symbol} size={44} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.sym}>{u.symbol}</Text>
                  <Text style={styles.sub} numberOfLines={1}>{d.title} · {d.perShare}</Text>
                </View>
                <View style={[styles.chip, { borderColor: tint }]}><Text style={[styles.chipText, { color: tint }]}>{d.stageLabel}</Text></View>
              </View>
              <Text style={styles.small}>Expected after tax</Text>
              <Text style={styles.netBig} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>Rs {group(d.net, 2)}</Text>
              <Text style={styles.status}>{d.status}</Text>
              {d.note ? <Text style={[styles.status, { color: dark.warn }]}>{d.note}</Text> : null}
            </BlackGlass>

            <BlackGlass style={styles.group}>
              <Row first label="Shares" value={units(d.shares)} />
              <Row label="Gross" value={`Rs ${group(d.gross, 2)}`} />
              <Row label={d.taxLabel} value={`−Rs ${group(d.tax, 2)}`} />
            </BlackGlass>

            <BlackGlass style={styles.group}>
              {d.dates.map(([k, v], i) => <Row key={k} first={i === 0} label={k} value={v} />)}
            </BlackGlass>

            <Pressable onPress={() => d.sourceUrl && Linking.openURL(d.sourceUrl)} disabled={!d.sourceUrl} accessibilityRole="link" style={styles.source}>
              <Text style={styles.sub}>Source: <Text style={[styles.sub, d.sourceUrl ? { color: GLASS_INK, textDecorationLine: 'underline' } : null]}>{d.source}</Text></Text>
            </Pressable>

            {d.canApprove ? (
              <>
                <Text style={styles.section}>What you received</Text>
                <BlackGlass style={styles.group}>
                  <View style={styles.line}>
                    <View style={{ flex: 1 }}><Text style={styles.label}>Amount received</Text><Text style={styles.sub}>After tax, as it reached your bank</Text></View>
                    <Text style={styles.unit}>Rs</Text>
                    <TextInput value={netVal} onChangeText={(v) => { setNet(clean(v)); setError(null); }} keyboardType="decimal-pad" selectTextOnFocus
                      style={styles.input} accessibilityLabel="Amount received, rupees" />
                  </View>
                  <Pressable style={[styles.line, styles.lineSep]} onPress={() => { haptic.tick(); setDateOpen(true); }} accessibilityRole="button" accessibilityLabel={`Payment date: ${longDate(dateVal)}. Change`}>
                    <Text style={[styles.label, { flex: 1 }]}>Payment date</Text>
                    <CalendarDays size={16} color={GLASS_INK2} />
                    <Text style={styles.value}>{shortDate(dateVal)}</Text>
                    <ChevronRight size={17} color={GLASS_INK2} />
                  </Pressable>
                </BlackGlass>
              </>
            ) : <Text style={[styles.sub, { paddingHorizontal: 4 }]}>You can approve it once the ex-date has passed and the money arrives.</Text>}
            {error ? <Text style={styles.error} accessibilityLiveRegion="polite">{error}</Text> : null}
          </ScrollView>
        </KeyboardAvoidingView>
        <View style={[styles.foot, { paddingBottom: insets.bottom + space.md }]}>
          {d.canApprove ? <Button label="Approve dividend" onPress={save} loading={approve.isPending} disabled={approve.isPending} /> : null}
          <Button label={d.canApprove ? 'Not received' : 'Remove from list'} kind="ghost" onPress={dismiss} loading={reject.isPending} disabled={reject.isPending} />
        </View>
      </BlurTargetView>
      {dateOpen ? <DatePicker title="Payment date" value={dateVal} max={todayIso()} blurTarget={target} onClose={() => setDateOpen(false)} onPick={(v) => { setDate(v); setDateOpen(false); }} /> : null}
    </View>
  );
}

function Row({ label, value, first }: { label: string; value: string; first?: boolean }) {
  return (
    <View style={[styles.line, !first && styles.lineSep]}>
      <Text style={[styles.label, { flex: 1 }]} numberOfLines={2}>{label}</Text>
      <Text style={styles.value} numberOfLines={1}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.sm, height: 56 },
  title: { color: GLASS_INK, fontFamily: font.semibold, fontSize: 17 },
  scroll: { paddingHorizontal: SCREEN_PAD, gap: space.md, paddingTop: space.sm },
  hero: { paddingVertical: space.lg, gap: 4 },
  heroHead: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginBottom: space.md },
  sym: { color: GLASS_INK, fontFamily: font.bold, fontSize: 18 },
  chip: { paddingHorizontal: 10, height: 26, borderRadius: 13, borderWidth: 1, justifyContent: 'center' },
  chipText: { fontFamily: font.semibold, fontSize: 11.5 },
  small: { color: GLASS_INK2, fontFamily: font.regular, fontSize: 12 },
  netBig: { color: dark.pos, fontFamily: font.numHeavy, fontSize: 32, lineHeight: 38, letterSpacing: -0.6 },
  status: { color: GLASS_INK2, fontFamily: font.regular, fontSize: 13, lineHeight: 18, marginTop: 4 },
  group: { paddingVertical: space.xs },
  line: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 52, paddingVertical: space.sm },
  lineSep: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: GLASS_LINE },
  label: { color: GLASS_INK, fontFamily: font.medium, fontSize: 14.5 },
  sub: { color: GLASS_INK2, fontFamily: font.regular, fontSize: 12 },
  value: { color: GLASS_INK, fontFamily: font.num, fontSize: 15, textAlign: 'right', flexShrink: 1 },
  unit: { color: GLASS_INK2, fontFamily: font.medium, fontSize: 15 },
  input: { minWidth: 90, textAlign: 'right', color: GLASS_INK, fontFamily: font.num, fontSize: 18, paddingVertical: 6 },
  section: { color: GLASS_INK2, fontFamily: font.semibold, fontSize: 12, letterSpacing: 0.4, marginTop: space.sm, marginLeft: 4 },
  source: { paddingHorizontal: 4 },
  error: { color: dark.neg, fontFamily: font.medium, fontSize: 13, paddingHorizontal: 4 },
  foot: { position: 'absolute', left: SCREEN_PAD, right: SCREEN_PAD, bottom: 0, gap: 6 },
});
