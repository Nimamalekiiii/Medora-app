import assert from 'node:assert/strict';
import { test } from 'node:test';

import { formatCountdown, missedToRecallQuestions, summarizeQuizHistory } from '../src/services/quiz-session.ts';
import { buildRecallQueue, isRecallDifficult, isRecallDue, recallRememberedRate } from '../src/services/recall-session.ts';
import type { ActiveRecallQuestion, QuizResult } from '../src/types/study.ts';

const NOW = new Date(2026, 9, 9, 12, 0, 0).getTime();
const day = (offset: number) => new Date(2026, 9, 9 + offset, 9, 0, 0).toISOString();

const result = (topicId: string, score: number, offset: number, answered = 10): QuizResult => ({
  id: `${topicId}-${offset}`, topicId, topicName: 'T', completedAt: day(offset), questionCount: answered,
  correctCount: Math.round((score / 100) * answered), wrongCount: 0, score, durationSeconds: 60, answeredCount: answered,
});

test('quiz history is empty before the first attempt', () => {
  assert.deepEqual(summarizeQuizHistory([], '1'), { attempts: 0, lastScore: null, bestScore: null, averageScore: null, change: null });
});

test('quiz history uses only this topic, in date order, and skips attempts without answers', () => {
  const history = summarizeQuizHistory([result('1', 80, -1), result('1', 50, -5), result('2', 100, -2), result('1', 90, -3), result('1', 0, 0, 0)], '1');
  assert.equal(history.attempts, 3);
  assert.equal(history.lastScore, 80);
  assert.equal(history.bestScore, 90);
  assert.equal(history.averageScore, 73);
  assert.equal(history.change, -10);
});

test('one attempt has no change value', () => {
  assert.equal(summarizeQuizHistory([result('1', 60, -1)], '1').change, null);
});

test('missed quiz questions become recall questions without duplicates', () => {
  const existing: ActiveRecallQuestion[] = [{ id: 1, question: 'What is  the vagus nerve?', answer: 'CN X' }];
  const added = missedToRecallQuestions([
    { question: 'what is the Vagus nerve?', correctAnswer: 'CN X' },
    { question: 'Which artery supplies the SA node?', correctAnswer: 'Right coronary artery', explanation: 'In about 60 % of people.' },
    { question: 'Which artery supplies the SA node?', correctAnswer: 'Right coronary artery' },
    { question: '  ', correctAnswer: 'x' },
  ], existing, 1000);
  assert.equal(added.length, 1);
  assert.equal(added[0].id, 1000);
  assert.equal(added[0].answer, 'Right coronary artery\n\nIn about 60 % of people.');
  assert.equal(added[0].createdBy, 'ai');
});

test('countdown is shown as mm:ss', () => {
  assert.equal(formatCountdown(0), '00:00');
  assert.equal(formatCountdown(65), '01:05');
  assert.equal(formatCountdown(1200), '20:00');
  assert.equal(formatCountdown(-4), '00:00');
});

const q = (id: number, extra: Partial<ActiveRecallQuestion> = {}): ActiveRecallQuestion => ({ id, question: `q${id}`, answer: `a${id}`, ...extra });
const pool = [
  q(1, { nextReviewAt: day(3), goodCount: 2 }),
  q(2),
  q(3, { nextReviewAt: day(-4), againCount: 2, goodCount: 1 }),
  q(4, { nextReviewAt: day(-1), hardCount: 1, easyCount: 1 }),
  q(5, { nextReviewAt: 'not a date' }),
];
const ids = (list: ActiveRecallQuestion[]) => list.map((item) => item.id).join('');

test('a recall question is due when never rated or its date has passed', () => {
  assert.equal(isRecallDue(pool[0], NOW), false);
  assert.equal(isRecallDue(pool[1], NOW), true);
  assert.equal(isRecallDue(pool[2], NOW), true);
  assert.equal(isRecallDue(pool[4], NOW), true);
});

test('difficult means struggled at least as often as remembered', () => {
  assert.equal(isRecallDifficult(pool[0]), false);
  assert.equal(isRecallDifficult(pool[1]), false);
  assert.equal(isRecallDifficult(pool[2]), true);
  assert.equal(isRecallDifficult(pool[3]), true);
});

test('the recall queue filters by mode, puts the most overdue first and respects the limit', () => {
  assert.equal(ids(buildRecallQueue(pool, { mode: 'due', now: NOW })), '2534');
  assert.equal(ids(buildRecallQueue(pool, { mode: 'difficult', now: NOW })), '34');
  assert.equal(ids(buildRecallQueue(pool, { mode: 'all', now: NOW })), '25341');
  assert.equal(ids(buildRecallQueue(pool, { mode: 'all', count: 2, now: NOW })), '25');
  assert.equal(ids(buildRecallQueue(pool, { mode: 'all', count: 0, now: NOW })), '25341');
});

test('remembered rate counts good and easy against all ratings', () => {
  assert.deepEqual(recallRememberedRate([q(1)]), { rate: null, answers: 0 });
  assert.deepEqual(recallRememberedRate(pool), { rate: 57, answers: 7 });
});
