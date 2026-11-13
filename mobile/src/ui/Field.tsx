import { Eye, EyeOff } from '@/ui/icons';
import { forwardRef, useState, type ComponentRef } from 'react';
import { Pressable, StyleSheet, TextInput, View, type TextInputProps } from 'react-native';
import { Text } from './Text';
import { useTheme } from './theme';
import { font, radius, space } from './tokens';

type Props = TextInputProps & { label: string; error?: string | null; secure?: boolean };

/** Labelled text field with a visible label (not placeholder-only), error text and a show/hide for passwords. */
export const Field = forwardRef<ComponentRef<typeof TextInput>, Props>(function Field({ label, error, secure, style, ...rest }, ref) {
  const p = useTheme();
  const [focused, setFocused] = useState(false);
  const [reveal, setReveal] = useState(false);
  return (
    <View style={styles.wrap}>
      <Text variant="label" tone="ink2" nativeID={`${label}-label`}>{label}</Text>
      <View style={[styles.box, { backgroundColor: p.surface2, borderColor: error ? p.neg : focused ? p.accent : p.border }]}>
        <TextInput
          ref={ref}
          accessibilityLabel={label}
          accessibilityLabelledBy={`${label}-label`}
          placeholderTextColor={p.muted}
          selectionColor={p.accent}
          cursorColor={p.accent}
          secureTextEntry={secure && !reveal}
          onFocus={(e) => { setFocused(true); rest.onFocus?.(e); }}
          onBlur={(e) => { setFocused(false); rest.onBlur?.(e); }}
          style={[styles.input, { color: p.ink }, style]}
          maxFontSizeMultiplier={1.6}
          {...rest}
        />
        {secure ? (
          <Pressable onPress={() => setReveal((v) => !v)} hitSlop={12} accessibilityRole="button" accessibilityLabel={reveal ? 'Hide password' : 'Show password'}>
            {reveal ? <EyeOff size={20} color={p.ink2} /> : <Eye size={20} color={p.ink2} />}
          </Pressable>
        ) : null}
      </View>
      {error ? <Text variant="caption" tone="neg" accessibilityLiveRegion="polite">{error}</Text> : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  box: { flexDirection: 'row', alignItems: 'center', minHeight: 54, borderRadius: radius.input, borderWidth: 1, paddingHorizontal: space.lg, gap: space.sm },
  input: { flex: 1, fontFamily: font.regular, fontSize: 16, paddingVertical: 12 },
});
