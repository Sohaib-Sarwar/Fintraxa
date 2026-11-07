/**
 * Local PII redaction. Runs on rebuilt statement lines before anything is
 * sent to Gemini. Fail-closed: if the outbound text still matches any
 * identifier, `redactStatement` throws instead of returning.
 *
 * Strategy
 *   1. Harvest identifiers from the whole document: labelled fields
 *      (account / portfolio / registration / customer no., IBAN, RAAST),
 *      the account holder's name, their address block, phones, e-mails, CNIC.
 *   2. Header region of each page (above the first transaction-table header)
 *      is dropped except for lines that are plainly about the fund, the
 *      period or the valuation.
 *   3. Every kept line has each harvested literal and each identifier
 *      pattern replaced with a stable pseudonym ([NAME_1], [ID_2] …).
 *      Short trailing references ("…-UBL-148033") survive: they identify the
 *      *transaction*, not the person, and are the best dedupe key available.
 *   4. The result is scanned again; any hit aborts.
 *
 * The pseudonym map is returned to the caller only for local use and is
 * never persisted or sent anywhere.
 */

export class RedactionError extends Error {
  constructor(message, details) {
    super(message);
    this.name = 'RedactionError';
    this.details = details;
  }
}

const TABLE_HEADER_WORDS = [
  'date', 'units', 'unit', 'nav', 'price', 'amount', 'balance', 'transaction', 'transactions',
  'nature', 'gross', 'net', 'value', 'gain', 'dividend', 'funds', 'inflows', 'outflows', 'rate', 'type',
];

/** A line that heads a table: three or more column words. */
export function isTableHeader(text) {
  const words = new Set(String(text).toLowerCase().match(/[a-z]+/g) ?? []);
  let n = 0;
  for (const w of TABLE_HEADER_WORDS) if (words.has(w)) n++;
  return n >= 3;
}

// Header lines worth sending: they describe the fund, the period or a value.
const SAFE_HEADER = /\b(fund|funds|plan|scheme|period|statement|growth|income|class|units?|nav|price|value|valued|investment|dividend|zakat|tax|cgt|print|page)\b/i;

const ID_LABELS = [
  ['portfolio', /portfolio\s*(?:no\.?|number|#)\s*[:#.]*\s*([A-Z0-9][A-Z0-9\-/]{3,})/i],
  ['account', /account\s*(?:no\.?|number|#)\s*[:#.]*\s*([A-Z0-9][A-Z0-9\-/]{3,})/i],
  ['folio', /folio\s*(?:no\.?|number|#)?\s*[:#.]*\s*(\d[A-Z0-9\-/]{3,})/i],
  ['customer', /customer\s*(?:[il]d|no\.?|number|code)\s*[:#.]*\s*(\d[A-Z0-9\-/]{3,})/i],
  ['registration', /registration\s*(?:no\.?|number|#)?\s*[:#.]*\s*(\d[A-Z0-9\-/]{3,})/i],
  ['investor', /investor\s*(?:id|no\.?|code|number)\s*[:#.]*\s*([A-Z0-9][A-Z0-9\-/]{3,})/i],
  ['relationship', /relationship\s*(?:no\.?|number)\s*[:#.]*\s*(\d[A-Z0-9\-/]{3,})/i],
  ['cnic', /cnic\s*(?:no\.?|#)?\s*[:#.]*\s*(\d[\d-]{12,14})/i],
];
// Which labelled ID identifies the account, best first.
export const ACCOUNT_REF_PRIORITY = ['portfolio', 'account', 'folio', 'customer', 'registration', 'investor', 'relationship'];

const PATTERNS = [
  ['IBAN', /\bPK\d{2}[A-Z]{4}[0-9A-Z]{4,20}\b/g],
  ['CNIC', /\b\d{5}-\d{7}-\d\b/g],
  ['EMAIL', /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi],
  ['PHONE', /(?<![\d.,])(?:\+?92[-\s]?|0)3\d{2}[-\s]?\d{7}(?![\d.,]*\d)/g],
  // Bare digit runs of 7+ are account / bank numbers. Amounts are printed
  // with thousands separators or decimals, so they never match.
  ['ID', /(?<![\d.,])\d{7,}(?![\d.,]*\d)/g],
];

const NAME_LABEL = /^(?:title|name|account\s+title|investor\s*name|unit\s*holder(?:'?s)?\s*name|holder\s*name|client\s*name)\s*:?$/i;
const HONORIFIC = /\b(?:Mr|Mrs|Ms|Miss|Dr|Mst)\.?\s+([A-Za-z][A-Za-z.'-]+(?:\s+[A-Za-z][A-Za-z.'-]+){1,4})/;
const PERSON_CELL = /^[A-Za-z][A-Za-z.'-]+(?:\s+[A-Za-z][A-Za-z.'-]+){1,4}$/;

// Words that never occur in a person's name on these statements. Used to
// reject header cells like "Your Account Information" as name candidates.
const NOT_A_NAME = new Set(`
  account accounts statement transaction transactions details summary information info your our the for
  of to from and fund funds investment investments management manager managers limited ltd company
  asset assets bank islamic money market cash income stock equity plan scheme growth class unit units
  customer type status zakat dividend tax cgt filer profile risk online access mobile tele transact
  registered regular profit date print page period registration number portfolio joint holder title
  address contact email phone help website sms call value added service hard copy dispatch atm
  balance opening closing total gross net nav price exempt exempted applicable individual single
  instructions invest important note notes generated system computer signature this is
  head office floor block road street karachi lahore islamabad pakistan centre center building
  relationship master iban raast id rda pkr rs reinvest re-invest e-account investor optimizer
  meezan atlas mcb nbp ubl alhamra al ameen hbl abl faysal alfalah lakson nit akd askari js
`.trim().split(/\s+/));

const ADDRESS_HINT = /\b(road|rd|street|st|mohallah|mohalla|block|house|plot|sector|phase|town|colony|village|lane|avenue|ave|floor|flat|apartment|near|tehsil|district|chowk|bazar|bazaar|society|scheme)\b/i;

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const cells = (text) => String(text).split(/\s{3,}/).map((c) => c.trim()).filter(Boolean);

/**
 * @param {import('./pdfRows.js').Line[][]} pages
 * @param {{ extraNames?: string[] }} [opts]
 */
export function redactStatement(pages, opts = {}) {
  const all = pages.flat();

  // Header region per page: everything above that page's first table header.
  const headerIds = new Set();
  for (const lines of pages) {
    const first = lines.findIndex((l) => isTableHeader(l.text));
    const end = first === -1 ? lines.length : first;
    for (let i = 0; i < end; i++) headerIds.add(lines[i].id);
  }

  // ── 1. Harvest ──
  /** @type {{kind: string, value: string}[]} */
  const literals = [];
  const accountRefs = {};
  const add = (kind, value) => {
    const v = String(value ?? '').trim().replace(/[\s:.,-]+$/, '');
    if (v.length >= 3 && !literals.some((l) => l.value.toLowerCase() === v.toLowerCase())) {
      literals.push({ kind, value: v });
    }
  };

  for (const l of all) {
    for (const [label, re] of ID_LABELS) {
      const m = l.text.match(re);
      if (m) {
        const v = m[1].replace(/[-/]+$/, '');
        if (/\d/.test(v)) {
          add(label === 'cnic' ? 'CNIC' : 'ID', v);
          if (!accountRefs[label]) accountRefs[label] = v;
        }
      }
    }
  }

  const names = new Set((opts.extraNames ?? []).map((n) => n.trim()).filter(Boolean));
  for (const l of all) {
    const cs = cells(l.text);
    cs.forEach((c, i) => {
      if (NAME_LABEL.test(c) && cs[i + 1] && PERSON_CELL.test(cs[i + 1])) names.add(cs[i + 1]);
      const inline = c.match(/^(?:title|name|account\s+title|investor\s*name)\s*:\s*(.+)$/i);
      if (inline && PERSON_CELL.test(inline[1].trim())) names.add(inline[1].trim());
    });
    const h = l.text.match(HONORIFIC);
    if (h) names.add(h[1].trim());
  }
  // Fallback: the first person-shaped cell in page 1's header. Statements put
  // the holder's name above their address, before any table.
  let nameLineIdx = -1;
  if (names.size === 0) {
    const p1 = pages[0] ?? [];
    for (let i = 0; i < p1.length && headerIds.has(p1[i].id); i++) {
      const found = cells(p1[i].text).find((c) => isPersonName(c));
      if (found) { names.add(found); nameLineIdx = i; break; }
    }
  }
  const nameTokens = new Set();
  for (const n of names) {
    add('NAME', n);
    for (const t of n.split(/\s+/)) {
      const w = t.replace(/[^A-Za-z]/g, '');
      if (w.length >= 3 && !NOT_A_NAME.has(w.toLowerCase())) nameTokens.add(w);
    }
  }

  // Address: header lines carrying an address word, near the name if known.
  const p1 = pages[0] ?? [];
  if (nameLineIdx === -1) {
    nameLineIdx = p1.findIndex((l) => [...names].some((n) => l.text.toLowerCase().includes(n.toLowerCase())));
  }
  const addressWords = new Set();
  if (nameLineIdx !== -1) {
    for (let i = nameLineIdx + 1; i <= nameLineIdx + 5 && i < p1.length; i++) {
      if (!headerIds.has(p1[i].id)) break;
      const first = cells(p1[i].text)[0] ?? '';
      const looksAddress = ADDRESS_HINT.test(first) || (/,/.test(first) && !/\d{2}:\d{2}/.test(first))
        || /^[A-Za-z][A-Za-z\s.,-]*$/.test(first) && i <= nameLineIdx + 3 && first.split(/\s+/).length <= 4;
      if (!looksAddress) continue;
      add('ADDR', first);
      for (const w of first.split(/[\s,.-]+/)) {
        if (w.length >= 5 && /^[A-Za-z]+$/.test(w) && !ADDRESS_HINT.test(w) && !NOT_A_NAME.has(w.toLowerCase())) {
          addressWords.add(w);
        }
      }
    }
  }

  // ── 2. Keep / drop ──
  const kept = all.filter((l) => {
    if (!headerIds.has(l.id)) return true;
    return SAFE_HEADER.test(l.text) || /\d{1,2}[-/][A-Za-z0-9]{2,3}[-/]\d{2,4}/.test(l.text);
  });

  // ── 3. Replace ──
  const pseudonyms = new Map();
  const counters = {};
  const tokenFor = (kind, value) => {
    const key = `${kind}:${value.toLowerCase()}`;
    if (!pseudonyms.has(key)) {
      counters[kind] = (counters[kind] ?? 0) + 1;
      pseudonyms.set(key, `[${kind}_${counters[kind]}]`);
    }
    return pseudonyms.get(key);
  };

  const literalRes = [...literals]
    .sort((a, b) => b.value.length - a.value.length)
    .map((l) => ({ ...l, re: new RegExp(`(?<![A-Za-z0-9])${escapeRe(l.value).replace(/\s+/g, '\\s+')}(?![A-Za-z0-9])`, 'gi') }));
  const tokenRes = [...nameTokens].map((t) => ({ kind: 'NAME', value: t, re: new RegExp(`\\b${escapeRe(t)}\\b`, 'gi') }));
  const addrRes = [...addressWords].map((t) => ({ kind: 'ADDR', value: t, re: new RegExp(`\\b${escapeRe(t)}\\b`, 'gi') }));

  const redactText = (text) => {
    let out = text;
    for (const l of literalRes) out = out.replace(l.re, () => tokenFor(l.kind, l.value));
    for (const t of tokenRes) out = out.replace(t.re, () => tokenFor('NAME', t.value));
    for (const t of addrRes) out = out.replace(t.re, () => tokenFor('ADDR', t.value));
    for (const [kind, re] of PATTERNS) out = out.replace(re, (m) => tokenFor(kind, m));
    return out;
  };

  const lines = [];
  for (const l of kept) {
    const text = redactText(l.text);
    // A header line that turned into mostly placeholders carried identity,
    // not content.
    if (headerIds.has(l.id) && /\[(?:NAME|ADDR|ID|IBAN|CNIC|PHONE|EMAIL)_\d+\]/.test(text)
        && !/\b(fund|plan|period|value|units?)\b/i.test(text)) continue;
    lines.push({ ...l, text });
  }

  // ── 4. Leak scan ──
  const leaks = scanForLeaks(lines, [...literals.map((l) => l.value), ...nameTokens, ...addressWords]);
  if (leaks.length) {
    throw new RedactionError('Personal information could not be removed with confidence', {
      lines: leaks.map((x) => x.lineId),
      kinds: [...new Set(leaks.map((x) => x.kind))],
    });
  }

  const accountRef = ACCOUNT_REF_PRIORITY.map((k) => accountRefs[k]).find(Boolean) ?? null;
  return {
    lines,
    accountRef,
    stats: {
      inputLines: all.length,
      keptLines: lines.length,
      redactions: pseudonyms.size,
      namesFound: names.size,
    },
  };
}

function isPersonName(cell) {
  if (!PERSON_CELL.test(cell) || cell.length > 45) return false;
  const words = cell.split(/\s+/);
  if (words.length < 2) return false;
  return words.every((w) => {
    const lw = w.toLowerCase().replace(/[^a-z-]/g, '');
    return lw.length >= 2 && !NOT_A_NAME.has(lw);
  });
}

/**
 * @param {{id: string, text: string}[]} lines
 * @param {string[]} literals
 * @returns {{lineId: string, kind: string}[]}
 */
export function scanForLeaks(lines, literals = []) {
  const hits = [];
  const lits = literals.filter((v) => v && v.length >= 3)
    .map((v) => new RegExp(`(?<![A-Za-z0-9])${escapeRe(v).replace(/\s+/g, '\\s+')}(?![A-Za-z0-9])`, 'i'));
  for (const l of lines) {
    const t = l.text.replace(/\[(?:NAME|ADDR|ID|IBAN|CNIC|PHONE|EMAIL)_\d+\]/g, ' ');
    for (const [kind, re] of PATTERNS) {
      re.lastIndex = 0;
      if (new RegExp(re.source, re.flags.replace('g', '')).test(t)) hits.push({ lineId: l.id, kind });
    }
    if (lits.some((re) => re.test(t))) hits.push({ lineId: l.id, kind: 'LITERAL' });
  }
  return hits;
}
