import { LocalizedText as Text } from '@/components/localized-text';
import PullToRefreshScrollView from '@/components/pull-to-refresh-scroll-view';
import { StudyIcon } from '@/components/study-icon';
import { appColor } from '@/constants/adaptive-color';
import { subscribeToLocalDataChanges } from '@/services/cloud-sync-state';
import {
  getExamsBySubject,
  getFlashcardReviews,
  getFlashcards,
  getQuizResults,
  getStudyActivity,
  getStudyPlansBySubject,
  getStudyPreferences,
  getSubjects,
  getTopicsBySubject,
} from '@/services/storage';
import { buildProgressDashboard } from '@/services/progress-dashboard';
import { getDueFlashcards } from '@/services/study-engine';
import { useDayRefresh } from '@/hooks/use-day-refresh';
import type { Exam, Flashcard, StudyActivity, StudyPlansBySubject, Subject, Topic, TopicsBySubject } from '@/types/study';
import { Stack, router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, AppState, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type StudyData = {
  subjects: Subject[];
  topics: TopicsBySubject;
  exams: Record<string, Exam | null>;
  cards: Flashcard[];
  activities: StudyActivity[];
  quizResults: Awaited<ReturnType<typeof getQuizResults>>;
  reviews: Awaited<ReturnType<typeof getFlashcardReviews>>;
  plans: StudyPlansBySubject;
  preferences: Awaited<ReturnType<typeof getStudyPreferences>>;
};

const EMPTY_DATA: StudyData = {
  subjects: [], topics: {}, exams: {}, cards: [], activities: [], quizResults: [], reviews: [],
  plans: {}, preferences: {
    dailyGoalMinutes: 45, preferredMethods: ['active_recall', 'flashcards', 'quiz', 'review'],
    studyDays: [1, 2, 3, 4, 5], preferredStudyTime: 'evening', sessionLengthMinutes: 25,
    breakDurationMinutes: 5, autoGeneratePlan: true, includeWeekends: false, prioritizeWeakTopics: true,
    prioritizeUpcomingExams: true, includeReviewSessions: true, includeFlashcards: true, includeQuizzes: true,
  },
};

export default function StudyHomeScreen() {
  const todayKey = useDayRefresh();
  const [data, setData] = useState<StudyData>(EMPTY_DATA);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');

  const loadData = useCallback(async (showLoading: boolean) => {
    if (showLoading) setLoading(true);
    try {
      const [subjects, topics, exams, cards, activities, quizResults, reviews, preferences, plans] = await Promise.all([
        getSubjects(), getTopicsBySubject(), getExamsBySubject(), getFlashcards(), getStudyActivity(),
        getQuizResults(), getFlashcardReviews(), getStudyPreferences(), getStudyPlansBySubject(),
      ]);
      setData({ subjects, topics, exams, cards, activities, quizResults, reviews, plans, preferences });
    } catch (error) {
      console.warn('Could not load Study data:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    void loadData(true);
    const unsubscribe = subscribeToLocalDataChanges(() => { void loadData(false); });
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') void loadData(false);
    });
    return () => { unsubscribe(); appState.remove(); };
  }, [loadData]));

  const dashboard = useMemo(() => buildProgressDashboard({
    subjects: data.subjects,
    topicsBySubject: data.topics,
    examsBySubject: data.exams,
    activities: data.activities,
    quizResults: data.quizResults,
    flashcardReviews: data.reviews,
  }), [data]);
  const dueCards = useMemo(() => getDueFlashcards(data.cards), [data.cards, todayKey]);
  const dueByTopic = useMemo(() => {
    const map = new Map<string, number>();
    dueCards.forEach((card) => map.set(String(card.topicId), (map.get(String(card.topicId)) ?? 0) + 1));
    return map;
  }, [dueCards]);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visibleSubjects = data.subjects.map((subject) => ({
    subject,
    topics: (data.topics[String(subject.id)] ?? []).filter((topic) => !normalizedQuery ||
      subject.name.toLocaleLowerCase().includes(normalizedQuery) || topic.name.toLocaleLowerCase().includes(normalizedQuery)),
  })).filter(({ subject, topics }) => !normalizedQuery || subject.name.toLocaleLowerCase().includes(normalizedQuery) || topics.length > 0);

  const today = new Date(`${todayKey}T00:00:00`);
  const recommendation = dashboard.analysis.recommendations[0];
  const recommendationSubject = recommendation && data.subjects.find((subject) => String(subject.id) === recommendation.subjectId);
  const recommendationTopic = recommendation && (data.topics[recommendation.subjectId] ?? []).find((topic) => String(topic.id) === recommendation.topicId);
  const plannedTodaySubjects = data.subjects.filter((subject) => data.plans[String(subject.id)]?.studyDays.includes(today.getDay()));
  const upcomingExam = dashboard.exams.find((exam) => exam.daysUntil >= 0);
  const examSubject = upcomingExam ? data.subjects.find((subject) => String(subject.id) === upcomingExam.subjectId) : undefined;
  const planSubject = [...plannedTodaySubjects].sort((a, b) => {
    const aDate = data.exams[String(a.id)]?.date;
    const bDate = data.exams[String(b.id)]?.date;
    return (aDate ? new Date(`${aDate}T00:00:00`).getTime() : Number.MAX_SAFE_INTEGER) - (bDate ? new Date(`${bDate}T00:00:00`).getTime() : Number.MAX_SAFE_INTEGER);
  })[0] ?? (data.preferences.studyDays.includes(today.getDay()) ? recommendationSubject ?? examSubject ?? data.subjects[0] : undefined);
  const todayPlan = planSubject ? data.plans[String(planSubject.id)] : undefined;
  const planExam = planSubject ? dashboard.exams.find((exam) => exam.subjectId === String(planSubject.id)) : undefined;
  const planRecommendation = planSubject ? dashboard.analysis.recommendations.find((item) => item.subjectId === String(planSubject.id)) : undefined;
  const planTopic = planSubject
    ? (data.topics[String(planSubject.id)] ?? []).find((topic) => String(topic.id) === planRecommendation?.topicId) ?? (data.topics[String(planSubject.id)] ?? [])[0]
    : undefined;

  const openTopic = (topic: Topic, subject: Subject) => router.push({
    pathname: '/subject/topic/[id]',
    params: { id: String(topic.id), name: topic.name, subjectId: String(subject.id), subjectName: subject.name },
  });
  const startDueReview = () => router.push({ pathname: '/subject/topic/study/review', params: { all: '1', name: 'Due flashcards' } });
  const startTopicReview = (topic: Topic, subject: Subject) => router.push({
    pathname: '/subject/topic/study/review',
    params: { id: String(topic.id), name: topic.name, subjectId: String(subject.id) },
  });

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Stack.Screen options={{ headerShown: false }} />
      <PullToRefreshScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        onRefresh={() => loadData(false)}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.eyebrow}>YOUR LEARNING LIBRARY</Text>
            <Text style={styles.title}>Study</Text>
          </View>
          <View style={styles.headerIcon}><StudyIcon name="book" size={25} /></View>
        </View>
        <Text style={styles.subtitle}>Choose a subject, open a topic and pick how you want to learn.</Text>

        <View style={styles.searchBox}>
          <StudyIcon name="book" size={18} color={appColor('#728A9B', 'text')} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search subjects and topics"
            placeholderTextColor={appColor('#91A2AE', 'text')}
            style={styles.searchInput}
            returnKeyType="search"
            accessibilityLabel="Search subjects and topics"
          />
          {query ? <Pressable onPress={() => setQuery('')} accessibilityRole="button" accessibilityLabel="Clear search"><StudyIcon name="x" size={18} /></Pressable> : null}
        </View>

        {loading ? (
          <View style={styles.loading}><ActivityIndicator color={appColor('#3A91B7', 'text')} /><Text style={styles.muted}>Loading your study library…</Text></View>
        ) : <>
          {dueCards.length > 0 ? (
            <Pressable accessibilityRole="button" onPress={startDueReview} style={({ pressed }) => [styles.dueCard, pressed && styles.pressed]}>
              <View style={styles.dueIcon}><StudyIcon name="review" size={23} color="#23799F" /></View>
              <View style={styles.grow}>
                <Text style={styles.dueTitle}>{dueCards.length} flashcard{dueCards.length === 1 ? '' : 's'} due today</Text>
                <Text style={styles.cardDescription}>Review across {new Set(dueCards.map((card) => card.topicId)).size} topic{new Set(dueCards.map((card) => card.topicId)).size === 1 ? '' : 's'}</Text>
                <View style={styles.dueTopics}>
                  {[...dueByTopic.entries()].slice(0, 3).map(([topicId, count]) => {
                    const topic = data.subjects.flatMap((subject) => data.topics[String(subject.id)] ?? []).find((item) => String(item.id) === topicId);
                    return <Text key={topicId} style={styles.dueTopicText}>{count} {topic?.name ?? 'cards'}</Text>;
                  })}
                </View>
              </View>
              <View style={styles.reviewAction}><Text style={styles.reviewActionText}>Review</Text><StudyIcon name="review" size={16} color="#FFFFFF" /></View>
            </Pressable>
          ) : (
            <View style={styles.caughtUpCard}>
              <View style={styles.caughtUpIcon}><StudyIcon name="check" size={20} /></View>
              <View style={styles.grow}><Text style={styles.caughtUpTitle}>No flashcards due today</Text><Text style={styles.cardDescription}>Your review queue is clear.</Text></View>
            </View>
          )}

          {planSubject ? (
            <View style={styles.planCard}>
              <View style={styles.sectionHeadingRow}>
                <View style={styles.sectionIcon}><StudyIcon name="calendar" size={19} /></View>
                <View style={styles.grow}><Text style={styles.sectionTitle}>Today’s study plan</Text><Text style={styles.cardDescription}>{planSubject.name} · {todayPlan?.dailyStudyMinutes ?? data.preferences.dailyGoalMinutes} min</Text></View>
              </View>
              {planExam ? <Text style={styles.examHint}>{planExam.daysUntil === 0 ? 'Exam today' : `${planExam.daysUntil} days until ${planExam.subjectName} exam`}</Text> : null}
              {planTopic && planSubject ? (
                <Pressable style={styles.planTopic} onPress={() => openTopic(planTopic, planSubject)}>
                  <View style={styles.recommendationMark}><StudyIcon name="target" size={17} /></View>
                  <View style={styles.grow}><Text style={styles.planTopicTitle}>{planTopic.name}</Text><Text style={styles.cardDescription}>{planRecommendation?.reason ?? 'Continue with the next topic in this subject plan.'}</Text></View>
                  <Text style={styles.arrow}>›</Text>
                </Pressable>
              ) : <Pressable style={styles.planTopic} onPress={() => router.push({ pathname: '/subject/study-plan', params: { id: String(planSubject.id), name: planSubject.name } })}><View style={styles.grow}><Text style={styles.planTopicTitle}>Review your study plan</Text><Text style={styles.cardDescription}>Add topics to turn this schedule into study sessions.</Text></View><Text style={styles.arrow}>›</Text></Pressable>}
            </View>
          ) : null}

          {recommendation && recommendationSubject && recommendationTopic ? (
            <Pressable style={styles.recommendationCard} onPress={() => openTopic(recommendationTopic, recommendationSubject)}>
              <View style={styles.recommendationIcon}><StudyIcon name="sparkles" size={20} /></View>
              <View style={styles.grow}><Text style={styles.recommendationLabel}>Recommended next</Text><Text style={styles.recommendationTitle}>{recommendationTopic.name}</Text><Text style={styles.cardDescription}>{recommendation.reason}</Text></View>
              <Text style={styles.arrow}>›</Text>
            </Pressable>
          ) : null}

          {visibleSubjects.length ? visibleSubjects.map(({ subject, topics }) => {
            const subjectId = String(subject.id);
            const subjectExam = data.exams[subjectId];
            const examDays = subjectExam ? Math.ceil((new Date(`${subjectExam.date}T00:00:00`).getTime() - new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()) / 86_400_000) : null;
            return (
              <View key={subjectId} style={styles.subjectSection}>
                <View style={styles.subjectHeader}>
                  <View style={styles.subjectGlyph}><StudyIcon name="layers" size={19} /></View>
                  <View style={styles.grow}><Text style={styles.subjectTitle}>{subject.name}</Text>{subjectExam && examDays !== null && examDays >= 0 ? <Text style={styles.examLabel}>{examDays === 0 ? 'Exam today' : `Exam in ${examDays} days`}</Text> : null}</View>
                  <Text style={styles.topicCount}>{topics.length} topic{topics.length === 1 ? '' : 's'}</Text>
                </View>
                {topics.map((topic) => {
                  const due = dueByTopic.get(String(topic.id)) ?? 0;
                  const recent = data.activities.filter((item) => String(item.topicId) === String(topic.id)).sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime())[0];
                  const activityLabel = recent ? `Last studied ${new Date(recent.completedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}` : 'Active Recall · Quiz · Flashcards';
                  return (
                    <View key={String(topic.id)} style={styles.topicRow}>
                      <Pressable accessibilityRole="button" style={({ pressed }) => [styles.topicMain, pressed && styles.pressed]} onPress={() => openTopic(topic, subject)}>
                        <View style={styles.topicMarker}><StudyIcon name="book" size={17} /></View>
                        <View style={styles.grow}><Text style={styles.topicTitle}>{topic.name}</Text><Text style={styles.topicDetail}>{due > 0 ? `${due} card${due === 1 ? '' : 's'} due for review` : activityLabel}</Text></View>
                        <Text style={styles.arrow}>›</Text>
                      </Pressable>
                      {due > 0 ? <Pressable accessibilityRole="button" onPress={() => startTopicReview(topic, subject)} style={styles.topicReviewButton}><Text style={styles.topicReviewText}>Review {due}</Text></Pressable> : null}
                    </View>
                  );
                })}
              </View>
            );
          }) : (
            <View style={styles.emptyCard}>
              <View style={styles.emptyIcon}><StudyIcon name={normalizedQuery ? 'book' : 'layers'} size={25} /></View>
              <Text style={styles.emptyTitle}>{normalizedQuery ? 'No matching subjects or topics' : 'Your study library is empty'}</Text>
              <Text style={styles.cardDescription}>{normalizedQuery ? 'Try a different search term.' : 'Add a subject and its topics to see them here.'}</Text>
              {!normalizedQuery ? <Pressable onPress={() => router.push('/(tabs)/subjects')} style={styles.emptyButton}><Text style={styles.emptyButtonText}>Add subjects</Text></Pressable> : null}
            </View>
          )}
        </>}
      </PullToRefreshScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: appColor('#F7FBFE', 'background') },
  content: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 36, gap: 16 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  eyebrow: { color: appColor('#7F98A7', 'text'), fontSize: 10, fontWeight: '800', letterSpacing: 1.2 },
  title: { color: appColor('#17324D', 'text'), fontSize: 34, fontWeight: '800', letterSpacing: -0.5, marginTop: 2 },
  headerIcon: { width: 48, height: 48, borderRadius: 16, backgroundColor: appColor('#E8F5FA', 'background'), alignItems: 'center', justifyContent: 'center' },
  subtitle: { color: appColor('#718594', 'text'), fontSize: 14, lineHeight: 21, marginTop: -10 },
  searchBox: { minHeight: 50, flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 16, paddingHorizontal: 14, backgroundColor: appColor('#FFFFFF', 'background'), borderWidth: 1, borderColor: appColor('#E6EDF1', 'border') },
  searchInput: { flex: 1, minHeight: 48, color: appColor('#17324D', 'text'), fontSize: 15 },
  loading: { alignItems: 'center', gap: 12, paddingVertical: 42 },
  muted: { color: appColor('#718594', 'text'), fontSize: 14 },
  dueCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 15, borderRadius: 20, backgroundColor: appColor('#EAF7FC', 'background'), borderWidth: 1, borderColor: appColor('#D4EBF4', 'border') },
  dueIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: appColor('#FFFFFF', 'background'), alignItems: 'center', justifyContent: 'center' },
  grow: { flex: 1 },
  dueTitle: { color: appColor('#17324D', 'text'), fontWeight: '800', fontSize: 16 },
  cardDescription: { color: appColor('#738795', 'text'), fontSize: 12, lineHeight: 17, marginTop: 3 },
  dueTopics: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  dueTopicText: { color: appColor('#4D7488', 'text'), fontSize: 10, fontWeight: '700', backgroundColor: appColor('#D9EEF6', 'background'), borderRadius: 8, paddingHorizontal: 7, paddingVertical: 4 },
  reviewAction: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#328FB5', borderRadius: 11, paddingHorizontal: 10, paddingVertical: 9 },
  reviewActionText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  caughtUpCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 18, backgroundColor: appColor('#FFFFFF', 'background'), borderWidth: 1, borderColor: appColor('#E6EDF1', 'border') },
  caughtUpIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: appColor('#EAF7F1', 'background'), alignItems: 'center', justifyContent: 'center' },
  caughtUpTitle: { color: appColor('#17324D', 'text'), fontSize: 14, fontWeight: '700' },
  planCard: { gap: 12, padding: 15, borderRadius: 19, backgroundColor: appColor('#FFFFFF', 'background'), borderWidth: 1, borderColor: appColor('#E6EDF1', 'border') },
  sectionHeadingRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  sectionIcon: { width: 36, height: 36, borderRadius: 12, backgroundColor: appColor('#EFF7FA', 'background'), alignItems: 'center', justifyContent: 'center' },
  sectionTitle: { color: appColor('#17324D', 'text'), fontSize: 15, fontWeight: '800' },
  examHint: { color: appColor('#3E7D99', 'text'), fontSize: 12, fontWeight: '700' },
  planTopic: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 14, padding: 10, backgroundColor: appColor('#F5FAFC', 'background') },
  recommendationMark: { width: 32, height: 32, borderRadius: 10, backgroundColor: appColor('#E3F3F8', 'background'), alignItems: 'center', justifyContent: 'center' },
  planTopicTitle: { color: appColor('#17324D', 'text'), fontSize: 13, fontWeight: '800' },
  recommendationCard: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: 18, backgroundColor: appColor('#F0F8FB', 'background'), borderWidth: 1, borderColor: appColor('#DDEEF4', 'border') },
  recommendationIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: appColor('#FFFFFF', 'background'), alignItems: 'center', justifyContent: 'center' },
  recommendationLabel: { color: appColor('#4F859B', 'text'), fontSize: 10, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase' },
  recommendationTitle: { color: appColor('#17324D', 'text'), fontSize: 14, fontWeight: '800', marginTop: 2 },
  subjectSection: { gap: 9 },
  subjectHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 6, marginBottom: 2 },
  subjectGlyph: { width: 38, height: 38, borderRadius: 12, backgroundColor: appColor('#E8F4F8', 'background'), alignItems: 'center', justifyContent: 'center' },
  subjectTitle: { color: appColor('#17324D', 'text'), fontSize: 17, fontWeight: '800' },
  examLabel: { color: appColor('#4C8197', 'text'), fontSize: 11, fontWeight: '700', marginTop: 2 },
  topicCount: { color: appColor('#8B9CA6', 'text'), fontSize: 11, fontWeight: '600' },
  topicRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: appColor('#FFFFFF', 'background'), borderRadius: 16, borderWidth: 1, borderColor: appColor('#E8EEF1', 'border'), padding: 10 },
  topicMain: { flex: 1, minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 10 },
  topicMarker: { width: 34, height: 34, borderRadius: 11, backgroundColor: appColor('#F0F7FA', 'background'), alignItems: 'center', justifyContent: 'center' },
  topicTitle: { color: appColor('#17324D', 'text'), fontSize: 14, fontWeight: '700' },
  topicDetail: { color: appColor('#7B8E9B', 'text'), fontSize: 11, marginTop: 3 },
  arrow: { color: appColor('#9AADB8', 'text'), fontSize: 24, fontWeight: '300' },
  topicReviewButton: { borderRadius: 10, backgroundColor: appColor('#E9F5FA', 'background'), paddingHorizontal: 9, paddingVertical: 8 },
  topicReviewText: { color: appColor('#337E9C', 'text'), fontSize: 11, fontWeight: '800' },
  emptyCard: { alignItems: 'center', gap: 8, padding: 24, borderRadius: 20, backgroundColor: appColor('#FFFFFF', 'background'), borderWidth: 1, borderColor: appColor('#E6EDF1', 'border') },
  emptyIcon: { width: 54, height: 54, borderRadius: 18, backgroundColor: appColor('#EFF7FA', 'background'), alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  emptyTitle: { color: appColor('#17324D', 'text'), fontSize: 17, fontWeight: '800', textAlign: 'center' },
  emptyButton: { marginTop: 8, borderRadius: 12, backgroundColor: '#328FB5', paddingHorizontal: 16, paddingVertical: 11 },
  emptyButtonText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  pressed: { opacity: 0.82, transform: [{ scale: 0.99 }] },
});
