import type { LucideIcon } from '@/ui/icons';
import { ChevronRight } from '@/ui/icons';
import { Pressable, StyleSheet, Switch, View } from 'react-native';
import { haptic } from '@/lib/haptics';
import { Text } from './Text';
import { useTheme } from './theme';
import { space } from './tokens';

type Props = {
  icon?: LucideIcon; title: string; subtitle?: string | null; value?: string;
  toggle?: boolean; onToggle?: (v: boolean) => void; onPress?: () => void; disabled?: boolean; danger?: boolean;
};

/** Settings row: icon · title/subtitle · value or switch or chevron. Whole row is the touch target. */
export function SettingRow({ icon: Icon, title, subtitle, value, toggle, onToggle, onPress, disabled, danger }: Props) {
  const p = useTheme();
  const isSwitch = toggle !== undefined;
  const press = () => {
    if (disabled) return;
    if (isSwitch) { haptic.tick(); onToggle?.(!toggle); } else onPress?.();
  };
  return (
    <Pressable
      onPress={press}
      disabled={disabled || (!isSwitch && !onPress)}
      accessibilityRole={isSwitch ? 'switch' : 'button'}
      accessibilityState={{ checked: isSwitch ? !!toggle : undefined, disabled: !!disabled }}
      accessibilityLabel={title}
      accessibilityHint={subtitle ?? undefined}
      android_ripple={{ color: p.mode === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)' }}
      style={[styles.row, { opacity: disabled ? 0.5 : 1 }]}
    >
      {Icon ? <View style={[styles.icon, { backgroundColor: danger ? p.negSoft : p.surface2 }]}><Icon size={18} color={danger ? p.neg : p.ink} /></View> : null}
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="body" tone={danger ? 'neg' : 'ink'}>{title}</Text>
        {subtitle ? <Text variant="caption" tone="ink2">{subtitle}</Text> : null}
      </View>
      {value ? <Text variant="label" tone="ink2">{value}</Text> : null}
      {isSwitch ? (
        <Switch value={!!toggle} onValueChange={(v) => { haptic.tick(); onToggle?.(v); }} disabled={disabled}
          trackColor={{ false: p.surface3, true: p.accent }} thumbColor={p.mode === 'dark' ? '#F5F5F7' : '#FFFFFF'} ios_backgroundColor={p.surface3}
          accessibilityElementsHidden importantForAccessibility="no" />
      ) : onPress ? <ChevronRight size={18} color={p.muted} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 60, paddingVertical: space.sm },
  icon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
});
