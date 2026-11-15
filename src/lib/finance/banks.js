/**
 * Banks for savings accounts: the commercial banks listed on the Pakistan Stock Exchange, by ticker (the key for
 * their logo in public/stock-logos), plus Islamic banks the owner banks with that have no ticker of their own
 * (MCB Islamic, Raqami), keyed by a short code. Curated by hand: the broad PSX sector map also lists non-banks under
 * Commercial Banks. `bankLogo` gives a bank's own logo (public/bank-logos/) where one replaces the stock logo.
 */
export const PSX_BANKS = [
  { symbol: 'ABL', name: 'Allied Bank' },
  { symbol: 'AKBL', name: 'Askari Bank' },
  { symbol: 'BAFL', name: 'Bank Alfalah' },
  { symbol: 'BAHL', name: 'Bank AL Habib' },
  { symbol: 'BIPL', name: 'BankIslami Pakistan' },
  { symbol: 'BOK', name: 'The Bank of Khyber' },
  { symbol: 'BOP', name: 'The Bank of Punjab' },
  { symbol: 'FABL', name: 'Faysal Bank' },
  { symbol: 'HBL', name: 'Habib Bank' },
  { symbol: 'HMB', name: 'Habib Metropolitan Bank' },
  { symbol: 'JSBL', name: 'JS Bank' },
  { symbol: 'MCB', name: 'MCB Bank' },
  { symbol: 'MCBIB', name: 'MCB Islamic Bank' },
  { symbol: 'MEBL', name: 'Meezan Bank' },
  { symbol: 'NBP', name: 'National Bank of Pakistan' },
  { symbol: 'RAQAMI', name: 'Raqami Islamic Digital Bank' },
  { symbol: 'SCBPL', name: 'Standard Chartered Bank (Pakistan)' },
  { symbol: 'SNBL', name: 'Soneri Bank' },
  { symbol: 'UBL', name: 'United Bank' },
];

export const bankName = (symbol) => PSX_BANKS.find((b) => b.symbol === symbol)?.name ?? symbol;

/** Banks with their own logo in public/bank-logos/ (UBL shows UBL Ameen as a bank; its share keeps the stock logo). */
export const BANK_LOGOS = ['UBL', 'MCBIB', 'RAQAMI'];
export const bankLogo = (symbol) => (BANK_LOGOS.includes(String(symbol ?? '').toUpperCase()) ? `/bank-logos/${String(symbol).toUpperCase()}.webp` : null);

/** Withholding on bank profit in Pakistan: active filer 20%, non-filer 40%. */
export const SAVINGS_TAX_RATES = [{ value: 0.2, label: '20% filer' }, { value: 0.4, label: '40% non-filer' }];
