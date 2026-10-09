import type { Flashcard } from '../types/study';

/**
 * Chooses which flashcards a study session shows, and in what order.
 * This module is pure: no storage, no React.
 */

export type CardOrder = 'smart' | 'ordered' | 'shuffled';

export type SessionOptions = {
  /** Cards from this topic only. Leave out for every topic. */
  topicId?: string;
  /** 'due' shows only cards that are due now; 'practice' can include cards that are not due yet. */
  mode: 'due' | 'practice';
  order?: CardOrder;
  /** Most cards to show. 0 or leaving it out means no limit. */
  count?: number;
  now?: Date;
  /** Random source for shuffling, replaceable in tests. */
  random?: () => number;
};

/** When a card is due, as a timestamp. A card that has never been reviewed is due now. */
function dueTime(card: Flashcard, now: number) {
  if (!card.nextReviewAt) return now;
  const time = new Date(card.nextReviewAt).getTime();
  return Number.isFinite(time) ? time : now;
}

export function isCardDue(card: Flashcard, now: Date = new Date()) {
  return dueTime(card, now.getTime()) <= now.getTime();
}

export function buildCardQueue(cards: Flashcard[], options: SessionOptions): Flashcard[] {
  const now = (options.now ?? new Date()).getTime();
  const random = options.random ?? Math.random;
  let queue = cards.filter((card) => options.topicId === undefined || String(card.topicId) === String(options.topicId));
  if (options.mode === 'due') queue = queue.filter((card) => dueTime(card, now) <= now);

  const order: CardOrder = options.mode === 'due' ? 'smart' : options.order ?? 'smart';
  if (order === 'smart') {
    // Longest overdue first, then the cards that will be due soonest.
    queue = queue.map((card, index) => ({ card, index })).sort((a, b) => dueTime(a.card, now) - dueTime(b.card, now) || a.index - b.index).map((item) => item.card);
  } else if (order === 'shuffled') {
    queue = [...queue];
    for (let index = queue.length - 1; index > 0; index -= 1) {
      const swap = Math.floor(random() * (index + 1));
      [queue[index], queue[swap]] = [queue[swap], queue[index]];
    }
  }

  const limit = Math.floor(options.count ?? 0);
  return limit > 0 ? queue.slice(0, limit) : queue;
}
