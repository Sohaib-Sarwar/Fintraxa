import { Delete } from '@/ui/icons';
import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { haptic } from '@/lib/haptics';
import { Text } from './Text';
import { useTheme } from './theme';

export { pressKey } from '@/lib/amount';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'del'] as const;

/** Custom numeric keypad (no system keyboard jump; big 64 dp keys in the thumb zone). */
export const Keypad = memo(function Keypad({ onKey }: { onKey: (k: string) => void }) {
  const p = useTheme();
  return (
    <View style={styles.grid}>
      {KEYS.map((k) => (
        <Pressable
          key={k}
          accessibilityRole="button"
          accessibilityLabel={k === 'del' ? 'Delete digit' : k === '.' ? 'Decimal point' : k}
          onPress={() => { haptic.tick(); onKey(k); }}
          onLongPress={k === 'del' ? () => { haptic.light(); onKey('clear'); } : undefined}
          android_ripple={{ color: p.mode === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)', borderless: true }}
          style={({ pressed }) => [styles.key, { backgroundColor: pressed ? p.surface2 : 'transparent' }]}
        >
          {k === 'del' ? <Delete size={24} color={p.ink} strokeWidth={1.8} /> : <Text variant="display" style={styles.digit}>{k}</Text>}
        </Pressable>
      ))}
    </View>
  );
});

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  key: { width: '33.333%', height: 60, alignItems: 'center', justifyContent: 'center', borderRadius: 16 },
  digit: { fontSize: 26, lineHeight: 32, fontFamily: 'InterTight_500Medium' },
});
