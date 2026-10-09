import { cardShadow } from '@/components/gloss';
import { IconChip } from '@/components/study/icon-chip';
import { ProgressBar } from '@/components/charts';
import { ink, p, useProgressPalette } from '@/components/progress/theme';
import PullToRefreshScrollView from '@/components/pull-to-refresh-scroll-view';
import { PillButton, SectionHeader, StudyRow, studyStyles } from '@/components/study/study-ui';
import { SubjectGlyph } from '@/components/study/subject-glyph';
import { StudyIcon } from '@/components/study-icon';
import { appColor } from '@/constants/adaptive-color';
import { ui } from '@/constants/ui';
import { useStudyData } from '@/hooks/use-study-data';
import { useAppSettings } from '@/services/app-settings-context';
import { getDaysUntil } from '@/services/dates';
import { localizeAttentionReason } from '@/services/progress-ai';
import { formatStudyTime } from '@/services/progress-metrics';
import { Stack, router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type TopicRef = { id: number | string; name: string; subjectId: string; subjectName?: string };

export default function StudyTab() {
  const { preferences } = useAppSettings();
  const language = preferences.language;
  const L = (en: string, no: string) => (language === 'no' ? no : en);
  const palette = useProgressPalette();
  const { loading, data, dashboard, metrics, todayKey, reload } = useStudyData();
  const [query, setQuery] = useState('');

  const openTopic = (topic: TopicRef) => router.push({
    pathname: '/subject/topic/[id]',
    params: { id: String(topic.id), name: topic.name, subjectId: topic.subjectId, subjectName: topic.subjectName ?? '' },
  });
  const openSubject = (subject: { id: number | string; name: string }) => router.push({ pathname: '/subject/study', params: { id: String(subject.id), name: subject.name } });

  const header = (
    <>
      <View style={ui.headerRow}>
        <View style={ui.grow}>
          <Text style={ui.eyebrow}>MEDEXAM</Text>
          <Text style={ui.title} accessibilityRole="header">{L('Study', 'Studier')}</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel={L('Study preferences', 'Studiepreferanser')} onPress={() => router.push('/settings/study')} style={({ pressed }) => [styles.headerButton, pressed && ui.pressed]} hitSlop={6}>
          <StudyIcon name="settings" size={20} color={ink.secondary} />
        </Pressable>
      </View>
      <Text style={styles.subtitle}>{L('Choose a subject, open a topic and pick how you want to learn.', 'Velg et emne, åpne et tema og velg hvordan du vil lære.')}</Text>
      <View style={styles.search}>
        <StudyIcon name="search" size={18} color={ink.muted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={L('Search subjects and topics', 'Søk i emner og temaer')}
          placeholderTextColor={appColor('#91A2AE', 'text')}
          style={styles.searchInput}
          returnKeyType="search"
          autoCorrect={false}
          accessibilityLabel={L('Search subjects and topics', 'Søk i emner og temaer')}
        />
        {query ? (
          <Pressable accessibilityRole="button" accessibilityLabel={L('Clear search', 'Tøm søket')} onPress={() => setQuery('')} hitSlop={10}>
            <StudyIcon name="x" size={16} color={ink.muted} />
          </Pressable>
        ) : null}
      </View>
    </>
  );

  let body;
  if (!data || !dashboard || !metrics) {
    body = <View style={styles.state}>{loading ? <ActivityIndicator color={palette.accent} /> : <Text style={p.body}>{L('Your study library could not be loaded. Pull down to try again.', 'Studiebiblioteket kunne ikke lastes inn. Dra ned for å prøve igjen.')}</Text>}</View>;
  } else if (data.subjects.length === 0) {
    body = (
      <View style={[p.card, p.empty]}>
        <IconChip name="layers" />
        <Text style={p.emptyTitle}>{L('Your study library is empty', 'Studiebiblioteket ditt er tomt')}</Text>
        <Text style={[p.body, studyStyles.centered]}>{L('Add a subject and its topics to start studying.', 'Legg til et emne med temaer for å begynne å studere.')}</Text>
        <Pressable accessibilityRole="button" onPress={() => router.push('/(tabs)/subjects')} style={({ pressed }) => [p.button, { backgroundColor: palette.accent }, pressed && p.pressed]}>
          <Text style={p.buttonText}>{L('Add subjects', 'Legg til emner')}</Text>
        </Pressable>
      </View>
    );
  } else if (query.trim()) {
    const needle = query.trim().toLocaleLowerCase();
    const subjects = data.subjects.filter((subject) => subject.name.toLocaleLowerCase().includes(needle));
    const topics = metrics.topics.filter((topic) => topic.name.toLocaleLowerCase().includes(needle));
    body = subjects.length + topics.length === 0 ? (
      <View style={[p.card, p.empty]}><Text style={p.body}>{L('No subjects or topics match your search.', 'Ingen emner eller temaer passer til søket.')}</Text></View>
    ) : (
      <>
        {topics.length > 0 ? <SectionHeader title={L('Topics', 'Temaer')} /> : null}
        {topics.map((topic) => (
          <StudyRow key={`${topic.subjectId}-${topic.id}`} icon="book" title={topic.name} detail={`${topic.subjectName} · ${topic.practiceProgress}%`} progress={topic.practiceProgress} onPress={() => openTopic(topic)} />
        ))}
        {subjects.length > 0 ? <SectionHeader title={L('Subjects', 'Emner')} /> : null}
        {subjects.map((subject) => (
          <StudyRow key={String(subject.id)} icon="layers" leading={<SubjectGlyph name={subject.name} index={data.subjects.findIndex((item) => item.id === subject.id)} size={42} />} title={subject.name} detail={`${(data.topicsBySubject[String(subject.id)] ?? []).length} ${L('topics', 'temaer')}`} onPress={() => openSubject(subject)} />
        ))}
      </>
    );
  } else {
    const weekday = new Date(`${todayKey}T12:00:00`).getDay();
    const recommendation = dashboard.analysis.recommendations[0];
    const findTopic = (subjectId: string, topicId: string | number) => metrics.topics.find((topic) => topic.subjectId === subjectId && String(topic.id) === String(topicId));
    const recommended = recommendation ? findTopic(String(recommendation.subjectId), recommendation.topicId) : undefined;

    // Today's plan: a subject scheduled for today (nearest exam first), otherwise the recommended one.
    const examTime = (subjectId: string) => {
      const date = data.exams[subjectId]?.date;
      const days = date ? getDaysUntil(date, todayKey) : -1;
      return days >= 0 ? days : Number.MAX_SAFE_INTEGER;
    };
    const scheduled = data.subjects
      .filter((subject) => data.plans[String(subject.id)]?.studyDays.includes(weekday))
      .sort((a, b) => examTime(String(a.id)) - examTime(String(b.id)))[0];
    const planSubject = scheduled ?? (recommended ? data.subjects.find((subject) => String(subject.id) === recommended.subjectId) : undefined) ?? data.subjects[0];
    const planSubjectId = String(planSubject.id);
    const planRecommendation = dashboard.analysis.recommendations.find((item) => String(item.subjectId) === planSubjectId);
    const planTopic = (planRecommendation ? findTopic(planSubjectId, planRecommendation.topicId) : undefined) ?? metrics.topics.find((topic) => topic.subjectId === planSubjectId);
    const planMinutes = data.plans[planSubjectId]?.dailyStudyMinutes ?? data.preferences.dailyGoalMinutes;
    const doneToday = metrics.today.studyMinutes;
    const planPercent = planMinutes > 0 ? Math.min(100, Math.round((doneToday / planMinutes) * 100)) : 0;

    const lastStudied = [...metrics.topics].filter((topic) => topic.lastStudiedAt).sort((a, b) => new Date(b.lastStudiedAt ?? 0).getTime() - new Date(a.lastStudiedAt ?? 0).getTime())[0];
    const dueNow = metrics.reviewForecast[0]?.count ?? 0;
    const now = Date.now();
    const dueCards = data.cards.filter((card) => !card.nextReviewAt || new Date(card.nextReviewAt).getTime() <= now);
    const dueCardTopics = new Set(dueCards.map((card) => String(card.topicId))).size;

    body = (
      <>
        <View style={p.card}>
          <Pressable accessibilityRole="button" accessibilityLabel={L('Open study plan', 'Åpne studieplanen')} onPress={() => router.push({ pathname: '/subject/study-plan', params: { id: planSubjectId, name: planSubject.name } })} style={({ pressed }) => [p.row, pressed && p.pressed]}>
            <IconChip name="calendar" />
            <View style={p.grow}>
              <Text style={p.cardTitle}>{L("Today's study plan", 'Dagens studieplan')}</Text>
              <Text style={p.small} numberOfLines={1}>{planSubject.name} · {planMinutes} min</Text>
            </View>
            <StudyIcon name="chevron" size={12} color={ink.muted} />
          </Pressable>
          <View style={styles.planBottom}>
            <View style={p.grow}>
              <Text style={styles.planDone}>{formatStudyTime(doneToday, language)} {L('of', 'av')} {formatStudyTime(planMinutes, language)} {L('studied today', 'studert i dag')}</Text>
              <ProgressBar value={planPercent} color={palette.accent} trackColor={palette.track} height={7} />
            </View>
            {planTopic ? <PillButton label={doneToday > 0 ? L('Continue', 'Fortsett') : L('Start', 'Start')} onPress={() => openTopic(planTopic)} /> : null}
          </View>
          {planTopic ? <Text style={p.small} numberOfLines={1}>{L('Next up', 'Neste')}: {planTopic.name}</Text> : <Text style={p.small}>{L('Add topics to this subject to get a plan.', 'Legg til temaer i emnet for å få en plan.')}</Text>}
        </View>

        {lastStudied ? (
          <>
            <SectionHeader title={L('Continue studying', 'Fortsett å studere')} />
            <StudyRow icon="book" title={lastStudied.name} detail={`${lastStudied.subjectName} · ${lastStudied.practiceProgress}% ${L('complete', 'fullført')}`} progress={lastStudied.practiceProgress} onPress={() => openTopic(lastStudied)} />
          </>
        ) : null}

        {dueCards.length > 0 ? (
          <View style={[p.card, p.row]}>
            <IconChip name="cards" />
            <View style={p.grow}>
              <Text style={styles.cardRowTitle}>{L('Flashcards due today', 'Flashcards som forfaller i dag')}</Text>
              <Text style={p.small}>{dueCards.length} {dueCards.length === 1 ? L('card', 'kort') : L('cards', 'kort')} · {dueCardTopics} {dueCardTopics === 1 ? L('topic', 'tema') : L('topics', 'temaer')}</Text>
            </View>
            <PillButton label={L('Review', 'Repeter')} onPress={() => router.push({ pathname: '/subject/topic/study/review', params: { all: '1', name: L('Due flashcards', 'Flashcards som har forfalt') } })} />
          </View>
        ) : (
          <View style={[p.card, p.row]}>
            <IconChip name="check" />
            <View style={p.grow}>
              <Text style={styles.cardRowTitle}>{L('No flashcards due today', 'Ingen flashcards forfaller i dag')}</Text>
              <Text style={p.small}>{dueNow > 0 ? L(`${dueNow} recall questions are ready to practise.`, `${dueNow} gjenhentingsspørsmål er klare til øving.`) : L('Your review queue is clear.', 'Repetisjonskøen er tom.')}</Text>
            </View>
          </View>
        )}

        {recommended && recommendation ? (
          <Pressable accessibilityRole="button" onPress={() => openTopic(recommended)} style={({ pressed }) => [p.card, p.row, pressed && p.pressed]}>
            <IconChip name="sparkles" />
            <View style={p.grow}>
              <Text style={styles.eyebrow}>{L('Recommended next', 'Anbefalt neste')}</Text>
              <Text style={styles.cardRowTitle} numberOfLines={1}>{recommended.name}</Text>
              <Text style={p.small} numberOfLines={2}>{localizeAttentionReason(recommendation.reason, language)}</Text>
            </View>
            <StudyIcon name="chevron" size={12} color={ink.muted} />
          </Pressable>
        ) : null}

        <SectionHeader title={L('Your subjects', 'Emnene dine')} action={L('Manage', 'Administrer')} onAction={() => router.push('/(tabs)/subjects')} />
        {data.subjects.map((subject) => {
          const subjectId = String(subject.id);
          const summary = metrics.subjects.find((item) => item.subjectId === subjectId);
          const topicCount = (data.topicsBySubject[subjectId] ?? []).length;
          const examDate = data.exams[subjectId]?.date;
          const examDays = examDate ? getDaysUntil(examDate, todayKey) : -1;
          const examText = examDays === 0 ? L('Exam today', 'Eksamen i dag') : examDays > 0 ? L(`Exam in ${examDays} days`, `Eksamen om ${examDays} dager`) : '';
          return (
            <StudyRow
              key={subjectId}
              icon="layers"
              leading={<SubjectGlyph name={subject.name} index={data.subjects.findIndex((item) => item.id === subject.id)} size={42} />}
              title={subject.name}
              detail={[`${topicCount} ${topicCount === 1 ? L('topic', 'tema') : L('topics', 'temaer')}`, examText].filter(Boolean).join(' · ')}
              progress={summary?.progress ?? 0}
              onPress={() => openSubject(subject)}
            />
          );
        })}
      </>
    );
  }

  return (
    <SafeAreaView style={ui.container} edges={['top']}>
      <Stack.Screen options={{ headerShown: false }} />
      <PullToRefreshScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} onRefresh={reload} keyboardShouldPersistTaps="handled">
        {header}
        {body}
      </PullToRefreshScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 36, gap: 14 },
  subtitle: { color: appColor('#718493', 'text'), fontSize: 15, lineHeight: 21, marginTop: -8 },
  headerButton: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: appColor('#FFFFFF', 'background'), borderWidth: 1, borderColor: appColor('#E7F0F4', 'border'), ...cardShadow },
  search: { minHeight: 50, flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 16, paddingHorizontal: 14, backgroundColor: appColor('#FFFFFF', 'background'), borderWidth: 1, borderColor: appColor('#E7F0F4', 'border'), ...cardShadow },
  searchInput: { flex: 1, minHeight: 48, color: ink.primary, fontSize: 15 },
  state: { alignItems: 'center', paddingVertical: 60 },
  planBottom: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  planDone: { color: ink.secondary, fontSize: 12, fontWeight: '600', marginBottom: 7 },
  cardRowTitle: { color: ink.primary, fontSize: 15, fontWeight: '700' },
  eyebrow: { color: ink.muted, fontSize: 10, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 2 },
});
