/**
 * Spaced repetition scheduling for flashcards and Active Recall questions.
 *
 * Each card keeps its own interval and ease factor, so the gap between
 * reviews grows while the card is remembered and resets when it is forgotten
 * (an SM-2 style schedule). This module is pure: no storage, no React.
 */

export type ReviewRating = 'again' | 'hard' | 'good' | 'easy';

/** Scheduling fields stored on a card. All optional so older cards still load. */
export type ReviewState = {
  intervalDays?: number;
  easeFactor?: number;
  repetitions?: number;
  lapses?: number;
  /** Used only to estimate the interval of cards saved before scheduling state existed. */
  lastReviewedAt?: string;
  nextReviewAt?: string;
};

export type ScheduledReview = {
  intervalDays: number;
  easeFactor: number;
  repetitions: number;
  lapses: number;
  nextReviewAt: string;
};

export const DEFAULT_EASE_FACTOR = 2.5;
export const MIN_EASE_FACTOR = 1.3;
export const MAX_EASE_FACTOR = 3;
export const MAX_INTERVAL_DAYS = 180;

/** First-review intervals, matching what Medora used before intervals grew. */
const FIRST_INTERVAL_DAYS: Record<ReviewRating, number> = { again: 1, hard: 2, good: 4, easy: 7 };
const EASE_CHANGE: Record<ReviewRating, number> = { again: -0.2, hard: -0.15, good: 0, easy: 0.15 };
const EASY_BONUS = 1.3;
const HARD_MULTIPLIER = 1.2;
const DAY_MS = 24 * 60 * 60 * 1000;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function validNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * The interval the card was last given. Cards reviewed before scheduling state
 * was stored fall back to the gap between their last and next review dates.
 */
export function getCurrentIntervalDays(state: ReviewState): number {
  if (validNumber(state.intervalDays) && state.intervalDays > 0) return state.intervalDays;
  if (!state.lastReviewedAt || !state.nextReviewAt) return 0;
  const last = new Date(state.lastReviewedAt).getTime();
  const next = new Date(state.nextReviewAt).getTime();
  if (!Number.isFinite(last) || !Number.isFinite(next) || next <= last) return 0;
  return Math.max(1, Math.round((next - last) / DAY_MS));
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

/** Work out the next review for a card from how well it was just remembered. */
export function scheduleReview(
  state: ReviewState,
  rating: ReviewRating,
  now: Date = new Date(),
  maxIntervalDays: number = MAX_INTERVAL_DAYS,
): ScheduledReview {
  const previousInterval = getCurrentIntervalDays(state);
  const previousEase = validNumber(state.easeFactor) ? state.easeFactor : DEFAULT_EASE_FACTOR;
  const previousRepetitions = validNumber(state.repetitions) ? Math.max(0, state.repetitions) : previousInterval > 0 ? 1 : 0;
  const lapses = validNumber(state.lapses) ? Math.max(0, state.lapses) : 0;
  const easeFactor = clamp(Math.round((previousEase + EASE_CHANGE[rating]) * 100) / 100, MIN_EASE_FACTOR, MAX_EASE_FACTOR);
  const isFirstSuccessfulReview = previousInterval === 0 || previousRepetitions === 0;

  let intervalDays: number;
  let repetitions: number;

  if (rating === 'again') {
    // Forgotten: start the card over, but keep its (lowered) ease so it grows more slowly.
    intervalDays = FIRST_INTERVAL_DAYS.again;
    repetitions = 0;
  } else if (isFirstSuccessfulReview) {
    intervalDays = FIRST_INTERVAL_DAYS[rating];
    repetitions = 1;
  } else {
    const multiplier = rating === 'hard' ? HARD_MULTIPLIER : rating === 'good' ? easeFactor : easeFactor * EASY_BONUS;
    // Always move at least one day further out than last time.
    intervalDays = Math.max(previousInterval + 1, Math.round(previousInterval * multiplier));
    repetitions = previousRepetitions + 1;
  }

  intervalDays = clamp(intervalDays, 1, Math.max(1, Math.floor(maxIntervalDays)));

  return {
    intervalDays,
    easeFactor,
    repetitions,
    lapses: rating === 'again' ? lapses + 1 : lapses,
    nextReviewAt: addDays(now, intervalDays).toISOString(),
  };
}

/** The interval each rating would give right now, for labelling the rating buttons. */
export function previewReviewIntervals(
  state: ReviewState,
  now: Date = new Date(),
  maxIntervalDays: number = MAX_INTERVAL_DAYS,
): Record<ReviewRating, number> {
  return {
    again: scheduleReview(state, 'again', now, maxIntervalDays).intervalDays,
    hard: scheduleReview(state, 'hard', now, maxIntervalDays).intervalDays,
    good: scheduleReview(state, 'good', now, maxIntervalDays).intervalDays,
    easy: scheduleReview(state, 'easy', now, maxIntervalDays).intervalDays,
  };
}
