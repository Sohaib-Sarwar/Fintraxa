/**
 * What the home-screen widget reads: the passive payments the app saved (WidgetData) and each widget's own settings.
 * Plain AsyncStorage on purpose: the widget draws while the app is closed and the user signed out (closing the app
 * signs out), when the encrypted cache is locked. It holds only dated passive payments (no names, accounts or
 * holdings) — the figures the user chose to put on the home screen. Wiped with "Remove data from this phone" and
 * replaced when another account signs in.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { PassiveSource } from '@/data/engines';
import { CARD_DESIGNS, type CardDesignId } from '@/features/today/cardDesigns';
import { SLEEP_PRESETS, WIDGET_SOURCES, type RateBasis, type Sleep, type SmallFigure, type WidgetData } from './earnings';

const DATA_KEY = 'fx.widget.data.v1';
const CFG_KEY = (id: number) => `fx.widget.cfg.${id}`;
const CARD_KEY = 'fx.widget.card';

export type WidgetConfig = {
  card: CardDesignId;
  sources: PassiveSource[];
  basis: RateBasis;
  /** Up to three small figures under the big one, in this order. */
  figures: SmallFigure[];
  sleep: Sleep;
  /** Show •••••• instead of amounts. */
  hide: boolean;
};

export const MAX_FIGURES = 3;

export const defaultConfig = (card: CardDesignId = 'obsidian'): WidgetConfig => ({
  card,
  sources: [...WIDGET_SOURCES],
  basis: 'fy',
  figures: ['overnight', 'yesterday', 'month'],
  sleep: SLEEP_PRESETS[1],
  hide: false,
});

const validCard = (id: unknown): id is CardDesignId => CARD_DESIGNS.some((d) => d.id === id);

/** A saved config, repaired against today's options (a removed card design falls back, unknown values dropped). */
export function cleanConfig(raw: unknown, fallbackCard: CardDesignId): WidgetConfig {
  const base = defaultConfig(fallbackCard);
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Partial<WidgetConfig>;
  const sources = Array.isArray(r.sources) ? r.sources.filter((s) => WIDGET_SOURCES.includes(s)) : base.sources;
  const okFig = ['overnight', 'yesterday', 'month', 'received', 'average'];
  const figures = Array.isArray(r.figures) ? r.figures.filter((f) => okFig.includes(f)).slice(0, MAX_FIGURES) : base.figures;
  const hour = (h: unknown, d: number) => (Number.isInteger(h) && (h as number) >= 0 && (h as number) <= 23 ? (h as number) : d);
  return {
    card: validCard(r.card) ? r.card : base.card,
    sources,
    basis: r.basis === 'fy' || r.basis === '12m' || r.basis === 'all' ? r.basis : base.basis,
    figures,
    sleep: { from: hour(r.sleep?.from, base.sleep.from), to: hour(r.sleep?.to, base.sleep.to) },
    hide: r.hide === true,
  };
}

async function readJson(key: string): Promise<unknown> {
  try {
    const s = await AsyncStorage.getItem(key);
    return s ? JSON.parse(s) : null;
  } catch {
    return null;
  }
}

export async function loadData(): Promise<WidgetData | null> {
  const d = await readJson(DATA_KEY) as WidgetData | null;
  return d && d.v === 1 && Array.isArray(d.events) ? d : null;
}

export async function saveData(d: WidgetData) {
  await AsyncStorage.setItem(DATA_KEY, JSON.stringify(d));
}

/** The app's chosen card design, the starting card of a new widget. */
export async function loadDefaultCard(): Promise<CardDesignId> {
  const c = await readJson(CARD_KEY);
  return validCard(c) ? c : 'obsidian';
}
export async function saveDefaultCard(id: CardDesignId) {
  await AsyncStorage.setItem(CARD_KEY, JSON.stringify(id));
}

export async function loadConfig(widgetId: number): Promise<WidgetConfig> {
  return cleanConfig(await readJson(CFG_KEY(widgetId)), await loadDefaultCard());
}
export async function saveConfig(widgetId: number, cfg: WidgetConfig) {
  await AsyncStorage.setItem(CFG_KEY(widgetId), JSON.stringify(cfg));
}
export async function removeConfig(widgetId: number) {
  await AsyncStorage.removeItem(CFG_KEY(widgetId)).catch(() => {});
}

/** "Remove data from this phone": the widget forgets the figures (its settings stay). */
export async function clearData() {
  await AsyncStorage.removeItem(DATA_KEY).catch(() => {});
}
