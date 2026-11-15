import { Pressable, StyleSheet, View } from 'react-native';
import { haptic } from '@/lib/haptics';
import { Text } from './Text';
import { useTheme } from './theme';

type Option<T extends string> = { value: T; label: string };

/**
 * Pill toggle (reference: "Income | Expenses"): separate pills, the chosen one filled lime with dark text,
 * the others outlined. A light tick on change.
 */
export function Segmented<T extends string>({ options, value, onChange, accessibilityLabel }: {
  options: Option<T>[]; value: T; onChange: (v: T) => void; accessibilityLabel: string;
}) {
  const p = useTheme();
  return (
    <View accessibilityRole="tablist" accessibilityLabel={accessibilityLabel} style={styles.row}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable key={o.value} accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={o.label}
            onPress={() => { if (!on) { haptic.tick(); onChange(o.value); } }}
            style={({ pressed }) => [styles.pill, {
              backgroundColor: on ? p.accent : 'transparent', borderColor: on ? p.accent : p.borderStrong, transform: [{ scale: pressed ? 0.97 : 1 }],
            }]}>
            <Text variant="bodyStrong" style={{ color: on ? p.accentInk : p.ink2, fontSize: 14 }} numberOfLines={1}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 10 },
  pill: { flex: 1, height: 46, borderRadius: 23, borderWidth: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
});
