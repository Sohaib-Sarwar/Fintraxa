/**
 * Chart primitives shared by every donut in the app.
 *
 * These exist because the same four pieces of chart plumbing — the active
 * sector, the outer labels, the centre text, the hover state — had been
 * copy-pasted into six files with small divergences, and all six carried the
 * same Recharts 3 regression. See `pieSector.jsx`.
 */
export { pieSector, makeOuterLabel } from './pieSector';
export { default as DonutCenter } from './DonutCenter';
