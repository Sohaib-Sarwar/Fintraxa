// Financial analysis utilities — ported from Stock Analyzer

/** Graham Number = sqrt(22.5 × EPS × Book Value) */
export function grahamNumber(eps, bv) {
  if (!eps || eps <= 0 || !bv || bv <= 0) return null;
  return Math.sqrt(22.5 * eps * bv);
}

/** PEG Ratio = PE / Earnings Growth Rate */
export function pegRatio(pe, growthRate) {
  if (!pe || pe <= 0 || !growthRate || growthRate <= 0) return null;
  return pe / growthRate;
}

/** Dividend Discount Model = Dividend / (Required Rate - Growth Rate) */
export function ddmValue(price, divYield, growthRate, riskFreeRate = 12) {
  if (!price || !divYield || divYield <= 0) return null;
  const dividend = price * (divYield / 100);
  const reqReturn = riskFreeRate / 100 + 0.04;
  const growth = Math.min(growthRate, 20) / 100;
  if (reqReturn <= growth) return null;
  return dividend / (reqReturn - growth);
}

/** Earnings Power Value = EPS / Risk-Free Rate */
export function epv(eps, riskFreeRate = 12) {
  if (!eps || eps <= 0 || !riskFreeRate) return null;
  return eps / (riskFreeRate / 100);
}

/** Relative PE = Stock PE / Sector Avg PE */
export function relativePE(pe, sectorPE) {
  if (!pe || pe <= 0 || !sectorPE || sectorPE <= 0) return null;
  return pe / sectorPE;
}

/** DuPont ROE decomposition */
export function dupontROE(npm, revGr, roe) {
  if (!npm || !roe) return null;
  return { npm, revGr: revGr || 0, roe, quality: roe > 20 ? 'High' : roe > 12 ? 'Moderate' : 'Low' };
}

/** Dividend Safety Score (0-100) */
export function dividendSafety(divYield, payout, roe, debtToEquity = 0) {
  let score = 100;
  if (payout > 100) score -= 40;
  else if (payout > 80) score -= 25;
  else if (payout > 60) score -= 10;
  if (divYield > 15) score -= 20;
  if (roe < 10) score -= 15;
  if (debtToEquity > 1.0) score -= 15;
  else if (debtToEquity > 0.5) score -= 5;
  if (divYield <= 0) score = 0;
  return Math.max(0, Math.min(100, score));
}

/** Composite Value Score (0-100) */
export function valueScore(stock) {
  let score = 0;
  let factors = 0;
  const { pe, eps, bv, roe, divYield, payout, revGr } = stock;
  const sectorPE = stock.sectorAvgPE || 10;

  const rpe = relativePE(pe, sectorPE);
  if (rpe !== null) {
    if (rpe < 0.5) score += 25;
    else if (rpe < 0.8) score += 20;
    else if (rpe < 1.0) score += 12;
    else if (rpe < 1.2) score += 5;
    factors++;
  }

  const gn = grahamNumber(eps, bv);
  if (gn !== null && stock.price > 0) {
    const gnUpside = (gn - stock.price) / stock.price;
    if (gnUpside > 0.5) score += 20;
    else if (gnUpside > 0.2) score += 15;
    else if (gnUpside > 0) score += 8;
    factors++;
  }

  if (roe > 25) score += 15;
  else if (roe > 15) score += 10;
  else if (roe > 10) score += 5;
  if (roe > 0) factors++;

  if (divYield > 0) {
    const ds = dividendSafety(divYield, payout, roe);
    score += ds * 0.2;
    factors++;
  }

  if (revGr > 20) score += 10;
  else if (revGr > 10) score += 5;
  if (revGr > 0) factors++;

  const peg = pegRatio(pe, revGr);
  if (peg !== null) {
    if (peg < 0.5) score += 15;
    else if (peg < 1.0) score += 10;
    else if (peg < 1.5) score += 5;
    factors++;
  }

  return factors > 0 ? Math.min(100, Math.round(score)) : 0;
}

/** Overall Rating from value score */
export function overallRating(score) {
  if (score >= 80) return { label: 'Strong Buy', color: '#059669' };
  if (score >= 65) return { label: 'Buy', color: '#059669' };
  if (score >= 50) return { label: 'Hold', color: '#d97706' };
  if (score >= 35) return { label: 'Underperform', color: '#dc2626' };
  return { label: 'Avoid', color: '#dc2626' };
}

/** Valuation tag */
export function valuationTag(price, fairPE, isTrap) {
  if (isTrap) return { label: 'TRAP', color: '#dc2626', bg: 'rgba(220,38,38,0.1)' };
  if (!fairPE || fairPE === 0) return { label: 'N/A', color: '#94a3b8', bg: 'rgba(148,163,184,0.1)' };
  const ratio = price / fairPE;
  if (ratio < 0.5) return { label: 'Deep Value', color: '#059669', bg: 'rgba(5,150,105,0.1)' };
  if (ratio < 0.8) return { label: 'Undervalued', color: '#059669', bg: 'rgba(5,150,105,0.1)' };
  if (ratio < 1.1) return { label: 'Fair', color: '#3b82f6', bg: 'rgba(59,130,246,0.1)' };
  if (ratio < 1.3) return { label: 'Overvalued', color: '#f59e0b', bg: 'rgba(245,158,11,0.1)' };
  return { label: 'Expensive', color: '#dc2626', bg: 'rgba(220,38,38,0.1)' };
}
