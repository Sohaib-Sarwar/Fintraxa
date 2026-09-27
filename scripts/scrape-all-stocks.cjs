/**
 * Bulk scraper for ALL PSX stock logos and company names from sarmaaya.pk
 * Uses concurrent requests with rate limiting to scrape ~500 stocks efficiently.
 */
const fs = require('fs');
const path = require('path');

const LOGOS_DIR = path.join(__dirname, '..', 'public', 'stock-logos');
const MAPPING_FILE = path.join(__dirname, '..', 'src', 'data', 'stockMeta.json');
const CONCURRENCY = 8;
const DELAY_BETWEEN_BATCHES = 1000;

async function getAllSymbols() {
  const res = await fetch('https://api.fintraxa.com/api/psx/stocks?limit=5000', {
    headers: { 'User-Agent': 'Mozilla/5.0' }
  });
  const data = await res.json();
  return (data.data || []).map(s => s.symbol).filter(Boolean).sort();
}

async function scrapeStock(symbol) {
  try {
    const res = await fetch(`https://sarmaaya.pk/stocks/${symbol}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
    });
    if (!res.ok) return { symbol, companyName: symbol, logoUrl: null };
    const html = await res.text();
    const logoMatch = html.match(/sarmaaya-images\.s3\.amazonaws\.com\/company_logos\/([^'"]+\.svg)/);
    const nameMatch = html.match(/<h2[^>]*>([^<]+)<\/h2>/);
    let companyName = nameMatch ? nameMatch[1].trim() : symbol;
    companyName = companyName.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#x27;/g, "'").replace(/&quot;/g, '"');
    return {
      symbol,
      companyName,
      logoUrl: logoMatch ? `https://${logoMatch[0]}` : null
    };
  } catch (e) {
    return { symbol, companyName: symbol, logoUrl: null };
  }
}

async function downloadSvg(logoUrl, symbol) {
  try {
    const res = await fetch(logoUrl);
    if (!res.ok) return false;
    const content = await res.text();
    if (!content.includes('<svg') && !content.includes('<SVG')) return false;
    fs.writeFileSync(path.join(LOGOS_DIR, `${symbol}.svg`), content);
    return true;
  } catch {
    return false;
  }
}

async function processBatch(symbols) {
  return Promise.all(symbols.map(async (sym) => {
    const data = await scrapeStock(sym);
    let localLogo = null;
    if (data.logoUrl) {
      const downloaded = await downloadSvg(data.logoUrl, sym);
      if (downloaded) localLogo = `/stock-logos/${sym}.svg`;
    }
    // Check if already has a local SVG (from prior run)
    if (!localLogo && fs.existsSync(path.join(LOGOS_DIR, `${sym}.svg`))) {
      localLogo = `/stock-logos/${sym}.svg`;
    }
    return { ...data, localLogo };
  }));
}

async function main() {
  console.log('=== Bulk PSX Stock Scraper ===\n');
  fs.mkdirSync(LOGOS_DIR, { recursive: true });

  // Load existing mapping to preserve already-scraped data
  let existing = {};
  try {
    const prev = JSON.parse(fs.readFileSync(MAPPING_FILE, 'utf8'));
    existing = prev.stocks || {};
    console.log(`Loaded ${Object.keys(existing).length} existing entries\n`);
  } catch {}

  const symbols = await getAllSymbols();
  console.log(`API returned ${symbols.length} stocks\n`);

  // Filter: only scrape stocks we don't have yet (or all if forced)
  const forceAll = process.argv.includes('--force');
  const toScrape = forceAll ? symbols : symbols.filter(s => !existing[s]?.companyName || existing[s].companyName === s);
  console.log(`Need to scrape: ${toScrape.length} stocks${forceAll ? ' (forced)' : ''}\n`);

  const mapping = { ...existing };
  let done = 0;
  let logoCount = 0;

  // Process in batches
  for (let i = 0; i < toScrape.length; i += CONCURRENCY) {
    const batch = toScrape.slice(i, i + CONCURRENCY);
    const results = await processBatch(batch);

    for (const r of results) {
      mapping[r.symbol] = {
        companyName: r.companyName,
        logoUrl: r.logoUrl,
        localLogo: r.localLogo
      };
      if (r.localLogo) logoCount++;
      done++;
    }

    const pct = Math.round((done / toScrape.length) * 100);
    process.stdout.write(`\r  [${pct}%] ${done}/${toScrape.length} scraped (${batch.map(s => s).join(', ')})`);

    if (i + CONCURRENCY < toScrape.length) {
      await new Promise(r => setTimeout(r, DELAY_BETWEEN_BATCHES));
    }
  }

  // Also ensure symbols already in mapping that weren't in toScrape get localLogo set
  for (const sym of symbols) {
    if (!mapping[sym]) {
      mapping[sym] = { companyName: sym, logoUrl: null, localLogo: null };
    }
    if (!mapping[sym].localLogo && fs.existsSync(path.join(LOGOS_DIR, `${sym}.svg`))) {
      mapping[sym].localLogo = `/stock-logos/${sym}.svg`;
    }
  }

  // Save
  const output = {
    _generated: new Date().toISOString(),
    _description: 'Stock metadata - company names and logo mappings from sarmaaya.pk',
    _totalStocks: Object.keys(mapping).length,
    stocks: Object.fromEntries(Object.entries(mapping).sort(([a], [b]) => a.localeCompare(b)))
  };

  fs.writeFileSync(MAPPING_FILE, JSON.stringify(output, null, 2));

  const totalLogos = Object.values(mapping).filter(v => v.localLogo).length;
  const totalNames = Object.values(mapping).filter(v => v.companyName && v.companyName !== Object.keys(mapping).find(k => mapping[k] === v)).length;

  console.log(`\n\n=== Done ===`);
  console.log(`Total stocks: ${Object.keys(mapping).length}`);
  console.log(`Logos downloaded: ${totalLogos}`);
  console.log(`Scraped this run: ${done}`);
  console.log(`Mapping saved to: ${MAPPING_FILE}`);
}

main().catch(console.error);
