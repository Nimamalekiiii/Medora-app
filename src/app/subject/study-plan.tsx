import { IconChip } from '@/components/study/icon-chip';
import { ProgressBar } from '@/components/charts';
import { ink, p, useProgressPalette } from '@/components/progress/theme';
import PullToRefreshScrollView from '@/components/pull-to-refresh-scroll-view';
import { Chips, ScreenBar, SectionHeader, studyStyles } from '@/components/study/study-ui';
import { StudyIcon, type StudyIconName } from '@/components/study-icon';
import { appColor } from '@/constants/adaptive-color';
import { ui } from '@/constants/ui';
import { useStudyData } from '@/hooks/use-study-data';
import { useAppSettings } from '@/services/app-settings-context';
import { getDaysUntil, keyToDate } from '@/services/dates';
import { formatStudyTime, type ProgressTopic } from '@/services/progress-metrics';
import { saveStudyPlanForSubject } from '@/services/storage';
import { buildSubjectPlan, countStudyDaysUntil, resolveStudyPlan, splitSessionMinutes } from '@/services/subject-plan';
import { Stack, router, useLocalSearchParams, type Href } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const param = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] ?? '' : value ?? '');
/** Monday first; values are Date.getDay() numbers. */
const WEEK = [1, 2, 3, 4, 5, 6, 0];
const DAY_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_NO = ['Søn', 'Man', 'Tir', 'Ons', 'Tor', 'Fre', 'Lør'];
const TIME_CHOICES = [30, 45, 60, 90, 120, 180];

/** A subject's study plan: what to study today, the coming days, and the weekly routine. */
export default function StudyPlanScreen() {
  const params = useLocalSearchParams<{ id?: string | string[]; name?: string | string[] }>();
  const subjectId = param(params.id);
  const { preferences } = useAppSettings();
  const language = preferences.language;
  const L = (en: string, no: string) => (language === 'no' ? no : en);
  const locale = language === 'no' ? 'nb-NO' : 'en-GB';
  const dayNames = language === 'no' ? DAY_NO : DAY_EN;
  const palette = useProgressPalette();
  const { loading, data, metrics, todayKey, reload } = useStudyData();

  const subject = data?.subjects.find((item) => String(item.id) === subjectId);
  const subjectName = subject?.name ?? (param(params.name) || L('Subject', 'Emne'));
  const routeParams = { id: subjectId, name: subjectName };

  // Editing the weekly routine.
  const [editing, setEditing] = useState(false);
  const [draftDays, setDraftDays] = useState<number[]>([]);
  const [draftMinutes, setDraftMinutes] = useState(60);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const weekly = data ? resolveStudyPlan(data.plans[subjectId], data.preferences) : { studyDays: [1, 2, 3, 4, 5], dailyStudyMinutes: 60 };

  function openEditor() {
    setDraftDays([...weekly.studyDays]);
    setDraftMinutes(weekly.dailyStudyMinutes);
    setFormError('');
    setEditing(true);
  }

  async function saveRoutine() {
    if (saving || !subjectId) return;
    if (draftDays.length === 0) {
      setFormError(L('Choose at least one study day.', 'Velg minst én studiedag.'));
      return;
    }
    setSaving(true);
    try {
      await saveStudyPlanForSubject(subjectId, { studyDays: [...draftDays].sort((a, b) => a - b), dailyStudyMinutes: draftMinutes });
      await reload();
      setEditing(false);
    } catch (error) {
      console.warn('Could not save the study plan:', error);
      setFormError(L('The plan could not be saved. Try again.', 'Planen kunne ikke lagres. Prøv igjen.'));
    } finally {
      setSaving(false);
    }
  }

  const toggleDay = (day: number) => { setFormError(''); setDraftDays((current) => (current.includes(day) ? current.filter((item) => item !== day) : [...current, day])); };

  const editor = (
    <Modal visible={editing} transparent animationType="slide" onRequestClose={() => { if (!saving) setEditing(false); }}>
      <Pressable style={ui.modalBackdrop} onPress={() => { if (!saving) setEditing(false); }} accessibilityLabel={L('Cancel', 'Avbryt')}>
        <Pressable style={ui.modalCard} onPress={() => undefined} accessible={false}>
          <View style={ui.modalHeader}>
            <View style={ui.modalIcon}><StudyIcon name="sliders" size={18} color={palette.accent} /></View>
            <View style={ui.grow}>
              <Text style={ui.modalTitle}>{L('Weekly routine', 'Ukentlig rutine')}</Text>
              <Text style={ui.cardDescription} numberOfLines={1}>{subjectName}</Text>
            </View>
          </View>
          <Text style={ui.fieldLabel}>{L('STUDY DAYS', 'STUDIEDAGER')}</Text>
          <View style={styles.days}>
            {WEEK.map((day) => {
              const checked = draftDays.includes(day);
              return (
                <Pressable key={day} accessibilityRole="checkbox" accessibilityState={{ checked }} accessibilityLabel={dayNames[day]} onPress={() => toggleDay(day)} style={[styles.day, checked && { backgroundColor: palette.accent, borderColor: palette.accent }]}>
                  <Text style={[styles.dayText, checked && styles.dayTextOn]}>{dayNames[day]}</Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={ui.fieldLabel}>{L('TIME PER STUDY DAY', 'TID PER STUDIEDAG')}</Text>
          <Chips value={String(draftMinutes)} onChange={(value) => setDraftMinutes(Number(value))} items={[...new Set([...TIME_CHOICES, draftMinutes])].sort((a, b) => a - b).map((minutes) => ({ key: String(minutes), label: formatStudyTime(minutes, language) }))} />
          <Text style={p.small}>{L('This is for this subject only. Your overall daily goal is set under Settings.', 'Dette gjelder bare dette emnet. Det samlede dagsmålet ditt settes under Innstillinger.')}</Text>
          {formError ? <Text style={ui.formError}>{formError}</Text> : null}
          <View style={ui.modalActions}>
            <Pressable accessibilityRole="button" style={ui.secondaryButton} onPress={() => setEditing(false)} disabled={saving}><Text style={ui.secondaryButtonText}>{L('Cancel', 'Avbryt')}</Text></Pressable>
            <Pressable accessibilityRole="button" style={[ui.primaryButton, saving && ui.disabled]} onPress={() => { void saveRoutine(); }} disabled={saving}>
              {saving ? <ActivityIndicator color="#FFFFFF" /> : <Text style={ui.primaryButtonText}>{L('Save plan', 'Lagre planen')}</Text>}
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );

  let body;
  if (!data || !metrics) {
    body = <View style={styles.state}>{loading ? <ActivityIndicator color={palette.accent} /> : <Text style={p.body}>{L('The plan could not be loaded. Pull down to try again.', 'Planen kunne ikke lastes inn. Dra ned for å prøve igjen.')}</Text>}</View>;
  } else {
    const topics = metrics.topics.filter((topic) => topic.subjectId === subjectId);
    const exam = data.exams[subjectId] ?? null;
    const examDays = exam ? getDaysUntil(exam.date, todayKey) : -1;
    const plan = buildSubjectPlan(topics, {
      studyDays: weekly.studyDays,
      examTopicIds: exam?.topicIds,
      examDateKey: exam && examDays >= 0 ? exam.date : undefined,
      days: 5,
    });
    const minutes = splitSessionMinutes(weekly.dailyStudyMinutes);
    const remaining = plan.queue.filter((topic) => topic.status !== 'completed').length;
    const studyDaysLeft = exam && examDays >= 0 ? countStudyDaysUntil(exam.date, weekly.studyDays) : 0;
    const now = Date.now();

    const topicParams = (topic: ProgressTopic) => ({ id: String(topic.id), name: topic.name, subjectId });
    const openTopic = (topic: ProgressTopic) => router.push({ pathname: '/subject/topic/[id]', params: topicParams(topic) });
    const dueCards = (topic: ProgressTopic) => data.cards.filter((card) => String(card.topicId) === String(topic.id) && (!card.nextReviewAt || !(new Date(card.nextReviewAt).getTime() > now))).length;

    const reason = (topic: ProgressTopic) => (
      topic.fadedPoints > 0 ? L(`Not studied for ${topic.daysSinceStudy} days, so it is fading.`, `Ikke studert på ${topic.daysSinceStudy} dager, så det falmer.`)
      : topic.status === 'not_started' ? L('Not started yet.', 'Ikke startet ennå.')
      : topic.status === 'completed' ? L('Completed. A revision keeps it fresh.', 'Fullført. En repetisjon holder det ved like.')
      : L(`${topic.practiceProgress}% done, the lowest of your started topics.`, `${topic.practiceProgress}% ferdig, lavest av de påbegynte temaene.`)
    );

    const step = (icon: StudyIconName, title: string, detail: string, pathname: string, topic: ProgressTopic) => (
      <Pressable key={title} accessibilityRole="button" accessibilityLabel={`${title}. ${detail}`} onPress={() => router.push({ pathname, params: topicParams(topic) } as Href)} style={({ pressed }) => [styles.step, pressed && p.pressed]}>
        <IconChip name={icon} size={19} />
        <View style={p.grow}>
          <Text style={styles.stepTitle}>{title}</Text>
          <Text style={p.small}>{detail}</Text>
        </View>
        <StudyIcon name="chevron" size={12} color={ink.muted} />
      </Pressable>
    );

    let todayCard;
    if (topics.length === 0) {
      todayCard = (
        <View style={[p.card, p.empty]}>
          <IconChip name="book" />
          <Text style={p.emptyTitle}>{L('No topics to plan yet', 'Ingen temaer å planlegge ennå')}</Text>
          <Text style={[p.body, studyStyles.centered]}>{L('Add topics to this subject and the plan fills in by itself.', 'Legg til temaer i emnet, så fylles planen ut av seg selv.')}</Text>
          <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/subject/topics', params: routeParams })} style={({ pressed }) => [p.button, styles.wide, { backgroundColor: palette.accent }, pressed && p.pressed]}>
            <Text style={p.buttonText}>{L('Add topics', 'Legg til temaer')}</Text>
          </Pressable>
        </View>
      );
    } else if (plan.today) {
      const topic = plan.today;
      const due = dueCards(topic);
      todayCard = (
        <View style={p.card}>
          <View style={p.row}>
            <View style={p.grow}>
              <Text style={styles.eyebrow}>{L('Today', 'I dag')} · {formatStudyTime(weekly.dailyStudyMinutes, language)}</Text>
              <Text style={styles.focus} numberOfLines={2}>{topic.name}</Text>
              <Text style={p.small}>{reason(topic)}</Text>
            </View>
            <Text style={styles.percent}>{topic.practiceProgress}%</Text>
          </View>
          <ProgressBar value={topic.practiceProgress} color={palette.accent} trackColor={palette.track} height={7} />
          <View style={styles.steps}>
            {step('brain', L('1. Active Recall', '1. Active Recall'), L(`Answer from memory · ${minutes.recall} min`, `Svar fra hukommelsen · ${minutes.recall} min`), '/subject/topic/study/active-recall', topic)}
            {step('quiz', L('2. Quiz', '2. Quiz'), L(`Test yourself · ${minutes.quiz} min`, `Test deg selv · ${minutes.quiz} min`), '/subject/topic/study/quiz', topic)}
            {due > 0
              ? step('review', L('3. Review', '3. Repetisjon'), L(`${due} flashcards due · ${minutes.review} min`, `${due} flashcards har forfalt · ${minutes.review} min`), '/subject/topic/study/review', topic)
              : step('cards', L('3. Flashcards', '3. Flashcards'), L(`Go through the cards · ${minutes.review} min`, `Gå gjennom kortene · ${minutes.review} min`), '/subject/topic/flashcards', topic)}
          </View>
          <Pressable accessibilityRole="button" onPress={() => openTopic(topic)} style={({ pressed }) => [p.button, styles.buttonRow, { backgroundColor: palette.accent }, pressed && p.pressed]}>
            <StudyIcon name="play" size={15} color="#FFFFFF" /><Text style={p.buttonText}>{L('Open the topic', 'Åpne temaet')}</Text>
          </Pressable>
        </View>
      );
    } else {
      const next = plan.upcoming[0];
      todayCard = (
        <View style={[p.card, p.row]}>
          <IconChip name="check" />
          <View style={p.grow}>
            <Text style={styles.eyebrow}>{L('Today', 'I dag')}</Text>
            <Text style={styles.stepTitle}>{L('A day off from this subject', 'Fri fra dette emnet')}</Text>
            <Text style={p.small}>{next
              ? L(`Next: ${next.topic.name} on ${next.date.toLocaleDateString(locale, { weekday: 'long' })}.`, `Neste: ${next.topic.name} på ${next.date.toLocaleDateString(locale, { weekday: 'long' })}.`)
              : L('No study days are left in the plan.', 'Det er ingen studiedager igjen i planen.')}</Text>
          </View>
        </View>
      );
    }

    body = (
      <>
        {todayCard}

        {plan.upcoming.length > 0 ? (
          <>
            <SectionHeader title={L('Coming study days', 'Kommende studiedager')} />
            <View style={[p.card, styles.listCard]}>
              {plan.upcoming.map((day, index) => (
                <Pressable key={day.dateKey} accessibilityRole="button" accessibilityLabel={`${day.date.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' })}: ${day.topic.name}`} onPress={() => openTopic(day.topic)} style={({ pressed }) => [styles.upcoming, index > 0 && styles.divider, pressed && p.pressed]}>
                  <View style={styles.dateBox}>
                    <Text style={styles.dateDay}>{dayNames[day.date.getDay()]}</Text>
                    <Text style={styles.dateNumber}>{day.date.getDate()}</Text>
                  </View>
                  <View style={p.grow}>
                    <Text style={styles.stepTitle} numberOfLines={1}>{day.topic.name}</Text>
                    <Text style={p.small}>{day.topic.practiceProgress}% · {formatStudyTime(weekly.dailyStudyMinutes, language)}</Text>
                  </View>
                  <StudyIcon name="chevron" size={12} color={ink.muted} />
                </Pressable>
              ))}
            </View>
            <Text style={p.small}>{L('The plan follows your progress: topics that are fading or behind come first, and it changes as you study.', 'Planen følger fremgangen din: temaer som falmer eller ligger etter kommer først, og den endres når du studerer.')}</Text>
          </>
        ) : null}

        <SectionHeader title={L('Weekly routine', 'Ukentlig rutine')} action={L('Edit', 'Endre')} onAction={openEditor} />
        <View style={p.card}>
          <View style={styles.days} accessible accessibilityLabel={L(`Study days: ${WEEK.filter((day) => weekly.studyDays.includes(day)).map((day) => DAY_EN[day]).join(', ')}`, `Studiedager: ${WEEK.filter((day) => weekly.studyDays.includes(day)).map((day) => DAY_NO[day]).join(', ')}`)}>
            {WEEK.map((day) => {
              const on = weekly.studyDays.includes(day);
              return (
                <View key={day} style={[styles.day, on && { backgroundColor: palette.accent, borderColor: palette.accent }]}>
                  <Text style={[styles.dayText, on && styles.dayTextOn]}>{dayNames[day]}</Text>
                </View>
              );
            })}
          </View>
          <View style={p.row}>
            <StudyIcon name="clock" size={18} color={palette.accent} />
            <Text style={[p.body, p.grow]}>{formatStudyTime(weekly.dailyStudyMinutes, language)} {L('per study day', 'per studiedag')} · {formatStudyTime(weekly.dailyStudyMinutes * weekly.studyDays.length, language)} {L('a week', 'i uken')}</Text>
          </View>
        </View>

        <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/subject/exam', params: routeParams })} style={({ pressed }) => [p.card, p.row, pressed && p.pressed]}>
          <IconChip name="calendar" />
          <View style={p.grow}>
            <Text style={styles.eyebrow}>{L('Exam', 'Eksamen')}</Text>
            {exam && examDays >= 0 ? (
              <>
                <Text style={styles.stepTitle}>{examDays === 0 ? L('Today', 'I dag') : L(`In ${examDays} days`, `Om ${examDays} dager`)} · {keyToDate(exam.date).toLocaleDateString(locale, { day: 'numeric', month: 'long' })}</Text>
                <Text style={p.small}>{remaining === 0
                  ? L('Every exam topic is completed.', 'Alle eksamenstemaene er fullført.')
                  : L(`${remaining} ${remaining === 1 ? 'topic' : 'topics'} left · ${studyDaysLeft} study days left`, `${remaining} ${remaining === 1 ? 'tema' : 'temaer'} igjen · ${studyDaysLeft} studiedager igjen`)}</Text>
              </>
            ) : (
              <>
                <Text style={styles.stepTitle}>{exam ? L('Exam date has passed', 'Eksamensdatoen er passert') : L('No exam planned', 'Ingen eksamen planlagt')}</Text>
                <Text style={p.small}>{L('With an exam date, the plan counts down and only uses the exam topics.', 'Med eksamensdato teller planen ned og bruker bare eksamenstemaene.')}</Text>
              </>
            )}
          </View>
          <StudyIcon name="chevron" size={12} color={ink.muted} />
        </Pressable>
      </>
    );
  }

  return (
    <SafeAreaView style={ui.container} edges={['top']}>
      <Stack.Screen options={{ headerShown: false }} />
      <PullToRefreshScrollView contentContainerStyle={studyStyles.content} showsVerticalScrollIndicator={false} onRefresh={reload}>
        <ScreenBar backLabel={L('Back', 'Tilbake')} />
        <View>
          <Text style={styles.title} accessibilityRole="header">{L('Study plan', 'Studieplan')}</Text>
          <Text style={styles.subtitle} numberOfLines={1}>{subjectName}</Text>
        </View>
        {body}
      </PullToRefreshScrollView>
      {editor}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  title: { color: ink.primary, fontSize: 30, fontWeight: '800', letterSpacing: -0.4 },
  subtitle: { color: ink.secondary, fontSize: 14, marginTop: 2 },
  state: { alignItems: 'center', paddingVertical: 60 },
  wide: { alignSelf: 'stretch' },
  buttonRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  eyebrow: { color: ink.muted, fontSize: 11, fontWeight: '600', marginBottom: 2 },
  focus: { color: ink.primary, fontSize: 22, fontWeight: '800', letterSpacing: -0.3, marginBottom: 2 },
  percent: { color: ink.primary, fontSize: 20, fontWeight: '800' },
  steps: { gap: 8 },
  step: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderRadius: 16, backgroundColor: appColor('#F4F8FA', 'background') },
  stepTitle: { color: ink.primary, fontSize: 15, fontWeight: '700' },
  listCard: { gap: 0, paddingVertical: 4 },
  upcoming: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11 },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: appColor('#D8E6EC', 'border') },
  dateBox: { width: 46, alignItems: 'center' },
  dateDay: { color: ink.muted, fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },
  dateNumber: { color: ink.primary, fontSize: 18, fontWeight: '800' },
  days: { flexDirection: 'row', gap: 5 },
  day: { flex: 1, minHeight: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 12, borderWidth: 1, borderColor: appColor('#DDE8ED', 'border') },
  dayText: { color: ink.muted, fontSize: 12, fontWeight: '700' },
  dayTextOn: { color: '#FFFFFF' },
});
