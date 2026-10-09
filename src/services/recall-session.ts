import type { ActiveRecallQuestion } from '../types/study';

/**
 * Chooses which Active Recall questions a session shows.
 * This module is pure: no storage, no React.
 */

export type RecallMode = 'due' | 'difficult' | 'all';

function dueTime(question: ActiveRecallQuestion) {
  if (!question.nextReviewAt) return 0;
  const time = new Date(question.nextReviewAt).getTime();
  return Number.isFinite(time) ? time : 0;
}

/** A question is due when it has never been rated or its review date has passed. */
export function isRecallDue(question: ActiveRecallQuestion, now: number = Date.now()) {
  return dueTime(question) <= now;
}

/** Difficult means it has been rated Again or Hard at least as often as Good or Easy. */
export function isRecallDifficult(question: ActiveRecallQuestion) {
  const struggled = (question.againCount ?? 0) + (question.hardCount ?? 0);
  const remembered = (question.goodCount ?? 0) + (question.easyCount ?? 0);
  return struggled > 0 && struggled >= remembered;
}

/** Share of all ratings that were Good or Easy, 0–100, or null before the first rating. */
export function recallRememberedRate(questions: ActiveRecallQuestion[]): { rate: number | null; answers: number } {
  let remembered = 0;
  let answers = 0;
  for (const question of questions) {
    const good = (question.goodCount ?? 0) + (question.easyCount ?? 0);
    remembered += good;
    answers += good + (question.againCount ?? 0) + (question.hardCount ?? 0);
  }
  return { rate: answers ? Math.round((remembered / answers) * 100) : null, answers };
}

/** The questions for one session, the most overdue first. `count` 0 means no limit. */
export function buildRecallQueue(questions: ActiveRecallQuestion[], options: { mode: RecallMode; count?: number; now?: number }): ActiveRecallQuestion[] {
  const now = options.now ?? Date.now();
  const chosen = questions.filter((question) => {
    if (options.mode === 'due') return isRecallDue(question, now);
    if (options.mode === 'difficult') return isRecallDifficult(question);
    return true;
  });
  const sorted = [...chosen].sort((left, right) => dueTime(left) - dueTime(right));
  return options.count && options.count > 0 ? sorted.slice(0, options.count) : sorted;
}
