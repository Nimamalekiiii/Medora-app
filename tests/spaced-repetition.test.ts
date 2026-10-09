import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  MAX_EASE_FACTOR,
  MAX_INTERVAL_DAYS,
  MIN_EASE_FACTOR,
  getCurrentIntervalDays,
  previewReviewIntervals,
  scheduleReview,
  type ReviewRating,
  type ReviewState,
} from '../src/services/spaced-repetition.ts';

const NOW = new Date(2026, 9, 8, 12, 0, 0);

function review(state: ReviewState, ratings: ReviewRating[]) {
  return ratings.reduce<ReviewState>((current, rating) => scheduleReview(current, rating, NOW), state);
}

test('a new card gets the starting interval for each rating', () => {
  assert.deepEqual(previewReviewIntervals({}, NOW), { again: 1, hard: 2, good: 4, easy: 7 });
});

test('intervals grow each time a card is remembered', () => {
  const intervals: number[] = [];
  let state: ReviewState = {};
  for (let i = 0; i < 5; i += 1) {
    state = scheduleReview(state, 'good', NOW);
    intervals.push(state.intervalDays ?? 0);
  }
  assert.deepEqual(intervals, [4, 10, 25, 63, 158]);
});

test('easy grows faster than good, and good faster than hard', () => {
  const known = review({}, ['good', 'good']);
  const next = previewReviewIntervals(known, NOW);
  assert.ok(next.easy > next.good && next.good > next.hard && next.hard > next.again);
});

test('forgetting a card resets its interval and records a lapse', () => {
  const known = review({}, ['good', 'good', 'good']);
  const forgotten = scheduleReview(known, 'again', NOW);
  assert.equal(forgotten.intervalDays, 1);
  assert.equal(forgotten.repetitions, 0);
  assert.equal(forgotten.lapses, 1);
  assert.ok(forgotten.easeFactor < (known.easeFactor ?? 0));
});

test('a forgotten card grows back more slowly than before', () => {
  const fresh = review({}, ['good', 'good']);
  const relearned = review(review({}, ['good', 'good', 'again']), ['good', 'good']);
  assert.ok((relearned.intervalDays ?? 0) < (fresh.intervalDays ?? 0) * 1.01);
  assert.ok((relearned.easeFactor ?? 0) < (fresh.easeFactor ?? 0));
});

test('ease factor stays within its limits', () => {
  const struggling = review({}, Array<ReviewRating>(20).fill('again'));
  const mastered = review({}, Array<ReviewRating>(20).fill('easy'));
  assert.equal(struggling.easeFactor, MIN_EASE_FACTOR);
  assert.equal(mastered.easeFactor, MAX_EASE_FACTOR);
});

test('intervals never exceed the maximum', () => {
  const mastered = review({}, Array<ReviewRating>(20).fill('easy'));
  assert.equal(mastered.intervalDays, MAX_INTERVAL_DAYS);
  assert.equal(scheduleReview(mastered, 'easy', NOW, 14).intervalDays, 14);
});

test('the next review date is the interval added to now', () => {
  const scheduled = scheduleReview({}, 'good', NOW);
  const expected = new Date(NOW);
  expected.setDate(expected.getDate() + 4);
  assert.equal(scheduled.nextReviewAt, expected.toISOString());
});

test('cards saved before scheduling state existed continue from their old interval', () => {
  const legacy: ReviewState = { lastReviewedAt: '2026-10-01T10:00:00.000Z', nextReviewAt: '2026-10-05T10:00:00.000Z' };
  assert.equal(getCurrentIntervalDays(legacy), 4);
  assert.equal(scheduleReview(legacy, 'good', NOW).intervalDays, 10);
});

test('damaged scheduling values fall back to a new card', () => {
  const damaged = { intervalDays: Number.NaN, easeFactor: Number.POSITIVE_INFINITY, nextReviewAt: 'not a date', lastReviewedAt: 'x' };
  assert.deepEqual(previewReviewIntervals(damaged, NOW), { again: 1, hard: 2, good: 4, easy: 7 });
});
