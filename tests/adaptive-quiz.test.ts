import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  adjustAdaptiveDifficulty,
  getInitialAdaptiveDifficulty,
  selectAdaptiveQuestionIndex,
} from '../src/services/adaptive-quiz.ts';
import type { QuizQuestion, QuizResult } from '../src/types/study.ts';

function result(correctCount: number, questionCount: number, completedAt: string): QuizResult {
  return {
    id: completedAt, topicId: '1', topicName: 'Cardiology', completedAt, questionCount, correctCount,
    wrongCount: questionCount - correctCount, score: Math.round((correctCount / questionCount) * 100), durationSeconds: 60,
  };
}

function question(id: string, difficulty?: QuizQuestion['difficulty']): QuizQuestion {
  return { id, question: id, options: ['a', 'b', 'c', 'd'], correctAnswer: 'a', difficulty };
}

test('starts at medium without enough quiz history', () => {
  assert.equal(getInitialAdaptiveDifficulty([]), 'medium');
  assert.equal(getInitialAdaptiveDifficulty([result(4, 4, '2026-10-01T10:00:00Z')]), 'medium');
});

test('starts easier after weak results and harder after strong ones', () => {
  assert.equal(getInitialAdaptiveDifficulty([result(4, 10, '2026-10-01T10:00:00Z')]), 'easy');
  assert.equal(getInitialAdaptiveDifficulty([result(7, 10, '2026-10-01T10:00:00Z')]), 'medium');
  assert.equal(getInitialAdaptiveDifficulty([result(9, 10, '2026-10-01T10:00:00Z')]), 'hard');
});

test('only the three most recent quizzes decide the starting level', () => {
  const results = [
    result(0, 10, '2026-09-01T10:00:00Z'),
    result(9, 10, '2026-10-01T10:00:00Z'),
    result(9, 10, '2026-10-02T10:00:00Z'),
    result(9, 10, '2026-10-03T10:00:00Z'),
  ];
  assert.equal(getInitialAdaptiveDifficulty(results), 'hard');
});

test('difficulty steps up after a correct answer and down after a wrong one', () => {
  assert.equal(adjustAdaptiveDifficulty('medium', true), 'hard');
  assert.equal(adjustAdaptiveDifficulty('medium', false), 'easy');
  assert.equal(adjustAdaptiveDifficulty('hard', true), 'hard');
  assert.equal(adjustAdaptiveDifficulty('easy', false), 'easy');
});

test('picks the unused question closest to the wanted difficulty', () => {
  const questions = [question('e', 'easy'), question('m', 'medium'), question('h', 'hard'), question('unset')];
  assert.equal(selectAdaptiveQuestionIndex(questions, [], 'hard'), 2);
  assert.equal(selectAdaptiveQuestionIndex(questions, [2], 'hard'), 1);
  assert.equal(selectAdaptiveQuestionIndex(questions, [1], 'medium'), 3);
  assert.equal(selectAdaptiveQuestionIndex(questions, [0, 1, 2, 3], 'easy'), null);
});
