import { IconChip, iconTint } from '@/components/study/icon-chip';
import { ProgressBar } from '@/components/charts';
import { ink, p, useProgressPalette } from '@/components/progress/theme';
import PullToRefreshScrollView from '@/components/pull-to-refresh-scroll-view';
import { Hero, MethodTile, PillButton, ScreenBar, SectionHeader, studyStyles } from '@/components/study/study-ui';
import { TopicMaterialSheet, useTopicNotes } from '@/components/study/topic-notes';
import { StudyIcon, type StudyIconName } from '@/components/study-icon';
import { appColor } from '@/constants/adaptive-color';
import { ui } from '@/constants/ui';
import { useStudyData } from '@/hooks/use-study-data';
import { useAppSettings } from '@/services/app-settings-context';
import { getDaysUntil } from '@/services/dates';
import { formatStudyTime } from '@/services/progress-metrics';
import { MASTERED_AT, calculateTopicMastery } from '@/services/topic-mastery';
import type { StudyActivity } from '@/types/study';
import { Stack, router, useLocalSearchParams, type Href } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const param = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] ?? '' : value ?? '');

const ACTIVITY_ICON: Record<StudyActivity['activity'], StudyIconName> = {
  quiz: 'quiz', active_recall: 'brain', flashcards: 'cards', review: 'review', focus: 'timer',
};

/** A topic's study page: its own progress, the study methods and what was done recently. */
export default function TopicScreen() {
  const params = useLocalSearchParams<{ id?: string | string[]; name?: string | string[]; subjectId?: string | string[] }>();
  const topicId = param(params.id);
  const { preferences } = useAppSettings();
  const language = preferences.language;
  const L = (en: string, no: string) => (language === 'no' ? no : en);
  const palette = useProgressPalette();
  const { loading, data, metrics, todayKey, reload } = useStudyData();
  const topicNotes = useTopicNotes(topicId);
  const [materialVisible, setMaterialVisible] = useState(false);

  const topic = metrics?.topics.find((item) => String(item.id) === topicId && (!param(params.subjectId) || item.subjectId === param(params.subjectId)))
    ?? metrics?.topics.find((item) => String(item.id) === topicId);
  const topicName = topic?.name ?? (param(params.name) || L('Topic', 'Tema'));
  const subjectId = topic?.subjectId ?? param(params.subjectId);
  const subjectName = topic?.subjectName ?? '';
  const routeParams = { id: topicId, name: topicName, subjectId };

  const open = (pathname: string) => () => router.push({ pathname, params: routeParams } as Href);
  const openFlashcards = open('/subject/topic/flashcards');
  const openRecall = open('/subject/topic/study/active-recall');
  const openQuiz = open('/subject/topic/study/quiz');
  const openReview = open('/subject/topic/study/review');
  const openProgress = open('/subject/topic/progress');
  const openFocus = () => router.push({ pathname: '/focus', params: { ...routeParams, subjectName } } as Href);

  function openMenu() {
    Alert.alert(topicName, undefined, [
      { text: L('Detailed progress and AI review', 'Detaljert fremgang og AI-vurdering'), onPress: openProgress },
      { text: L('Focus timer', 'Fokustimer'), onPress: openFocus },
      { text: L('Cancel', 'Avbryt'), style: 'cancel' },
    ]);
  }

  function relativeTime(value: string) {
    const then = new Date(value).getTime();
    if (!Number.isFinite(then)) return '';
    const minutes = Math.max(0, Math.round((Date.now() - then) / 60_000));
    if (minutes < 1) return L('now', 'nå');
    if (minutes < 60) return L(`${minutes}m ago`, `${minutes} min siden`);
    const hours = Math.round(minutes / 60);
    if (hours < 24) return L(`${hours}h ago`, `${hours} t siden`);
    const days = Math.round(hours / 24);
    return L(`${days}d ago`, `${days} d siden`);
  }

  function describe(activity: StudyActivity) {
    const count = Math.max(0, activity.questionCount || 0);
    switch (activity.activity) {
      case 'quiz': {
        const score = count > 0 && activity.correctCount !== undefined ? ` · ${Math.round((activity.correctCount / count) * 100)}%` : '';
        return { title: 'Quiz', detail: `${count} ${L('questions', 'spørsmål')}${score}` };
      }
      case 'active_recall': return { title: L('Active recall', 'Aktiv gjenhenting'), detail: `${count} ${L('questions practised', 'spørsmål øvd på')}` };
      case 'review': return { title: L('Review', 'Repetisjon'), detail: `${count} ${L('cards reviewed', 'kort repetert')}` };
      case 'flashcards': return { title: 'Flashcards', detail: `${count} ${L('cards studied', 'kort gjennomgått')}` };
      default: return { title: L('Focus timer', 'Fokustimer'), detail: formatStudyTime(Math.round((activity.durationSeconds || 0) / 60), language) };
    }
  }

  let body;
  if (!data || !metrics) {
    body = <View style={styles.state}>{loading ? <ActivityIndicator color={palette.accent} /> : <Text style={p.body}>{L('This topic could not be loaded. Pull down to try again.', 'Temaet kunne ikke lastes inn. Dra ned for å prøve igjen.')}</Text>}</View>;
  } else if (!topic) {
    body = <View style={[p.card, p.empty]}><Text style={p.emptyTitle}>{L('This topic no longer exists', 'Dette temaet finnes ikke lenger')}</Text></View>;
  } else {
    const activities = data.activities.filter((activity) => String(activity.topicId) === topicId)
      .sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime());
    const studyMinutes = Math.round(activities.reduce((total, activity) => total + Math.max(0, activity.durationSeconds || 0), 0) / 60);
    const quizAttempts = data.quizResults.filter((result) => String(result.topicId) === topicId).length;
    const cards = data.cards.filter((card) => String(card.topicId) === topicId);
    const now = Date.now();
    const dueCards = cards.filter((card) => !card.nextReviewAt || new Date(card.nextReviewAt).getTime() <= now).length;
    const recallQuestions = data.recallQuestions[topicId] ?? [];
    const mastery = calculateTopicMastery({ ...topic, daysSinceLastStudy: topic.daysSinceStudy });

    const exam = data.exams[subjectId];
    const inExam = Boolean(exam?.topicIds?.map(String).includes(topicId));
    const examDays = exam && inExam ? getDaysUntil(exam.date, todayKey) : -1;

    // The one thing most worth doing next on this topic.
    const next: { title: string; detail: string; onPress: () => void } =
      dueCards > 0 ? { title: L('Review due flashcards', 'Repeter flashcards som har forfalt'), detail: L(`${dueCards} cards are ready for review.`, `${dueCards} kort er klare for repetisjon.`), onPress: openReview }
      : topic.fadedPoints > 0 ? { title: L('Revise this topic', 'Repeter dette temaet'), detail: L(`Not studied for ${topic.daysSinceStudy} days. A quiz brings the progress back.`, `Ikke studert på ${topic.daysSinceStudy} dager. En quiz henter fremgangen tilbake.`), onPress: openQuiz }
      : mastery.parts.recall === 0 ? { title: L('Start with active recall', 'Start med aktiv gjenhenting'), detail: L('Retrieve what you know before testing yourself.', 'Hent frem det du kan før du tester deg selv.'), onPress: openRecall }
      : topic.quizAccuracy === null ? { title: L('Take your first quiz', 'Ta din første quiz'), detail: L('See how much of the topic you know.', 'Se hvor mye av temaet du kan.'), onPress: openQuiz }
      : cards.length === 0 ? { title: L('Create flashcards', 'Lag flashcards'), detail: L('Cards make the facts stick over time.', 'Kort får fakta til å sitte over tid.'), onPress: openFlashcards }
      : topic.quizAccuracy < 70 ? { title: L('Quiz your weak areas', 'Ta quiz på det du er svak på'), detail: L(`Your quiz accuracy is ${topic.quizAccuracy}%.`, `Quiz-treffprosenten din er ${topic.quizAccuracy}%.`), onPress: openQuiz }
      : { title: L('Keep practising', 'Fortsett å øve'), detail: L('Another quiz keeps this topic strong.', 'En ny quiz holder temaet ved like.'), onPress: openQuiz };

    const parts: { key: string; label: string; value: number }[] = [
      { key: 'quiz', label: 'Quiz', value: mastery.parts.quiz },
      { key: 'recall', label: L('Active recall', 'Aktiv gjenhenting'), value: mastery.parts.recall },
      { key: 'cards', label: 'Flashcards', value: mastery.parts.cards },
      { key: 'days', label: L('Study days', 'Studiedager'), value: mastery.parts.days },
    ];

    body = (
      <>
        <Hero icon={topic.status === 'completed' ? 'check' : 'book'} title={topicName} detail={subjectName} />

        {inExam && examDays >= 0 ? (
          <View style={[p.inset, p.row]}>
            <StudyIcon name="calendar" size={18} color={palette.accent} />
            <Text style={[p.body, p.grow]}>{examDays === 0 ? L('In the exam today', 'Med i eksamen i dag') : L(`In the exam in ${examDays} days`, `Med i eksamen om ${examDays} dager`)}{exam?.type ? ` · ${exam.type}` : ''}</Text>
          </View>
        ) : null}

        <View style={p.card}>
          <View style={p.cardHeader}>
            <Text style={p.cardTitle}>{L('Topic progress', 'Fremgang i temaet')}</Text>
            <Text style={styles.percent}>{topic.practiceProgress}%</Text>
          </View>
          <ProgressBar value={topic.practiceProgress} color={palette.accent} trackColor={palette.track} height={9} />
          {topic.fadedPoints > 0 ? <Text style={styles.fading}>{L(`Down ${topic.fadedPoints} points: not studied for ${topic.daysSinceStudy} days.`, `Ned ${topic.fadedPoints} poeng: ikke studert på ${topic.daysSinceStudy} dager.`)}</Text> : null}
          <View style={styles.stats}>
            <View style={styles.stat}><Text style={styles.statValue}>{topic.flashcardsReviewed}</Text><Text style={styles.statLabel}>{L('Cards reviewed', 'Kort repetert')}</Text></View>
            <View style={styles.statDivider} />
            <View style={styles.stat}><Text style={styles.statValue}>{quizAttempts}</Text><Text style={styles.statLabel}>{L('Quiz attempts', 'Quizforsøk')}</Text></View>
            <View style={styles.statDivider} />
            <View style={styles.stat}><Text style={styles.statValue}>{formatStudyTime(studyMinutes, language)}</Text><Text style={styles.statLabel}>{L('Study time', 'Studietid')}</Text></View>
          </View>
          <Pressable accessibilityRole="button" onPress={next.onPress} style={({ pressed }) => [p.button, styles.continue, { backgroundColor: palette.accent }, pressed && p.pressed]}>
            <StudyIcon name="play" size={15} color="#FFFFFF" />
            <Text style={p.buttonText}>{activities.length ? L('Continue learning', 'Fortsett å lære') : L('Start learning', 'Begynn å lære')}</Text>
          </Pressable>
        </View>

        <Pressable accessibilityRole="button" onPress={() => { void topicNotes.load(); setMaterialVisible(true); }} style={({ pressed }) => [p.card, p.row, pressed && p.pressed]}>
          <IconChip name="note" />
          <View style={p.grow}>
            <Text style={styles.activityTitle}>{L('Course material', 'Pensum')}</Text>
            <Text style={p.small}>{topicNotes.savedLength
              ? L('Saved. AI uses it for flashcards, quizzes and Active Recall in this topic.', 'Lagret. AI bruker det til flashcards, quiz og Active Recall i dette temaet.')
              : L('Add notes or a PDF, and AI makes everything in this topic from your course.', 'Legg til notater eller en PDF, så lager AI alt i dette temaet ut fra pensumet ditt.')}</Text>
          </View>
          <StudyIcon name={topicNotes.savedLength ? 'check' : 'plus'} size={15} color={ink.muted} />
        </Pressable>

        <SectionHeader title={L('Study methods', 'Studiemetoder')} />
        <View style={studyStyles.tiles}>
          <MethodTile icon="cards" title="Flashcards" detail={cards.length ? `${cards.length} ${L('cards', 'kort')} · ${dueCards} ${L('due', 'forfalt')}` : L('Create or generate cards', 'Lag eller generer kort')} onPress={openFlashcards} />
          <MethodTile icon="brain" title={L('Active recall', 'Aktiv gjenhenting')} detail={recallQuestions.length ? `${recallQuestions.length} ${L('questions', 'spørsmål')}` : L('Practise questions', 'Øv på spørsmål')} onPress={openRecall} />
          <MethodTile icon="quiz" title="Quiz" detail={topic.quizAccuracy === null ? L('Test your knowledge', 'Test kunnskapen din') : `${topic.quizAccuracy}% ${L('correct', 'riktig')}`} onPress={openQuiz} />
          <MethodTile icon="review" title={L('Review', 'Repetisjon')} detail={dueCards ? `${dueCards} ${L('cards due', 'kort forfalt')}` : L('Nothing due now', 'Ingenting forfalt nå')} onPress={openReview} />
        </View>

        <View style={p.card}>
          <Text style={p.cardTitle}>{L('What builds your progress', 'Hva som bygger fremgangen')}</Text>
          {parts.map((part) => (
            <View key={part.key} style={styles.part}>
              <Text style={styles.partLabel} numberOfLines={1}>{part.label}</Text>
              <View style={p.grow}><ProgressBar value={part.value} color={palette.accent} trackColor={palette.track} height={7} /></View>
              <Text style={styles.partValue}>{part.value}%</Text>
            </View>
          ))}
          <Text style={p.small}>{L(`Each part fills as you practise more and get more right. The topic is completed at ${MASTERED_AT}%.`, `Hver del fylles når du øver mer og får mer riktig. Temaet er fullført ved ${MASTERED_AT} %.`)}</Text>
        </View>

        <SectionHeader title={L('Recent activity', 'Siste aktivitet')} action={activities.length > 4 ? L('See all', 'Se alle') : undefined} onAction={openProgress} />
        {activities.length === 0 ? (
          <View style={[p.card, p.empty]}><Text style={[p.body, studyStyles.centered]}>{L('Your sessions on this topic will show here.', 'Øktene dine i dette temaet vises her.')}</Text></View>
        ) : (
          <View style={[p.card, styles.activityCard]}>
            {activities.slice(0, 4).map((activity, index) => {
              const text = describe(activity);
              return (
                <View key={`${activity.id}-${activity.completedAt}`} style={[styles.activity, index > 0 && styles.activityDivider]}>
                  <StudyIcon name={ACTIVITY_ICON[activity.activity] ?? 'book'} size={19} color={iconTint(ACTIVITY_ICON[activity.activity] ?? 'book', palette)} />
                  <View style={p.grow}>
                    <Text style={styles.activityTitle}>{text.title}</Text>
                    <Text style={p.small}>{text.detail}</Text>
                  </View>
                  <Text style={p.small}>{relativeTime(activity.completedAt)}</Text>
                </View>
              );
            })}
          </View>
        )}

        <Pressable accessibilityRole="button" onPress={next.onPress} style={({ pressed }) => [p.card, p.row, pressed && p.pressed]}>
          <IconChip name="sparkles" />
          <View style={p.grow}>
            <Text style={styles.eyebrow}>{L('Suggested next step', 'Foreslått neste steg')}</Text>
            <Text style={styles.activityTitle}>{next.title}</Text>
            <Text style={p.small}>{next.detail}</Text>
          </View>
          <StudyIcon name="chevron" size={12} color={ink.muted} />
        </Pressable>

        <View style={[p.card, p.row]}>
          <View style={p.grow}>
            <Text style={styles.activityTitle}>{L('AI review of this topic', 'AI-vurdering av temaet')}</Text>
            <Text style={p.small}>{L('Quiz history, missed questions and a written review.', 'Quizhistorikk, bommede spørsmål og en skriftlig vurdering.')}</Text>
          </View>
          <PillButton label={L('Open', 'Åpne')} onPress={openProgress} />
        </View>
      </>
    );
  }

  return (
    <SafeAreaView style={ui.container} edges={['top']}>
      <Stack.Screen options={{ headerShown: false }} />
      <PullToRefreshScrollView contentContainerStyle={studyStyles.content} showsVerticalScrollIndicator={false} onRefresh={reload}>
        <ScreenBar backLabel={L('Back', 'Tilbake')} onMenu={openMenu} menuLabel={L('More options', 'Flere valg')} />
        {body}
      </PullToRefreshScrollView>
      <TopicMaterialSheet visible={materialVisible} onClose={() => setMaterialVisible(false)} state={topicNotes} topicName={topicName} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  state: { alignItems: 'center', paddingVertical: 60 },
  percent: { color: ink.primary, fontSize: 20, fontWeight: '800' },
  fading: { color: appColor('#9A6530', 'text'), fontSize: 12, fontWeight: '600', marginTop: -6 },
  stats: { flexDirection: 'row', alignItems: 'stretch' },
  stat: { flex: 1, alignItems: 'center', gap: 3, paddingHorizontal: 4 },
  statDivider: { width: StyleSheet.hairlineWidth, backgroundColor: appColor('#D8E6EC', 'border') },
  statValue: { color: ink.primary, fontSize: 18, fontWeight: '800' },
  statLabel: { color: ink.muted, fontSize: 11, textAlign: 'center' },
  continue: { flexDirection: 'row', gap: 8, minHeight: 52, borderRadius: 16 },
  part: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  partLabel: { width: '34%', color: ink.secondary, fontSize: 12 },
  partValue: { width: 38, color: ink.primary, fontSize: 12, fontWeight: '700', textAlign: 'right' },
  activityCard: { gap: 0, paddingVertical: 6 },
  activity: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11 },
  activityDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: appColor('#D8E6EC', 'border') },
  activityTitle: { color: ink.primary, fontSize: 14, fontWeight: '700' },
  eyebrow: { color: ink.muted, fontSize: 10, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 2 },
});
