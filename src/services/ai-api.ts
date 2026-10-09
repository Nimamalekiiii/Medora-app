import type { QuizQuestion } from '../types/study';
import Constants from 'expo-constants';
import { getAppPreferences, type AIDifficulty, type AIExplanationStyle } from './storage';
import { getSupabaseClient, readSavedSession } from './supabase';

export type AIStudyAnalysis = {
  topicId: string;
  topicName: string;
  subjectId: string;
  subjectName: string;
  priority: 'low' | 'medium' | 'high';
  reason: string;
  recommendedActivities: ('active_recall' | 'quiz' | 'review' | 'flashcards')[];
  estimatedMinutes: number;
};

export type GeneratedFlashcard = { front: string; back: string };
export type GeneratedActiveRecall = { question: string; answer: string };
export type AIProgressInsight = { overview: string; nextStep: string; recommendedTopicId: string | null };
export type AITopicInsight = { overview: string; nextStep: string };
export type AITopicProgressInput = {
  language: 'en' | 'no';
  topic: { id: string; name: string; subjectName: string };
  metrics: {
    practiceProgress: number;
    quizAccuracy: number | null;
    quizQuestions: number;
    quizCorrect: number;
    activeRecallQuestions: number;
    activeRecallAgain: number;
    activeRecallHard: number;
    flashcardsTotal: number;
    flashcardsReviewed: number;
    flashcardsDue: number;
    studySessions: number;
    studyMinutes: number;
    lastStudiedAt: string | null;
    daysUntilExam: number | null;
    troubledQuestions: string[];
  };
  preferredMethods: string[];
};
export type AIProgressInput = {
  language: 'en' | 'no';
  totals: {
    readinessScore: number;
    topicsStarted: number;
    totalTopics: number;
    topicsNotStarted: number;
    quizAccuracy: number | null;
    activeRecallCoverage: number;
    reviewCoverage: number;
    flashcardCoverage: number;
    allTimeStudyDays: number;
    currentStreak: number;
  };
  last7Days: {
    sessions: number;
    activeRecallQuestions: number;
    activeRecallRatings: { again: number; hard: number; good: number; easy: number };
    quizQuestions: number;
    quizAccuracy: number | null;
    flashcardsReviewed: number;
    reviewSessions: number;
    reviewRatings: { hard: number; good: number; easy: number };
    focusMinutes: number;
    studyDays: number;
  };
  last30Days: {
    sessions: number;
    activeRecallQuestions: number;
    activeRecallRatings: { again: number; hard: number; good: number; easy: number };
    quizQuestions: number;
    quizAccuracy: number | null;
    flashcardsReviewed: number;
    reviewSessions: number;
    reviewRatings: { hard: number; good: number; easy: number };
    focusMinutes: number;
    studyDays: number;
  };
  accuracyTrend: {
    last7Days: Array<{ date: string; quizQuestions: number; quizAccuracy: number | null }>;
    last30Days: Array<{ date: string; quizQuestions: number; quizAccuracy: number | null }>;
  };
  subjects: Array<{ id: string; name: string; topicCount: number; topicsStarted: number; quizAccuracy: number | null }>;
  upcomingExams: Array<{ subjectId: string; subjectName: string; date: string; type: string; daysUntil: number; topicsIncluded: number; includedTopicNames: string[] }>;
  candidateTopics: Array<{ id: string; name: string; subjectName: string; started: boolean; quizAccuracy: number | null; quizQuestions: number; activeRecallQuestions: number; activeRecallRatings: { again: number; hard: number; good: number; easy: number }; flashcardsReviewed: number; reviewSessions: number; reviewRatings: { again: number; hard: number; good: number; easy: number }; methodCoverage: number; lastStudiedAt: string | null; reason: string }>;
  studyPreferences: { dailyGoalMinutes: number; studyDays: number[]; sessionLengthMinutes: number; breakDurationMinutes: number; preferredStudyTime: string; preferredMethods: string[]; prioritizeWeakTopics: boolean; prioritizeUpcomingExams: boolean; includeReviewSessions: boolean; includeFlashcards: boolean; includeQuizzes: boolean };
  studyPlans: Array<{ subjectId: string; studyDays: number[]; dailyStudyMinutes: number }>;
};
export type GenerationProgress = (completed: number, total: number) => void;

const configuredUrl = (process.env.EXPO_PUBLIC_MEDEXAM_API_URL || '').trim();
const metroHost = Constants.expoConfig?.hostUri?.split(':')[0];
const API_URL = (configuredUrl || (__DEV__ && metroHost ? `http://${metroHost}:3000` : '')).replace(/\/+$/, '');

function getApiUrl() {
  if (!API_URL) {
    throw new Error('Medora AI is not connected yet. Set EXPO_PUBLIC_MEDEXAM_API_URL to the secure AI server address and rebuild the app.');
  }
  return API_URL;
}

async function post<T>(path: string, body: unknown, timeoutMs = 60_000): Promise<T> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error('Sign in to Medora before using AI study tools.');
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw new Error('Your sign-in could not be checked. Please sign in again.');
  if (!session?.access_token) {
    // Signed in on this device, but the sign-in could not be refreshed: a connection problem, not a missing account.
    if (await readSavedSession()) throw new Error('Could not reach Medora. Check your connection and try again.');
    throw new Error('Sign in to Medora before using AI study tools.');
  }

  // Every request says which language the app is in, so the AI answers in it.
  let payload = body;
  if (body && typeof body === 'object' && !Array.isArray(body) && !('language' in body)) {
    const language = await getAppPreferences().then((preferences) => preferences.language).catch(() => 'en' as const);
    payload = { ...body, language };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${getApiUrl()}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data?.success) {
      throw new Error(data?.message || `Request failed (${response.status}).`);
    }
    return data as T;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('This is taking too long. Check the connection and try again.');
    }
    if (error instanceof TypeError) {
      throw new Error('Could not reach the Medora AI server. Check its address and connection.');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function getAIStudyAnalysis(studyData: unknown): Promise<AIStudyAnalysis> {
  const data = await post<{ analysis?: AIStudyAnalysis }>('/ai/analyze-study', studyData);
  const analysis = data.analysis;
  if (!analysis || typeof analysis.topicId !== 'string' || typeof analysis.subjectId !== 'string' ||
    typeof analysis.topicName !== 'string' || typeof analysis.subjectName !== 'string' ||
    !['low', 'medium', 'high'].includes(analysis.priority) || typeof analysis.reason !== 'string' ||
    !analysis.reason.trim() || analysis.reason.length > 600 ||
    !Array.isArray(analysis.recommendedActivities) || analysis.recommendedActivities.length === 0 || !analysis.recommendedActivities.every((activity) => ['active_recall', 'quiz', 'review', 'flashcards'].includes(activity)) || !Number.isInteger(analysis.estimatedMinutes) ||
    analysis.estimatedMinutes < 5 || analysis.estimatedMinutes > 180) {
    throw new Error('The AI returned an incomplete study suggestion.');
  }
  return analysis;
}

export async function getAIProgressInsight(progress: AIProgressInput): Promise<AIProgressInsight> {
  const data = await post<{ insight?: AIProgressInsight }>('/ai/analyze-progress', progress);
  if (!data.insight || typeof data.insight.overview !== 'string' || typeof data.insight.nextStep !== 'string' ||
    !(data.insight.recommendedTopicId === null || typeof data.insight.recommendedTopicId === 'string') ||
    data.insight.overview.length > 500 || data.insight.nextStep.length > 500) {
    throw new Error('The AI returned an incomplete progress insight.');
  }
  return data.insight;
}

export async function getAITopicInsight(progress: AITopicProgressInput): Promise<AITopicInsight> {
  const data = await post<{ insight?: AITopicInsight }>('/ai/analyze-topic', progress);
  if (!data.insight || typeof data.insight.overview !== 'string' || !data.insight.overview.trim() ||
    data.insight.overview.length > 500 || typeof data.insight.nextStep !== 'string' || !data.insight.nextStep.trim() || data.insight.nextStep.length > 500) {
    throw new Error('The AI returned an incomplete topic analysis.');
  }
  return data.insight;
}

export async function generateAIQuiz(input: {
  subjectName: string;
  topicName: string;
  questionCount: number;
  sourceMaterial?: string;
  previousQuestions?: string[];
  struggleSummary?: string;
  difficulty?: AIDifficulty;
  adaptive?: boolean;
  explanationStyle?: AIExplanationStyle;
  onProgress?: GenerationProgress;
}): Promise<QuizQuestion[]> {
  const total = input.questionCount;
  if (!Number.isInteger(total) || total < 3 || total > 50) throw new Error('Choose between 3 and 50 questions.');
  const questions: QuizQuestion[] = [];
  const seen = new Set<string>();
  const maxAttempts = Math.ceil(total / 10) + 3;
  let attempts = 0;
  while (questions.length < total && attempts < maxAttempts) {
    attempts += 1;
    const remaining = total - questions.length;
    const count = Math.max(3, Math.min(10, remaining));
    const data = await post<{ questions?: Array<{ question: string; options: string[]; correctIndex: number; explanation: string; difficulty: AIDifficulty }> }>(
      '/ai/generate-quiz', {
        subjectName: input.subjectName, topicName: input.topicName, questionCount: count,
        sourceMaterial: input.sourceMaterial,
        previousQuestions: [...(input.previousQuestions ?? []), ...questions.map((item) => item.question)].slice(-40),
        struggleSummary: input.struggleSummary,
        difficulty: input.difficulty ?? 'medium', explanationStyle: input.explanationStyle ?? 'balanced',
        adaptive: input.adaptive ?? false,
      }
    );
    if (!Array.isArray(data.questions) || data.questions.length !== count) throw new Error('The AI returned an incomplete question batch.');
    data.questions.forEach((item, index) => {
      if (!item || typeof item.question !== 'string' || !item.question.trim() || !Array.isArray(item.options) ||
        item.options.length !== 4 || !Number.isInteger(item.correctIndex) || item.correctIndex < 0 || item.correctIndex > 3 || typeof item.explanation !== 'string' || !['easy', 'medium', 'hard'].includes(item.difficulty)) {
        throw new Error('The AI returned a quiz question that could not be used.');
      }
      const key = item.question.trim().toLocaleLowerCase();
      if (!seen.has(key) && questions.length < total) {
        seen.add(key);
        questions.push({ id: `ai-${Date.now()}-${attempts}-${index}`, question: item.question.trim(), options: item.options, correctAnswer: item.options[item.correctIndex], explanation: item.explanation, difficulty: item.difficulty });
      }
    });
    input.onProgress?.(questions.length, total);
  }
  if (questions.length < total) throw new Error(`The AI created ${questions.length} unique questions. Try again or add more course notes.`);
  return questions;
}

export async function generateAIFlashcards(input: {
  subjectName: string;
  topicName: string;
  cardCount: number;
  sourceMaterial?: string;
  difficulty?: AIDifficulty;
  explanationStyle?: AIExplanationStyle;
  onProgress?: GenerationProgress;
}): Promise<GeneratedFlashcard[]> {
  const total = input.cardCount;
  if (!Number.isInteger(total) || total < 3 || total > 50) throw new Error('Choose between 3 and 50 flashcards.');
  const cards: GeneratedFlashcard[] = [];
  const seen = new Set<string>();
  const maxAttempts = Math.ceil(total / 10) + 3;
  let attempts = 0;
  while (cards.length < total && attempts < maxAttempts) {
    attempts += 1;
    const count = Math.max(3, Math.min(10, total - cards.length));
    const data = await post<{ flashcards?: GeneratedFlashcard[] }>('/ai/generate-flashcards', {
      subjectName: input.subjectName, topicName: input.topicName, cardCount: count, sourceMaterial: input.sourceMaterial, difficulty: input.difficulty ?? 'medium', explanationStyle: input.explanationStyle ?? 'balanced',
    });
    if (!Array.isArray(data.flashcards) || data.flashcards.length !== count || data.flashcards.some(
      (card) => !card || typeof card.front !== 'string' || !card.front.trim() || typeof card.back !== 'string' || !card.back.trim()
    )) throw new Error('The AI returned flashcards that could not be used.');
    data.flashcards.forEach((card) => {
      const key = card.front.trim().toLocaleLowerCase();
      if (!seen.has(key) && cards.length < total) { seen.add(key); cards.push({ front: card.front.trim(), back: card.back.trim() }); }
    });
    input.onProgress?.(cards.length, total);
  }
  if (cards.length < total) throw new Error(`The AI created ${cards.length} unique cards. Try again or add more course notes.`);
  return cards;
}

export async function generateAIActiveRecall(input: {
  subjectName: string;
  topicName: string;
  questionCount: number;
  sourceMaterial?: string;
  previousQuestions?: string[];
  struggleSummary?: string;
  difficulty?: AIDifficulty;
  explanationStyle?: AIExplanationStyle;
  onProgress?: GenerationProgress;
}): Promise<GeneratedActiveRecall[]> {
  const total = input.questionCount;
  if (!Number.isInteger(total) || total < 3 || total > 50) throw new Error('Choose between 3 and 50 questions.');
  const questions: GeneratedActiveRecall[] = [];
  const seen = new Set<string>();
  const maxAttempts = Math.ceil(total / 10) + 3;
  let attempts = 0;
  while (questions.length < total && attempts < maxAttempts) {
    attempts += 1;
    const count = Math.max(3, Math.min(10, total - questions.length));
    const data = await post<{ questions?: GeneratedActiveRecall[] }>('/ai/generate-active-recall', {
      subjectName: input.subjectName,
      topicName: input.topicName,
      questionCount: count,
      sourceMaterial: input.sourceMaterial,
      previousQuestions: [...(input.previousQuestions ?? []), ...questions.map((question) => question.question)].slice(-40),
      struggleSummary: input.struggleSummary,
      difficulty: input.difficulty ?? 'medium',
      explanationStyle: input.explanationStyle ?? 'balanced',
    });
    if (!Array.isArray(data.questions) || data.questions.length !== count || data.questions.some((item) =>
      !item || typeof item.question !== 'string' || !item.question.trim() || typeof item.answer !== 'string' || !item.answer.trim()
    )) throw new Error('The AI returned Active Recall questions that could not be used.');
    data.questions.forEach((item) => {
      const key = item.question.trim().toLocaleLowerCase();
      if (!seen.has(key) && questions.length < total) {
        seen.add(key);
        questions.push({ question: item.question.trim(), answer: item.answer.trim() });
      }
    });
    input.onProgress?.(questions.length, total);
  }
  if (questions.length < total) throw new Error(`The AI created ${questions.length} unique questions. Try again or add more course notes.`);
  return questions;
}

export const MAX_NOTES_PDF_BYTES = 10 * 1024 * 1024;

/** Asks the AI for topics in a subject: its core topics, or the topics found in the student's own notes. */
export async function suggestAITopics(input: { subjectName: string; existingTopics: string[]; sourceMaterial?: string; count?: number }): Promise<string[]> {
  const data = await post<{ topics?: unknown }>('/ai/suggest-topics', {
    subjectName: input.subjectName,
    existingTopics: input.existingTopics.slice(0, 80),
    sourceMaterial: input.sourceMaterial,
    count: input.count ?? 10,
  }, 90_000);
  const topics = Array.isArray(data.topics) ? data.topics.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map((item) => item.trim()) : [];
  if (topics.length === 0) throw new Error('The AI did not return any topics. Please try again.');
  return topics;
}

/** Sends a lecture PDF to the AI server and returns study notes written from it. */
export async function extractNotesFromPdf(input: { fileName: string; dataBase64: string }): Promise<{ notes: string; truncated: boolean }> {
  // Reading a whole document takes longer than generating a few questions.
  const data = await post<{ notes?: string; truncated?: boolean }>('/ai/extract-notes', input, 150_000);
  if (typeof data.notes !== 'string' || !data.notes.trim()) throw new Error('The AI did not return any notes. Please try again.');
  return { notes: data.notes.trim(), truncated: data.truncated === true };
}
