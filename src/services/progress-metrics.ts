import type { ActiveRecallQuestionsByTopic, Flashcard, QuizResult, StudyActivity, StudyActivityType } from '../types/study';
import type { DashboardExam, DashboardTopic, ProgressDashboard } from './progress-dashboard';
import { MASTERED_AT } from './topic-mastery';

/**
 * Figures shown on the Progress tab, derived from the progress dashboard.
 * Everything here is calculated from saved study records, so the tab changes
 * as soon as a subject, topic, exam or study session is added or removed.
 * This module is pure: no storage, no React.
 */

export type TopicStatus = 'not_started' | 'in_progress' | 'completed';

export const STUDY_METHOD_COUNT = 4;

export type ProgressTopic = DashboardTopic & { status: TopicStatus; methodsDone: number };
export type ExamPace =
  | { kind: 'done' }
  | { kind: 'today' }
  /** One topic every `days` days keeps the student on track. */
  | { kind: 'every'; days: number }
  /** More topics than days: this many topics are needed each day. */
  | { kind: 'perDay'; topics: number };

export type ProgressExam = DashboardExam & {
  readiness: number;
  notStartedTopics: number;
  /** Exam topics that are not completed yet. */
  remainingTopics: number;
  totalTopics: number;
  pace: ExamPace;
};

export type SubjectProgress = { subjectId: string; subjectName: string; topics: number; completed: number; progress: number; quizAccuracy: number | null };

export type MissedQuestion = {
  question: string;
  correctAnswer: string;
  explanation?: string;
  /** How many quiz attempts got this question wrong. */
  times: number;
  topic: { id: string; name: string; subjectId: string };
};

export type ReviewForecastDay = { dateKey: string; count: number };

export type ProgressSources = {
  now?: Date;
  /** Weekdays the student plans to study, as Date.getDay() values. */
  studyDays?: number[];
  dailyGoalMinutes?: number;
  flashcards?: Flashcard[];
  recallQuestions?: ActiveRecallQuestionsByTopic;
  quizResults?: QuizResult[];
};
export type MethodKey = 'quiz' | 'active_recall' | 'flashcards' | 'review' | 'focus';

export type DayPoint = { dateKey: string; studyMinutes: number; sessions: number; studied: boolean; planned: boolean };

export type ProgressMetrics = {
  topics: ProgressTopic[];
  statusCounts: { completed: number; inProgress: number; notStarted: number; total: number };
  /** Average practice progress across every topic, 0 to 100. */
  overallProgress: number;
  week: { days: DayPoint[]; studyMinutes: number; previousStudyMinutes: number; sessions: number; previousSessions: number; studyDays: number };
  methods30Days: { counts: Record<MethodKey, number>; total: number };
  quiz: {
    accuracy30: number | null;
    previousAccuracy30: number | null;
    accuracy7: number | null;
    previousAccuracy7: number | null;
    /** One point per day with at least one answered quiz question, oldest first. */
    points30: { dateKey: string; accuracy: number }[];
  };
  consistency: { days: DayPoint[]; studiedDays: number; plannedDays: number; plannedDaysStudied: number; percent: number | null };
  exams: ProgressExam[];
  today: { studyMinutes: number; goalMinutes: number; percent: number; goalMet: boolean };
  subjects: SubjectProgress[];
  /** Flashcards and recall questions due each day for the next 7 days. Today includes anything overdue. */
  reviewForecast: ReviewForecastDay[];
  missedQuestions: MissedQuestion[];
};

function dayKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function activityDayKey(activity: StudyActivity) {
  const date = new Date(activity.completedAt);
  return Number.isNaN(date.getTime()) ? null : dayKey(date);
}

/** A topic is completed once its mastery score reaches the completion mark. */
export function getTopicStatus(topic: Pick<DashboardTopic, 'started' | 'practiceProgress'>): TopicStatus {
  if (!topic.started) return 'not_started';
  return topic.practiceProgress >= MASTERED_AT ? 'completed' : 'in_progress';
}

function accuracyBetween(activities: StudyActivity[], fromKey: string, toKey: string) {
  let questions = 0;
  let correct = 0;
  activities.forEach((activity) => {
    if (activity.activity !== 'quiz' || !(activity.questionCount > 0)) return;
    const key = activityDayKey(activity);
    if (!key || key < fromKey || key > toKey) return;
    questions += Math.max(0, activity.questionCount);
    correct += Math.max(0, activity.correctCount ?? 0);
  });
  return questions ? Math.round((correct / questions) * 100) : null;
}

/** The steady pace that gets every remaining exam topic done before the exam. */
export function getExamPace(remainingTopics: number, daysUntil: number): ExamPace {
  if (remainingTopics <= 0) return { kind: 'done' };
  if (daysUntil <= 0) return { kind: 'today' };
  if (remainingTopics > daysUntil) return { kind: 'perDay', topics: Math.ceil(remainingTopics / daysUntil) };
  return { kind: 'every', days: Math.floor(daysUntil / remainingTopics) };
}

function normalizeQuestion(text: string) {
  return text.trim().toLocaleLowerCase().replace(/\s+/g, ' ');
}

export function buildProgressMetrics(dashboard: ProgressDashboard, options: ProgressSources = {}): ProgressMetrics {
  const now = options.now ?? new Date();
  const plannedWeekdays = new Set(options.studyDays ?? []);
  const keyDaysAgo = (days: number) => dayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - days));
  const todayKey = keyDaysAgo(0);

  const topics: ProgressTopic[] = dashboard.topics.map((topic) => ({
    ...topic,
    status: getTopicStatus(topic),
    methodsDone: Math.round((topic.methodCoverage / 100) * STUDY_METHOD_COUNT),
  }));
  const statusCounts = {
    completed: topics.filter((topic) => topic.status === 'completed').length,
    inProgress: topics.filter((topic) => topic.status === 'in_progress').length,
    notStarted: topics.filter((topic) => topic.status === 'not_started').length,
    total: topics.length,
  };
  const overallProgress = topics.length ? Math.round(topics.reduce((sum, topic) => sum + topic.practiceProgress, 0) / topics.length) : 0;

  // Per-day totals for the last 60 days, enough for every window below.
  const byDay = new Map<string, { seconds: number; sessions: number }>();
  const methodCounts: Record<MethodKey, number> = { quiz: 0, active_recall: 0, flashcards: 0, review: 0, focus: 0 };
  const thirtyStartKey = keyDaysAgo(29);
  dashboard.activities.forEach((activity) => {
    const key = activityDayKey(activity);
    if (!key || key > todayKey) return;
    const entry = byDay.get(key) ?? { seconds: 0, sessions: 0 };
    entry.seconds += Math.max(0, activity.durationSeconds || 0);
    entry.sessions += 1;
    byDay.set(key, entry);
    if (key >= thirtyStartKey && (activity.activity as StudyActivityType) in methodCounts) methodCounts[activity.activity as MethodKey] += 1;
  });

  const dayPoint = (daysAgo: number): DayPoint => {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysAgo);
    const key = dayKey(date);
    const entry = byDay.get(key);
    return { dateKey: key, studyMinutes: Math.round((entry?.seconds ?? 0) / 60), sessions: entry?.sessions ?? 0, studied: (entry?.sessions ?? 0) > 0, planned: plannedWeekdays.has(date.getDay()) };
  };
  const range = (from: number, to: number) => Array.from({ length: from - to + 1 }, (_, index) => dayPoint(from - index));
  const sum = (days: DayPoint[], field: 'studyMinutes' | 'sessions') => days.reduce((total, day) => total + day[field], 0);

  const weekDays = range(6, 0);
  const previousWeek = range(13, 7);
  const monthDays = range(29, 0);

  const plannedDays = monthDays.filter((day) => day.planned).length;
  const plannedDaysStudied = monthDays.filter((day) => day.planned && day.studied).length;

  const quizByDay = new Map<string, { questions: number; correct: number }>();
  dashboard.activities.forEach((activity) => {
    if (activity.activity !== 'quiz' || !(activity.questionCount > 0)) return;
    const key = activityDayKey(activity);
    if (!key || key < thirtyStartKey || key > todayKey) return;
    const entry = quizByDay.get(key) ?? { questions: 0, correct: 0 };
    entry.questions += Math.max(0, activity.questionCount);
    entry.correct += Math.max(0, activity.correctCount ?? 0);
    quizByDay.set(key, entry);
  });
  const points30 = [...quizByDay.entries()].sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([dateKey, entry]) => ({ dateKey, accuracy: Math.round((entry.correct / entry.questions) * 100) }));

  const topicById = new Map(topics.map((topic) => [`${topic.subjectId}|${topic.id}`, topic]));
  const exams: ProgressExam[] = dashboard.exams.map((exam) => {
    const included = (exam.exam.topicIds ?? []).map((id) => topicById.get(`${exam.subjectId}|${id}`)).filter((topic): topic is ProgressTopic => topic !== undefined);
    // An exam with no topics chosen covers the whole subject.
    const scope = included.length ? included : topics.filter((topic) => topic.subjectId === exam.subjectId);
    const remainingTopics = scope.filter((topic) => topic.status !== 'completed').length;
    return {
      ...exam,
      readiness: scope.length ? Math.round(scope.reduce((total, topic) => total + topic.practiceProgress, 0) / scope.length) : 0,
      notStartedTopics: scope.filter((topic) => topic.status === 'not_started').length,
      remainingTopics,
      totalTopics: scope.length,
      pace: scope.length ? getExamPace(remainingTopics, exam.daysUntil) : { kind: 'done' },
    };
  });

  const goalMinutes = Math.max(0, Math.round(options.dailyGoalMinutes ?? 0));
  const todayMinutes = weekDays[weekDays.length - 1].studyMinutes;

  const subjectOrder: string[] = [];
  const bySubject = new Map<string, ProgressTopic[]>();
  topics.forEach((topic) => {
    if (!bySubject.has(topic.subjectId)) { bySubject.set(topic.subjectId, []); subjectOrder.push(topic.subjectId); }
    bySubject.get(topic.subjectId)?.push(topic);
  });
  const subjects: SubjectProgress[] = subjectOrder.map((subjectId) => {
    const list = bySubject.get(subjectId) ?? [];
    const questions = list.reduce((total, topic) => total + topic.quizQuestions, 0);
    const correct = list.reduce((total, topic) => total + topic.quizCorrect, 0);
    return {
      subjectId,
      subjectName: list[0]?.subjectName ?? '',
      topics: list.length,
      completed: list.filter((topic) => topic.status === 'completed').length,
      progress: list.length ? Math.round(list.reduce((total, topic) => total + topic.practiceProgress, 0) / list.length) : 0,
      quizAccuracy: questions ? Math.round((correct / questions) * 100) : null,
    };
  });

  // Only items that belong to a topic that still exists are counted.
  const topicByKey = new Map(topics.map((topic) => [String(topic.id), topic]));
  const forecast: ReviewForecastDay[] = Array.from({ length: 7 }, (_, index) => ({
    dateKey: dayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() + index)),
    count: 0,
  }));
  const addDue = (topicId: string | number, nextReviewAt?: string) => {
    if (!topicByKey.has(String(topicId))) return;
    const due = nextReviewAt ? new Date(nextReviewAt) : null;
    // No date yet means the item has never been reviewed, so it is due now.
    const key = due && !Number.isNaN(due.getTime()) ? dayKey(due) : todayKey;
    if (key <= todayKey) forecast[0].count += 1;
    else {
      const day = forecast.find((item) => item.dateKey === key);
      if (day) day.count += 1;
    }
  };
  (options.flashcards ?? []).forEach((card) => addDue(card.topicId, card.nextReviewAt));
  Object.entries(options.recallQuestions ?? {}).forEach(([topicId, questions]) => (questions ?? []).forEach((question) => addDue(topicId, question.nextReviewAt)));

  const missed = new Map<string, MissedQuestion & { latest: number }>();
  (options.quizResults ?? []).forEach((result) => {
    const topic = topicByKey.get(String(result.topicId));
    if (!topic) return;
    const completedAt = new Date(result.completedAt).getTime() || 0;
    (result.missedQuestions ?? []).forEach((item) => {
      if (!item?.question?.trim()) return;
      const key = `${topic.id}|${normalizeQuestion(item.question)}`;
      const entry = missed.get(key);
      if (entry) {
        entry.times += 1;
        if (completedAt >= entry.latest) { entry.latest = completedAt; entry.correctAnswer = item.correctAnswer; entry.explanation = item.explanation; }
      } else {
        missed.set(key, {
          question: item.question.trim(), correctAnswer: item.correctAnswer, explanation: item.explanation, times: 1, latest: completedAt,
          topic: { id: String(topic.id), name: topic.name, subjectId: topic.subjectId },
        });
      }
    });
  });
  const missedQuestions: MissedQuestion[] = [...missed.values()]
    .sort((a, b) => b.times - a.times || b.latest - a.latest)
    .slice(0, 5)
    .map(({ latest: _latest, ...question }) => question);

  return {
    topics,
    statusCounts,
    overallProgress,
    week: {
      days: weekDays,
      studyMinutes: sum(weekDays, 'studyMinutes'),
      previousStudyMinutes: sum(previousWeek, 'studyMinutes'),
      sessions: sum(weekDays, 'sessions'),
      previousSessions: sum(previousWeek, 'sessions'),
      studyDays: weekDays.filter((day) => day.studied).length,
    },
    methods30Days: { counts: methodCounts, total: Object.values(methodCounts).reduce((total, count) => total + count, 0) },
    quiz: {
      accuracy30: accuracyBetween(dashboard.activities, thirtyStartKey, todayKey),
      previousAccuracy30: accuracyBetween(dashboard.activities, keyDaysAgo(59), keyDaysAgo(30)),
      accuracy7: accuracyBetween(dashboard.activities, keyDaysAgo(6), todayKey),
      previousAccuracy7: accuracyBetween(dashboard.activities, keyDaysAgo(13), keyDaysAgo(7)),
      points30,
    },
    consistency: {
      days: monthDays,
      studiedDays: monthDays.filter((day) => day.studied).length,
      plannedDays,
      plannedDaysStudied,
      percent: plannedDays ? Math.round((plannedDaysStudied / plannedDays) * 100) : null,
    },
    exams,
    today: {
      studyMinutes: todayMinutes,
      goalMinutes,
      percent: goalMinutes ? Math.min(100, Math.round((todayMinutes / goalMinutes) * 100)) : 0,
      goalMet: goalMinutes > 0 && todayMinutes >= goalMinutes,
    },
    subjects,
    reviewForecast: forecast,
    missedQuestions,
  };
}

/** Whole-number percentage change from `previous` to `current`, or null when there is nothing to compare with. */
export function percentChange(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

/** Study time short enough to sit above a chart bar: "45m" or "1.5h". */
export function formatStudyTimeCompact(minutes: number, language: 'en' | 'no'): string {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round((minutes / 60) * 10) / 10;
  return `${language === 'no' ? String(hours).replace('.', ',') : hours}${language === 'no' ? 't' : 'h'}`;
}

export function formatStudyTime(minutes: number, language: 'en' | 'no'): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  const h = language === 'no' ? 't' : 'h';
  if (!hours) return `${rest}m`;
  return rest ? `${hours}${h} ${rest}m` : `${hours}${h}`;
}
