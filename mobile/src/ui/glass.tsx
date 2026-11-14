/**
 * Liquid Glass (owner, 2026-11-15: "official Apple glass… I can change the transparency"). Modelled on Apple's
 * material: a translucent body (Regular = frosted, Clear = highly translucent), a specular rim that is brightest
 * where light hits (top-left) and again on the far edge, and a soft sheen over the upper half.
 *
 * Android has no system glass, so surfaces that sit over content (nav bar, sheets) keep their real blur and take
 * their tint from `tintAlpha`; cards on the pitch-black page draw the body + rim + sheen below. One setting,
 * `useApp().glassClear` (0 = frosted … 1 = clear), drives both.
 */
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View } from 'react-native';
import { useApp } from '@/lib/store';

export type GlassLevels = { on: boolean; clear: number; tintAlpha: number; body: string; sheen: [string, string]; rim: [string, string, string, string] };

export function glassLevels(on: boolean, clear: number): GlassLevels {
  const c = Math.min(1, Math.max(0, clear));
  const frost = 1 - c;
  // Body: white over black, so an opaque grey (the page is pitch black): 3% (clear) … 13% (frosted).
  const v = Math.round(255 * (0.03 + 0.1 * frost));
  return {
    on,
    clear: c,
    tintAlpha: 0.22 + 0.56 * frost,
    body: `rgb(${v},${v},${Math.min(255, v + 3)})`,
    sheen: [`rgba(255,255,255,${(0.07 + 0.08 * frost).toFixed(3)})`, 'rgba(255,255,255,0)'],
    rim: [`rgba(255,255,255,${(0.42 + 0.2 * c).toFixed(3)})`, 'rgba(255,255,255,0.08)', 'rgba(255,255,255,0.05)', `rgba(255,255,255,${(0.16 + 0.12 * c).toFixed(3)})`],
  };
}

export function useGlass(): GlassLevels {
  const on = useApp((s) => s.material) === 'glass';
  const clear = useApp((s) => s.glassClear);
  return glassLevels(on, clear);
}

/**
 * The glass layers, drawn behind a container's children (container: `overflow: 'hidden'`, no border, its radius).
 * Rim = a diagonal light gradient showing 1 px around the body.
 */
export function LiquidLayers({ g, radius }: { g: GlassLevels; radius: number }) {
  return (
    <>
      <LinearGradient colors={g.rim} locations={[0, 0.35, 0.65, 1]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} pointerEvents="none" />
      <View style={[styles.inset, { borderRadius: radius - 1, backgroundColor: g.body }]} pointerEvents="none" />
      <LinearGradient colors={g.sheen} locations={[0, 0.55]} start={{ x: 0.2, y: 0 }} end={{ x: 0.5, y: 1 }} style={[styles.inset, { borderRadius: radius - 1 }]} pointerEvents="none" />
    </>
  );
}

const styles = StyleSheet.create({
  inset: { position: 'absolute', top: 1, left: 1, right: 1, bottom: 1 },
});
