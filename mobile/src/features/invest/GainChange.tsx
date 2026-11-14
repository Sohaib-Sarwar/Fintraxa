/**
 * Unrealized gain on the Mutual funds / PSX card, right of the value — the Wallet card's change style (owner,
 * 2026-11-15): a slim arrow (up = green, down = red), the % in the card's ink, "unrealized" under it.
 * % = unrealized ÷ invested (cost of what is held), the engines' own `unrealizedPct` where they give one.
 */
import { StyleSheet, View } from 'react-native';
import { ArrowDownRight, ArrowUpRight } from '@/ui/icons';
import { useCardInk } from '@/features/today/NetWorthCard';
import { Text } from '@/ui/Text';
import { alpha, dark, font } from '@/ui/tokens';

export function GainChange({ pct, hidden }: { pct: number | null; hidden: boolean }) {
  const c = useCardInk();
  if (pct === null || !Number.isFinite(pct)) return null;
  const flat = Math.abs(pct) < 0.005;
  const Arrow = pct < 0 ? ArrowDownRight : ArrowUpRight;
  return (
    <View style={styles.change} accessible accessibilityLabel={`Unrealized ${flat ? 'flat' : pct < 0 ? 'down' : 'up'} ${Math.abs(pct).toFixed(2)} percent`}>
      <View style={styles.row}>
        {flat ? null : <Arrow size={14} color={alpha(pct < 0 ? dark.neg : dark.pos, 0.95)} strokeWidth={2.4} />}
        <Text style={[styles.text, { color: c.ink }, !c.shadow && styles.noShadow]}>{hidden ? '••' : `${Math.abs(pct).toFixed(2)}%`}</Text>
      </View>
      <Text style={[styles.sub, { color: c.ink2 }]}>unrealized</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  change: { alignItems: 'flex-end' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  text: { color: '#F5F5F3', fontFamily: font.numMedium, fontSize: 14, lineHeight: 18, letterSpacing: -0.2,
    textShadowColor: 'rgba(0,0,0,0.45)', textShadowRadius: 6, textShadowOffset: { width: 0, height: 1 } },
  noShadow: { textShadowRadius: 0 },
  sub: { color: 'rgba(245,245,243,0.6)', fontFamily: font.medium, fontSize: 10.5, lineHeight: 13 },
});
