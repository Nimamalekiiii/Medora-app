import { IconChip } from '@/components/study/icon-chip';
import { ProgressBar } from '@/components/charts';
import { StudyIcon } from '@/components/study-icon';
import { appColor } from '@/constants/adaptive-color';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ink, p, useProgressPalette } from './theme';
import type { ExamPace } from '@/services/progress-metrics';

import type { ProgressTabProps } from './types';

export function ExamsTab({ metrics, language }: ProgressTabProps) {
  const palette = useProgressPalette();
  const L = (en: string, no: string) => (language === 'no' ? no : en);
  const locale = language === 'no' ? 'nb-NO' : 'en-GB';

  function paceText(pace: ExamPace, remaining: number) {
    if (pace.kind === 'done') return L('All exam topics are completed.', 'Alle eksamenstemaer er fullført.');
    const left = `${remaining} ${remaining === 1 ? L('topic left', 'tema igjen') : L('topics left', 'temaer igjen')}`;
    if (pace.kind === 'today') return `${left}.`;
    if (pace.kind === 'perDay') return `${left}: ${L(`finish ${pace.topics} topics a day to be ready.`, `fullfør ${pace.topics} temaer om dagen for å rekke det.`)}`;
    return pace.days === 1
      ? `${left}: ${L('finish one topic a day to be ready.', 'fullfør ett tema om dagen for å rekke det.')}`
      : `${left}: ${L(`finish one topic every ${pace.days} days to be ready.`, `fullfør ett tema hver ${pace.days}. dag for å rekke det.`)}`;
  }

  if (metrics.exams.length === 0) {
    return (
      <View style={[p.card, p.empty]}>
        <IconChip name="calendar" />
        <Text style={p.emptyTitle}>{L('No upcoming exams', 'Ingen kommende eksamener')}</Text>
        <Text style={[p.body, styles.centered]}>{L('Open a subject and add its exam date to see the countdown and how ready you are.', 'Åpne et emne og legg til eksamensdatoen for å se nedtellingen og hvor klar du er.')}</Text>
        <Pressable accessibilityRole="button" onPress={() => router.push('/(tabs)/subjects')} style={({ pressed }) => [p.button, { backgroundColor: palette.accent }, pressed && p.pressed]}>
          <Text style={p.buttonText}>{L('Go to subjects', 'Gå til emner')}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <>
      {metrics.exams.map((exam) => {
        const started = exam.includedTopics > 0 ? `${exam.coveredTopics} ${L('of', 'av')} ${exam.includedTopics} ${L('exam topics started', 'eksamenstemaer påbegynt')}` : L('No topics chosen for this exam yet', 'Ingen temaer er valgt for denne eksamenen ennå');
        return (
          <Pressable
            key={`${exam.subjectId}-${exam.exam.date}`}
            accessibilityRole="button"
            accessibilityLabel={`${exam.subjectName}, ${exam.daysUntil} ${L('days left', 'dager igjen')}`}
            onPress={() => router.push({ pathname: '/subject/exam', params: { id: exam.subjectId, name: exam.subjectName } })}
            style={({ pressed }) => [p.card, pressed && p.pressed]}
          >
            <View style={p.row}>
              <IconChip name="calendar" />
              <View style={p.grow}>
                <Text style={styles.name} numberOfLines={1}>{exam.subjectName}</Text>
                <Text style={p.small}>{new Date(`${exam.exam.date}T00:00:00`).toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' })}</Text>
                {exam.exam.type ? <Text style={p.small} numberOfLines={1}>{exam.exam.type}</Text> : null}
              </View>
              <View style={styles.countdown}>
                <Text style={styles.countdownValue}>{exam.daysUntil}</Text>
                <Text style={p.small}>{exam.daysUntil === 0 ? L('today', 'i dag') : exam.daysUntil === 1 ? L('day left', 'dag igjen') : L('days left', 'dager igjen')}</Text>
              </View>
            </View>
            <View>
              <View style={styles.readinessTop}>
                <Text style={styles.readinessLabel}>{L('Preparation', 'Forberedelse')}</Text>
                <Text style={styles.readinessValue}>{exam.readiness}%</Text>
              </View>
              <ProgressBar value={exam.readiness} color={palette.accent} trackColor={palette.track} height={8} />
              <Text style={[p.small, styles.started]}>{started}</Text>
            </View>
            {exam.totalTopics > 0 ? (
              <View style={[p.inset, styles.pace]}>
                <StudyIcon name={exam.pace.kind === 'done' ? 'check' : 'target'} size={17} color={palette.accent} />
                <Text style={[p.body, p.grow]}>{paceText(exam.pace, exam.remainingTopics)}</Text>
              </View>
            ) : null}
          </Pressable>
        );
      })}
      <Text style={[p.small, styles.footnote]}>
        {L('Preparation is the average progress of the topics in the exam. It is not a prediction of the result.', 'Forberedelse er gjennomsnittlig fremgang i temaene som inngår i eksamenen. Det er ikke en spådom om resultatet.')}
      </Text>
    </>
  );
}

const styles = StyleSheet.create({
  centered: { textAlign: 'center' },
  name: { color: ink.primary, fontSize: 16, fontWeight: '800' },
  countdown: { alignItems: 'center', minWidth: 66, paddingVertical: 8, paddingHorizontal: 8, borderRadius: 12, backgroundColor: appColor('#F4F8FA', 'background') },
  countdownValue: { color: ink.primary, fontSize: 22, fontWeight: '800' },
  readinessTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 7 },
  readinessLabel: { color: ink.secondary, fontSize: 12, fontWeight: '600' },
  readinessValue: { color: ink.primary, fontSize: 13, fontWeight: '800' },
  started: { marginTop: 7 },
  pace: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11 },
  footnote: { marginHorizontal: 4 },
});
