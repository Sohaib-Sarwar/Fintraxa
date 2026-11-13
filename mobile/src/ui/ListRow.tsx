import { ChevronRight } from '@/ui/icons';
import { memo, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { haptic } from '@/lib/haptics';
import { Text } from './Text';
import { useTheme } from './theme';
import { space } from './tokens';

type Props = {
  leading?: ReactNode;
  title: string;
  subtitle?: string | null;
  trailing?: ReactNode;
  trailingSub?: ReactNode;
  onPress?: () => void;
  chevron?: boolean;
  accessibilityLabel?: string;
};

/**
 * Dense, full-width row (design refs: plain lists beat per-row cards for holdings and transactions):
 * leading logo/icon · title + subtitle · trailing figure + its change.
 */
export const ListRow = memo(function ListRow({ leading, title, subtitle, trailing, trailingSub, onPress, chevron, accessibilityLabel }: Props) {
  const p = useTheme();
  return (
    <Pressable
      onPress={onPress ? () => { haptic.tick(); onPress(); } : undefined}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={accessibilityLabel}
      android_ripple={onPress ? { color: p.mode === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)' } : undefined}
      style={({ pressed }) => [styles.row, { opacity: pressed ? 0.75 : 1 }]}
    >
      {leading ? <View style={styles.leading}>{leading}</View> : null}
      <View style={styles.middle}>
        <Text variant="bodyStrong" numberOfLines={1}>{title}</Text>
        {subtitle ? <Text variant="caption" tone="ink2" numberOfLines={1}>{subtitle}</Text> : null}
      </View>
      {trailing || trailingSub ? (
        <View style={styles.trailing}>
          {trailing}
          {trailingSub}
        </View>
      ) : null}
      {chevron ? <ChevronRight size={18} color={p.muted} /> : null}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 64, paddingVertical: space.sm, gap: space.md },
  leading: { width: 40, alignItems: 'center' },
  middle: { flex: 1, minWidth: 0, gap: 2 },
  trailing: { alignItems: 'flex-end', gap: 2, maxWidth: '48%' },
});
