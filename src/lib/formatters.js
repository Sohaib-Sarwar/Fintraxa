import { useAppStore, CURRENCIES } from '../store/appStore';

/** Get current currency info */
function getCurrencyInfo() {
  const code = useAppStore.getState().currency;
  return { ...CURRENCIES[code] || CURRENCIES.PKR, code };
}

/** Convert a PKR amount to the user's selected currency using live exchange rates */
function convertFromPKR(amount) {
  const { currency, exchangeRates } = useAppStore.getState();
  if (currency === 'PKR' || !exchangeRates) return amount;
  const rate = exchangeRates[currency]; // 1 unit of currency = rate PKR
  if (!rate || rate === 0) return amount;
  return amount / rate;
}

/** Format number as currency with the user's selected symbol (auto-converts from PKR) */
export function formatCurrency(amount, decimals = 0) {
  if (amount == null || isNaN(amount)) {
    const { symbol } = getCurrencyInfo();
    return `${symbol} 0`;
  }
  const converted = convertFromPKR(Number(amount));
  const { symbol, locale, code } = getCurrencyInfo();
  // Use more decimals for foreign currencies with smaller values
  const effectiveDecimals = code !== 'PKR' && decimals === 0 ? 2 : decimals;
  return `${symbol} ${converted.toLocaleString(locale, {
    minimumFractionDigits: effectiveDecimals,
    maximumFractionDigits: effectiveDecimals,
  })}`;
}

/** Format percentage: +12.34% or -5.67% */
export function formatPercent(value, decimals = 2) {
  if (value == null || isNaN(value)) return '0%';
  const num = Number(value);
  const sign = num > 0 ? '+' : '';
  return `${sign}${num.toFixed(decimals)}%`;
}

/** Format number with commas */
export function formatNumber(num, decimals = 2) {
  if (num == null || isNaN(num)) return '0';
  return Number(num).toLocaleString('en-PK', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/** Get color based on profit/loss */
export function getPnLColor(value) {
  if (value > 0) return '#16a34a';
  if (value < 0) return '#dc2626';
  return '#64748b';
}

/**
 * Calculate PSX broker commission per share based on share price.
 * - Up to Rs 4.99: Re 0.03 per share
 * - Rs 5.00 – Rs 99.99: Re 0.05 or 0.15% of share value, whichever is higher
 * - Rs 100.00 and above: Re 0.05 or 0.15% of share value, whichever is higher
 *
 * Returns total fee for the given price × quantity.
 */
export function calcBrokerFee(pricePerShare, quantity) {
  const p = Number(pricePerShare) || 0;
  const q = Number(quantity) || 0;
  if (p <= 0 || q <= 0) return 0;

  let feePerShare;
  if (p <= 4.99) {
    feePerShare = 0.03;
  } else {
    // Rs 5.00+ : Re 0.05 or 0.15% of share value, whichever is higher
    feePerShare = Math.max(0.05, p * 0.0015);
  }
  return Math.round(feePerShare * q * 100) / 100; // round to 2 decimals
}

/**
 * Shorten a mutual fund name into an abbreviation.
 * "Al Meezan Mutual Fund" → "AMMF"
 * Strips common suffixes (Fund, Plan, Class, etc.) and takes initials.
 */
export function shortFundName(name) {
  if (!name) return '??';
  const words = name
    .replace(/[-–—()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
  if (words.length === 0) return '??';
  if (words.length === 1) return words[0].slice(0, 4).toUpperCase();
  return words.map((w) => w[0]).join('').toUpperCase().slice(0, 5);
}

/** Format date as readable string */
export function formatDate(date) {
  return new Date(date).toLocaleDateString('en-PK', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/** Get month name */
export function getMonthName(date) {
  return new Date(date).toLocaleDateString('en-PK', {
    month: 'long',
    year: 'numeric',
  });
}
