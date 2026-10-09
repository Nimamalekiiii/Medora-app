import { IconChip } from '@/components/study/icon-chip';
import { DonutChart, ProgressBar } from '@/components/charts';
import { ink, p, useProgressPalette } from '@/components/progress/theme';
import PullToRefreshScrollView from '@/components/pull-to-refresh-scroll-view';
import { MethodTile, ScreenBar, studyStyles } from '@/components/study/study-ui';
import { SubjectGlyph } from '@/components/study/subject-glyph';
import { StudyIcon } from '@/components/study-icon';
import { appColor } from '@/constants/adaptive-color';
import { ui } from '@/constants/ui';
import { useStudyData } from '@/hooks/use-study-data';
import { useAppSettings } from '@/services/app-settings-context';
import { getDaysUntil, keyToDate } from '@/services/dates';
import { formatStudyTime } from '@/services/progress-metrics';
import { deleteSubjectAndData } from '@/services/storage';
import { buildSubjectPlan, resolveStudyPlan } from '@/services/subject-plan';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const param = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] ?? '' : value ?? '');

/** A subject's home: overall progress, ways to study, the exam and the study plan. */
export default function SubjectScreen() {
  const params = useLocalSearchParams<{ id?: string | string[]; name?: string | string[] }>();
  const subjectId = param(params.id);
  const { preferences } = useAppSettings();
  const language = preferences.language;
  const L = (en: string, no: string) => (language === 'no' ? no : en);
  const locale = language === 'no' ? 'nb-NO' : 'en-GB';
  const palette = useProgressPalette();
  const { loading, data, metrics, todayKey, reload } = useStudyData();

  const subjectIndex = data?.subjects.findIndex((item) => String(item.id) === subjectId) ?? -1;
  const subject = subjectIndex >= 0 ? data?.subjects[subjectIndex] : undefined;
  const subjectName = subject?.name ?? (param(params.name) || L('Subject', 'Emne'));
  const routeParams = { id: subjectId, name: subjectName };

  const openTopics = (tab?: string) => router.push({ pathname: '/subject/study', params: tab ? { ...routeParams, tab } : routeParams });
  const openExam = () => router.push({ pathname: '/subject/exam', params: routeParams });
  const openPlan = () => router.push({ pathname: '/subject/study-plan', params: routeParams });

  function confirmDelete() {
    if (!subject) return;
    Alert.alert(
      L('Delete subject?', 'Slette emnet?'),
      L(
        `This removes ${subjectName} with its topics, exam, study history, quizzes and flashcards. A recovery copy is kept under Profile.`,
        `Dette fjerner ${subjectName} med temaer, eksamen, studiehistorikk, quizer og flashcards. En gjenopprettingskopi ligger under Profil.`,
      ),
      [
        { text: L('Cancel', 'Avbryt'), style: 'cancel' },
        {
          text: L('Delete', 'Slett'),
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteSubjectAndData(subject.id);
              router.back();
            } catch (error) {
              console.warn('Could not remove subject data:', error);
              Alert.alert(L('Could not finish deleting', 'Kunne ikke fullføre slettingen'), L('A recovery copy was made first. Check Profile before trying again.', 'En gjenopprettingskopi ble laget først. Sjekk Profil før du prøver igjen.'));
            }
          },
        },
      ],
    );
  }

  function openMenu() {
    Alert.alert(subjectName, undefined, [
      { text: L('Add or edit topics', 'Legg til eller endre temaer'), onPress: () => openTopics() },
      { text: L('Exam', 'Eksamen'), onPress: openExam },
      { text: L('Study plan', 'Studieplan'), onPress: openPlan },
      { text: L('Delete subject', 'Slett emnet'), style: 'destructive', onPress: confirmDelete },
      { text: L('Cancel', 'Avbryt'), style: 'cancel' },
    ]);
  }

  let body;
  if (!data || !metrics) {
    body = <View style={styles.state}>{loading ? <ActivityIndicator color={palette.accent} /> : <Text style={p.body}>{L('This subject could not be loaded. Pull down to try again.', 'Emnet kunne ikke lastes inn. Dra ned for å prøve igjen.')}</Text>}</View>;
  } else if (!subject) {
    body = <View style={[p.card, p.empty]}><Text style={p.emptyTitle}>{L('This subject no longer exists', 'Dette emnet finnes ikke lenger')}</Text></View>;
  } else {
    const topics = metrics.topics.filter((topic) => topic.subjectId === subjectId);
    const summary = metrics.subjects.find((item) => item.subjectId === subjectId);
    const progress = summary?.progress ?? 0;
    const completed = topics.filter((topic) => topic.status === 'completed').length;
    const inProgress = topics.filter((topic) => topic.status === 'in_progress').length;
    const notStarted = topics.length - completed - inProgress;

    const exam = data.exams[subjectId];
    const examDays = exam ? getDaysUntil(exam.date, todayKey) : -1;
    const examText = examDays === 0 ? L('Exam today', 'Eksamen i dag') : examDays === 1 ? L('Exam tomorrow', 'Eksamen i morgen') : examDays > 1 ? L(`Exam in ${examDays} days`, `Eksamen om ${examDays} dager`) : '';
    const examDate = exam ? keyToDate(exam.date).toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' }) : '';

    const topicIds = new Set(topics.map((topic) => String(topic.id)));
    const cards = data.cards.filter((card) => topicIds.has(String(card.topicId)));
    const now = Date.now();
    const dueCards = cards.filter((card) => !card.nextReviewAt || !(new Date(card.nextReviewAt).getTime() > now)).length;
    const quizAttempts = data.quizResults.filter((result) => topicIds.has(String(result.topicId))).length;

    const weekly = resolveStudyPlan(data.plans[subjectId], data.preferences);
    const plan = buildSubjectPlan(topics, { studyDays: weekly.studyDays, examTopicIds: exam?.topicIds, days: 1 });
    const nextTopic = plan.today ?? plan.queue[0] ?? null;

    const legend = [
      { key: 'completed', label: L('Completed', 'Fullført'), value: completed, color: palette.status.completed },
      { key: 'inProgress', label: L('In progress', 'Påbegynt'), value: inProgress, color: palette.status.inProgress },
      { key: 'notStarted', label: L('Not started', 'Ikke startet'), value: notStarted, color: palette.status.notStarted },
    ];

    body = (
      <>
        <View style={styles.hero}>
          <SubjectGlyph name={subjectName} index={subjectIndex} size={68} />
          <View style={p.grow}>
            <Text style={styles.heroTitle} numberOfLines={2} accessibilityRole="header">{subjectName}</Text>
            <Text style={styles.heroDetail} numberOfLines={1}>{[`${topics.length} ${topics.length === 1 ? L('topic', 'tema') : L('topics', 'temaer')}`, examText].filter(Boolean).join(' · ')}</Text>
          </View>
        </View>

        {topics.length === 0 ? (
          <View style={[p.card, p.empty]}>
            <IconChip name="book" />
            <Text style={p.emptyTitle}>{L('Start by adding topics', 'Start med å legge til temaer')}</Text>
            <Text style={[p.body, studyStyles.centered]}>{L('Topics are what you study. AI can suggest them for this subject, or you can write your own.', 'Temaer er det du studerer. AI kan foreslå dem for emnet, eller du kan skrive dine egne.')}</Text>
            <Pressable accessibilityRole="button" onPress={() => openTopics()} style={({ pressed }) => [p.button, styles.wide, { backgroundColor: palette.accent }, pressed && p.pressed]}>
              <Text style={p.buttonText}>{L('Add topics', 'Legg til temaer')}</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <View style={p.card}>
              <Text style={p.cardTitle}>{L('Overall progress', 'Samlet fremgang')}</Text>
              <View style={styles.overview} accessible accessibilityLabel={L(`${progress}% overall. ${completed} completed, ${inProgress} in progress, ${notStarted} not started.`, `${progress}% samlet. ${completed} fullført, ${inProgress} påbegynt, ${notStarted} ikke startet.`)}>
                <DonutChart size={124} strokeWidth={12} trackColor={palette.track} segments={legend.map(({ key, value, color }) => ({ key, value, color }))}>
                  <Text style={styles.donutValue}>{progress}%</Text>
                  <Text style={styles.donutLabel}>{L(`${completed} of ${topics.length} topics`, `${completed} av ${topics.length} temaer`)}</Text>
                </DonutChart>
                <View style={styles.legend}>
                  {legend.map((item) => (
                    <View key={item.key} style={styles.legendRow}>
                      <View style={[p.legendDot, { backgroundColor: item.color }]} />
                      <Text style={styles.legendLabel}>{item.label}</Text>
                      <Text style={styles.legendValue}>{item.value}</Text>
                    </View>
                  ))}
                </View>
              </View>
            </View>

            <View style={studyStyles.tiles}>
              <MethodTile icon="book" title={L('Study', 'Studer')} detail={progress > 0 ? L('Continue learning', 'Fortsett å lære') : L('Start learning', 'Begynn å lære')} onPress={() => openTopics()} />
              <MethodTile icon="cards" title="Flashcards" detail={`${cards.length} ${L('cards', 'kort')}`} onPress={() => openTopics('flashcards')} />
              <MethodTile icon="quiz" title="Quiz" detail={quizAttempts ? `${quizAttempts} ${L('attempts', 'forsøk')}` : L('Test yourself', 'Test deg selv')} onPress={() => openTopics('quizzes')} />
              <MethodTile
                icon="review"
                title={L('Review', 'Repetisjon')}
                detail={dueCards ? `${dueCards} ${L('cards due', 'kort forfalt')}` : L('Nothing due now', 'Ingenting forfalt nå')}
                onPress={() => (dueCards ? router.push({ pathname: '/subject/topic/study/review', params: { subject: subjectId, name: subjectName } }) : openTopics('flashcards'))}
              />
            </View>

            {nextTopic ? (
              <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/subject/topic/[id]', params: { id: String(nextTopic.id), name: nextTopic.name, subjectId } })} style={({ pressed }) => [p.card, p.row, pressed && p.pressed]}>
                <IconChip name="sparkles" />
                <View style={p.grow}>
                  <Text style={styles.eyebrow}>{L('Suggested next', 'Foreslått nå')}</Text>
                  <Text style={styles.cardValue} numberOfLines={1}>{nextTopic.name}</Text>
                  <Text style={p.small}>{nextTopic.fadedPoints > 0
                    ? L('Not revised for a while, so it is starting to fade.', 'Ikke repetert på en stund, så det begynner å falme.')
                    : nextTopic.status === 'not_started' ? L('Not started yet.', 'Ikke startet ennå.')
                    : nextTopic.status === 'completed' ? L('Completed. A short revision keeps it there.', 'Fullført. En kort repetisjon holder det ved like.')
                    : L(`${nextTopic.practiceProgress}% done, the lowest of your started topics.`, `${nextTopic.practiceProgress}% ferdig, lavest av de påbegynte temaene.`)}</Text>
                </View>
                <StudyIcon name="chevron" size={12} color={ink.muted} />
              </Pressable>
            ) : null}
          </>
        )}

        <Pressable accessibilityRole="button" onPress={openExam} style={({ pressed }) => [p.card, p.row, pressed && p.pressed]}>
          <IconChip name="calendar" />
          <View style={p.grow}>
            <Text style={styles.eyebrow}>{L('Exam countdown', 'Nedtelling til eksamen')}</Text>
            {exam && examDays >= 0 ? (
              <>
                <Text style={styles.cardValue}>{examDays === 0 ? L('Today', 'I dag') : `${examDays} ${examDays === 1 ? L('day', 'dag') : L('days', 'dager')}`}</Text>
                <Text style={p.small}>{[examDate, exam.type].filter(Boolean).join(' · ')}</Text>
              </>
            ) : exam ? (
              <>
                <Text style={styles.cardValue}>{L('Exam date has passed', 'Eksamensdatoen er passert')}</Text>
                <Text style={p.small}>{examDate}</Text>
              </>
            ) : (
              <>
                <Text style={styles.cardValue}>{L('No exam planned', 'Ingen eksamen planlagt')}</Text>
                <Text style={p.small}>{L('Add the date and the topics it covers.', 'Legg inn dato og temaene som inngår.')}</Text>
              </>
            )}
          </View>
          <StudyIcon name="chevron" size={12} color={ink.muted} />
        </Pressable>

        <Pressable accessibilityRole="button" onPress={openPlan} style={({ pressed }) => [p.card, p.row, pressed && p.pressed]}>
          <IconChip name="clock" />
          <View style={p.grow}>
            <Text style={styles.eyebrow}>{L('Study plan', 'Studieplan')}</Text>
            <Text style={styles.cardValue}>{formatStudyTime(weekly.dailyStudyMinutes, language)} {L('per study day', 'per studiedag')}</Text>
            <Text style={p.small}>{weekly.studyDays.length} {weekly.studyDays.length === 1 ? L('study day a week', 'studiedag i uken') : L('study days a week', 'studiedager i uken')}</Text>
          </View>
          <StudyIcon name="chevron" size={12} color={ink.muted} />
        </Pressable>

        {topics.length > 0 ? (
          <View style={p.card}>
            <View style={p.cardHeader}>
              <Text style={p.cardTitle}>{L('Topics', 'Temaer')}</Text>
              <Pressable accessibilityRole="button" onPress={() => openTopics()} style={p.linkRow} hitSlop={8}>
                <Text style={p.link}>{L('See all', 'Se alle')}</Text>
                <StudyIcon name="chevron" size={11} color={ink.secondary} />
              </Pressable>
            </View>
            {plan.queue.slice(0, 3).map((topic) => (
              <View key={String(topic.id)} style={styles.topicLine}>
                <Text style={styles.topicName} numberOfLines={1}>{topic.name}</Text>
                <View style={styles.topicBar}><ProgressBar value={topic.practiceProgress} color={palette.accent} trackColor={palette.track} height={6} /></View>
                <Text style={styles.topicPercent}>{topic.practiceProgress}%</Text>
              </View>
            ))}
            <Text style={p.small}>{L('The topics that need the most work are shown first.', 'Temaene som trenger mest arbeid vises først.')}</Text>
          </View>
        ) : null}
      </>
    );
  }

  return (
    <SafeAreaView style={ui.container} edges={['top']}>
      <Stack.Screen options={{ headerShown: false }} />
      <PullToRefreshScrollView contentContainerStyle={studyStyles.content} showsVerticalScrollIndicator={false} onRefresh={reload}>
        <ScreenBar backLabel={L('Back', 'Tilbake')} onMenu={subject ? openMenu : undefined} menuLabel={L('More options', 'Flere valg')} />
        {body}
      </PullToRefreshScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  state: { alignItems: 'center', paddingVertical: 60 },
  wide: { alignSelf: 'stretch' },
  hero: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  heroTitle: { color: ink.primary, fontSize: 26, fontWeight: '800', letterSpacing: -0.4 },
  heroDetail: { color: ink.secondary, fontSize: 14, marginTop: 3 },
  overview: { flexDirection: 'row', alignItems: 'center', gap: 20 },
  donutValue: { color: ink.primary, fontSize: 24, fontWeight: '800' },
  donutLabel: { color: ink.muted, fontSize: 10, marginTop: 1 },
  legend: { flex: 1, gap: 12 },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  legendLabel: { flex: 1, color: ink.secondary, fontSize: 13 },
  legendValue: { color: ink.primary, fontSize: 14, fontWeight: '800' },
  eyebrow: { color: ink.muted, fontSize: 11, fontWeight: '600', marginBottom: 2 },
  cardValue: { color: ink.primary, fontSize: 18, fontWeight: '800' },
  topicLine: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  topicName: { width: '40%', color: ink.primary, fontSize: 13, fontWeight: '600' },
  topicBar: { flex: 1 },
  topicPercent: { width: 38, color: ink.secondary, fontSize: 12, fontWeight: '700', textAlign: 'right' },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: appColor('#D8E6EC', 'border') },
});
