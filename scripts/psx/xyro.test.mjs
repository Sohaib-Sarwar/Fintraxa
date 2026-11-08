/** Xyro: data snapshot, markdown reader, Gemini request/stream handling (no network, no real key). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSnapshot, monthTable, systemInstruction, contextWindow, TXN_LIMIT } from '../../src/lib/xyro/context.js';
import { parseMarkdown, parseInline } from '../../src/lib/xyro/markdown.js';
import { buildRequest, splitSse, readChunk, streamAnswer, mapError, rankModels, listModels } from '../../src/lib/xyro/gemini.js';

const tx = (date, type, amount, name, kind, notes = null) => ({ date, type, amount, notes, categories: { name, kind } });
const transactions = [
  tx('2026-06-01', 'credit', '100000.10', 'Salary', 'active'),
  tx('2026-06-03', 'credit', '20000', 'Freelance', 'active'),
  tx('2026-06-05', 'debit', '30000', 'Rent', 'spend', 'June rent, flat 2'),
  tx('2026-06-09', 'debit', '1500.25', 'Food', 'spend'),
  tx('2026-06-10', 'debit', '50000', 'Investment - Mutual Funds', 'transfer'),
  tx('2026-06-12', 'debit', '5000', 'Savings', 'transfer'),
  tx('2026-06-30', 'credit', '800', 'Savings profit', 'passive'),
  tx('2026-07-02', 'credit', '100000', 'Salary', 'active'),
];
const events = [
  { date: '2026-06-30', month: '2026-06', source: 'savings', gross: 1000, tax: 200, net: 800 },
  { date: '2026-06-20', month: '2026-06', source: 'dividends', gross: 1250, tax: 250, net: 1000 },
  { date: '2026-06-30', month: '2026-06', source: 'mutual_funds', gross: 5000, tax: 750, net: 4250 },
];

test('June: income, passive by source, expenses; transfers are not expenses and passive credits are not counted twice', () => {
  const june = monthTable({ transactions, events }).find((m) => m.month === '2026-06');
  assert.equal(june.active.toFixed(2), '120000.10');
  assert.equal(june.expenses.toFixed(2), '31500.25');           // rent + food only
  assert.equal(june.invested.toFixed(2), '50000.00');           // moved into funds
  assert.equal(june.moved.toFixed(2), '5000.00');               // own accounts
  assert.equal(june.passive.toFixed(2), '6050.00');             // 800 + 1000 + 4250 (the 800 credit not added again)
  assert.equal(june.saved.toFixed(2), '88499.85');
  assert.equal(june.savingsRate, '73.7');
});

test('snapshot carries dates, the month table, net worth and the rows, with no ids', () => {
  const s = buildSnapshot({
    today: '2026-07-15', transactions: transactions.map((t, i) => ({ ...t, id: `uuid-${i}`, user_id: 'user-uuid' })), events,
    mf: { totals: { value: 250000 }, allPositions: [], months: [] }, psx: { totals: { value: 100000.5 }, allPositions: [] },
    dividends: [{ payment_date: '2026-06-20', symbol: 'MARI', shares: '10', gross_amount: '1250', tax_amount: '250', jh_tax_amount: '0', zakat_amount: '0', net_amount: '1000' }],
  });
  assert.match(s, /Today: 2026-07-15/);
  assert.match(s, /FY 2026-27 = 2026-07-01 to 2027-06-30/);
  assert.match(s, /2026-06 \| 120000\.10 \| 6050\.00 \| 4250\.00 \| 1000\.00 \| 800\.00 \| 0\.00 \| 31500\.25 \| 50000\.00 \| 88499\.85 \| 73\.7/);
  assert.match(s, /2026-06: Rent 30000\.00; Food 1500\.25/);
  // savings = 220000.10 active + 800 profit + 1000 dividend − 31500.25 spent − 50000 invested
  assert.match(s, /mutual funds 250000\.00 \+ PSX stocks 100000\.50 \+ savings 140299\.85/);
  assert.match(s, /MARI \| 1 \| 1250\.00 \| 250\.00 \| 1000\.00/);
  assert.match(s, /2026-06-05,out,Rent,spend,30000\.00,,June rent flat 2/); // commas in notes cannot break the CSV
  assert.doesNotMatch(s, /uuid/);
  assert.match(s, /- all 8$/m);
});

test('snapshot notes truncation when there are more rows than it sends', () => {
  const many = Array.from({ length: TXN_LIMIT + 5 }, (_, i) => tx(`2026-0${1 + (i % 6)}-${String(1 + (i % 28)).padStart(2, '0')}`, 'debit', '10', 'Food', 'spend'));
  const s = buildSnapshot({ today: '2026-07-01', transactions: many });
  assert.match(s, new RegExp(`showing the latest ${TXN_LIMIT} of ${TXN_LIMIT + 5}`));
  const lines = s.split('\n').filter((l) => /^2026-0\d-\d\d,out,Food/.test(l));
  assert.equal(lines.length, TXN_LIMIT);
});

test('system instruction defines the terms and embeds the data; context window starts on a user turn', () => {
  const sys = systemInstruction('DATA-HERE', { name: 'Sohaib' });
  assert.match(sys, /You are Xyro/);
  assert.match(sys, /NOT an expense/);
  assert.match(sys, /Net worth = mutual funds value \+ PSX stocks value \+ savings/);
  assert.ok(sys.endsWith('DATA-HERE'));
  const msgs = Array.from({ length: 20 }, (_, i) => ({ role: i % 2 ? 'model' : 'user', text: `m${i}` }));
  msgs.splice(5, 0, { role: 'model', text: 'Gemini is busy', error: true });
  const win = contextWindow(msgs, 5);
  assert.equal(win[0].role, 'user');
  assert.ok(win.length <= 5);
  assert.ok(!win.some((m) => m.error));
});

test('markdown: bold, lists, tables and code become data, never HTML', () => {
  assert.deepEqual(parseInline('You made **Rs 1,000.00** in *June* via `MF`'), [
    { t: 'text', v: 'You made ' }, { t: 'b', v: 'Rs 1,000.00' }, { t: 'text', v: ' in ' }, { t: 'i', v: 'June' }, { t: 'text', v: ' via ' }, { t: 'code', v: 'MF' },
  ]);
  const blocks = parseMarkdown('Here:\n\n- Rent **30,000**\n- Food 1,500\n\n| Month | Spent |\n|---|---:|\n| Jun | 31,500 |\n\n1. one\n2. two\n\n<script>alert(1)</script>');
  assert.deepEqual(blocks.map((b) => b.type), ['p', 'ul', 'table', 'ol', 'p']);
  assert.equal(blocks[1].items.length, 2);
  assert.deepEqual(blocks[2].rows[0].map((c) => c[0].v), ['Jun', '31,500']);
  assert.equal(blocks[4].inline[0].v, '<script>alert(1)</script>'); // plain text, rendered as text
  assert.deepEqual(parseInline('half **streamed'), [{ t: 'text', v: 'half streamed' }]);
});

test('gemini: request body, SSE splitting and chunk reading', () => {
  const body = buildRequest({ system: 'SYS', history: [{ role: 'user', text: 'hi' }, { role: 'model', text: 'oops', error: true }, { role: 'model', text: 'Hello' }] });
  assert.equal(body.systemInstruction.parts[0].text, 'SYS');
  assert.deepEqual(body.contents, [{ role: 'user', parts: [{ text: 'hi' }] }, { role: 'model', parts: [{ text: 'Hello' }] }]);
  const [payloads, rest] = splitSse('data: {"a":1}\r\n\r\ndata: {"b":2}\n\ndata: {"c"');
  assert.deepEqual(payloads, ['{"a":1}', '{"b":2}']);
  assert.equal(rest, 'data: {"c"');
  assert.deepEqual(readChunk({ candidates: [{ content: { parts: [{ text: 'Hi ' }, { text: 'there', thought: false }] } }] }).text, 'Hi there');
  assert.equal(readChunk({ promptFeedback: { blockReason: 'SAFETY' } }).blocked, true);
});

const sseResponse = (chunks, status = 200) => {
  const enc = new TextEncoder();
  let i = 0;
  return {
    ok: status < 400, status,
    body: { getReader: () => ({ read: async () => (i < chunks.length ? { value: enc.encode(chunks[i++]), done: false } : { done: true }) }) },
    json: async () => ({}),
  };
};

test('gemini: streams text with the key in a header (never the URL)', async () => {
  let seen;
  const fetchImpl = async (url, init) => { seen = { url, init }; return sseResponse(['data: {"candidates":[{"content":{"parts":[{"text":"You earned "}]}}]}\n\n', 'data: {"candidates":[{"content":{"parts":[{"text":"**Rs 120,000.10**"}]},"finishReason":"STOP"}]}\n\n']); };
  const parts = [];
  const out = await streamAnswer({ apiKey: 'TEST_KEY_PLACEHOLDER', model: 'gemini-2.5-flash', system: 'S', history: [{ role: 'user', text: 'June?' }], onText: (s) => parts.push(s), fetchImpl });
  assert.equal(out, 'You earned **Rs 120,000.10**');
  assert.deepEqual(parts, ['You earned ', 'You earned **Rs 120,000.10**']);
  assert.match(seen.url, /models\/gemini-2\.5-flash:streamGenerateContent\?alt=sse$/);
  assert.doesNotMatch(seen.url, /TEST_KEY_PLACEHOLDER/);
  assert.equal(seen.init.headers['x-goog-api-key'], 'TEST_KEY_PLACEHOLDER');
});

test('gemini: errors become plain, actionable messages', async () => {
  assert.equal(mapError(400, { error: { message: 'API key not valid. Please pass a valid API key.' } }).code, 'invalid_key');
  assert.equal(mapError(429, {}).code, 'quota');
  assert.equal(mapError(404, {}).code, 'model');
  assert.equal(mapError(503, {}).code, 'unavailable');
  await assert.rejects(streamAnswer({ apiKey: '', model: 'm', system: 's', history: [] }), { code: 'no_key' });
  await assert.rejects(streamAnswer({ apiKey: 'k', model: 'm', system: 's', history: [], fetchImpl: async () => { throw new TypeError('Failed to fetch'); } }), { code: 'network' });
  await assert.rejects(streamAnswer({ apiKey: 'k', model: 'm', system: 's', history: [], fetchImpl: async () => sseResponse(['data: {"promptFeedback":{"blockReason":"SAFETY"}}\n\n']) }), { code: 'blocked' });
  await assert.rejects(streamAnswer({ apiKey: 'k', model: 'm', system: 's', history: [], fetchImpl: async () => ({ ok: false, status: 429, json: async () => ({}) }) }), { code: 'quota' });
});

test('gemini: models list keeps chat models, newest stable Flash first', async () => {
  const fetchImpl = async () => ({
    ok: true, status: 200,
    json: async () => ({ models: [
      { name: 'models/gemini-2.0-flash', supportedGenerationMethods: ['generateContent'] },
      { name: 'models/gemini-2.5-pro', supportedGenerationMethods: ['generateContent'] },
      { name: 'models/gemini-2.5-flash', displayName: 'Gemini 2.5 Flash', supportedGenerationMethods: ['generateContent'] },
      { name: 'models/gemini-3-flash-preview', supportedGenerationMethods: ['generateContent'] },
      { name: 'models/text-embedding-004', supportedGenerationMethods: ['embedContent'] },
      { name: 'models/gemini-2.5-flash-image', supportedGenerationMethods: ['generateContent'] },
    ] }),
  });
  const list = await listModels('k', fetchImpl);
  // Every generateContent model is listed (embeddings are not); Xyro's own picker filters and orders them.
  assert.deepEqual(list.map((m) => m.id).sort(), ['gemini-2.0-flash', 'gemini-2.5-flash', 'gemini-2.5-flash-image', 'gemini-2.5-pro', 'gemini-3-flash-preview']);
  assert.deepEqual(rankModels([{ id: 'gemini-1.5-flash' }, { id: 'gemini-3-flash' }]).map((m) => m.id), ['gemini-3-flash', 'gemini-1.5-flash']);
});

test('gemini: an overloaded model is retried, then the next model answers; a bad key stops at once', async () => {
  const { answerWithFallback } = await import('../../src/lib/xyro/gemini.js');
  const calls = [];
  const sse = (text) => new Response(`data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text }] }, finishReason: 'STOP' }] })}\n\n`, { status: 200 });
  const busy = () => new Response(JSON.stringify({ error: { code: 503, message: 'The model is overloaded.' } }), { status: 503 });
  const fetchImpl = async (url) => {
    const model = decodeURIComponent(String(url).match(/models\/([^:]+):/)[1]);
    calls.push(model);
    return model === 'gemini-x-flash' ? busy() : sse(`hello from ${model}`);
  };
  const switched = [];
  const out = await answerWithFallback({
    apiKey: 'TEST_KEY_PLACEHOLDER', model: 'gemini-x-flash', fallbacks: ['gemini-2.5-flash'], system: 's', history: [{ role: 'user', text: 'hi' }],
    fetchImpl, onModel: (m) => switched.push(m),
  });
  assert.equal(out, 'hello from gemini-2.5-flash');
  assert.deepEqual(calls, ['gemini-x-flash', 'gemini-x-flash', 'gemini-2.5-flash']); // one retry, then the fallback
  assert.deepEqual(switched, ['gemini-x-flash', 'gemini-2.5-flash']);

  const badKey = async () => new Response(JSON.stringify({ error: { code: 400, message: 'API key not valid. Please pass a valid API key.' } }), { status: 400 });
  await assert.rejects(
    answerWithFallback({ apiKey: 'TEST_KEY_PLACEHOLDER', model: 'a', fallbacks: ['b'], system: 's', history: [{ role: 'user', text: 'hi' }], fetchImpl: badKey }),
    (e) => e.code === 'invalid_key' && /not valid/.test(e.detail),
  );
});
