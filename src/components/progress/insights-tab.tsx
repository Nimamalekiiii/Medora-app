import { IconChip } from '@/components/study/icon-chip';
import { ProgressBar } from '@/components/charts';
import { StudyIcon, type StudyIconName } from '@/components/study-icon';
import { appColor } from '@/constants/adaptive-color';
import type { AIProgressInsight } from '@/services/ai-api';
import { buildProgressInsights, type InsightKind } from '@/services/progress-insights';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { ink, p, useProgressPalette } from './theme';
import type { ProgressTabProps, TopicRef } from './types';

const INSIGHT_ICON: Record<InsightKind, StudyIconName> = {
  exam: 'calendar', fading: 'review', focus: 'target', start: 'book', improving: 'trend', declining: 'trend', first_quiz: 'quiz', consistency: 'clock', empty: 'layers',
};

export type AIReviewState = {
  insight: AIProgressInsight | null;
  loading: boolean;
  error: string | null;
  /** The study data has changed since the review was written. */
  stale: boolean;
  topic: TopicRef | null;
  onReview: () => void;
};

export function InsightsTab({ dashboard, metrics, language, openTopic, goToTab, ai }: ProgressTabProps & { ai: AIReviewState }) {
  const palette = useProgressPalette();
  const L = (en: string, no: string) => (language === 'no' ? no : en);
  const insights = buildProgressInsights(dashboard, metrics, language);
  const level = (accuracy: number) => (accuracy >= 70 ? 'strong' : accuracy >= 50 ? 'moderate' : 'weak') as keyof typeof palette.level;
  const levelLabel = { strong: L('Strong', 'Sterk'), moderate: L('Moderate', 'Middels'), weak: L('Needs attention', 'Trenger arbeid') };
  const rated = metrics.topics.filter((topic) => topic.quizAccuracy !== null).sort((a, b) => (b.quizAccuracy ?? 0) - (a.quizAccuracy ?? 0));
  const shownRated = rated.length <= 6 ? rated : [...rated.slice(0, 3), ...rated.slice(-3)];
  const { consistency, week } = metrics;

  return (
    <>
      <View style={p.card}>
        <View style={p.row}>
          <StudyIcon name="sparkles" size={24} color={palette.accent} />
          <View style={p.grow}>
            <Text style={p.cardTitle}>{L('AI study review', 'AI-vurdering av studiene')}</Text>
            <Text style={p.small}>{L('A written review of your saved progress with one next step.', 'En skriftlig vurdering av den lagrede fremgangen din, med ett neste steg.')}</Text>
          </View>
        </View>

        {ai.insight ? (
          <>
            <Text style={styles.aiText}>{ai.insight.overview}</Text>
            <View style={p.inset}>
              <Text style={styles.nextLabel}>{L('Next step', 'Neste steg')}</Text>
              <Text style={styles.aiText}>{ai.insight.nextStep}</Text>
            </View>
            {ai.topic ? (
              <Pressable accessibilityRole="button" onPress={() => ai.topic && openTopic(ai.topic)} style={({ pressed }) => [p.button, { backgroundColor: palette.accent }, pressed && p.pressed]}>
                <Text style={p.buttonText} numberOfLines={1}>{L('Study', 'Studer')} {ai.topic.name}</Text>
              </Pressable>
            ) : null}
            {ai.stale ? <Text style={p.small}>{L('Your study data has changed since this review was written.', 'Studiedataene dine har endret seg siden denne vurderingen ble skrevet.')}</Text> : null}
          </>
        ) : null}

        {ai.error ? <Text style={styles.error}>{ai.error}</Text> : null}

        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: ai.loading, busy: ai.loading }}
          disabled={ai.loading || metrics.statusCounts.total === 0}
          onPress={ai.onReview}
          style={({ pressed }) => [ai.insight ? p.outlineButton : [p.button, { backgroundColor: palette.accent }], (pressed || metrics.statusCounts.total === 0) && p.pressed]}
        >
          {ai.loading
            ? <ActivityIndicator color={ai.insight ? palette.accent : '#FFFFFF'} />
            : <Text style={ai.insight ? p.outlineButtonText : p.buttonText}>{ai.insight ? L('Update review', 'Oppdater vurderingen') : L('Review my progress', 'Vurder fremgangen min')}</Text>}
        </Pressable>
        <Text style={p.small}>{L('AI reads summaries of your activity, not your notes. It can be wrong and does not predict exam results.', 'AI leser oppsummeringer av aktiviteten din, ikke notatene dine. Den kan ta feil og spår ikke eksamensresultater.')}</Text>
      </View>

      <View style={p.card}>
        <Text style={p.cardTitle}>{L('From your numbers', 'Fra tallene dine')}</Text>
        {insights.map((item) => {
          const content = (
            <>
              <IconChip name={INSIGHT_ICON[item.kind]} size={19} />
              <View style={p.grow}>
                <Text style={styles.insightTitle}>{item.title}</Text>
                <Text style={p.body}>{item.text}</Text>
              </View>
              {item.topic ? <StudyIcon name="chevron" size={12} color={ink.muted} /> : null}
            </>
          );
          return item.topic
            ? <Pressable key={item.kind} accessibilityRole="button" onPress={() => item.topic && openTopic(item.topic)} style={({ pressed }) => [p.inset, p.row, pressed && p.pressed]}>{content}</Pressable>
            : <View key={item.kind} style={[p.inset, p.row]}>{content}</View>;
        })}
      </View>

      <View style={p.card}>
        <Text style={p.cardTitle}>{L('Strengths and weak areas', 'Styrker og svake områder')}</Text>
        {rated.length === 0 ? (
          <Text style={p.body}>{L('Topics appear here after their first quiz, ranked by quiz accuracy.', 'Temaer vises her etter sin første quiz, rangert etter treffprosent.')}</Text>
        ) : (
          <>
            <View style={styles.levels}>
              {(['strong', 'moderate', 'weak'] as const).map((key) => (
                <View key={key} style={styles.levelItem}><View style={[p.legendDot, { backgroundColor: palette.level[key] }]} /><Text style={p.small}>{levelLabel[key]}</Text></View>
              ))}
            </View>
            {shownRated.map((topic) => (
              <Pressable key={`${topic.subjectId}-${topic.id}`} accessibilityRole="button" accessibilityLabel={`${topic.name}: ${topic.quizAccuracy}%, ${levelLabel[level(topic.quizAccuracy ?? 0)]}`} onPress={() => openTopic(topic)} style={({ pressed }) => [styles.strengthRow, pressed && p.pressed]}>
                <Text style={styles.strengthName} numberOfLines={1}>{topic.name}</Text>
                <View style={styles.strengthBar}><ProgressBar value={topic.quizAccuracy ?? 0} color={palette.level[level(topic.quizAccuracy ?? 0)]} trackColor={palette.track} height={8} /></View>
                <Text style={styles.strengthValue}>{topic.quizAccuracy}%</Text>
              </Pressable>
            ))}
            <Text style={p.small}>{L('Based on quiz accuracy for each topic.', 'Basert på quiz-treffprosenten i hvert tema.')}</Text>
            <Pressable accessibilityRole="button" onPress={() => goToTab('topics')} style={({ pressed }) => [p.outlineButton, pressed && p.pressed]}>
              <Text style={p.outlineButtonText}>{L('View all topics', 'Se alle temaer')}</Text>
            </Pressable>
          </>
        )}
      </View>

      {metrics.missedQuestions.length > 0 ? (
        <View style={p.card}>
          <Text style={p.cardTitle}>{L('Questions to revisit', 'Spørsmål å øve mer på')}</Text>
          {metrics.missedQuestions.map((item) => (
            <Pressable key={`${item.topic.id}-${item.question}`} accessibilityRole="button" onPress={() => openTopic(item.topic)} style={({ pressed }) => [p.inset, pressed && p.pressed]}>
              <View style={styles.missedTop}>
                <Text style={styles.missedTopic} numberOfLines={1}>{item.topic.name}</Text>
                <Text style={p.small}>{L(`Missed ${item.times} ${item.times === 1 ? 'time' : 'times'}`, `Bommet ${item.times} ${item.times === 1 ? 'gang' : 'ganger'}`)}</Text>
              </View>
              <Text style={styles.missedQuestion}>{item.question}</Text>
              <Text style={p.body}><Text style={styles.missedLabel}>{L('Correct answer: ', 'Riktig svar: ')}</Text>{item.correctAnswer}</Text>
            </Pressable>
          ))}
          <Text style={p.small}>{L('From your quiz attempts. Tap a question to open its topic.', 'Fra quizforsøkene dine. Trykk på et spørsmål for å åpne temaet.')}</Text>
        </View>
      ) : null}

      <View style={p.card}>
        <View style={p.cardHeader}>
          <Text style={p.cardTitle}>{L('Study consistency', 'Studierytme')}</Text>
          <Text style={p.chip}>{L('Last 30 days', 'Siste 30 dager')}</Text>
        </View>
        <View style={styles.dots} accessible accessibilityRole="image" accessibilityLabel={L(`Studied ${consistency.studiedDays} of the last 30 days`, `Studerte ${consistency.studiedDays} av de siste 30 dagene`)}>
          {consistency.days.map((day) => (
            <View key={day.dateKey} style={[styles.dot, { backgroundColor: day.studied ? palette.accent : palette.track }, !day.studied && day.planned && { borderWidth: 1.5, borderColor: palette.accent, backgroundColor: 'transparent' }]} />
          ))}
        </View>
        <View style={styles.dotLegend}>
          <View style={styles.levelItem}><View style={[styles.dotKey, { backgroundColor: palette.accent }]} /><Text style={p.small}>{L('Studied', 'Studert')}</Text></View>
          <View style={styles.levelItem}><View style={[styles.dotKey, { borderWidth: 1.5, borderColor: palette.accent }]} /><Text style={p.small}>{L('Planned, not studied', 'Planlagt, ikke studert')}</Text></View>
        </View>
        <View style={styles.consistencyRow}>
          <View style={styles.levelItem}><StudyIcon name="calendar" size={15} color={ink.secondary} /><Text style={p.body}>{week.studyDays} {L('study days this week', 'studiedager denne uken')}</Text></View>
          {consistency.percent !== null ? <Text style={styles.consistencyValue}>{consistency.percent}% {L('of planned days', 'av planlagte dager')}</Text> : null}
        </View>
        <Text style={p.small}>{dashboard.currentStreak} {dashboard.currentStreak === 1 ? L('day', 'dag') : L('days', 'dager')} {L('in a row', 'på rad')} · {dashboard.allTimeStudyDays} {L('study days in total', 'studiedager totalt')}</Text>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  aiText: { color: ink.primary, fontSize: 14, lineHeight: 21 },
  nextLabel: { color: ink.muted, fontSize: 11, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 5 },
  error: { color: appColor('#A34338', 'text'), fontSize: 13, lineHeight: 19 },
  insightTitle: { color: ink.primary, fontSize: 14, fontWeight: '800', marginBottom: 2 },
  missedTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 5 },
  missedTopic: { flex: 1, color: ink.muted, fontSize: 11, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase' },
  missedQuestion: { color: ink.primary, fontSize: 14, fontWeight: '700', lineHeight: 20, marginBottom: 5 },
  missedLabel: { fontWeight: '700' },
  levels: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  levelItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  strengthRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 30 },
  strengthName: { width: '38%', color: ink.secondary, fontSize: 12 },
  strengthBar: { flex: 1 },
  strengthValue: { width: 38, color: ink.primary, fontSize: 12, fontWeight: '700', textAlign: 'right' },
  dots: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  dot: { width: 16, height: 16, borderRadius: 8 },
  dotLegend: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  dotKey: { width: 10, height: 10, borderRadius: 5 },
  consistencyRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  consistencyValue: { color: ink.primary, fontSize: 13, fontWeight: '700' },
});
