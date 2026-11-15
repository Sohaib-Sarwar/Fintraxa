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

/** Letters on a soft tile whose hue comes from the name, so the same company always looks the same. */
function Initials({ text, size }: { text: string; size: number }) {
  const p = useTheme();
  let h = 0;
  for (const ch of text) h = (h * 31 + ch.charCodeAt(0)) % 360;
  const bg = p.mode === 'dark' ? `hsl(${h}, 32%, 22%)` : `hsl(${h}, 55%, 90%)`;
  const fg = p.mode === 'dark' ? `hsl(${h}, 70%, 82%)` : `hsl(${h}, 45%, 30%)`;
  return (
    <View style={[styles.circle, { width: size, height: size, borderRadius: size / 2, backgroundColor: bg }]}>
      <Text variant="label" style={{ color: fg, fontSize: Math.round(size * 0.34), fontFamily: 'Inter_700Bold' }}>{text.replace(/[^A-Za-z0-9]/g, '').slice(0, 2).toUpperCase()}</Text>
    </View>
  );
}

/** Banks with their own logo, bundled (UBL shows UBL Ameen as a bank; the UBL share keeps its stock logo). */
const BANK_LOGOS: Record<string, number> = {
  UBL: require('../../assets/bank-logos/UBL.webp'),
  MCBIB: require('../../assets/bank-logos/MCBIB.webp'),
  RAQAMI: require('../../assets/bank-logos/RAQAMI.webp'),
};

/** A savings account's bank (owner, 2026-11-15): its own logo when bundled, otherwise its PSX stock logo. */
export const BankLogo = memo(function BankLogo({ symbol, size = 40 }: { symbol: string | null | undefined; size?: number }) {
  const p = useTheme();
  const own = symbol ? BANK_LOGOS[symbol.toUpperCase()] : undefined;
  if (!symbol) return <Initials text="B" size={size} />;
  if (!own) return <StockLogo symbol={symbol} size={size} />;
  return (
    <View style={[styles.circle, { width: size, height: size, borderRadius: size / 2, backgroundColor: p.surface3 }]}>
      <Image source={own} style={{ width: size, height: size }} contentFit="cover" accessibilityIgnoresInvertColors />
    </View>
  );
});

/**
 * PSX company logo. The files are TradingView's 18×18 SVGs with their own full-bleed square background,
 * made to be cropped to a circle — so the image fills the whole circle (drawing it at 70% inside a white
 * ring showed a grey square in a white circle). Disk-cached by expo-image; initials if there is none.
 */
export const StockLogo = memo(function StockLogo({ symbol, size = 40 }: { symbol: string; size?: number }) {
  const p = useTheme();
  const [failed, setFailed] = useState(false);
  if (failed) return <Initials text={symbol} size={size} />;
  return (
    <View style={[styles.circle, { width: size, height: size, borderRadius: size / 2, backgroundColor: p.surface3 }]}>
      <Image
        source={{ uri: `${env.webApp}/stock-logos/${encodeURIComponent(symbol.toUpperCase())}.svg` }}
        style={{ width: size, height: size }}
        contentFit="cover"
        cachePolicy="disk"
        recyclingKey={symbol}
        transition={120}
        onError={() => setFailed(true)}
        accessibilityIgnoresInvertColors
      />
    </View>
  );
});

/** `bleed`: the logo file is a full-colour square (KTrade's green tile) — it fills the circle instead of sitting
 * small inside a white disc. */
const BROKER = {
  akd: { src: require('../../assets/brokers/akd.webp'), bleed: false },
  ktrade: { src: require('../../assets/brokers/ktrade.webp'), bleed: true },
} as const;

export const BrokerLogo = memo(function BrokerLogo({ code, size = 44 }: { code: string; size?: number }) {
  const b = BROKER[code as keyof typeof BROKER];
  if (!b) return <Initials text={code} size={size} />;
  return (
    <View style={[styles.circle, { width: size, height: size, borderRadius: size / 2, backgroundColor: '#FFFFFF', overflow: 'hidden' }]}>
      <Image source={b.src} style={b.bleed ? { width: size * 1.02, height: size * 1.02 } : { width: size * 0.72, height: size * 0.72 }} contentFit="cover" />
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

export const CategoryIcon = memo(function CategoryIcon({ icon, size = 40, tone = 'neutral' }: { icon: string | null | undefined; size?: number; tone?: 'neutral' | 'income' | 'selected' | 'accent' | 'glass' }) {
  const p = useTheme();
  // 'glass': a quiet translucent disc for glass rows (owner: sleek, not coloured).
  const glassBg = p.mode === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(16,20,12,0.05)';
  const bg = tone === 'glass' ? glassBg : tone === 'accent' ? p.accent : tone === 'selected' ? p.ink : tone === 'income' ? p.posSoft : p.surface2;
  const fg = tone === 'accent' ? p.accentInk : tone === 'selected' ? p.bg : tone === 'income' ? p.pos : p.ink;
  return (
    <View style={[styles.circle, { width: size, height: size, borderRadius: size / 2, backgroundColor: bg }]}>
      <MaterialIcons name={muiToGlyph(icon)} size={Math.round(size * 0.5)} color={fg} />
    </View>
  );
});

const styles = StyleSheet.create({
  circle: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
});

/** Profile photo, or the first letter on an accent-tinted circle (no outline: owner). */
export const Avatar = memo(function Avatar({ uri, name, size = 46 }: { uri?: string | null; name: string; size?: number }) {
  const p = useTheme();
  return (
    <View style={[styles.circle, { width: size, height: size, borderRadius: size / 2, backgroundColor: p.accentSoft }]}>
      {uri ? (
        // Cached by the file path, not the signed URL (its token changes every hour), so the photo shows at once from disk.
        <Image source={{ uri, cacheKey: uri.split('?')[0] }} style={{ width: size, height: size }} contentFit="cover" transition={120} cachePolicy="memory-disk" accessibilityIgnoresInvertColors />
      ) : (
        <Text variant="headline" style={{ color: p.mode === 'dark' ? p.accent : p.accentDeep, fontSize: Math.round(size * 0.42) }}>{(name || 'F').slice(0, 1).toUpperCase()}</Text>
      )}
    </View>
  );
});
