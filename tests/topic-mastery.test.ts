import assert from 'node:assert/strict';
import { test } from 'node:test';

import { FADE_AFTER_DAYS, FADE_COMPLETE_DAYS, FADE_FLOOR, MASTERED_AT, MASTERY_TARGETS, MASTERY_WEIGHTS, calculateTopicMastery, getRetention, type TopicMasteryInput } from '../src/services/topic-mastery.ts';

const none = { again: 0, hard: 0, good: 0, easy: 0 };
const empty: TopicMasteryInput = { quizQuestions: 0, quizCorrect: 0, activeRecallQuestions: 0, activeRecallRatings: none, flashcardsReviewed: 0, reviewRatings: none, studyDays: 0 };
const full = (quality: number): TopicMasteryInput => ({
  quizQuestions: MASTERY_TARGETS.quizQuestions,
  quizCorrect: Math.round(MASTERY_TARGETS.quizQuestions * quality),
  activeRecallQuestions: MASTERY_TARGETS.recallAnswers,
  activeRecallRatings: { again: Math.round(MASTERY_TARGETS.recallAnswers * (1 - quality)), hard: 0, good: Math.round(MASTERY_TARGETS.recallAnswers * quality), easy: 0 },
  flashcardsReviewed: MASTERY_TARGETS.cardReviews,
  reviewRatings: { again: Math.round(MASTERY_TARGETS.cardReviews * (1 - quality)), hard: 0, good: Math.round(MASTERY_TARGETS.cardReviews * quality), easy: 0 },
  studyDays: MASTERY_TARGETS.studyDays,
});

test('the parts of the score add up to 100', () => {
  assert.equal(MASTERY_WEIGHTS.quiz + MASTERY_WEIGHTS.recall + MASTERY_WEIGHTS.cards + MASTERY_WEIGHTS.days, 100);
});

test('no practice gives no progress', () => {
  assert.equal(calculateTopicMastery(empty).score, 0);
});

test('a first study session moves the score only a few points', () => {
  const firstDay = calculateTopicMastery({ ...empty, quizQuestions: 10, quizCorrect: 9, activeRecallQuestions: 10, activeRecallRatings: { ...none, good: 10 }, flashcardsReviewed: 20, reviewRatings: { ...none, good: 20 }, studyDays: 1 });
  assert.ok(firstDay.score > 0 && firstDay.score <= 12, `first session scored ${firstDay.score}`);
});

test('trying every method once is far from completing a topic', () => {
  const tried = calculateTopicMastery({ ...empty, quizQuestions: 5, quizCorrect: 5, activeRecallQuestions: 5, activeRecallRatings: { ...none, easy: 5 }, flashcardsReviewed: 5, reviewRatings: { ...none, easy: 5 }, studyDays: 1 });
  assert.ok(tried.score < 10, `scored ${tried.score}`);
});

test('full volume with perfect results reaches 100, and only strong results complete the topic', () => {
  assert.equal(calculateTopicMastery(full(1)).score, 100);
  assert.ok(calculateTopicMastery(full(0.85)).score >= MASTERED_AT);
  assert.ok(calculateTopicMastery(full(0.6)).score < MASTERED_AT);
});

test('lots of practice with poor results does not complete a topic', () => {
  const struggling = calculateTopicMastery({ ...full(0.3), quizQuestions: 1000, quizCorrect: 300, flashcardsReviewed: 1000 });
  assert.ok(struggling.score < 50, `scored ${struggling.score}`);
});

test('more practice never lowers the score when results hold', () => {
  let previous = -1;
  for (let step = 0; step <= 20; step += 1) {
    const share = step / 20;
    const input = full(0.8);
    const score = calculateTopicMastery({
      ...input,
      quizQuestions: Math.round(input.quizQuestions * share), quizCorrect: Math.round(input.quizCorrect * share),
      activeRecallQuestions: Math.round(input.activeRecallQuestions * share),
      activeRecallRatings: { ...none, good: Math.round(input.activeRecallRatings.good * share), again: Math.round(input.activeRecallRatings.again * share) },
      flashcardsReviewed: Math.round(input.flashcardsReviewed * share),
      reviewRatings: { ...none, good: Math.round(input.reviewRatings.good * share), again: Math.round(input.reviewRatings.again * share) },
      studyDays: Math.round(input.studyDays * share),
    }).score;
    assert.ok(score >= previous, `score fell from ${previous} to ${score} at step ${step}`);
    previous = score;
  }
});

test('"hard" answers count half and unrated practice gets partial credit', () => {
  const hard = calculateTopicMastery({ ...empty, activeRecallQuestions: MASTERY_TARGETS.recallAnswers, activeRecallRatings: { ...none, hard: MASTERY_TARGETS.recallAnswers } });
  assert.equal(hard.parts.recall, 50);
  const unrated = calculateTopicMastery({ ...empty, flashcardsReviewed: MASTERY_TARGETS.cardReviews });
  assert.equal(unrated.parts.cards, 60);
});

test('damaged numbers cannot push the score outside 0 to 100', () => {
  const score = calculateTopicMastery({ ...full(1), quizCorrect: 99999, studyDays: 9999, flashcardsReviewed: -5 }).score;
  assert.ok(score >= 0 && score <= 100);
});

test('a topic keeps its full score for the first weeks after it was studied', () => {
  assert.equal(getRetention(0), 1);
  assert.equal(getRetention(FADE_AFTER_DAYS), 1);
  assert.equal(getRetention(null), 1);
  assert.equal(getRetention(undefined), 1);
});

test('the score fades steadily after that and never below the floor', () => {
  const middle = getRetention((FADE_AFTER_DAYS + FADE_COMPLETE_DAYS) / 2);
  assert.ok(Math.abs(middle - (1 + FADE_FLOOR) / 2) < 0.001);
  assert.equal(getRetention(FADE_COMPLETE_DAYS), FADE_FLOOR);
  assert.equal(getRetention(5000), FADE_FLOOR);
  let previous = 1;
  for (let day = 0; day <= 200; day += 1) {
    const retention = getRetention(day);
    assert.ok(retention <= previous && retention >= FADE_FLOOR);
    previous = retention;
  }
});

test('fading lowers the shown score but not the earned score, and studying again restores it', () => {
  const fresh = calculateTopicMastery({ ...full(0.9), daysSinceLastStudy: 2 });
  const stale = calculateTopicMastery({ ...full(0.9), daysSinceLastStudy: FADE_COMPLETE_DAYS });
  assert.equal(fresh.score, fresh.earnedScore);
  assert.equal(stale.earnedScore, fresh.earnedScore);
  assert.equal(stale.score, Math.round(fresh.earnedScore * FADE_FLOOR));
  assert.ok(fresh.score >= MASTERED_AT && stale.score < MASTERED_AT);
  assert.equal(calculateTopicMastery({ ...full(0.9), daysSinceLastStudy: 0 }).score, fresh.score);
});
