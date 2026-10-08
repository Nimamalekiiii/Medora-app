import type { QuizQuestion, QuizResult } from '@/types/study';

export type QuizDifficulty = 'easy' | 'medium' | 'hard';

const DIFFICULTY_ORDER: QuizDifficulty[] = ['easy', 'medium', 'hard'];

export function getInitialAdaptiveDifficulty(results: QuizResult[]): QuizDifficulty {
  const recent = [...results]
    .sort((left, right) => new Date(right.completedAt).getTime() - new Date(left.completedAt).getTime())
    .slice(0, 3);
  const totalQuestions = recent.reduce((sum, result) => sum + Math.max(0, result.answeredCount ?? result.questionCount), 0);
  const totalCorrect = recent.reduce((sum, result) => sum + Math.max(0, result.correctCount), 0);

  if (totalQuestions < 5) return 'medium';
  const accuracy = totalCorrect / totalQuestions;
  if (accuracy < 0.55) return 'easy';
  if (accuracy >= 0.82) return 'hard';
  return 'medium';
}

export function adjustAdaptiveDifficulty(current: QuizDifficulty, wasCorrect: boolean): QuizDifficulty {
  const currentIndex = DIFFICULTY_ORDER.indexOf(current);
  const nextIndex = Math.max(0, Math.min(DIFFICULTY_ORDER.length - 1, currentIndex + (wasCorrect ? 1 : -1)));
  return DIFFICULTY_ORDER[nextIndex];
}

export function selectAdaptiveQuestionIndex(
  questions: QuizQuestion[],
  usedIndexes: number[],
  preferredDifficulty: QuizDifficulty,
): number | null {
  const used = new Set(usedIndexes);
  let bestIndex: number | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  questions.forEach((question, index) => {
    if (used.has(index)) return;
    const questionDifficulty = question.difficulty ?? 'medium';
    const distance = Math.abs(DIFFICULTY_ORDER.indexOf(questionDifficulty) - DIFFICULTY_ORDER.indexOf(preferredDifficulty));
    if (distance < bestDistance) {
      bestIndex = index;
      bestDistance = distance;
    }
  });

  return bestIndex;
}
