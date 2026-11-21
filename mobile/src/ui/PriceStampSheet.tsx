/**
 * A price's stamp (tap or long-press a price): the day it is for, when it was fetched and where it came from.
 * The wording is shared with the web (@core/market/priceStamp.js).
 */
import { StyleSheet, View } from 'react-native';
import { Sheet } from './Sheet';
import { Text } from './Text';
import { space } from './tokens';

export type Stamp = { title: string; rows: [string, string][]; note: string | null };

export function PriceStampSheet({ stamp, onClose }: { stamp: Stamp | null; onClose: () => void }) {
  return (
    <Sheet open={!!stamp} onClose={onClose} title="Price details" maxHeight={0.5}>
      {stamp ? (
        <View style={styles.body}>
          <Text variant="body" weight="Inter_600SemiBold">{stamp.title}</Text>
          {stamp.rows.map(([k, v]) => (
            <View key={k} style={styles.row} accessible accessibilityLabel={`${k}: ${v}`}>
              <Text variant="caption" tone="muted" style={styles.key}>{k}</Text>
              <Text variant="body" style={styles.value}>{v}</Text>
            </View>
          ))}
          {stamp.note ? <Text variant="caption" tone="warn">{stamp.note}</Text> : null}
        </View>
      ) : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: space.sm, paddingBottom: space.lg },
  row: { flexDirection: 'row', gap: space.md, alignItems: 'baseline' },
  key: { width: 92 },
  value: { flex: 1 },
});
