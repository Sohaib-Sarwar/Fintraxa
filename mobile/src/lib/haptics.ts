/** Haptics as trust signals (plan §7.5): tick on selection, success on save, warning on destructive confirm. */
import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';
import { useApp } from './store';

const on = () => Platform.OS !== 'web' && useApp.getState().haptics;
const safe = (p: Promise<void>) => { p.catch(() => {}); };

export const haptic = {
  tick: () => { if (on()) safe(Haptics.selectionAsync()); },
  light: () => { if (on()) safe(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)); },
  success: () => { if (on()) safe(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)); },
  warning: () => { if (on()) safe(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)); },
  error: () => { if (on()) safe(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)); },
};
