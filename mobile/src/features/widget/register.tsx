/**
 * Registers the widget's background task and its settings screen with react-native-android-widget. Loaded from
 * the app entry (index.js) only in an installed Android build — the native module is not in Expo Go or on the web.
 *
 * Added straight away with the app's card (widgetFeatures reconfigurable|configuration_optional — Android's
 * recommended setup); the settings open from a long-press (Settings / Reconfigure) or in the app.
 * Android redraws the widget every 30 minutes (the shortest period it allows) and when it is added or resized; the
 * app redraws it whenever it saves new figures. Each draw recomputes "today" from the clock, so the figure is
 * current to the last draw, and the native ticker (ticker.ts) keeps the big number flipping every second between
 * draws. Tapping opens the app.
 */
import { registerWidgetConfigurationScreen, registerWidgetTaskHandler, type WidgetTaskHandlerProps } from 'react-native-android-widget';
import { WidgetSettingsScreen } from './WidgetSettings';
import { renderFor } from './render';
import { FallbackWidget } from './EarningsWidget';
import { stopTicker } from './ticker';

async function handler({ widgetInfo, widgetAction, renderWidget }: WidgetTaskHandlerProps) {
  if (widgetAction === 'WIDGET_DELETED') { stopTicker(widgetInfo.widgetId); return; }
  try {
    renderWidget(await renderFor(widgetInfo));
  } catch (e) {
    // Never leave an invisible widget behind (the layout Android shows before the first draw is empty).
    console.warn('[widget] draw failed', e);
    renderWidget(<FallbackWidget />);
  }
}

registerWidgetTaskHandler(handler);
registerWidgetConfigurationScreen(WidgetSettingsScreen);
