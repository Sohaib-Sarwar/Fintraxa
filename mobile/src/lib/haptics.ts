/** Haptics as trust signals (plan §7.5): tick on selection, success on save, warning on destructive confirm. */
import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';
import { useApp } from './store';

const on = () => useApp.getState().haptics;
const safe = (p: Promise<void>) => { p.catch(() => {}); };
/** Web build: Android Chrome vibrates (navigator.vibrate); browsers without it (iOS Safari) stay silent. */
const web = Platform.OS === 'web';
const buzz = (pattern: number | number[]) => { try { (navigator as Navigator & { vibrate?: (p: number | number[]) => boolean }).vibrate?.(pattern); } catch { /* not supported */ } };

export const haptic = {
  tick: () => { if (!on()) return; if (web) buzz(6); else safe(Haptics.selectionAsync()); },
  light: () => { if (!on()) return; if (web) buzz(12); else safe(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)); },
  success: () => { if (!on()) return; if (web) buzz([12, 50, 18]); else safe(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)); },
  warning: () => { if (!on()) return; if (web) buzz([20, 60, 20]); else safe(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)); },
  error: () => { if (!on()) return; if (web) buzz([30, 50, 30, 50, 30]); else safe(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)); },
};
