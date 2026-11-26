/**
 * Upcoming dividends wording (src/lib/psx/upcomingDividends.js): "Check now" reports what is waiting for the user,
 * never PSX's raw announcement count (client report 2026-11-26: "8 announced" while every one was already recorded).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkSummary } from '../../src/lib/psx/upcomingDividends.js';

test('nothing waiting, all recorded → up to date, no "announced" count', () => {
  const r = checkSummary({ found: new Array(8).fill({}), sync: { announcements: 8, pending: 6, matched: 0, waiting: 0, recorded: 7 } });
  assert.equal(r.title, 'You’re up to date');
  assert.match(r.text, /No dividends waiting\. The 7 recent dividends announced on your stocks are already recorded\./);
  assert.doesNotMatch(r.text, /8/);
});

test('some waiting → the waiting count leads; recorded ones mentioned', () => {
  assert.deepEqual(checkSummary({ sync: { waiting: 1, recorded: 2 } }), {
    tone: 'success', title: '1 dividend to confirm',
    text: '1 dividend announced on your stocks is waiting for you to confirm when paid. 2 recent ones are already recorded.',
  });
  assert.equal(checkSummary({ sync: { waiting: 3, recorded: 0 } }).title, '3 dividends to confirm');
});

test('nothing at all, and an older server without counts falls back to the pending list', () => {
  assert.match(checkSummary({ sync: { waiting: 0, recorded: 0 } }).text, /No cash dividends announced on your stocks right now/);
  assert.equal(checkSummary({ found: [{}, {}], sync: { pending: 2 } }, 0).title, 'You’re up to date');
  assert.equal(checkSummary({ sync: {} }, 2).title, '2 dividends to confirm');
  assert.equal(checkSummary(null).tone, 'info');
});
