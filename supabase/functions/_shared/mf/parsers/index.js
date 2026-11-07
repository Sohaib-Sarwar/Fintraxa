/**
 * AMC detection and parser dispatch. Detection reads the whole document
 * (including the header the redactor drops) — AMC names are not personal.
 */
import { parseAtlas } from './atlas.js';
import { parseMcb } from './mcb.js';
import { parseMeezan } from './meezan.js';
import { parseNbp } from './nbp.js';
import { parseUbl } from './ubl.js';
import { parseGeneric } from './generic.js';
import { UnsupportedStatementError } from './common.js';

export { UnsupportedStatementError };

const AMC_DISPLAY = { meezan: 'Al Meezan Investment Management Limited', ubl: 'UBL Fund Managers Limited', mcb: 'MCB Investment Management Limited', nbp: 'NBP Fund Management Limited', atlas: 'Atlas Asset Management Limited' };

const DETECTORS = [
  { code: 'meezan', re: /al meezan investment management|almeezangroup|meezan funds online/i, parse: parseMeezan },
  { code: 'ubl', re: /ubl fund managers|ublfunds\.com|al[- ]ameen funds/i, parse: parseUbl },
  { code: 'mcb', re: /mcb investment management|mcbfunds\.com|mcb-arif habib/i, parse: parseMcb },
  { code: 'nbp', re: /nbp fund management|nbpfunds\.com/i, parse: parseNbp },
  { code: 'atlas', re: /atlas asset management|atlasfunds\.com\.pk/i, parse: parseAtlas },
];

export const SUPPORTED_AMCS = ['Atlas', 'MCB / Alhamra', 'Meezan', 'NBP', 'UBL'];

export function detectAmc(pages) {
  const text = pages.flat().map((l) => l.text).join('\n');
  const scores = DETECTORS.map((d) => ({ d, n: (text.match(new RegExp(d.re.source, 'gi')) ?? []).length }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n);
  return scores[0]?.d ?? null;
}

/**
 * @param {import('../pdfRows.js').Line[][]} pages unredacted rows (never leave the server)
 * @returns {{ amcCode: string, parsed: object }}
 */
export function parseStatement(pages) {
  const d = detectAmc(pages);
  if (!d) {
    throw new UnsupportedStatementError(
      `This statement's format is not supported yet. Supported AMCs: ${SUPPORTED_AMCS.join(', ')}.`);
  }
  // AMCs publish several layouts (monthly statement, portal/app date-range
  // statement, …). The specific parser knows the main one; anything it does
  // not recognise goes to the general table reader.
  let parsed = d.parse(pages);
  if (!parsed.events.length) {
    const generic = parseGeneric(pages, { amcName: AMC_DISPLAY[d.code] ?? null });
    if (generic.events.length) parsed = generic;
  }
  if (!parsed.events.length) {
    throw new UnsupportedStatementError(
      `This looks like a ${AMC_DISPLAY[d.code] ?? d.code} document, but no transaction table was found in it. If it is an account or transaction statement, please send it to support so its layout can be added.`);
  }
  return { amcCode: d.code, parsed };
}
