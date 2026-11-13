import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Image } from 'expo-image';
import { memo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { env } from '@/lib/env';
import { muiToGlyph } from './categoryIcons';
import { Text } from './Text';
import { useTheme } from './theme';

const AMC = {
  atlas: require('../../assets/amc/atlas.webp'),
  mcb: require('../../assets/amc/mcb.webp'),
  meezan: require('../../assets/amc/meezan.webp'),
  nbp: require('../../assets/amc/nbp.webp'),
  ubl: require('../../assets/amc/ubl.webp'),
} as const;

function Initials({ text, size }: { text: string; size: number }) {
  const p = useTheme();
  return (
    <View style={[styles.circle, { width: size, height: size, borderRadius: size / 2, backgroundColor: p.surface3 }]}>
      <Text variant="label" tone="ink2" style={{ fontSize: Math.round(size * 0.34) }}>{text.slice(0, 2).toUpperCase()}</Text>
    </View>
  );
}

/** PSX company logo, served (and disk-cached by expo-image) from the web app's /stock-logos; initials if none. */
export const StockLogo = memo(function StockLogo({ symbol, size = 40 }: { symbol: string; size?: number }) {
  const p = useTheme();
  const [failed, setFailed] = useState(false);
  if (failed) return <Initials text={symbol} size={size} />;
  return (
    <View style={[styles.circle, { width: size, height: size, borderRadius: size / 2, backgroundColor: '#FFFFFF', borderColor: p.border, borderWidth: StyleSheet.hairlineWidth }]}>
      <Image
        source={{ uri: `${env.webApp}/stock-logos/${encodeURIComponent(symbol.toUpperCase())}.svg` }}
        style={{ width: size * 0.7, height: size * 0.7 }}
        contentFit="contain"
        cachePolicy="disk"
        recyclingKey={symbol}
        onError={() => setFailed(true)}
        accessibilityIgnoresInvertColors
      />
    </View>
  );
});

export const AmcLogo = memo(function AmcLogo({ code, name, size = 40 }: { code: string | null; name?: string | null; size?: number }) {
  const p = useTheme();
  const src = code ? AMC[code as keyof typeof AMC] : undefined;
  if (!src) return <Initials text={name ?? code ?? 'MF'} size={size} />;
  return (
    <View style={[styles.circle, { width: size, height: size, borderRadius: size / 2, backgroundColor: '#FFFFFF', borderColor: p.border, borderWidth: StyleSheet.hairlineWidth }]}>
      <Image source={src} style={{ width: size * 0.74, height: size * 0.74 }} contentFit="contain" />
    </View>
  );
});

export const CategoryIcon = memo(function CategoryIcon({ icon, size = 40, tone = 'neutral' }: { icon: string | null | undefined; size?: number; tone?: 'neutral' | 'income' | 'selected' }) {
  const p = useTheme();
  const bg = tone === 'selected' ? p.ink : tone === 'income' ? p.posSoft : p.surface2;
  const fg = tone === 'selected' ? p.bg : tone === 'income' ? p.pos : p.ink;
  return (
    <View style={[styles.circle, { width: size, height: size, borderRadius: size / 2, backgroundColor: bg }]}>
      <MaterialIcons name={muiToGlyph(icon)} size={Math.round(size * 0.5)} color={fg} />
    </View>
  );
});

const styles = StyleSheet.create({
  circle: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
});
