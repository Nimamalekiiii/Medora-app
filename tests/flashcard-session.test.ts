import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildCardQueue, isCardDue } from '../src/services/flashcard-session.ts';
import type { Flashcard } from '../src/types/study.ts';

const NOW = new Date(2026, 9, 8, 12, 0, 0);
const day = (offset: number) => new Date(2026, 9, 8 + offset, 9, 0, 0).toISOString();
const card = (id: string, topicId: string, nextReviewAt?: string): Flashcard => ({ id, topicId, topicName: 'T', front: `q${id}`, back: `a${id}`, createdAt: day(-9), nextReviewAt });

const cards = [card('a', '1', day(3)), card('b', '1'), card('c', '1', day(-4)), card('d', '2', day(-1)), card('e', '1', day(1)), card('f', '1', 'not a date')];
const ids = (list: Flashcard[]) => list.map((item) => item.id).join('');

test('a card is due when it has never been reviewed or its date has passed', () => {
  assert.equal(isCardDue(card('x', '1'), NOW), true);
  assert.equal(isCardDue(card('x', '1', day(-1)), NOW), true);
  assert.equal(isCardDue(card('x', '1', day(1)), NOW), false);
  assert.equal(isCardDue(card('x', '1', 'not a date'), NOW), true);
});

test('a due session shows only due cards, longest overdue first', () => {
  assert.equal(ids(buildCardQueue(cards, { mode: 'due', topicId: '1', now: NOW })), 'cbf');
  assert.equal(ids(buildCardQueue(cards, { mode: 'due', now: NOW })), 'cdbf');
});

test('practice includes cards that are not due yet, due ones first', () => {
  assert.equal(ids(buildCardQueue(cards, { mode: 'practice', topicId: '1', order: 'smart', now: NOW })), 'cbfea');
});

test('ordered practice keeps the saved order and the count limits the session', () => {
  assert.equal(ids(buildCardQueue(cards, { mode: 'practice', topicId: '1', order: 'ordered', now: NOW })), 'abcef');
  assert.equal(ids(buildCardQueue(cards, { mode: 'practice', topicId: '1', order: 'ordered', count: 2, now: NOW })), 'ab');
  assert.equal(buildCardQueue(cards, { mode: 'practice', topicId: '1', order: 'ordered', count: 0, now: NOW }).length, 5);
});

test('shuffled practice shows every card exactly once', () => {
  let seed = 7;
  const random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const shuffled = buildCardQueue(cards, { mode: 'practice', topicId: '1', order: 'shuffled', now: NOW, random });
  assert.equal(shuffled.length, 5);
  assert.equal([...ids(shuffled)].sort().join(''), 'abcef');
  assert.notEqual(ids(shuffled), 'abcef');
});

test('a topic without cards gives an empty session', () => {
  assert.deepEqual(buildCardQueue(cards, { mode: 'due', topicId: '99', now: NOW }), []);
  assert.deepEqual(buildCardQueue([], { mode: 'practice', now: NOW }), []);
});
