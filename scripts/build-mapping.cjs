const fs = require('fs');
const path = require('path');

const LOGOS_DIR = path.join(__dirname, '..', 'public', 'stock-logos');
const MAPPING_FILE = path.join(__dirname, '..', 'src', 'data', 'stockMeta.json');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// All 61 symbols
const SYMBOLS = [
  'ABL','ABOT','ACPL','AGP','AKBL','ATLH','BAFL','BAHL','BOK','BOP',
  'BWCL','CHCC','COLG','DCR','DGKC','DLL','EFERT','ENGRO','ENGROH','FABL',
  'FATIMA','FCCL','FFBL','FFC','FFL','FLYNG','GLAXO','HALEON','HBL','HINOON',
  'HMB','HUBC','ICI','INDU','KAPCO','KEL','KOHC','LUCK','MARI','MCB',
  'MEBL','MLCF','MTL','NATF','NBP','NCPL','NESTLE','OGDC','PABC','PAKT',
  'PIOC','POL','PPL','PSMC','PTC','SAZEW','SCBPL','SEARL','THALL','UBL','UPFL'
];

async function scrapeStock(symbol) {
  try {
    const res = await fetch('https://sarmaaya.pk/stocks/' + symbol, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
    });
    if (!res.ok) return { companyName: symbol, logoUrl: null };
    
    const html = await res.text();
    const logoMatch = html.match(/sarmaaya-images\.s3\.amazonaws\.com\/company_logos\/([^'"]+\.svg)/);
    const nameMatch = html.match(/<h2[^>]*>([^<]+)<\/h2>/);
    
    // Decode HTML entities
    let companyName = nameMatch ? nameMatch[1].trim() : symbol;
    companyName = companyName.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
    
    return {
      companyName,
      logoUrl: logoMatch ? 'https://' + logoMatch[0] : null
    };
  } catch (e) {
    console.error(`  [${symbol}] Error: ${e.message}`);
    return { companyName: symbol, logoUrl: null };
  }
}

async function main() {
  console.log('Building stock metadata mapping...\n');
  
  const mapping = {};
  
  for (let i = 0; i < SYMBOLS.length; i++) {
    const sym = SYMBOLS[i];
    const hasLocalSvg = fs.existsSync(path.join(LOGOS_DIR, sym + '.svg'));
    
    process.stdout.write(`[${i+1}/${SYMBOLS.length}] ${sym}...`);
    const data = await scrapeStock(sym);
    
    mapping[sym] = {
      companyName: data.companyName,
      logoUrl: data.logoUrl,
      localLogo: hasLocalSvg ? `/stock-logos/${sym}.svg` : null
    };
    
    console.log(` ${data.companyName} ${hasLocalSvg ? '(has SVG)' : '(no SVG)'}`);
    
    if (i < SYMBOLS.length - 1) await sleep(600);
  }
  
  const output = {
    _generated: new Date().toISOString(),
    _description: 'Stock metadata - company names and logo mappings from sarmaaya.pk',
    stocks: mapping
  };
  
  fs.writeFileSync(MAPPING_FILE, JSON.stringify(output, null, 2));
  console.log('\nMapping saved to:', MAPPING_FILE);
  console.log('Total:', Object.keys(mapping).length, 'stocks');
}

main().catch(console.error);
