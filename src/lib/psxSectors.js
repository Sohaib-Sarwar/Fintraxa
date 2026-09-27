/**
 * PSX Sector Mapping
 * Maps PSX-listed stock symbols to their respective sectors.
 * Source: Pakistan Stock Exchange official sector classifications.
 * Covers ~200+ most-traded symbols; unmapped symbols return "Other".
 */

export const PSX_SECTORS = {
  'Commercial Banks': [
    'HBL', 'MCB', 'UBL', 'NBP', 'BAHL', 'ABL', 'MEBL', 'BAFL', 'BOP', 'SNBL',
    'AKBL', 'BOK', 'JSBL', 'FABL', 'SILK', 'BIPL', 'SMBL', 'SYNB', 'DIBP', 'FAYSAL',
    'SAPL', 'SCBPL', 'CNERGY',
  ],
  'Cement': [
    'LUCK', 'DGKC', 'MLCF', 'FCCL', 'CHCC', 'PIOC', 'KOHC', 'ACPL', 'GWLC', 'BWCL',
    'DNCC', 'THCCL', 'FLYNG', 'POWER', 'DBYML',
  ],
  'Oil & Gas Exploration': [
    'OGDC', 'PPL', 'POL', 'MARI',
  ],
  'Oil & Gas Marketing': [
    'PSO', 'SHEL', 'APL', 'HASCOL',
  ],
  'Fertilizer': [
    'EFERT', 'ENGRO', 'FFC', 'FFBL', 'FATIMA', 'DAWH',
  ],
  'Power Generation': [
    'HUBC', 'KEL', 'KAPCO', 'NCPL', 'NPL', 'PKGP', 'JPGL', 'KOHE', 'TSPL',
    'EPQL', 'SPWL', 'LALPIR', 'NCPL',
  ],
  'Textile Composite': [
    'NML', 'NCL', 'GATM', 'KTML', 'ILP', 'SCRPL', 'SHSML', 'AICL', 'ANL',
    'CJPL', 'GADT', 'SNAI', 'SAPT', 'RCML', 'HAJT', 'TSML',
  ],
  'Textile Spinning': [
    'KOSM', 'MQTM', 'RUPL', 'DSL', 'YOUW', 'SHDT', 'ADOS', 'BHAT',
    'KSTM', 'HWQS', 'SHSML', 'NAGC',
  ],
  'Textile Weaving': [
    'NRL', 'CTM', 'AZMT',
  ],
  'Automobile Assembler': [
    'INDU', 'PSMC', 'HCAR', 'MTL', 'GHNL', 'SAZEW', 'GHNI',
  ],
  'Automobile Parts': [
    'ATLH', 'GAIL', 'EXIDE', 'LOTCHEM', 'AGIL', 'HINO', 'PREC',
  ],
  'Pharmaceuticals': [
    'SEARL', 'GLAXO', 'AGP', 'HINOON', 'FEROZ', 'ABOT', 'IBLHL', 'MARI',
    'SAPL', 'WYETH', 'SANOFI',
  ],
  'Chemical': [
    'ICI', 'EPCL', 'LOTCHEM', 'DOL', 'BNWM', 'PCAL', 'NRSL', 'BOL',
  ],
  'Food & Personal Care': [
    'NESTLE', 'UNITY', 'TREET', 'UPFL', 'QUICE', 'CLOV', 'MFFL', 'FFL',
    'BUXL', 'MUREB', 'PAKT', 'SNBL', 'ASC', 'OLPL', 'FNEL', 'SHAN',
    'COLG', 'PTC',
  ],
  'Sugar': [
    'AGSML', 'ALNRS', 'CHAS', 'DINT', 'DWSM', 'FRSH', 'HABSM', 'JKSM',
    'JDW', 'MIRKS', 'SHSML', 'TSML', 'SHAHT',
  ],
  'Technology & Communication': [
    'SYS', 'TRG', 'AVN', 'NETSOL', 'PTC', 'TELE', 'AIRLINK',
    'HUMNL', 'OCTOPUS',
  ],
  'Refinery': [
    'NRL', 'ATRL', 'BYCO', 'PRL', 'CNERGY',
  ],
  'Engineering': [
    'ISL', 'AGIL', 'AMTEX', 'EMCO', 'KSBP', 'MUGHAL', 'INIL',
  ],
  'Insurance': [
    'AICL', 'EFUG', 'JSGCL', 'PKGI', 'SLIC', 'TPLI', 'UIC', 'CSAP',
    'AGIAP', 'ATHL',
  ],
  'Modaraba': [
    'FHAM', 'BFMOD', 'FMOD',
  ],
  'Inv. Banks / Securities': [
    'AKD', 'JSIL', 'NEXT', 'ISL', 'NATF', 'BIPL',
  ],
  'Leasing': [
    'OLPL', 'SLCL',
  ],
  'Tobacco': [
    'PMPK', 'KTML',
  ],
  'Paper & Board': [
    'PAEL', 'CPPL', 'CEPB', 'SPL', 'PPPP',
  ],
  'Glass & Ceramics': [
    'GHGL', 'TOMCL', 'SHFA', 'TRCL',
  ],
  'Transport': [
    'PIAC', 'PKGS', 'ASC',
  ],
  'REIT': [
    'DREIT', 'AREIT',
  ],
  'Vanaspati & Allied': [
    'UPFL', 'DALDA',
  ],
  'Leather & Tanneries': [
    'LEUL', 'BTL', 'SLYT',
  ],
  'Cable & Electrical': [
    'PAEL', 'PCAL', 'EMCO', 'JOPP',
  ],
  'Synthetic & Rayon': [
    'ILP', 'GATM', 'IBFL',
  ],
  'Jute': [
    'TAJM',
  ],
  'Woolen': [
    'BWHL',
  ],
  'Miscellaneous': [
    'PGLC', 'PABC', 'WTL', 'THAL', 'PSEL', 'DWAE', 'GTECH', 'HGFA',
    'HPWR', 'STCL',
  ],
  'Closed-End Mutual Fund': [
    'NATF', 'BFCF',
  ],
};

/* ── Build a fast reverse lookup: symbol → sector ── */
const _symbolToSector = {};
Object.entries(PSX_SECTORS).forEach(([sector, symbols]) => {
  symbols.forEach((sym) => {
    // First mapping wins (some symbols may appear in multiple sectors)
    if (!_symbolToSector[sym]) _symbolToSector[sym] = sector;
  });
});

/**
 * Returns the sector of a given PSX stock symbol.
 * @param {string} symbol — e.g. "HBL", "LUCK"
 * @returns {string} sector name, or "Other" if unmapped
 */
export function getStockSector(symbol) {
  if (!symbol) return 'Other';
  return _symbolToSector[symbol.toUpperCase()] || 'Other';
}

/**
 * Returns all unique sector names (sorted, excluding "Other").
 */
export function getAllSectors() {
  return Object.keys(PSX_SECTORS).sort();
}

/**
 * Curated sector color palette — 16 distinct, theme-compatible colors.
 * Used for sector pie charts and distribution bars.
 */
export const SECTOR_COLORS = [
  '#6366f1', // indigo
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#f43f5e', // rose
  '#ef4444', // red
  '#f97316', // orange
  '#eab308', // yellow
  '#84cc16', // lime
  '#22c55e', // green
  '#14b8a6', // teal
  '#06b6d4', // cyan
  '#3b82f6', // blue
  '#6d28d9', // purple deep
  '#a855f7', // purple
  '#d946ef', // fuchsia
  '#78716c', // stone (fallback)
];

/**
 * Returns a color for a given sector index (wraps around).
 */
export function getSectorColor(index) {
  return SECTOR_COLORS[index % SECTOR_COLORS.length];
}
