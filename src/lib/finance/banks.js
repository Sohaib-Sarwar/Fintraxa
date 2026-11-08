/**
 * Commercial banks listed on the Pakistan Stock Exchange, by ticker (the key
 * for their logo in public/stock-logos) with their proper names. Curated by
 * hand: the broad PSX sector map also lists non-banks under Commercial Banks.
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
  { symbol: 'MEBL', name: 'Meezan Bank' },
  { symbol: 'NBP', name: 'National Bank of Pakistan' },
  { symbol: 'SCBPL', name: 'Standard Chartered Bank (Pakistan)' },
  { symbol: 'SNBL', name: 'Soneri Bank' },
  { symbol: 'UBL', name: 'United Bank' },
];

export const bankName = (symbol) => PSX_BANKS.find((b) => b.symbol === symbol)?.name ?? symbol;

/** Withholding on bank profit in Pakistan: active filer 20%, non-filer 40%. */
export const SAVINGS_TAX_RATES = [{ value: 0.2, label: '20% filer' }, { value: 0.4, label: '40% non-filer' }];
