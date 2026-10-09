import { cardShadow } from '@/components/gloss';
import { IconChip } from '@/components/study/icon-chip';
import { ProgressBar } from '@/components/charts';
import { ink, p, useProgressPalette } from '@/components/progress/theme';
import PullToRefreshScrollView from '@/components/pull-to-refresh-scroll-view';
import { Chips, ScreenBar, SectionHeader, studyStyles } from '@/components/study/study-ui';
import { TopicRing } from '@/components/study/subject-glyph';
import { StudyIcon } from '@/components/study-icon';
import { appColor } from '@/constants/adaptive-color';
import { ui } from '@/constants/ui';
import { useStudyData } from '@/hooks/use-study-data';
import { useAppSettings } from '@/services/app-settings-context';
import { dateToKey, getDaysUntil, keyToDate } from '@/services/dates';
import { getExamsBySubject, saveExamsBySubject } from '@/services/storage';
import { countStudyDaysUntil, orderPlanTopics, resolveStudyPlan } from '@/services/subject-plan';
import type { Exam } from '@/types/study';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const param = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] ?? '' : value ?? '');
/** Saved as written here, so existing exams keep working. */
const EXAM_TYPES = ['Written exam', 'Oral exam', 'Practical exam', 'Multiple choice', 'OSCE', 'Other'] as const;
const TYPE_NO: Record<string, string> = {
  'Written exam': 'Skriftlig', 'Oral exam': 'Muntlig', 'Practical exam': 'Praktisk', 'Multiple choice': 'Flervalg', OSCE: 'OSCE', Other: 'Annet',
};
const TYPE_EN: Record<string, string> = {
  'Written exam': 'Written', 'Oral exam': 'Oral', 'Practical exam': 'Practical', 'Multiple choice': 'Multiple choice', OSCE: 'OSCE', Other: 'Other',
};

const sameDay = (left: Date, right: Date) => left.getFullYear() === right.getFullYear() && left.getMonth() === right.getMonth() && left.getDate() === right.getDate();

/** A subject's exam: the countdown, how ready she is, the topics it covers, and editing it. */
export default function ExamScreen() {
  const params = useLocalSearchParams<{ id?: string | string[]; name?: string | string[] }>();
  const subjectId = param(params.id);
  const { preferences } = useAppSettings();
  const language = preferences.language;
  const L = (en: string, no: string) => (language === 'no' ? no : en);
  const locale = language === 'no' ? 'nb-NO' : 'en-GB';
  const palette = useProgressPalette();
  const { loading, data, metrics, todayKey, reload } = useStudyData();

  const subject = data?.subjects.find((item) => String(item.id) === subjectId);
  const subjectName = subject?.name ?? (param(params.name) || L('Subject', 'Emne'));
  const routeParams = { id: subjectId, name: subjectName };
  const exam = data?.exams[subjectId] ?? null;
  const topics = (metrics?.topics ?? []).filter((topic) => topic.subjectId === subjectId);

  // The editor.
  const [editing, setEditing] = useState(false);
  const [date, setDate] = useState(new Date());
  const [month, setMonth] = useState(new Date());
  const [type, setType] = useState<string>(EXAM_TYPES[0]);
  const [topicIds, setTopicIds] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);

  const typeLabel = (value: string) => (language === 'no' ? TYPE_NO[value] : TYPE_EN[value]) ?? value;

  function openEditor() {
    const start = exam ? keyToDate(exam.date) : new Date();
    setDate(start);
    setMonth(new Date(start.getFullYear(), start.getMonth(), 1));
    setType(exam?.type ?? EXAM_TYPES[0]);
    setTopicIds(exam ? [...exam.topicIds] : []);
    setSaveFailed(false);
    setEditing(true);
  }

  async function store(next: Exam | null) {
    const current = await getExamsBySubject();
    await saveExamsBySubject({ ...current, [subjectId]: next });
    await reload();
  }

  async function saveExam() {
    if (saving || !subjectId) return;
    setSaving(true);
    setSaveFailed(false);
    try {
      // Only keep topics that still exist.
      const existing = new Set(topics.map((topic) => topic.id));
      await store({ date: dateToKey(date), type, topicIds: topicIds.filter((id) => existing.has(id)) });
      setEditing(false);
    } catch (error) {
      console.warn('Could not save the exam:', error);
      setSaveFailed(true);
    } finally {
      setSaving(false);
    }
  }

  function confirmDelete() {
    Alert.alert(L('Delete exam?', 'Slette eksamen?'), L('This removes the date, the type and the chosen topics. Your topics and progress stay.', 'Dette fjerner dato, type og valgte temaer. Temaene og fremgangen din beholdes.'), [
      { text: L('Cancel', 'Avbryt'), style: 'cancel' },
      {
        text: L('Delete', 'Slett'),
        style: 'destructive',
        onPress: async () => {
          try {
            await store(null);
          } catch (error) {
            console.warn('Could not delete the exam:', error);
            Alert.alert(L('Could not delete', 'Kunne ikke slette'), L('Try again.', 'Prøv igjen.'));
          }
        },
      },
    ]);
  }

  const toggleTopic = (id: number) => setTopicIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));

  // ----- Calendar -----
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const firstWeekday = (new Date(year, monthIndex, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const cells: (number | null)[] = [...Array<null>(firstWeekday).fill(null), ...Array.from({ length: daysInMonth }, (_, index) => index + 1)];
  const weekdays = language === 'no' ? ['M', 'T', 'O', 'T', 'F', 'L', 'S'] : ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  const today = new Date();

  const editor = (
    <Modal visible={editing} transparent animationType="slide" onRequestClose={() => { if (!saving) setEditing(false); }}>
      <View style={ui.modalBackdrop}>
        <ScrollView style={styles.modalMax} contentContainerStyle={styles.modalScroll} showsVerticalScrollIndicator={false}>
          <View style={ui.modalCard}>
            <View style={ui.modalHeader}>
              <View style={ui.modalIcon}><StudyIcon name="calendar" size={18} color={palette.accent} /></View>
              <View style={ui.grow}>
                <Text style={ui.modalTitle}>{exam ? L('Edit exam', 'Endre eksamen') : L('Set up exam', 'Legg inn eksamen')}</Text>
                <Text style={ui.cardDescription} numberOfLines={1}>{subjectName}</Text>
              </View>
            </View>

            <Text style={ui.fieldLabel}>{L('DATE', 'DATO')}</Text>
            <View style={styles.calendar}>
              <View style={styles.calendarTop}>
                <Pressable accessibilityRole="button" accessibilityLabel={L('Previous month', 'Forrige måned')} onPress={() => setMonth(new Date(year, monthIndex - 1, 1))} style={({ pressed }) => [styles.arrow, pressed && p.pressed]} hitSlop={6}>
                  <StudyIcon name="chevronLeft" size={14} color={ink.secondary} />
                </Pressable>
                <Text style={styles.monthTitle}>{month.toLocaleDateString(locale, { month: 'long', year: 'numeric' })}</Text>
                <Pressable accessibilityRole="button" accessibilityLabel={L('Next month', 'Neste måned')} onPress={() => setMonth(new Date(year, monthIndex + 1, 1))} style={({ pressed }) => [styles.arrow, pressed && p.pressed]} hitSlop={6}>
                  <StudyIcon name="chevron" size={14} color={ink.secondary} />
                </Pressable>
              </View>
              <View style={styles.week}>
                {weekdays.map((label, index) => <Text key={`${label}-${index}`} style={styles.weekday}>{label}</Text>)}
              </View>
              <View style={styles.days}>
                {cells.map((day, index) => {
                  if (day === null) return <View key={`blank-${index}`} style={styles.day} />;
                  const cellDate = new Date(year, monthIndex, day);
                  const selected = sameDay(cellDate, date);
                  const isToday = sameDay(cellDate, today);
                  return (
                    <Pressable
                      key={day}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      accessibilityLabel={cellDate.toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' })}
                      onPress={() => setDate(cellDate)}
                      style={styles.day}
                    >
                      <View style={[styles.dayInner, selected && { backgroundColor: palette.accent }, !selected && isToday && { borderWidth: 1.5, borderColor: palette.accent }]}>
                        <Text style={[styles.dayText, selected && styles.dayTextOn]}>{day}</Text>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            </View>
            <Text style={p.small}>{date.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</Text>

            <Text style={ui.fieldLabel}>{L('TYPE', 'TYPE')}</Text>
            <Chips value={type} onChange={setType} items={EXAM_TYPES.map((value) => ({ key: value as string, label: typeLabel(value) }))} />

            <View style={styles.topicsTop}>
              <Text style={ui.fieldLabel}>{L('TOPICS IN THE EXAM', 'TEMAER TIL EKSAMEN')}</Text>
              {topics.length > 0 ? (
                <Pressable accessibilityRole="button" onPress={() => setTopicIds(topicIds.length === topics.length ? [] : topics.map((topic) => topic.id))} hitSlop={8}>
                  <Text style={[styles.selectAll, { color: palette.accent }]}>{topicIds.length === topics.length ? L('Clear', 'Fjern alle') : L('Select all', 'Velg alle')}</Text>
                </Pressable>
              ) : null}
            </View>
            {topics.length === 0 ? (
              <Text style={p.small}>{L('This subject has no topics yet. You can choose topics here once you have added them.', 'Emnet har ingen temaer ennå. Du kan velge temaer her når du har lagt dem til.')}</Text>
            ) : (
              <>
                {topics.map((topic) => {
                  const checked = topicIds.includes(topic.id);
                  return (
                    <Pressable key={topic.id} accessibilityRole="checkbox" accessibilityState={{ checked }} accessibilityLabel={topic.name} onPress={() => toggleTopic(topic.id)} style={({ pressed }) => [styles.check, pressed && p.pressed]}>
                      <View style={[styles.box, checked && { backgroundColor: palette.accent, borderColor: palette.accent }]}>
                        {checked ? <StudyIcon name="check" size={12} color="#FFFFFF" /> : null}
                      </View>
                      <Text style={styles.checkText} numberOfLines={1}>{topic.name}</Text>
                    </Pressable>
                  );
                })}
                <Text style={p.small}>{topicIds.length === 0 ? L('With none chosen, every topic in the subject counts.', 'Hvis ingen er valgt, teller alle temaene i emnet.') : L(`${topicIds.length} of ${topics.length} chosen.`, `${topicIds.length} av ${topics.length} valgt.`)}</Text>
              </>
            )}

            {saveFailed ? <Text style={ui.formError}>{L('The exam could not be saved. Try again.', 'Eksamen kunne ikke lagres. Prøv igjen.')}</Text> : null}
            <View style={ui.modalActions}>
              <Pressable accessibilityRole="button" style={ui.secondaryButton} onPress={() => setEditing(false)} disabled={saving}><Text style={ui.secondaryButtonText}>{L('Cancel', 'Avbryt')}</Text></Pressable>
              <Pressable accessibilityRole="button" style={[ui.primaryButton, saving && ui.disabled]} onPress={() => { void saveExam(); }} disabled={saving}>
                {saving ? <ActivityIndicator color="#FFFFFF" /> : <Text style={ui.primaryButtonText}>{L('Save exam', 'Lagre eksamen')}</Text>}
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );

  let body;
  if (!data || !metrics) {
    body = <View style={styles.state}>{loading ? <ActivityIndicator color={palette.accent} /> : <Text style={p.body}>{L('The exam could not be loaded. Pull down to try again.', 'Eksamen kunne ikke lastes inn. Dra ned for å prøve igjen.')}</Text>}</View>;
  } else if (!exam) {
    body = (
      <View style={[p.card, p.empty]}>
        <IconChip name="calendar" />
        <Text style={p.emptyTitle}>{L('No exam set', 'Ingen eksamen lagt inn')}</Text>
        <Text style={[p.body, studyStyles.centered]}>{L('Add the date and the topics it covers. The countdown, your readiness and the study plan follow from it.', 'Legg inn dato og temaene som inngår. Nedtelling, hvor klar du er og studieplanen følger av det.')}</Text>
        <Pressable accessibilityRole="button" onPress={openEditor} style={({ pressed }) => [p.button, styles.wide, { backgroundColor: palette.accent }, pressed && p.pressed]}>
          <Text style={p.buttonText}>{L('Set up exam', 'Legg inn eksamen')}</Text>
        </Pressable>
      </View>
    );
  } else {
    const days = getDaysUntil(exam.date, todayKey);
    const examTopics = orderPlanTopics(topics, exam.topicIds);
    const completed = examTopics.filter((topic) => topic.status === 'completed').length;
    const remaining = examTopics.length - completed;
    const readiness = metrics.exams.find((item) => item.subjectId === subjectId)?.readiness
      ?? (examTopics.length ? Math.round(examTopics.reduce((sum, topic) => sum + topic.practiceProgress, 0) / examTopics.length) : 0);
    const weekly = resolveStudyPlan(data.plans[subjectId], data.preferences);
    const studyDaysLeft = days >= 0 ? countStudyDaysUntil(exam.date, weekly.studyDays) : 0;
    const dateLabel = keyToDate(exam.date).toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

    let pace = '';
    if (days >= 0 && examTopics.length > 0) {
      if (remaining === 0) pace = L('Every exam topic is completed. Keep them fresh with short revisions.', 'Alle eksamenstemaene er fullført. Hold dem ved like med korte repetisjoner.');
      else if (studyDaysLeft === 0) pace = L(`${remaining} ${remaining === 1 ? 'topic is' : 'topics are'} not completed and there are no study days left in your plan.`, `${remaining} ${remaining === 1 ? 'tema er' : 'temaer er'} ikke fullført, og det er ingen studiedager igjen i planen.`);
      else if (remaining > studyDaysLeft) pace = L(`${remaining} topics left and ${studyDaysLeft} study days: about ${Math.ceil(remaining / studyDaysLeft)} topics per study day.`, `${remaining} temaer igjen og ${studyDaysLeft} studiedager: omtrent ${Math.ceil(remaining / studyDaysLeft)} temaer per studiedag.`);
      else pace = L(`${remaining} ${remaining === 1 ? 'topic' : 'topics'} left and ${studyDaysLeft} study days: about ${Math.floor(studyDaysLeft / remaining)} study ${Math.floor(studyDaysLeft / remaining) === 1 ? 'day' : 'days'} per topic.`, `${remaining} ${remaining === 1 ? 'tema' : 'temaer'} igjen og ${studyDaysLeft} studiedager: omtrent ${Math.floor(studyDaysLeft / remaining)} ${Math.floor(studyDaysLeft / remaining) === 1 ? 'studiedag' : 'studiedager'} per tema.`);
    }

    body = (
      <>
        <View style={[p.card, styles.countdown]}>
          <Text style={styles.eyebrow}>{days < 0 ? L('Exam date has passed', 'Eksamensdatoen er passert') : days === 0 ? L('Exam day', 'Eksamensdag') : L('Days until the exam', 'Dager til eksamen')}</Text>
          <Text style={styles.big}>{days < 0 ? '–' : days === 0 ? L('Today', 'I dag') : days}</Text>
          <Text style={styles.date}>{dateLabel}</Text>
          <Text style={p.chip}>{typeLabel(exam.type)}</Text>
        </View>

        {days >= 0 && examTopics.length > 0 ? (
          <View style={p.card}>
            <View style={p.cardHeader}>
              <Text style={p.cardTitle}>{L('Exam readiness', 'Klar til eksamen')}</Text>
              <Text style={styles.percent}>{readiness}%</Text>
            </View>
            <ProgressBar value={readiness} color={palette.accent} trackColor={palette.track} height={9} />
            <View style={styles.stats}>
              <View style={styles.stat}><Text style={styles.statValue}>{completed}/{examTopics.length}</Text><Text style={styles.statLabel}>{L('Topics completed', 'Temaer fullført')}</Text></View>
              <View style={styles.statDivider} />
              <View style={styles.stat}><Text style={styles.statValue}>{studyDaysLeft}</Text><Text style={styles.statLabel}>{L('Study days left', 'Studiedager igjen')}</Text></View>
            </View>
            {pace ? <View style={[p.inset, p.row]}><StudyIcon name="sparkles" size={17} color={palette.accent} /><Text style={[p.body, p.grow]}>{pace}</Text></View> : null}
            <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/subject/study-plan', params: routeParams })} style={({ pressed }) => [p.outlineButton, pressed && p.pressed]}>
              <Text style={p.outlineButtonText}>{L('Open study plan', 'Åpne studieplanen')}</Text>
            </Pressable>
          </View>
        ) : null}

        <SectionHeader
          title={exam.topicIds.length > 0 ? L(`Exam topics (${examTopics.length})`, `Eksamenstemaer (${examTopics.length})`) : L(`All topics count (${examTopics.length})`, `Alle temaer teller (${examTopics.length})`)}
          action={L('Edit', 'Endre')}
          onAction={openEditor}
        />
        {examTopics.length === 0 ? (
          <View style={[p.card, p.empty]}>
            <Text style={[p.body, studyStyles.centered]}>{L('This subject has no topics yet.', 'Emnet har ingen temaer ennå.')}</Text>
            <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/subject/topics', params: routeParams })} style={({ pressed }) => [p.button, styles.wide, { backgroundColor: palette.accent }, pressed && p.pressed]}>
              <Text style={p.buttonText}>{L('Add topics', 'Legg til temaer')}</Text>
            </Pressable>
          </View>
        ) : examTopics.map((topic) => (
          <Pressable key={topic.id} accessibilityRole="button" accessibilityLabel={`${topic.name}, ${topic.practiceProgress}%`} onPress={() => router.push({ pathname: '/subject/topic/[id]', params: { id: String(topic.id), name: topic.name, subjectId } })} style={({ pressed }) => [styles.topicRow, pressed && p.pressed]}>
            <TopicRing progress={topic.practiceProgress} completed={topic.status === 'completed'} />
            <View style={p.grow}>
              <Text style={styles.topicName} numberOfLines={1}>{topic.name}</Text>
              <Text style={styles.topicDetail}>
                {topic.status === 'completed' ? L('Completed', 'Fullført') : topic.status === 'in_progress' ? L('In progress', 'Påbegynt') : L('Not started', 'Ikke startet')} · {topic.practiceProgress}%
                {topic.fadedPoints > 0 ? ` · ${L('fading', 'falmer')}` : ''}
              </Text>
            </View>
            <StudyIcon name="chevron" size={12} color={ink.muted} />
          </Pressable>
        ))}
        {examTopics.length > 1 ? <Text style={p.small}>{L('The topics that need the most work are shown first.', 'Temaene som trenger mest arbeid vises først.')}</Text> : null}

        <Pressable accessibilityRole="button" onPress={openEditor} style={({ pressed }) => [p.button, styles.buttonRow, { backgroundColor: palette.accent }, pressed && p.pressed]}>
          <StudyIcon name="pencil" size={15} color="#FFFFFF" /><Text style={p.buttonText}>{L('Edit exam', 'Endre eksamen')}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={confirmDelete} style={({ pressed }) => [styles.deleteButton, pressed && p.pressed]}>
          <Text style={styles.deleteText}>{L('Delete exam', 'Slett eksamen')}</Text>
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
          <Text style={styles.title} accessibilityRole="header">{L('Exam', 'Eksamen')}</Text>
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
  countdown: { alignItems: 'center', gap: 6, paddingVertical: 22 },
  eyebrow: { color: ink.muted, fontSize: 12, fontWeight: '600' },
  big: { color: ink.primary, fontSize: 56, fontWeight: '800', letterSpacing: -1.5, lineHeight: 62 },
  date: { color: ink.secondary, fontSize: 14, textAlign: 'center', marginBottom: 4 },
  percent: { color: ink.primary, fontSize: 20, fontWeight: '800' },
  stats: { flexDirection: 'row', alignItems: 'stretch' },
  stat: { flex: 1, alignItems: 'center', gap: 3 },
  statDivider: { width: StyleSheet.hairlineWidth, backgroundColor: appColor('#D8E6EC', 'border') },
  statValue: { color: ink.primary, fontSize: 19, fontWeight: '800' },
  statLabel: { color: ink.muted, fontSize: 11 },
  topicRow: { flexDirection: 'row', alignItems: 'center', gap: 13, padding: 13, borderRadius: 18, backgroundColor: appColor('#FFFFFF', 'background'), borderWidth: 1, borderColor: appColor('#E7F0F4', 'border'), ...cardShadow },
  topicName: { color: ink.primary, fontSize: 15, fontWeight: '700' },
  topicDetail: { color: ink.muted, fontSize: 12, marginTop: 3 },
  deleteButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  deleteText: { color: appColor('#A34338', 'text'), fontSize: 14, fontWeight: '700' },

  modalMax: { maxHeight: '94%' },
  modalScroll: { flexGrow: 1, justifyContent: 'flex-end' },
  calendar: { borderRadius: 16, padding: 10, backgroundColor: appColor('#FFFFFF', 'background'), borderWidth: 1, borderColor: appColor('#E7F0F4', 'border'), ...cardShadow },
  calendarTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  arrow: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: appColor('#F4F8FA', 'background') },
  monthTitle: { color: ink.primary, fontSize: 15, fontWeight: '800', textTransform: 'capitalize' },
  week: { flexDirection: 'row' },
  weekday: { width: '14.2857%', textAlign: 'center', color: ink.muted, fontSize: 11, fontWeight: '700', paddingVertical: 4 },
  days: { flexDirection: 'row', flexWrap: 'wrap' },
  day: { width: '14.2857%', height: 40, alignItems: 'center', justifyContent: 'center' },
  dayInner: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  dayText: { color: ink.primary, fontSize: 14, fontWeight: '600' },
  dayTextOn: { color: '#FFFFFF', fontWeight: '800' },
  topicsTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  selectAll: { fontSize: 13, fontWeight: '800' },
  check: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 42 },
  box: { width: 22, height: 22, borderRadius: 7, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: appColor('#B9CBD4', 'border') },
  checkText: { flex: 1, color: ink.primary, fontSize: 15 },
});
