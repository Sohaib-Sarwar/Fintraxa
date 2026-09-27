const fs = require('fs');
const path = require('path');

async function scrapeOne(sym) {
  const res = await fetch('https://sarmaaya.pk/stocks/' + sym, { headers: {'User-Agent':'Mozilla/5.0'} });
  const html = await res.text();
  const logoMatch = html.match(/sarmaaya-images\.s3\.amazonaws\.com\/company_logos\/([^'"]+\.svg)/);
  const nameMatch = html.match(/<h2[^>]*>([^<]+)<\/h2>/);
  const logoUrl = logoMatch ? 'https://' + logoMatch[0] : null;
  const name = nameMatch ? nameMatch[1].trim() : sym;
  console.log(sym, '->', name, logoUrl ? '(has logo)' : '(no logo)');
  
  if (logoUrl) {
    const svgRes = await fetch(logoUrl);
    const svg = await svgRes.text();
    if (svg.includes('<svg') || svg.includes('<SVG')) {
      fs.writeFileSync(path.join('public/stock-logos', sym + '.svg'), svg);
      console.log('  Downloaded');
      return { companyName: name, logoUrl, localLogo: '/stock-logos/' + sym + '.svg' };
    }
  }
  return { companyName: name, logoUrl, localLogo: null };
}

async function main() {
  const missing = ['ICI', 'PSMC', 'UPFL'];
  for (const sym of missing) {
    const result = await scrapeOne(sym);
    console.log(JSON.stringify(result));
    await new Promise(r => setTimeout(r, 800));
  }
}
main();
