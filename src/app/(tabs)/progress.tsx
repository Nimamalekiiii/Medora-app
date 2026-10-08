import { LocalizedText as Text } from '@/components/localized-text';
import PullToRefreshScrollView from '@/components/pull-to-refresh-scroll-view';
import { appColor } from '@/constants/adaptive-color';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { Stack, router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import type { ColorValue } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAppSettings } from '../../services/app-settings-context';
import { useDayRefresh } from '../../hooks/use-day-refresh';
import { tr } from '../../services/localization';
import {
  getExamsBySubject,
  getFlashcardReviews,
  getQuizResults,
  getStudyActivity,
  getStudyPlansBySubject,
  getStudyPreferences,
  getSubjects,
  getTopicsBySubject,
  type StudyPreferences,
} from '../../services/storage';
import { buildProgressDashboard, formatLocalDate, type ActivityDay, type DashboardTopic, type ProgressDashboard } from '../../services/progress-dashboard';
import { getAIProgressInsight, type AIProgressInput, type AIProgressInsight } from '../../services/ai-api';
import { subscribeToLocalDataChanges } from '../../services/cloud-sync-state';
import type { ExamsBySubject, StudyPlansBySubject, Subject, TopicsBySubject } from '../../types/study';

type IconName = 'chart' | 'calendar' | 'streak' | 'books' | 'focus' | 'recall' | 'quiz' | 'cards' | 'review' | 'sparkles' | 'arrow' | 'clock' | 'check' | 'target';
const ICONS: Record<IconName, NonNullable<SymbolViewProps['name']>> = {
  chart: { ios: 'chart.bar.fill', android: 'bar_chart', web: 'bar_chart' },
  calendar: { ios: 'calendar', android: 'calendar_month', web: 'calendar_month' },
  streak: { ios: 'flame', android: 'local_fire_department', web: 'local_fire_department' },
  books: { ios: 'books.vertical', android: 'menu_book', web: 'menu_book' },
  focus: { ios: 'timer', android: 'timer', web: 'timer' },
  recall: { ios: 'brain.head.profile', android: 'psychology', web: 'psychology' },
  quiz: { ios: 'checkmark.circle', android: 'quiz', web: 'quiz' },
  cards: { ios: 'rectangle.on.rectangle', android: 'style', web: 'style' },
  review: { ios: 'arrow.clockwise', android: 'autorenew', web: 'autorenew' },
  sparkles: { ios: 'sparkles', android: 'auto_awesome', web: 'auto_awesome' },
  arrow: { ios: 'arrow.up.right', android: 'arrow_forward', web: 'arrow_forward' },
  clock: { ios: 'clock', android: 'schedule', web: 'schedule' },
  check: { ios: 'checkmark', android: 'check', web: 'check' },
  target: { ios: 'scope', android: 'track_changes', web: 'track_changes' },
};

function Icon({ name, size = 20, color = appColor('#327E9D', 'text') }: { name: IconName; size?: number; color?: ColorValue }) {
  return <SymbolView name={ICONS[name]} size={size} tintColor={color} weight="medium" />;
}

function SectionTitle({ title, detail }: { title: string; detail?: string }) {
  return <View style={styles.sectionHeading}>
    <Text style={styles.sectionTitle}>{title}</Text>
    {detail ? <Text style={styles.sectionDetail}>{detail}</Text> : null}
  </View>;
}

function StatTile({ icon, label, value, note }: { icon: IconName; label: string; value: string | number; note?: string }) {
  return <View style={styles.statTile}>
    <View style={styles.statIcon}><Icon name={icon} size={18} /></View>
    <Text style={styles.statLabel}>{label}</Text>
    <Text style={styles.statValue}>{value}</Text>
    {note ? <Text style={styles.statNote}>{note}</Text> : null}
  </View>;
}

function ProgressBar({ value, muted = false }: { value: number; muted?: boolean }) {
  const percentage = Math.min(100, Math.max(0, value));
  return <View style={styles.progressTrack}>
    <View style={[styles.progressBar, muted && styles.progressBarMuted, { width: `${percentage}%` }]} />
  </View>;
}

function MetricRow({ title, value, detail, progress }: { title: string; value: string; detail?: string; progress?: number | null }) {
  return <View style={styles.metricRow}>
    <View style={styles.metricTop}>
      <Text style={styles.metricTitle}>{title}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
    {detail ? <Text style={styles.metricDetail}>{detail}</Text> : null}
    {typeof progress === 'number' ? <ProgressBar value={progress} muted={progress === 0} /> : null}
  </View>;
}

function TopicCard({ topic, onPress, language }: { topic: DashboardTopic; onPress: () => void; language: 'en' | 'no' }) {
  return <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.topicCard, pressed && styles.pressed]}>
    <View style={styles.topicCardTop}>
      <View style={styles.topicIcon}><Icon name="books" size={18} /></View>
      <View style={styles.topicHeading}>
        <Text style={styles.topicName}>{topic.name}</Text>
        <Text style={styles.topicSubject}>{topic.subjectName}</Text>
      </View>
      <Text style={styles.topicPercentage}>{topic.practiceProgress}%</Text>
    </View>
    <ProgressBar value={topic.practiceProgress} />
    <View style={styles.topicFooter}>
      <Text style={styles.topicMeta}>{topic.started ? `${topic.methodCoverage}% ${language === 'no' ? 'øvingsdekning' : 'practice coverage'}` : tr('Not started', language)}</Text>
      <Text style={styles.topicMeta}>{topic.quizAccuracy === null ? tr('No quiz yet', language) : `${topic.quizAccuracy}% ${language === 'no' ? 'quiz-treffprosent' : 'quiz accuracy'}`}</Text>
    </View>
  </Pressable>;
}

function ActivityChart({ days, range, accuracy }: { days: ActivityDay[]; range: 7 | 30; accuracy: number | null }) {
  return <View style={styles.card}>
    <View style={styles.chartSummary}>
      <View>
        <Text style={styles.chartLabel}>Quiz accuracy</Text>
        <Text style={styles.chartValue}>{accuracy === null ? '—' : `${accuracy}%`}</Text>
      </View>
      <Text style={styles.chartHint}>{range === 7 ? 'Last 7 days' : 'Last 30 days'}</Text>
    </View>
    {accuracy === null ? <View style={styles.chartEmpty}>
      <Icon name="chart" size={22} color={appColor('#90A8B4', 'text')} />
      <Text style={styles.emptyText}>Complete a quiz to start your accuracy trend.</Text>
    </View> : <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chartScroll}>
      {days.map((day) => <View key={day.dateKey} style={styles.chartColumn}>
        <View style={styles.chartBarTrack}>
          {day.quizAccuracy !== null ? <View style={[styles.chartBar, { height: `${day.quizAccuracy}%` }]} /> : <View style={styles.chartNoData} />}
        </View>
        <Text style={styles.chartDate}>{range === 7 ? day.label.split(' ')[0] : day.dateKey.slice(-2)}</Text>
      </View>)}
    </ScrollView>}
    <Text style={styles.chartFootnote}>Only recorded quiz answers are shown. Days without a quiz have no score.</Text>
  </View>;
}

function buildAIInput(dashboard: ProgressDashboard, subjects: Subject[], topicsBySubject: TopicsBySubject, examsBySubject: ExamsBySubject, preferences: StudyPreferences, plans: StudyPlansBySubject, language: 'en' | 'no'): AIProgressInput {
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

function localizeAttentionReason(reason: string, language: 'en' | 'no') {
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

export default function GlobalProgressScreen() {
  const { preferences: appPreferences } = useAppSettings();
  const todayKey = useDayRefresh();
  const [dashboard, setDashboard] = useState<ProgressDashboard | null>(null);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [topicsBySubject, setTopicsBySubject] = useState<TopicsBySubject>({});
  const [examsBySubject, setExamsBySubject] = useState<ExamsBySubject>({});
  const [studyPreferences, setStudyPreferences] = useState<StudyPreferences | null>(null);
  const [studyPlans, setStudyPlans] = useState<StudyPlansBySubject>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [aiInsight, setAiInsight] = useState<AIProgressInsight | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [chartRange, setChartRange] = useState<7 | 30>(7);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const hasLoaded = useRef(false);
  const loadSequence = useRef(0);
  const dataRevision = useRef(0);
  const lastLoadedDay = useRef(todayKey);

  const loadData = useCallback(async (invalidateAI = false) => {
    const sequence = ++loadSequence.current;
    if (!hasLoaded.current) setLoading(true);
    if (invalidateAI) {
      dataRevision.current += 1;
      setAiInsight(null);
      setAiError(null);
    }
    try {
      const [savedSubjects, savedTopics, savedExams, savedActivities, savedQuizResults, savedReviews, savedPreferences, savedPlans] = await Promise.all([
        getSubjects(), getTopicsBySubject(), getExamsBySubject(), getStudyActivity(), getQuizResults(), getFlashcardReviews(), getStudyPreferences(), getStudyPlansBySubject(),
      ]);
      if (sequence !== loadSequence.current) return;
      const nextDashboard = buildProgressDashboard({
        subjects: savedSubjects,
        topicsBySubject: savedTopics,
        examsBySubject: savedExams,
        activities: savedActivities,
        quizResults: savedQuizResults,
        flashcardReviews: savedReviews,
      }, new Date(), appPreferences.language);
      setSubjects(savedSubjects);
      setTopicsBySubject(savedTopics);
      setExamsBySubject(savedExams);
      setStudyPreferences(savedPreferences);
      setStudyPlans(savedPlans);
      setDashboard(nextDashboard);
      setLastUpdated(new Date());
      setLoadError(null);
      hasLoaded.current = true;
    } catch (error) {
      if (sequence !== loadSequence.current) return;
      console.warn('Could not refresh progress dashboard:', error);
      setLoadError(error instanceof Error ? error.message : 'Progress could not be refreshed. Pull down to try again.');
    } finally {
      if (sequence === loadSequence.current) setLoading(false);
    }
  }, [appPreferences.language]);

  useEffect(() => {
    if (lastLoadedDay.current === todayKey) return;
    lastLoadedDay.current = todayKey;
    void loadData(true);
  }, [loadData, todayKey]);

  useFocusEffect(useCallback(() => {
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    void loadData(hasLoaded.current);
    const unsubscribe = subscribeToLocalDataChanges(() => {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => { void loadData(true); }, 120);
    });
    const appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void loadData(true);
    });
    return () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      unsubscribe();
      appStateSubscription.remove();
      loadSequence.current += 1;
    };
  }, [loadData]));

  const activeChartDays = chartRange === 7 ? dashboard?.chart7Days ?? [] : dashboard?.chart30Days ?? [];
  const activeChartAccuracy = chartRange === 7 ? dashboard?.last7Days.quizAccuracy ?? null : dashboard?.last30Days.quizAccuracy ?? null;
  const attentionTopics = useMemo(() => {
    if (!dashboard) return [];
    return dashboard.analysis.recommendations.filter((item) => item.priority !== 'low').slice(0, 4);
  }, [dashboard]);
  const activeDayKeys = useMemo(() => new Set((dashboard?.chart7Days ?? []).filter((day) => day.sessions > 0 || day.quizQuestions > 0).map((day) => day.dateKey)), [dashboard]);
  const plannedDaysCompleted = useMemo(() => {
    if (!dashboard || !studyPreferences) return 0;
    return dashboard.chart7Days.reduce((count, day) => {
      const weekday = new Date(`${day.dateKey}T12:00:00`).getDay();
      return count + (studyPreferences.studyDays.includes(weekday) && activeDayKeys.has(day.dateKey) ? 1 : 0);
    }, 0);
  }, [activeDayKeys, dashboard, studyPreferences]);

  function openTopic(topicId: string | number, subjectId: string) {
    const topic = dashboard?.topics.find((item) => String(item.id) === String(topicId) && item.subjectId === subjectId);
    if (!topic) return;
    router.push({ pathname: '/subject/topic/[id]', params: { id: String(topic.id), name: topic.name, subjectId } });
  }

  async function reviewProgress() {
    if (!dashboard || !studyPreferences) return;
    const revisionAtStart = dataRevision.current;
    setAiLoading(true);
    setAiError(null);
    try {
      const input = buildAIInput(dashboard, subjects, topicsBySubject, examsBySubject, studyPreferences, studyPlans, appPreferences.language);
      const insight = await getAIProgressInsight(input);
      if (revisionAtStart === dataRevision.current) setAiInsight(insight);
    } catch (error) {
      if (revisionAtStart === dataRevision.current) setAiError(error instanceof Error ? error.message : 'Could not review progress with AI. Please try again.');
    } finally {
      setAiLoading(false);
    }
  }

  const aiTopic = aiInsight?.recommendedTopicId ? dashboard?.topics.find((topic) => String(topic.id) === aiInsight.recommendedTopicId) : undefined;
  const deterministicNextTopic = dashboard ? dashboard.analysis.recommendations[0] : undefined;
  const targetTopic = aiTopic ?? (deterministicNextTopic ? dashboard?.topics.find((topic) => String(topic.id) === String(deterministicNextTopic.topicId) && topic.subjectId === String(deterministicNextTopic.subjectId)) : undefined);

  if (loading && !dashboard) {
    return <SafeAreaView style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={appColor('#327E9D', 'text')} />
        <Text style={styles.loadingText}>Preparing your progress dashboard...</Text>
      </View>
    </SafeAreaView>;
  }

  if (!dashboard) {
    return <SafeAreaView style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.errorState}>
        <Icon name="chart" size={32} />
        <Text style={styles.sectionTitle}>Progress could not be loaded</Text>
        <Text style={styles.bodyText}>{loadError ?? 'Pull down to try again.'}</Text>
        <Pressable accessibilityRole="button" style={styles.primaryButton} onPress={() => { void loadData(); }}><Text style={styles.primaryButtonText}>Try again</Text></Pressable>
      </View>
    </SafeAreaView>;
  }

  const upcomingExams = dashboard.exams;
  const startedPercent = dashboard.analysis.totalTopics ? Math.round(dashboard.analysis.topicsCovered / dashboard.analysis.totalTopics * 100) : 0;
  const topTopics = [...dashboard.topics].sort((a, b) => a.practiceProgress - b.practiceProgress).slice(0, 8);
  const weekDays = dashboard.chart7Days;
  const locale = appPreferences.language === 'no' ? 'nb-NO' : 'en-GB';
  const updatedTime = lastUpdated?.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });

  return <SafeAreaView style={styles.container}>
    <Stack.Screen options={{ headerShown: false }} />
    <PullToRefreshScrollView onRefresh={() => loadData(true)} showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
      <View style={styles.pageHeader}>
        <View style={styles.headerIcon}><Icon name="chart" size={22} /></View>
        <View style={styles.headerCopy}>
          <Text style={styles.eyebrow}>PROGRESS</Text>
          <Text style={styles.pageTitle}>Your study dashboard</Text>
          <Text style={styles.headerSubtitle}>A clear view of your activity, progress and next steps.</Text>
        </View>
      </View>
      <View style={styles.liveStatus}>
        <View style={styles.liveDot} />
        <Text style={styles.liveText}>{tr('Updates automatically as you use MedExam', appPreferences.language)}{updatedTime ? ` · ${updatedTime}` : ''}</Text>
      </View>
      {!!loadError && <View style={styles.inlineWarning}><Text style={styles.warningText}>Showing saved progress. The latest refresh failed.</Text></View>}

      <View style={styles.preparationCard}>
        <View style={styles.preparationTop}>
          <View style={styles.preparationCopy}>
            <Text style={styles.eyebrow}>PREPARATION INDICATOR</Text>
            <Text style={styles.preparationScore}>{dashboard.analysis.overallScore}%</Text>
          </View>
          <View style={styles.preparationIcon}><Icon name="target" size={28} /></View>
        </View>
        <ProgressBar value={dashboard.analysis.overallScore} />
        <Text style={styles.preparationDescription}>
          {dashboard.analysis.totalTopics === 0 ? 'Add subjects and topics to start building a study record.' : dashboard.analysis.overallScore === 0 ? 'Start with one short session to begin recording your preparation.' : 'This indicator summarizes recorded topic coverage and practice. It is not a prediction of an exam result.'}
        </Text>
        <View style={styles.preparationFacts}>
          <View style={styles.preparationFact}>
            <Text style={styles.factValue}>{dashboard.analysis.topicsCovered} / {dashboard.analysis.totalTopics}</Text>
            <Text style={styles.factLabel}>Topics started</Text>
          </View>
          <View style={styles.factDivider} />
          <View style={styles.preparationFact}>
            <Text style={styles.factValue}>{dashboard.analysis.totalTopics - dashboard.analysis.topicsCovered}</Text>
            <Text style={styles.factLabel}>Not started</Text>
          </View>
          <View style={styles.factDivider} />
          <View style={styles.preparationFact}>
            <Text style={styles.factValue}>{dashboard.analysis.quizAccuracy === null ? '—' : `${dashboard.analysis.quizAccuracy}%`}</Text>
            <Text style={styles.factLabel}>Quiz accuracy</Text>
          </View>
        </View>
      </View>

      <View style={styles.aiCheckinCard}>
        <View style={styles.aiHeader}>
          <View style={styles.aiIcon}><Icon name="sparkles" size={19} color={appColor('#FFFFFF', 'text')} /></View>
          <View style={styles.aiHeaderCopy}>
            <Text style={styles.aiTitle}>AI progress check-in</Text>
            <Text style={styles.aiSubheading}>One next step from your saved study data</Text>
          </View>
        </View>
        <Text style={styles.aiCopy}>MedExam calculates your numbers first. AI then reviews topics, exams, quiz results, recall, flashcard reviews, focus time, plans and study preferences.</Text>
        <Pressable accessibilityRole="button" disabled={aiLoading} style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed, aiLoading && styles.disabled]} onPress={() => { void reviewProgress(); }}>
          {aiLoading ? <ActivityIndicator color={appColor('#FFFFFF', 'text')} /> : <Text style={styles.primaryButtonText}>{aiInsight ? 'Refresh progress review' : 'Review my progress'}</Text>}
        </Pressable>
        {!!aiError && <Text style={styles.aiError}>{aiError}</Text>}
      </View>

      <SectionTitle title="Preparation breakdown" detail="Calculated from saved activity across your topics." />
      <View style={styles.card}>
        <MetricRow title="Topics started" value={`${dashboard.analysis.topicsCovered} / ${dashboard.analysis.totalTopics}`} progress={startedPercent} />
        <MetricRow title="Quiz accuracy" value={dashboard.analysis.quizAccuracy === null ? '—' : `${dashboard.analysis.quizAccuracy}%`} detail={dashboard.analysis.quizAccuracy === null ? 'Complete a quiz to build this metric.' : 'Weighted by recorded quiz answers.'} progress={dashboard.analysis.quizAccuracy} />
        <MetricRow title="Active Recall coverage" value={`${dashboard.analysis.activeRecallCoverage}%`} detail="Topics with a saved Active Recall session." progress={dashboard.analysis.activeRecallCoverage} />
        <MetricRow title="Review coverage" value={`${dashboard.analysis.reviewCoverage}%`} detail="Topics with a saved review session or card review." progress={dashboard.analysis.reviewCoverage} />
        <MetricRow title="Flashcard coverage" value={`${dashboard.analysis.flashcardCoverage}%`} detail="Topics with recorded flashcard practice." progress={dashboard.analysis.flashcardCoverage} />
      </View>

      {upcomingExams.length ? <>
        <SectionTitle title={appPreferences.language === 'no' ? 'Kommende eksamener' : 'Upcoming exams'} detail={appPreferences.language === 'no' ? 'Alle lagrede eksamener, sortert etter dato.' : 'All saved upcoming exams, sorted by date.'} />
        {upcomingExams.map((exam) => <View key={`${exam.subjectId}-${exam.exam.date}`} style={styles.examCard}>
          <View style={styles.examIcon}><Icon name="calendar" size={24} /></View>
          <View style={styles.examCopy}>
            <Text style={styles.examSubject}>{exam.subjectName}</Text>
            <Text style={styles.examDate}>{formatLocalDate(exam.exam.date, appPreferences.language)}</Text>
            <Text style={styles.examType}>{exam.exam.type}</Text>
            {exam.includedTopics > 0 ? <Text style={styles.examCovered}>{appPreferences.language === 'no' ? `${exam.coveredTopics} av ${exam.includedTopics} eksamenstemaer startet` : `${exam.coveredTopics} of ${exam.includedTopics} exam topics started`}</Text> : null}
          </View>
          <View style={styles.examCountdown}>
            <Text style={styles.examDays}>{exam.daysUntil}</Text>
            <Text style={styles.examDaysLabel}>{exam.daysUntil === 0 ? (appPreferences.language === 'no' ? 'i dag' : 'today') : appPreferences.language === 'no' ? (exam.daysUntil === 1 ? 'dag igjen' : 'dager igjen') : exam.daysUntil === 1 ? 'day left' : 'days left'}</Text>
          </View>
        </View>)}
      </> : <>
        <SectionTitle title={appPreferences.language === 'no' ? 'Kommende eksamener' : 'Upcoming exams'} />
        <Pressable accessibilityRole="button" onPress={() => router.push('/(tabs)/subjects')} style={styles.emptyCard}>
          <View style={styles.emptyIcon}><Icon name="calendar" size={22} /></View>
          <View style={styles.emptyCopy}><Text style={styles.emptyTitle}>{appPreferences.language === 'no' ? 'Ingen kommende eksamener lagret' : 'No upcoming exams saved'}</Text><Text style={styles.emptyText}>{appPreferences.language === 'no' ? 'Legg til en eksamensdato i et emne for å se nedtelling og eksamenstemaer her.' : 'Add an exam date in a subject to see your countdown and included topics here.'}</Text></View>
          <Icon name="arrow" size={17} />
        </Pressable>
      </>}

      <SectionTitle title="Study consistency" detail="Study days recorded on this device and account." />
      <View style={styles.consistencyCard}>
        <View style={styles.streakHeadline}>
          <View style={styles.streakIcon}><Icon name="streak" size={21} /></View>
          <View style={styles.streakCopy}>
            <Text style={styles.streakValue}>{dashboard.currentStreak} {appPreferences.language === 'no' ? (dashboard.currentStreak === 1 ? 'dag' : 'dager') : (dashboard.currentStreak === 1 ? 'day' : 'days')}</Text>
            <Text style={styles.streakLabel}>Current study streak</Text>
          </View>
          <View style={styles.streakTotal}>
            <Text style={styles.streakTotalValue}>{dashboard.allTimeStudyDays}</Text>
            <Text style={styles.streakTotalLabel}>Recorded days</Text>
          </View>
        </View>
        <View style={styles.weekRow}>
          {weekDays.map((day) => {
            const studied = activeDayKeys.has(day.dateKey);
            const weekDay = new Date(`${day.dateKey}T12:00:00`).toLocaleDateString(locale, { weekday: 'short' });
            return <View key={day.dateKey} style={styles.weekDay}>
              <View style={[styles.weekDayMark, studied && styles.weekDayMarkActive]}>{studied ? <Icon name="check" size={13} color={appColor('#FFFFFF', 'text')} /> : null}</View>
              <Text style={styles.weekDayLabel}>{weekDay}</Text>
            </View>;
          })}
        </View>
        {studyPreferences ? <Text style={styles.consistencyNote}>{appPreferences.language === 'no' ? `${dashboard.last7Days.studyDays} studiedager de siste 7 · ${plannedDaysCompleted} av ${studyPreferences.studyDays.length} valgte dager registrert` : `${dashboard.last7Days.studyDays} study days in the last 7 · ${plannedDaysCompleted} of ${studyPreferences.studyDays.length} selected days recorded`}</Text> : null}
      </View>

      <SectionTitle title="Areas needing attention" detail="Based on activity, quiz results and time since your last session." />
      {attentionTopics.length ? attentionTopics.map((recommendation) => {
        const subject = subjects.find((item) => String(item.id) === String(recommendation.subjectId));
        return <Pressable key={`${recommendation.subjectId}-${recommendation.topicId}`} accessibilityRole="button" onPress={() => openTopic(recommendation.topicId, String(recommendation.subjectId))} style={({ pressed }) => [styles.attentionCard, pressed && styles.pressed]}>
          <View style={styles.attentionIcon}><Icon name={subject?.name.toLowerCase().includes('neuro') ? 'recall' : 'books'} size={19} /></View>
          <View style={styles.attentionCopy}>
            <Text style={styles.attentionTopic}>{recommendation.topicName}</Text>
            <Text style={styles.attentionSubject}>{recommendation.subjectName}</Text>
            <Text style={styles.attentionReason}>{localizeAttentionReason(recommendation.reason, appPreferences.language)}</Text>
          </View>
          <Icon name="arrow" size={17} />
        </Pressable>;
      }) : <View style={styles.emptyCard}>
        <View style={styles.emptyIcon}><Icon name="check" size={20} /></View>
        <View style={styles.emptyCopy}><Text style={styles.emptyTitle}>No priority topics right now</Text><Text style={styles.emptyText}>New study activity will update this list automatically.</Text></View>
      </View>}

      <SectionTitle title="Learning activity" detail="What you have actually done in the last 7 days." />
      <View style={styles.statsGrid}>
        <StatTile icon="focus" label="Study sessions" value={dashboard.last7Days.sessions} note="Saved sessions" />
        <StatTile icon="recall" label="Active Recall" value={dashboard.last7Days.activeRecallQuestions} note="Questions practiced" />
        <StatTile icon="quiz" label="Quiz" value={dashboard.last7Days.quizQuestions} note={dashboard.last7Days.quizAccuracy === null ? 'Questions answered' : `${dashboard.last7Days.quizAccuracy}% ${appPreferences.language === 'no' ? 'treffprosent' : 'accuracy'}`} />
        <StatTile icon="cards" label="Flashcards" value={dashboard.last7Days.flashcardsReviewed} note="Cards reviewed" />
        <StatTile icon="review" label="Reviews" value={dashboard.last7Days.reviewSessions} note="Review sessions" />
        <StatTile icon="clock" label="Focus time" value={appPreferences.language === 'no' ? `${dashboard.last7Days.focusMinutes} min` : `${dashboard.last7Days.focusMinutes} min`} note="Timer sessions" />
      </View>

      <SectionTitle title="Topic progress" detail="Practice coverage is based on recorded study methods and quiz answers. It does not mean mastery." />
      {topTopics.length ? <>
        {topTopics.map((topic) => <TopicCard key={`${topic.subjectId}-${topic.id}`} topic={topic} language={appPreferences.language} onPress={() => openTopic(topic.id, topic.subjectId)} />)}
        {dashboard.topics.length > topTopics.length ? <Pressable accessibilityRole="button" style={styles.secondaryButton} onPress={() => router.push('/(tabs)/subjects')}>
          <Text style={styles.secondaryButtonText}>View all subjects and topics</Text><Icon name="arrow" size={16} />
        </Pressable> : null}
      </> : <Pressable accessibilityRole="button" style={styles.emptyCard} onPress={() => router.push('/(tabs)/subjects')}>
        <View style={styles.emptyIcon}><Icon name="books" size={21} /></View>
        <View style={styles.emptyCopy}><Text style={styles.emptyTitle}>No topics added yet</Text><Text style={styles.emptyText}>Add subjects and topics to start tracking progress.</Text></View>
        <Icon name="arrow" size={17} />
      </Pressable>}

      <View style={styles.chartHeading}>
        <View style={styles.chartHeadingCopy}>
          <SectionTitle title="Progress over time" detail="Quiz accuracy by day, based on completed quizzes." />
        </View>
        <View style={styles.rangeSwitch}>
          {[7, 30].map((range) => <Pressable key={range} accessibilityRole="button" accessibilityState={{ selected: chartRange === range }} onPress={() => setChartRange(range as 7 | 30)} style={[styles.rangeOption, chartRange === range && styles.rangeOptionActive]}>
            <Text style={[styles.rangeText, chartRange === range && styles.rangeTextActive]}>{range}d</Text>
          </Pressable>)}
        </View>
      </View>
      <ActivityChart days={activeChartDays} range={chartRange} accuracy={activeChartAccuracy} />

      <View style={styles.analysisCard}>
        <View style={styles.analysisHeading}>
          <View style={styles.analysisIcon}><Icon name="sparkles" size={20} /></View>
          <View style={styles.analysisHeadingCopy}>
            <Text style={styles.analysisTitle}>MedExam analysis</Text>
            <Text style={styles.analysisSubheading}>{aiInsight ? 'Based on your latest saved activity' : 'A factual summary from your saved progress'}</Text>
          </View>
        </View>
        {aiInsight ? <>
          <Text style={styles.analysisText}>{aiInsight.overview}</Text>
          <Text style={styles.nextStepLabel}>Recommended next step</Text>
          <Text style={styles.analysisText}>{aiInsight.nextStep}</Text>
          <Pressable accessibilityRole="button" onPress={() => targetTopic ? openTopic(targetTopic.id, targetTopic.subjectId) : router.push('/(tabs)/subjects')} style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}>
            <Text style={styles.primaryButtonText}>{targetTopic ? appPreferences.language === 'no' ? `Start å lese · ${targetTopic.name}` : `Start studying · ${targetTopic.name}` : 'Open subjects'}</Text>
            <Icon name="arrow" size={16} color={appColor('#FFFFFF', 'text')} />
          </Pressable>
        </> : <>
          <Text style={styles.analysisText}>
            {appPreferences.language === 'no'
              ? dashboard.analysis.totalTopics === 0 ? 'Legg til emner og temaer for å starte fremgangsoversikten.' : dashboard.analysis.topicsCovered < dashboard.analysis.totalTopics ? `${dashboard.analysis.topicsCovered} av ${dashboard.analysis.totalTopics} temaer har registrert studieaktivitet. ${dashboard.analysis.totalTopics - dashboard.analysis.topicsCovered} er ikke startet ennå.` : dashboard.analysis.quizAccuracy === null ? 'Alle temaer har registrert aktivitet. Ta en quiz for å få et mål på øvingsresultatene.' : `Registrert quiz-treffprosent er ${dashboard.analysis.quizAccuracy}%. Nylig studieaktivitet og repetisjon vises ovenfor.`
              : dashboard.analysis.totalTopics === 0 ? 'Add subjects and topics to start your progress record.' : dashboard.analysis.topicsCovered < dashboard.analysis.totalTopics ? `${dashboard.analysis.topicsCovered} of ${dashboard.analysis.totalTopics} topics have recorded study activity. ${dashboard.analysis.totalTopics - dashboard.analysis.topicsCovered} have not been started yet.` : dashboard.analysis.quizAccuracy === null ? 'All topics have recorded activity. Take a quiz to add a measure of practice accuracy.' : `Your saved quiz accuracy is ${dashboard.analysis.quizAccuracy}%. Recent study activity and review habits appear above.`}
          </Text>
          <Pressable accessibilityRole="button" disabled={aiLoading} onPress={() => { void reviewProgress(); }} style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}>
            {aiLoading ? <ActivityIndicator color={appColor('#327E9D', 'text')} /> : <><Text style={styles.secondaryButtonText}>Get a personalized next step</Text><Icon name="arrow" size={16} /></>}
          </Pressable>
        </>}
        <Text style={styles.disclaimer}>AI interprets recorded activity; it does not certify mastery or predict exam results.</Text>
      </View>
      <View style={styles.bottomSpace} />
    </PullToRefreshScrollView>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: appColor('#F5FAFC', 'background') },
  content: { paddingHorizontal: 18, paddingTop: 12, paddingBottom: 38 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 28 },
  loadingText: { marginTop: 14, color: appColor('#718493', 'text'), fontSize: 14 },
  errorState: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12, padding: 28 },
  pageHeader: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 4, marginBottom: 12 },
  headerIcon: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: appColor('#E5F3F8', 'background') },
  headerCopy: { flex: 1 },
  eyebrow: { color: appColor('#448EA8', 'text'), fontSize: 10, fontWeight: '800', letterSpacing: 1.5 },
  pageTitle: { color: appColor('#17324D', 'text'), fontSize: 25, fontWeight: '800', marginTop: 3 },
  headerSubtitle: { color: appColor('#718493', 'text'), fontSize: 12, lineHeight: 17, marginTop: 3 },
  liveStatus: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 16, paddingLeft: 3 },
  liveDot: { width: 7, height: 7, borderRadius: 5, backgroundColor: appColor('#3C9B7A', 'background') },
  liveText: { color: appColor('#718493', 'text'), fontSize: 11 },
  inlineWarning: { borderRadius: 12, backgroundColor: appColor('#FFF4E2', 'background'), padding: 11, marginBottom: 12 },
  warningText: { color: appColor('#8A5A12', 'text'), fontSize: 12, lineHeight: 18 },
  preparationCard: { borderRadius: 23, backgroundColor: appColor('#FFFFFF', 'background'), borderWidth: 1, borderColor: appColor('#DCECF3', 'border'), padding: 19, marginBottom: 22 },
  preparationTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  preparationCopy: { flex: 1 },
  preparationScore: { color: appColor('#327E9D', 'text'), fontSize: 48, lineHeight: 55, fontWeight: '800', marginTop: 4 },
  preparationIcon: { width: 52, height: 52, borderRadius: 17, backgroundColor: appColor('#E9F5F9', 'background'), justifyContent: 'center', alignItems: 'center' },
  progressTrack: { height: 8, borderRadius: 999, overflow: 'hidden', backgroundColor: appColor('#E8F0F3', 'background'), marginTop: 7 },
  progressBar: { height: '100%', borderRadius: 999, backgroundColor: appColor('#54A9C4', 'background') },
  progressBarMuted: { backgroundColor: appColor('#B7CCD5', 'background') },
  preparationDescription: { color: appColor('#617887', 'text'), fontSize: 12, lineHeight: 18, marginTop: 11 },
  preparationFacts: { flexDirection: 'row', alignItems: 'center', marginTop: 16, paddingTop: 13, borderTopWidth: 1, borderTopColor: appColor('#EDF3F6', 'border') },
  preparationFact: { flex: 1, alignItems: 'center', paddingHorizontal: 3 },
  factValue: { color: appColor('#17324D', 'text'), fontSize: 16, fontWeight: '800' },
  factLabel: { color: appColor('#718493', 'text'), fontSize: 10, textAlign: 'center', marginTop: 3 },
  factDivider: { height: 28, width: 1, backgroundColor: appColor('#E1EBEF', 'background') },
  aiCheckinCard: { backgroundColor: appColor('#EAF6FA', 'background'), borderRadius: 21, padding: 17, marginBottom: 22, borderWidth: 1, borderColor: appColor('#D9EDF3', 'border') },
  aiHeader: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  aiIcon: { width: 38, height: 38, borderRadius: 13, backgroundColor: appColor('#327E9D', 'background'), justifyContent: 'center', alignItems: 'center' },
  aiHeaderCopy: { flex: 1 },
  aiTitle: { color: appColor('#17324D', 'text'), fontSize: 16, fontWeight: '800' },
  aiSubheading: { color: appColor('#5F7886', 'text'), fontSize: 11, marginTop: 3 },
  aiCopy: { color: appColor('#526C7B', 'text'), fontSize: 12, lineHeight: 18, marginTop: 11 },
  primaryButton: { minHeight: 45, backgroundColor: appColor('#327E9D', 'background'), paddingHorizontal: 15, borderRadius: 13, marginTop: 13, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 },
  primaryButtonText: { color: appColor('#FFFFFF', 'text'), fontSize: 13, fontWeight: '800' },
  disabled: { opacity: 0.55 },
  aiError: { color: appColor('#A23D3D', 'text'), fontSize: 12, lineHeight: 18, marginTop: 10 },
  sectionHeading: { marginTop: 3, marginBottom: 10 },
  sectionTitle: { color: appColor('#17324D', 'text'), fontSize: 19, lineHeight: 24, fontWeight: '800' },
  sectionDetail: { color: appColor('#718493', 'text'), fontSize: 11, lineHeight: 16, marginTop: 3 },
  card: { backgroundColor: appColor('#FFFFFF', 'background'), borderRadius: 19, borderWidth: 1, borderColor: appColor('#E5EFF4', 'border'), padding: 15, marginBottom: 21 },
  metricRow: { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: appColor('#EDF3F6', 'border') },
  metricTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  metricTitle: { color: appColor('#526C7B', 'text'), fontSize: 12, fontWeight: '700' },
  metricValue: { color: appColor('#17324D', 'text'), fontSize: 13, fontWeight: '800' },
  metricDetail: { color: appColor('#81939E', 'text'), fontSize: 10, marginTop: 3 },
  examCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: appColor('#E5F4FA', 'background'), borderRadius: 19, padding: 14, marginBottom: 21 },
  examIcon: { width: 47, height: 47, borderRadius: 15, backgroundColor: appColor('#FFFFFF', 'background'), justifyContent: 'center', alignItems: 'center' },
  examCopy: { flex: 1 },
  examSubject: { color: appColor('#17324D', 'text'), fontSize: 15, fontWeight: '800' },
  examDate: { color: appColor('#54788D', 'text'), fontSize: 12, marginTop: 3 },
  examType: { color: appColor('#718493', 'text'), fontSize: 11, marginTop: 2 },
  examCovered: { color: appColor('#327E9D', 'text'), fontSize: 10, fontWeight: '700', marginTop: 5 },
  examCountdown: { minWidth: 62, height: 62, borderRadius: 17, backgroundColor: appColor('#FFFFFF', 'background'), alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  examDays: { color: appColor('#327E9D', 'text'), fontSize: 23, fontWeight: '800' },
  examDaysLabel: { color: appColor('#718493', 'text'), fontSize: 9 },
  consistencyCard: { backgroundColor: appColor('#FFFFFF', 'background'), borderRadius: 19, borderWidth: 1, borderColor: appColor('#E5EFF4', 'border'), padding: 15, marginBottom: 21 },
  streakHeadline: { flexDirection: 'row', alignItems: 'center' },
  streakIcon: { width: 41, height: 41, borderRadius: 14, backgroundColor: appColor('#FFF3E7', 'background'), alignItems: 'center', justifyContent: 'center' },
  streakCopy: { flex: 1, marginLeft: 10 },
  streakValue: { color: appColor('#17324D', 'text'), fontSize: 19, fontWeight: '800' },
  streakLabel: { color: appColor('#718493', 'text'), fontSize: 10, marginTop: 2 },
  streakTotal: { alignItems: 'flex-end' },
  streakTotalValue: { color: appColor('#17324D', 'text'), fontSize: 17, fontWeight: '800' },
  streakTotalLabel: { color: appColor('#718493', 'text'), fontSize: 9, marginTop: 2 },
  weekRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 15, paddingTop: 13, borderTopWidth: 1, borderTopColor: appColor('#EDF3F6', 'border') },
  weekDay: { alignItems: 'center', gap: 5 },
  weekDayMark: { width: 25, height: 25, borderRadius: 9, backgroundColor: appColor('#F0F5F7', 'background'), alignItems: 'center', justifyContent: 'center' },
  weekDayMarkActive: { backgroundColor: appColor('#327E9D', 'background') },
  weekDayLabel: { color: appColor('#718493', 'text'), fontSize: 9 },
  consistencyNote: { color: appColor('#718493', 'text'), fontSize: 10, lineHeight: 15, marginTop: 10 },
  attentionCard: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: appColor('#FFFFFF', 'background'), borderRadius: 17, borderWidth: 1, borderColor: appColor('#E5EFF4', 'border'), padding: 13, marginBottom: 9 },
  attentionIcon: { width: 39, height: 39, borderRadius: 13, backgroundColor: appColor('#EAF5F9', 'background'), justifyContent: 'center', alignItems: 'center' },
  attentionCopy: { flex: 1 },
  attentionTopic: { color: appColor('#17324D', 'text'), fontSize: 13, fontWeight: '800' },
  attentionSubject: { color: appColor('#327E9D', 'text'), fontSize: 10, fontWeight: '700', marginTop: 2 },
  attentionReason: { color: appColor('#718493', 'text'), fontSize: 10, lineHeight: 15, marginTop: 4 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9, marginBottom: 21 },
  statTile: { width: '48%', flexGrow: 1, minHeight: 108, borderRadius: 17, borderWidth: 1, borderColor: appColor('#E5EFF4', 'border'), backgroundColor: appColor('#FFFFFF', 'background'), padding: 11 },
  statIcon: { width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: appColor('#EAF5F9', 'background') },
  statLabel: { color: appColor('#718493', 'text'), fontSize: 10, fontWeight: '700', marginTop: 7 },
  statValue: { color: appColor('#17324D', 'text'), fontSize: 20, lineHeight: 24, fontWeight: '800', marginTop: 1 },
  statNote: { color: appColor('#81939E', 'text'), fontSize: 9, marginTop: 2 },
  topicCard: { backgroundColor: appColor('#FFFFFF', 'background'), borderRadius: 17, borderWidth: 1, borderColor: appColor('#E5EFF4', 'border'), padding: 13, marginBottom: 9 },
  topicCardTop: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  topicIcon: { width: 36, height: 36, borderRadius: 12, backgroundColor: appColor('#EAF5F9', 'background'), alignItems: 'center', justifyContent: 'center' },
  topicHeading: { flex: 1 },
  topicName: { color: appColor('#17324D', 'text'), fontSize: 13, fontWeight: '800' },
  topicSubject: { color: appColor('#718493', 'text'), fontSize: 10, marginTop: 2 },
  topicPercentage: { color: appColor('#327E9D', 'text'), fontSize: 14, fontWeight: '800' },
  topicFooter: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 7 },
  topicMeta: { color: appColor('#81939E', 'text'), fontSize: 9 },
  chartHeading: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 6 },
  chartHeadingCopy: { flex: 1 },
  rangeSwitch: { flexDirection: 'row', padding: 3, borderRadius: 11, backgroundColor: appColor('#EAF1F4', 'background'), marginBottom: 10 },
  rangeOption: { minWidth: 34, minHeight: 27, justifyContent: 'center', alignItems: 'center', borderRadius: 8, paddingHorizontal: 5 },
  rangeOptionActive: { backgroundColor: appColor('#FFFFFF', 'background') },
  rangeText: { color: appColor('#718493', 'text'), fontSize: 10, fontWeight: '700' },
  rangeTextActive: { color: appColor('#327E9D', 'text') },
  chartSummary: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  chartLabel: { color: appColor('#718493', 'text'), fontSize: 11 },
  chartValue: { color: appColor('#17324D', 'text'), fontSize: 23, fontWeight: '800', marginTop: 1 },
  chartHint: { color: appColor('#718493', 'text'), fontSize: 10 },
  chartScroll: { minWidth: '100%', justifyContent: 'space-between', alignItems: 'flex-end', paddingTop: 12 },
  chartColumn: { width: 27, alignItems: 'center', marginRight: 5 },
  chartBarTrack: { height: 78, width: 14, borderRadius: 5, backgroundColor: appColor('#F0F5F7', 'background'), justifyContent: 'flex-end', overflow: 'hidden' },
  chartBar: { width: '100%', borderRadius: 5, backgroundColor: appColor('#54A9C4', 'background') },
  chartNoData: { height: 3, width: '100%', backgroundColor: appColor('#D9E5EA', 'background') },
  chartDate: { color: appColor('#81939E', 'text'), fontSize: 8, marginTop: 5 },
  chartEmpty: { minHeight: 92, alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 10 },
  emptyText: { color: appColor('#718493', 'text'), fontSize: 11, lineHeight: 17, textAlign: 'center' },
  chartFootnote: { color: appColor('#81939E', 'text'), fontSize: 9, lineHeight: 14, marginTop: 11 },
  analysisCard: { backgroundColor: appColor('#EAF5F9', 'background'), borderRadius: 20, borderWidth: 1, borderColor: appColor('#D9EDF3', 'border'), padding: 16, marginTop: 7 },
  analysisHeading: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  analysisIcon: { width: 38, height: 38, borderRadius: 13, backgroundColor: appColor('#FFFFFF', 'background'), alignItems: 'center', justifyContent: 'center' },
  analysisHeadingCopy: { flex: 1 },
  analysisTitle: { color: appColor('#17324D', 'text'), fontSize: 16, fontWeight: '800' },
  analysisSubheading: { color: appColor('#718493', 'text'), fontSize: 10, marginTop: 2 },
  analysisText: { color: appColor('#526C7B', 'text'), fontSize: 12, lineHeight: 19, marginTop: 11 },
  nextStepLabel: { color: appColor('#17324D', 'text'), fontSize: 12, fontWeight: '800', marginTop: 12 },
  disclaimer: { color: appColor('#81939E', 'text'), fontSize: 9, lineHeight: 14, marginTop: 12 },
  secondaryButton: { minHeight: 42, borderRadius: 12, borderWidth: 1, borderColor: appColor('#C9DFE8', 'border'), backgroundColor: appColor('#FFFFFF', 'background'), paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 12 },
  secondaryButtonText: { color: appColor('#327E9D', 'text'), fontSize: 11, fontWeight: '800' },
  emptyCard: { flexDirection: 'row', alignItems: 'center', gap: 11, backgroundColor: appColor('#FFFFFF', 'background'), borderRadius: 17, borderWidth: 1, borderColor: appColor('#E5EFF4', 'border'), padding: 14, marginBottom: 21 },
  emptyIcon: { width: 39, height: 39, borderRadius: 13, backgroundColor: appColor('#EAF5F9', 'background'), alignItems: 'center', justifyContent: 'center' },
  emptyCopy: { flex: 1 },
  emptyTitle: { color: appColor('#17324D', 'text'), fontSize: 12, fontWeight: '800' },
  bodyText: { color: appColor('#718493', 'text'), fontSize: 13, lineHeight: 20, textAlign: 'center' },
  pressed: { opacity: 0.76 },
  bottomSpace: { height: 18 },
});
