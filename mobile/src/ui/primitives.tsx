/**
 * Small building blocks: Card, Row, Divider, Pill, IconButton, Button, Chip, SectionHeader.
 * Touch targets are ≥ 48 dp; every pressable has an accessibility role and label.
 */
import { LinearGradient } from 'expo-linear-gradient';
import type { LucideIcon } from '@/ui/icons';
import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import { haptic } from '@/lib/haptics';
import { LiquidLayers, useGlass } from './glass';
import { Text } from './Text';
import { useTheme } from './theme';
import { alpha, radius, space, TOUCH } from './tokens';

/** A card. With the Glass style (Me › Appearance) it becomes Liquid Glass at the chosen transparency. */
export function Card({ children, style, padded = true }: { children: ReactNode; style?: StyleProp<ViewStyle>; padded?: boolean }) {
  const p = useTheme();
  const g = useGlass();
  const look = g.on
    ? { overflow: 'hidden' as const }
    : { backgroundColor: p.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: p.border };
  return (
    <View style={[{ borderRadius: radius.card }, look, padded && { padding: space.xl }, style]}>
      {g.on ? <LiquidLayers g={g} radius={(StyleSheet.flatten(style)?.borderRadius as number | undefined) ?? radius.card} /> : null}
      {children}
    </View>
  );
}

export function Divider({ inset = 0 }: { inset?: number }) {
  const p = useTheme();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: p.border, marginLeft: inset }} />;
}

export function Gap({ h = space.md, w }: { h?: number; w?: number }) {
  return <View style={w ? { width: w } : { height: h }} />;
}

export function SectionHeader({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return (
    <View style={styles.sectionHeader}>
      <Text variant="headline" accessibilityRole="header">{title}</Text>
      {action && onAction ? (
        <Pressable onPress={onAction} hitSlop={12} accessibilityRole="button" accessibilityLabel={action}>
          <Text variant="label" tone="accent">{action}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

type ButtonProps = Omit<PressableProps, 'children' | 'style'> & {
  label: string; kind?: 'primary' | 'secondary' | 'ghost' | 'danger'; icon?: LucideIcon; loading?: boolean; style?: StyleProp<ViewStyle>; size?: 'md' | 'lg';
};

export function Button({ label, kind = 'primary', icon: Icon, loading, disabled, style, size = 'lg', onPress, ...rest }: ButtonProps) {
  const p = useTheme();
  const bg = kind === 'primary' ? p.accent : kind === 'secondary' ? p.surface2 : kind === 'danger' ? p.negSoft : 'transparent';
  const fg = kind === 'primary' ? p.accentInk : kind === 'danger' ? p.neg : p.ink;
  const off = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!off, busy: !!loading }}
      disabled={off}
      onPress={(e) => { haptic.light(); onPress?.(e); }}
      android_ripple={{ color: p.mode === 'dark' ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)', borderless: false }}
      style={({ pressed }) => [
        styles.button,
        { height: size === 'lg' ? 56 : TOUCH, backgroundColor: bg, opacity: off ? 0.45 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] },
        kind === 'secondary' && { borderWidth: StyleSheet.hairlineWidth, borderColor: p.border },
        kind === 'primary' && p.accentRing ? { borderWidth: 1, borderColor: p.accentRing } : null,
        style,
      ]}
      {...rest}
    >
      {loading ? <ActivityIndicator color={fg} /> : (
        <>
          {Icon ? <Icon size={20} color={fg} strokeWidth={2} /> : null}
          <Text variant="bodyStrong" style={{ color: fg }}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

export function IconButton({ icon: Icon, label, onPress, size = 22, tone, filled = false }: { icon: LucideIcon; label: string; onPress: () => void; size?: number; tone?: string; filled?: boolean }) {
  const p = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => { haptic.tick(); onPress(); }}
      hitSlop={6}
      style={({ pressed }) => [styles.iconButton, filled && { backgroundColor: p.surface2 }, { opacity: pressed ? 0.6 : 1 }]}
    >
      <Icon size={size} color={tone ?? p.ink} strokeWidth={1.9} />
    </Pressable>
  );
}

export function Chip({ label, selected, onPress, icon, accessibilityLabel }: { label: string; selected?: boolean; onPress?: () => void; icon?: ReactNode; accessibilityLabel?: string }) {
  const p = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      accessibilityLabel={accessibilityLabel ?? label}
      onPress={() => { haptic.tick(); onPress?.(); }}
      style={({ pressed }) => [
        styles.chip,
        { backgroundColor: selected ? p.accent : p.surface2, borderColor: selected ? p.accent : p.border, opacity: pressed ? 0.8 : 1 },
      ]}
    >
      {icon}
      <Text variant="label" style={{ color: selected ? p.accentInk : p.ink, fontFamily: selected ? 'Inter_600SemiBold' : 'Inter_500Medium' }} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}

/** Small tinted label: the only coloured background allowed for P&L (plan §5). */
export function Pill({ text, tone = 'flat' }: { text: string; tone?: 'pos' | 'neg' | 'flat' | 'warn' | 'accent' }) {
  const p = useTheme();
  const map = {
    pos: [p.posSoft, p.pos], neg: [p.negSoft, p.neg], warn: [p.warnSoft, p.warn], accent: [p.accentSoft, p.mode === 'dark' ? p.accent : p.accentDeep], flat: [p.surface2, p.ink2],
  } as const;
  const [bg, fg] = map[tone];
  return (
    <View style={[styles.pill, { backgroundColor: bg }]}>
      <Text variant="label" style={{ color: fg, fontVariant: ['tabular-nums'] }} numberOfLines={1}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.md, marginTop: space.xxl },
  button: { borderRadius: radius.pill, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm, paddingHorizontal: space.xl, overflow: 'hidden' },
  iconButton: { width: TOUCH, height: TOUCH, borderRadius: TOUCH / 2, alignItems: 'center', justifyContent: 'center' },
  chip: { minHeight: 40, paddingHorizontal: 14, borderRadius: radius.chip, borderWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', gap: 6 },
  pill: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  circle: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth },
  hero: { borderRadius: 28, padding: space.xl, overflow: 'hidden', borderWidth: 1 },
  quick: { alignItems: 'center', gap: 8, flex: 1, minHeight: 84 },
  quickCircle: { width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth },
});

/** Round 44 dp icon button on a raised surface (header actions, back). */
export function CircleButton({ icon: Icon, label, onPress, active = false }: { icon: LucideIcon; label: string; onPress: () => void; active?: boolean }) {
  const p = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => { haptic.tick(); onPress(); }}
      hitSlop={4}
      style={({ pressed }) => [styles.circle, { backgroundColor: active ? p.accent : p.surface3, borderColor: p.borderStrong, transform: [{ scale: pressed ? 0.94 : 1 }] }]}
    >
      <Icon size={20} color={active ? p.accentInk : p.ink} strokeWidth={1.9} />
    </Pressable>
  );
}

/** The one gradient card per screen (hero figures). Text on it uses heroInk / heroInk2. */
export function HeroCard({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const p = useTheme();
  return (
    <View style={[styles.hero, { borderColor: p.heroBorder }, style]}>
      <LinearGradient colors={[p.heroFrom, p.heroTo]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      <LinearGradient colors={[alpha(p.accentOnDark, 0.12), alpha(p.accentOnDark, 0)]} start={{ x: 1, y: 0 }} end={{ x: 0.3, y: 0.8 }} style={StyleSheet.absoluteFill} />
      {children}
    </View>
  );
}

/** Round quick action with a label underneath (Home's action row). */
export function QuickAction({ icon: Icon, label, onPress, primary = false }: { icon: LucideIcon; label: string; onPress: () => void; primary?: boolean }) {
  const p = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={() => { haptic.light(); onPress(); }} style={styles.quick}>
      {({ pressed }) => (
        <>
          <View style={[styles.quickCircle, { backgroundColor: primary ? p.accent : p.surface3, borderColor: primary ? p.accent : p.borderStrong, transform: [{ scale: pressed ? 0.93 : 1 }] }]}>
            <Icon size={22} color={primary ? p.accentInk : p.ink} strokeWidth={1.9} />
          </View>
          <Text variant="label" tone="ink2" numberOfLines={1}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}
