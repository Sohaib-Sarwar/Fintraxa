/**
 * Shared passive-income pieces (owner, 2026-11-14), mirroring the web PassiveIncome page:
 *  - labels per source (the web's VIEW_LABEL / TAX_LABEL), compact names for the card;
 *  - the hold card = the web FlowChart tooltip: the month's after-tax total ("… after tax"), each source that
 *    earned, then CGT (mutual funds) or Tax withheld;
 *  - the source icon used on cards, the donut and lists.
 */
import { View } from 'react-native';
import type { PassiveMonth, PassiveSource } from '@/data/engines';
import { monthName } from '@/lib/dates';
import { compactNumber, group } from '@/lib/format';
import { useHidden } from '@/ui/Figures';
import { Coins, HandCoins, LineChart, PiggyBank, type LucideIcon } from '@/ui/icons';
import { Text } from '@/ui/Text';
import { useTheme } from '@/ui/theme';
import { font } from '@/ui/tokens';

export const VIEW_LABEL: Record<PassiveSource, string> = { mutual_funds: 'Mutual funds', dividends: 'Dividends', savings: 'Savings', other: 'Other passive' };
export const SHORT_LABEL: Record<PassiveSource, string> = { mutual_funds: 'Funds', dividends: 'Dividends', savings: 'Savings', other: 'Other' };
export const TAX_LABEL: Record<PassiveSource, string> = { mutual_funds: 'CGT paid', dividends: 'Tax withheld', savings: 'Tax withheld', other: 'Tax' };
const ICON: Record<PassiveSource, LucideIcon> = { mutual_funds: LineChart, dividends: Coins, savings: PiggyBank, other: HandCoins };
const ORDER: PassiveSource[] = ['mutual_funds', 'dividends', 'savings', 'other'];

export function SourceIcon({ source, size = 40 }: { source: PassiveSource; size?: number }) {
  const p = useTheme();
  const Icon = ICON[source];
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center', backgroundColor: p.mode === 'dark' ? 'rgba(255,255,255,0.08)' : p.surface2 }}>
      <Icon size={Math.round(size * 0.48)} color={p.ink} />
    </View>
  );
}

/** The web tooltip for a passive month. `pick`: one source (its page) or all of them (the Passive income page). */
export function PassiveTip({ m, pick }: { m: PassiveMonth; pick: PassiveSource | 'all' }) {
  const p = useTheme();
  const hidden = useHidden();
  const rs = (v: number) => (hidden ? '••••' : `Rs ${Math.abs(v) >= 1e6 ? compactNumber(v) : group(v, Math.abs(v) < 1e4 ? 2 : 0)}`);
  const sources = pick === 'all' ? ORDER.filter((s) => (m[s] ?? 0) !== 0) : [];
  const line = p.mode === 'dark' ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)';
  return (
    <View style={{ gap: 4 }}>
      <Text variant="bodyStrong" numberOfLines={1}>{monthName(m.month)}</Text>
      <Text style={{ fontFamily: font.numHeavy, fontSize: 18, lineHeight: 23, color: p.ink }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{rs(m.net)}</Text>
      <Text variant="caption" tone="muted">{pick === 'all' ? 'Passive income' : VIEW_LABEL[pick]} after tax</Text>
      <View style={{ height: 1, backgroundColor: line, marginVertical: 3 }} />
      {sources.map((s) => (
        <View key={s} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text variant="caption" tone="ink2" style={{ flex: 1 }} numberOfLines={1}>{VIEW_LABEL[s]}</Text>
          <Text style={{ fontFamily: font.num, fontSize: 12.5, color: p.ink }}>{rs(m[s] ?? 0)}</Text>
        </View>
      ))}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text variant="caption" tone="ink2" style={{ flex: 1 }} numberOfLines={1}>{pick === 'mutual_funds' ? 'CGT' : 'Tax withheld'}</Text>
        <Text style={{ fontFamily: font.num, fontSize: 12.5, color: p.ink2 }}>{rs(m.tax)}</Text>
      </View>
    </View>
  );
}
