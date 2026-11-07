/**
 * Statement processing, end to end, with no I/O:
 *
 *   rows (pdfRows) → AMC parser → redaction → normalisation → reconciliation
 *
 * Deterministic: the same PDF always yields the same staged events, so a
 * re-run is idempotent by construction. Nothing here talks to the network;
 * the statement never leaves the server.
 */
import { parseStatement } from './parsers/index.js';
import { redactStatement } from './redact.js';
import { normalizeExtraction, blocksAuto, PARSER_VERSION } from './normalize.js';
import { reconcileSection } from './reconcile.js';

export { PARSER_VERSION };

/** Statement conventions per AMC (mirrors mf_amcs.statement_profile). */
export const PROFILES = {
  atlas: { amount_dp: 2, units_dp: 4 },
  mcb: { amount_dp: 0, units_dp: 4 },
  meezan: { amount_dp: 0, units_dp: 4, single_amount_outflow: 'net_of_tax' },
  nbp: { amount_dp: 2, units_dp: 4 },
  ubl: { amount_dp: 0, units_dp: 2 },
};

/**
 * @param {import('./pdfRows.js').Line[][]} pages
 * @param {{ extraNames?: string[] }} [opts]
 */
export function processStatement(pages, opts = {}) {
  const t0 = Date.now();
  const { amcCode, parsed } = parseStatement(pages);
  const red = redactStatement(pages, { extraNames: opts.extraNames });
  const profile = PROFILES[amcCode] ?? {};

  // Parsers may cite a header line the redactor dropped (it carried no
  // transaction data). Evidence is only ever the redacted text.
  const lines = red.lines;
  const norm = normalizeExtraction({
    chunks: [{ index: 0, page: 0, main: lines, contextBefore: [], contextAfter: [] }],
    results: [parsed],
    lines,
    profile,
  });

  const reconciliation = norm.sections.map((s) =>
    reconcileSection(s, norm.events.filter((e) => e.section_key === s.key), profile));

  // A section's reconciliation problems belong on its events too, so the
  // reviewer sees them where they act.
  for (const r of reconciliation) {
    for (const issue of r.issues) {
      const target = norm.events.find((e) => e.source_key === issue.source_key)
        ?? norm.events.filter((e) => e.section_key === r.section_key).pop();
      if (target) target.warnings.push({ code: issue.code, severity: issue.severity, message: issue.message });
    }
  }

  return {
    amcCode,
    accountRef: red.accountRef,
    statement: norm.statement,
    sections: norm.sections,
    events: norm.events.map((e) => ({ ...e, review_status: blocksAuto(e) ? 'requires_attention' : 'pending_review' })),
    reconciliation,
    issues: norm.issues,
    amcReported: parsed.amc_reported ?? null,
    lines,
    stats: { ...red.stats, events: norm.events.length, sections: norm.sections.length, ms: Date.now() - t0 },
  };
}
