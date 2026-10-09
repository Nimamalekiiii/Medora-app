/**
 * How far a student has come on one topic, from 0 to 100.
 *
 * Medical topics are large, so the score rewards volume and results over
 * time rather than having tried each study method once. Each part earns its
 * share only as the amount of practice approaches its target, scaled by how
 * well that practice went. One short session moves the score a few points;
 * reaching the top takes many sessions spread over several days.
 *
 * Knowledge fades without revision, so the score also falls slowly once a
 * topic has been left alone for a few weeks, and recovers when it is studied
 * again.
 *
 * This module is pure: no storage, no React.
 */

type Ratings = { again: number; hard: number; good: number; easy: number };

export type TopicMasteryInput = {
  quizQuestions: number;
  quizCorrect: number;
  activeRecallQuestions: number;
  activeRecallRatings: Ratings;
  flashcardsReviewed: number;
  reviewRatings: Ratings;
  /** Different calendar days with any study on the topic. */
  studyDays: number;
  /** Whole days since the topic was last studied. Leave out to skip fading. */
  daysSinceLastStudy?: number | null;
};

/** The amount of practice that earns a part its full share. */
export const MASTERY_TARGETS = { quizQuestions: 150, recallAnswers: 80, cardReviews: 150, studyDays: 12 } as const;
/** Share of the score each part can earn. Adds up to 100. */
export const MASTERY_WEIGHTS = { quiz: 40, recall: 25, cards: 25, days: 10 } as const;
/** A topic counts as completed from this score. */
export const MASTERED_AT = 80;
/** A topic keeps its full score for this long after it was last studied. */
export const FADE_AFTER_DAYS = 21;
/** After this long without study the score has fallen as far as it will. */
export const FADE_COMPLETE_DAYS = 120;
/** The lowest share of the earned score that is kept, however long the break. */
export const FADE_FLOOR = 0.5;
/** Used when practice was recorded without a self-rating. */
const UNRATED_QUALITY = 0.6;

export type TopicMastery = {
  /** The score shown to the student, after fading. */
  score: number;
  /** The score earned from practice, before fading. */
  earnedScore: number;
  /** Share of the earned score that is kept, from FADE_FLOOR to 1. */
  retention: number;
  /** Each part's own completion, 0 to 100, for showing what is holding the score back. */
  parts: { quiz: number; recall: number; cards: number; days: number };
};

const volume = (amount: number, target: number) => Math.min(1, Math.max(0, amount) / target);

/** Share of answers remembered: "hard" counts half, "again" counts nothing. */
function ratingQuality(ratings: Ratings): number | null {
  const total = ratings.again + ratings.hard + ratings.good + ratings.easy;
  if (total <= 0) return null;
  return (ratings.good + ratings.easy + ratings.hard * 0.5) / total;
}

/** How much of an earned score is kept after `days` without studying the topic. */
export function getRetention(days: number | null | undefined): number {
  if (days === null || days === undefined || !Number.isFinite(days) || days <= FADE_AFTER_DAYS) return 1;
  if (days >= FADE_COMPLETE_DAYS) return FADE_FLOOR;
  return 1 - ((days - FADE_AFTER_DAYS) / (FADE_COMPLETE_DAYS - FADE_AFTER_DAYS)) * (1 - FADE_FLOOR);
}

export function calculateTopicMastery(input: TopicMasteryInput): TopicMastery {
  const quizAccuracy = input.quizQuestions > 0 ? Math.min(1, Math.max(0, input.quizCorrect) / input.quizQuestions) : 0;
  const quiz = quizAccuracy * volume(input.quizQuestions, MASTERY_TARGETS.quizQuestions);

  const recallRated = input.activeRecallRatings.again + input.activeRecallRatings.hard + input.activeRecallRatings.good + input.activeRecallRatings.easy;
  const recall = (ratingQuality(input.activeRecallRatings) ?? UNRATED_QUALITY) * volume(Math.max(recallRated, input.activeRecallQuestions), MASTERY_TARGETS.recallAnswers);

  const cards = (ratingQuality(input.reviewRatings) ?? UNRATED_QUALITY) * volume(input.flashcardsReviewed, MASTERY_TARGETS.cardReviews);

  const days = volume(input.studyDays, MASTERY_TARGETS.studyDays);

  const earned = Math.min(100, quiz * MASTERY_WEIGHTS.quiz + recall * MASTERY_WEIGHTS.recall + cards * MASTERY_WEIGHTS.cards + days * MASTERY_WEIGHTS.days);
  const retention = getRetention(input.daysSinceLastStudy);
  const percent = (value: number) => Math.round(value * 100);
  return {
    score: Math.round(earned * retention),
    earnedScore: Math.round(earned),
    retention,
    parts: { quiz: percent(quiz), recall: percent(recall), cards: percent(cards), days: percent(days) },
  };
}
