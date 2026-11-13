import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '@/ui/primitives';
import { Text } from '@/ui/Text';
import { useTheme } from '@/ui/theme';
import { SCREEN_PAD, space } from '@/ui/tokens';

/** Welcome (plan §6.1): one line of value, two actions in the thumb zone. */
export default function Welcome() {
  const p = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.root, { backgroundColor: p.bg }]}>
      <LinearGradient
        colors={p.mode === 'dark' ? ['rgba(201,162,126,0.16)', 'rgba(201,162,126,0)'] : ['rgba(169,130,94,0.14)', 'rgba(169,130,94,0)']}
        style={StyleSheet.absoluteFill}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 0.6 }}
      />
      <View style={[styles.top, { paddingTop: insets.top + space.xxxl }]}>
        <Animated.View entering={FadeIn.duration(500)}>
          <Image source={require('../../../assets/mark.png')} style={styles.mark} contentFit="contain" accessibilityLabel="Fintraxa logo" />
        </Animated.View>
      </View>
      <Animated.View entering={FadeInDown.delay(120).springify().damping(18)} style={[styles.bottom, { paddingBottom: insets.bottom + space.xl }]}>
        <Text variant="label" tone="accent" style={styles.brand}>FINTRAXA</Text>
        <Text variant="display" style={styles.headline} accessibilityRole="header">Your money, right where you left it.</Text>
        <Text variant="body" tone="ink2" style={styles.sub}>Mutual funds, PSX shares and everyday spending — one calm view, figures you can trust to the paisa.</Text>
        <Button label="Sign in" onPress={() => router.push('/sign-in')} />
        <Button label="Create account" kind="secondary" onPress={() => router.push('/sign-up')} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  top: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  mark: { width: 132, height: 132 },
  bottom: { paddingHorizontal: SCREEN_PAD, gap: space.md },
  brand: { letterSpacing: 3 },
  headline: { fontFamily: 'Inter_700Bold', fontSize: 34, lineHeight: 40, letterSpacing: -0.8 },
  sub: { marginBottom: space.lg },
});
