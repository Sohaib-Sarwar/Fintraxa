/**
 * The widget's native side, only where it exists: an installed Android build. Expo Go and the web build have no
 * widget module (importing the library there throws), so everything here is a quiet no-op for them.
 */
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';

export const widgetsAvailable = Platform.OS === 'android' && Constants.executionEnvironment !== ExecutionEnvironment.StoreClient;

/** Redraw every Passive income widget on the home screen with the latest saved figures. */
export async function refreshWidgets(): Promise<void> {
  if (!widgetsAvailable) return;
  try {
    const { requestWidgetUpdate } = await import('react-native-android-widget');
    const { renderFor, WIDGET_NAMES } = await import('./render');
    for (const widgetName of WIDGET_NAMES) await requestWidgetUpdate({ widgetName, renderWidget: (info) => renderFor(info) });
  } catch (e) {
    console.warn('[widget] refresh failed', e);
  }
}

/** Ask the launcher to place a widget (Android 8+, launchers that support it). */
export async function pinWidget(): Promise<boolean> {
  if (!widgetsAvailable) return false;
  try {
    const { requestPinWidget } = await import('react-native-android-widget') ;
    const { WIDGET_NAME } = await import('./render');
    return await requestPinWidget({ widgetName: WIDGET_NAME });
  } catch {
    return false;
  }
}
