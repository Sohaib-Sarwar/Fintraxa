/**
 * Step bookkeeping for the upload screens (trade confirmations, dividend
 * reports). Parsing is near-instant, so each step is shown for a short minimum
 * time: long enough to read what the app did, never padded beyond that, and
 * skipped entirely when the user prefers reduced motion.
 */
const reduced = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
export const STEP_MIN_MS = 320;

/** Resolve fn() but not sooner than `ms`. */
export async function atLeast(fn, ms = STEP_MIN_MS) {
  const wait = reduced() ? 0 : ms;
  const [out] = await Promise.all([fn(), new Promise((r) => setTimeout(r, wait))]);
  return out;
}

/** steps: [{ key, label }] → initial state with every step pending. */
export const initSteps = (defs) => defs.map((d) => ({ ...d, status: 'pending', detail: null }));

/** Immutable update of one step. */
export const setStep = (steps, key, patch) => steps.map((s) => (s.key === key ? { ...s, ...patch } : s));

let seq = 0;
export const jobId = () => `job-${Date.now().toString(36)}-${(seq += 1)}`;
