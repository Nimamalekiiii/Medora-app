import { LocalizedText as Text } from '@/components/localized-text';
import PullToRefreshScrollView from '@/components/pull-to-refresh-scroll-view';
import { StudyIcon } from '@/components/study-icon';
import { useDayRefresh } from '@/hooks/use-day-refresh';
import { appColor } from '@/constants/adaptive-color';
import { subscribeToLocalDataChanges } from '@/services/cloud-sync-state';
import { buildProgressDashboard } from '@/services/progress-dashboard';
import { getDueFlashcards } from '@/services/study-engine';
import { getExamsBySubject, getFlashcardReviews, getFlashcards, getQuizResults, getStudyActivity, getSubjects, getTopicsBySubject } from '@/services/storage';
import type { DashboardTopic } from '@/services/progress-dashboard';
import type { Exam, Flashcard, FlashcardReview, QuizResult, StudyActivity, Subject, Topic, TopicsBySubject } from '@/types/study';
import { Stack, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, AppState, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type TopicData = {
  subjects: Subject[];
  topicsBySubject: TopicsBySubject;
  exams: Record<string, Exam | null>;
  cards: Flashcard[];
  activities: StudyActivity[];
  quizResults: QuizResult[];
  reviews: FlashcardReview[];
};

const EMPTY_DATA: TopicData = { subjects: [], topicsBySubject: {}, exams: {}, cards: [], activities: [], quizResults: [], reviews: [] };

function formatLastStudied(value: string | null) {
  if (!value) return 'Not studied yet';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'Not available';
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const day = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const difference = Math.round((today - day) / 86_400_000);
  if (difference === 0) return 'Today';
  if (difference === 1) return 'Yesterday';
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

export default function TopicScreen() {
  const params = useLocalSearchParams();
  const id = Array.isArray(params.id) ? params.id[0] : String(params.id ?? '');
  const nameParam = Array.isArray(params.name) ? params.name[0] : String(params.name ?? 'Topic');
  const subjectIdParam = Array.isArray(params.subjectId) ? params.subjectId[0] : String(params.subjectId ?? '');
  const todayKey = useDayRefresh();
  const [data, setData] = useState<TopicData>(EMPTY_DATA);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      const [subjects, topicsBySubject, exams, cards, activities, quizResults, reviews] = await Promise.all([
        getSubjects(), getTopicsBySubject(), getExamsBySubject(), getFlashcards(), getStudyActivity(), getQuizResults(), getFlashcardReviews(),
      ]);
      setData({ subjects, topicsBySubject, exams, cards, activities, quizResults, reviews });
    } catch (error) {
      console.warn('Could not load topic overview:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    setLoading(true);
    void loadData();
    const unsubscribe = subscribeToLocalDataChanges(() => { void loadData(); });
    const appState = AppState.addEventListener('change', (state) => { if (state === 'active') void loadData(); });
    return () => { unsubscribe(); appState.remove(); };
  }, [loadData]));

  const dashboard = useMemo(() => buildProgressDashboard({
    subjects: data.subjects, topicsBySubject: data.topicsBySubject, examsBySubject: data.exams,
    activities: data.activities, quizResults: data.quizResults, flashcardReviews: data.reviews,
  }), [data]);
  const dueCards = useMemo(() => getDueFlashcards(data.cards.filter((card) => String(card.topicId) === id)), [data.cards, id, todayKey]);
  const topicStat: DashboardTopic | undefined = dashboard.topics.find((topic) => String(topic.id) === id);
  const subject = data.subjects.find((item) => String(item.id) === (topicStat?.subjectId || subjectIdParam));
  const topic: Topic | undefined = subject ? (data.topicsBySubject[String(subject.id)] ?? []).find((item) => String(item.id) === id) : undefined;
  const topicName = topic?.name ?? nameParam;
  const activityCount = data.activities.filter((activity) => String(activity.topicId) === id).length;
  const topicExam = subject ? data.exams[String(subject.id)] : null;
  const examIncludesTopic = Boolean(topicExam?.topicIds?.map(String).includes(id));
  const examDays = topicExam && examIncludesTopic ? Math.ceil((new Date(`${topicExam.date}T00:00:00`).getTime() - new Date(`${todayKey}T00:00:00`).getTime()) / 86_400_000) : null;
  const answered = (topicStat?.quizQuestions ?? 0) + (topicStat?.activeRecallQuestions ?? 0);

  const routeParams = { id, name: topicName, subjectId: subject ? String(subject.id) : subjectIdParam };
  const openStudy = () => router.push({ pathname: '/subject/topic/study', params: routeParams });
  const openFlashcards = () => router.push({ pathname: '/subject/topic/flashcards', params: routeParams });
  const openProgress = () => router.push({ pathname: '/subject/topic/progress', params: routeParams });
  const startReview = () => router.push({ pathname: '/subject/topic/study/review', params: routeParams });

  function overviewCard(icon: 'brain' | 'cards' | 'chart' | 'calendar', title: string, value: string, detail: string) {
    return <View style={styles.metricCard} key={title}><View style={styles.metricIcon}><StudyIcon name={icon} size={18} /></View><View style={styles.grow}><Text style={styles.metricTitle}>{title}</Text><Text style={styles.metricValue}>{value}</Text><Text style={styles.metricDetail}>{detail}</Text></View></View>;
  }

  function actionCard(icon: 'brain' | 'cards' | 'chart', title: string, description: string, onPress: () => void, trailing?: string) {
    return <Pressable accessibilityRole="button" key={title} style={({ pressed }) => [styles.actionCard, pressed && styles.pressed]} onPress={onPress}>
      <View style={styles.actionIcon}><StudyIcon name={icon} size={22} /></View>
      <View style={styles.grow}><View style={styles.actionTitleRow}><Text style={styles.actionTitle}>{title}</Text>{trailing ? <Text style={styles.trailing}>{trailing}</Text> : null}</View><Text style={styles.actionDescription}>{description}</Text></View>
      <Text style={styles.arrow}>›</Text>
    </Pressable>;
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Stack.Screen options={{ headerShown: false }} />
      <PullToRefreshScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} onRefresh={loadData}>
        <Pressable style={styles.backButton} onPress={() => router.back()}><Text style={styles.backText}>‹  Study</Text></Pressable>
        <Text style={styles.title}>{topicName}</Text>
        <Text style={styles.subtitle}>{subject?.name ?? 'Subject'} · Manage everything for this topic.</Text>

        {loading ? <View style={styles.loading}><ActivityIndicator color={appColor('#328FB5', 'text')} /><Text style={styles.bodyText}>Updating this topic…</Text></View> : <>
          {examIncludesTopic && examDays !== null && examDays >= 0 ? <View style={styles.examCard}><View style={styles.examIcon}><StudyIcon name="calendar" size={18} /></View><View style={styles.grow}><Text style={styles.examTitle}>Included in {subject?.name} exam</Text><Text style={styles.examText}>{examDays === 0 ? 'Exam today' : `${examDays} days remaining`} · {topicExam?.type}</Text></View></View> : null}

          <View style={styles.overview}>
            <View style={styles.overviewHeader}><View><Text style={styles.sectionTitle}>Progress overview</Text><Text style={styles.bodyText}>Based on recorded study activity</Text></View><Text style={styles.overallPercent}>{topicStat?.practiceProgress ?? 0}%</Text></View>
            <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${topicStat?.practiceProgress ?? 0}%` }]} /></View>
            <Text style={styles.progressNote}>Practice progress combines your recorded study methods and quiz results. It is a progress indicator, not a claim of mastery.</Text>
            <View style={styles.metricsGrid}>
              {overviewCard('brain', 'Questions answered', String(answered), `${topicStat?.activeRecallQuestions ?? 0} Active Recall · ${topicStat?.quizQuestions ?? 0} quiz`)}
              {overviewCard('chart', 'Quiz accuracy', topicStat?.quizAccuracy === null || topicStat?.quizAccuracy === undefined ? '—' : `${topicStat.quizAccuracy}%`, topicStat?.quizQuestions ? `${topicStat.quizCorrect} correct of ${topicStat.quizQuestions}` : 'Take a quiz to record accuracy')}
              {overviewCard('cards', 'Flashcards due', String(dueCards.length), `${data.cards.filter((card) => String(card.topicId) === id).length} saved for this topic`)}
              {overviewCard('calendar', 'Study sessions', String(activityCount), `Last studied ${formatLastStudied(topicStat?.lastStudiedAt ?? null)}`)}
            </View>
          </View>

          <Text style={styles.sectionHeading}>Study this topic</Text>
          {actionCard('brain', 'Study', 'Practise with Active Recall or take a quiz.', openStudy)}
          {actionCard('cards', 'Flashcards', dueCards.length ? `${dueCards.length} ready for spaced review.` : 'Create, edit and review your cards.', openFlashcards, dueCards.length ? `${dueCards.length} due` : undefined)}
          {dueCards.length ? <Pressable style={styles.reviewButton} onPress={startReview}><StudyIcon name="review" size={18} color="#FFFFFF" /><Text style={styles.reviewButtonText}>Review due cards</Text></Pressable> : null}
          {actionCard('chart', 'Topic progress', 'Review quiz results, study history and areas to practise.', openProgress)}
        </>}
      </PullToRefreshScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: appColor('#F7FBFE', 'background'), paddingHorizontal: 20 },
  content: { paddingBottom: 38, gap: 14 },
  backButton: { alignSelf: 'flex-start', marginTop: 8, paddingVertical: 5 },
  backText: { color: appColor('#3B85A1', 'text'), fontSize: 14, fontWeight: '700' },
  title: { color: appColor('#17324D', 'text'), fontSize: 31, fontWeight: '800', marginTop: 4 },
  subtitle: { color: appColor('#738795', 'text'), fontSize: 13, lineHeight: 19, marginTop: -8 },
  grow: { flex: 1 },
  examCard: { flexDirection: 'row', gap: 10, alignItems: 'center', padding: 13, backgroundColor: appColor('#EDF7FA', 'background'), borderRadius: 16, borderWidth: 1, borderColor: appColor('#DAEDF3', 'border') },
  examIcon: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: appColor('#FFFFFF', 'background') },
  examTitle: { color: appColor('#294D60', 'text'), fontSize: 12, fontWeight: '800' },
  examText: { color: appColor('#648293', 'text'), fontSize: 11, marginTop: 3 },
  overview: { gap: 11, padding: 15, borderRadius: 19, backgroundColor: appColor('#FFFFFF', 'background'), borderWidth: 1, borderColor: appColor('#E6EDF1', 'border') },
  overviewHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionTitle: { color: appColor('#17324D', 'text'), fontSize: 16, fontWeight: '800' },
  bodyText: { color: appColor('#7A8D99', 'text'), fontSize: 11, marginTop: 3 },
  overallPercent: { color: appColor('#317F9D', 'text'), fontSize: 24, fontWeight: '800' },
  progressTrack: { height: 8, borderRadius: 8, overflow: 'hidden', backgroundColor: appColor('#E6EEF2', 'background') },
  progressFill: { height: '100%', borderRadius: 8, backgroundColor: '#45A1C3' },
  progressNote: { color: appColor('#83949E', 'text'), fontSize: 10, lineHeight: 15 },
  metricsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 2 },
  metricCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, width: '48%', flexGrow: 1, padding: 10, borderRadius: 13, backgroundColor: appColor('#F5F9FB', 'background') },
  metricIcon: { width: 29, height: 29, alignItems: 'center', justifyContent: 'center', borderRadius: 9, backgroundColor: appColor('#FFFFFF', 'background') },
  metricTitle: { color: appColor('#778B98', 'text'), fontSize: 9, fontWeight: '800' },
  metricValue: { color: appColor('#17324D', 'text'), fontSize: 17, fontWeight: '800', marginTop: 2 },
  metricDetail: { color: appColor('#81929D', 'text'), fontSize: 9, lineHeight: 13, marginTop: 2 },
  sectionHeading: { color: appColor('#17324D', 'text'), fontSize: 17, fontWeight: '800', marginTop: 5 },
  actionCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, backgroundColor: appColor('#FFFFFF', 'background'), borderRadius: 17, borderWidth: 1, borderColor: appColor('#E6EDF1', 'border') },
  actionIcon: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: appColor('#EAF5F9', 'background') },
  actionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  actionTitle: { color: appColor('#17324D', 'text'), fontSize: 14, fontWeight: '800' },
  actionDescription: { color: appColor('#788B98', 'text'), fontSize: 11, lineHeight: 16, marginTop: 3 },
  trailing: { color: appColor('#347E9B', 'text'), fontSize: 9, fontWeight: '800', backgroundColor: appColor('#E8F5FA', 'background'), paddingHorizontal: 6, paddingVertical: 3, borderRadius: 7 },
  arrow: { color: appColor('#9AB5C4', 'text'), fontSize: 24, fontWeight: '300' },
  reviewButton: { flexDirection: 'row', minHeight: 44, alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 13, backgroundColor: '#328FB5', marginTop: -6 },
  reviewButtonText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  loading: { alignItems: 'center', padding: 36, gap: 10 },
  pressed: { opacity: 0.82, transform: [{ scale: 0.99 }] },
});
