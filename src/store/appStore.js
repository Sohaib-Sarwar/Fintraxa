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

const getInitialTheme = () => {
  try {
    const stored = localStorage.getItem('pt-theme');
    if (stored === 'dark' || stored === 'light') return stored;
  } catch {}
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

const getInitialCurrency = () => {
  try {
    const stored = localStorage.getItem('pt-currency');
    if (stored && CURRENCIES[stored]) return stored;
  } catch {}
  return 'PKR';
};

export { CURRENCIES };

export const useAppStore = create((set, get) => ({
  // Theme
  themeMode: getInitialTheme(),
  toggleTheme: () => {
    const next = get().themeMode === 'light' ? 'dark' : 'light';
    try { localStorage.setItem('pt-theme', next); } catch {}
    set({ themeMode: next });
  },
  setThemeMode: (mode) => {
    try { localStorage.setItem('pt-theme', mode); } catch {}
    set({ themeMode: mode });
  },

  // Currency
  currency: getInitialCurrency(),
  exchangeRates: null,       // { USD: 278.5, EUR: 302, ... } — rates: 1 unit of foreign = X PKR
  exchangeRatesLoading: false,
  setCurrency: async (code, userId) => {
    if (!CURRENCIES[code]) return;
    try { localStorage.setItem('pt-currency', code); } catch {}
    set({ currency: code });
    if (userId) {
      try {
        await supabase.from('user_preferences')
          .upsert({ user_id: userId, currency: code }, { onConflict: 'user_id' });
      } catch {}
    }
  },
  fetchExchangeRates: async () => {
    if (get().exchangeRatesLoading) return;
    set({ exchangeRatesLoading: true });
    try {
      // Use free exchangerate API: base PKR
      const res = await fetch('https://api.exchangerate-api.com/v4/latest/PKR');
      if (res.ok) {
        const data = await res.json();
        // data.rates has PKR->X, but we want "1 X = ? PKR" i.e. inverse
        // data.rates.USD = how many USD per 1 PKR, so 1 USD = 1/data.rates.USD PKR
        const rates = {};
        for (const code of Object.keys(CURRENCIES)) {
          if (code === 'PKR') { rates.PKR = 1; continue; }
          if (data.rates[code]) {
            rates[code] = 1 / data.rates[code]; // 1 unit of code = rates[code] PKR
          }
        }
        set({ exchangeRates: rates, exchangeRatesLoading: false });
        try { localStorage.setItem('pt-exchange-rates', JSON.stringify({ rates, ts: Date.now() })); } catch {}
      } else {
        set({ exchangeRatesLoading: false });
      }
    } catch {
      // Try to load cached rates
      try {
        const cached = JSON.parse(localStorage.getItem('pt-exchange-rates'));
        if (cached?.rates) set({ exchangeRates: cached.rates });
      } catch {}
      set({ exchangeRatesLoading: false });
    }
  },
  loadUserPreferences: async (userId) => {
    if (!userId) return;
    try {
      const { data } = await supabase
        .from('user_preferences').select('currency').eq('user_id', userId).maybeSingle();
      if (data?.currency && CURRENCIES[data.currency]) {
        try { localStorage.setItem('pt-currency', data.currency); } catch {}
        set({ currency: data.currency });
      }
    } catch {}
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
