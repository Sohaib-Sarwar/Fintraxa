// PSX Research Database — extracted from Stock Analyzer (March 2026)

export const MACRO = {
  kse100: 151708,
  kse100_change: -0.68,
  forward_pe: 6.4,
  pib_5yr: 12.5,
  target_2026: 203000,
  date: 'March 29, 2026',
};

export const SECTORS = {
  commercial_banks: {
    name: 'Commercial Banks', sector_avg_pe: 6.5, sector_avg_div_yield: 8.5,
    outlook: 'Positive — Forward P/E 6.4x makes valuations attractive. High interest rates boost NIMs. Top picks: MEBL, HBL, UBL.',
    stocks: [
      { id:'MCB', symbol:'MCB', name:'MCB Bank Limited', price:361, mcap:'434B', pe:7.4, divYield:9.83, chg1y:30.53, eps:48.78, bv:310, roe:28, npm:43, revGr:8, payout:73, fvPE:435, fvBV:434, fvDDM:462, support:330, resistance:390, ma50:360, ma200:310, buyLow:330, buyHigh:355, analysis:'Graham Number Rs 463 vs price Rs 361 = 22% below intrinsic value. 5yr dividend CAGR 29.2%. DuPont ROE 28% driven by 43% net margin. Quarterly Rs 9/share. 5/5 analysts Strong Buy.' },
      { id:'MEBL', symbol:'MEBL', name:'Meezan Bank Limited', price:447, mcap:'824B', pe:9.26, divYield:6.3, chg1y:85.07, eps:48.27, bv:220, roe:30, npm:35, revGr:25, payout:55, fvPE:510, fvBV:440, fvDDM:530, support:400, resistance:490, ma50:440, ma200:350, buyLow:400, buyHigh:430, analysis:'61% 3yr dividend CAGR. Yield-on-cost becomes 17.2% in 3 years. ROE 30%. Islamic structural moat. Best growth story in banking.' },
      { id:'UBL', symbol:'UBL', name:'United Bank Limited', price:365, mcap:'863B', pe:6.6, divYield:8.56, chg1y:67.66, eps:55.30, bv:280, roe:27, npm:38.5, revGr:12, payout:57, fvPE:445, fvBV:392, fvDDM:460, support:330, resistance:375, ma50:335, ma200:290, buyLow:330, buyHigh:355, analysis:'EPS Rs 55+ (sector best). UAE income = PKR hedge. 33.5% total return potential (8.56% yield + 25% capital). Top-tier pick.' },
      { id:'SCBPL', symbol:'SCBPL', name:'Standard Chartered PK', price:68, mcap:'240B', pe:6.5, divYield:10.49, chg1y:8.79, eps:10.46, bv:48, roe:38.9, npm:32, revGr:5, payout:87, fvPE:76, fvBV:67, fvDDM:80, support:61, resistance:72, ma50:65, ma200:58, buyLow:61, buyHigh:67, analysis:'FCF yield 24.7% — dividend covered 2.36x by free cash flow. ROE 38.9% = highest in all PSX banking. Beta 0.34. London parent backstop.' },
      { id:'HBL', symbol:'HBL', name:'Habib Bank Limited', price:279, mcap:'371B', pe:5.6, divYield:7.91, chg1y:65.52, eps:49.82, bv:290, roe:22, npm:30, revGr:15, payout:46, fvPE:345, fvBV:406, fvDDM:360, support:255, resistance:305, ma50:275, ma200:230, buyLow:255, buyHigh:278, atBuyZone:true, analysis:'25% below ATH. 54% retained at 22% ROE = fastest book value growth in banking. Low payout suggests room for dividend hikes.' },
      { id:'HMB', symbol:'HMB', name:'Habib Metropolitan Bank', price:114, mcap:'112B', pe:4.9, divYield:11.24, chg1y:18.59, eps:23.27, bv:110, roe:16, npm:36, revGr:8, payout:55, fvPE:142, fvBV:154, fvDDM:150, support:100, resistance:120, ma50:110, ma200:95, buyLow:100, buyHigh:112, analysis:'Earnings yield 20.4% covers 11.24% dividend yield 1.82x. Cheapest quality bank on PE. Conservative Habib Group culture.' },
      { id:'ABL', symbol:'ABL', name:'Allied Bank Limited', price:171, mcap:'195B', pe:5.4, divYield:9.37, chg1y:27.27, eps:31.67, bv:195, roe:19, npm:35, revGr:10, payout:50, fvPE:210, fvBV:273, fvDDM:220, support:155, resistance:185, ma50:168, ma200:145, buyLow:155, buyHigh:168, analysis:'Trading below book value (0.88x P/BV). Strong ROE with low payout ratio. Significant upside potential with high dividend.' },
      { id:'BAHL', symbol:'BAHL', name:'Bank AL Habib Limited', price:153, mcap:'170B', pe:5.2, divYield:9.81, chg1y:7.43, eps:29.42, bv:155, roe:19, npm:33, revGr:10, payout:52, fvPE:190, fvBV:217, fvDDM:200, support:140, resistance:168, ma50:152, ma200:145, buyLow:140, buyHigh:152, analysis:'52% payout = highest headroom. Beta 0.48. Boring but reliable. Only 7.43% 1Y return vs peers = catch-up potential.' },
      { id:'BAFL', symbol:'BAFL', name:'Bank Alfalah Limited', price:115, mcap:'170B', pe:6.1, divYield:9.73, chg1y:47.55, eps:18.85, bv:80, roe:14, npm:28, revGr:18, payout:59, fvPE:142, fvBV:112, fvDDM:150, support:103, resistance:125, ma50:110, ma200:85, buyLow:103, buyHigh:112, analysis:'High ROE with strong growth. 9.73% yield is very attractive. Good balance of growth + income.' },
      { id:'AKBL', symbol:'AKBL', name:'Askari Bank Limited', price:81, mcap:'116B', pe:5.1, divYield:5.0, chg1y:105.58, eps:15.88, bv:75, roe:17, npm:24, revGr:30, payout:26, fvPE:118, fvBV:105, fvDDM:95, support:72, resistance:90, ma50:78, ma200:55, buyLow:72, buyHigh:80, analysis:'Army franchise 700K+ accounts = non-replicable moat. At MCBs PE = Rs 118 (+46% from PE convergence alone).' },
      { id:'FABL', symbol:'FABL', name:'Faysal Bank Limited', price:81, mcap:'126B', pe:5.8, divYield:7.82, chg1y:73.02, eps:13.97, bv:62, roe:12, npm:26, revGr:22, payout:46, fvPE:105, fvBV:87, fvDDM:115, support:72, resistance:90, ma50:81, ma200:60, buyLow:72, buyHigh:80, analysis:'59.7% PE re-rating potential vs MEBL if Islamic conversion matures. ROE 12 to 20% trajectory.' },
      { id:'BOP', symbol:'BOP', name:'Bank of Punjab', price:28, mcap:'84B', pe:5.3, divYield:9.7, chg1y:138.17, eps:5.28, bv:22, roe:8, npm:22, revGr:35, payout:53, fvPE:48, fvBV:31, fvDDM:55, support:24, resistance:32, ma50:26, ma200:16, buyLow:24, buyHigh:27, analysis:'+138% 1Y = turnaround confirmed. Rs 90B mkt cap for Punjabs largest bank franchise. ROE 8 to 16% target = stock doubles.' },
      { id:'NBP', symbol:'NBP', name:'National Bank of Pakistan', price:244, mcap:'359B', pe:4.2, divYield:20.76, chg1y:120.95, eps:58.10, bv:185, roe:6, npm:25, revGr:20, payout:87, fvPE:0, fvBV:0, fvDDM:0, support:0, resistance:0, ma50:0, ma200:0, isTrap:true, analysis:'TRAP — DO NOT BUY. Payout 87% with only 6% ROE. Government bank with structural governance issues. Dividend is unsustainable.' },
    ],
  },
  fertilizer: {
    name: 'Fertilizer', sector_avg_pe: 10.0, sector_avg_div_yield: 5.5,
    outlook: 'Stable — Essential sector with inelastic demand. Government subsidies support pricing. FFC is core holding with 3.16x FCF coverage.',
    stocks: [
      { id:'FFC', symbol:'FFC', name:'Fauji Fertilizer Company', price:498, mcap:'717B', pe:9.64, divYield:9.93, chg1y:34.80, eps:51.66, bv:120, roe:35, npm:25, revGr:17.6, payout:63, fvPE:620, fvBV:168, fvDDM:650, support:460, resistance:530, ma50:495, ma200:420, buyLow:460, buyHigh:490, analysis:'FCF Rs 101B / Dividends Rs 32B = 3.16x coverage. EV/EBITDA 5.38x vs global peers 8-12x = 40-55% discount. 8/8 Strong Buy. Revenue +17.6%.' },
      { id:'FATIMA', symbol:'FATIMA', name:'Fatima Fertilizer', price:150, mcap:'281B', pe:7.24, divYield:5.27, chg1y:55.62, eps:20.72, bv:48, roe:28, npm:20, revGr:15, payout:28, fvPE:199, fvBV:67, fvDDM:230, support:135, resistance:168, ma50:145, ma200:105, buyLow:135, buyHigh:148, analysis:'Beta 0.14 = PSX most stable stock. Net cash Rs +6.76B = dividend self-funded. ROIC 20.51% > WACC 12%. Analyst target PKR 168-230.' },
      { id:'EFERT', symbol:'EFERT', name:'Engro Fertilizers', price:217, mcap:'264B', pe:11.67, divYield:6.9, chg1y:-4.74, eps:18.59, bv:55, roe:54, npm:22, revGr:5, payout:103, fvPE:0, fvBV:0, fvDDM:0, support:0, resistance:0, ma50:0, ma200:0, isTrap:true, analysis:'TRAP — AVOID. Payout 103% with negative FCF of -13.2B means every dividend is funded by debt. ROE 54% is leverage illusion. Yield will disappear.' },
    ],
  },
  oil_gas: {
    name: 'Oil & Gas Exploration', sector_avg_pe: 7.0, sector_avg_div_yield: 5.5,
    outlook: 'Positive — Gas deregulation, new exploration licenses. OGDC has unpriced Baragzai X-01 discovery. PPL 78% earnings retained for exploration.',
    stocks: [
      { id:'POL', symbol:'POL', name:'Pakistan Oilfields Ltd.', price:623, mcap:'178B', pe:7.1, divYield:12.36, chg1y:10.62, eps:87.75, bv:420, roe:21.6, npm:45, revGr:6, payout:93, fvPE:715, fvBV:588, fvDDM:750, support:580, resistance:660, ma50:620, ma200:590, buyLow:580, buyHigh:615, analysis:'EBITDA margin 55% — world class. Survived every oil crash since 2016 without cutting dividend. Zero debt. Dividend King.' },
      { id:'OGDC', symbol:'OGDC', name:'Oil & Gas Dev. Co.', price:276, mcap:'1.1T', pe:7.4, divYield:5.63, chg1y:14.13, eps:37.30, bv:240, roe:16.2, npm:35, revGr:8, payout:38, fvPE:372, fvBV:336, fvDDM:394, support:255, resistance:305, ma50:270, ma200:245, buyLow:255, buyHigh:278, atBuyZone:true, analysis:'Analyst avg 12M target PKR 394 (high PKR 522). Ascending channel bottom Rs 258-275. Baragzai X-01 discovery unpriced. 38% safe payout.' },
      { id:'PPL', symbol:'PPL', name:'Pakistan Petroleum Ltd.', price:210, mcap:'557B', pe:6.86, divYield:3.18, chg1y:6.89, eps:30.61, bv:175, roe:17.1, npm:32, revGr:10, payout:22, fvPE:290, fvBV:245, fvDDM:310, support:195, resistance:225, ma50:205, ma200:195, buyLow:195, buyHigh:210, analysis:'78% earnings retained for exploration. 38% analyst upside. Strong balance sheet near zero debt. Growth + modest dividend.' },
      { id:'MARI', symbol:'MARI', name:'Mari Petroleum Company', price:608, mcap:'742B', pe:11.9, divYield:4.19, chg1y:-9.68, eps:51.09, bv:385, roe:13.5, npm:40, revGr:5, payout:50, fvPE:685, fvBV:539, fvDDM:720, support:580, resistance:660, ma50:615, ma200:650, buyLow:580, buyHigh:600, analysis:'Premium valuation for premium assets. Largest gas field operator. 46% EBITDA margin. Below 200-DMA = potential entry near support.' },
    ],
  },
  cement: {
    name: 'Cement', sector_avg_pe: 10.5, sector_avg_div_yield: 2.0,
    outlook: 'Positive — CPEC phase 2, housing boom. FCCL Cup-and-Handle breakout targets Rs 57-60. LUCK earnings Rs 22.62B in Q3.',
    stocks: [
      { id:'LUCK', symbol:'LUCK', name:'Lucky Cement Limited', price:366, mcap:'531B', pe:6.5, divYield:1.1, chg1y:21.04, eps:56.31, bv:350, roe:16.1, npm:15, revGr:15, payout:8, fvPE:555, fvBV:490, fvDDM:0, support:330, resistance:470, ma50:360, ma200:320, buyLow:330, buyHigh:360, analysis:'Topline 2026 #1 pick. 61% analyst upside. 6 segments. Kia EV. 92% earnings reinvested. Breakout above Rs 470 targets Rs 550-600.' },
      { id:'CHCC', symbol:'CHCC', name:'Cherat Cement Company', price:252, mcap:'49B', pe:6.4, divYield:2.18, chg1y:0.82, eps:39.38, bv:210, roe:18.7, npm:19, revGr:10, payout:12, fvPE:360, fvBV:294, fvDDM:390, support:225, resistance:275, ma50:250, ma200:250, buyLow:225, buyHigh:250, analysis:'EBITDA 36.9% = sector best. ACPL acquisition doubles capacity. 35% below ATH. Solar reduces #1 cost input.' },
      { id:'FCCL', symbol:'FCCL', name:'Fauji Cement Company', price:40, mcap:'99B', pe:7.4, divYield:3.11, chg1y:-13.47, eps:5.41, bv:22, roe:22.0, npm:15, revGr:18, payout:23, fvPE:73, fvBV:31, fvDDM:88, support:35, resistance:58, ma50:40, ma200:43, buyLow:35, buyHigh:40, atBuyZone:true, analysis:'Earnings +62% while price -13% = most extreme positive divergence on PSX. MSCI Frontier inclusion. Cup-and-Handle target Rs 57-88. 78-120% analyst upside.' },
      { id:'BWCL', symbol:'BWCL', name:'Bestway Cement Limited', price:442, mcap:'265B', pe:11.3, divYield:8.57, chg1y:15.51, eps:39.12, bv:380, roe:10.4, npm:18, revGr:12, payout:97, fvPE:480, fvBV:532, fvDDM:500, support:415, resistance:470, ma50:440, ma200:400, buyLow:415, buyHigh:438, analysis:'Second largest cement producer. 8.57% yield but 97% payout is near limit. Low liquidity but fundamentally sound.' },
    ],
  },
  pharmaceuticals: {
    name: 'Pharmaceuticals', sector_avg_pe: 14.0, sector_avg_div_yield: 3.5,
    outlook: 'Positive — Healthcare spending growth, deregulation permanent, aging demographics. GLAXO +339% profit growth.',
    stocks: [
      { id:'HINOON', symbol:'HINOON', name:'Highnoon Laboratories', price:857, mcap:'90B', pe:12.9, divYield:4.7, chg1y:15, eps:66.43, bv:260, roe:25.5, npm:16, revGr:18, payout:61, fvPE:1025, fvBV:364, fvDDM:1100, support:790, resistance:950, ma50:845, ma200:750, buyLow:790, buyHigh:840, analysis:'14yr consecutive dividend growth at 33%/yr CAGR. Current 4.7% becomes 19.2% yield-on-cost in 5yr. Gross margin 51.4%.' },
      { id:'ABOT', symbol:'ABOT', name:'Abbott Laboratories PK', price:852, mcap:'89B', pe:11.18, divYield:3.81, chg1y:-17.31, eps:76.21, bv:310, roe:28, npm:14, revGr:12, payout:43, fvPE:1005, fvBV:434, fvDDM:1050, support:790, resistance:960, ma50:850, ma200:1000, buyLow:790, buyHigh:840, analysis:'Profit +20x YoY recovery. Abbott USA pipeline. 28% ROE. Below 200-DMA presents buying opportunity.' },
      { id:'GLAXO', symbol:'GLAXO', name:'GlaxoSmithKline Pakistan', price:325, mcap:'102B', pe:10.17, divYield:4.36, chg1y:-23.50, eps:31.96, bv:120, roe:30, npm:12, revGr:10, payout:44, fvPE:490, fvBV:168, fvDDM:550, support:295, resistance:350, ma50:318, ma200:370, buyLow:295, buyHigh:320, atBuyZone:true, analysis:'Profit +12.2x, 32% below ATH, deregulation permanent, ROE 30%, ascending triangle. Topline Alpha 2026. Analyst target Rs 430-550.' },
      { id:'AGP', symbol:'AGP', name:'AGP Limited', price:179, mcap:'50B', pe:21.35, divYield:3.94, chg1y:-5.34, eps:8.38, bv:55, roe:15.3, npm:15, revGr:75, payout:84, fvPE:225, fvBV:77, fvDDM:250, support:160, resistance:200, ma50:179, ma200:185, buyLow:160, buyHigh:175, analysis:'Forward PE ~12x, EPS +75%, 47.8% gross margin, specialty brand moat. Growth re-rating candidate.' },
    ],
  },
  power: {
    name: 'Power Generation', sector_avg_pe: 8.0, sector_avg_div_yield: 6.0,
    outlook: 'Mixed — Circular debt overhang, but take-or-pay contracts guarantee revenue. IMF forces resolution. HUBC at buy zone with bullish divergence.',
    stocks: [
      { id:'HUBC', symbol:'HUBC', name:'Hub Power Company', price:199, mcap:'256B', pe:5.7, divYield:10.57, chg1y:34.60, eps:34.91, bv:80, roe:19.4, npm:12, revGr:10, payout:42, fvPE:295, fvBV:112, fvDDM:320, support:190, resistance:245, ma50:195, ma200:170, buyLow:190, buyHigh:210, atBuyZone:true, analysis:'10.57% yield on only 42% payout — the payout paradox. Govt take-or-pay = guaranteed revenue. EBITDA 48.6%. 20% below ATH with bullish divergence.' },
      { id:'NCPL', symbol:'NCPL', name:'Nishat Chunian Power', price:65, mcap:'15B', pe:3.5, divYield:7.0, chg1y:12, eps:18.57, bv:65, roe:15, npm:18, revGr:8, payout:25, fvPE:110, fvBV:91, fvDDM:130, support:58, resistance:80, ma50:63, ma200:55, buyLow:58, buyHigh:65, atBuyZone:true, analysis:'PE 3.5x, P/B 1.0x for a 45% EBITDA business = maximum fundamental undervaluation. IMF forces circular debt resolution. Arif Habib FY28E yield 10.1%.' },
      { id:'KAPCO', symbol:'KAPCO', name:'Kot Addu Power Company', price:271, mcap:'58B', pe:6.6, divYield:14.99, chg1y:5, eps:41.06, bv:120, roe:12, npm:10, revGr:2, payout:249, fvPE:0, fvBV:0, fvDDM:0, support:0, resistance:0, ma50:0, ma200:0, isTrap:true, analysis:'TRAP — AVOID. Payout 249% with 12% EBITDA. Every dividend rupee is funded by capital destruction. Yield will collapse.' },
    ],
  },
  automobile: {
    name: 'Automobile Assembler', sector_avg_pe: 12.0, sector_avg_div_yield: 4.0,
    outlook: 'Cyclical recovery — Auto sales rebounding. SAZEW is Pakistans ONLY PHEV assembler. Tank 500 launch creates unpriced earnings.',
    stocks: [
      { id:'SAZEW', symbol:'SAZEW', name:'Sazgar Engineering (BAIC)', price:1692, mcap:'45B', pe:5.6, divYield:3.97, chg1y:40, eps:302.14, bv:530, roe:32, npm:12, revGr:45, payout:22, fvPE:2261, fvBV:742, fvDDM:2523, support:1550, resistance:2000, ma50:1680, ma200:1400, buyLow:1550, buyHigh:1680, atBuyZone:true, analysis:'PEG 0.19 (deeply undervalued growth). Pakistans ONLY PHEV assembler. Tank 500 launch Jan 2026. 7/8 Strong Buy. AKD weekly laggard = entry signal.' },
      { id:'INDU', symbol:'INDU', name:'Indus Motor (Toyota)', price:1820, mcap:'142B', pe:5.5, divYield:10.94, chg1y:-12.79, eps:330.91, bv:1200, roe:30, npm:8, revGr:-5, payout:60, fvPE:2100, fvBV:1680, fvDDM:2200, support:1700, resistance:2000, ma50:1800, ma200:1900, buyLow:1700, buyHigh:1800, analysis:'10.94% yield, 30% ROE, Beta 0.46, revenue +41% (recent quarter). Toyota franchise monopoly. Deep value + high income.' },
      { id:'ATLH', symbol:'ATLH', name:'Atlas Honda Limited', price:1512, mcap:'182B', pe:9.18, divYield:5.94, chg1y:55.71, eps:164.71, bv:520, roe:27, npm:10, revGr:20, payout:60, fvPE:1875, fvBV:728, fvDDM:1950, support:1400, resistance:1550, ma50:1500, ma200:1150, buyLow:1400, buyHigh:1490, analysis:'85% motorcycle market share moat. EV scooter first-mover. 22% below ATH. Strong growth with good dividend.' },
    ],
  },
  food_care: {
    name: 'Food & Personal Care', sector_avg_pe: 22.0, sector_avg_div_yield: 5.0,
    outlook: 'Defensive — Consumer staples with pricing power. NATF PE 3.2x with 28% ROE is PSXs most extreme valuation anomaly.',
    stocks: [
      { id:'NATF', symbol:'NATF', name:'National Foods Limited', price:347, mcap:'80B', pe:3.2, divYield:8.21, chg1y:58.57, eps:108.44, bv:85, roe:28, npm:8, revGr:18, payout:26, fvPE:750, fvBV:119, fvDDM:900, support:310, resistance:400, ma50:340, ma200:275, buyLow:310, buyHigh:345, atBuyZone:true, analysis:'PE 3.2x with 28% ROE and 8.21% yield on 26% payout = PSX most extreme value anomaly. Magic Formula #1. Earnings yield 31.3% covers div 3.8x.' },
      { id:'NESTLE', symbol:'NESTLE', name:'Nestle Pakistan', price:7821, mcap:'351B', pe:20.38, divYield:7.0, chg1y:5.03, eps:383.76, bv:850, roe:100, npm:12, revGr:8, payout:143, fvPE:8750, fvBV:1190, fvDDM:9000, support:7200, resistance:8500, ma50:7700, ma200:7500, buyLow:7200, buyHigh:7700, analysis:'ROE >100% capital-light model. Swiss parent brand pipeline. Non-cyclical safe haven. 7% yield with 143% payout (returning excess capital).' },
      { id:'PAKT', symbol:'PAKT', name:'Pakistan Tobacco Company', price:1276, mcap:'120B', pe:10.7, divYield:12.0, chg1y:8, eps:119.25, bv:350, roe:100, npm:25, revGr:10, payout:128, fvPE:1425, fvBV:490, fvDDM:1500, support:1180, resistance:1350, ma50:1270, ma200:1200, buyLow:1180, buyHigh:1260, analysis:'12% yield, EBITDA 61% monopoly, BAT parent. Defensive income with pricing power.' },
      { id:'COLG', symbol:'COLG', name:'Colgate Palmolive PK', price:1112, mcap:'262B', pe:15, divYield:4.61, chg1y:-24.75, eps:74.13, bv:180, roe:66, npm:15, revGr:10, payout:69, fvPE:1511, fvBV:252, fvDDM:1623, support:1020, resistance:1200, ma50:1100, ma200:1250, buyLow:1020, buyHigh:1100, analysis:'ROE 66%, 1yr -24% mean reversion, 46% upside to ATH. MNC brand at rare discount. Analyst target Rs 1,400-1,623.' },
      { id:'UPFL', symbol:'UPFL', name:'Unilever Pakistan Foods', price:25000, mcap:'157B', pe:26.3, divYield:5.7, chg1y:6.87, eps:950.57, bv:2800, roe:100, npm:10, revGr:5, payout:150, fvPE:0, fvBV:3920, fvDDM:0, support:23000, resistance:26500, ma50:24500, ma200:23800, buyLow:23000, buyHigh:24500, analysis:'Category monopolies, take-private optionality. Ultra-premium brand portfolio. Accumulate on dips.' },
    ],
  },
  real_estate: {
    name: 'Real Estate (REIT)', sector_avg_pe: 10.0, sector_avg_div_yield: 6.5,
    outlook: "Positive — Pakistan's first and only listed REIT. Dolmen Mall Harbour Front + Clifton = premium Karachi retail. 90% mandatory income distribution. Rental escalation clauses provide built-in inflation hedge.",
    stocks: [
      { id:'DCR', symbol:'DCR', name:'Dolmen City REIT', price:35.75, mcap:'79.5B', pe:10.0, divYield:6.6, chg1y:55.5, eps:3.59, bv:20, roe:18, npm:132, revGr:10, payout:66, fvPE:45, fvBV:28, fvDDM:50, support:32, resistance:40, ma50:35, ma200:33, buyLow:32, buyHigh:35, analysis:"Pakistan's only listed REIT. Owns Dolmen Mall Harbour Front (Karachi's #1 mall) + Dolmen Mall Clifton. 90% mandatory payout. 6.6% yield on 66% payout = well-covered. Rental escalation = inflation hedge." },
    ],
  },
};

export const BUCKETS = {
  dividend: {
    name: 'Dividend Only',
    subtitle: 'Blended Yield ~10.3%',
    description: 'DDM + Graham Number + FCF Coverage Ratio. Every stock must have 5+ years of unbroken payment history, positive FCF covering dividend >1.5x, beta <1.0, and payout <88%.',
    criteria: [
      'Dividend yield above 6% with 5yr+ history',
      'FCF covers dividend >1.5x',
      'Payout ratio below 88% (sustainable)',
      'Beta below 1.0 (low volatility)',
      'No government banks (NBP excluded)',
    ],
    stocks: [
      { id:'FFC', sector:'Fertilizer', weight:14.3, logic:'FCF Rs 101B / Dividends Rs 32B = 3.16x coverage. EV/EBITDA 5.38x vs global peers 8-12x. 8/8 Strong Buy.' },
      { id:'POL', sector:'Oil & Gas', weight:12.0, logic:'EBITDA margin 55% — world class. Survived every oil crash without cutting dividend. Zero debt. Dividend King.' },
      { id:'MCB', sector:'Banks', weight:9.8, logic:'Graham Number Rs 463 vs price Rs 361 = 22% below intrinsic value. 5yr dividend CAGR 29.2%. DuPont ROE 28%.' },
      { id:'SCBPL', sector:'Banks', weight:8.4, logic:'FCF yield 24.7% — dividend covered 2.36x. ROE 38.9% = highest in PSX banking. Beta 0.34.' },
      { id:'OGDC', sector:'Oil & Gas', weight:8.0, logic:'38% safe payout. 43% analyst upside. Unpriced Baragzai X-01 discovery. Buy zone.' },
      { id:'FATIMA', sector:'Fertilizer', weight:7.7, logic:'Beta 0.14 = PSX most stable stock. Net cash Rs +6.76B. ROIC 20.51% > WACC 12%.' },
      { id:'NATF', sector:'Food & Care', weight:6.6, logic:'PE 3.2x with 28% ROE and 8.21% yield on 26% payout = extreme value anomaly.' },
      { id:'HMB', sector:'Banks', weight:5.6, logic:'Earnings yield 20.4% covers 11.24% yield 1.82x. Cheapest quality bank on PE.' },
      { id:'NESTLE', sector:'Food & Care', weight:5.4, logic:'ROE >100% capital-light model. Swiss parent brand pipeline. Non-cyclical safe haven.' },
      { id:'BAHL', sector:'Banks', weight:4.2, logic:'52% payout = highest headroom. Beta 0.48. Boring but reliable.' },
      { id:'HUBC', sector:'Power', weight:18.0, logic:'10.57% yield on only 42% payout — payout paradox. Govt take-or-pay = guaranteed revenue.' },
    ],
  },
  hybrid: {
    name: 'Dividend + Growth',
    subtitle: 'Blended ~8% Yield + Growth Upside',
    description: 'Best-in-class stocks from each of 8 sectors, weighted for 7-10% portfolio dividend yield with strong capital appreciation.',
    criteria: [
      'Top-tier stock from each of 8 sectors',
      'Portfolio blended dividend yield 7-10%',
      'No traps — payout and governance screened',
      'Growth catalysts with specific timelines',
      'Balanced sector exposure across PSX',
    ],
    stocks: [
      { id:'FFC', sector:'Fertilizer', weight:12.0, logic:'FCF 3.16x coverage. EV/EBITDA 5.38x. 8/8 Strong Buy. 9.93% yield anchors income.' },
      { id:'POL', sector:'Oil & Gas', weight:10.0, logic:'55% EBITDA margin, zero debt, 12.36% yield. Dividend King.' },
      { id:'HUBC', sector:'Power', weight:10.0, logic:'10.57% yield on 42% payout. Govt take-or-pay. At buy zone.' },
      { id:'NATF', sector:'Food & Care', weight:10.0, logic:'PE 3.2x with 28% ROE. Magic Formula #1. Extreme value anomaly.' },
      { id:'MCB', sector:'Banks', weight:8.0, logic:'Graham Number Rs 463 vs Rs 361 = 22% below intrinsic value.' },
      { id:'UBL', sector:'Banks', weight:7.0, logic:'EPS Rs 55+ sector best. 8.56% yield. UAE income = PKR hedge.' },
      { id:'NCPL', sector:'Power', weight:6.0, logic:'PE 3.5x for 45% EBITDA business. IMF forces circular debt resolution.' },
      { id:'MEBL', sector:'Banks', weight:5.0, logic:'ROE 30%, Islamic moat, 61% dividend CAGR.' },
      { id:'BOP', sector:'Banks', weight:5.0, logic:'+138% 1Y turnaround confirmed. 9.7% yield.' },
      { id:'SAZEW', sector:'Automobile', weight:5.0, logic:'PEG 0.19. Pakistans ONLY PHEV assembler.' },
      { id:'FATIMA', sector:'Fertilizer', weight:7.0, logic:'Beta 0.14 = PSX most stable. Net cash Rs 6.76B.' },
      { id:'FCCL', sector:'Cement', weight:4.0, logic:'Earnings +62% while price -13%. MSCI Frontier inclusion.' },
      { id:'LUCK', sector:'Cement', weight:3.0, logic:'Topline 2026 #1 pick. 61% analyst upside. Kia EV.' },
      { id:'GLAXO', sector:'Pharmaceuticals', weight:5.0, logic:'Profit +12.2x recovery. 32% below ATH. ROE 30%.' },
      { id:'PPL', sector:'Oil & Gas', weight:3.0, logic:'78% earnings retained. 38% analyst upside. Near zero debt.' },
      { id:'DCR', sector:'Real Estate', weight:4.0, logic:"Pakistan's only listed REIT. 6.6% yield. 90% mandatory payout." },
    ],
  },
  growth: {
    name: 'Growth & Undervalued',
    subtitle: 'Target 50-150% in 5 Years',
    description: 'EPV + PEG Ratio + Turnaround ROE Trajectory + Price-Earnings Divergence Trade. All positions need a specific catalyst with clear timeline.',
    criteria: [
      'PEG ratio < 1.0 or Relative PE < 0.7',
      'Specific catalyst with timeline',
      'ROE trajectory improving',
      'Price significantly below fair value',
      'MSCI/institutional buying potential',
    ],
    stocks: [
      { id:'SAZEW', sector:'Automobile', weight:25.0, logic:'PEG 0.19. Pakistans ONLY PHEV assembler. At buy zone Rs 1,550-1,680.' },
      { id:'GLAXO', sector:'Pharmaceuticals', weight:14.0, logic:'Profit +12.2x, 32% below ATH. ROE 30%. Topline Alpha 2026.' },
      { id:'NCPL', sector:'Power', weight:15.0, logic:'PE 3.5x, P/B 1.0x. IMF forces circular debt resolution.' },
      { id:'AKBL', sector:'Banks', weight:8.0, logic:'Army franchise 700K+ accounts. PE convergence to MCB = +46%.' },
      { id:'FCCL', sector:'Cement', weight:7.0, logic:'Earnings +62% while price -13%. MSCI Frontier. Cup-and-Handle.' },
      { id:'CHCC', sector:'Cement', weight:7.0, logic:'EBITDA 36.9% = sector best. ACPL acquisition doubles capacity.' },
      { id:'FABL', sector:'Banks', weight:7.0, logic:'59.7% PE re-rating potential vs MEBL. ROE 12% to 20%.' },
      { id:'LUCK', sector:'Cement', weight:6.0, logic:'Topline 2026 #1 pick. 61% analyst upside. 6 segments.' },
      { id:'AGP', sector:'Pharmaceuticals', weight:6.0, logic:'Forward PE ~12x, EPS +75%, 47.8% gross margin.' },
      { id:'BOP', sector:'Banks', weight:5.0, logic:'+138% 1Y confirmed. Punjab largest bank. ROE 8 to 16%.' },
    ],
  },
};

export const AT_BUY_ZONE = [
  { id:'HUBC', price:199, buyZone:'190-210', fair:'270-320', concept:'Channel support + bullish divergence' },
  { id:'FCCL', price:40, buyZone:'35-40', fair:'58-88', concept:'Cup-and-Handle base' },
  { id:'GLAXO', price:325, buyZone:'295-320', fair:'430-550', concept:'Ascending triangle support' },
  { id:'NCPL', price:65, buyZone:'58-65', fair:'90-130', concept:'P/B 1.0x distressed value' },
  { id:'SAZEW', price:1692, buyZone:'1,550-1,680', fair:'2,000-2,523', concept:'Weekly laggard = buy signal' },
  { id:'OGDC', price:276, buyZone:'255-278', fair:'350-394', concept:'Ascending channel bottom' },
  { id:'HBL', price:279, buyZone:'255-278', fair:'330-360', concept:'25% below ATH' },
  { id:'NATF', price:347, buyZone:'310-345', fair:'600-900', concept:'Extreme value anomaly' },
];

/** Flat lookup: symbol → stock object */
export function getResearchStock(symbol) {
  for (const sec of Object.values(SECTORS)) {
    const found = sec.stocks.find((s) => s.symbol === symbol);
    if (found) return { ...found, sectorName: sec.name, sectorOutlook: sec.outlook, sectorAvgPE: sec.sector_avg_pe };
    }
  return null;
}

/** Get all stocks flat */
export function getAllResearchStocks() {
  const all = [];
  for (const [key, sec] of Object.entries(SECTORS)) {
    sec.stocks.forEach((s) => all.push({ ...s, sectorKey: key, sectorName: sec.name }));
  }
  return all;
}
