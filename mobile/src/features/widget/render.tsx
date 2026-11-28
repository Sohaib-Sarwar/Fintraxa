/**
 * Drawing the widget from what is saved on the phone: no network, no sign-in — so it works offline and while the
 * app is closed. Each draw recomputes the figures from the saved payments and the clock, then hands the rate to the
 * native ticker, which keeps the big number flipping every second on its own (ticker.ts). A draw never fails into
 * an empty widget: any error falls back to a plain card that opens the app.
 */
import React from 'react';
import { widgetFigures } from './earnings';
import { EarningsWidget, FallbackWidget } from './EarningsWidget';
import { widgetLayout } from './layout';
import { loadAppCard, loadConfig, loadData, resolveCard, type WidgetConfig } from './storage';
import { startTicker, tickerAvailable } from './ticker';

/** The two entries in the launcher's widget list (same widget, different starting size); names match app.config.ts. */
export const WIDGET_NAME = 'PassiveIncome';
export const WIDGET_NAMES = ['PassiveIncome', 'PassiveIncomeSmall'] as const;

type Info = { widgetId: number; width: number; height: number };

/** The widget's picture for this size, and the live number started (or stopped) for this widget. */
export async function renderFor(info: Info, override?: WidgetConfig): Promise<React.JSX.Element> {
  try {
    const [cfg, data, appCard] = await Promise.all([override ? Promise.resolve(override) : loadConfig(), loadData(), loadAppCard()]);
    const now = Date.now();
    const figures = data ? widgetFigures(data, { sources: cfg.sources, basis: cfg.basis, sleep: cfg.sleep, now }) : null;
    const live = tickerAvailable;
    const l = widgetLayout(Math.max(100, info.width), Math.max(48, info.height), cfg.figures.length);
    startTicker(info.widgetId, { on: live && !!figures && !cfg.hide, perSecond: figures?.perSecond ?? 0, hide: cfg.hide, slot: l.slot });
    return (
      <EarningsWidget width={info.width} height={info.height} card={resolveCard(cfg, appCard)} figures={figures} show={cfg.figures}
        hide={cfg.hide} builtAt={data?.builtAt ?? null} now={now} live={live} />
    );
  } catch (e) {
    console.warn('[widget] figures failed', e);
    return <FallbackWidget />;
  }
}
