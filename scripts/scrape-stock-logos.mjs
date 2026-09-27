/**
 * Stock Logo & Company Name Scraper
 * Scrapes logos and full company names from sarmaaya.pk for all PSX stocks in the project.
 * Downloads SVG logos to public/stock-logos/ and creates a mapping file.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const LOGOS_DIR = resolve(ROOT, 'public', 'stock-logos');
const MAPPING_FILE = resolve(ROOT, 'src', 'data', 'stockMeta.json');

// Rate limit: wait between requests
const DELAY_MS = 800;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// Collect all unique symbols from project data
function collectSymbols() {
  const symbols = new Set();

  // From stocks.json
  try {
    const stocksData = JSON.parse(
      readFileSync(resolve(ROOT, 'Stock Analyzer', 'Stock Analyzer', 'data', 'stocks.json'), 'utf8')
    );
    for (const sector of Object.values(stocksData.sectors)) {
      for (const sym of Object.keys(sector.stocks)) {
        symbols.add(sym);
      }
    }
  } catch (e) {
    console.warn('Could not read stocks.json:', e.message);
  }

  // From psxResearch.js
  try {
    const researchContent = readFileSync(resolve(ROOT, 'src', 'data', 'psxResearch.js'), 'utf8');
    const matches = researchContent.match(/symbol:\s*['"]([A-Z0-9]+)['"]/g) || [];
    for (const m of matches) {
      const sym = m.match(/['"]([A-Z0-9]+)['"]/)[1];
      symbols.add(sym);
    }
  } catch (e) {
    console.warn('Could not read psxResearch.js:', e.message);
  }

  return [...symbols].sort();
}

// Fetch a stock page and extract logo URL + company name
async function scrapeStock(symbol) {
  const url = `https://sarmaaya.pk/stocks/${symbol}`;
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml',
      },
    });

    if (!res.ok) {
      console.error(`  [${symbol}] HTTP ${res.status}`);
      return null;
    }

    const html = await res.text();

    // Extract logo URL
    const logoMatch = html.match(/sarmaaya-images\.s3\.amazonaws\.com\/company_logos\/([^'"]+\.svg)/);
    const logoUrl = logoMatch ? `https://${logoMatch[0]}` : null;
    const logoSlug = logoMatch ? logoMatch[1] : null;

    // Extract company name from first <h2> tag (the company display name)
    const nameMatch = html.match(/<h2[^>]*>([^<]+)<\/h2>/);
    const companyName = nameMatch ? nameMatch[1].trim() : null;

    return { symbol, companyName, logoUrl, logoSlug };
  } catch (e) {
    console.error(`  [${symbol}] Error: ${e.message}`);
    return null;
  }
}

// Download an SVG file
async function downloadSvg(logoUrl, symbol) {
  try {
    const res = await fetch(logoUrl);
    if (!res.ok) {
      console.warn(`  [${symbol}] Logo download failed: HTTP ${res.status}`);
      return false;
    }
    const content = await res.text();
    // Sanitize: only save if it looks like valid SVG
    if (!content.includes('<svg') && !content.includes('<SVG')) {
      console.warn(`  [${symbol}] Not a valid SVG`);
      return false;
    }
    const filePath = resolve(LOGOS_DIR, `${symbol}.svg`);
    writeFileSync(filePath, content);
    return true;
  } catch (e) {
    console.warn(`  [${symbol}] Download error: ${e.message}`);
    return false;
  }
}

async function main() {
  console.log('=== PSX Stock Logo Scraper ===\n');

  // Ensure output directories exist
  mkdirSync(LOGOS_DIR, { recursive: true });

  const symbols = collectSymbols();
  console.log(`Found ${symbols.length} unique symbols:\n${symbols.join(', ')}\n`);

  const mapping = {};
  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < symbols.length; i++) {
    const sym = symbols[i];
    process.stdout.write(`[${i + 1}/${symbols.length}] Scraping ${sym}...`);

    const data = await scrapeStock(sym);
    if (data && data.logoUrl) {
      // Download the SVG
      const downloaded = await downloadSvg(data.logoUrl, sym);
      mapping[sym] = {
        companyName: data.companyName || sym,
        logoUrl: data.logoUrl,
        localLogo: downloaded ? `/stock-logos/${sym}.svg` : null,
      };
      console.log(` ✓ ${data.companyName || 'Unknown'}`);
      successCount++;
    } else if (data) {
      // No logo but we have company name
      mapping[sym] = {
        companyName: data.companyName || sym,
        logoUrl: null,
        localLogo: null,
      };
      console.log(` ⚠ No logo (${data.companyName || 'Unknown'})`);
      failCount++;
    } else {
      mapping[sym] = {
        companyName: sym,
        logoUrl: null,
        localLogo: null, 
      };
      console.log(` ✗ Failed`);
      failCount++;
    }

    // Rate limit
    if (i < symbols.length - 1) {
      await sleep(DELAY_MS);
    }
  }

  // Save the mapping file
  const output = {
    _generated: new Date().toISOString(),
    _description: 'Stock metadata scraped from sarmaaya.pk - symbol to company name and logo mapping',
    stocks: mapping,
  };
  writeFileSync(MAPPING_FILE, JSON.stringify(output, null, 2));

  console.log(`\n=== Done ===`);
  console.log(`Success: ${successCount}, Failed: ${failCount}`);
  console.log(`Mapping saved to: ${MAPPING_FILE}`);
  console.log(`Logos saved to: ${LOGOS_DIR}`);
}

main().catch(console.error);
