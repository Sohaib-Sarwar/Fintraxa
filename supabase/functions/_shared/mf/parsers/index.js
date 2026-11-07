/**
 * AMC detection and parser dispatch. Detection reads the whole document
 * (including the header the redactor drops) — AMC names are not personal.
 */
import { parseAtlas } from './atlas.js';
import { parseMcb } from './mcb.js';
import { parseMeezan } from './meezan.js';
import { parseNbp } from './nbp.js';
import { parseUbl } from './ubl.js';
import { UnsupportedStatementError } from './common.js';

export { UnsupportedStatementError };

const DETECTORS = [
  { code: 'meezan', re: /al meezan investment management|almeezangroup|meezan funds online/i, parse: parseMeezan },
  { code: 'ubl', re: /ubl fund managers|ublfunds\.com/i, parse: parseUbl },
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
  const parsed = d.parse(pages);
  if (!parsed.events.length && !parsed.sections.length) {
    throw new UnsupportedStatementError('No transactions were found. Is this an account statement (not a confirmation or a fund report)?');
  }
  return { amcCode: d.code, parsed };
}
