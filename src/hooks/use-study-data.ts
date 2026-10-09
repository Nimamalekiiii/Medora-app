import { useDayRefresh } from '@/hooks/use-day-refresh';
import { useAppSettings } from '@/services/app-settings-context';
import { subscribeToLocalDataChanges } from '@/services/cloud-sync-state';
import { buildProgressDashboard, type ProgressDashboard } from '@/services/progress-dashboard';
import { buildProgressMetrics, type ProgressMetrics } from '@/services/progress-metrics';
import {
  getActiveRecallQuestionsByTopic, getExamsBySubject, getFlashcardReviews, getFlashcards, getQuizResults, getStudyActivity,
  getStudyPlansBySubject, getStudyPreferences, getSubjects, getTopicsBySubject, type StudyPreferences,
} from '@/services/storage';
import type {
  ActiveRecallQuestionsByTopic, ExamsBySubject, Flashcard, FlashcardReview, QuizResult, StudyActivity, StudyPlansBySubject, Subject, TopicsBySubject,
} from '@/types/study';
import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';

export type StudyData = {
  subjects: Subject[];
  topicsBySubject: TopicsBySubject;
  exams: ExamsBySubject;
  cards: Flashcard[];
  activities: StudyActivity[];
  quizResults: QuizResult[];
  reviews: FlashcardReview[];
  recallQuestions: ActiveRecallQuestionsByTopic;
  preferences: StudyPreferences;
  plans: StudyPlansBySubject;
};

export type StudyState = {
  /** True until the first load has finished. */
  loading: boolean;
  data: StudyData | null;
  dashboard: ProgressDashboard | null;
  metrics: ProgressMetrics | null;
  todayKey: string;
  reload: () => Promise<void>;
};

/**
 * Loads all saved study data for a screen and keeps it current. It reloads
 * when the screen comes into view, when any study data changes (including a
 * cloud sync), when the app returns to the front, and at midnight. The Study
 * screens and the Progress numbers are built from the same calculations, so
 * a topic shows the same progress everywhere.
 */
export function useStudyData(): StudyState {
  const { preferences: appPreferences } = useAppSettings();
  const language = appPreferences.language;
  const todayKey = useDayRefresh();
  const [data, setData] = useState<StudyData | null>(null);
  const [loading, setLoading] = useState(true);
  const sequence = useRef(0);

  const reload = useCallback(async () => {
    const current = ++sequence.current;
    try {
      const [subjects, topicsBySubject, exams, cards, activities, quizResults, reviews, recallQuestions, preferences, plans] = await Promise.all([
        getSubjects(), getTopicsBySubject(), getExamsBySubject(), getFlashcards(), getStudyActivity(), getQuizResults(),
        getFlashcardReviews(), getActiveRecallQuestionsByTopic(), getStudyPreferences(), getStudyPlansBySubject(),
      ]);
      if (current !== sequence.current) return;
      setData({ subjects, topicsBySubject, exams, cards, activities, quizResults, reviews, recallQuestions, preferences, plans });
    } catch (error) {
      console.warn('Could not load study data:', error);
    } finally {
      if (current === sequence.current) setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    void reload();
    const unsubscribe = subscribeToLocalDataChanges(() => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { void reload(); }, 120);
    });
    const appState = AppState.addEventListener('change', (state) => { if (state === 'active') void reload(); });
    return () => {
      if (timer) clearTimeout(timer);
      unsubscribe();
      appState.remove();
      sequence.current += 1;
    };
  }, [reload]));

  const dashboard = useMemo(
    () => (data ? buildProgressDashboard({
      subjects: data.subjects, topicsBySubject: data.topicsBySubject, examsBySubject: data.exams,
      activities: data.activities, quizResults: data.quizResults, flashcardReviews: data.reviews,
    }, new Date(), language) : null),
    // todayKey is listed so day-based figures move at midnight.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, language, todayKey],
  );
  const metrics = useMemo(
    () => (data && dashboard ? buildProgressMetrics(dashboard, {
      studyDays: data.preferences.studyDays,
      dailyGoalMinutes: data.preferences.dailyGoalMinutes,
      flashcards: data.cards,
      recallQuestions: data.recallQuestions,
      quizResults: data.quizResults,
    }) : null),
    [data, dashboard],
  );

  return { loading, data, dashboard, metrics, todayKey, reload };
}
