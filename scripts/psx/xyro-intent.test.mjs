/** Xyro: reading a question before asking the model (src/lib/xyro/intent.js) and the lean prompt. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectPeriod, detectIntent, relevantRecords, withRecords, thinkingSteps } from '../../src/lib/xyro/intent.js';
import { buildRequest, thinkingFor } from '../../src/lib/xyro/gemini.js';
import { buildSnapshot } from '../../src/lib/xyro/context.js';

const TODAY = '2026-11-08';
const P = (q) => { const p = detectPeriod(q, TODAY); return p && [p.start, p.end, p.label]; };

test('periods: month names mean their latest occurrence; relative words resolve against today', () => {
  assert.deepEqual(P('What money did I make in June?'), ['2026-06-01', '2026-06-30', 'June 2026']);
  assert.deepEqual(P('spending in december'), ['2025-12-01', '2025-12-31', 'December 2025']); // not yet this year
  assert.deepEqual(P('income in Jun 2025'), ['2025-06-01', '2025-06-30', 'June 2025']);
  assert.deepEqual(P('this month so far'), ['2026-11-01', '2026-11-08', 'November 2026']);
  assert.deepEqual(P('last month'), ['2026-10-01', '2026-10-31', 'October 2026']);
  assert.deepEqual(P('this fiscal year'), ['2026-07-01', '2026-11-08', 'FY 2026-27']);
  assert.deepEqual(P('last fiscal year'), ['2025-07-01', '2026-06-30', 'FY 2025-26']);
  assert.deepEqual(P('FY25'), ['2025-07-01', '2026-06-30', 'FY 2025-26']);
  assert.deepEqual(P('dividends this year'), ['2026-01-01', '2026-11-08', '2026']);
  assert.deepEqual(P('what did I spend on 3 Nov'), ['2026-11-03', '2026-11-03', '2026-11-03']);
  assert.deepEqual(P('yesterday'), ['2026-11-07', '2026-11-07', 'yesterday']);
  assert.equal(P('what is my net worth'), null);
  assert.equal(P('may I see my funds'), null); // "may" the verb is not May
});

const tx = (date, type, amount, name, kind, notes) => ({ date, type, amount, notes, categories: { name, kind } });
const DATA = {
  transactions: [
    tx('2026-06-01', 'credit', '150000', 'Salary', 'active'),
    tx('2026-06-10', 'debit', '30000', 'Rent', 'spend', 'June rent'),
    tx('2026-07-05', 'debit', '1200', 'Food', 'spend'),
  ],
  dividends: [{ payment_date: '2026-06-20', symbol: 'MARI', shares: 10, gross_amount: '1000', tax_amount: '150', jh_tax_amount: '0', zakat_amount: '0', net_amount: '850' },
    { payment_date: '2025-12-20', symbol: 'OGDC', shares: 5, gross_amount: '500', tax_amount: '75', net_amount: '425' }],
  trades: [{ date: '2026-06-12', type: 'buy', symbol: 'MARI', quantity: 10, price: 600, fee: 12 }],
  categories: ['Salary', 'Rent', 'Food'],
  symbols: ['MARI', 'OGDC'],
};

test('records: only the rows the question is about travel with it', () => {
  const june = detectIntent('What money did I make in June?', { today: TODAY, ...DATA });
  assert.deepEqual(june.topics, ['income']);
  const r = relevantRecords(june, DATA);
  assert.match(r, /2026-06-01,in,Salary,active,150000\.00/);
  assert.doesNotMatch(r, /2026-07-05/);   // July is not asked about

  const rent = detectIntent('how much did I spend on rent?', { today: TODAY, ...DATA });
  assert.deepEqual(rent.categories, ['Rent']);
  assert.match(relevantRecords(rent, DATA), /June rent/);

  const mari = detectIntent('total dividends from MARI', { today: TODAY, ...DATA });
  const m = relevantRecords(mari, DATA);
  assert.match(m, /2026-06-20,MARI,10,1000\.00,150\.00,850\.00/);
  assert.doesNotMatch(m, /OGDC/);

  // Summary questions need no rows at all: the tables answer them.
  assert.equal(relevantRecords(detectIntent('what is my net worth?', { today: TODAY, ...DATA }), DATA), '');
});

test('the question as sent carries its period and records; the steps follow the intent', () => {
  const intent = detectIntent('What did I spend in June?', { today: TODAY, ...DATA });
  const sent = withRecords('What did I spend in June?', relevantRecords(intent, DATA), intent.period);
  assert.match(sent, /^What did I spend in June\?/);
  assert.match(sent, /Period asked about: June 2026 \(2026-06-01 to 2026-06-30\)/);
  assert.equal(withRecords('hi', '', null), 'hi');
  const steps = thinkingSteps(intent);
  assert.equal(steps[0], 'Reading your question');
  assert.ok(steps.includes('Looking at June 2026'));
  assert.ok(steps.includes('Going through your expenses'));
  assert.equal(steps.at(-1), 'Writing your answer');
});

test('speed: least thinking per model family, and the lean snapshot leaves the raw rows out', () => {
  assert.deepEqual(thinkingFor('gemini-2.5-flash'), { thinkingBudget: 0 });
  assert.deepEqual(thinkingFor('gemini-2.5-flash-lite'), { thinkingBudget: 0 });
  assert.deepEqual(thinkingFor('gemini-2.5-pro'), { thinkingBudget: 128 });
  assert.deepEqual(thinkingFor('gemini-3-flash'), { thinkingLevel: 'minimal' });
  assert.deepEqual(thinkingFor('gemini-3.5-flash-lite'), { thinkingLevel: 'minimal' });
  assert.deepEqual(thinkingFor('gemini-3.5-pro'), { thinkingLevel: 'low' });
  assert.equal(thinkingFor('gemini-2.0-flash'), null);
  const body = buildRequest({ system: 's', model: 'gemini-2.5-flash', history: [{ role: 'user', text: 'shown', apiText: 'sent with records' }] });
  assert.equal(body.contents[0].parts[0].text, 'sent with records');
  assert.deepEqual(body.generationConfig.thinkingConfig, { thinkingBudget: 0 });
  assert.equal(buildRequest({ system: 's', model: 'gemini-2.5-flash', history: [], thinking: false }).generationConfig.thinkingConfig, undefined);

  const full = buildSnapshot({ today: TODAY, transactions: DATA.transactions, dividends: DATA.dividends, trades: DATA.trades, events: [] });
  const lean = buildSnapshot({ today: TODAY, transactions: DATA.transactions, dividends: DATA.dividends, trades: DATA.trades, events: [] }, { rows: false });
  assert.match(full, /June rent/);
  assert.doesNotMatch(lean, /June rent/);
  assert.match(lean, /3 transactions, 2 dividend payments and 1 PSX trades exist/);
  assert.ok(lean.length < full.length);
});

test('speed: a model that never sends a first word is cut off and the next fast model answers', async () => {
  const { answerWithFallback, FAST_MODELS } = await import('../../src/lib/xyro/gemini.js');
  assert.equal(FAST_MODELS[0], 'gemini-3.5-flash-lite');
  const calls = [];
  const fetchImpl = (url, opts) => {
    const model = decodeURIComponent(String(url).match(/models\/([^:]+):/)[1]);
    calls.push(model);
    if (model === 'stuck-model') {
      // Never answers; only our timeout's abort ends it.
      return new Promise((_, reject) => opts.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))));
    }
    return Promise.resolve(new Response(`data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: 'fast answer' }] } }] })}\n\n`, { status: 200 }));
  };
  const t0 = Date.now();
  const out = await answerWithFallback({
    apiKey: 'TEST_KEY_PLACEHOLDER', model: 'stuck-model', fallbacks: ['gemini-2.5-flash'], system: 's', history: [{ role: 'user', text: 'hi' }],
    fetchImpl, firstWordMs: 150, idleMs: 150,
  });
  assert.equal(out, 'fast answer');
  assert.deepEqual(calls, ['stuck-model', 'gemini-2.5-flash']); // no second wait on the stuck one
  assert.ok(Date.now() - t0 < 2000);
});

test('speed: the user pressing stop is not mistaken for a slow model', async () => {
  const { answerWithFallback } = await import('../../src/lib/xyro/gemini.js');
  const ctrl = new AbortController();
  const fetchImpl = (url, opts) => new Promise((_, reject) => opts.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))));
  setTimeout(() => ctrl.abort(), 50);
  await assert.rejects(
    answerWithFallback({ apiKey: 'TEST_KEY_PLACEHOLDER', model: 'a', fallbacks: ['b'], system: 's', history: [{ role: 'user', text: 'hi' }], fetchImpl, signal: ctrl.signal, firstWordMs: 5000 }),
    (e) => e.name === 'AbortError',
  );
});

test('model choice: the fastest family the key can use, newest first, stable before preview; retired names never chosen', async () => {
  const { pickFastModels, modelsFor, GUESS_MODELS } = await import('../../src/lib/xyro/models.js');
  const available = ['gemini-2.5-pro', 'gemini-3.5-flash', 'gemini-3.5-flash-lite', 'gemini-3.5-flash-lite-preview-11-2026', 'gemini-3-flash', 'gemini-2.5-flash-image', 'gemini-3.5-pro', 'text-embedding-005'];
  assert.deepEqual(pickFastModels(available), ['gemini-3.5-flash-lite', 'gemini-3.5-flash-lite-preview-11-2026', 'gemini-3.5-flash', 'gemini-3-flash']);

  // No list cached: read it from Google once, keep it, choose from it.
  const store = new Map();
  globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: (k) => store.delete(k) };
  let listed = 0;
  const fetchImpl = async () => { listed += 1; return new Response(JSON.stringify({ models: available.map((id) => ({ name: `models/${id}`, supportedGenerationMethods: id.startsWith('text-') ? ['embedContent'] : ['generateContent'] })) }), { status: 200 }); };
  assert.equal((await modelsFor('u1', 'TEST_KEY_PLACEHOLDER', { fetchImpl }))[0], 'gemini-3.5-flash-lite');
  await modelsFor('u1', 'TEST_KEY_PLACEHOLDER', { fetchImpl });
  assert.equal(listed, 1); // cached for a day
  // Google unreachable and nothing cached: the newest known names, never the retired 2.0 ones.
  const down = await modelsFor('u2', 'TEST_KEY_PLACEHOLDER', { fetchImpl: async () => { throw new TypeError('offline'); } });
  assert.deepEqual(down, GUESS_MODELS);
  assert.ok(!down.some((m) => m.startsWith('gemini-2.0')));
  // A chosen model goes first with the fastest others behind it; one the key no longer lists is treated as automatic.
  const { chainFor } = await import('../../src/lib/xyro/models.js');
  assert.deepEqual(await chainFor('u1', 'TEST_KEY_PLACEHOLDER', 'gemini-3.5-flash', { fetchImpl }), ['gemini-3.5-flash', 'gemini-3.5-flash-lite', 'gemini-3.5-flash-lite-preview-11-2026', 'gemini-3-flash']);
  assert.equal((await chainFor('u1', 'TEST_KEY_PLACEHOLDER', 'gemini-2.0-flash', { fetchImpl }))[0], 'gemini-3.5-flash-lite');
  assert.equal((await chainFor('u1', 'TEST_KEY_PLACEHOLDER', 'auto', { fetchImpl }))[0], 'gemini-3.5-flash-lite');
  delete globalThis.localStorage;
});

test('instant answers: clear questions answered from the records exactly, no model needed', async () => {
  const { instantAnswer } = await import('../../src/lib/xyro/instant.js');
  const data = {
    ...DATA,
    dividends: [
      { payment_date: '2026-10-05', symbol: 'MARI', gross_amount: '1000.10', tax_amount: '150', jh_tax_amount: '0', zakat_amount: '0', net_amount: '850.10' },
      { payment_date: '2026-10-21', symbol: 'OGDC', gross_amount: '500', tax_amount: '75', net_amount: '425.20' },
      { payment_date: '2026-09-30', symbol: 'MARI', gross_amount: '900', tax_amount: '135', net_amount: '765' },
    ],
    events: [{ date: '2026-06-30', source: 'mutual_funds', net: '2000.50' }, { date: '2026-06-20', source: 'dividends', net: '850' }],
    worth: { value: 1000.3, funds: 600.1, stocks: 200, savings: 200.2 },
  };
  const ask = (q) => instantAnswer(q, detectIntent(q, { today: TODAY, ...data }), data);

  const oct = ask('How much dividend i get in october 2026');
  assert.match(oct, /^You received \*\*Rs 1,275\.30\*\* in dividends in October 2026, after tax\./); // 850.10 + 425.20, exact
  assert.match(oct, /\| MARI \| Rs 850\.10 \|/);
  assert.match(oct, /Tax and zakat withheld:\*\* Rs 225\.00/);

  assert.match(ask('total dividends from MARI'), /^You received \*\*Rs 1,615\.10\*\* in dividends from MARI in total/);
  assert.match(ask('what did I spend on rent?'), /^You spent \*\*Rs 30,000\.00\*\* on Rent in total\./);
  assert.match(ask('What money did I make in June?'), /^You made \*\*Rs 152,850\.50\*\* in June 2026\./); // 150,000 + 2,000.50 + 850
  assert.match(ask('what is my net worth'), /\*\*Rs 1,000\.30\*\*/);
  assert.match(ask('dividends in march 2026'), /no dividends/);

  // Anything needing judgement or a list still goes to the model.
  assert.equal(ask('compare my dividends in october and september'), null);
  assert.equal(ask('why did my spending go up in June?'), null);
  assert.equal(ask('list my biggest expenses this year'), null);
  assert.equal(ask('how are my funds doing?'), null);
});

test('notes: names in the question are found in transaction notes (employer, payee, merchant)', async () => {
  const { detectNoteTerms } = await import('../../src/lib/xyro/intent.js');
  const { instantAnswer } = await import('../../src/lib/xyro/instant.js');
  const t2 = (date, type, amount, name, kind, notes) => ({ date, type, amount, notes, categories: { name, kind } });
  const data = {
    transactions: [
      t2('2026-09-01', 'credit', '100000.10', 'Salary', 'active', 'Salary from 99 Technologies Sep'),
      t2('2026-10-01', 'credit', '100000.20', 'Salary', 'active', '99 technologies - October pay'),
      t2('2026-10-03', 'credit', '20000', 'Freelance', 'active', 'Upwork client'),
      t2('2026-10-04', 'debit', '1500', 'Transport', 'spend', 'Careem to office'),
      t2('2026-10-09', 'debit', '900', 'Transport', 'spend', 'careem ride'),
    ],
    dividends: [], events: [],
  };
  data.notes = data.transactions.map((t) => t.notes);
  data.categories = ['Salary', 'Freelance', 'Transport'];
  const intentOf = (q) => detectIntent(q, { today: TODAY, categories: data.categories, symbols: [], notes: data.notes });

  const terms = detectNoteTerms('how much salary i get from 99 technologies', data.notes, ['Salary']);
  assert.deepEqual(terms.map((x) => [x.words, x.text]), [[['99', 'technologies'], '99 Technologies']]);
  assert.deepEqual(detectNoteTerms('what is my net worth', data.notes), []);

  const salary = instantAnswer('how much salary i get from 99 technologies', intentOf('how much salary i get from 99 technologies'), data);
  assert.match(salary, /^You received \*\*Rs 200,000\.30\*\* from “99 Technologies” in total\./); // both months, exact
  assert.match(salary, /\| Oct 2026 \| Rs 100,000\.20 \|/);
  assert.match(salary, /Entries:\*\* 2, matched by the note/);

  const oct = instantAnswer('salary from 99 technologies in october', intentOf('salary from 99 technologies in october'), data);
  assert.match(oct, /^You received \*\*Rs 100,000\.20\*\* from “99 Technologies” in October 2026\./);

  const careem = instantAnswer('how much did I spend on careem', intentOf('how much did I spend on careem'), data);
  assert.match(careem, /^You paid \*\*Rs 2,400\.00\*\* to “Careem” in total\./);

  // The records sent to the model are the matching rows, with the note named.
  const rec = relevantRecords(intentOf('show my salary from 99 technologies'), data);
  assert.match(rec, /whose note mentions "99 Technologies"/);
  assert.doesNotMatch(rec, /Upwork/);
  assert.ok(thinkingSteps(intentOf('salary from 99 technologies')).includes('Searching notes for 99 Technologies'));
});
