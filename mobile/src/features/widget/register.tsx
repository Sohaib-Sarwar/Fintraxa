/**
 * Registers the widget's background task and its settings screen with react-native-android-widget. Loaded from
 * the app entry (index.js) only in an installed Android build — the native module is not in Expo Go or on the web.
 *
 * Android redraws the widget every 30 minutes (the shortest period it allows) and when it is added or resized; the
 * app redraws it whenever it saves new figures. Each draw recomputes "today" from the clock, so the figure is
 * current to the last draw. Tapping opens the app.
 */
import { registerWidgetConfigurationScreen, registerWidgetTaskHandler, type WidgetTaskHandlerProps } from 'react-native-android-widget';
import { WidgetSettingsScreen } from './WidgetSettings';
import { renderFor } from './render';
import { removeConfig } from './storage';

async function handler({ widgetInfo, widgetAction, renderWidget }: WidgetTaskHandlerProps) {
  if (widgetAction === 'WIDGET_DELETED') { await removeConfig(widgetInfo.widgetId); return; }
  try {
    renderWidget(await renderFor(widgetInfo));
  } catch (e) {
    console.warn('[widget] draw failed', e);
  }
}

registerWidgetTaskHandler(handler);
registerWidgetConfigurationScreen(WidgetSettingsScreen);
