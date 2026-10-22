import { ProgressBar } from '@/components/charts';
import { ink, p, useProgressPalette } from '@/components/progress/theme';
import PullToRefreshScrollView from '@/components/pull-to-refresh-scroll-view';
import { IconChip, iconTint } from '@/components/study/icon-chip';
import { ScreenBar, SectionHeader, studyStyles } from '@/components/study/study-ui';
import { StudyIcon, type StudyIconName } from '@/components/study-icon';
import { appColor } from '@/constants/adaptive-color';
import { ui } from '@/constants/ui';
import { useStudyData } from '@/hooks/use-study-data';
import { getAITopicInsight, type AITopicInsight } from '@/services/ai-api';
import { useAppSettings } from '@/services/app-settings-context';
import { getDaysUntil } from '@/services/dates';
import { formatStudyTime } from '@/services/progress-metrics';
import { calculateTopicMastery, MASTERED_AT } from '@/services/topic-mastery';
import type { StudyActivity } from '@/types/study';
import { Stack, router, useLocalSearchParams, type Href } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const param = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] ?? '' : value ?? '');
const ACTIVITY_ICON: Record<StudyActivity['activity'], StudyIconName> = { quiz: 'quiz', active_recall: 'brain', flashcards: 'cards', review: 'review', focus: 'timer' };

/** A topic's detailed progress: what it is built from, results, questions to revisit, history, and an AI review. */
export default function TopicProgressScreen() {
  const params = useLocalSearchParams<{ id?: string | string[]; name?: string | string[]; subjectId?: string | string[] }>();
  const topicId = param(params.id);
  const { preferences } = useAppSettings();
  const language = preferences.language;
  const L = (en: string, no: string) => (language === 'no' ? no : en);
  const locale = language === 'no' ? 'nb-NO' : 'en-GB';
  const palette = useProgressPalette();
  const { loading, data, metrics, todayKey, reload } = useStudyData();

  const [insight, setInsight] = useState<AITopicInsight | null>(null);
  const [aiLoading, setAILoading] = useState(false);
  const [aiError, setAIError] = useState('');
  const request = useRef(0);

  // A review belongs to the numbers it was made from, so it is cleared when they change.
  const activityCount = data?.activities.length ?? 0;
  useEffect(() => {
    request.current += 1;
    setInsight(null);
    setAIError('');
    setAILoading(false);
  }, [activityCount, topicId, language]);

  const topic = metrics?.topics.find((item) => String(item.id) === topicId);
  const topicName = topic?.name ?? (param(params.name) || L('Topic', 'Tema'));
  const subjectId = topic?.subjectId ?? param(params.subjectId);
  const routeParams = { id: topicId, name: topicName, subjectId };
  const open = (pathname: string) => () => router.push({ pathname, params: routeParams } as Href);

  let body;
  if (!data || !metrics) {
    body = <View style={styles.state}>{loading ? <ActivityIndicator color={palette.accent} /> : <Text style={p.body}>{L('This topic could not be loaded. Pull down to try again.', 'Temaet kunne ikke lastes inn. Dra ned for å prøve igjen.')}</Text>}</View>;
  } else if (!topic) {
    body = <View style={[p.card, p.empty]}><Text style={p.emptyTitle}>{L('This topic no longer exists', 'Dette temaet finnes ikke lenger')}</Text></View>;
  } else {
    const mastery = calculateTopicMastery({ ...topic, daysSinceLastStudy: topic.daysSinceStudy });
    const activities = data.activities.filter((item) => String(item.topicId) === topicId)
      .sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime());
    const studyMinutes = Math.round(activities.reduce((sum, item) => sum + Math.max(0, item.durationSeconds || 0), 0) / 60);
    const cards = data.cards.filter((card) => String(card.topicId) === topicId);
    const now = Date.now();
    const dueCards = cards.filter((card) => !card.nextReviewAt || !(new Date(card.nextReviewAt).getTime() > now)).length;
    const questions = data.recallQuestions[topicId] ?? [];
    const again = questions.reduce((sum, item) => sum + (item.againCount ?? 0), 0);
    const hard = questions.reduce((sum, item) => sum + (item.hardCount ?? 0), 0);
    const troubled = [...questions]
      .filter((item) => (item.againCount ?? 0) + (item.hardCount ?? 0) > 0)
      .sort((a, b) => (b.againCount ?? 0) + (b.hardCount ?? 0) - ((a.againCount ?? 0) + (a.hardCount ?? 0)))
      .slice(0, 4);
    const missed = data.quizResults.filter((result) => String(result.topicId) === topicId)
      .sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime())
      .flatMap((result) => result.missedQuestions ?? [])
      .slice(0, 4);
    const exam = data.exams[subjectId];
    const inExam = Boolean(exam?.topicIds?.map(String).includes(topicId));
    const examDays = exam && inExam ? getDaysUntil(exam.date, todayKey) : -1;
    const study = data.preferences;
    const methods = study.preferredMethods.filter((method) =>
      (method !== 'review' || study.includeReviewSessions) && (method !== 'flashcards' || study.includeFlashcards) && (method !== 'quiz' || study.includeQuizzes));

    const parts = [
      { key: 'quiz', icon: 'quiz' as const, label: 'Quiz', value: mastery.parts.quiz, detail: topic.quizQuestions ? L(`${topic.quizCorrect} of ${topic.quizQuestions} correct`, `${topic.quizCorrect} av ${topic.quizQuestions} riktig`) : L('No quiz answers yet', 'Ingen quizsvar ennå') },
      { key: 'recall', icon: 'brain' as const, label: 'Active Recall', value: mastery.parts.recall, detail: L(`${topic.activeRecallQuestions} answered · ${again + hard} hard`, `${topic.activeRecallQuestions} besvart · ${again + hard} vanskelige`) },
      { key: 'cards', icon: 'cards' as const, label: 'Flashcards', value: mastery.parts.cards, detail: L(`${topic.flashcardsReviewed} reviewed · ${dueCards} due`, `${topic.flashcardsReviewed} repetert · ${dueCards} forfalt`) },
      { key: 'days', icon: 'calendar' as const, label: L('Study days', 'Studiedager'), value: mastery.parts.days, detail: L(`${topic.studyDays} days · ${formatStudyTime(studyMinutes, language)}`, `${topic.studyDays} dager · ${formatStudyTime(studyMinutes, language)}`) },
    ];

    async function analyze() {
      if (!topic || aiLoading) return;
      const id = ++request.current;
      setAILoading(true);
      setAIError('');
      try {
        const result = await getAITopicInsight({
          language,
          topic: { id: topicId, name: topicName, subjectName: topic.subjectName },
          metrics: {
            practiceProgress: topic.practiceProgress,
            quizAccuracy: topic.quizAccuracy,
            quizQuestions: topic.quizQuestions,
            quizCorrect: topic.quizCorrect,
            activeRecallQuestions: topic.activeRecallQuestions,
            activeRecallAgain: again,
            activeRecallHard: hard,
            flashcardsTotal: cards.length,
            flashcardsReviewed: topic.flashcardsReviewed,
            flashcardsDue: dueCards,
            studySessions: activities.length,
            studyMinutes,
            lastStudiedAt: topic.lastStudiedAt,
            daysUntilExam: examDays >= 0 ? examDays : null,
            troubledQuestions: [
              ...troubled.map((item) => item.question.slice(0, 300)),
              ...missed.map((item) => `Recent quiz miss: ${item.question.slice(0, 260)}`),
            ].slice(0, 10),
          },
          preferredMethods: methods,
        });
        if (id === request.current) setInsight(result);
      } catch (error) {
        if (id === request.current) setAIError(error instanceof Error ? error.message : L('The review could not be made. Try again.', 'Vurderingen kunne ikke lages. Prøv igjen.'));
      } finally {
        if (id === request.current) setAILoading(false);
      }
    }

    function describe(activity: StudyActivity) {
      const count = Math.max(0, activity.questionCount || 0);
      switch (activity.activity) {
        case 'quiz': return { title: 'Quiz', detail: count ? `${activity.correctCount ?? 0}/${count} ${L('correct', 'riktig')}` : '' };
        case 'active_recall': return { title: 'Active Recall', detail: `${count} ${L('questions', 'spørsmål')}` };
        case 'review': return { title: L('Flashcard review', 'Repetisjon'), detail: `${count} ${L('cards', 'kort')}` };
        case 'flashcards': return { title: 'Flashcards', detail: `${count} ${L('cards', 'kort')}` };
        default: return { title: L('Focus session', 'Fokusøkt'), detail: formatStudyTime(Math.round((activity.durationSeconds || 0) / 60), language) };
      }
    }

    body = (
      <>
        <View>
          <Text style={styles.title} accessibilityRole="header" numberOfLines={2}>{topicName}</Text>
          <Text style={styles.subtitle} numberOfLines={1}>{[topic.subjectName, inExam && examDays >= 0 ? (examDays === 0 ? L('Exam today', 'Eksamen i dag') : L(`Exam in ${examDays} days`, `Eksamen om ${examDays} dager`)) : ''].filter(Boolean).join(' · ')}</Text>
        </View>

        <View style={p.card}>
          <View style={p.cardHeader}>
            <Text style={p.cardTitle}>{L('Topic progress', 'Fremgang i temaet')}</Text>
            <Text style={styles.percent}>{topic.practiceProgress}%</Text>
          </View>
          <ProgressBar value={topic.practiceProgress} color={palette.accent} trackColor={palette.track} height={9} />
          {topic.fadedPoints > 0 ? <Text style={styles.fading}>{L(`Down ${topic.fadedPoints} points: not studied for ${topic.daysSinceStudy} days.`, `Ned ${topic.fadedPoints} poeng: ikke studert på ${topic.daysSinceStudy} dager.`)}</Text> : null}
          <Text style={p.small}>{L(`Grows with how much you practise and how well it goes. The topic is completed at ${MASTERED_AT}%. This is a practice measure, not an exam prediction.`, `Vokser med hvor mye du øver og hvor godt det går. Temaet er fullført ved ${MASTERED_AT} %. Dette er et mål på øving, ikke en spådom om eksamen.`)}</Text>
        </View>

        <SectionHeader title={L('What builds your progress', 'Hva som bygger fremgangen')} />
        <View style={[p.card, styles.list]}>
          {parts.map((part, index) => (
            <View key={part.key} style={[styles.part, index > 0 && styles.divider]}>
              <IconChip name={part.icon} size={18} />
              <View style={p.grow}>
                <View style={styles.partTop}>
                  <Text style={[styles.rowTitle, p.grow]}>{part.label}</Text>
                  <Text style={styles.partValue}>{part.value}%</Text>
                </View>
                <View style={styles.partBar}><ProgressBar value={part.value} color={iconTint(part.icon, palette)} trackColor={palette.track} height={6} /></View>
                <Text style={p.small}>{part.detail}</Text>
              </View>
            </View>
          ))}
        </View>

        <View style={p.card}>
          <View style={p.row}>
            <IconChip name="sparkles" />
            <View style={p.grow}>
              <Text style={styles.rowTitle}>{L('AI review of this topic', 'AI-vurdering av temaet')}</Text>
              <Text style={p.small}>{L('Based only on your saved results, ratings and exam date.', 'Bygger bare på resultatene, vurderingene og eksamensdatoen du har lagret.')}</Text>
            </View>
          </View>
          {insight ? (
            <View style={[p.inset, styles.insight]}>
              <Text style={p.body}>{insight.overview}</Text>
              <Text style={styles.eyebrow}>{L('Suggested next step', 'Foreslått neste steg')}</Text>
              <Text style={styles.nextStep}>{insight.nextStep}</Text>
            </View>
          ) : null}
          {aiError ? <Text style={ui.formError}>{aiError}</Text> : null}
          <Pressable accessibilityRole="button" disabled={aiLoading} onPress={() => { void analyze(); }} style={({ pressed }) => [p.button, styles.buttonRow, { backgroundColor: palette.accent }, (pressed || aiLoading) && p.pressed]}>
            {aiLoading ? <ActivityIndicator color="#FFFFFF" /> : <StudyIcon name="sparkles" size={15} color="#FFFFFF" />}
            <Text style={p.buttonText}>{aiLoading ? L('Reviewing…', 'Vurderer …') : insight ? L('Review again', 'Vurder på nytt') : L('Review this topic', 'Vurder temaet')}</Text>
          </Pressable>
        </View>

        {troubled.length || missed.length ? (
          <>
            <SectionHeader title={L('Questions to revisit', 'Spørsmål å ta igjen')} action={L('Practise', 'Øv')} onAction={open('/subject/topic/study/active-recall')} />
            <View style={[p.card, styles.list]}>
              {troubled.map((item, index) => (
                <View key={`r-${item.id}`} style={[styles.question, index > 0 && styles.divider]}>
                  <Text style={styles.questionText}>{item.question}</Text>
                  <Text style={p.small}>Active Recall · {L('Again', 'Igjen')} {item.againCount ?? 0} · {L('Hard', 'Vanskelig')} {item.hardCount ?? 0}</Text>
                </View>
              ))}
              {missed.map((item, index) => (
                <View key={`q-${index}-${item.question}`} style={[styles.question, (troubled.length > 0 || index > 0) && styles.divider]}>
                  <Text style={styles.questionText}>{item.question}</Text>
                  <Text style={p.small}>Quiz · {L('Correct answer:', 'Riktig svar:')} {item.correctAnswer}</Text>
                </View>
              ))}
            </View>
          </>
        ) : null}

        <SectionHeader title={L('History', 'Historikk')} />
        {activities.length === 0 ? (
          <View style={[p.card, p.empty]}><Text style={[p.body, studyStyles.centered]}>{L('Your sessions on this topic will show here.', 'Øktene dine i dette temaet vises her.')}</Text></View>
        ) : (
          <View style={[p.card, styles.list]}>
            {activities.slice(0, 8).map((activity, index) => {
              const text = describe(activity);
              const icon = ACTIVITY_ICON[activity.activity] ?? 'book';
              return (
                <View key={`${activity.id}-${activity.completedAt}`} style={[styles.history, index > 0 && styles.divider]}>
                  <StudyIcon name={icon} size={19} color={iconTint(icon, palette)} />
                  <View style={p.grow}>
                    <Text style={styles.rowTitle}>{text.title}</Text>
                    {text.detail ? <Text style={p.small}>{text.detail}</Text> : null}
                  </View>
                  <Text style={p.small}>{new Date(activity.completedAt).toLocaleDateString(locale, { day: 'numeric', month: 'short' })}</Text>
                </View>
              );
            })}
          </View>
        )}

        <Pressable accessibilityRole="button" onPress={open('/subject/topic/[id]')} style={({ pressed }) => [p.outlineButton, styles.buttonRow, pressed && p.pressed]}>
          <StudyIcon name="play" size={14} color={palette.accent} /><Text style={p.outlineButtonText}>{L('Continue studying', 'Fortsett å studere')}</Text>
        </Pressable>
      </>
    );
  }

  return (
    <SafeAreaView style={ui.container} edges={['top']}>
      <Stack.Screen options={{ headerShown: false }} />
      <PullToRefreshScrollView contentContainerStyle={studyStyles.content} showsVerticalScrollIndicator={false} onRefresh={reload}>
        <ScreenBar backLabel={L('Back', 'Tilbake')} />
        {body}
      </PullToRefreshScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  state: { alignItems: 'center', paddingVertical: 60 },
  title: { color: ink.primary, fontSize: 28, fontWeight: '800', letterSpacing: -0.4 },
  subtitle: { color: ink.secondary, fontSize: 14, marginTop: 2 },
  percent: { color: ink.primary, fontSize: 20, fontWeight: '800' },
  fading: { color: appColor('#9A6530', 'text'), fontSize: 12, fontWeight: '600', marginTop: -6 },
  buttonRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  list: { gap: 0, paddingVertical: 4 },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: appColor('#D8E6EC', 'border') },
  part: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  partTop: { flexDirection: 'row', alignItems: 'center' },
  partValue: { color: ink.primary, fontSize: 14, fontWeight: '800' },
  partBar: { marginVertical: 6 },
  rowTitle: { color: ink.primary, fontSize: 15, fontWeight: '700' },
  insight: { gap: 6 },
  eyebrow: { color: ink.muted, fontSize: 10, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase', marginTop: 4 },
  nextStep: { color: ink.primary, fontSize: 14, fontWeight: '700', lineHeight: 20 },
  question: { gap: 4, paddingVertical: 11 },
  questionText: { color: ink.primary, fontSize: 14, fontWeight: '600', lineHeight: 20 },
  history: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11 },
});
