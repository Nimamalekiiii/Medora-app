import { cardShadow } from '@/components/gloss';
import { ExamsTab } from '@/components/progress/exams-tab';
import { InsightsTab } from '@/components/progress/insights-tab';
import { OverviewTab } from '@/components/progress/overview-tab';
import { ink, useProgressPalette } from '@/components/progress/theme';
import { TopicsTab } from '@/components/progress/topics-tab';
import type { ProgressTabKey, TopicRef } from '@/components/progress/types';
import PullToRefreshScrollView from '@/components/pull-to-refresh-scroll-view';
import { StudyIcon } from '@/components/study-icon';
import { appColor } from '@/constants/adaptive-color';
import { ui } from '@/constants/ui';
import { useDayRefresh } from '@/hooks/use-day-refresh';
import { getAIProgressInsight } from '@/services/ai-api';
import { useAppSettings } from '@/services/app-settings-context';
import { useAuth } from '@/services/auth-context';
import { subscribeToLocalDataChanges } from '@/services/cloud-sync-state';
import { buildAIInput, loadProgressReview, progressFingerprint, saveProgressReview, type SavedProgressReview } from '@/services/progress-ai';
import { buildProgressDashboard, type ProgressDashboard } from '@/services/progress-dashboard';
import { buildProgressMetrics } from '@/services/progress-metrics';
import {
  getActiveRecallQuestionsByTopic, getExamsBySubject, getFlashcardReviews, getFlashcards, getQuizResults, getStudyActivity, getStudyPlansBySubject, getStudyPreferences,
  getSubjects, getTopicsBySubject, type StudyPreferences,
} from '@/services/storage';
import type { ActiveRecallQuestionsByTopic, ExamsBySubject, Flashcard, QuizResult, StudyPlansBySubject, Subject, TopicsBySubject } from '@/types/study';
import { Stack, router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type Loaded = {
  dashboard: ProgressDashboard;
  subjects: Subject[];
  topicsBySubject: TopicsBySubject;
  examsBySubject: ExamsBySubject;
  preferences: StudyPreferences;
  plans: StudyPlansBySubject;
  flashcards: Flashcard[];
  recallQuestions: ActiveRecallQuestionsByTopic;
  quizResults: QuizResult[];
};

export default function ProgressScreen() {
  const { preferences: appPreferences } = useAppSettings();
  const { session } = useAuth();
  const language = appPreferences.language;
  const L = (en: string, no: string) => (language === 'no' ? no : en);
  const palette = useProgressPalette();
  const todayKey = useDayRefresh();
  const userId = session?.user?.id ?? '';

  const [data, setData] = useState<Loaded | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [tab, setTab] = useState<ProgressTabKey>('overview');
  const [review, setReview] = useState<SavedProgressReview | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const loadSequence = useRef(0);
  const hasLoaded = useRef(false);

  // Reads everything from saved study data, so the tab always reflects the
  // current subjects, topics, exams and sessions.
  const loadData = useCallback(async () => {
    const sequence = ++loadSequence.current;
    if (!hasLoaded.current) setLoading(true);
    try {
      const [subjects, topicsBySubject, examsBySubject, activities, quizResults, flashcardReviews, preferences, plans, flashcards, recallQuestions] = await Promise.all([
        getSubjects(), getTopicsBySubject(), getExamsBySubject(), getStudyActivity(), getQuizResults(), getFlashcardReviews(), getStudyPreferences(), getStudyPlansBySubject(),
        getFlashcards(), getActiveRecallQuestionsByTopic(),
      ]);
      if (sequence !== loadSequence.current) return;
      const dashboard = buildProgressDashboard({ subjects, topicsBySubject, examsBySubject, activities, quizResults, flashcardReviews }, new Date(), language);
      setData({ dashboard, subjects, topicsBySubject, examsBySubject, preferences, plans, flashcards, recallQuestions, quizResults });
      setLoadFailed(false);
      hasLoaded.current = true;
    } catch (error) {
      if (sequence !== loadSequence.current) return;
      console.warn('Could not refresh progress:', error);
      setLoadFailed(true);
    } finally {
      if (sequence === loadSequence.current) setLoading(false);
    }
  }, [language]);

  // Reload when the tab is opened, when any study data changes (including a
  // cloud sync from another device), and when the app returns to the front.
  useFocusEffect(useCallback(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    void loadData();
    const unsubscribe = subscribeToLocalDataChanges(() => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { void loadData(); }, 120);
    });
    const appState = AppState.addEventListener('change', (state) => { if (state === 'active') void loadData(); });
    return () => {
      if (timer) clearTimeout(timer);
      unsubscribe();
      appState.remove();
      loadSequence.current += 1;
    };
  }, [loadData]));

  // A new day moves every "last 7 days" window, so recalculate at midnight.
  const lastDay = useRef(todayKey);
  useEffect(() => {
    if (lastDay.current === todayKey) return;
    lastDay.current = todayKey;
    void loadData();
  }, [loadData, todayKey]);

  useEffect(() => {
    let active = true;
    setReview(null);
    setAiError(null);
    if (userId) void loadProgressReview(userId).then((saved) => { if (active) setReview(saved); });
    return () => { active = false; };
  }, [userId]);

  const metrics = useMemo(
    () => (data ? buildProgressMetrics(data.dashboard, {
      studyDays: data.preferences.studyDays,
      dailyGoalMinutes: data.preferences.dailyGoalMinutes,
      flashcards: data.flashcards,
      recallQuestions: data.recallQuestions,
      quizResults: data.quizResults,
    }) : null),
    // todayKey is listed so the windows move at midnight even without new data.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, todayKey],
  );
  const fingerprint = useMemo(() => (data ? progressFingerprint(data.dashboard) : ''), [data]);

  const openTopic = useCallback((topic: TopicRef) => {
    router.push({ pathname: '/subject/topic/[id]', params: { id: String(topic.id), name: topic.name, subjectId: topic.subjectId } });
  }, []);

  async function reviewProgress() {
    if (!data || aiLoading) return;
    setAiLoading(true);
    setAiError(null);
    try {
      const insight = await getAIProgressInsight(buildAIInput(data.dashboard, data.subjects, data.topicsBySubject, data.examsBySubject, data.preferences, data.plans, language));
      const saved: SavedProgressReview = { dayKey: todayKey, fingerprint: progressFingerprint(data.dashboard), language, userId, insight };
      setReview(saved);
      if (userId) await saveProgressReview(saved);
    } catch (error) {
      console.warn('AI progress review failed:', error);
      setAiError(error instanceof Error ? error.message : L('Could not review progress with AI. Please try again.', 'Kunne ikke få AI til å vurdere fremgangen. Prøv igjen.'));
    } finally {
      setAiLoading(false);
    }
  }

  const tabs: { key: ProgressTabKey; label: string }[] = [
    { key: 'overview', label: L('Overview', 'Oversikt') },
    { key: 'topics', label: L('Topics', 'Temaer') },
    { key: 'exams', label: L('Exams', 'Eksamener') },
    { key: 'insights', label: L('Insights', 'Innsikt') },
  ];

  const aiTopic = review?.insight.recommendedTopicId && metrics
    ? metrics.topics.find((topic) => String(topic.id) === review.insight.recommendedTopicId) ?? null
    : null;

  return (
    <SafeAreaView style={ui.container} edges={['top']}>
      <Stack.Screen options={{ headerShown: false }} />
      <PullToRefreshScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} onRefresh={loadData}>
        <View style={ui.headerRow}>
          <View style={ui.grow}>
            <Text style={ui.eyebrow}>MEDEXAM</Text>
            <Text style={ui.title} accessibilityRole="header">{L('Progress', 'Fremgang')}</Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel={L('Study preferences', 'Studiepreferanser')} onPress={() => router.push('/settings/study')} style={({ pressed }) => [styles.headerButton, pressed && ui.pressed]} hitSlop={6}>
            <StudyIcon name="settings" size={20} color={ink.secondary} />
          </Pressable>
        </View>
        <Text style={styles.subtitle}>{L('Your study progress at a glance.', 'Studiefremgangen din på ett sted.')}</Text>

        <View style={styles.segments} accessibilityRole="tablist">
          {tabs.map((item) => {
            const selected = tab === item.key;
            return (
              <Pressable
                key={item.key}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                onPress={() => setTab(item.key)}
                style={[styles.segment, selected && { backgroundColor: palette.accent }]}
              >
                <Text style={[styles.segmentText, selected && styles.segmentTextSelected]} numberOfLines={1}>{item.label}</Text>
              </Pressable>
            );
          })}
        </View>

        {loadFailed && data ? <Text style={styles.warning}>{L('Showing the last loaded progress. Pull down to try again.', 'Viser sist innlastede fremgang. Dra ned for å prøve igjen.')}</Text> : null}

        {!data || !metrics ? (
          <View style={styles.state}>
            {loading ? <ActivityIndicator color={palette.accent} /> : (
              <>
                <Text style={styles.stateText}>{L('Progress could not be loaded.', 'Fremgangen kunne ikke lastes inn.')}</Text>
                <Pressable accessibilityRole="button" onPress={() => { void loadData(); }} style={[styles.retry, { backgroundColor: palette.accent }]}>
                  <Text style={styles.retryText}>{L('Try again', 'Prøv igjen')}</Text>
                </Pressable>
              </>
            )}
          </View>
        ) : tab === 'overview' ? (
          <OverviewTab dashboard={data.dashboard} metrics={metrics} language={language} openTopic={openTopic} goToTab={setTab} />
        ) : tab === 'topics' ? (
          <TopicsTab dashboard={data.dashboard} metrics={metrics} language={language} openTopic={openTopic} goToTab={setTab} />
        ) : tab === 'exams' ? (
          <ExamsTab dashboard={data.dashboard} metrics={metrics} language={language} openTopic={openTopic} goToTab={setTab} />
        ) : (
          <InsightsTab
            dashboard={data.dashboard}
            metrics={metrics}
            language={language}
            openTopic={openTopic}
            goToTab={setTab}
            ai={{
              insight: review?.insight ?? null,
              loading: aiLoading,
              error: aiError,
              stale: review !== null && (review.fingerprint !== fingerprint || review.language !== language),
              topic: aiTopic,
              onReview: () => { void reviewProgress(); },
            }}
          />
        )}
      </PullToRefreshScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 36, gap: 14 },
  subtitle: { color: appColor('#718493', 'text'), fontSize: 15, lineHeight: 21, marginTop: -8 },
  headerButton: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: appColor('#FFFFFF', 'background'), borderWidth: 1, borderColor: appColor('#E7F0F4', 'border'), ...cardShadow },
  segments: { flexDirection: 'row', padding: 4, borderRadius: 22, backgroundColor: appColor('#FFFFFF', 'background'), borderWidth: 1, borderColor: appColor('#E7F0F4', 'border'), ...cardShadow },
  segment: { flex: 1, minHeight: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 18, paddingHorizontal: 4 },
  segmentText: { color: ink.secondary, fontSize: 12, fontWeight: '700' },
  segmentTextSelected: { color: '#FFFFFF' },
  warning: { color: appColor('#9A6530', 'text'), fontSize: 12 },
  state: { alignItems: 'center', gap: 14, paddingVertical: 60 },
  stateText: { color: ink.secondary, fontSize: 14 },
  retry: { minHeight: 46, justifyContent: 'center', paddingHorizontal: 20, borderRadius: 14 },
  retryText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
});
