import { cardShadow } from '@/components/gloss';
import { IconChip } from '@/components/study/icon-chip';
import { ProgressBar } from '@/components/charts';
import { StudyIcon } from '@/components/study-icon';
import { appColor } from '@/constants/adaptive-color';
import { STUDY_METHOD_COUNT, type TopicStatus } from '@/services/progress-metrics';
import { FADE_AFTER_DAYS, MASTERED_AT, MASTERY_TARGETS } from '@/services/topic-mastery';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { ink, p, useProgressPalette } from './theme';
import type { ProgressTabProps } from './types';

type StatusFilter = 'all' | TopicStatus;

export function TopicsTab({ metrics, language, openTopic }: ProgressTabProps) {
  const palette = useProgressPalette();
  const L = (en: string, no: string) => (language === 'no' ? no : en);
  const [subjectId, setSubjectId] = useState<string | null>(null);
  const [status, setStatus] = useState<StatusFilter>('all');

  const subjects = [...new Map(metrics.topics.map((topic) => [topic.subjectId, topic.subjectName])).entries()];
  // A subject that was deleted while it was selected falls back to all subjects.
  const activeSubject = subjectId !== null && subjects.some(([id]) => id === subjectId) ? subjectId : null;
  const inSubject = metrics.topics.filter((topic) => activeSubject === null || topic.subjectId === activeSubject);
  const visible = inSubject.filter((topic) => status === 'all' || topic.status === status);

  const filters: { key: StatusFilter; label: string; count: number }[] = [
    { key: 'all', label: L('All', 'Alle'), count: inSubject.length },
    { key: 'completed', label: L('Completed', 'Fullført'), count: inSubject.filter((topic) => topic.status === 'completed').length },
    { key: 'in_progress', label: L('In progress', 'Påbegynt'), count: inSubject.filter((topic) => topic.status === 'in_progress').length },
    { key: 'not_started', label: L('Not started', 'Ikke startet'), count: inSubject.filter((topic) => topic.status === 'not_started').length },
  ];

  function chooseSubject() {
    Alert.alert(L('Show topics from', 'Vis temaer fra'), undefined, [
      { text: L('All subjects', 'Alle emner'), onPress: () => setSubjectId(null) },
      ...subjects.map(([id, name]) => ({ text: name, onPress: () => setSubjectId(id) })),
      { text: L('Cancel', 'Avbryt'), style: 'cancel' as const },
    ]);
  }

  if (metrics.topics.length === 0) {
    return (
      <View style={[p.card, p.empty]}>
        <IconChip name="layers" />
        <Text style={p.emptyTitle}>{L('No topics yet', 'Ingen temaer ennå')}</Text>
        <Text style={[p.body, styles.centered]}>{L('Add topics to a subject to follow each one here.', 'Legg til temaer i et emne for å følge hvert av dem her.')}</Text>
        <Pressable accessibilityRole="button" onPress={() => router.push('/(tabs)/subjects')} style={({ pressed }) => [p.button, { backgroundColor: palette.accent }, pressed && p.pressed]}>
          <Text style={p.buttonText}>{L('Go to subjects', 'Gå til emner')}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <>
      {subjects.length > 1 ? (
        <Pressable accessibilityRole="button" accessibilityLabel={L('Choose subject', 'Velg emne')} onPress={chooseSubject} style={({ pressed }) => [styles.dropdown, pressed && p.pressed]}>
          <Text style={styles.dropdownText} numberOfLines={1}>{activeSubject === null ? L('All subjects', 'Alle emner') : subjects.find(([id]) => id === activeSubject)?.[1]}</Text>
          <StudyIcon name="chevronDown" size={13} color={ink.secondary} />
        </Pressable>
      ) : null}

      <View style={styles.filters}>
        {filters.map((filter) => {
          const selected = status === filter.key;
          return (
            <Pressable
              key={filter.key}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() => setStatus(filter.key)}
              style={({ pressed }) => [styles.filter, selected && { backgroundColor: palette.accent, borderColor: palette.accent }, pressed && p.pressed]}
            >
              <Text style={[styles.filterText, selected && styles.filterTextSelected]}>{filter.label} {filter.count}</Text>
            </Pressable>
          );
        })}
      </View>

      {visible.length === 0 ? (
        <View style={[p.card, p.empty]}><Text style={p.body}>{L('No topics match this filter.', 'Ingen temaer passer til dette filteret.')}</Text></View>
      ) : visible.map((topic) => (
        <Pressable
          key={`${topic.subjectId}-${topic.id}`}
          accessibilityRole="button"
          accessibilityLabel={`${topic.name}, ${topic.practiceProgress}%`}
          onPress={() => openTopic(topic)}
          style={({ pressed }) => [styles.topic, pressed && p.pressed]}
        >
          <IconChip name={topic.status === 'completed' ? 'check' : 'book'} size={19} />
          <View style={p.grow}>
            <View style={styles.topicTop}>
              <Text style={styles.topicName} numberOfLines={1}>{topic.name}</Text>
              <Text style={styles.topicPercent}>{topic.practiceProgress}%</Text>
            </View>
            <Text style={styles.topicSubject} numberOfLines={1}>{topic.subjectName}</Text>
            <View style={styles.topicBottom}>
              <View style={p.grow}><ProgressBar value={topic.practiceProgress} color={palette.accent} trackColor={palette.track} /></View>
              <Text style={styles.topicMeta}>
                {topic.status === 'not_started' ? L('Not started', 'Ikke startet') : `${topic.methodsDone} / ${STUDY_METHOD_COUNT} ${L('methods', 'metoder')}`}
              </Text>
            </View>
            {topic.fadedPoints > 0 && topic.daysSinceStudy !== null ? (
              <Text style={styles.fading}>
                {L(`Fading: not studied for ${topic.daysSinceStudy} days`, `Synker: ikke studert på ${topic.daysSinceStudy} dager`)}
              </Text>
            ) : null}
          </View>
          <StudyIcon name="chevron" size={12} color={ink.muted} />
        </Pressable>
      ))}

      <Text style={[p.small, styles.footnote]}>
        {L(
          `Progress grows with how much you practise and how well it goes. Full marks take about ${MASTERY_TARGETS.quizQuestions} quiz questions, ${MASTERY_TARGETS.recallAnswers} recall answers and ${MASTERY_TARGETS.cardReviews} flashcard reviews, spread over ${MASTERY_TARGETS.studyDays} study days. A topic is completed at ${MASTERED_AT}%. Progress fades slowly when a topic has not been studied for ${FADE_AFTER_DAYS} days, and returns when you revise.`,
          `Fremgangen øker med hvor mye du øver og hvor godt det går. Full uttelling krever omtrent ${MASTERY_TARGETS.quizQuestions} quizspørsmål, ${MASTERY_TARGETS.recallAnswers} gjenhentingssvar og ${MASTERY_TARGETS.cardReviews} flashcard-repetisjoner, fordelt på ${MASTERY_TARGETS.studyDays} studiedager. Et tema er fullført ved ${MASTERED_AT} %. Fremgangen synker sakte når et tema ikke er studert på ${FADE_AFTER_DAYS} dager, og kommer tilbake når du repeterer.`,
        )}
      </Text>
    </>
  );
}

const styles = StyleSheet.create({
  centered: { textAlign: 'center' },
  dropdown: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingHorizontal: 16, borderRadius: 14, backgroundColor: appColor('#FFFFFF', 'background'), borderWidth: 1, borderColor: appColor('#E7F0F4', 'border'), ...cardShadow },
  dropdownText: { flex: 1, color: ink.primary, fontSize: 14, fontWeight: '600' },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  filter: { minHeight: 38, justifyContent: 'center', paddingHorizontal: 13, borderRadius: 19, backgroundColor: appColor('#FFFFFF', 'background'), borderWidth: 1, borderColor: appColor('#E7F0F4', 'border'), ...cardShadow },
  filterText: { color: ink.secondary, fontSize: 12, fontWeight: '700' },
  filterTextSelected: { color: '#FFFFFF' },
  topic: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 18, backgroundColor: appColor('#FFFFFF', 'background'), borderWidth: 1, borderColor: appColor('#E7F0F4', 'border'), ...cardShadow },
  topicTop: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 },
  topicName: { flex: 1, color: ink.primary, fontSize: 15, fontWeight: '700' },
  topicPercent: { color: ink.primary, fontSize: 15, fontWeight: '800' },
  topicSubject: { color: ink.muted, fontSize: 12, marginTop: 2 },
  topicBottom: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 9 },
  topicMeta: { color: ink.muted, fontSize: 11, minWidth: 82, textAlign: 'right' },
  fading: { color: appColor('#9A6530', 'text'), fontSize: 11, fontWeight: '600', marginTop: 6 },
  footnote: { marginHorizontal: 4 },
});
