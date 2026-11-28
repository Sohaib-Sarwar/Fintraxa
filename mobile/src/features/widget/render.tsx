/**
 * Drawing the widget from what is saved on the phone: no network, no sign-in — so it works offline and while the
 * app is closed. The figures are recomputed at every draw from the saved payments and the clock.
 */
import React from 'react';
import { widgetFigures } from './earnings';
import { EarningsWidget } from './EarningsWidget';
import { loadConfig, loadData } from './storage';
import type { WidgetConfig } from './storage';

/** The two entries in the launcher's widget list (same widget, different starting size); names match app.config.ts. */
export const WIDGET_NAME = 'PassiveIncome';
export const WIDGET_NAMES = ['PassiveIncome', 'PassiveIncomeSmall'] as const;

export async function renderFor(info: { widgetId: number; width: number; height: number }, override?: WidgetConfig) {
  const [cfg, data] = await Promise.all([override ? Promise.resolve(override) : loadConfig(info.widgetId), loadData()]);
  const now = Date.now();
  const figures = data ? widgetFigures(data, { sources: cfg.sources, basis: cfg.basis, sleep: cfg.sleep, now }) : null;
  return (
    <EarningsWidget width={info.width} height={info.height} card={cfg.card} figures={figures} show={cfg.figures}
      hide={cfg.hide} builtAt={data?.builtAt ?? null} now={now} />
  );
}
