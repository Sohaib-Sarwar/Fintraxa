/**
 * The result of "Refresh my prices" (owner, 2026-11-22: formal, "less text, to the point", no bar or timestamp):
 * a verdict and count, stock/fund pills, then anything not updated (short reason) and what was (logo, day, source,
 * price). Built from the shared @core/market/refreshSummary.js.
 */
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import type { RefreshSummary } from '@/data/engines';
import { shortDate } from '@/lib/dates';
import { GLASS_INK, GLASS_INK2, GLASS_LINE } from '@/ui/BlackGlass';
import { AmcLogo, StockLogo } from '@/ui/Logos';
import { Text } from '@/ui/Text';
import { dark, font, space } from '@/ui/tokens';

type Item = RefreshSummary['updated'][number] | RefreshSummary['notUpdated'][number];

function Logo({ it }: { it: Item }) {
  return it.kind === 'stock' ? <StockLogo symbol={it.symbol ?? it.name} size={32} /> : <AmcLogo code={it.code ?? null} name={it.amc ?? it.name} size={32} />;
}

export function RefreshReport({ summary }: { summary: RefreshSummary }) {
  const { counts } = summary;
  const tint = summary.tone === 'ok' ? dark.pos : summary.tone === 'failed' ? dark.neg : dark.warn;
  const verdict = counts.total === 0 ? 'Nothing to refresh' : summary.tone === 'ok' ? 'All prices updated' : summary.tone === 'failed' ? 'Not updated' : 'Partly updated';

  return (
    <View accessibilityLiveRegion="polite">
      <View style={styles.hero} accessible accessibilityLabel={`${verdict}. ${counts.ok} of ${counts.total}.`}>
        <View style={styles.verdictRow}>
          <View style={[styles.dot, { backgroundColor: tint }]} />
          <Text style={[styles.verdict, { color: tint }]}>{verdict}</Text>
        </View>
        <View style={styles.countRow}>
          <Text style={styles.count}>{counts.ok}</Text>
          <Text style={styles.countOf}>/{counts.total}</Text>
          <View style={styles.pills}>
            {counts.stocks.total ? <Pill label="Stocks" ok={counts.stocks.ok} total={counts.stocks.total} /> : null}
            {counts.funds.total ? <Pill label="Funds" ok={counts.funds.ok} total={counts.funds.total} /> : null}
          </View>
        </View>
      </View>

      {summary.notUpdated.length ? (
        <Group title="Not updated" tone={dark.warn}>
          {summary.notUpdated.map((m, i) => (
            <View key={`${m.kind}-${m.name}`} style={[styles.row, i > 0 && styles.rowLine]}>
              <Logo it={m} />
              <Text style={[styles.name, { flex: 1 }]} numberOfLines={1}>{m.name}</Text>
              <Text style={[styles.sub, { color: dark.warn }]}>{m.short ?? 'No price'}</Text>
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
                <Text style={styles.sub} numberOfLines={1}>{[u.date ? shortDate(u.date) : null, u.sourceShort].filter(Boolean).join(' · ')}</Text>
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
    <View style={styles.pill}>
      <Text style={styles.pillLabel}>{label}</Text>
      <Text style={[styles.pillValue, { color: full ? GLASS_INK : dark.warn }]}>{ok}/{total}</Text>
    </View>
  );
}

function Group({ title, tone, children }: { title: string; tone: string; children: ReactNode }) {
  return (
    <View style={styles.groupWrap}>
      <Text style={[styles.groupTitle, { color: tone }]}>{title}</Text>
      <View style={styles.group}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { paddingBottom: space.xs },
  verdictRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  verdict: { fontFamily: font.semibold, fontSize: 13 },
  countRow: { flexDirection: 'row', alignItems: 'baseline', marginTop: 6 },
  count: { color: GLASS_INK, fontFamily: font.numBold, fontSize: 40, letterSpacing: -1.2, fontVariant: ['tabular-nums'] },
  countOf: { color: GLASS_INK2, fontFamily: font.num, fontSize: 20, fontVariant: ['tabular-nums'] },
  pills: { flexDirection: 'row', gap: 6, marginLeft: 'auto', alignSelf: 'center' },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, height: 26, borderRadius: 13, borderWidth: 1, borderColor: GLASS_LINE, backgroundColor: 'rgba(255,255,255,0.05)' },
  pillLabel: { color: GLASS_INK2, fontFamily: font.medium, fontSize: 12 },
  pillValue: { fontFamily: font.num, fontSize: 12.5, fontVariant: ['tabular-nums'] },
  groupWrap: { marginTop: space.lg },
  groupTitle: { fontFamily: font.semibold, fontSize: 12, letterSpacing: 0.4, marginBottom: 8, marginLeft: 4 },
  group: { borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.045)', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.10)', paddingHorizontal: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  rowLine: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: GLASS_LINE },
  rowMid: { flex: 1, minWidth: 0 },
  name: { color: GLASS_INK, fontFamily: font.semibold, fontSize: 14.5 },
  sub: { color: GLASS_INK2, fontFamily: font.regular, fontSize: 12, marginTop: 1 },
  price: { color: GLASS_INK, fontFamily: font.num, fontSize: 15, fontVariant: ['tabular-nums'] },
});
