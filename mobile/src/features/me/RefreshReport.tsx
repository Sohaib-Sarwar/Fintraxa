/**
 * The result of "Refresh my prices" (owner, 2026-11-22: "tell me formally what is updated and what is not", then
 * "make it look like the app"): black-glass, inset-grouped like the holdings — a count with a split bar, stock/fund
 * pills, then what needs attention (with the reason) and what was updated (logo, source and day, price).
 * Wording comes from the shared @core/market/refreshSummary.js.
 */
import { StyleSheet, View } from 'react-native';
import { updatedSub, type RefreshSummary } from '@/data/engines';
import { GLASS_INK, GLASS_INK2, GLASS_LINE } from '@/ui/BlackGlass';
import { AmcLogo, StockLogo } from '@/ui/Logos';
import { Text } from '@/ui/Text';
import { dark, font, space } from '@/ui/tokens';

type Item = RefreshSummary['updated'][number] | RefreshSummary['notUpdated'][number];

function Logo({ it }: { it: Item }) {
  return it.kind === 'stock' ? <StockLogo symbol={it.symbol ?? it.name} size={34} /> : <AmcLogo code={it.code ?? null} name={it.amc ?? it.name} size={34} />;
}

export function RefreshReport({ summary }: { summary: RefreshSummary }) {
  const { counts } = summary;
  const tint = summary.tone === 'ok' ? dark.pos : summary.tone === 'failed' ? dark.neg : dark.warn;
  const okShare = counts.total ? counts.ok / counts.total : 1;
  const verdict = counts.total === 0 ? 'Nothing to refresh'
    : summary.tone === 'ok' ? 'Everything is up to date'
      : summary.tone === 'failed' ? 'No prices could be updated' : `${summary.notUpdated.length} not updated`;

  return (
    <View accessibilityLiveRegion="polite">
      <View style={styles.hero} accessible accessibilityLabel={`${verdict}. ${counts.ok} of ${counts.total} prices refreshed. ${summary.sub}`}>
        <View style={styles.verdictRow}>
          <View style={[styles.dot, { backgroundColor: tint, shadowColor: tint }]} />
          <Text style={[styles.verdict, { color: tint }]} numberOfLines={1}>{verdict}</Text>
        </View>
        <View style={styles.countRow}>
          <Text style={styles.count}>{counts.ok}</Text>
          <Text style={styles.countOf}> / {counts.total}</Text>
          <Text style={styles.countLabel}>  prices refreshed</Text>
        </View>
        <View style={styles.bar}>
          <View style={[styles.barOk, { flex: okShare }]} />
          {okShare < 1 ? <View style={[styles.barMiss, { flex: 1 - okShare }]} /> : null}
        </View>
        <View style={styles.pills}>
          {counts.stocks.total ? <Pill label="Stocks" ok={counts.stocks.ok} total={counts.stocks.total} /> : null}
          {counts.funds.total ? <Pill label="Funds" ok={counts.funds.ok} total={counts.funds.total} /> : null}
          <Text style={styles.when} numberOfLines={1}>{summary.sub}</Text>
        </View>
      </View>

      {summary.notUpdated.length ? (
        <Group title="Needs attention" tone={dark.warn}>
          {summary.notUpdated.map((m, i) => (
            <View key={`${m.kind}-${m.name}`} style={[styles.row, i > 0 && styles.rowLine]}>
              <Logo it={m} />
              <View style={styles.rowMid}>
                <Text style={styles.name} numberOfLines={1}>{m.name}</Text>
                <Text style={styles.sub} numberOfLines={3}>{m.reason}</Text>
              </View>
              <View style={styles.chip}><Text style={styles.chipText}>Kept last</Text></View>
            </View>
          ))}
        </Group>
      ) : null}

      {summary.updated.length ? (
        <Group title="Updated" tone={GLASS_INK2}>
          {summary.updated.map((u, i) => (
            <View key={`${u.kind}-${u.name}`} style={[styles.row, i > 0 && styles.rowLine]}>
              <Logo it={u} />
              <View style={styles.rowMid}>
                <Text style={styles.name} numberOfLines={1}>{u.name}</Text>
                <Text style={styles.sub} numberOfLines={1}>{updatedSub(u)}</Text>
              </View>
              <Text style={styles.price} numberOfLines={1}>{u.price.toFixed(u.dp)}</Text>
            </View>
          ))}
        </Group>
      ) : null}
    </View>
  );
}

function Pill({ label, ok, total }: { label: string; ok: number; total: number }) {
  const full = ok === total;
  return (
    <View style={[styles.pill, !full && { borderColor: 'rgba(245,184,74,0.35)' }]}>
      <Text style={styles.pillLabel}>{label}</Text>
      <Text style={[styles.pillValue, { color: full ? GLASS_INK : dark.warn }]}>{ok}/{total}</Text>
    </View>
  );
}

function Group({ title, tone, children }: { title: string; tone: string; children: React.ReactNode }) {
  return (
    <View style={styles.groupWrap}>
      <Text style={[styles.groupTitle, { color: tone }]}>{title}</Text>
      <View style={styles.group}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { paddingBottom: space.md },
  verdictRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4, shadowOpacity: 0.9, shadowRadius: 6, shadowOffset: { width: 0, height: 0 } },
  verdict: { fontFamily: font.semibold, fontSize: 13, letterSpacing: 0.1 },
  countRow: { flexDirection: 'row', alignItems: 'baseline', marginTop: 10 },
  count: { color: GLASS_INK, fontFamily: font.numBold, fontSize: 40, letterSpacing: -1.2, fontVariant: ['tabular-nums'] },
  countOf: { color: GLASS_INK2, fontFamily: font.num, fontSize: 20, letterSpacing: -0.4, fontVariant: ['tabular-nums'] },
  countLabel: { color: GLASS_INK2, fontFamily: font.medium, fontSize: 13 },
  bar: { flexDirection: 'row', height: 4, borderRadius: 2, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.08)', marginTop: 12, gap: 2 },
  barOk: { backgroundColor: dark.pos, borderRadius: 2 },
  barMiss: { backgroundColor: dark.warn, borderRadius: 2 },
  pills: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14, flexWrap: 'wrap' },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, height: 26, borderRadius: 13, borderWidth: 1, borderColor: GLASS_LINE, backgroundColor: 'rgba(255,255,255,0.05)' },
  pillLabel: { color: GLASS_INK2, fontFamily: font.medium, fontSize: 12 },
  pillValue: { fontFamily: font.num, fontSize: 12.5, fontVariant: ['tabular-nums'] },
  when: { color: GLASS_INK2, fontFamily: font.regular, fontSize: 11.5, marginLeft: 'auto' },
  groupWrap: { marginTop: space.lg },
  groupTitle: { fontFamily: font.semibold, fontSize: 12, letterSpacing: 0.4, marginBottom: 8, marginLeft: 4 },
  group: { borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.045)', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.10)', paddingHorizontal: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11 },
  rowLine: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: GLASS_LINE },
  rowMid: { flex: 1, minWidth: 0 },
  name: { color: GLASS_INK, fontFamily: font.semibold, fontSize: 14.5 },
  sub: { color: GLASS_INK2, fontFamily: font.regular, fontSize: 12, marginTop: 2, lineHeight: 16 },
  price: { color: GLASS_INK, fontFamily: font.num, fontSize: 15, letterSpacing: -0.2, fontVariant: ['tabular-nums'] },
  chip: { paddingHorizontal: 8, height: 22, borderRadius: 11, justifyContent: 'center', backgroundColor: 'rgba(245,184,74,0.13)' },
  chipText: { color: dark.warn, fontFamily: font.semibold, fontSize: 11 },
});
