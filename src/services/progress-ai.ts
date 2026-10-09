import AsyncStorage from '@react-native-async-storage/async-storage';

import type { ExamsBySubject, StudyPlansBySubject, Subject, TopicsBySubject } from '../types/study';
import type { AIProgressInput, AIProgressInsight } from './ai-api';
import type { ProgressDashboard } from './progress-dashboard';
import type { StudyPreferences } from './storage';

/**
 * The AI progress review: what is sent to the AI, and the saved copy of its
 * last answer. The review is kept per day and per state of the study data, so
 * the Insights tab can show it at once and knows when it has gone out of date.
 */

const CACHE_KEY = 'medexam_ai_progress_review';

export type SavedProgressReview = { dayKey: string; fingerprint: string; language: 'en' | 'no'; userId: string; insight: AIProgressInsight };

/** Changes whenever subjects, topics, exams or recorded study activity change. */
export function progressFingerprint(dashboard: ProgressDashboard): string {
  const topics = dashboard.topics.map((topic) => `${topic.subjectId}:${topic.id}:${topic.practiceProgress}`).join(',');
  const exams = dashboard.exams.map((exam) => `${exam.subjectId}:${exam.exam.date}:${exam.includedTopics}`).join(',');
  return `${dashboard.activities.length}|${dashboard.allTimeStudyDays}|${topics}|${exams}`;
}

export async function loadProgressReview(userId: string): Promise<SavedProgressReview | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as Partial<SavedProgressReview> | null;
    if (!saved || saved.userId !== userId || typeof saved.dayKey !== 'string' || typeof saved.fingerprint !== 'string' || !saved.insight ||
      typeof saved.insight.overview !== 'string' || typeof saved.insight.nextStep !== 'string') return null;
    return saved as SavedProgressReview;
  } catch {
    return null;
  }
}

export async function saveProgressReview(review: SavedProgressReview): Promise<void> {
  try {
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(review));
  } catch (error) {
    console.warn('Could not save the AI progress review:', error);
  }
}

export function buildAIInput(dashboard: ProgressDashboard, subjects: Subject[], topicsBySubject: TopicsBySubject, examsBySubject: ExamsBySubject, preferences: StudyPreferences, plans: StudyPlansBySubject, language: 'en' | 'no'): AIProgressInput {
  const recommendations = new Map(dashboard.analysis.recommendations.map((item) => [String(item.topicId), item]));
  const candidates = [...dashboard.topics]
    .sort((a, b) => (recommendations.get(String(b.id))?.priority === 'high' ? 1 : 0) - (recommendations.get(String(a.id))?.priority === 'high' ? 1 : 0) || a.practiceProgress - b.practiceProgress)
    .slice(0, 30)
    .map((topic) => ({
      id: String(topic.id),
      name: topic.name,
      subjectName: topic.subjectName,
      started: topic.started,
      quizAccuracy: topic.quizAccuracy,
      quizQuestions: topic.quizQuestions,
      activeRecallQuestions: topic.activeRecallQuestions,
      activeRecallRatings: topic.activeRecallRatings,
      flashcardsReviewed: topic.flashcardsReviewed,
      reviewSessions: topic.reviewSessions,
      reviewRatings: topic.reviewRatings,
      methodCoverage: topic.methodCoverage,
      lastStudiedAt: topic.lastStudiedAt,
      reason: recommendations.get(String(topic.id))?.reason ?? (topic.started ? 'Continue building recorded practice across study methods.' : 'This topic has no recorded study activity yet.'),
    }));
  const subjectSummaries = subjects.slice(0, 50).map((subject) => {
    const subjectTopics = dashboard.topics.filter((topic) => topic.subjectId === String(subject.id));
    const quizQuestions = subjectTopics.reduce((sum, topic) => sum + topic.quizQuestions, 0);
    const quizCorrect = subjectTopics.reduce((sum, topic) => sum + topic.quizCorrect, 0);
    return {
      id: String(subject.id),
      name: subject.name,
      topicCount: (topicsBySubject[String(subject.id)] ?? []).length,
      topicsStarted: subjectTopics.filter((topic) => topic.started).length,
      quizAccuracy: quizQuestions ? Math.round((quizCorrect / quizQuestions) * 100) : null,
    };
  });
  const upcomingExams = dashboard.exams.slice(0, 10).map((entry) => ({
    subjectId: entry.subjectId,
    subjectName: entry.subjectName,
    date: entry.exam.date,
    type: entry.exam.type,
    daysUntil: entry.daysUntil,
    topicsIncluded: entry.includedTopics,
    includedTopicNames: (topicsBySubject[entry.subjectId] ?? []).filter((topic) => entry.exam.topicIds.map(String).includes(String(topic.id))).map((topic) => topic.name).slice(0, 20),
  }));
  return {
    language,
    totals: {
      readinessScore: dashboard.analysis.overallScore,
      topicsStarted: dashboard.analysis.topicsCovered,
      totalTopics: dashboard.analysis.totalTopics,
      topicsNotStarted: Math.max(0, dashboard.analysis.totalTopics - dashboard.analysis.topicsCovered),
      quizAccuracy: dashboard.analysis.quizAccuracy,
      activeRecallCoverage: dashboard.analysis.activeRecallCoverage,
      reviewCoverage: dashboard.analysis.reviewCoverage,
      flashcardCoverage: dashboard.analysis.flashcardCoverage,
      allTimeStudyDays: dashboard.allTimeStudyDays,
      currentStreak: dashboard.currentStreak,
    },
    last7Days: dashboard.last7Days,
    last30Days: dashboard.last30Days,
    accuracyTrend: {
      last7Days: dashboard.chart7Days.map((day) => ({ date: day.dateKey, quizQuestions: day.quizQuestions, quizAccuracy: day.quizAccuracy })),
      last30Days: dashboard.chart30Days.map((day) => ({ date: day.dateKey, quizQuestions: day.quizQuestions, quizAccuracy: day.quizAccuracy })),
    },
    subjects: subjectSummaries,
    upcomingExams,
    candidateTopics: candidates,
    studyPreferences: {
      dailyGoalMinutes: preferences.dailyGoalMinutes,
      studyDays: preferences.studyDays,
      sessionLengthMinutes: preferences.sessionLengthMinutes,
      breakDurationMinutes: preferences.breakDurationMinutes,
      preferredStudyTime: preferences.preferredStudyTime,
      preferredMethods: preferences.preferredMethods.filter((method) =>
        (method !== 'review' || preferences.includeReviewSessions) &&
        (method !== 'flashcards' || preferences.includeFlashcards) &&
        (method !== 'quiz' || preferences.includeQuizzes)
      ),
      prioritizeWeakTopics: preferences.prioritizeWeakTopics,
      prioritizeUpcomingExams: preferences.prioritizeUpcomingExams,
      includeReviewSessions: preferences.includeReviewSessions,
      includeFlashcards: preferences.includeFlashcards,
      includeQuizzes: preferences.includeQuizzes,
    },
    studyPlans: Object.entries(plans).slice(0, 50).map(([subjectId, plan]) => ({ subjectId, studyDays: plan.studyDays, dailyStudyMinutes: plan.dailyStudyMinutes })),
  };
}

export function localizeAttentionReason(reason: string, language: 'en' | 'no') {
  if (language === 'en') return reason;
  return reason
    .replace(/Your quiz accuracy is (\d+)%\./g, 'Quiz-treffprosenten din er $1%.')
    .replace(/ It has been (\d+) days since you last studied this topic\./g, (_, days: string) => ` Det er ${days} ${days === '1' ? 'dag' : 'dager'} siden du sist studerte dette temaet.`)
    .replace(/ Your exam is in (\d+) days\./g, (_, days: string) => ` Eksamenen din er om ${days} ${days === '1' ? 'dag' : 'dager'}.`)
    .replace(/ You have marked several study items as difficult\./g, ' Du har markert flere studieoppgaver som vanskelige.')
    .replace('This topic could benefit from another study session.', 'Dette temaet kan ha nytte av en ny studieøkt.')
    .replace('This topic has not been studied yet.', 'Dette temaet er ikke studert ennå.')
    .replace('You have completed Active Recall. The next step is to test your knowledge with a quiz.', 'Du har fullført aktiv gjenhenting. Neste steg er å teste kunnskapen din med en quiz.')
    .replace('Your performance is strong. Keep reviewing to maintain it.', 'Du gjør det bra. Fortsett å repetere for å vedlikeholde kunnskapen.');
}
