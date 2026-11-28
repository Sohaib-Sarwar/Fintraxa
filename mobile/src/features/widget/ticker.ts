/**
 * The widget's live, flipping "Earned today" (native module modules/fx-ticker, owner 2026-11-28: "live number
 * flipping, like a clock, offline, without hurting the battery"). JS only hands over the rate and where the number
 * sits; the module fills a ViewFlipper with the next 3 minutes of per-second values from the clock and re-syncs
 * about once a minute while the phone is awake. Missing in Expo Go, on the web and in APKs built before it — then the
 * widget draws a still figure instead (`tickerAvailable` false).
 */
import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';

type Native = { configure(widgetId: number, json: string): boolean; remove(widgetId: number): boolean };

const native = Platform.OS === 'android' ? requireOptionalNativeModule<Native>('FxTicker') : null;

export const tickerAvailable = !!native;

/** Where the live number sits, in dp from each edge of the widget. */
export type Slot = { left: number; top: number; right: number; bottom: number };

export function startTicker(widgetId: number, t: { on: boolean; perSecond: number; hide: boolean; slot: Slot }) {
  if (!native) return;
  try {
    native.configure(widgetId, JSON.stringify({ on: t.on, perSecond: t.perSecond, hide: t.hide, ...t.slot }));
  } catch (e) {
    console.warn('[widget] ticker failed', e);
  }
}

export function stopTicker(widgetId: number) {
  try { native?.remove(widgetId); } catch { /* gone */ }
}
