import type {
  Exam,
  ExamsBySubject,
  FlashcardReview,
  PreparationAnalysis,
  QuizResult,
  StudyActivity,
  Subject,
  Topic,
  TopicsBySubject,
} from '../types/study';
import { calculatePreparationAnalysis } from './study-engine';
import { calculateTopicMastery } from './topic-mastery';

export type DashboardTopic = Topic & {
  subjectId: string;
  subjectName: string;
  started: boolean;
  quizAccuracy: number | null;
  quizCorrect: number;
  quizQuestions: number;
  activeRecallQuestions: number;
  activeRecallRatings: { again: number; hard: number; good: number; easy: number };
  flashcardsReviewed: number;
  reviewSessions: number;
  reviewRatings: { again: number; hard: number; good: number; easy: number };
  methodCoverage: number;
  /** Different calendar days with any study on the topic. */
  studyDays: number;
  /** Topic mastery from 0 to 100, see topic-mastery.ts. */
  practiceProgress: number;
  /** Whole days since the topic was last studied, or null if never. */
  daysSinceStudy: number | null;
  /** Points the score has lost because the topic has not been revised recently. */
  fadedPoints: number;
  lastStudiedAt: string | null;
};

export type DashboardExam = {
  subjectId: string;
  subjectName: string;
  exam: Exam;
  daysUntil: number;
  includedTopics: number;
  coveredTopics: number;
};

export type ActivityTotals = {
  sessions: number;
  activeRecallQuestions: number;
  activeRecallRatings: { again: number; hard: number; good: number; easy: number };
  quizQuestions: number;
  quizCorrect: number;
  quizAccuracy: number | null;
  flashcardsReviewed: number;
  reviewSessions: number;
  reviewRatings: { again: number; hard: number; good: number; easy: number };
  focusMinutes: number;
  studyDays: number;
};

export type ActivityDay = {
  dateKey: string;
  label: string;
  sessions: number;
  focusMinutes: number;
  quizQuestions: number;
  quizCorrect: number;
  quizAccuracy: number | null;
};

export type ProgressDashboard = {
  analysis: PreparationAnalysis;
  activities: StudyActivity[];
  topics: DashboardTopic[];
  exams: DashboardExam[];
  today: string;
  allTimeStudyDays: number;
  currentStreak: number;
  last7Days: ActivityTotals;
  last30Days: ActivityTotals;
  chart7Days: ActivityDay[];
  chart30Days: ActivityDay[];
};

type ProgressInput = {
  subjects: Subject[];
  topicsBySubject: TopicsBySubject;
  examsBySubject: ExamsBySubject;
  activities: StudyActivity[];
  quizResults: QuizResult[];
  flashcardReviews: FlashcardReview[];
};

function localDateKey(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseDay(key: string) {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function dayDistance(examDate: string, today: string) {
  const [year, month, day] = examDate.split('-').map(Number);
  const parsed = new Date(year, month - 1, day);
  if (!year || !month || !day || parsed.getFullYear() !== year || parsed.getMonth() !== month - 1 || parsed.getDate() !== day) return -1;
  const [todayYear, todayMonth, todayDay] = today.split('-').map(Number);
  return Math.round((Date.UTC(year, month - 1, day) - Date.UTC(todayYear, todayMonth - 1, todayDay)) / 86_400_000);
}

function activityDayKey(activity: StudyActivity) {
  return localDateKey(activity.completedAt);
}

function reviewDayKey(review: FlashcardReview) {
  return localDateKey(review.reviewedAt);
}

function getCanonicalActivities(input: ProgressInput, topicNames: Map<string, string>) {
  const activities = [...input.activities];
  const findMatchingActivity = (topicId: string, completedAt: string, type: StudyActivity['activity']) => {
    const targetTime = new Date(completedAt).getTime();
    return activities.find((activity) => activity.activity === type && String(activity.topicId) === topicId &&
      (activity.completedAt === completedAt || Math.abs(new Date(activity.completedAt).getTime() - targetTime) <= 1000));
  };

  // Quiz results are the canonical fallback for older or partially saved sessions.
  input.quizResults.forEach((result, index) => {
    const topicId = String(result.topicId);
    const matchingActivity = findMatchingActivity(topicId, result.completedAt, 'quiz');
    if (matchingActivity) {
      if (!Number.isInteger(matchingActivity.questionCount) || matchingActivity.questionCount <= 0) matchingActivity.questionCount = result.questionCount;
      matchingActivity.correctCount ??= result.correctCount;
      matchingActivity.wrongCount ??= result.wrongCount;
      matchingActivity.score ??= result.score;
      matchingActivity.durationSeconds ||= result.durationSeconds || 0;
      return;
    }
    activities.push({
      id: -10_000_000 - index,
      topicId,
      topicName: result.topicName || topicNames.get(topicId) || 'Topic',
      activity: 'quiz',
      completedAt: result.completedAt,
      durationSeconds: result.durationSeconds || 0,
      questionCount: result.questionCount,
      correctCount: result.correctCount,
      wrongCount: result.wrongCount,
      score: result.score,
    });
  });

  // Individual card reviews still count if the student leaves before a review
  // session can write its summary activity.
  const reviewsByTopicDay = new Map<string, { topicId: string; dateKey: string; count: number; latest: string }>();
  input.flashcardReviews.forEach((review) => {
    const dateKey = reviewDayKey(review);
    if (!dateKey) return;
    const topicId = String(review.topicId);
    const key = `${topicId}|${dateKey}`;
    const group = reviewsByTopicDay.get(key) ?? { topicId, dateKey, count: 0, latest: review.reviewedAt };
    group.count += 1;
    if (new Date(review.reviewedAt).getTime() > new Date(group.latest).getTime()) group.latest = review.reviewedAt;
    reviewsByTopicDay.set(key, group);
  });
  let fallbackIndex = 0;
  reviewsByTopicDay.forEach((group) => {
    const hasSession = activities.some((activity) =>
      String(activity.topicId) === group.topicId && activityDayKey(activity) === group.dateKey &&
      (activity.activity === 'review' || activity.activity === 'flashcards'));
    if (hasSession) return;
    fallbackIndex += 1;
    activities.push({
      id: -20_000_000 - fallbackIndex,
      topicId: group.topicId,
      topicName: topicNames.get(group.topicId) || 'Topic',
      activity: 'review',
      completedAt: group.latest,
      durationSeconds: 0,
      questionCount: group.count,
    });
  });
  return activities;
}

function countReviewedCards(activities: StudyActivity[], reviews: FlashcardReview[], start: Date) {
  const counts = new Map<string, { activityCount: number; reviewCount: number }>();
  const within = (value: string) => {
    const time = new Date(value).getTime();
    return Number.isFinite(time) && time >= start.getTime() && time <= Date.now();
  };
  activities.forEach((activity) => {
    if ((activity.activity !== 'review' && activity.activity !== 'flashcards') || !within(activity.completedAt)) return;
    const key = `${activity.topicId}|${activityDayKey(activity)}`;
    const group = counts.get(key) ?? { activityCount: 0, reviewCount: 0 };
    group.activityCount += Math.max(0, activity.questionCount || 0);
    counts.set(key, group);
  });
  reviews.forEach((review) => {
    if (!within(review.reviewedAt)) return;
    const key = `${review.topicId}|${reviewDayKey(review)}`;
    const group = counts.get(key) ?? { activityCount: 0, reviewCount: 0 };
    group.reviewCount += 1;
    counts.set(key, group);
  });
  return [...counts.values()].reduce((total, item) => total + Math.max(item.activityCount, item.reviewCount), 0);
}

function countReviewSessions(activities: StudyActivity[], reviews: FlashcardReview[], start: Date) {
  const sessions = activities.filter((activity) => activity.activity === 'review' && new Date(activity.completedAt).getTime() >= start.getTime()).length;
  const reviewDaysWithoutSession = new Set<string>();
  reviews.forEach((review) => {
    const reviewedAt = new Date(review.reviewedAt);
    if (!Number.isFinite(reviewedAt.getTime()) || reviewedAt.getTime() < start.getTime()) return;
    const dateKey = localDateKey(reviewedAt);
    const key = `${review.topicId}|${dateKey}`;
    const hasSession = activities.some((activity) => activity.activity === 'review' && String(activity.topicId) === String(review.topicId) && activityDayKey(activity) === dateKey);
    if (!hasSession) reviewDaysWithoutSession.add(key);
  });
  return sessions + reviewDaysWithoutSession.size;
}

function getActivityTotals(activities: StudyActivity[], reviews: FlashcardReview[], start: Date): ActivityTotals {
  const selected = activities.filter((activity) => {
    const time = new Date(activity.completedAt).getTime();
    return Number.isFinite(time) && time >= start.getTime() && time <= Date.now();
  });
  const quizzes = selected.filter((activity) => activity.activity === 'quiz' && (activity.questionCount || 0) > 0);
  const quizQuestions = quizzes.reduce((sum, activity) => sum + Math.max(0, activity.questionCount || 0), 0);
  const quizCorrect = quizzes.reduce((sum, activity) => sum + Math.max(0, activity.correctCount || 0), 0);
  const studyDays = new Set(selected.map(activityDayKey).filter((value): value is string => value !== null));
  const sumRatings = (kind: StudyActivity['activity']) => selected
    .filter((activity) => activity.activity === kind)
    .reduce((ratings, activity) => ({
      again: ratings.again + Math.max(0, activity.againCount || 0),
      hard: ratings.hard + Math.max(0, activity.hardCount || 0),
      good: ratings.good + Math.max(0, activity.goodCount || 0),
      easy: ratings.easy + Math.max(0, activity.easyCount || 0),
    }), { again: 0, hard: 0, good: 0, easy: 0 });
  reviews.forEach((review) => {
    const date = new Date(review.reviewedAt);
    if (Number.isFinite(date.getTime()) && date >= start && date.getTime() <= Date.now()) {
      const key = localDateKey(date);
      if (key) studyDays.add(key);
    }
  });
  return {
    sessions: selected.length,
    activeRecallQuestions: selected.filter((activity) => activity.activity === 'active_recall').reduce((sum, activity) => sum + Math.max(0, activity.questionCount || 0), 0),
    activeRecallRatings: sumRatings('active_recall'),
    quizQuestions,
    quizCorrect,
    quizAccuracy: quizQuestions ? Math.round((quizCorrect / quizQuestions) * 100) : null,
    flashcardsReviewed: countReviewedCards(activities, reviews, start),
    reviewSessions: countReviewSessions(activities, reviews, start),
    reviewRatings: sumRatings('review'),
    focusMinutes: Math.round(selected.filter((activity) => activity.activity === 'focus').reduce((sum, activity) => sum + Math.max(0, activity.durationSeconds || 0), 0) / 60),
    studyDays: studyDays.size,
  };
}

function makeChartDays(activities: StudyActivity[], rangeDays: 7 | 30, now: Date, language: 'en' | 'no'): ActivityDay[] {
  const days: ActivityDay[] = [];
  const locale = language === 'no' ? 'nb-NO' : 'en-GB';
  for (let offset = rangeDays - 1; offset >= 0; offset -= 1) {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - offset);
    const dateKey = localDateKey(date)!;
    const events = activities.filter((activity) => activityDayKey(activity) === dateKey);
    const quizzes = events.filter((activity) => activity.activity === 'quiz' && (activity.questionCount || 0) > 0);
    const questionCount = quizzes.reduce((sum, activity) => sum + Math.max(0, activity.questionCount || 0), 0);
    const correct = quizzes.reduce((sum, activity) => sum + Math.max(0, activity.correctCount || 0), 0);
    days.push({
      dateKey,
      label: date.toLocaleDateString(locale, { day: 'numeric', month: 'short' }),
      sessions: events.length,
      focusMinutes: Math.round(events.filter((activity) => activity.activity === 'focus').reduce((sum, activity) => sum + Math.max(0, activity.durationSeconds || 0), 0) / 60),
      quizQuestions: questionCount,
      quizCorrect: correct,
      quizAccuracy: questionCount ? Math.round((correct / questionCount) * 100) : null,
    });
  }
  return days;
}

function calculateStreak(activities: StudyActivity[], reviews: FlashcardReview[], today: string) {
  const dates = new Set<string>();
  activities.forEach((activity) => {
    const key = activityDayKey(activity);
    if (key) dates.add(key);
  });
  reviews.forEach((review) => {
    const key = reviewDayKey(review);
    if (key) dates.add(key);
  });
  const cursor = parseDay(today);
  if (!dates.has(today)) cursor.setDate(cursor.getDate() - 1);
  let streak = 0;
  while (dates.has(localDateKey(cursor)!)) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

export function buildProgressDashboard(input: ProgressInput, now = new Date(), language: 'en' | 'no' = 'en'): ProgressDashboard {
  const today = localDateKey(now)!;
  const topicEntries = input.subjects.flatMap((subject) =>
    (input.topicsBySubject[String(subject.id)] ?? []).map((topic) => ({ topic, subject })));
  const topicNames = new Map(topicEntries.map(({ topic }) => [String(topic.id), topic.name]));
  const activities = getCanonicalActivities(input, topicNames);
  const analysis = calculatePreparationAnalysis(input.subjects, input.topicsBySubject, input.examsBySubject, activities);
  const topicReviews = new Map<string, FlashcardReview[]>();
  input.flashcardReviews.forEach((review) => {
    const id = String(review.topicId);
    topicReviews.set(id, [...(topicReviews.get(id) ?? []), review]);
  });
  const topics: DashboardTopic[] = topicEntries.map(({ topic, subject }) => {
    const topicId = String(topic.id);
    const topicActivities = activities.filter((activity) => String(activity.topicId) === topicId);
    const reviews = topicReviews.get(topicId) ?? [];
    const quizEvents = topicActivities.filter((activity) => activity.activity === 'quiz' && (activity.questionCount || 0) > 0);
    const quizQuestions = quizEvents.reduce((sum, activity) => sum + Math.max(0, activity.questionCount || 0), 0);
    const correct = quizEvents.reduce((sum, activity) => sum + Math.max(0, activity.correctCount || 0), 0);
    const methods = new Set(topicActivities.map((activity) => activity.activity).filter((activity) => activity !== 'focus'));
    if (reviews.length) methods.add('review');
    const methodCoverage = Math.round((methods.size / 4) * 100);
    const quizAccuracy = quizQuestions ? Math.round((correct / quizQuestions) * 100) : null;
    const sumRatings = (kind: StudyActivity['activity']) => topicActivities
      .filter((activity) => activity.activity === kind)
      .reduce((ratings, activity) => ({
        again: ratings.again + Math.max(0, activity.againCount || 0),
        hard: ratings.hard + Math.max(0, activity.hardCount || 0),
        good: ratings.good + Math.max(0, activity.goodCount || 0),
        easy: ratings.easy + Math.max(0, activity.easyCount || 0),
      }), { again: 0, hard: 0, good: 0, easy: 0 });
    const started = topicActivities.length > 0 || reviews.length > 0;
    const lastActivityAt = topicActivities.map((activity) => activity.completedAt).concat(reviews.map((review) => review.reviewedAt)).sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] ?? null;
    const reviewStart = new Date(0);
    const flashcardsReviewed = countReviewedCards(topicActivities, reviews, reviewStart);
    const activeRecallQuestions = topicActivities.filter((activity) => activity.activity === 'active_recall').reduce((sum, activity) => sum + Math.max(0, activity.questionCount || 0), 0);
    const activeRecallRatings = sumRatings('active_recall');
    const reviewRatings = sumRatings('review');
    const studyDays = new Set(topicActivities.map(activityDayKey).concat(reviews.map(reviewDayKey)).filter((value): value is string => value !== null)).size;
    const lastStudyKey = lastActivityAt ? localDateKey(lastActivityAt) : null;
    const daysSinceStudy = lastStudyKey ? Math.max(0, -dayDistance(lastStudyKey, today)) : null;
    const mastery = started
      ? calculateTopicMastery({ quizQuestions, quizCorrect: correct, activeRecallQuestions, activeRecallRatings, flashcardsReviewed, reviewRatings, studyDays, daysSinceLastStudy: daysSinceStudy })
      : null;
    const practiceProgress = mastery?.score ?? 0;
    return {
      ...topic,
      subjectId: String(subject.id),
      subjectName: subject.name,
      started,
      quizAccuracy,
      quizCorrect: correct,
      quizQuestions,
      activeRecallQuestions,
      activeRecallRatings,
      flashcardsReviewed,
      reviewSessions: countReviewSessions(topicActivities, reviews, reviewStart),
      reviewRatings,
      methodCoverage,
      studyDays,
      practiceProgress,
      daysSinceStudy,
      fadedPoints: mastery ? mastery.earnedScore - mastery.score : 0,
      lastStudiedAt: lastActivityAt,
    };
  });
  const exams: DashboardExam[] = input.subjects.map((subject) => {
    const exam = input.examsBySubject[String(subject.id)];
    if (!exam) return null;
    const daysUntil = dayDistance(exam.date, today);
    if (daysUntil < 0) return null;
    const includedIds = new Set((exam.topicIds ?? []).map(String));
    const subjectTopics = input.topicsBySubject[String(subject.id)] ?? [];
    const included = subjectTopics.filter((topic) => includedIds.has(String(topic.id)));
    const coveredTopics = included.filter((topic) => topics.find((item) => String(item.id) === String(topic.id))?.started).length;
    return { subjectId: String(subject.id), subjectName: subject.name, exam, daysUntil, includedTopics: included.length, coveredTopics };
  }).filter((exam): exam is DashboardExam => exam !== null).sort((a, b) => a.daysUntil - b.daysUntil);
  const sevenDayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);
  const thirtyDayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29);
  const allTimeStudyDays = new Set(activities.map(activityDayKey).filter((value): value is string => value !== null).concat(input.flashcardReviews.map(reviewDayKey).filter((value): value is string => value !== null))).size;
  return {
    analysis,
    activities,
    topics,
    exams,
    today,
    allTimeStudyDays,
    currentStreak: calculateStreak(activities, input.flashcardReviews, today),
    last7Days: getActivityTotals(activities, input.flashcardReviews, sevenDayStart),
    last30Days: getActivityTotals(activities, input.flashcardReviews, thirtyDayStart),
    chart7Days: makeChartDays(activities, 7, now, language),
    chart30Days: makeChartDays(activities, 30, now, language),
  };
}

export function formatLocalDate(dateKey: string, language: 'en' | 'no') {
  return parseDay(dateKey).toLocaleDateString(language === 'no' ? 'nb-NO' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

export function daysUntilDate(dateKey: string, todayKey: string) {
  return dayDistance(dateKey, todayKey);
}
