import { BlurTargetView } from 'expo-blur';
import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState, type ComponentRef, type ReactNode } from 'react';
import { BackHandler, KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import Animated, { Easing, FadeIn, FadeInDown, useAnimatedProps, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { useStocksAnalysis } from '@/data/portfolio';
import { friendlyError } from '@/data/mutations';
import { useDividends, useProfile, useUid } from '@/data/queries';
import { checkDividend, dividendAmounts, DIVIDEND_TYPES, sharesHeldOn, useAddDividend, WHT_FILER, WHT_NON_FILER, type DividendType } from '@/features/dividends/addDividend';
import { ALL_TIME_START, longDate, shortDate, todayIso } from '@/lib/dates';
import { group, units } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { BlackGlass, GLASS_INK, GLASS_INK2, GLASS_LINE } from '@/ui/BlackGlass';
import { DatePicker } from '@/ui/DatePicker';
import { GlassSheet } from '@/ui/GlassSheet';
import { AlertTriangle, CalendarDays, ChevronRight, Search, X } from '@/ui/icons';
import { StockLogo } from '@/ui/Logos';
import { Button, IconButton } from '@/ui/primitives';
import { Text } from '@/ui/Text';
import { dark, font, SCREEN_PAD, space } from '@/ui/tokens';

const EASE = Easing.bezier(0.2, 0, 0, 1);
const CHECK = 'M30 53 L45 68 L75 38';
const CHECK_LEN = 64;
const AnimatedPath = Animated.createAnimatedComponent(Path);
const clean = (v: string, decimals: number) => {
  const s = v.replace(/[^0-9.]/g, '');
  const [a, ...b] = s.split('.');
  return b.length ? `${a}.${b.join('').slice(0, decimals)}` : a;
};

/** One line of a grouped glass list: label on the left, the control on the right. */
function Line({ label, sub, children, onPress, a11y, first }: { label: string; sub?: string; children: ReactNode; onPress?: () => void; a11y?: string; first?: boolean }) {
  const body = (
    <View style={[styles.line, !first && styles.lineSep]}>
      <View style={{ flex: 1, gap: 1 }}>
        <Text style={styles.label}>{label}</Text>
        {sub ? <Text style={styles.sub} numberOfLines={1}>{sub}</Text> : null}
      </View>
      {children}
    </View>
  );
  return onPress ? <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={a11y} style={({ pressed }) => ({ opacity: pressed ? 0.75 : 1 })}>{body}</Pressable> : body;
}

/**
 * Add a dividend (owner, 2026-11-15): a formal, simple Apple-style form in black glass. Choose the stock from a sheet
 * of your stocks (logos, shares held), the type (interim / final / special) and the payment date (the wheel picker);
 * the shares held that day fill in from your trades; type the dividend per share and gross, withholding tax (15% for
 * filers — 30% non-filer — editable) and net are worked out live. Add → a success screen with the receipt.
 */
export default function DividendAdd() {
  const insets = useSafeAreaInsets();
  const uid = useUid();
  const today = todayIso();
  const allTime = useMemo(() => ({ start: ALL_TIME_START, end: today }), [today]);
  const stocks = useStocksAnalysis(allTime);
  const divs = useDividends();
  const profile = useProfile();
  const add = useAddDividend();
  const target = useRef<ComponentRef<typeof View>>(null);
  const dpsRef = useRef<ComponentRef<typeof TextInput>>(null);

  const [symbol, setSymbol] = useState<string | null>(null);
  const [type, setType] = useState<DividendType>('interim');
  const [date, setDate] = useState(today);
  const [shares, setShares] = useState<string | null>(null); // null = the shares held that day, from the trades
  const [dps, setDps] = useState('');
  const [rate, setRate] = useState<string | null>(null); // null = from the profile's filer status
  const [taxRs, setTaxRs] = useState<string | null>(null); // null = worked out from the rate; typed rupees win
  const [picking, setPicking] = useState(false);
  const [dateOpen, setDateOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ id: string; gross: string; tax: string; net: string } | null>(null);

  const positions = useMemo(() => stocks.analysis?.allPositions ?? [], [stocks.analysis]);
  const pos = positions.find((x) => x.symbol === symbol) ?? null;
  const held = symbol ? sharesHeldOn(stocks.trades, symbol, date) : 0;
  const sharesVal = shares ?? (held ? String(held) : '');
  const rateVal = rate ?? String(profile.data?.filer_status === 'non_filer' ? WHT_NON_FILER : WHT_FILER);
  const amounts = dividendAmounts(sharesVal, dps, rateVal, taxRs);
  const dup = symbol ? (divs.data ?? []).find((x) => x.symbol === symbol && x.payment_date === date) : undefined;
  const draft = { symbol: symbol ?? '', companyName: pos?.companyName ?? null, paymentDate: date, type, shares: sharesVal, dps, ratePct: rateVal, taxRs };
  const ready = checkDividend(draft, today) === null;

  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (dateOpen) { setDateOpen(false); return true; }
      if (picking) { setPicking(false); return true; }
      return false;
    });
    return () => sub.remove();
  }, [dateOpen, picking]);

  const list = useMemo(() => {
    const q = query.trim().toUpperCase();
    const match = positions.filter((x) => !q || x.symbol.includes(q) || x.companyName.toUpperCase().includes(q));
    return {
      now: match.filter((x) => x.isOpen).sort((a, b) => (b.value ?? 0) - (a.value ?? 0)),
      earlier: match.filter((x) => !x.isOpen).sort((a, b) => a.symbol.localeCompare(b.symbol)),
    };
  }, [positions, query]);

  const choose = (s: string) => {
    haptic.tick();
    setSymbol(s); setShares(null); setPicking(false); setQuery(''); setError(null);
    setTimeout(() => dpsRef.current?.focus(), 350);
  };

  const save = async () => {
    const why = checkDividend(draft, today);
    if (why) { haptic.error(); setError(why); return; }
    if (!uid) return;
    setError(null);
    try {
      const r = await add.mutateAsync({ uid, d: draft });
      haptic.success();
      setDone(r);
    } catch (e) {
      haptic.error();
      setError(friendlyError(e));
    }
  };

  if (done) {
    return <DividendDone symbol={draft.symbol} company={draft.companyName} net={done.net} gross={done.gross} tax={done.tax} rate={amounts.rate}
      shares={sharesVal} dps={dps} date={date} type={type}
      onDone={close} onReceipt={() => router.replace({ pathname: '/dividend/[id]', params: { id: done.id } })} />;
  }

  const stockRow = (x: (typeof positions)[number]) => (
    <Pressable key={x.symbol} onPress={() => choose(x.symbol)} accessibilityRole="button" accessibilityLabel={`${x.symbol}, ${x.companyName}`}
      style={({ pressed }) => [styles.pickRow, { opacity: pressed ? 0.7 : 1 }]}>
      <StockLogo symbol={x.symbol} size={38} />
      <View style={{ flex: 1, gap: 1 }}>
        <Text style={styles.pickSym}>{x.symbol}</Text>
        <Text style={styles.sub} numberOfLines={1}>{x.companyName}</Text>
      </View>
      <Text style={styles.sub}>{x.isOpen ? `${units(x.shares)} shares` : 'Sold'}</Text>
    </Pressable>
  );

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <BlurTargetView ref={target} style={styles.root}>
        <View style={styles.top}>
          <IconButton icon={X} label="Close" onPress={close} />
          <Text style={styles.title} accessibilityRole="header">Add dividend</Text>
          <View style={{ width: 48 }} />
        </View>
        <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 110 }]} keyboardShouldPersistTaps="handled">
            <BlackGlass style={styles.group}>
              <Line first label="Stock" onPress={() => { haptic.tick(); setPicking(true); }} a11y={symbol ? `Stock: ${symbol}. Change` : 'Choose the stock'}>
                <View style={styles.right}>
                  {symbol ? <StockLogo symbol={symbol} size={30} /> : null}
                  <Text style={[styles.value, !symbol && { color: GLASS_INK2 }]} numberOfLines={1}>{symbol ?? 'Choose'}</Text>
                  <ChevronRight size={17} color={GLASS_INK2} />
                </View>
              </Line>
              <View style={[styles.line, styles.lineSep]}>
                <Text style={[styles.label, { flex: 1 }]}>Type</Text>
                <View style={styles.seg} accessibilityRole="radiogroup">
                  {DIVIDEND_TYPES.map((t) => (
                    <Pressable key={t.value} onPress={() => { haptic.tick(); setType(t.value); }} accessibilityRole="radio" accessibilityState={{ selected: type === t.value }}
                      style={[styles.segItem, type === t.value && styles.segOn]}>
                      <Text style={[styles.segText, type === t.value && { color: '#000' }]}>{t.label}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
              <Line label="Payment date" onPress={() => { haptic.tick(); setDateOpen(true); }} a11y={`Payment date: ${longDate(date)}. Change`}>
                <View style={styles.right}>
                  <CalendarDays size={16} color={GLASS_INK2} />
                  <Text style={styles.value}>{longDate(date)}</Text>
                </View>
              </Line>
            </BlackGlass>

            <BlackGlass style={styles.group}>
              <Line first label="Shares" sub={symbol ? (shares === null ? `Held on ${shortDate(date)}, from your trades` : 'Typed by you') : 'Choose a stock first'}>
                <TextInput value={sharesVal} onChangeText={(v) => { setShares(clean(v, 4)); setTaxRs(null); }} keyboardType="decimal-pad" placeholder="0"
                  placeholderTextColor={GLASS_INK2} style={styles.input} accessibilityLabel="Shares" selectTextOnFocus />
              </Line>
              <Line label="Dividend per share" sub="Rupees per share">
                <View style={styles.right}>
                  <Text style={styles.unit}>Rs</Text>
                  <TextInput ref={dpsRef} value={dps} onChangeText={(v) => { setDps(clean(v, 4)); setTaxRs(null); }} keyboardType="decimal-pad" placeholder="0.00"
                    placeholderTextColor={GLASS_INK2} style={styles.input} accessibilityLabel="Dividend per share" />
                </View>
              </Line>
              {/* Withholding tax (owner, 2026-11-15: editable): pick 15% / 30% or type any rate — or type the tax itself. */}
              <Line label="Tax rate" sub={taxRs !== null ? 'From the tax you typed' : Number(rateVal) === WHT_FILER ? 'Filer rate' : Number(rateVal) === WHT_NON_FILER ? 'Non-filer rate' : 'Your rate'}>
                <View style={styles.right}>
                  {[WHT_FILER, WHT_NON_FILER].map((r) => {
                    const on = taxRs === null && Number(rateVal) === r;
                    return (
                      <Pressable key={r} onPress={() => { haptic.tick(); setRate(String(r)); setTaxRs(null); }} hitSlop={6} accessibilityRole="button" accessibilityLabel={`${r}%`}
                        accessibilityState={{ selected: on }} style={[styles.rateChip, on && styles.segOn]}>
                        <Text style={[styles.segText, on && { color: '#000' }]}>{r}%</Text>
                      </Pressable>
                    );
                  })}
                  <View style={styles.box}>
                    <TextInput value={taxRs !== null ? amounts.rate : rateVal} onChangeText={(v) => { setRate(clean(v, 2)); setTaxRs(null); }} keyboardType="decimal-pad"
                      style={styles.boxInput} accessibilityLabel="Tax rate, percent" selectTextOnFocus />
                    <Text style={styles.unit}>%</Text>
                  </View>
                </View>
              </Line>
              <Line label="Tax withheld" sub={taxRs !== null ? 'Typed by you' : 'Worked out from the rate · tap to change'}>
                <View style={styles.box}>
                  <Text style={styles.unit}>Rs</Text>
                  <TextInput value={taxRs ?? amounts.tax} onChangeText={(v) => setTaxRs(clean(v, 2))} keyboardType="decimal-pad"
                    style={[styles.boxInput, { minWidth: 84 }]} accessibilityLabel="Tax withheld, rupees" selectTextOnFocus />
                </View>
              </Line>
            </BlackGlass>

            <BlackGlass style={styles.group}>
              <View style={styles.sumRow}><Text style={styles.label}>Gross dividend</Text><Text style={styles.sumVal}>Rs {group(amounts.gross, 2)}</Text></View>
              <View style={styles.sumRow}><Text style={styles.label}>Tax withheld ({amounts.rate}%)</Text><Text style={styles.sumVal}>−Rs {group(amounts.tax, 2)}</Text></View>
              <View style={[styles.sumRow, styles.lineSep, { paddingTop: space.md }]}>
                <Text style={[styles.label, { fontFamily: font.semibold }]}>You receive</Text>
                <Text style={styles.net} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>Rs {group(amounts.net, 2)}</Text>
              </View>
            </BlackGlass>

            {dup ? (
              <Animated.View entering={FadeIn.duration(200)} style={styles.warn}>
                <AlertTriangle size={16} color={dark.warn} />
                <Text style={styles.warnText}>A {symbol} dividend of Rs {group(dup.net_amount, 2)} is already recorded on {shortDate(date)}.</Text>
              </Animated.View>
            ) : null}
            {error ? <Text style={styles.error} accessibilityLiveRegion="polite">{error}</Text> : null}
          </ScrollView>
        </KeyboardAvoidingView>
        <View style={[styles.foot, { paddingBottom: insets.bottom + space.md }]}>
          <Button label="Add dividend" onPress={save} loading={add.isPending} disabled={!ready || add.isPending} />
        </View>
      </BlurTargetView>

      {picking ? (
        <GlassSheet blurTarget={target} smoky title="Choose a stock" onClose={() => setPicking(false)} maxHeight={0.82}>
          <View style={styles.search}>
            <Search size={16} color={GLASS_INK2} />
            <TextInput value={query} onChangeText={setQuery} placeholder="Search your stocks" placeholderTextColor={GLASS_INK2} style={styles.searchInput}
              autoCapitalize="characters" autoCorrect={false} accessibilityLabel="Search your stocks" />
          </View>
          <ScrollView style={{ maxHeight: 460 }} keyboardShouldPersistTaps="handled">
            {list.now.length ? <Text style={styles.pickHead}>You hold</Text> : null}
            {list.now.map(stockRow)}
            {list.earlier.length ? <Text style={styles.pickHead}>Held before</Text> : null}
            {list.earlier.map(stockRow)}
            {!list.now.length && !list.earlier.length
              ? <Text style={[styles.sub, { textAlign: 'center', paddingVertical: space.xl }]}>{positions.length ? 'No stock matches.' : 'No trades yet — add your share trades first.'}</Text>
              : null}
          </ScrollView>
        </GlassSheet>
      ) : null}
      {dateOpen ? <DatePicker title="Payment date" value={date} blurTarget={target} onClose={() => setDateOpen(false)} onPick={(d) => { setDate(d); setShares(null); setDateOpen(false); }} /> : null}
    </View>
  );
}

/** Saved: the accent disc and check draw in, then the receipt's essentials rise in; Done or the full receipt. */
function DividendDone({ symbol, company, net, gross, tax, rate, shares, dps, date, type, onDone, onReceipt }: {
  symbol: string; company: string | null; net: string; gross: string; tax: string; rate: string; shares: string; dps: string; date: string; type: DividendType;
  onDone: () => void; onReceipt: () => void;
}) {
  const insets = useSafeAreaInsets();
  const reduce = useReducedMotion();
  const disc = useSharedValue(reduce ? 1 : 0);
  const draw = useSharedValue(reduce ? 1 : 0);
  useEffect(() => {
    if (reduce) return;
    disc.set(withTiming(1, { duration: 360, easing: EASE }));
    draw.set(withDelay(220, withTiming(1, { duration: 380, easing: EASE })));
  }, [reduce, disc, draw]);
  const discStyle = useAnimatedStyle(() => ({ opacity: disc.get(), transform: [{ scale: 0.7 + 0.3 * disc.get() }] }));
  const checkProps = useAnimatedProps(() => ({ strokeDashoffset: CHECK_LEN * (1 - draw.get()) }));
  const rows: [string, string][] = [
    ['Payment date', longDate(date)],
    ['Type', DIVIDEND_TYPES.find((t) => t.value === type)?.label ?? 'Dividend'],
    ['Shares × per share', `${units(Number(shares))} × Rs ${dps}`],
    ['Gross', `Rs ${group(gross, 2)}`],
    [`Tax withheld (${rate}%)`, `−Rs ${group(tax, 2)}`],
  ];
  return (
    <View style={[styles.root, styles.doneRoot, { paddingTop: insets.top + space.xxxl, paddingBottom: insets.bottom + space.lg }]} accessibilityViewIsModal accessibilityLiveRegion="polite">
      <View style={{ alignItems: 'center' }}>
        <Animated.View style={[styles.disc, discStyle]}>
          <Svg width={96} height={96} viewBox="0 0 104 104">
            <AnimatedPath d={CHECK} stroke="#000" strokeWidth={8} strokeLinecap="round" strokeLinejoin="round" fill="none" strokeDasharray={`${CHECK_LEN} ${CHECK_LEN}`} animatedProps={checkProps} />
          </Svg>
        </Animated.View>
        <Animated.View entering={FadeInDown.delay(260).duration(320).easing(EASE)} style={{ alignItems: 'center', marginTop: space.lg, gap: 4 }}>
          <Text style={styles.doneTitle} accessibilityRole="header">Dividend added</Text>
          <Text style={styles.doneAmount} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>+Rs {group(net, 2)}</Text>
        </Animated.View>
      </View>
      <Animated.View entering={FadeInDown.delay(380).duration(340).easing(EASE)}>
        <BlackGlass style={styles.group}>
          <View style={[styles.line, { gap: space.md }]}>
            <StockLogo symbol={symbol} size={40} />
            <View style={{ flex: 1 }}>
              <Text style={styles.pickSym}>{symbol}</Text>
              {company ? <Text style={styles.sub} numberOfLines={1}>{company}</Text> : null}
            </View>
          </View>
          {rows.map(([k, v]) => (
            <View key={k} style={[styles.sumRow, styles.lineSep, { paddingTop: space.sm }]}><Text style={styles.label}>{k}</Text><Text style={styles.sumVal}>{v}</Text></View>
          ))}
        </BlackGlass>
      </Animated.View>
      <View style={{ gap: space.sm }}>
        <Button label="Done" onPress={onDone} />
        <Button label="View receipt" kind="secondary" onPress={onReceipt} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.sm, height: 56 },
  title: { color: GLASS_INK, fontFamily: font.semibold, fontSize: 17 },
  scroll: { paddingHorizontal: SCREEN_PAD, gap: space.md, paddingTop: space.sm },
  group: { paddingVertical: space.xs },
  line: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 56, paddingVertical: space.sm },
  lineSep: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: GLASS_LINE },
  label: { color: GLASS_INK, fontFamily: font.medium, fontSize: 15 },
  sub: { color: GLASS_INK2, fontFamily: font.regular, fontSize: 12 },
  right: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
  value: { color: GLASS_INK, fontFamily: font.semibold, fontSize: 15, flexShrink: 1 },
  unit: { color: GLASS_INK2, fontFamily: font.medium, fontSize: 15 },
  input: { minWidth: 70, textAlign: 'right', color: GLASS_INK, fontFamily: font.num, fontSize: 17, paddingVertical: 6 },
  seg: { flexDirection: 'row', padding: 3, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.08)' },
  segItem: { paddingHorizontal: 11, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  segOn: { backgroundColor: '#F3F4F2' },
  segText: { color: GLASS_INK, fontFamily: font.semibold, fontSize: 12.5 },
  box: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 36, paddingHorizontal: 10, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.08)' },
  boxInput: { minWidth: 40, textAlign: 'right', color: GLASS_INK, fontFamily: font.num, fontSize: 16, paddingVertical: 0 },
  rateChip: { paddingHorizontal: 10, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.08)' },
  sumRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md, paddingVertical: 6 },
  sumVal: { color: GLASS_INK, fontFamily: font.num, fontSize: 15 },
  net: { color: dark.pos, fontFamily: font.numHeavy, fontSize: 24, lineHeight: 30, flexShrink: 1 },
  warn: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', paddingHorizontal: 4 },
  warnText: { flex: 1, color: GLASS_INK2, fontFamily: font.regular, fontSize: 12.5, lineHeight: 17 },
  error: { color: dark.neg, fontFamily: font.medium, fontSize: 13, paddingHorizontal: 4 },
  foot: { position: 'absolute', left: SCREEN_PAD, right: SCREEN_PAD, bottom: 0 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 42, borderRadius: 12, paddingHorizontal: 12, backgroundColor: 'rgba(255,255,255,0.08)', marginBottom: space.sm },
  searchInput: { flex: 1, color: GLASS_INK, fontFamily: font.regular, fontSize: 15, paddingVertical: 0 },
  pickHead: { color: GLASS_INK2, fontFamily: font.semibold, fontSize: 12, letterSpacing: 0.4, marginTop: space.md, marginBottom: 4 },
  pickRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: 10 },
  pickSym: { color: GLASS_INK, fontFamily: font.bold, fontSize: 15.5 },
  doneRoot: { justifyContent: 'space-between', paddingHorizontal: SCREEN_PAD },
  disc: { width: 104, height: 104, borderRadius: 52, backgroundColor: dark.pos, alignItems: 'center', justifyContent: 'center' },
  doneTitle: { color: GLASS_INK, fontFamily: font.bold, fontSize: 22 },
  doneAmount: { color: dark.pos, fontFamily: font.numHeavy, fontSize: 34, lineHeight: 41 },
});
