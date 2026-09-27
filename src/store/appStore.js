import { create } from 'zustand';
import { supabase } from '../lib/supabase';

const CURRENCIES = {
  PKR: { symbol: 'Rs', locale: 'en-PK', name: 'Pakistani Rupee' },
  USD: { symbol: '$', locale: 'en-US', name: 'US Dollar' },
  EUR: { symbol: '€', locale: 'en-IE', name: 'Euro' },
  GBP: { symbol: '£', locale: 'en-GB', name: 'British Pound' },
  AED: { symbol: 'AED', locale: 'en-AE', name: 'UAE Dirham' },
  SAR: { symbol: 'SAR', locale: 'en-SA', name: 'Saudi Riyal' },
  INR: { symbol: '₹', locale: 'en-IN', name: 'Indian Rupee' },
};

/**
 * localStorage throws outright in a private window and in browsers set to
 * block site data — reading it is not merely empty, it raises. Every access
 * here is wrapped, and the fallback is always a working default rather than a
 * broken app.
 */
const readLocal = (key) => {
  try {
    return localStorage.getItem(key);
  } catch {
    // Storage unavailable — the caller's default applies.
    return null;
  }
};

const writeLocal = (key, value) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    // A preference that cannot be remembered is not worth failing over.
  }
};

const getInitialTheme = () => {
  const stored = readLocal('pt-theme');
  if (stored === 'dark' || stored === 'light') return stored;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

const getInitialCurrency = () => {
  const stored = readLocal('pt-currency');
  if (stored && CURRENCIES[stored]) return stored;
  return 'PKR';
};

/** FX rates older than this are refetched rather than trusted. */
const FX_CACHE_TTL_MS = 12 * 60 * 60 * 1000;

const readCachedRates = () => {
  const raw = readLocal('pt-exchange-rates');
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed?.rates ? parsed : null;
  } catch {
    // Corrupt entry — treat it as absent.
    return null;
  }
};

export { CURRENCIES };

export const useAppStore = create((set, get) => ({
  // Theme
  themeMode: getInitialTheme(),
  toggleTheme: () => {
    const next = get().themeMode === 'light' ? 'dark' : 'light';
    writeLocal('pt-theme', next);
    set({ themeMode: next });
  },
  setThemeMode: (mode) => {
    writeLocal('pt-theme', mode);
    set({ themeMode: mode });
  },

  // Currency
  currency: getInitialCurrency(),
  exchangeRates: null,       // { USD: 278.5, EUR: 302, ... } — rates: 1 unit of foreign = X PKR
  exchangeRatesLoading: false,
  /**
   * Throws if the preference could not be saved to the account.
   *
   * It used to swallow the error in a bare `catch {}` — which never even fired,
   * because supabase-js resolves with `{ error }` rather than rejecting. The
   * caller then showed "Currency updated successfully!" unconditionally, and
   * the setting silently reverted on the next device. The local change stands
   * either way, so the UI stays responsive; only the claim of success is
   * conditional now.
   */
  setCurrency: async (code, userId) => {
    if (!CURRENCIES[code]) return;
    writeLocal('pt-currency', code);
    set({ currency: code });
    if (!userId) return;
    const { error } = await supabase.from('user_preferences')
      .upsert({ user_id: userId, currency: code }, { onConflict: 'user_id' });
    if (error) throw error;
  },
  fetchExchangeRates: async () => {
    if (get().exchangeRatesLoading) return;

    // A cache written within the TTL is good enough; skip the network entirely.
    const cached = readCachedRates();
    if (cached && Date.now() - cached.ts < FX_CACHE_TTL_MS) {
      set({ exchangeRates: cached.rates });
      return;
    }

    set({ exchangeRatesLoading: true });
    try {
      // Third-party, unauthenticated, and outside our control — so it gets a
      // timeout. Without one a hung connection left the spinner up forever.
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      let data;
      try {
        const res = await fetch('https://api.exchangerate-api.com/v4/latest/PKR', {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`FX service returned ${res.status}`);
        data = await res.json();
      } finally {
        clearTimeout(timer);
      }

      // The feed quotes PKR → X. The app needs "1 X = ? PKR", so each rate is
      // inverted.
      const rates = { PKR: 1 };
      for (const code of Object.keys(CURRENCIES)) {
        if (code === 'PKR') continue;
        const perPkr = data?.rates?.[code];
        if (typeof perPkr === 'number' && perPkr > 0) rates[code] = 1 / perPkr;
      }

      set({ exchangeRates: rates, exchangeRatesLoading: false });
      writeLocal('pt-exchange-rates', JSON.stringify({ rates, ts: Date.now() }));
    } catch {
      // Stale rates beat no rates: converted figures stay approximately right
      // rather than collapsing to nothing. Currency conversion is a display
      // convenience here — every stored amount is PKR.
      if (cached?.rates) set({ exchangeRates: cached.rates });
      set({ exchangeRatesLoading: false });
    }
  },

  loadUserPreferences: async (userId) => {
    if (!userId) return;
    const { data, error } = await supabase
      .from('user_preferences').select('currency').eq('user_id', userId).maybeSingle();
    if (error) {
      // Not fatal — the locally stored preference already applies. Logged
      // rather than thrown so a preferences hiccup cannot block sign-in.
      console.warn('[Fintraxa] Could not load saved currency preference:', error.message);
      return;
    }
    if (data?.currency && CURRENCIES[data.currency]) {
      writeLocal('pt-currency', data.currency);
      set({ currency: data.currency });
    }
  },

  // Snackbar
  snackbar: { open: false, message: '', severity: 'success' },
  showSnackbar: (message, severity = 'success') =>
    set({ snackbar: { open: true, message, severity } }),
  hideSnackbar: () =>
    set((s) => ({ snackbar: { ...s.snackbar, open: false } })),

  // Confirmation dialog
  confirmDialog: { open: false, title: '', message: '', onConfirm: null },
  showConfirm: (title, message, onConfirm) =>
    set({ confirmDialog: { open: true, title, message, onConfirm } }),
  hideConfirm: () =>
    set({ confirmDialog: { open: false, title: '', message: '', onConfirm: null } }),
}));
