import type { ActiveRecallQuestion, QuizResult } from '../types/study';

/**
 * Small pieces of quiz logic that do not need storage or React:
 * a summary of earlier attempts, and turning missed quiz questions into
 * Active Recall questions.
 */

export type QuizHistory = {
  /** Finished attempts with at least one answer. */
  attempts: number;
  lastScore: number | null;
  bestScore: number | null;
  averageScore: number | null;
  /** Points up or down from the attempt before the last one. */
  change: number | null;
};

export function summarizeQuizHistory(results: QuizResult[], topicId: string): QuizHistory {
  const own = results
    .filter((result) => String(result.topicId) === String(topicId) && (result.answeredCount ?? result.questionCount) > 0)
    .sort((left, right) => new Date(left.completedAt).getTime() - new Date(right.completedAt).getTime());
  if (own.length === 0) return { attempts: 0, lastScore: null, bestScore: null, averageScore: null, change: null };

  const scores = own.map((result) => Math.max(0, Math.min(100, Math.round(result.score))));
  const last = scores[scores.length - 1];
  return {
    attempts: own.length,
    lastScore: last,
    bestScore: Math.max(...scores),
    averageScore: Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length),
    change: scores.length > 1 ? last - scores[scores.length - 2] : null,
  };
}

export type MissedQuestion = { question: string; correctAnswer: string; explanation?: string };

const normalize = (text: string) => text.trim().toLowerCase().replace(/\s+/g, ' ');

/**
 * Builds Active Recall questions from missed quiz questions. Questions the
 * topic already has are left out, so tapping twice never creates duplicates.
 */
export function missedToRecallQuestions(missed: MissedQuestion[], existing: ActiveRecallQuestion[], now: number = Date.now()): ActiveRecallQuestion[] {
  const seen = new Set(existing.map((item) => normalize(item.question)));
  const additions: ActiveRecallQuestion[] = [];
  for (const item of missed) {
    const question = item.question.trim();
    const correct = item.correctAnswer.trim();
    const key = normalize(question);
    if (!question || !correct || seen.has(key)) continue;
    seen.add(key);
    const explanation = item.explanation?.trim();
    additions.push({
      id: now + additions.length,
      question,
      answer: explanation ? `${correct}\n\n${explanation}` : correct,
      createdBy: 'ai',
    });
  }
  return additions;
}

/** Seconds as mm:ss for the countdown. */
export function formatCountdown(seconds: number) {
  const safe = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(safe / 60)).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`;
}
