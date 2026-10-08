import AsyncStorage from '@react-native-async-storage/async-storage';
import { notifyLocalDataChanged } from './cloud-sync-state';
import { reconcileExamReminders } from './study-reminder';

import type {
  Subject,
  Topic,
  TopicsBySubject,
  ExamsBySubject,
  StudyActivity,
  QuizResult,
  Flashcard,
  FlashcardReview,
  StudyPlanSettings,
  StudyPlansBySubject,
  ActiveRecallQuestion,
  ActiveRecallQuestionsByTopic,
  GeneratedQuizSet,
  GeneratedQuizzesByTopic,
} from '../types/study';

const STORAGE_KEYS = {
  subjects: 'medexam_subjects',
  topics: 'medexam_topics_by_subject',
  exams: 'medexam_exams_by_subject',
  studyPlans: 'medexam_study_plans_by_subject',
  studyActivity: 'medexam_study_activity',
  quizResults: 'medexam_quiz_results',
  flashcards: 'medexam_flashcards',
  flashcardReviews: 'medexam_flashcard_reviews',
  activeRecallQuestions: 'medexam_active_recall_questions',
  generatedQuizzes: 'medexam_generated_quizzes_by_topic',
  preferences: 'medexam_study_preferences',
  aiPreferences: 'medexam_ai_preferences',
  appPreferences: 'medexam_app_preferences',
} as const;

export type StudyMethod = 'active_recall' | 'flashcards' | 'quiz' | 'review';
export type StudyPeriod = 'morning' | 'afternoon' | 'evening';
export type AIDifficulty = 'easy' | 'medium' | 'hard';
export type AIExplanationStyle = 'short' | 'balanced' | 'detailed';
export type AppAppearance = 'system' | 'light' | 'dark';
export type AppLanguage = 'en' | 'no';

export type StudyPreferences = {
  dailyGoalMinutes: number;
  preferredMethods: StudyMethod[];
  studyDays: number[];
  preferredStudyTime: StudyPeriod;
  sessionLengthMinutes: number;
  breakDurationMinutes: number;
  autoGeneratePlan: boolean;
  includeWeekends: boolean;
  prioritizeWeakTopics: boolean;
  prioritizeUpcomingExams: boolean;
  includeReviewSessions: boolean;
  includeFlashcards: boolean;
  includeQuizzes: boolean;
};

export type AIPreferences = {
  generateQuizzes: boolean;
  generateFlashcards: boolean;
  questionCount: 5 | 10 | 20 | 30 | 50;
  flashcardCount: 10 | 20 | 30 | 50;
  difficulty: AIDifficulty;
  explanationStyle: AIExplanationStyle;
};

export type AppPreferences = {
  appearance: AppAppearance;
  language: AppLanguage;
};

export const DEFAULT_STUDY_PREFERENCES: StudyPreferences = {
  dailyGoalMinutes: 45,
  preferredMethods: ['active_recall', 'flashcards', 'quiz', 'review'],
  studyDays: [1, 2, 3, 4, 5],
  preferredStudyTime: 'evening',
  sessionLengthMinutes: 25,
  breakDurationMinutes: 5,
  autoGeneratePlan: true,
  includeWeekends: false,
  prioritizeWeakTopics: true,
  prioritizeUpcomingExams: true,
  includeReviewSessions: true,
  includeFlashcards: true,
  includeQuizzes: true,
};

export const DEFAULT_AI_PREFERENCES: AIPreferences = {
  generateQuizzes: true,
  generateFlashcards: true,
  questionCount: 10,
  flashcardCount: 20,
  difficulty: 'medium',
  explanationStyle: 'balanced',
};

export const DEFAULT_APP_PREFERENCES: AppPreferences = {
  appearance: 'system',
  language: 'en',
};

const STORAGE_KEY_LIST = Object.values(STORAGE_KEYS);
const RECOVERY_BACKUP_KEY = 'medexam_recovery_backup';
const writeLocks = new Map<string, Promise<unknown>>();

function withStorageLock<T>(key: string, task: () => Promise<T>): Promise<T> {
  const previous = writeLocks.get(key) ?? Promise.resolve();
  const current = previous.catch(() => undefined).then(task);
  writeLocks.set(key, current);
  const clear = () => {
    if (writeLocks.get(key) === current) writeLocks.delete(key);
  };
  void current.then(clear, clear);
  return current;
}

export type StudyDataBackup = {
  app: 'MedExam';
  version: 1;
  exportedAt: string;
  data: Record<string, unknown>;
};

export type StudyDataBackupSummary = {
  exportedAt: string | null;
  subjectCount: number;
  topicCount: number;
  flashcardCount: number;
  studySessionCount: number;
  quizResultCount: number;
};

/**
 * Generic helper for reading JSON from AsyncStorage.
 */
async function read<T>(
  key: string,
  fallback: T
): Promise<T> {
  try {
    const value = await AsyncStorage.getItem(key);

    if (!value) {
      return fallback;
    }

    return JSON.parse(value) as T;
  } catch (error) {
    console.log(`Could not read ${key}:`, error);
    return fallback;
  }
}

/**
 * Generic helper for writing JSON to AsyncStorage.
 */
async function write<T>(
  key: string,
  value: T
): Promise<void> {
  try {
    await AsyncStorage.setItem(
      key,
      JSON.stringify(value)
    );
    notifyLocalDataChanged();
  } catch (error) {
    console.log(`Could not write ${key}:`, error);
    throw error;
  }
}

/* ----------------------------------------
   SUBJECTS
---------------------------------------- */

export async function getSubjects(): Promise<Subject[]> {
  return read<Subject[]>(
    STORAGE_KEYS.subjects,
    []
  );
}

export async function getStudyPreferences(): Promise<StudyPreferences> {
  const saved = await read<Partial<StudyPreferences>>(
    STORAGE_KEYS.preferences,
    DEFAULT_STUDY_PREFERENCES
  );
  const dailyGoalMinutes = Number(saved?.dailyGoalMinutes);
  const allowedMethods: StudyMethod[] = ['active_recall', 'flashcards', 'quiz', 'review'];
  const allowedPeriods: StudyPeriod[] = ['morning', 'afternoon', 'evening'];
  const bool = (value: unknown, fallback: boolean) => typeof value === 'boolean' ? value : fallback;
  const preferredMethods = Array.isArray(saved?.preferredMethods)
    ? saved.preferredMethods.filter((method): method is StudyMethod => allowedMethods.includes(method as StudyMethod))
    : DEFAULT_STUDY_PREFERENCES.preferredMethods;
  const studyDays = Array.isArray(saved?.studyDays)
    ? [...new Set(saved.studyDays.filter((day): day is number => Number.isInteger(day) && day >= 0 && day <= 6))].sort((a, b) => a - b)
    : DEFAULT_STUDY_PREFERENCES.studyDays;

  return {
    dailyGoalMinutes: Number.isFinite(dailyGoalMinutes)
      ? Math.min(240, Math.max(15, Math.round(dailyGoalMinutes)))
      : DEFAULT_STUDY_PREFERENCES.dailyGoalMinutes,
    preferredMethods,
    studyDays: studyDays.length ? studyDays : DEFAULT_STUDY_PREFERENCES.studyDays,
    preferredStudyTime: allowedPeriods.includes(saved?.preferredStudyTime as StudyPeriod) ? saved!.preferredStudyTime as StudyPeriod : DEFAULT_STUDY_PREFERENCES.preferredStudyTime,
    sessionLengthMinutes: [15, 25, 45, 60, 90].includes(Number(saved?.sessionLengthMinutes)) ? Number(saved?.sessionLengthMinutes) : DEFAULT_STUDY_PREFERENCES.sessionLengthMinutes,
    breakDurationMinutes: [5, 10, 15].includes(Number(saved?.breakDurationMinutes)) ? Number(saved?.breakDurationMinutes) : DEFAULT_STUDY_PREFERENCES.breakDurationMinutes,
    autoGeneratePlan: bool(saved?.autoGeneratePlan, DEFAULT_STUDY_PREFERENCES.autoGeneratePlan),
    includeWeekends: bool(saved?.includeWeekends, DEFAULT_STUDY_PREFERENCES.includeWeekends),
    prioritizeWeakTopics: bool(saved?.prioritizeWeakTopics, DEFAULT_STUDY_PREFERENCES.prioritizeWeakTopics),
    prioritizeUpcomingExams: bool(saved?.prioritizeUpcomingExams, DEFAULT_STUDY_PREFERENCES.prioritizeUpcomingExams),
    includeReviewSessions: bool(saved?.includeReviewSessions, DEFAULT_STUDY_PREFERENCES.includeReviewSessions),
    includeFlashcards: bool(saved?.includeFlashcards, DEFAULT_STUDY_PREFERENCES.includeFlashcards),
    includeQuizzes: bool(saved?.includeQuizzes, DEFAULT_STUDY_PREFERENCES.includeQuizzes),
  };
}

export async function saveStudyPreferences(
  preferences: Partial<StudyPreferences>
): Promise<void> {
  await withStorageLock(STORAGE_KEYS.preferences, async () => {
    const current = await getStudyPreferences();
    const next = { ...current, ...preferences };
    const dailyGoalMinutes = Number(next.dailyGoalMinutes);
    const preferredMethods = next.preferredMethods;
    const allowedMethods: StudyMethod[] = ['active_recall', 'flashcards', 'quiz', 'review'];
    if (!Number.isFinite(dailyGoalMinutes) || dailyGoalMinutes < 15 || dailyGoalMinutes > 240) {
      throw new Error('Choose a daily study goal between 15 and 240 minutes.');
    }
    if (!Array.isArray(preferredMethods) || preferredMethods.some((method) => !allowedMethods.includes(method))) {
      throw new Error('Choose valid study methods.');
    }
    if (!Array.isArray(next.studyDays) || !next.studyDays.length || next.studyDays.some((day) => !Number.isInteger(day) || day < 0 || day > 6)) throw new Error('Choose at least one valid study day.');
    if (![15, 25, 45, 60, 90].includes(next.sessionLengthMinutes)) throw new Error('Choose a valid study session length.');
    if (![5, 10, 15].includes(next.breakDurationMinutes)) throw new Error('Choose a valid break length.');
    if (!['morning', 'afternoon', 'evening'].includes(next.preferredStudyTime)) throw new Error('Choose a valid study time.');
    await write(STORAGE_KEYS.preferences, {
      ...next,
      dailyGoalMinutes: Math.round(dailyGoalMinutes),
      preferredMethods: [...preferredMethods],
      studyDays: [...new Set(next.studyDays)].sort((a, b) => a - b),
    });
  });
}

export async function getAIPreferences(): Promise<AIPreferences> {
  const saved = await read<Partial<AIPreferences>>(STORAGE_KEYS.aiPreferences, DEFAULT_AI_PREFERENCES);
  const questionCount = [5, 10, 20, 30, 50].includes(Number(saved.questionCount)) ? Number(saved.questionCount) as AIPreferences['questionCount'] : DEFAULT_AI_PREFERENCES.questionCount;
  const flashcardCount = [10, 20, 30, 50].includes(Number(saved.flashcardCount)) ? Number(saved.flashcardCount) as AIPreferences['flashcardCount'] : DEFAULT_AI_PREFERENCES.flashcardCount;
  return {
    generateQuizzes: saved.generateQuizzes !== false,
    generateFlashcards: saved.generateFlashcards !== false,
    questionCount,
    flashcardCount,
    difficulty: ['easy', 'medium', 'hard'].includes(String(saved.difficulty)) ? saved.difficulty as AIDifficulty : DEFAULT_AI_PREFERENCES.difficulty,
    explanationStyle: ['short', 'balanced', 'detailed'].includes(String(saved.explanationStyle)) ? saved.explanationStyle as AIExplanationStyle : DEFAULT_AI_PREFERENCES.explanationStyle,
  };
}

export async function saveAIPreferences(preferences: Partial<AIPreferences>): Promise<void> {
  await withStorageLock(STORAGE_KEYS.aiPreferences, async () => {
    const current = await getAIPreferences();
    const next = { ...current, ...preferences };
    if (![5, 10, 20, 30, 50].includes(next.questionCount) || ![10, 20, 30, 50].includes(next.flashcardCount)) throw new Error('Choose a supported AI question and flashcard count.');
    if (!['easy', 'medium', 'hard'].includes(next.difficulty) || !['short', 'balanced', 'detailed'].includes(next.explanationStyle)) throw new Error('Choose valid AI preferences.');
    await write(STORAGE_KEYS.aiPreferences, next);
  });
}

export async function getAppPreferences(): Promise<AppPreferences> {
  const saved = await read<Partial<AppPreferences>>(STORAGE_KEYS.appPreferences, DEFAULT_APP_PREFERENCES);
  return {
    appearance: ['system', 'light', 'dark'].includes(String(saved.appearance)) ? saved.appearance as AppAppearance : 'system',
    language: ['en', 'no'].includes(String(saved.language)) ? saved.language as AppLanguage : 'en',
  };
}

export async function saveAppPreferences(preferences: Partial<AppPreferences>): Promise<void> {
  await withStorageLock(STORAGE_KEYS.appPreferences, async () => {
    const current = await getAppPreferences();
    const next = { ...current, ...preferences };
    if (!['system', 'light', 'dark'].includes(next.appearance) || !['en', 'no'].includes(next.language)) throw new Error('Choose a supported appearance and language.');
    await write(STORAGE_KEYS.appPreferences, next);
  });
}

export async function saveSubjects(
  subjects: Subject[]
): Promise<void> {
  await write(
    STORAGE_KEYS.subjects,
    subjects
  );
}

async function saveRecoverySnapshot(): Promise<void> {
  const snapshot = await createStudyDataBackup();
  await AsyncStorage.setItem(RECOVERY_BACKUP_KEY, JSON.stringify(snapshot));
}

async function removeTopicStudyData(topicIds: Set<string>) {
  if (topicIds.size === 0) return [] as [string, string][];

  const [activities, quizResults, flashcards, reviews, recall, generated, exams] = await Promise.all([
    getStudyActivity(),
    getQuizResults(),
    getFlashcards(),
    getFlashcardReviews(),
    getActiveRecallQuestionsByTopic(),
    getGeneratedQuizzesByTopic(),
    getExamsBySubject(),
  ]);

  const removedFlashcardIds = new Set(
    flashcards.filter((card) => topicIds.has(String(card.topicId))).map((card) => String(card.id))
  );
  for (const topicId of topicIds) {
    delete recall[topicId];
    delete generated[topicId];
  }

  for (const [subjectId, exam] of Object.entries(exams)) {
    if (exam) exams[subjectId] = { ...exam, topicIds: exam.topicIds.filter((id) => !topicIds.has(String(id))) };
  }

  const values: Record<string, unknown> = {
    [STORAGE_KEYS.studyActivity]: activities.filter((item) => !topicIds.has(String(item.topicId))),
    [STORAGE_KEYS.quizResults]: quizResults.filter((item) => !topicIds.has(String(item.topicId))),
    [STORAGE_KEYS.flashcards]: flashcards.filter((item) => !topicIds.has(String(item.topicId))),
    [STORAGE_KEYS.flashcardReviews]: reviews.filter((item) =>
      !topicIds.has(String(item.topicId ?? '')) && !removedFlashcardIds.has(String(item.flashcardId))
    ),
    [STORAGE_KEYS.activeRecallQuestions]: recall,
    [STORAGE_KEYS.generatedQuizzes]: generated,
    [STORAGE_KEYS.exams]: exams,
  };

  return Object.entries(values).map(([key, value]) => [key, JSON.stringify(value)] as [string, string]);
}

export async function deleteTopicAndData(
  subjectId: string | number,
  topicId: string | number
): Promise<void> {
  return withStorageLock('medexam_delete', async () => {
    await saveRecoverySnapshot();
    const subjectKey = String(subjectId);
    const topics = await getTopicsBySubject();
    topics[subjectKey] = (topics[subjectKey] ?? []).filter((topic) => String(topic.id) !== String(topicId));
    const entries = await removeTopicStudyData(new Set([String(topicId)]));
    entries.push(
      [STORAGE_KEYS.topics, JSON.stringify(topics)],
    );
    await AsyncStorage.multiSet(entries);
    notifyLocalDataChanged();
  });
}

export async function deleteSubjectAndData(subjectId: string | number): Promise<void> {
  return withStorageLock('medexam_delete', async () => {
    await saveRecoverySnapshot();
    const subjectKey = String(subjectId);
    const [subjects, topics, exams, plans] = await Promise.all([
      getSubjects(), getTopicsBySubject(), getExamsBySubject(), getStudyPlansBySubject(),
    ]);
    const topicIds = new Set((topics[subjectKey] ?? []).map((topic) => String(topic.id)));
    const dataEntries = await removeTopicStudyData(topicIds);
    delete topics[subjectKey];
    delete exams[subjectKey];
    delete plans[subjectKey];
    const values: Record<string, unknown> = {
      [STORAGE_KEYS.subjects]: subjects.filter((subject) => String(subject.id) !== subjectKey),
      [STORAGE_KEYS.topics]: topics,
      [STORAGE_KEYS.exams]: exams,
      [STORAGE_KEYS.studyPlans]: plans,
    };
    dataEntries.push(...Object.entries(values).map(([key, value]) => [key, JSON.stringify(value)] as [string, string]));
    await AsyncStorage.multiSet(dataEntries);
    notifyLocalDataChanged();
  });
}

/* ----------------------------------------
   TOPICS
---------------------------------------- */

export async function getTopicsBySubject(): Promise<TopicsBySubject> {
  return read<TopicsBySubject>(
    STORAGE_KEYS.topics,
    {}
  );
}

export async function saveTopicsBySubject(
  topics: TopicsBySubject
): Promise<void> {
  await write(
    STORAGE_KEYS.topics,
    topics
  );
}

export async function getTopicsForSubject(
  subjectId: string | number
): Promise<Topic[]> {
  const topicsBySubject =
    await getTopicsBySubject();

  return (
    topicsBySubject[String(subjectId)] ?? []
  );
}

export async function saveTopicsForSubject(
  subjectId: string | number,
  topics: Topic[]
): Promise<void> {
  return withStorageLock(STORAGE_KEYS.topics, async () => {
    const topicsBySubject = await getTopicsBySubject();
    topicsBySubject[String(subjectId)] = topics;
    await saveTopicsBySubject(topicsBySubject);
  });
}

/* ----------------------------------------
   EXAMS
---------------------------------------- */

export async function getExamsBySubject(): Promise<ExamsBySubject> {
  return read<ExamsBySubject>(
    STORAGE_KEYS.exams,
    {}
  );
}

export async function saveExamsBySubject(
  exams: ExamsBySubject
): Promise<void> {
  await write(
    STORAGE_KEYS.exams,
    exams
  );
  const subjects = await getSubjects();
  void reconcileExamReminders(exams, subjects).catch((error) => console.warn('Exam reminders could not be refreshed:', error));
}

export async function getExamForSubject(
  subjectId: string | number
) {
  const exams =
    await getExamsBySubject();

  return (
    exams[String(subjectId)] ?? null
  );
}

/* ----------------------------------------
   STUDY PLANS
---------------------------------------- */

export async function getStudyPlansBySubject(): Promise<StudyPlansBySubject> {
  return read<StudyPlansBySubject>(
    STORAGE_KEYS.studyPlans,
    {}
  );
}

export async function getStudyPlanForSubject(
  subjectId: string | number
): Promise<StudyPlanSettings | null> {
  const studyPlans = await getStudyPlansBySubject();

  return studyPlans[String(subjectId)] ?? null;
}

export async function saveStudyPlanForSubject(
  subjectId: string | number,
  settings: StudyPlanSettings
): Promise<void> {
  return withStorageLock(STORAGE_KEYS.studyPlans, async () => {
    const studyPlans = await getStudyPlansBySubject();
    studyPlans[String(subjectId)] = {
      ...settings,
      studyDays: [...settings.studyDays].sort((a, b) => a - b),
    };
    await write(STORAGE_KEYS.studyPlans, studyPlans);
  });
}

/* ----------------------------------------
   STUDY ACTIVITY
---------------------------------------- */

export async function getStudyActivity(): Promise<StudyActivity[]> {
  return read<StudyActivity[]>(
    STORAGE_KEYS.studyActivity,
    []
  );
}

export async function saveStudyActivity(
  activities: StudyActivity[]
): Promise<void> {
  await write(
    STORAGE_KEYS.studyActivity,
    activities
  );
}

export async function addStudyActivity(
  activity: StudyActivity
): Promise<void> {
  return withStorageLock(STORAGE_KEYS.studyActivity, async () => {
    const activities = await getStudyActivity();
    activities.push(activity);
    await saveStudyActivity(activities);
  });
}

export async function updateStudyActivity(id: number, updates: Partial<StudyActivity>): Promise<void> {
  return withStorageLock(STORAGE_KEYS.studyActivity, async () => {
    const activities = await getStudyActivity();
    const index = activities.findIndex((activity) => activity.id === id);
    if (index < 0) throw new Error('This study session could not be found.');
    activities[index] = { ...activities[index], ...updates };
    await saveStudyActivity(activities);
  });
}

/* ----------------------------------------
   QUIZ RESULTS
---------------------------------------- */

export async function getQuizResults(): Promise<QuizResult[]> {
  return read<QuizResult[]>(
    STORAGE_KEYS.quizResults,
    []
  );
}

export async function saveQuizResults(
  results: QuizResult[]
): Promise<void> {
  await write(
    STORAGE_KEYS.quizResults,
    results
  );
}

export async function addQuizResult(
  result: QuizResult
): Promise<void> {
  return withStorageLock(STORAGE_KEYS.quizResults, async () => {
    const results = await getQuizResults();
    results.push(result);
    await saveQuizResults(results);
  });
}

/** Save a quiz result and its matching progress event as one local storage batch. */
export async function saveQuizSession(result: QuizResult, activity: StudyActivity): Promise<void> {
  return withStorageLock(STORAGE_KEYS.quizResults, () =>
    withStorageLock(STORAGE_KEYS.studyActivity, async () => {
      const results = await getQuizResults();
      const resultIndex = results.findIndex((item) => item.id === result.id);
      if (resultIndex >= 0) results[resultIndex] = result;
      else results.push(result);

      const activities = await getStudyActivity();
      const activityIndex = activities.findIndex((item) => item.id === activity.id);
      if (activityIndex >= 0) activities[activityIndex] = activity;
      else activities.push(activity);

      await AsyncStorage.multiSet([
        [STORAGE_KEYS.quizResults, JSON.stringify(results)],
        [STORAGE_KEYS.studyActivity, JSON.stringify(activities)],
      ]);
      notifyLocalDataChanged();
    })
  );
}

/* ----------------------------------------
   FLASHCARDS
---------------------------------------- */

export async function getFlashcards(): Promise<Flashcard[]> {
  return read<Flashcard[]>(
    STORAGE_KEYS.flashcards,
    []
  );
}

export async function saveFlashcards(
  flashcards: Flashcard[]
): Promise<void> {
  await write(
    STORAGE_KEYS.flashcards,
    flashcards
  );
}

export async function addFlashcard(
  flashcard: Flashcard
): Promise<void> {
  return withStorageLock(STORAGE_KEYS.flashcards, async () => {
    const flashcards = await getFlashcards();
    flashcards.push(flashcard);
    await saveFlashcards(flashcards);
  });
}

export async function addFlashcards(
  newFlashcards: Flashcard[]
): Promise<void> {
  if (newFlashcards.length === 0) {
    return;
  }

  return withStorageLock(STORAGE_KEYS.flashcards, async () => {
    const flashcards = await getFlashcards();
    const knownIds = new Set(flashcards.map((card) => card.id));
    await saveFlashcards([
      ...flashcards,
      ...newFlashcards.filter((card) => !knownIds.has(card.id)),
    ]);
  });
}

/**
 * Get all flashcards belonging to a topic.
 */
export async function getFlashcardsForTopic(
  topicId: string | number
): Promise<Flashcard[]> {
  const flashcards =
    await getFlashcards();

  return flashcards.filter(
    (flashcard) =>
      String(flashcard.topicId) ===
      String(topicId)
  );
}

/**
 * Get one flashcard by ID.
 */
export async function getFlashcardById(
  flashcardId: string
): Promise<Flashcard | null> {
  const flashcards =
    await getFlashcards();

  return (
    flashcards.find(
      (flashcard) =>
        flashcard.id === flashcardId
    ) ?? null
  );
}

/**
 * Update an existing flashcard.
 */
export async function updateFlashcard(
  flashcardId: string,
  updates: Partial<Flashcard>
): Promise<void> {
  return withStorageLock(STORAGE_KEYS.flashcards, async () => {
    const flashcards = await getFlashcards();
    const index = flashcards.findIndex((flashcard) => flashcard.id === flashcardId);
    if (index === -1) return;
    flashcards[index] = { ...flashcards[index], ...updates };
    await saveFlashcards(flashcards);
  });
}

/* ----------------------------------------
   FLASHCARD REVIEWS
---------------------------------------- */

export async function getFlashcardReviews(): Promise<FlashcardReview[]> {
  return read<FlashcardReview[]>(
    STORAGE_KEYS.flashcardReviews,
    []
  );
}

export async function saveFlashcardReviews(
  reviews: FlashcardReview[]
): Promise<void> {
  await write(
    STORAGE_KEYS.flashcardReviews,
    reviews
  );
}

export async function addFlashcardReview(
  review: FlashcardReview
): Promise<void> {
  return withStorageLock(STORAGE_KEYS.flashcardReviews, async () => {
    const reviews = await getFlashcardReviews();
    reviews.push(review);
    await saveFlashcardReviews(reviews);
  });
}

/* ----------------------------------------
   ACTIVE RECALL QUESTIONS
---------------------------------------- */

export async function getActiveRecallQuestionsByTopic(): Promise<ActiveRecallQuestionsByTopic> {
  return read<ActiveRecallQuestionsByTopic>(
    STORAGE_KEYS.activeRecallQuestions,
    {}
  );
}

export async function getActiveRecallQuestionsForTopic(
  topicId: string | number
): Promise<ActiveRecallQuestion[]> {
  const questions = await getActiveRecallQuestionsByTopic();

  return questions[String(topicId)] ?? [];
}

export async function saveActiveRecallQuestionsForTopic(
  topicId: string | number,
  questions: ActiveRecallQuestion[]
): Promise<void> {
  return withStorageLock(STORAGE_KEYS.activeRecallQuestions, async () => {
    const questionsByTopic = await getActiveRecallQuestionsByTopic();
    questionsByTopic[String(topicId)] = questions;
    await write(STORAGE_KEYS.activeRecallQuestions, questionsByTopic);
  });
}

/** Persist each Active Recall rating together with its session checkpoint.
 * Keeping both records in one storage operation prevents a saved card rating
 * from being detached from the progress history if the app closes mid-session.
 */
export async function saveActiveRecallProgress(
  topicId: string | number,
  questions: ActiveRecallQuestion[],
  activity: StudyActivity
): Promise<void> {
  return withStorageLock(STORAGE_KEYS.activeRecallQuestions, () =>
    withStorageLock(STORAGE_KEYS.studyActivity, async () => {
      const questionsByTopic = await getActiveRecallQuestionsByTopic();
      questionsByTopic[String(topicId)] = questions;
      const activities = await getStudyActivity();
      const existingIndex = activities.findIndex((item) => item.id === activity.id);
      if (existingIndex >= 0) activities[existingIndex] = activity;
      else activities.push(activity);
      await AsyncStorage.multiSet([
        [STORAGE_KEYS.activeRecallQuestions, JSON.stringify(questionsByTopic)],
        [STORAGE_KEYS.studyActivity, JSON.stringify(activities)],
      ]);
      notifyLocalDataChanged();
    })
  );
}

/* ----------------------------------------
   GENERATED QUIZZES
---------------------------------------- */

export async function getGeneratedQuizzesByTopic(): Promise<GeneratedQuizzesByTopic> {
  return read<GeneratedQuizzesByTopic>(
    STORAGE_KEYS.generatedQuizzes,
    {}
  );
}

export async function getLatestGeneratedQuizForTopic(
  topicId: string | number
): Promise<GeneratedQuizSet | null> {
  const quizzes = await getGeneratedQuizzesByTopic();
  const topicQuizzes = quizzes[String(topicId)] ?? [];

  return topicQuizzes[topicQuizzes.length - 1] ?? null;
}

export async function addGeneratedQuizForTopic(
  quiz: GeneratedQuizSet
): Promise<void> {
  return withStorageLock(STORAGE_KEYS.generatedQuizzes, async () => {
    const quizzes = await getGeneratedQuizzesByTopic();
    const topicQuizzes = quizzes[quiz.topicId] ?? [];
    quizzes[quiz.topicId] = [...topicQuizzes, quiz].slice(-20);
    await write(STORAGE_KEYS.generatedQuizzes, quizzes);
  });
}

/* ----------------------------------------
   BACKUP AND RESTORE
---------------------------------------- */

const DEFAULT_BACKUP_VALUES: Record<string, unknown> = {
  [STORAGE_KEYS.subjects]: [],
  [STORAGE_KEYS.topics]: {},
  [STORAGE_KEYS.exams]: {},
  [STORAGE_KEYS.studyPlans]: {},
  [STORAGE_KEYS.studyActivity]: [],
  [STORAGE_KEYS.quizResults]: [],
  [STORAGE_KEYS.flashcards]: [],
  [STORAGE_KEYS.flashcardReviews]: [],
  [STORAGE_KEYS.activeRecallQuestions]: {},
  [STORAGE_KEYS.generatedQuizzes]: {},
  [STORAGE_KEYS.preferences]: DEFAULT_STUDY_PREFERENCES,
  [STORAGE_KEYS.aiPreferences]: DEFAULT_AI_PREFERENCES,
  [STORAGE_KEYS.appPreferences]: DEFAULT_APP_PREFERENCES,
};

export async function createStudyDataBackup(): Promise<StudyDataBackup> {
  const storedValues = await AsyncStorage.multiGet(STORAGE_KEY_LIST);
  const data: Record<string, unknown> = { ...DEFAULT_BACKUP_VALUES };

  for (const [key, rawValue] of storedValues) {
    if (rawValue === null) {
      continue;
    }

    try {
      data[key] = JSON.parse(rawValue);
    } catch {
      // Keep a bad stored value out of user-exported JSON. Restore validation
      // will leave that key untouched if a backup does not contain it.
      delete data[key];
    }
  }

  return {
    app: 'MedExam',
    version: 1,
    exportedAt: new Date().toISOString(),
    data,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNamedRecord(value: unknown, required: string[]): value is Record<string, unknown> {
  return isRecord(value) && required.every((field) => field in value);
}

function isValidBackupEntry(key: string, value: unknown) {
  const arrayKeys = [STORAGE_KEYS.subjects, STORAGE_KEYS.studyActivity, STORAGE_KEYS.quizResults, STORAGE_KEYS.flashcards, STORAGE_KEYS.flashcardReviews];
  if (arrayKeys.includes(key as (typeof arrayKeys)[number]) && !Array.isArray(value)) return false;
  if (key === STORAGE_KEYS.subjects) {
    return (value as unknown[]).every((item) => isNamedRecord(item, ['id', 'name']) && (typeof item.id === 'string' || typeof item.id === 'number') && typeof item.name === 'string');
  }
  if (key === STORAGE_KEYS.studyActivity) {
    return (value as unknown[]).every((item) => isNamedRecord(item, ['id', 'topicId', 'topicName', 'activity', 'completedAt', 'durationSeconds', 'questionCount']) && typeof item.topicId === 'string' && typeof item.topicName === 'string');
  }
  if (key === STORAGE_KEYS.quizResults) {
    return (value as unknown[]).every((item) => isNamedRecord(item, ['id', 'topicId', 'topicName', 'completedAt', 'questionCount', 'correctCount', 'wrongCount', 'score', 'durationSeconds']));
  }
  if (key === STORAGE_KEYS.flashcards) {
    return (value as unknown[]).every((item) => isNamedRecord(item, ['id', 'topicId', 'topicName', 'front', 'back', 'createdAt']));
  }
  if (key === STORAGE_KEYS.flashcardReviews) {
    return (value as unknown[]).every((item) => isNamedRecord(item, ['id', 'flashcardId', 'reviewedAt']));
  }

  if (!isRecord(value)) {
    return false;
  }

  if (key === STORAGE_KEYS.topics) {
    return Object.values(value).every((items) => Array.isArray(items) && items.every((item) => isNamedRecord(item, ['id', 'name']) && typeof item.name === 'string'));
  }
  if (key === STORAGE_KEYS.exams) {
    return Object.values(value).every((item) => item === null || (isNamedRecord(item, ['date', 'type', 'topicIds']) && typeof item.date === 'string' && typeof item.type === 'string' && Array.isArray(item.topicIds)));
  }
  if (key === STORAGE_KEYS.studyPlans) {
    return Object.values(value).every((item) => isNamedRecord(item, ['studyDays', 'dailyStudyMinutes']) && Array.isArray(item.studyDays) && typeof item.dailyStudyMinutes === 'number');
  }
  if (key === STORAGE_KEYS.preferences) {
    const hasValidMethods = !('preferredMethods' in value) || (
      Array.isArray(value.preferredMethods) &&
      value.preferredMethods.every((method) => ['active_recall', 'flashcards', 'quiz', 'review'].includes(String(method)))
    );
    const daysValid = !('studyDays' in value) || (Array.isArray(value.studyDays) && value.studyDays.length > 0 && value.studyDays.every((day) => Number.isInteger(day) && Number(day) >= 0 && Number(day) <= 6));
    const periodsValid = !('preferredStudyTime' in value) || ['morning', 'afternoon', 'evening'].includes(String(value.preferredStudyTime));
    const durationsValid = (!('sessionLengthMinutes' in value) || [15, 25, 45, 60, 90].includes(Number(value.sessionLengthMinutes))) && (!('breakDurationMinutes' in value) || [5, 10, 15].includes(Number(value.breakDurationMinutes)));
    const togglesValid = ['autoGeneratePlan', 'includeWeekends', 'prioritizeWeakTopics', 'prioritizeUpcomingExams', 'includeReviewSessions', 'includeFlashcards', 'includeQuizzes'].every((field) => !(field in value) || typeof value[field] === 'boolean');
    return isNamedRecord(value, ['dailyGoalMinutes']) && typeof value.dailyGoalMinutes === 'number' && value.dailyGoalMinutes >= 15 && value.dailyGoalMinutes <= 240 && hasValidMethods && daysValid && periodsValid && durationsValid && togglesValid;
  }
  if (key === STORAGE_KEYS.aiPreferences) {
    return (!('generateQuizzes' in value) || typeof value.generateQuizzes === 'boolean') &&
      (!('generateFlashcards' in value) || typeof value.generateFlashcards === 'boolean') &&
      (!('questionCount' in value) || [5, 10, 20, 30, 50].includes(Number(value.questionCount))) &&
      (!('flashcardCount' in value) || [10, 20, 30, 50].includes(Number(value.flashcardCount))) &&
      (!('difficulty' in value) || ['easy', 'medium', 'hard'].includes(String(value.difficulty))) &&
      (!('explanationStyle' in value) || ['short', 'balanced', 'detailed'].includes(String(value.explanationStyle)));
  }
  if (key === STORAGE_KEYS.appPreferences) {
    return (!('appearance' in value) || ['system', 'light', 'dark'].includes(String(value.appearance))) &&
      (!('language' in value) || ['en', 'no'].includes(String(value.language)));
  }
  if (key === STORAGE_KEYS.activeRecallQuestions) {
    return Object.values(value).every((items) => Array.isArray(items) && items.every((item) => isNamedRecord(item, ['id', 'question', 'answer']) && typeof item.question === 'string' && typeof item.answer === 'string'));
  }
  if (key === STORAGE_KEYS.generatedQuizzes) {
    return Object.values(value).every((sets) => Array.isArray(sets) && sets.every((set) => isNamedRecord(set, ['id', 'topicId', 'topicName', 'subjectId', 'subjectName', 'generatedAt', 'questions']) && Array.isArray(set.questions) && set.questions.every((item) => isNamedRecord(item, ['id', 'question', 'options', 'correctAnswer']) && Array.isArray(item.options))));
  }

  return true;
}

function parseAndValidateStudyDataBackup(source: unknown) {
  let backup: unknown = source;
  if (typeof source === 'string') {
    try { backup = JSON.parse(source); }
    catch { throw new Error('The selected file is not valid JSON. Choose a MedExam backup file.'); }
  }
  if (!isRecord(backup) || backup.app !== 'MedExam' || backup.version !== 1 || !isRecord(backup.data)) {
    throw new Error('This is not a supported MedExam backup file.');
  }
  const entries = Object.entries(backup.data).filter(([key]) =>
    STORAGE_KEY_LIST.includes(key as (typeof STORAGE_KEY_LIST)[number])
  );
  if (entries.length === 0 || entries.some(([key, value]) => !isValidBackupEntry(key, value))) {
    throw new Error('This backup has incomplete or invalid study data and was not restored.');
  }
  return { backup, data: backup.data, entries };
}

export function inspectStudyDataBackup(source: unknown): StudyDataBackupSummary {
  const { backup, data } = parseAndValidateStudyDataBackup(source);
  const subjects = Array.isArray(data[STORAGE_KEYS.subjects]) ? data[STORAGE_KEYS.subjects] as unknown[] : [];
  const rawTopicsBySubject = data[STORAGE_KEYS.topics];
  const topicsBySubject: Record<string, unknown> = isRecord(rawTopicsBySubject) ? rawTopicsBySubject : {};
  const countArray = (key: string) => Array.isArray(data[key]) ? (data[key] as unknown[]).length : 0;
  const topicCount = Object.values(topicsBySubject).reduce<number>((total, topics) => total + (Array.isArray(topics) ? topics.length : 0), 0);
  return {
    exportedAt: typeof backup.exportedAt === 'string' ? backup.exportedAt : null,
    subjectCount: subjects.length,
    topicCount,
    flashcardCount: countArray(STORAGE_KEYS.flashcards),
    studySessionCount: countArray(STORAGE_KEYS.studyActivity),
    quizResultCount: countArray(STORAGE_KEYS.quizResults),
  };
}

export async function restoreStudyDataBackup(
  source: unknown
): Promise<void> {
  const { entries } = parseAndValidateStudyDataBackup(source);

  const recoveryCopy = await createStudyDataBackup();
  await AsyncStorage.setItem(
    RECOVERY_BACKUP_KEY,
    JSON.stringify(recoveryCopy)
  );
  const serializedEntries = entries.map(([key, value]) => {
    const serialized = JSON.stringify(value);

    if (serialized === undefined) {
      throw new Error('The backup contains a value that cannot be restored.');
    }

    return [key, serialized] as [string, string];
  });

  try {
    await AsyncStorage.multiSet(serializedEntries);
  } catch {
    const recoveryEntries = Object.entries(recoveryCopy.data).map(([key, value]) => [key, JSON.stringify(value)] as [string, string]);
    try {
      await AsyncStorage.multiSet(recoveryEntries);
    } catch {
      throw new Error('Restore stopped before it completed. The recovery copy is still saved on this device under Profile → Recovery options.');
    }
    throw new Error('The restore could not finish, so MedExam automatically put the original data back.');
  }
  notifyLocalDataChanged();
}

export async function restorePreviousStudyDataBackup(): Promise<boolean> {
  const previous = await AsyncStorage.getItem(RECOVERY_BACKUP_KEY);

  if (!previous) {
    return false;
  }

  await restoreStudyDataBackup(previous);
  return true;
}

/* ----------------------------------------
   CLEAR ALL MEDEXAM DATA
---------------------------------------- */

export async function clearAllStudyData(): Promise<void> {
  const recoveryCopy = await createStudyDataBackup();
  await AsyncStorage.setItem(
    RECOVERY_BACKUP_KEY,
    JSON.stringify(recoveryCopy)
  );

  await AsyncStorage.multiRemove([
    ...STORAGE_KEY_LIST,
  ]);
  notifyLocalDataChanged();

}

export async function deleteAllStudyContent(): Promise<void> {
  const keys = [
    STORAGE_KEYS.subjects, STORAGE_KEYS.topics, STORAGE_KEYS.exams, STORAGE_KEYS.studyPlans,
    STORAGE_KEYS.studyActivity, STORAGE_KEYS.quizResults, STORAGE_KEYS.flashcards,
    STORAGE_KEYS.flashcardReviews, STORAGE_KEYS.activeRecallQuestions, STORAGE_KEYS.generatedQuizzes,
  ];
  const recoveryCopy = await createStudyDataBackup();
  await AsyncStorage.setItem(RECOVERY_BACKUP_KEY, JSON.stringify(recoveryCopy));
  await AsyncStorage.multiSet(keys.map((key) => [key, JSON.stringify(DEFAULT_BACKUP_VALUES[key])] as [string, string]));
  notifyLocalDataChanged();
}
