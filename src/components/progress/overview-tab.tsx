import { cardShadow } from '@/components/gloss';
import { IconChip } from '@/components/study/icon-chip';
import { BarChart, DonutChart, PercentLineChart, ProgressBar } from '@/components/charts';
import { StudyIcon, type StudyIconName } from '@/components/study-icon';
import { appColor } from '@/constants/adaptive-color';
import { formatStudyTime, formatStudyTimeCompact, percentChange, type MethodKey } from '@/services/progress-metrics';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ink, p, useProgressPalette } from './theme';
import type { ProgressTabProps } from './types';

const METHOD_ORDER: MethodKey[] = ['quiz', 'active_recall', 'flashcards', 'review', 'focus'];

/** A small "up 15 %" or "down 4 %" note beside a figure. */
function Change({ value, unit, language }: { value: number | null; unit: '%' | 'pts'; language: 'en' | 'no' }) {
  if (value === null || value === 0) return null;
  const up = value > 0;
  const suffix = unit === '%' ? '%' : language === 'no' ? ' poeng' : ' pts';
  return (
    <Text style={[styles.change, { color: up ? appColor('#1E7B4F', 'text') : appColor('#A34338', 'text') }]}>
      {up ? '↑' : '↓'} {Math.abs(value)}{suffix}
    </Text>
  );
}

export function OverviewTab({ dashboard, metrics, language, openTopic, goToTab }: ProgressTabProps) {
  const palette = useProgressPalette();
  const L = (en: string, no: string) => (language === 'no' ? no : en);
  const locale = language === 'no' ? 'nb-NO' : 'en-GB';
  const { statusCounts, week, quiz, methods30Days } = metrics;

  const statusRows = [
    { key: 'completed', label: L('Completed', 'Fullført'), count: statusCounts.completed, color: palette.status.completed },
    { key: 'inProgress', label: L('In progress', 'Påbegynt'), count: statusCounts.inProgress, color: palette.status.inProgress },
    { key: 'notStarted', label: L('Not started', 'Ikke startet'), count: statusCounts.notStarted, color: palette.status.notStarted },
  ];

  const tiles: { icon: StudyIconName; value: number; label: string }[] = [
    { icon: 'check', value: statusCounts.completed, label: L('Completed topics', 'Fullførte temaer') },
    { icon: 'book', value: statusCounts.inProgress, label: L('In progress', 'Påbegynt') },
    { icon: 'layers', value: statusCounts.notStarted, label: L('Not started', 'Ikke startet') },
    { icon: 'clock', value: week.sessions, label: L('Sessions this week', 'Økter denne uken') },
  ];

  const methodLabels: Record<MethodKey, string> = {
    quiz: L('Quizzes', 'Quizer'),
    active_recall: L('Active recall', 'Aktiv gjenhenting'),
    flashcards: 'Flashcards',
    review: L('Review', 'Repetisjon'),
    focus: L('Focus timer', 'Fokustimer'),
  };
  const methodRows = METHOD_ORDER.map((key, index) => ({ key, label: methodLabels[key], count: methods30Days.counts[key], color: palette.series[index] }));

  const recommendation = dashboard.analysis.recommendations[0];
  const focusTopic = recommendation ? metrics.topics.find((topic) => String(topic.id) === String(recommendation.topicId) && topic.subjectId === String(recommendation.subjectId)) : undefined;
  const upcoming = metrics.exams.slice(0, 2);
  const quizChange = quiz.accuracy30 !== null && quiz.previousAccuracy30 !== null ? quiz.accuracy30 - quiz.previousAccuracy30 : null;

  const { today, reviewForecast } = metrics;
  const reviewsThisWeek = reviewForecast.reduce((total, day) => total + day.count, 0);
  const remainingToday = Math.max(0, today.goalMinutes - today.studyMinutes);

  return (
    <>
      {today.goalMinutes > 0 ? (
        <View style={[p.card, styles.today]}>
          <DonutChart size={76} strokeWidth={9} trackColor={palette.track} segments={[{ key: 'done', value: today.percent, color: palette.accent }, { key: 'left', value: 100 - today.percent, color: palette.track }]}>
            {today.goalMet ? <StudyIcon name="check" size={22} color={palette.accent} /> : <Text style={styles.todayPercent}>{today.percent}%</Text>}
          </DonutChart>
          <View style={p.grow}>
            <Text style={p.small}>{L("Today's goal", 'Dagens mål')}</Text>
            <Text style={styles.todayValue}>{formatStudyTime(today.studyMinutes, language)} <Text style={styles.todayOf}>{L('of', 'av')} {formatStudyTime(today.goalMinutes, language)}</Text></Text>
            <Text style={p.body}>
              {today.goalMet
                ? L('Goal reached. Well done.', 'Målet er nådd. Bra jobbet.')
                : L(`${formatStudyTime(remainingToday, language)} left to reach your goal.`, `${formatStudyTime(remainingToday, language)} igjen for å nå målet.`)}
            </Text>
          </View>
        </View>
      ) : null}

      <View style={p.card}>
        <Text style={p.cardTitle}>{L('Overall progress', 'Samlet fremgang')}</Text>
        {statusCounts.total === 0 ? (
          <View style={p.empty}>
            <Text style={p.emptyTitle}>{L('No topics yet', 'Ingen temaer ennå')}</Text>
            <Text style={[p.body, styles.centered]}>{L('Add a subject and its topics to start tracking progress.', 'Legg til et emne med temaer for å begynne å følge fremgangen.')}</Text>
            <Pressable accessibilityRole="button" onPress={() => router.push('/(tabs)/subjects')} style={({ pressed }) => [p.button, { backgroundColor: palette.accent }, pressed && p.pressed]}>
              <Text style={p.buttonText}>{L('Add subjects', 'Legg til emner')}</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.overall}>
            <DonutChart size={132} strokeWidth={14} trackColor={palette.track} segments={statusRows.map((row) => ({ key: row.key, value: row.count, color: row.color }))}>
              <Text style={styles.donutValue}>{metrics.overallProgress}%</Text>
              <Text style={p.small}>{L('progress', 'fremgang')}</Text>
            </DonutChart>
            <View style={styles.legend}>
              {statusRows.map((row) => (
                <View key={row.key} style={styles.legendRow}>
                  <View style={[p.legendDot, { backgroundColor: row.color }]} />
                  <Text style={styles.legendLabel}>{row.label}</Text>
                  <Text style={styles.legendValue}>{row.count}</Text>
                </View>
              ))}
            </View>
          </View>
        )}
      </View>

      <View style={styles.tiles}>
        {tiles.map((tile) => (
          <View key={tile.label} style={styles.tile}>
            <StudyIcon name={tile.icon} size={18} color={palette.accent} />
            <Text style={styles.tileValue}>{tile.value}</Text>
            <Text style={styles.tileLabel} numberOfLines={2}>{tile.label}</Text>
          </View>
        ))}
      </View>

      {metrics.subjects.length > 0 ? (
        <View style={p.card}>
          <Text style={p.cardTitle}>{L('Subjects', 'Emner')}</Text>
          {metrics.subjects.map((subject) => (
            <Pressable
              key={subject.subjectId}
              accessibilityRole="button"
              accessibilityLabel={`${subject.subjectName}, ${subject.progress}%`}
              onPress={() => router.push({ pathname: '/subject/[id]', params: { id: subject.subjectId, name: subject.subjectName } })}
              style={({ pressed }) => [styles.subject, pressed && p.pressed]}
            >
              <View style={styles.subjectTop}>
                <Text style={styles.subjectName} numberOfLines={1}>{subject.subjectName}</Text>
                <Text style={styles.subjectValue}>{subject.progress}%</Text>
              </View>
              <ProgressBar value={subject.progress} color={palette.accent} trackColor={palette.track} />
              <Text style={p.small}>
                {subject.completed} {L('of', 'av')} {subject.topics} {L('topics completed', 'temaer fullført')}
                {subject.quizAccuracy !== null ? ` · ${subject.quizAccuracy}% ${L('quiz accuracy', 'treff i quiz')}` : ''}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      <View style={p.card}>
        <View style={p.cardHeader}>
          <Text style={p.cardTitle}>{L('Upcoming exams', 'Kommende eksamener')}</Text>
          {metrics.exams.length > 0 ? (
            <Pressable accessibilityRole="button" onPress={() => goToTab('exams')} style={p.linkRow} hitSlop={8}>
              <Text style={p.link}>{L('See all', 'Se alle')}</Text>
              <StudyIcon name="chevron" size={11} color={ink.secondary} />
            </Pressable>
          ) : null}
        </View>
        {upcoming.length === 0 ? (
          <Text style={p.body}>{L('No upcoming exams. Add an exam date in a subject to see the countdown here.', 'Ingen kommende eksamener. Legg til en eksamensdato i et emne for å se nedtellingen her.')}</Text>
        ) : upcoming.map((exam) => (
          <Pressable
            key={`${exam.subjectId}-${exam.exam.date}`}
            accessibilityRole="button"
            onPress={() => router.push({ pathname: '/subject/exam', params: { id: exam.subjectId, name: exam.subjectName } })}
            style={({ pressed }) => [p.inset, p.row, pressed && p.pressed]}
          >
            <IconChip name="calendar" />
            <View style={p.grow}>
              <Text style={styles.examName} numberOfLines={1}>{exam.subjectName}</Text>
              <Text style={p.small}>{new Date(`${exam.exam.date}T00:00:00`).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' })}</Text>
              {exam.exam.type ? <Text style={p.small} numberOfLines={1}>{exam.exam.type}</Text> : null}
            </View>
            <View style={styles.countdown}>
              <Text style={styles.countdownValue}>{exam.daysUntil}</Text>
              <Text style={p.small}>{exam.daysUntil === 1 ? L('day left', 'dag igjen') : L('days left', 'dager igjen')}</Text>
            </View>
          </Pressable>
        ))}
      </View>

      {focusTopic && recommendation ? (
        <View style={p.card}>
          <View style={p.cardHeader}>
            <Text style={p.cardTitle}>{L("Today's focus", 'Dagens fokus')}</Text>
            <Pressable accessibilityRole="button" onPress={() => router.push('/(tabs)/study')} style={p.linkRow} hitSlop={8}>
              <Text style={p.link}>{L('View plan', 'Se plan')}</Text>
              <StudyIcon name="chevron" size={11} color={ink.secondary} />
            </Pressable>
          </View>
          <Pressable accessibilityRole="button" onPress={() => openTopic(focusTopic)} style={({ pressed }) => [styles.focus, { backgroundColor: palette.accent }, pressed && p.pressed]}>
            <StudyIcon name="target" size={22} color="#FFFFFF" />
            <View style={p.grow}>
              <Text style={styles.focusTitle} numberOfLines={1}>{focusTopic.name}</Text>
              <Text style={styles.focusText} numberOfLines={2}>{focusTopic.subjectName} · {recommendation.estimatedMinutes} min</Text>
            </View>
            <StudyIcon name="chevron" size={13} color="#FFFFFF" />
          </Pressable>
        </View>
      ) : null}

      <View style={p.card}>
        <View style={p.cardHeader}>
          <Text style={p.cardTitle}>{L('Study activity', 'Studieaktivitet')}</Text>
          <Text style={p.chip}>{L('Last 7 days', 'Siste 7 dager')}</Text>
        </View>
        <BarChart
          color={palette.accent}
          emptyColor={palette.track}
          inkColor={ink.secondary}
          mutedColor={ink.muted}
          data={week.days.map((day) => {
            const date = new Date(`${day.dateKey}T12:00:00`);
            return {
              key: day.dateKey,
              value: day.studyMinutes,
              valueLabel: day.studyMinutes ? formatStudyTimeCompact(day.studyMinutes, language) : '0',
              label: date.toLocaleDateString(locale, { weekday: 'short' }).replace('.', ''),
              sublabel: date.toLocaleDateString(locale, { day: 'numeric', month: 'short' }).replace('.', ''),
            };
          })}
        />
        <View style={styles.pair}>
          <View style={[p.inset, p.grow]}>
            <View style={styles.statHeader}><StudyIcon name="clock" size={15} color={palette.accent} /><Text style={p.small}>{L('Total study time', 'Total studietid')}</Text></View>
            <Text style={styles.statValue}>{formatStudyTime(week.studyMinutes, language)}</Text>
            <View style={styles.statFooter}><Text style={p.small}>{L('This week', 'Denne uken')}</Text><Change value={percentChange(week.studyMinutes, week.previousStudyMinutes)} unit="%" language={language} /></View>
          </View>
          <View style={[p.inset, p.grow]}>
            <View style={styles.statHeader}><StudyIcon name="chart" size={15} color={palette.accent} /><Text style={p.small}>{L('Study sessions', 'Studieøkter')}</Text></View>
            <Text style={styles.statValue}>{week.sessions}</Text>
            <View style={styles.statFooter}><Text style={p.small}>{L('This week', 'Denne uken')}</Text><Change value={percentChange(week.sessions, week.previousSessions)} unit="%" language={language} /></View>
          </View>
        </View>
      </View>

      <View style={p.card}>
        <View style={p.cardHeader}>
          <Text style={p.cardTitle}>{L('Reviews coming up', 'Repetisjoner som kommer')}</Text>
          <Text style={p.chip}>{L('Next 7 days', 'Neste 7 dager')}</Text>
        </View>
        {reviewsThisWeek === 0 ? (
          <Text style={p.body}>{L('No flashcards or recall questions are due this week.', 'Ingen flashcards eller gjenhentingsspørsmål forfaller denne uken.')}</Text>
        ) : (
          <>
            <BarChart
              height={84}
              color={palette.accent}
              emptyColor={palette.track}
              inkColor={ink.secondary}
              mutedColor={ink.muted}
              data={reviewForecast.map((day, index) => {
                const date = new Date(`${day.dateKey}T12:00:00`);
                return {
                  key: day.dateKey,
                  value: day.count,
                  valueLabel: String(day.count),
                  label: index === 0 ? L('Today', 'I dag') : date.toLocaleDateString(locale, { weekday: 'short' }).replace('.', ''),
                };
              })}
            />
            <Text style={p.small}>
              {L(`${reviewForecast[0].count} due today, ${reviewsThisWeek} in total this week. Today includes anything overdue.`, `${reviewForecast[0].count} forfaller i dag, ${reviewsThisWeek} totalt denne uken. I dag inkluderer det som er forfalt.`)}
            </Text>
            {reviewForecast[0].count > 0 ? (
              <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/subject/topic/study/review', params: { all: '1', name: 'Due flashcards' } })} style={({ pressed }) => [p.outlineButton, pressed && p.pressed]}>
                <Text style={p.outlineButtonText}>{L('Review due flashcards', 'Repeter flashcards som har forfalt')}</Text>
              </Pressable>
            ) : null}
          </>
        )}
      </View>

      <View style={p.card}>
        <View style={p.cardHeader}>
          <Text style={p.cardTitle}>{L('Study methods', 'Studiemetoder')}</Text>
          <Text style={p.chip}>{L('Last 30 days', 'Siste 30 dager')}</Text>
        </View>
        {methods30Days.total === 0 ? (
          <Text style={p.body}>{L('Your mix of quizzes, recall, flashcards and review will show here once you have studied.', 'Fordelingen mellom quiz, gjenhenting, flashcards og repetisjon vises her når du har studert.')}</Text>
        ) : (
          <View style={styles.overall}>
            <DonutChart size={124} strokeWidth={16} trackColor={palette.track} segments={methodRows.map((row) => ({ key: row.key, value: row.count, color: row.color }))}>
              <Text style={styles.donutValueSmall}>{methods30Days.total}</Text>
              <Text style={p.small}>{L('sessions', 'økter')}</Text>
            </DonutChart>
            <View style={styles.legend}>
              {methodRows.map((row) => (
                <View key={row.key} style={styles.legendRow}>
                  <View style={[p.legendDot, { backgroundColor: row.color }]} />
                  <Text style={styles.legendLabel} numberOfLines={1}>{row.label}</Text>
                  <Text style={styles.legendValue}>{Math.round((row.count / methods30Days.total) * 100)}%</Text>
                </View>
              ))}
            </View>
          </View>
        )}
      </View>

      <View style={p.card}>
        <View style={p.cardHeader}>
          <Text style={p.cardTitle}>{L('Quiz performance', 'Quiz-resultater')}</Text>
          <Text style={p.chip}>{L('Last 30 days', 'Siste 30 dager')}</Text>
        </View>
        {quiz.accuracy30 === null ? (
          <Text style={p.body}>{L('Complete a quiz to see your accuracy and how it changes over time.', 'Fullfør en quiz for å se treffprosenten din og hvordan den utvikler seg.')}</Text>
        ) : (
          <>
            <View>
              <Text style={p.small}>{L('Average accuracy', 'Gjennomsnittlig treffprosent')}</Text>
              <View style={styles.statFooter}>
                <Text style={styles.bigValue}>{quiz.accuracy30}%</Text>
                <Change value={quizChange} unit="pts" language={language} />
              </View>
            </View>
            <PercentLineChart
              color={palette.accent}
              gridColor={palette.grid}
              surfaceColor={palette.surface}
              mutedColor={ink.muted}
              accessibilityLabel={L(`Quiz accuracy over the last 30 days, average ${quiz.accuracy30} percent`, `Quiz-treffprosent de siste 30 dagene, snitt ${quiz.accuracy30} prosent`)}
              points={quiz.points30.map((point) => ({
                key: point.dateKey,
                value: point.accuracy,
                label: new Date(`${point.dateKey}T12:00:00`).toLocaleDateString(locale, { day: 'numeric', month: 'short' }).replace('.', ''),
              }))}
            />
            <Text style={p.small}>{L('One point for each day with a completed quiz.', 'Ett punkt for hver dag med en fullført quiz.')}</Text>
          </>
        )}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  centered: { textAlign: 'center' },
  today: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  todayPercent: { color: ink.primary, fontSize: 15, fontWeight: '800' },
  todayValue: { color: ink.primary, fontSize: 22, fontWeight: '800', marginTop: 2, marginBottom: 2 },
  todayOf: { color: ink.muted, fontSize: 14, fontWeight: '600' },
  subject: { gap: 7 },
  subjectTop: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 },
  subjectName: { flex: 1, color: ink.primary, fontSize: 14, fontWeight: '700' },
  subjectValue: { color: ink.primary, fontSize: 14, fontWeight: '800' },
  overall: { flexDirection: 'row', alignItems: 'center', gap: 20 },
  donutValue: { color: ink.primary, fontSize: 28, fontWeight: '800', letterSpacing: -0.5 },
  donutValueSmall: { color: ink.primary, fontSize: 24, fontWeight: '800' },
  legend: { flex: 1, gap: 12 },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  legendLabel: { flex: 1, color: ink.secondary, fontSize: 13 },
  legendValue: { color: ink.primary, fontSize: 13, fontWeight: '700' },
  tiles: { flexDirection: 'row', gap: 8 },
  tile: { flex: 1, alignItems: 'center', gap: 5, paddingVertical: 14, paddingHorizontal: 4, borderRadius: 16, backgroundColor: appColor('#FFFFFF', 'background'), borderWidth: 1, borderColor: appColor('#E7F0F4', 'border'), ...cardShadow },
  tileValue: { color: ink.primary, fontSize: 21, fontWeight: '800' },
  tileLabel: { color: ink.muted, fontSize: 10, lineHeight: 13, textAlign: 'center' },
  examName: { color: ink.primary, fontSize: 15, fontWeight: '700' },
  countdown: { alignItems: 'center', minWidth: 62, paddingVertical: 8, paddingHorizontal: 8, borderRadius: 12, backgroundColor: appColor('#FFFFFF', 'background') },
  countdownValue: { color: ink.primary, fontSize: 20, fontWeight: '800' },
  focus: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 16 },
  focusTitle: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  focusText: { color: 'rgba(255,255,255,0.9)', fontSize: 12, marginTop: 2 },
  pair: { flexDirection: 'row', gap: 10 },
  statHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statValue: { color: ink.primary, fontSize: 22, fontWeight: '800', marginTop: 8 },
  statFooter: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginTop: 2 },
  bigValue: { color: ink.primary, fontSize: 30, fontWeight: '800', letterSpacing: -0.5 },
  change: { fontSize: 12, fontWeight: '700' },
});
