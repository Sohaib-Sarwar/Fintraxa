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
/** One look for every Fintraxa widget on the phone, edited in the app (Me › Home-screen widget) or by long-press. */
const CFG_KEY = 'fx.widget.cfg.v2';
const CARD_KEY = 'fx.widget.card';

/** 'app' = whatever card the app itself uses (Home), following changes there. */
export type WidgetCard = CardDesignId | 'app';

export type WidgetConfig = {
  card: WidgetCard;
  sources: PassiveSource[];
  basis: RateBasis;
  /** Up to three small figures under the big one, in this order. */
  figures: SmallFigure[];
  sleep: Sleep;
  /** Show •••••• instead of amounts. */
  hide: boolean;
};

export const MAX_FIGURES = 3;

export const defaultConfig = (): WidgetConfig => ({
  card: 'app',
  sources: [...WIDGET_SOURCES],
  basis: 'fy',
  figures: ['overnight', 'yesterday', 'month'],
  sleep: SLEEP_PRESETS[1],
  hide: false,
});

const validCard = (id: unknown): id is CardDesignId => CARD_DESIGNS.some((d) => d.id === id);

/** A saved config, repaired against today's options (a removed card design follows the app again, unknowns dropped). */
export function cleanConfig(raw: unknown): WidgetConfig {
  const base = defaultConfig();
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Partial<WidgetConfig>;
  const sources = Array.isArray(r.sources) ? r.sources.filter((s) => WIDGET_SOURCES.includes(s)) : base.sources;
  const okFig = ['overnight', 'yesterday', 'month', 'received', 'average'];
  const figures = Array.isArray(r.figures) ? r.figures.filter((f) => okFig.includes(f)).slice(0, MAX_FIGURES) : base.figures;
  const hour = (h: unknown, d: number) => (Number.isInteger(h) && (h as number) >= 0 && (h as number) <= 23 ? (h as number) : d);
  return {
    card: validCard(r.card) ? r.card : 'app',
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

/** The card the app uses now (Home's card design), saved by the app for the widget. */
export async function loadAppCard(): Promise<CardDesignId> {
  const c = await readJson(CARD_KEY);
  return validCard(c) ? c : 'obsidian';
}
export async function saveAppCard(id: CardDesignId) {
  await AsyncStorage.setItem(CARD_KEY, JSON.stringify(id));
}

/** The card to draw for a config. */
export const resolveCard = (cfg: WidgetConfig, appCard: CardDesignId): CardDesignId => (cfg.card === 'app' ? appCard : cfg.card);

export async function loadConfig(): Promise<WidgetConfig> {
  return cleanConfig(await readJson(CFG_KEY));
}
export async function saveConfig(cfg: WidgetConfig) {
  await AsyncStorage.setItem(CFG_KEY, JSON.stringify(cfg));
}

/** "Remove data from this phone": the widget forgets the figures (its settings stay). */
export async function clearData() {
  await AsyncStorage.removeItem(DATA_KEY).catch(() => {});
}
