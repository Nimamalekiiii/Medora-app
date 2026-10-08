import { LocalizedText as Text } from '@/components/localized-text';
import PullToRefreshScrollView from '@/components/pull-to-refresh-scroll-view';
import { StudyIcon, type StudyIconName } from '@/components/study-icon';
import { appColor } from '@/constants/adaptive-color';
import { useDayRefresh } from '@/hooks/use-day-refresh';
import { getAITopicInsight, type AITopicInsight } from '@/services/ai-api';
import { subscribeToLocalDataChanges } from '@/services/cloud-sync-state';
import { buildProgressDashboard, type DashboardTopic } from '@/services/progress-dashboard';
import { getDueFlashcards } from '@/services/study-engine';
import {
  getActiveRecallQuestionsForTopic, getAppPreferences, getExamsBySubject, getFlashcardReviews,
  getFlashcards, getQuizResults, getStudyActivity, getStudyPreferences, getSubjects, getTopicsBySubject,
} from '@/services/storage';
import type { ActiveRecallQuestion, Exam, Flashcard, FlashcardReview, QuizResult, StudyActivity, Subject, TopicsBySubject } from '@/types/study';
import { Stack, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type TopicData = {
  subjects: Subject[];
  topics: TopicsBySubject;
  exams: Record<string, Exam | null>;
  cards: Flashcard[];
  activities: StudyActivity[];
  quizResults: QuizResult[];
  reviews: FlashcardReview[];
  questions: ActiveRecallQuestion[];
  studyPreferences: Awaited<ReturnType<typeof getStudyPreferences>>;
  language: 'en' | 'no';
};

const DEFAULT_PREFERENCES: TopicData['studyPreferences'] = {
  dailyGoalMinutes: 45, preferredMethods: ['active_recall', 'quiz', 'flashcards', 'review'],
  studyDays: [1, 2, 3, 4, 5], preferredStudyTime: 'evening', sessionLengthMinutes: 25,
  breakDurationMinutes: 5, autoGeneratePlan: true, includeWeekends: false, prioritizeWeakTopics: true,
  prioritizeUpcomingExams: true, includeReviewSessions: true, includeFlashcards: true, includeQuizzes: true,
};
const EMPTY_DATA: TopicData = { subjects: [], topics: {}, exams: {}, cards: [], activities: [], quizResults: [], reviews: [], questions: [], studyPreferences: DEFAULT_PREFERENCES, language: 'en' };

function relativeDate(value: string | null) {
  if (!value) return 'Not studied yet';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'Not available';
  const today = new Date();
  const localToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const localDate = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const days = Math.round((localToday - localDate) / 86_400_000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

function activityPresentation(activity: StudyActivity): { label: string; icon: StudyIconName } {
  if (activity.activity === 'active_recall') return { label: 'Active Recall', icon: 'brain' };
  if (activity.activity === 'quiz') return { label: 'Quiz', icon: 'quiz' };
  if (activity.activity === 'focus') return { label: 'Focus session', icon: 'focus' };
  if (activity.activity === 'review') return { label: 'Flashcard review', icon: 'review' };
  return { label: 'Flashcards', icon: 'cards' };
}

export default function TopicProgressScreen() {
  const params = useLocalSearchParams();
  const topicId = Array.isArray(params.id) ? params.id[0] : String(params.id ?? '');
  const fallbackName = Array.isArray(params.name) ? params.name[0] : String(params.name ?? 'Topic');
  const fallbackSubjectId = Array.isArray(params.subjectId) ? params.subjectId[0] : String(params.subjectId ?? '');
  const todayKey = useDayRefresh();
  const [data, setData] = useState<TopicData>(EMPTY_DATA);
  const [loading, setLoading] = useState(true);
  const [aiLoading, setAILoading] = useState(false);
  const [aiError, setAIError] = useState<string | null>(null);
  const [aiInsight, setAIInsight] = useState<AITopicInsight | null>(null);
  const aiRevision = useRef(0);

  const loadData = useCallback(async (invalidateAI = false) => {
    if (invalidateAI) {
      aiRevision.current += 1;
      setAIInsight(null);
      setAIError(null);
    }
    try {
      const [subjects, topics, exams, cards, activities, quizResults, reviews, questions, studyPreferences, appPreferences] = await Promise.all([
        getSubjects(), getTopicsBySubject(), getExamsBySubject(), getFlashcards(), getStudyActivity(), getQuizResults(), getFlashcardReviews(),
        getActiveRecallQuestionsForTopic(topicId), getStudyPreferences(), getAppPreferences(),
      ]);
      setData({ subjects, topics, exams, cards, activities, quizResults, reviews, questions, studyPreferences, language: appPreferences.language });
    } catch (error) {
      console.warn('Could not load topic progress:', error);
    } finally {
      setLoading(false);
    }
  }, [topicId]);

  useFocusEffect(useCallback(() => {
    setLoading(true);
    void loadData(false);
    const unsubscribe = subscribeToLocalDataChanges(() => { void loadData(true); });
    const appState = AppState.addEventListener('change', (state) => { if (state === 'active') void loadData(false); });
    return () => { unsubscribe(); appState.remove(); };
  }, [loadData]));

  const dashboard = useMemo(() => buildProgressDashboard({
    subjects: data.subjects, topicsBySubject: data.topics, examsBySubject: data.exams,
    activities: data.activities, quizResults: data.quizResults, flashcardReviews: data.reviews,
  }, undefined, data.language), [data]);
  const topicStats: DashboardTopic | undefined = dashboard.topics.find((topic) => String(topic.id) === topicId);
  const subject = data.subjects.find((item) => String(item.id) === (topicStats?.subjectId ?? fallbackSubjectId));
  const topic = (data.topics[String(subject?.id ?? fallbackSubjectId)] ?? []).find((item) => String(item.id) === topicId);
  const topicName = topic?.name ?? fallbackName;
  const topicCards = useMemo(() => data.cards.filter((card) => String(card.topicId) === topicId), [data.cards, topicId]);
  const dueCards = useMemo(() => getDueFlashcards(topicCards), [topicCards, todayKey]);
  const activity = dashboard.activities.filter((item) => String(item.topicId) === topicId).sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime());
  const latestStudy = topicStats?.lastStudiedAt ?? null;
  const activeRecallAgain = Math.max(topicStats?.activeRecallRatings.again ?? 0, data.questions.reduce((sum, question) => sum + (question.againCount ?? 0), 0));
  const activeRecallHard = Math.max(topicStats?.activeRecallRatings.hard ?? 0, data.questions.reduce((sum, question) => sum + (question.hardCount ?? 0), 0));
  const troubledQuestions = [...data.questions]
    .filter((question) => (question.againCount ?? 0) + (question.hardCount ?? 0) > 0)
    .sort((a, b) => (b.againCount ?? 0) + (b.hardCount ?? 0) - ((a.againCount ?? 0) + (a.hardCount ?? 0)))
    .slice(0, 5);
  const missedQuizQuestions = data.quizResults
    .filter((result) => String(result.topicId) === topicId)
    .sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime())
    .flatMap((result) => result.missedQuestions ?? [])
    .slice(0, 5);
  const topicExam = subject ? data.exams[String(subject.id)] : null;
  const isExamTopic = Boolean(topicExam?.topicIds?.map(String).includes(topicId));
  const daysUntilExam = topicExam && isExamTopic
    ? Math.round((new Date(`${topicExam.date}T00:00:00`).getTime() - new Date(`${todayKey}T00:00:00`).getTime()) / 86_400_000)
    : null;
  const activityCount = activity.length;
  const studyMinutes = Math.round(activity.reduce((sum, item) => sum + Math.max(0, item.durationSeconds || 0), 0) / 60);
  const answered = (topicStats?.quizQuestions ?? 0) + (topicStats?.activeRecallQuestions ?? 0);
  const correct = (topicStats?.quizCorrect ?? 0) + (topicStats?.activeRecallRatings.good ?? 0) + (topicStats?.activeRecallRatings.easy ?? 0);
  const incorrect = Math.max(0, (topicStats?.quizQuestions ?? 0) - (topicStats?.quizCorrect ?? 0) + activeRecallAgain + activeRecallHard);
  const methods = data.studyPreferences.preferredMethods.filter((method) =>
    (method !== 'review' || data.studyPreferences.includeReviewSessions) &&
    (method !== 'flashcards' || data.studyPreferences.includeFlashcards) &&
    (method !== 'quiz' || data.studyPreferences.includeQuizzes));

  async function analyzeTopic() {
    if (!topicStats || !subject) return;
    const revisionAtStart = aiRevision.current;
    setAILoading(true);
    setAIError(null);
    try {
      const insight = await getAITopicInsight({
        language: data.language,
        topic: { id: topicId, name: topicName, subjectName: subject.name },
        metrics: {
          practiceProgress: topicStats.practiceProgress,
          quizAccuracy: topicStats.quizAccuracy,
          quizQuestions: topicStats.quizQuestions,
          quizCorrect: topicStats.quizCorrect,
          activeRecallQuestions: topicStats.activeRecallQuestions,
          activeRecallAgain,
          activeRecallHard,
          flashcardsTotal: topicCards.length,
          flashcardsReviewed: topicStats.flashcardsReviewed,
          flashcardsDue: dueCards.length,
          studySessions: activityCount,
          studyMinutes,
          lastStudiedAt: latestStudy,
          daysUntilExam: daysUntilExam !== null && daysUntilExam >= 0 ? daysUntilExam : null,
          troubledQuestions: [
            ...troubledQuestions.map((question) => question.question.slice(0, 300)),
            ...missedQuizQuestions.map((question) => `Recent quiz miss: ${question.question.slice(0, 260)}`),
          ].slice(0, 10),
        },
        preferredMethods: methods,
      });
      if (revisionAtStart === aiRevision.current) setAIInsight(insight);
    } catch (error) {
      if (revisionAtStart === aiRevision.current) setAIError(error instanceof Error ? error.message : 'Could not analyze this topic. Try again.');
    } finally {
      setAILoading(false);
    }
  }

  function metric(icon: StudyIconName, label: string, value: string, detail: string) {
    return <View key={label} style={styles.metricCard}><View style={styles.metricIcon}><StudyIcon name={icon} size={17} /></View><Text style={styles.metricLabel}>{label}</Text><Text style={styles.metricValue}>{value}</Text><Text style={styles.metricDetail}>{detail}</Text></View>;
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Stack.Screen options={{ headerShown: false }} />
      <PullToRefreshScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} onRefresh={() => loadData(true)}>
        <Pressable style={styles.backButton} onPress={() => router.back()}><Text style={styles.backText}>‹  {topicName}</Text></Pressable>
        <Text style={styles.eyebrow}>TOPIC PROGRESS</Text>
        <Text style={styles.title}>{topicName}</Text>
        <Text style={styles.subtitle}>{subject?.name ?? 'Subject'} · Activity and practice saved for this topic.</Text>

        {loading ? <View style={styles.loading}><ActivityIndicator color="#328FB5" /><Text style={styles.bodyText}>Updating saved progress…</Text></View> : <>
          {isExamTopic && topicExam && daysUntilExam !== null && daysUntilExam >= 0 ? <View style={styles.examCard}><View style={styles.examIcon}><StudyIcon name="calendar" size={18} /></View><View style={styles.grow}><Text style={styles.examTitle}>Part of the {subject?.name} exam</Text><Text style={styles.examText}>{daysUntilExam === 0 ? 'Exam today' : `${daysUntilExam} days remaining`} · {topicExam.type}</Text></View></View> : null}

          <View style={styles.scoreCard}>
            <View style={styles.scoreHeader}><View><Text style={styles.eyebrow}>RECORDED PRACTICE PROGRESS</Text><Text style={styles.scoreCaption}>Based on methods used and quiz accuracy</Text></View><Text style={styles.scoreValue}>{topicStats?.practiceProgress ?? 0}%</Text></View>
            <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${topicStats?.practiceProgress ?? 0}%` }]} /></View>
            <Text style={styles.footnote}>This is a calculated practice indicator, not a claim of mastery or an exam prediction.</Text>
          </View>

          <View style={styles.metricsGrid}>
            {metric('quiz', 'Quiz accuracy', topicStats?.quizAccuracy === null || topicStats?.quizAccuracy === undefined ? '—' : `${topicStats.quizAccuracy}%`, topicStats?.quizQuestions ? `${topicStats.quizCorrect} correct of ${topicStats.quizQuestions}` : 'No quiz answers saved')}
            {metric('brain', 'Active Recall', String(topicStats?.activeRecallQuestions ?? 0), `Again ${activeRecallAgain} · Hard ${activeRecallHard}`)}
            {metric('cards', 'Flashcards', String(topicStats?.flashcardsReviewed ?? 0), `${topicCards.length} saved · ${dueCards.length} due`)}
            {metric('calendar', 'Study sessions', String(activityCount), `${studyMinutes} min · last ${relativeDate(latestStudy)}`)}
          </View>

          <View style={styles.responseCard}>
            <View style={styles.sectionHeading}><View style={styles.sectionIcon}><StudyIcon name="chart" size={19} /></View><View><Text style={styles.sectionTitle}>Question results</Text><Text style={styles.sectionSub}>From saved quizzes and rated recall sessions</Text></View></View>
            <View style={styles.resultRow}><View style={styles.resultTile}><Text style={styles.resultValue}>{answered}</Text><Text style={styles.resultLabel}>Answered</Text></View><View style={styles.resultTile}><Text style={styles.resultValue}>{correct}</Text><Text style={styles.resultLabel}>Remembered well</Text></View><View style={styles.resultTile}><Text style={styles.resultValue}>{incorrect}</Text><Text style={styles.resultLabel}>Needs practice</Text></View></View>
            <Text style={styles.footnote}>Active Recall answers are self-rated. Correct and needs-practice totals combine quiz answers with Good/Easy or Again/Hard ratings.</Text>
          </View>

          {troubledQuestions.length || missedQuizQuestions.length ? <View style={styles.responseCard}>
            <View style={styles.sectionHeading}><View style={styles.sectionIcon}><StudyIcon name="target" size={18} /></View><View><Text style={styles.sectionTitle}>Questions to revisit</Text><Text style={styles.sectionSub}>Saved ratings show where more practice may help</Text></View></View>
            {troubledQuestions.map((question) => <View key={question.id} style={styles.troubledRow}><Text style={styles.troubledText}>{question.question}</Text><Text style={styles.troubledCount}>Again {question.againCount ?? 0} · Hard {question.hardCount ?? 0}</Text></View>)}
            {missedQuizQuestions.map((question, index) => <View key={`quiz-miss-${index}-${question.question}`} style={styles.troubledRow}><Text style={styles.troubledText}>{question.question}</Text><Text style={styles.troubledCount}>Missed in a saved quiz · correct answer: {question.correctAnswer}</Text></View>)}
            <Pressable style={styles.secondaryButton} onPress={() => router.push({ pathname: '/subject/topic/study/active-recall', params: { id: topicId, name: topicName, subjectId: String(subject?.id ?? fallbackSubjectId) } })}><StudyIcon name="brain" size={17} /><Text style={styles.secondaryButtonText}>Practise with Active Recall</Text></Pressable>
          </View> : null}

          <View style={styles.aiCard}>
            <View style={styles.sectionHeading}><View style={styles.aiIcon}><StudyIcon name="sparkles" size={19} /></View><View style={styles.grow}><Text style={styles.sectionTitle}>MedExam analysis</Text><Text style={styles.sectionSub}>AI reads only the metrics and rated questions saved for this topic.</Text></View></View>
            {aiInsight ? <View style={styles.aiInsight}><Text style={styles.aiOverview}>{aiInsight.overview}</Text><Text style={styles.nextStepLabel}>SUGGESTED NEXT STEP</Text><Text style={styles.aiNextStep}>{aiInsight.nextStep}</Text></View> : null}
            {aiError ? <View style={styles.errorBox}><Text style={styles.errorText}>{aiError}</Text><Pressable onPress={() => { void analyzeTopic(); }}><Text style={styles.retryText}>Try again</Text></Pressable></View> : null}
            {!aiInsight ? <Text style={styles.footnote}>The analysis is based on saved activity, your self-ratings, due cards, exam timing and enabled study methods. It will not invent quiz answers.</Text> : null}
            <Pressable accessibilityRole="button" disabled={aiLoading || !topicStats || !subject} style={({ pressed }) => [styles.aiButton, pressed && styles.pressed, (aiLoading || !topicStats || !subject) && styles.disabled]} onPress={() => { void analyzeTopic(); }}>
              {aiLoading ? <ActivityIndicator color="#FFFFFF" /> : <StudyIcon name="sparkles" size={17} color="#FFFFFF" />}
              <Text style={styles.aiButtonText}>{aiLoading ? 'Analyzing saved progress…' : aiInsight ? 'Refresh analysis' : 'Analyze this topic'}</Text>
            </Pressable>
          </View>

          <View style={styles.historyCard}>
            <View style={styles.sectionHeading}><View style={styles.sectionIcon}><StudyIcon name="clock" size={18} /></View><View><Text style={styles.sectionTitle}>Recent activity</Text><Text style={styles.sectionSub}>Saved study sessions for {topicName}</Text></View></View>
            {activity.length ? activity.slice(0, 7).map((item) => {
              const presentation = activityPresentation(item);
              const date = new Date(item.completedAt);
              const detail = item.activity === 'quiz' ? `${item.correctCount ?? 0}/${item.questionCount} correct` : `${item.questionCount} ${item.activity === 'active_recall' ? 'questions' : 'cards'} · ${Math.round(item.durationSeconds / 60)} min`;
              return <View key={`${item.id}-${item.completedAt}`} style={styles.historyRow}><View style={styles.historyIcon}><StudyIcon name={presentation.icon} size={16} /></View><View style={styles.grow}><Text style={styles.historyTitle}>{presentation.label}</Text><Text style={styles.historyDetail}>{detail}</Text></View><Text style={styles.historyDate}>{date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</Text></View>;
            }) : <View style={styles.emptyHistory}><Text style={styles.sectionSub}>No study activity is saved for this topic yet.</Text></View>}
          </View>

          <Pressable style={styles.primaryButton} onPress={() => router.push({ pathname: '/subject/topic/study', params: { id: topicId, name: topicName, subjectId: String(subject?.id ?? fallbackSubjectId) } })}><StudyIcon name="brain" size={18} color="#FFFFFF" /><Text style={styles.primaryButtonText}>Continue studying</Text></Pressable>
        </>}
      </PullToRefreshScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: appColor('#F7FBFE', 'background'), paddingHorizontal: 20 },
  content: { paddingTop: 7, paddingBottom: 38, gap: 13 },
  backButton: { alignSelf: 'flex-start', paddingVertical: 5 },
  backText: { color: appColor('#3B85A1', 'text'), fontSize: 14, fontWeight: '700' },
  eyebrow: { color: appColor('#8296A2', 'text'), fontSize: 9, fontWeight: '800', letterSpacing: 0.85 },
  title: { color: appColor('#17324D', 'text'), fontSize: 28, fontWeight: '800', marginTop: 2 },
  subtitle: { color: appColor('#748895', 'text'), fontSize: 12, lineHeight: 18, marginTop: -9 },
  grow: { flex: 1 },
  bodyText: { color: appColor('#7A8D99', 'text'), fontSize: 12 },
  loading: { alignItems: 'center', padding: 35, gap: 10 },
  examCard: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, backgroundColor: appColor('#EDF7FA', 'background'), borderRadius: 15, borderWidth: 1, borderColor: appColor('#DDEEF3', 'border') },
  examIcon: { width: 35, height: 35, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: appColor('#FFFFFF', 'background') },
  examTitle: { color: appColor('#294D60', 'text'), fontSize: 12, fontWeight: '800' },
  examText: { color: appColor('#668495', 'text'), fontSize: 10, marginTop: 3 },
  scoreCard: { gap: 10, padding: 15, borderRadius: 18, backgroundColor: appColor('#FFFFFF', 'background'), borderWidth: 1, borderColor: appColor('#E6EDF1', 'border') },
  scoreHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  scoreCaption: { color: appColor('#80919C', 'text'), fontSize: 10, marginTop: 3 },
  scoreValue: { color: appColor('#3281A0', 'text'), fontSize: 25, fontWeight: '800' },
  progressTrack: { height: 8, backgroundColor: appColor('#E5EDF1', 'background'), borderRadius: 10, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: '#45A1C3', borderRadius: 10 },
  footnote: { color: appColor('#8797A0', 'text'), fontSize: 9, lineHeight: 14 },
  metricsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  metricCard: { width: '48%', flexGrow: 1, padding: 11, borderRadius: 15, backgroundColor: appColor('#FFFFFF', 'background'), borderWidth: 1, borderColor: appColor('#E6EDF1', 'border') },
  metricIcon: { width: 29, height: 29, alignItems: 'center', justifyContent: 'center', borderRadius: 9, backgroundColor: appColor('#EEF7FA', 'background'), marginBottom: 5 },
  metricLabel: { color: appColor('#7A8D99', 'text'), fontSize: 9, fontWeight: '800' },
  metricValue: { color: appColor('#17324D', 'text'), fontSize: 19, fontWeight: '800', marginTop: 2 },
  metricDetail: { color: appColor('#83939D', 'text'), fontSize: 9, lineHeight: 13, marginTop: 3 },
  responseCard: { gap: 12, padding: 14, borderRadius: 18, backgroundColor: appColor('#FFFFFF', 'background'), borderWidth: 1, borderColor: appColor('#E6EDF1', 'border') },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  sectionIcon: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', backgroundColor: appColor('#EFF7FA', 'background'), borderRadius: 11 },
  sectionTitle: { color: appColor('#17324D', 'text'), fontSize: 14, fontWeight: '800' },
  sectionSub: { color: appColor('#7B8D99', 'text'), fontSize: 10, lineHeight: 15, marginTop: 3 },
  resultRow: { flexDirection: 'row', gap: 7 },
  resultTile: { flex: 1, minHeight: 58, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: appColor('#F5F9FB', 'background') },
  resultValue: { color: appColor('#17324D', 'text'), fontSize: 18, fontWeight: '800' },
  resultLabel: { color: appColor('#81919B', 'text'), fontSize: 8, fontWeight: '700', marginTop: 3, textAlign: 'center' },
  troubledRow: { gap: 4, paddingVertical: 9, borderTopWidth: 1, borderTopColor: appColor('#EDF1F3', 'border') },
  troubledText: { color: appColor('#29495D', 'text'), fontSize: 11, lineHeight: 17, fontWeight: '600' },
  troubledCount: { color: appColor('#8A7070', 'text'), fontSize: 9 },
  secondaryButton: { flexDirection: 'row', minHeight: 40, alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: 12, borderWidth: 1, borderColor: appColor('#DCE8ED', 'border'), backgroundColor: appColor('#F8FBFC', 'background') },
  secondaryButtonText: { color: appColor('#337E9D', 'text'), fontSize: 11, fontWeight: '800' },
  aiCard: { gap: 11, padding: 14, borderRadius: 18, backgroundColor: appColor('#F0F8FB', 'background'), borderWidth: 1, borderColor: appColor('#DDEEF4', 'border') },
  aiIcon: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 11, backgroundColor: appColor('#FFFFFF', 'background') },
  aiInsight: { gap: 8, padding: 12, borderRadius: 13, backgroundColor: appColor('#FFFFFF', 'background') },
  aiOverview: { color: appColor('#36566A', 'text'), fontSize: 12, lineHeight: 18 },
  nextStepLabel: { color: appColor('#81939E', 'text'), fontSize: 9, fontWeight: '800', letterSpacing: 0.6, marginTop: 3 },
  aiNextStep: { color: appColor('#254C60', 'text'), fontSize: 12, fontWeight: '700', lineHeight: 18 },
  aiButton: { minHeight: 43, borderRadius: 13, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, backgroundColor: '#328FB5' },
  aiButtonText: { color: '#FFFFFF', fontSize: 11, fontWeight: '800' },
  errorBox: { padding: 10, borderRadius: 11, backgroundColor: appColor('#FFF2F0', 'background') },
  errorText: { color: appColor('#9B3C34', 'text'), fontSize: 10, lineHeight: 15 },
  retryText: { color: appColor('#327E9D', 'text'), fontSize: 10, fontWeight: '800', marginTop: 5 },
  historyCard: { gap: 8, padding: 14, borderRadius: 18, backgroundColor: appColor('#FFFFFF', 'background'), borderWidth: 1, borderColor: appColor('#E6EDF1', 'border') },
  historyRow: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 6, borderTopWidth: 1, borderTopColor: appColor('#EDF1F3', 'border') },
  historyIcon: { width: 29, height: 29, alignItems: 'center', justifyContent: 'center', borderRadius: 9, backgroundColor: appColor('#F0F7F9', 'background') },
  historyTitle: { color: appColor('#29495D', 'text'), fontSize: 11, fontWeight: '700' },
  historyDetail: { color: appColor('#83939D', 'text'), fontSize: 9, marginTop: 2 },
  historyDate: { color: appColor('#8A9AA3', 'text'), fontSize: 9 },
  emptyHistory: { padding: 12, borderRadius: 12, backgroundColor: appColor('#F6F9FA', 'background') },
  primaryButton: { flexDirection: 'row', minHeight: 46, alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 13, backgroundColor: '#328FB5' },
  primaryButtonText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  disabled: { opacity: 0.6 },
  pressed: { opacity: 0.82 },
});
