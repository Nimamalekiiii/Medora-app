import { ProgressBar } from '@/components/charts';
import { Gloss, cardShadow } from '@/components/gloss';
import { ink, p, useProgressPalette } from '@/components/progress/theme';
import PullToRefreshScrollView from '@/components/pull-to-refresh-scroll-view';
import { iconTint } from '@/components/study/icon-chip';
import { SubjectGlyph } from '@/components/study/subject-glyph';
import { StudyIcon, type StudyIconName } from '@/components/study-icon';
import { appColor } from '@/constants/adaptive-color';
import { DAILY_QUOTES } from '@/constants/daily-quotes';
import { ui } from '@/constants/ui';
import { useStudyData } from '@/hooks/use-study-data';
import { getAIStudyAnalysis, type AIStudyAnalysis } from '@/services/ai-api';
import { useAppSettings } from '@/services/app-settings-context';
import { useAuth } from '@/services/auth-context';
import { getDaysUntil, keyToDate } from '@/services/dates';
import { calculateStreak, dailyIndex, greetingPeriod, summarizePeriod, type HomePeriod } from '@/services/home-summary';
import { tr } from '@/services/localization';
import { getProfileAvatar } from '@/services/profile-avatar';
import { formatStudyTime } from '@/services/progress-metrics';
import { calculatePreparationAnalysis } from '@/services/study-engine';
import { softTint } from '@/services/subject-look';
import type { StudyActivity } from '@/types/study';
import { Image } from 'expo-image';
import { router, useFocusEffect, type Href } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Easing, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

type Method = 'active_recall' | 'quiz' | 'review' | 'flashcards';
type Recommendation = {
  topicId: string; topicName: string; subjectId: string; subjectName: string;
  priority: 'low' | 'medium' | 'high'; reason: string; recommendedActivities: Method[]; estimatedMinutes: number;
};

const AVATAR = 64;
const AVATAR_SMALL = 0.62;
const SHRINK_DISTANCE = 90;
const PRIORITY_COLOR = { high: '#D03B3B', medium: '#C98500', low: '#0CA30C' } as const;
const ACTIVITY_ICON: Record<StudyActivity['activity'], StudyIconName> = { quiz: 'quiz', active_recall: 'brain', flashcards: 'cards', review: 'review', focus: 'timer' };
const METHOD_ROUTE: Record<Method, string> = {
  active_recall: '/subject/topic/study/active-recall',
  quiz: '/subject/topic/study/quiz',
  review: '/subject/topic/study/review',
  flashcards: '/subject/topic/flashcards',
};

/** The Home tab: today's motivation, the next exam, the daily goal, what to study now, and how it is going. */
export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const { preferences } = useAppSettings();
  const language = preferences.language;
  const L = (en: string, no: string) => (language === 'no' ? no : en);
  const locale = language === 'no' ? 'nb-NO' : 'en-GB';
  const palette = useProgressPalette();
  const { loading, data, metrics, todayKey, reload } = useStudyData();

  const userId = session?.user.id;
  const fullName = String(session?.user.user_metadata.full_name ?? '').trim();
  const firstName = fullName.split(/\s+/)[0] ?? '';
  const initial = (fullName || session?.user.email || 'M').slice(0, 1).toUpperCase();
  const avatarPath = session?.user.user_metadata.medexam_avatar_path;

  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [period, setPeriod] = useState<HomePeriod>('7d');
  const [aiAnalysis, setAIAnalysis] = useState<AIStudyAnalysis | null>(null);
  const [aiLoading, setAILoading] = useState(false);
  const aiKey = useRef('');
  const aiRequest = useRef(0);

  // ----- Profile picture -----
  useFocusEffect(useCallback(() => {
    let active = true;
    if (userId) {
      void getProfileAvatar(userId, avatarPath)
        .then((uri) => { if (active) setAvatarUri(uri); })
        .catch(() => { if (active) setAvatarUri(null); });
    } else {
      setAvatarUri(null);
    }
    return () => { active = false; };
  }, [userId, avatarPath]));

  // The picture shrinks as the page scrolls, and stays in the corner.
  const scrollY = useRef(new Animated.Value(0)).current;
  const avatarScale = scrollY.interpolate({ inputRange: [0, SHRINK_DISTANCE], outputRange: [1, AVATAR_SMALL], extrapolate: 'clamp' });
  const avatarShift = scrollY.interpolate({ inputRange: [0, SHRINK_DISTANCE], outputRange: [0, (AVATAR * (1 - AVATAR_SMALL)) / 2], extrapolate: 'clamp' });
  const avatarLift = scrollY.interpolate({ inputRange: [0, SHRINK_DISTANCE], outputRange: [0, -(AVATAR * (1 - AVATAR_SMALL)) / 2 - 4], extrapolate: 'clamp' });

  // Tapping the picture opens it large, the way social apps do.
  const viewer = useRef(new Animated.Value(0)).current;
  function openViewer() {
    setViewerOpen(true);
    viewer.setValue(0);
    Animated.spring(viewer, { toValue: 1, useNativeDriver: true, friction: 8, tension: 70 }).start();
  }
  function closeViewer(then?: () => void) {
    Animated.timing(viewer, { toValue: 0, duration: 170, easing: Easing.in(Easing.quad), useNativeDriver: true }).start(() => {
      setViewerOpen(false);
      then?.();
    });
  }

  // ----- Motivation of the day -----
  const [quoteIndex, setQuoteIndex] = useState(() => dailyIndex(todayKey, DAILY_QUOTES.length));
  const quoteMotion = useRef(new Animated.Value(0)).current;
  const quoteDay = useRef('');

  const showQuote = useCallback((index: number, animateOut: boolean) => {
    const enter = () => {
      setQuoteIndex(index);
      quoteMotion.setValue(-1);
      Animated.spring(quoteMotion, { toValue: 0, useNativeDriver: true, friction: 7, tension: 60 }).start();
    };
    if (!animateOut) { enter(); return; }
    Animated.timing(quoteMotion, { toValue: 1, duration: 190, easing: Easing.in(Easing.quad), useNativeDriver: true }).start(enter);
  }, [quoteMotion]);

  // A new line each day, animated in when the day changes or the app opens.
  useEffect(() => {
    const first = quoteDay.current === '';
    if (quoteDay.current === todayKey) return;
    quoteDay.current = todayKey;
    showQuote(dailyIndex(todayKey, DAILY_QUOTES.length), !first);
  }, [todayKey, showQuote]);

  const quote = DAILY_QUOTES[quoteIndex] ?? DAILY_QUOTES[0];
  const quoteStyle = {
    // -1 is waiting below, 0 is in place, 1 has left upwards.
    opacity: quoteMotion.interpolate({ inputRange: [-1, 0, 1], outputRange: [0, 1, 0] }),
    transform: [
      { translateY: quoteMotion.interpolate({ inputRange: [-1, 0, 1], outputRange: [18, 0, -14] }) },
      { scale: quoteMotion.interpolate({ inputRange: [-1, 0, 1], outputRange: [0.96, 1, 0.98] }) },
    ],
  };

  // ----- AI plan -----
  const requestAIPlan = useCallback((key: string) => {
    if (!data) return;
    aiKey.current = key;
    const request = ++aiRequest.current;
    const { subjects, topicsBySubject, exams, activities, preferences: study } = data;
    setAIAnalysis(null);
    setAILoading(true);

    const subjectsForAI = subjects.map((subject) => {
      const subjectId = String(subject.id);
      const exam = exams[subjectId];
      return {
        id: subjectId,
        name: subject.name,
        exam: exam ? { date: exam.date, daysUntil: getDaysUntil(exam.date, todayKey) } : null,
        topics: (topicsBySubject[subjectId] ?? []).map((topic) => {
          const topicActivities = activities.filter((item) => String(item.topicId) === String(topic.id));
          const quizzes = topicActivities.filter((item) => item.activity === 'quiz');
          const quizTotal = quizzes.reduce((sum, item) => sum + (item.questionCount || 0), 0);
          const correct = quizzes.reduce((sum, item) => sum + (item.correctCount || 0), 0);
          return {
            id: String(topic.id), name: topic.name, studySessions: topicActivities.length,
            quizAccuracy: quizTotal ? Math.round((correct / quizTotal) * 100) : null,
            confidence: [...topicActivities].reverse().find((item) => item.confidence)?.confidence ?? null,
            lastStudiedAt: topicActivities.at(-1)?.completedAt ?? null,
          };
        }),
      };
    });
    const recentActivity = activities.slice(-20).map(({ topicName, activity, completedAt, questionCount, score }) => ({ topicName, activity, completedAt, questionCount, score }));
    const allowed = study.preferredMethods.filter((method) =>
      (method !== 'quiz' || study.includeQuizzes) &&
      (method !== 'flashcards' || study.includeFlashcards) &&
      (method !== 'review' || study.includeReviewSessions));

    void getAIStudyAnalysis({
      subjects: subjectsForAI,
      recentActivity,
      dailyGoalMinutes: study.dailyGoalMinutes,
      preferredMethods: allowed.length ? allowed : study.preferredMethods,
      studyDays: study.studyDays,
      preferredStudyTime: study.preferredStudyTime,
      sessionLengthMinutes: study.sessionLengthMinutes,
      breakDurationMinutes: study.breakDurationMinutes,
      prioritizeWeakTopics: study.prioritizeWeakTopics,
      prioritizeUpcomingExams: study.prioritizeUpcomingExams,
      includeReviewSessions: study.includeReviewSessions,
      includeFlashcards: study.includeFlashcards,
      includeQuizzes: study.includeQuizzes,
      date: todayKey,
    })
      .then((suggestion) => {
        if (request !== aiRequest.current) return;
        // Only trust a suggestion that points at a real subject and topic.
        const subject = subjects.find((item) => String(item.id) === String(suggestion.subjectId));
        const topic = (topicsBySubject[String(suggestion.subjectId)] ?? []).find((item) => String(item.id) === String(suggestion.topicId));
        setAIAnalysis(subject && topic && subject.name === suggestion.subjectName && topic.name === suggestion.topicName ? suggestion : null);
      })
      .catch((error) => {
        if (request !== aiRequest.current) return;
        console.warn('AI plan unavailable; using the local study plan:', error);
        setAIAnalysis(null);
      })
      .finally(() => { if (request === aiRequest.current) setAILoading(false); });
  }, [data, todayKey]);

  const hasTopics = Boolean(data && data.subjects.length > 0 && Object.values(data.topicsBySubject).some((items) => items.length > 0));
  const planKey = data && hasTopics && data.preferences.autoGeneratePlan
    ? JSON.stringify({ userId, todayKey, subjects: data.subjects, topics: data.topicsBySubject, exams: data.exams, recent: data.activities.slice(-20), preferences: data.preferences })
    : '';

  // Ask the AI again only when something it looks at has changed.
  useEffect(() => {
    if (!data) return;
    if (!planKey) {
      aiRequest.current += 1;
      aiKey.current = '';
      setAIAnalysis(null);
      setAILoading(false);
      return;
    }
    if (planKey !== aiKey.current) requestAIPlan(planKey);
  }, [data, planKey, requestAIPlan]);

  const openTopic = (id: string, name: string, subjectId: string) => router.push({ pathname: '/subject/topic/[id]', params: { id, name, subjectId } });

  // ----- Page -----
  let body;
  if (!data || !metrics) {
    body = <View style={styles.state}>{loading ? <ActivityIndicator color={palette.accent} /> : <Text style={p.body}>{L('Home could not be loaded. Pull down to try again.', 'Hjem kunne ikke lastes inn. Dra ned for å prøve igjen.')}</Text>}</View>;
  } else {
    const { subjects, exams, activities } = data;

    const upcoming = subjects
      .map((subject, index) => {
        const exam = exams[String(subject.id)];
        return exam ? { subject, index, exam, days: getDaysUntil(exam.date, todayKey) } : null;
      })
      .filter((item): item is NonNullable<typeof item> => item !== null && item.days >= 0)
      .sort((left, right) => left.days - right.days);
    const nextExam = upcoming[0] ?? null;
    const examDate = (key: string) => keyToDate(key).toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' });

    // The AI's suggestion when there is a valid one, otherwise the app's own calculation.
    const fallback = calculatePreparationAnalysis(subjects, data.topicsBySubject, exams, activities).recommendations[0] ?? null;
    const recommendation: Recommendation | null = aiAnalysis
      ? { ...aiAnalysis, topicId: String(aiAnalysis.topicId), subjectId: String(aiAnalysis.subjectId) }
      : fallback ? { ...fallback, topicId: String(fallback.topicId), subjectId: String(fallback.subjectId) } as Recommendation : null;
    const focusTopic = recommendation ? metrics.topics.find((topic) => String(topic.id) === recommendation.topicId && topic.subjectId === recommendation.subjectId) ?? null : null;
    const focus = recommendation && focusTopic ? { recommendation, topic: focusTopic } : null;
    const focusParams = focus ? { id: String(focus.topic.id), name: focus.topic.name, subjectId: focus.topic.subjectId } : null;
    const focusSubjectIndex = focus ? subjects.findIndex((subject) => String(subject.id) === focus.topic.subjectId) : -1;

    const now = Date.now();
    const dueCards = data.cards.filter((card) => !card.nextReviewAt || !(new Date(card.nextReviewAt).getTime() > now)).length;
    const summary = summarizePeriod(activities, period);
    const streak = calculateStreak(activities);
    const today = metrics.today;
    const recent = [...activities].sort((left, right) => new Date(right.completedAt).getTime() - new Date(left.completedAt).getTime()).slice(0, 4);

    const priorityLabel = { high: L('High priority', 'Høy prioritet'), medium: L('Medium priority', 'Middels prioritet'), low: L('Low priority', 'Lav prioritet') };
    const methodText: Record<Method, { title: string; detail: string }> = {
      review: { title: L('Review', 'Repetisjon'), detail: L('Strengthen weak or recently forgotten areas.', 'Styrk det som er svakt eller nylig glemt.') },
      quiz: { title: 'Quiz', detail: L('Practise questions and measure your accuracy.', 'Øv på spørsmål og mål treffprosenten.') },
      active_recall: { title: 'Active Recall', detail: L('Test what you remember without notes.', 'Test hva du husker uten notater.') },
      flashcards: { title: 'Flashcards', detail: L('Reinforce key facts with spaced repetition.', 'Fest nøkkelfakta med spredt repetisjon.') },
    };

    function relativeTime(value: string) {
      const then = new Date(value).getTime();
      if (!Number.isFinite(then)) return '';
      const minutes = Math.max(0, Math.round((Date.now() - then) / 60_000));
      if (minutes < 1) return L('Just now', 'Akkurat nå');
      if (minutes < 60) return L(`${minutes} min ago`, `${minutes} min siden`);
      const hours = Math.round(minutes / 60);
      if (hours < 24) return L(`${hours} ${hours === 1 ? 'hour' : 'hours'} ago`, `${hours} ${hours === 1 ? 'time' : 'timer'} siden`);
      const days = Math.round(hours / 24);
      if (days === 1) return L('Yesterday', 'I går');
      return L(`${days} days ago`, `${days} dager siden`);
    }

    function describe(activity: StudyActivity) {
      const count = Math.max(0, activity.questionCount || 0);
      switch (activity.activity) {
        case 'quiz': return { title: L('Quiz session', 'Quizøkt'), amount: `${count} ${L('questions', 'spørsmål')}` };
        case 'active_recall': return { title: 'Active Recall', amount: `${count} ${L('questions', 'spørsmål')}` };
        case 'review': return { title: L('Flashcard review', 'Repetisjon av flashcards'), amount: `${count} ${L('cards', 'kort')}` };
        case 'flashcards': return { title: L('Flashcard practice', 'Øving med flashcards'), amount: `${count} ${L('cards', 'kort')}` };
        default: return { title: L('Focus session', 'Fokusøkt'), amount: formatStudyTime(Math.round((activity.durationSeconds || 0) / 60), language) };
      }
    }

    const change = (value: number | null, unit: 'minutes' | 'points') => {
      if (value === null || value === 0) return null;
      const amount = unit === 'minutes' ? formatStudyTime(Math.abs(value), language) : `${Math.abs(value)}%`;
      return { up: value > 0, text: `${value > 0 ? '+' : '−'}${amount}` };
    };

    const stat = (icon: StudyIconName, tint: string, label: string, value: string, delta: { up: boolean; text: string } | null, bar?: number) => (
      <Pressable accessibilityRole="button" accessibilityLabel={`${label}: ${value}${delta ? `, ${delta.text}` : ''}`} onPress={() => router.push('/progress')} style={({ pressed }) => [styles.stat, pressed && p.pressed]}>
        <View style={styles.statTop}>
          <View style={[styles.statIcon, { backgroundColor: softTint(tint) }]}><Gloss /><StudyIcon name={icon} size={17} color={tint} /></View>
          <Text style={styles.statLabel} numberOfLines={1}>{label}</Text>
        </View>
        <View style={styles.statValueRow}>
          <Text style={styles.statValue} numberOfLines={1}>{value}</Text>
          {delta ? (
            <View style={styles.delta}>
              <StudyIcon name={delta.up ? 'trend' : 'chevronDown'} size={11} color={ink.secondary} />
              <Text style={styles.deltaText}>{delta.text}</Text>
            </View>
          ) : null}
        </View>
        {bar !== undefined ? <ProgressBar value={bar} color={tint} trackColor={palette.track} height={5} /> : null}
      </Pressable>
    );

    const action = (icon: StudyIconName, tint: string, label: string, detail: string | null, onPress: () => void) => (
      <Pressable accessibilityRole="button" accessibilityLabel={detail ? `${label}, ${detail}` : label} onPress={onPress} style={({ pressed }) => [styles.action, { backgroundColor: softTint(tint) }, pressed && p.pressed]}>
        <Gloss />
        <StudyIcon name={icon} size={24} color={tint} />
        <Text style={styles.actionLabel} numberOfLines={1}>{label}</Text>
        {detail ? <Text style={[styles.actionDetail, { color: tint }]} numberOfLines={1}>{detail}</Text> : null}
      </Pressable>
    );

    const encouragement = today.goalMet
      ? { title: L('Daily goal reached', 'Dagsmålet er nådd'), detail: L('Well done. Anything more today is a bonus.', 'Bra jobbet. Alt mer i dag er bonus.') }
      : streak >= 3 ? { title: L(`${streak} days in a row`, `${streak} dager på rad`), detail: L('Keep going, small steps lead to big results.', 'Fortsett, små steg gir store resultater.') }
      : today.studyMinutes > 0 ? { title: L('You are on track', 'Du er i gang'), detail: L(`${Math.max(0, today.goalMinutes - today.studyMinutes)} min left of today's goal.`, `${Math.max(0, today.goalMinutes - today.studyMinutes)} min igjen av dagsmålet.`) }
      : { title: L('A short session counts', 'En kort økt teller'), detail: L('Ten minutes now keeps the streak and the memory alive.', 'Ti minutter nå holder rekken og hukommelsen i live.') };

    const subjectRows = subjects.map((subject, index) => {
      const subjectId = String(subject.id);
      const topics = metrics.topics.filter((topic) => topic.subjectId === subjectId);
      const started = topics.filter((topic) => topic.status !== 'not_started').length;
      const progress = metrics.subjects.find((item) => item.subjectId === subjectId)?.progress ?? 0;
      return { subject, index, total: topics.length, started, progress };
    });

    body = subjects.length === 0 ? (
      <View style={[p.card, p.empty]}>
        <View style={p.iconChip}><StudyIcon name="layers" size={20} color={palette.accent} /></View>
        <Text style={p.emptyTitle}>{L('Start with your first subject', 'Start med det første emnet ditt')}</Text>
        <Text style={[p.body, styles.centered]}>{L('Add a subject and its topics, and Home fills in with your plan, your goal and your progress.', 'Legg til et emne med temaer, så fylles Hjem med planen, målet og fremgangen din.')}</Text>
        <Pressable accessibilityRole="button" onPress={() => router.push('/subjects')} style={({ pressed }) => [p.button, styles.wide, { backgroundColor: palette.accent }, pressed && p.pressed]}>
          <Text style={p.buttonText}>{L('Add subject', 'Legg til emne')}</Text>
        </Pressable>
      </View>
    ) : (
      <>
        {/* Next exam */}
        <Pressable
          accessibilityRole="button"
          onPress={() => (nextExam ? router.push({ pathname: '/subject/exam', params: { id: String(nextExam.subject.id), name: nextExam.subject.name } }) : router.push('/subjects'))}
          style={({ pressed }) => [p.card, p.row, pressed && p.pressed]}
        >
          <View style={[styles.bigIcon, { backgroundColor: softTint(iconTint('calendar', palette)) }]}><Gloss /><StudyIcon name="calendar" size={24} color={iconTint('calendar', palette)} /></View>
          <View style={p.grow}>
            <Text style={styles.eyebrow}>{L('NEXT EXAM', 'NESTE EKSAMEN')}</Text>
            {nextExam ? (
              <>
                <Text style={styles.cardTitle} numberOfLines={1}>{nextExam.subject.name}</Text>
                <Text style={p.small} numberOfLines={1}>{examDate(nextExam.exam.date)}</Text>
              </>
            ) : (
              <>
                <Text style={styles.cardTitle}>{L('No exam planned', 'Ingen eksamen planlagt')}</Text>
                <Text style={p.small}>{L('Add a date to a subject to start the countdown.', 'Legg inn en dato på et emne for å starte nedtellingen.')}</Text>
              </>
            )}
          </View>
          {nextExam ? (
            <View style={styles.daysBox}>
              <Text style={styles.days}>{nextExam.days}</Text>
              <Text style={p.small}>{nextExam.days === 1 ? L('day left', 'dag igjen') : L('days left', 'dager igjen')}</Text>
            </View>
          ) : <StudyIcon name="chevron" size={12} color={ink.muted} />}
        </Pressable>

        {/* Today's goal */}
        <Pressable accessibilityRole="button" accessibilityLabel={L(`Today's goal: ${today.studyMinutes} of ${today.goalMinutes} minutes`, `Dagens mål: ${today.studyMinutes} av ${today.goalMinutes} minutter`)} onPress={() => router.push('/settings/study' as Href)} style={({ pressed }) => [p.card, p.row, pressed && p.pressed]}>
          <View style={[styles.bigIcon, { backgroundColor: softTint(palette.accent) }]}><Gloss /><StudyIcon name={today.goalMet ? 'check' : 'target'} size={24} color={palette.accent} /></View>
          <View style={p.grow}>
            <Text style={styles.goalTitle}>{L("Today's goal", 'Dagens mål')}</Text>
            <Text style={styles.goalValue}><Text style={{ color: palette.accent }}>{today.studyMinutes}</Text> / {today.goalMinutes} min</Text>
            <View style={styles.goalBar}><ProgressBar value={today.percent} color={palette.accent} trackColor={palette.track} height={6} /></View>
          </View>
          <StudyIcon name="chevron" size={12} color={ink.muted} />
        </Pressable>

        {/* Quick actions */}
        <Text style={styles.section}>{L('Quick actions', 'Snarveier')}</Text>
        <View style={styles.actions}>
          {action('book', palette.series[4], L('Study', 'Studer'), null, () => router.push('/study'))}
          {action('cards', iconTint('cards', palette), 'Flashcards', null, () => (focusParams ? router.push({ pathname: '/subject/topic/flashcards', params: focusParams }) : router.push('/study')))}
          {action('quiz', iconTint('quiz', palette), 'Quiz', null, () => (focusParams ? router.push({ pathname: '/subject/topic/study/quiz', params: focusParams }) : router.push('/study')))}
          {action('review', iconTint('review', palette), L('Review', 'Repeter'), dueCards > 0 ? `${dueCards} ${L('due', 'forfalt')}` : null, () => (dueCards > 0 ? router.push({ pathname: '/subject/topic/study/review', params: { all: '1' } }) : router.push('/study')))}
        </View>
        {focus ? <Text style={p.small}>{L(`Flashcards and Quiz open today's topic: ${focus.topic.name}.`, `Flashcards og Quiz åpner dagens tema: ${focus.topic.name}.`)}</Text> : null}

        {/* AI recommendation */}
        <View style={p.card}>
          <View style={p.row}>
            <StudyIcon name="sparkles" size={24} color={palette.accent} />
            <View style={p.grow}>
              <Text style={styles.cardTitle}>{aiAnalysis ? L('AI recommends for you', 'AI anbefaler for deg') : L('Recommended for you', 'Anbefalt for deg')}</Text>
              <Text style={p.small}>{aiLoading
                ? L('AI is looking at your progress…', 'AI ser på fremgangen din …')
                : aiAnalysis ? L('Based on your progress, weak topics and coming exams.', 'Basert på fremgangen din, svake temaer og kommende eksamener.')
                : L('Calculated from your own study history.', 'Beregnet ut fra din egen studiehistorikk.')}</Text>
            </View>
            {hasTopics && data.preferences.autoGeneratePlan ? (
              <Pressable accessibilityRole="button" accessibilityLabel={L('Ask AI again', 'Spør AI på nytt')} disabled={aiLoading} onPress={() => requestAIPlan(planKey)} style={({ pressed }) => [styles.refresh, pressed && p.pressed]} hitSlop={8}>
                {aiLoading ? <ActivityIndicator size="small" color={palette.accent} /> : <StudyIcon name="review" size={15} color={ink.secondary} />}
              </Pressable>
            ) : null}
          </View>
          {focus ? (
            <>
              <Pressable accessibilityRole="button" onPress={() => openTopic(focusParams!.id, focusParams!.name, focusParams!.subjectId)} style={({ pressed }) => [p.inset, p.row, pressed && p.pressed]}>
                <SubjectGlyph name={focus.topic.subjectName} index={Math.max(0, focusSubjectIndex)} size={44} />
                <View style={p.grow}>
                  <Text style={styles.focusName} numberOfLines={1}>{focus.topic.name}</Text>
                  <Text style={p.small} numberOfLines={3}>{tr(focus.recommendation.reason, language)}</Text>
                </View>
              </Pressable>
              <Pressable accessibilityRole="button" onPress={() => openTopic(focusParams!.id, focusParams!.name, focusParams!.subjectId)} style={({ pressed }) => [p.button, styles.buttonRow, { backgroundColor: palette.accent }, pressed && p.pressed]}>
                <Text style={p.buttonText}>{L('Start recommended session', 'Start anbefalt økt')}</Text>
                <StudyIcon name="chevron" size={12} color="#FFFFFF" />
              </Pressable>
            </>
          ) : (
            <Text style={p.body}>{hasTopics
              ? L('Study a topic once and a recommendation shows here.', 'Studer et tema én gang, så kommer en anbefaling her.')
              : L('Add topics to a subject to get a recommendation.', 'Legg til temaer i et emne for å få en anbefaling.')}</Text>
          )}
        </View>

        {/* Progress overview */}
        <View style={styles.sectionRow}>
          <View style={p.grow}>
            <Text style={styles.section}>{L('Your progress', 'Fremgangen din')}</Text>
            <Text style={p.small}>{L('How you are doing across all subjects.', 'Hvordan det går på tvers av alle emner.')}</Text>
          </View>
          <View style={styles.periods} accessibilityRole="tablist">
            {(['7d', '30d', 'all'] as const).map((key) => {
              const selected = key === period;
              return (
                <Pressable key={key} accessibilityRole="tab" accessibilityState={{ selected }} accessibilityLabel={key === '7d' ? L('7 days', '7 dager') : key === '30d' ? L('30 days', '30 dager') : L('All time', 'All tid')} onPress={() => setPeriod(key)} style={[styles.period, selected && { backgroundColor: palette.accent }]} hitSlop={4}>
                  <Text style={[styles.periodText, selected && styles.periodTextOn]}>{key === 'all' ? L('All', 'Alt') : key}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
        <View style={styles.stats}>
          {stat('chart', palette.accent, L('Preparation', 'Forberedelse'), `${metrics.overallProgress}%`, null, metrics.overallProgress)}
          {stat('target', palette.series[4], L('Quiz accuracy', 'Quiz-treff'), summary.quizAccuracy === null ? '–' : `${summary.quizAccuracy}%`, change(summary.quizAccuracyChange, 'points'), summary.quizAccuracy ?? 0)}
          {stat('clock', palette.series[2], L('Study time', 'Studietid'), formatStudyTime(summary.studyMinutes, language), change(summary.studyMinutesChange, 'minutes'))}
          {stat('flame', palette.series[1], L('Study streak', 'Studierekke'), `${streak} ${streak === 1 ? L('day', 'dag') : L('days', 'dager')}`, null)}
        </View>

        {/* Subjects */}
        <View style={styles.sectionRow}>
          <Text style={[styles.section, p.grow]}>{L('Subject progress', 'Fremgang per emne')}</Text>
          <Pressable accessibilityRole="button" onPress={() => router.push('/subjects')} style={p.linkRow} hitSlop={8}>
            <Text style={[p.link, { color: palette.accent }]}>{L('See all', 'Se alle')}</Text>
            <StudyIcon name="chevron" size={11} color={palette.accent} />
          </Pressable>
        </View>
        {subjectRows.slice(0, 4).map((row) => (
          <Pressable key={String(row.subject.id)} accessibilityRole="button" accessibilityLabel={`${row.subject.name}, ${row.progress}%`} onPress={() => router.push({ pathname: '/subject/[id]', params: { id: String(row.subject.id), name: row.subject.name } })} style={({ pressed }) => [styles.listRow, pressed && p.pressed]}>
            <SubjectGlyph name={row.subject.name} index={row.index} size={44} />
            <View style={p.grow}>
              <View style={styles.rowTop}>
                <Text style={[styles.rowTitle, p.grow]} numberOfLines={1}>{row.subject.name}</Text>
                <Text style={[styles.rowPercent, { color: palette.series[row.index % palette.series.length] }]}>{row.progress}%</Text>
              </View>
              <View style={styles.rowBar}><ProgressBar value={row.progress} color={palette.series[row.index % palette.series.length]} trackColor={palette.track} height={5} /></View>
              <Text style={p.small}>{row.total === 0 ? L('No topics yet', 'Ingen temaer ennå') : L(`${row.started} of ${row.total} topics started`, `${row.started} av ${row.total} temaer påbegynt`)}</Text>
            </View>
            <StudyIcon name="chevron" size={12} color={ink.muted} />
          </Pressable>
        ))}

        {/* Upcoming exams */}
        {upcoming.length > 0 ? (
          <>
            <Text style={styles.section}>{L('Upcoming exams', 'Kommende eksamener')}</Text>
            <View style={[p.card, styles.group]}>
              {upcoming.slice(0, 3).map((item, index) => (
                <Pressable key={String(item.subject.id)} accessibilityRole="button" accessibilityLabel={`${item.subject.name}, ${item.days} ${L('days left', 'dager igjen')}`} onPress={() => router.push({ pathname: '/subject/exam', params: { id: String(item.subject.id), name: item.subject.name } })} style={({ pressed }) => [styles.groupRow, index > 0 && styles.divider, pressed && p.pressed]}>
                  <StudyIcon name="calendar" size={20} color={iconTint('calendar', palette)} />
                  <View style={p.grow}>
                    <Text style={styles.rowTitle} numberOfLines={1}>{item.subject.name}</Text>
                    <Text style={p.small} numberOfLines={1}>{examDate(item.exam.date)}</Text>
                  </View>
                  <View style={styles.daysBox}>
                    <Text style={styles.daysSmall}>{item.days}</Text>
                    <Text style={p.small}>{item.days === 1 ? L('day left', 'dag igjen') : L('days left', 'dager igjen')}</Text>
                  </View>
                </Pressable>
              ))}
            </View>
          </>
        ) : null}

        {/* Today's focus */}
        {focus && focusParams ? (
          <View style={p.card}>
            <View style={p.cardHeader}>
              <Text style={p.cardTitle}>{L("Today's focus", 'Dagens fokus')}</Text>
              <Pressable accessibilityRole="button" onPress={() => router.push('/settings/planning' as Href)} hitSlop={8}>
                <Text style={[p.link, { color: palette.accent }]}>{L('Edit', 'Endre')}</Text>
              </Pressable>
            </View>
            <Pressable accessibilityRole="button" onPress={() => openTopic(focusParams.id, focusParams.name, focusParams.subjectId)} style={({ pressed }) => [p.row, pressed && p.pressed]}>
              <SubjectGlyph name={focus.topic.subjectName} index={Math.max(0, focusSubjectIndex)} size={52} />
              <View style={p.grow}>
                <Text style={styles.cardTitle} numberOfLines={1}>{focus.topic.name}</Text>
                <View style={styles.priority}>
                  <View style={[p.legendDot, { backgroundColor: PRIORITY_COLOR[focus.recommendation.priority] }]} />
                  <Text style={p.small} numberOfLines={1}>{focus.topic.subjectName} · {priorityLabel[focus.recommendation.priority]}</Text>
                </View>
              </View>
            </Pressable>
            <View>
              {focus.recommendation.recommendedActivities.map((method, index) => (
                <Pressable key={`${method}-${index}`} accessibilityRole="button" accessibilityLabel={`${index + 1}. ${methodText[method].title}. ${methodText[method].detail}`} onPress={() => router.push({ pathname: METHOD_ROUTE[method], params: focusParams } as Href)} style={({ pressed }) => [styles.step, index > 0 && styles.divider, pressed && p.pressed]}>
                  <View style={[styles.stepNumber, { backgroundColor: softTint(iconTint(ACTIVITY_ICON[method], palette)) }]}>
                    <Text style={[styles.stepNumberText, { color: iconTint(ACTIVITY_ICON[method], palette) }]}>{index + 1}</Text>
                  </View>
                  <View style={p.grow}>
                    <Text style={styles.rowTitle}>{methodText[method].title}</Text>
                    <Text style={p.small}>{methodText[method].detail}</Text>
                  </View>
                  <StudyIcon name="chevron" size={12} color={ink.muted} />
                </Pressable>
              ))}
            </View>
            <View style={[p.row, styles.focusFooter]}>
              <StudyIcon name="clock" size={17} color={ink.secondary} />
              <Text style={[p.body, p.grow]}>{L(`About ${focus.recommendation.estimatedMinutes} min`, `Omtrent ${focus.recommendation.estimatedMinutes} min`)}</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={L('Start a focus session with a timer', 'Start en fokusøkt med timer')}
                onPress={() => router.push({ pathname: '/focus', params: { ...focusParams, subjectName: focus.topic.subjectName } } as unknown as Href)}
                style={({ pressed }) => [styles.startButton, { backgroundColor: palette.accent }, pressed && p.pressed]}
              >
                <Text style={p.buttonText}>{L('Start session', 'Start økt')}</Text>
                <StudyIcon name="chevron" size={12} color="#FFFFFF" />
              </Pressable>
            </View>
          </View>
        ) : null}

        {/* Recent activity */}
        <View style={styles.sectionRow}>
          <Text style={[styles.section, p.grow]}>{L('Recent activity', 'Siste aktivitet')}</Text>
          {recent.length > 0 ? (
            <Pressable accessibilityRole="button" onPress={() => router.push('/progress')} style={p.linkRow} hitSlop={8}>
              <Text style={[p.link, { color: palette.accent }]}>{L('See all', 'Se alle')}</Text>
              <StudyIcon name="chevron" size={11} color={palette.accent} />
            </Pressable>
          ) : null}
        </View>
        {recent.length === 0 ? (
          <View style={[p.card, p.empty]}><Text style={[p.body, styles.centered]}>{L('Your study sessions will show here.', 'Studieøktene dine vises her.')}</Text></View>
        ) : (
          <View style={[p.card, styles.group]}>
            {recent.map((activity, index) => {
              const text = describe(activity);
              const icon = ACTIVITY_ICON[activity.activity] ?? 'book';
              const tint = iconTint(icon, palette);
              return (
                <View key={`${activity.id}-${activity.completedAt}`} style={[styles.groupRow, index > 0 && styles.divider]}>
                  <View style={[styles.activityIcon, { backgroundColor: softTint(tint) }]}><Gloss /><StudyIcon name={icon} size={18} color={tint} /></View>
                  <View style={p.grow}>
                    <Text style={styles.rowTitle} numberOfLines={1}>{text.title}</Text>
                    <Text style={p.small} numberOfLines={1}>{activity.topicName}</Text>
                  </View>
                  <View style={styles.activityRight}>
                    <Text style={styles.activityAmount}>{text.amount}</Text>
                    <Text style={p.small}>{relativeTime(activity.completedAt)}</Text>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {/* Encouragement */}
        <View style={[p.card, p.row]}>
          <View style={[styles.bigIcon, { backgroundColor: softTint(palette.series[3]) }]}><Gloss /><StudyIcon name="trophy" size={24} color={palette.series[3]} /></View>
          <View style={p.grow}>
            <Text style={styles.cardTitle}>{encouragement.title}</Text>
            <Text style={p.small}>{encouragement.detail}</Text>
          </View>
        </View>
      </>
    );
  }

  const greeting = { morning: L('Good morning', 'God morgen'), afternoon: L('Good afternoon', 'God ettermiddag'), evening: L('Good evening', 'God kveld') }[greetingPeriod(new Date().getHours())];
  const viewerSize = 280;

  return (
    <SafeAreaView style={ui.container} edges={['top']}>
      <PullToRefreshScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: false })}
        onRefresh={reload}
      >
        <View style={styles.header}>
          <Text style={styles.greeting}>{greeting}{firstName ? ',' : ''}</Text>
          <Text style={styles.name} numberOfLines={1} accessibilityRole="header">{firstName || 'Medora'}</Text>
          <Text style={styles.tagline}>{L("Let's make progress today.", 'La oss komme videre i dag.')}</Text>
        </View>

        {/* Motivation of the day */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${L('Motivation of the day', 'Dagens motivasjon')}: ${L(quote.en, quote.no)}`}
          accessibilityHint={L('Shows another line', 'Viser en annen linje')}
          onPress={() => showQuote((quoteIndex + 1) % DAILY_QUOTES.length, true)}
          style={({ pressed }) => [styles.quoteCard, pressed && p.pressed]}
        >
          <Gloss strength={0.45} />
          <View style={styles.quoteTop}>
            <StudyIcon name="sparkles" size={15} color="#FFFFFF" />
            <Text style={styles.quoteEyebrow}>{L('MOTIVATION OF THE DAY', 'DAGENS MOTIVASJON')}</Text>
          </View>
          <Animated.View style={quoteStyle}>
            <Text style={styles.quoteText}>{L(quote.en, quote.no)}</Text>
          </Animated.View>
          <Text style={styles.quoteHint}>{L('A new one every day. Tap for another.', 'En ny hver dag. Trykk for en til.')}</Text>
        </Pressable>

        {body}
      </PullToRefreshScrollView>

      {/* Profile picture that follows the scroll */}
      <Animated.View style={[styles.avatarWrap, { top: insets.top + 10, transform: [{ translateX: avatarShift }, { translateY: avatarLift }, { scale: avatarScale }] }]}>
        <Pressable accessibilityRole="imagebutton" accessibilityLabel={L('Show profile picture', 'Vis profilbildet')} onPress={openViewer} style={({ pressed }) => [styles.avatar, { borderColor: palette.accent }, pressed && p.pressed]}>
          {avatarUri
            ? <Image source={{ uri: avatarUri }} contentFit="cover" style={styles.avatarImage} />
            : <Text style={[styles.avatarInitial, { color: palette.accent }]}>{initial}</Text>}
        </Pressable>
      </Animated.View>

      <Modal visible={viewerOpen} transparent animationType="none" statusBarTranslucent onRequestClose={() => closeViewer()}>
        <Pressable style={styles.viewer} onPress={() => closeViewer()} accessibilityLabel={L('Close', 'Lukk')}>
          <Animated.View style={[StyleSheet.absoluteFill, styles.viewerBackdrop, { opacity: viewer }]} />
          <Animated.View style={[styles.viewerContent, { opacity: viewer, transform: [{ scale: viewer.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] }) }] }]}>
            <View style={[styles.viewerPhoto, { width: viewerSize, height: viewerSize, borderRadius: viewerSize / 2 }]}>
              {avatarUri
                ? <Image source={{ uri: avatarUri }} contentFit="cover" style={styles.avatarImage} accessibilityLabel={L('Profile picture', 'Profilbilde')} />
                : <Text style={styles.viewerInitial}>{initial}</Text>}
            </View>
            {fullName ? <Text style={styles.viewerName}>{fullName}</Text> : null}
            <Pressable accessibilityRole="button" onPress={() => closeViewer(() => router.push('/profile'))} style={({ pressed }) => [styles.viewerButton, pressed && p.pressed]}>
              <StudyIcon name="person" size={15} color="#FFFFFF" />
              <Text style={styles.viewerButtonText}>{avatarUri ? L('Open profile', 'Åpne profilen') : L('Add a profile picture', 'Legg til profilbilde')}</Text>
            </Pressable>
          </Animated.View>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 40, gap: 14 },
  state: { alignItems: 'center', paddingVertical: 60 },
  centered: { textAlign: 'center' },
  wide: { alignSelf: 'stretch' },
  buttonRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },

  header: { paddingRight: AVATAR + 16, minHeight: AVATAR + 8 },
  greeting: { color: ink.secondary, fontSize: 17 },
  name: { color: ink.primary, fontSize: 36, fontWeight: '800', letterSpacing: -0.6, lineHeight: 42 },
  tagline: { color: ink.secondary, fontSize: 15, marginTop: 2 },

  avatarWrap: { position: 'absolute', right: 20, width: AVATAR, height: AVATAR },
  avatar: { width: AVATAR, height: AVATAR, borderRadius: AVATAR / 2, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', borderWidth: 2, backgroundColor: appColor('#FFFFFF', 'background') },
  avatarImage: { width: '100%', height: '100%' },
  avatarInitial: { fontSize: 26, fontWeight: '800' },

  // A fixed deep blue, so the white text is easy to read in both light and dark mode.
  quoteCard: { borderRadius: 22, padding: 18, gap: 10, overflow: 'hidden', backgroundColor: '#1F64BF' },
  quoteTop: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  quoteEyebrow: { color: '#FFFFFF', fontSize: 10, fontWeight: '800', letterSpacing: 1.1, opacity: 0.9 },
  quoteText: { color: '#FFFFFF', fontSize: 20, lineHeight: 27, fontWeight: '700', letterSpacing: -0.2 },
  quoteHint: { color: '#FFFFFF', fontSize: 11, opacity: 0.85 },

  eyebrow: { color: ink.muted, fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  cardTitle: { color: ink.primary, fontSize: 17, fontWeight: '800' },
  bigIcon: { width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  daysBox: { alignItems: 'center', minWidth: 62 },
  days: { color: ink.primary, fontSize: 30, fontWeight: '800', letterSpacing: -0.5 },
  daysSmall: { color: ink.primary, fontSize: 22, fontWeight: '800' },
  goalTitle: { color: ink.primary, fontSize: 15, fontWeight: '700' },
  goalValue: { color: ink.primary, fontSize: 19, fontWeight: '800', marginTop: 1 },
  goalBar: { marginTop: 8 },

  section: { color: ink.primary, fontSize: 19, fontWeight: '800', marginTop: 4 },
  sectionRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 },
  actions: { flexDirection: 'row', gap: 9 },
  action: { flex: 1, minHeight: 86, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 18, paddingHorizontal: 4 },
  actionLabel: { color: ink.primary, fontSize: 12, fontWeight: '700' },
  actionDetail: { fontSize: 10, fontWeight: '800', marginTop: -3 },

  refresh: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: appColor('#F4F8FA', 'background') },
  focusName: { color: ink.primary, fontSize: 15, fontWeight: '800', marginBottom: 2 },

  periods: { flexDirection: 'row', padding: 3, borderRadius: 14, backgroundColor: appColor('#FFFFFF', 'background'), borderWidth: 1, borderColor: appColor('#E7F0F4', 'border'), ...cardShadow },
  period: { minWidth: 40, minHeight: 30, alignItems: 'center', justifyContent: 'center', borderRadius: 11, paddingHorizontal: 8 },
  periodText: { color: ink.secondary, fontSize: 12, fontWeight: '700' },
  periodTextOn: { color: '#FFFFFF' },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  stat: { flexGrow: 1, flexBasis: '46%', gap: 9, padding: 14, borderRadius: 18, backgroundColor: appColor('#FFFFFF', 'background'), borderWidth: 1, borderColor: appColor('#E7F0F4', 'border'), ...cardShadow },
  statTop: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  statIcon: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  statLabel: { flex: 1, color: ink.secondary, fontSize: 12, fontWeight: '600' },
  statValueRow: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', gap: 8 },
  statValue: { color: ink.primary, fontSize: 22, fontWeight: '800', letterSpacing: -0.3 },
  delta: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  deltaText: { color: ink.secondary, fontSize: 11, fontWeight: '700' },

  listRow: { flexDirection: 'row', alignItems: 'center', gap: 13, padding: 13, borderRadius: 18, backgroundColor: appColor('#FFFFFF', 'background'), borderWidth: 1, borderColor: appColor('#E7F0F4', 'border'), ...cardShadow },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowTitle: { color: ink.primary, fontSize: 15, fontWeight: '700' },
  rowPercent: { fontSize: 14, fontWeight: '800' },
  rowBar: { marginTop: 7, marginBottom: 6 },
  group: { gap: 0, paddingVertical: 4 },
  groupRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11 },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: appColor('#D8E6EC', 'border') },

  priority: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 4 },
  step: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11 },
  stepNumber: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  stepNumberText: { fontSize: 14, fontWeight: '800' },
  focusFooter: { paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: appColor('#D8E6EC', 'border') },
  startButton: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 46, paddingHorizontal: 18, borderRadius: 23 },

  activityIcon: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  activityRight: { alignItems: 'flex-end' },
  activityAmount: { color: ink.primary, fontSize: 12, fontWeight: '700' },

  viewer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  viewerBackdrop: { backgroundColor: 'rgba(6, 16, 24, 0.9)' },
  viewerContent: { alignItems: 'center', gap: 18 },
  viewerPhoto: { overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: '#11213A', borderWidth: 3, borderColor: '#FFFFFF' },
  viewerInitial: { color: '#FFFFFF', fontSize: 110, fontWeight: '800' },
  viewerName: { color: '#FFFFFF', fontSize: 22, fontWeight: '800' },
  viewerButton: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, paddingHorizontal: 18, borderRadius: 22, backgroundColor: 'rgba(255, 255, 255, 0.16)' },
  viewerButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
});
