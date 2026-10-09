import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
const { shortenReason } = require('../server/ai/study-analysis.js');

test('leaves a short reason unchanged apart from extra spaces', () => {
  assert.equal(shortenReason('  Your exam is in 5 days   and quiz accuracy is low. '), 'Your exam is in 5 days and quiz accuracy is low.');
});

test('cuts a long reason at the end of a sentence', () => {
  const first = `${'Cardiology has the nearest exam and your quiz accuracy there is the lowest of all topics'.padEnd(200, ' so start here')}.`;
  const result = shortenReason(`${first} ${'x'.repeat(200)}`);
  assert.ok(result.length <= 300);
  assert.ok(result.endsWith('.'));
});

test('cuts a long reason without a sentence break at a word and marks it', () => {
  const result = shortenReason(Array(80).fill('study').join(' '));
  assert.ok(result.length <= 300);
  assert.ok(result.endsWith('…'));
  assert.doesNotMatch(result, /stud…$/);
});
