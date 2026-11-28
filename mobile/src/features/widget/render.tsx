/**
 * Drawing the widget from what is saved on the phone: no network, no sign-in — so it works offline and while the
 * app is closed. The figures are recomputed at every draw from the saved payments and the clock (no live ticker —
 * version 5's widget, restored 2026-11-28). A draw never
 * fails into an empty widget: any error falls back to a plain card that opens the app.
 */
import React from 'react';
import { widgetFigures } from './earnings';
import { EarningsWidget, FallbackWidget } from './EarningsWidget';
import { loadAppCard, loadConfig, loadData, resolveCard, type WidgetConfig } from './storage';
import { stopTicker } from './ticker';

/** The two entries in the launcher's widget list (same widget, different starting size); names match app.config.ts. */
export const WIDGET_NAME = 'PassiveIncome';
export const WIDGET_NAMES = ['PassiveIncome', 'PassiveIncomeSmall'] as const;

export async function renderFor(info: { widgetId?: number; width: number; height: number }, override?: WidgetConfig) {
  // The live flipping number (build 6's native ticker) is off by the owner's choice (2026-11-28: "very buggy, keep
  // version 5"): forget it for this widget, so its minute re-sync stops; the redraw below hides it.
  if (info.widgetId !== undefined) stopTicker(info.widgetId);
  try {
    const [cfg, data, appCard] = await Promise.all([override ? Promise.resolve(override) : loadConfig(), loadData(), loadAppCard()]);
    const now = Date.now();
    const figures = data ? widgetFigures(data, { sources: cfg.sources, basis: cfg.basis, sleep: cfg.sleep, now }) : null;
    return (
      <EarningsWidget width={info.width} height={info.height} card={resolveCard(cfg, appCard)} figures={figures} show={cfg.figures}
        hide={cfg.hide} builtAt={data?.builtAt ?? null} now={now} />
    );
  } catch (e) {
    console.warn('[widget] figures failed', e);
    return <FallbackWidget />;
  }
}
