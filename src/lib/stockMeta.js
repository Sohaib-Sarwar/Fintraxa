import stockMetaData from '../data/stockMeta.json';

const metaMap = stockMetaData.stocks || {};

/**
 * Get the full company name for a stock symbol.
 * Falls back to the API company_name or symbol itself.
 */
export function getStockName(symbol, apiCompanyName) {
  const sym = symbol?.toUpperCase()?.replace(/XD$/, '');
  return metaMap[sym]?.companyName || apiCompanyName || symbol;
}

/**
 * Get the local logo path for a stock symbol.
 * Returns null if no logo is available.
 */
export function getStockLogo(symbol) {
  const sym = symbol?.toUpperCase()?.replace(/XD$/, '');
  return metaMap[sym]?.localLogo || null;
}

/**
 * Get full stock meta: { companyName, logoUrl, localLogo }
 */
export function getStockMeta(symbol) {
  const sym = symbol?.toUpperCase()?.replace(/XD$/, '');
  return metaMap[sym] || null;
}
