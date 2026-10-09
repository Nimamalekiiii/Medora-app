import assert from 'node:assert/strict';
import { test } from 'node:test';

import { DAILY_QUOTES } from '../src/constants/daily-quotes.ts';
import { calculateStreak, dailyIndex, greetingPeriod, summarizePeriod, type HomeActivity } from '../src/services/home-summary.ts';

// Friday 9 October 2026, 10:00.
const NOW = new Date(2026, 9, 9, 10, 0, 0);
const at = (daysAgo: number, hour = 9) => new Date(2026, 9, 9 - daysAgo, hour, 0, 0).toISOString();
const quiz = (daysAgo: number, questions: number, correct: number, minutes = 10): HomeActivity => ({ activity: 'quiz', completedAt: at(daysAgo), durationSeconds: minutes * 60, questionCount: questions, correctCount: correct });
const focus = (daysAgo: number, minutes: number): HomeActivity => ({ activity: 'focus', completedAt: at(daysAgo), durationSeconds: minutes * 60, questionCount: 0 });

const activities = [quiz(0, 10, 8), focus(2, 30), quiz(6, 10, 4), quiz(8, 10, 9, 20), focus(20, 60), quiz(40, 10, 10, 5)];

test('seven days covers today and the six days before, compared with the week before', () => {
  const week = summarizePeriod(activities, '7d', NOW);
  assert.equal(week.studyMinutes, 50);
  assert.equal(week.sessions, 3);
  assert.equal(week.quizAccuracy, 60);
  assert.equal(week.studyMinutesChange, 30);
  assert.equal(week.quizAccuracyChange, -30);
});

test('thirty days compares with the thirty days before', () => {
  const month = summarizePeriod(activities, '30d', NOW);
  assert.equal(month.studyMinutes, 130);
  assert.equal(month.quizAccuracy, 70);
  assert.equal(month.studyMinutesChange, 125);
  assert.equal(month.quizAccuracyChange, -30);
});

test('all time has totals and nothing to compare with', () => {
  const all = summarizePeriod(activities, 'all', NOW);
  assert.equal(all.studyMinutes, 135);
  assert.equal(all.quizAccuracy, 78);
  assert.equal(all.studyMinutesChange, null);
  assert.equal(all.quizAccuracyChange, null);
});

test('an empty history has no numbers and no changes', () => {
  assert.deepEqual(summarizePeriod([], '7d', NOW), { studyMinutes: 0, studyMinutesChange: null, quizAccuracy: null, quizAccuracyChange: null, sessions: 0 });
  assert.equal(summarizePeriod([{ activity: 'quiz', completedAt: 'bad date', durationSeconds: 600 }], 'all', NOW).studyMinutes, 0);
});

test('the streak counts days in a row and survives a day that has not started yet', () => {
  assert.equal(calculateStreak([focus(0, 10), focus(1, 10), focus(2, 10), focus(4, 10)], NOW), 3);
  assert.equal(calculateStreak([focus(1, 10), focus(2, 10)], NOW), 2);
  assert.equal(calculateStreak([focus(2, 10), focus(3, 10)], NOW), 0);
  assert.equal(calculateStreak([], NOW), 0);
});

test('the daily line stays the same all day and moves on by one each day', () => {
  const today = dailyIndex('2026-10-09', 50);
  assert.equal(dailyIndex('2026-10-09', 50), today);
  assert.equal(dailyIndex('2026-10-10', 50), (today + 1) % 50);
  assert.equal(dailyIndex('2026-11-28', 50), today);
  assert.equal(dailyIndex('not-a-date', 50) >= 0, true);
  assert.equal(dailyIndex('2026-10-09', 0), 0);
});

test('there are fifty different motivation lines in both languages', () => {
  assert.equal(DAILY_QUOTES.length, 50);
  assert.equal(new Set(DAILY_QUOTES.map((quote) => quote.en)).size, 50);
  assert.equal(new Set(DAILY_QUOTES.map((quote) => quote.no)).size, 50);
  assert.equal(DAILY_QUOTES.every((quote) => quote.en.trim().length > 0 && quote.no.trim().length > 0 && quote.en.length <= 80 && quote.no.length <= 80), true);
});

test('the greeting follows the time of day', () => {
  assert.equal(greetingPeriod(7), 'morning');
  assert.equal(greetingPeriod(13), 'afternoon');
  assert.equal(greetingPeriod(20), 'evening');
  assert.equal(greetingPeriod(2), 'evening');
});
