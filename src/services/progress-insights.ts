import type { ProgressDashboard } from './progress-dashboard';
import type { ProgressMetrics } from './progress-metrics';

/**
 * Short observations for the Insights tab, worked out from the student's own
 * numbers. They are always available and always current, with or without the
 * AI review. This module is pure: no storage, no React.
 */

export type InsightKind = 'exam' | 'fading' | 'focus' | 'start' | 'improving' | 'declining' | 'first_quiz' | 'consistency' | 'empty';

export type ProgressInsightItem = {
  kind: InsightKind;
  title: string;
  text: string;
  /** Opens this topic when the insight is tapped. */
  topic?: { id: string; name: string; subjectId: string };
};

const MIN_QUIZ_QUESTIONS = 5;
const TREND_THRESHOLD = 3;
const EXAM_SOON_DAYS = 21;
/** A topic is worth flagging once it has lost this many points to fading. */
const FADING_MIN_POINTS = 3;

export function buildProgressInsights(dashboard: ProgressDashboard, metrics: ProgressMetrics, language: 'en' | 'no'): ProgressInsightItem[] {
  const no = language === 'no';
  const insights: ProgressInsightItem[] = [];
  const topicRef = (topic: { id: number | string; name: string; subjectId: string }) => ({ id: String(topic.id), name: topic.name, subjectId: topic.subjectId });

  if (metrics.statusCounts.total === 0) {
    return [{
      kind: 'empty',
      title: no ? 'Legg til emner og temaer' : 'Add subjects and topics',
      text: no ? 'Innsikten bygges fra det du studerer. Start med å legge til et emne.' : 'Insights are built from what you study. Start by adding a subject.',
    }];
  }

  const exam = metrics.exams.find((entry) => entry.daysUntil <= EXAM_SOON_DAYS && entry.notStartedTopics > 0);
  if (exam) {
    const when = exam.daysUntil === 0 ? (no ? 'i dag' : 'today') : no ? `om ${exam.daysUntil} ${exam.daysUntil === 1 ? 'dag' : 'dager'}` : `in ${exam.daysUntil} ${exam.daysUntil === 1 ? 'day' : 'days'}`;
    insights.push({
      kind: 'exam',
      title: no ? `${exam.subjectName}: eksamen ${when}` : `${exam.subjectName} exam ${when}`,
      text: no
        ? `${exam.notStartedTopics} ${exam.notStartedTopics === 1 ? 'eksamenstema er' : 'eksamenstemaer er'} ikke påbegynt.`
        : `${exam.notStartedTopics} exam ${exam.notStartedTopics === 1 ? 'topic has' : 'topics have'} not been started.`,
    });
  }

  const fading = [...metrics.topics].filter((topic) => topic.fadedPoints >= FADING_MIN_POINTS && topic.daysSinceStudy !== null)
    .sort((a, b) => b.fadedPoints - a.fadedPoints)[0];
  if (fading) {
    insights.push({
      kind: 'fading',
      title: no ? `Repeter ${fading.name}` : `Revise ${fading.name}`,
      text: no
        ? `Ikke studert på ${fading.daysSinceStudy} dager. Fremgangen har falt ${fading.fadedPoints} poeng og kommer tilbake når du repeterer.`
        : `Not studied for ${fading.daysSinceStudy} days. Progress has dropped ${fading.fadedPoints} points and returns when you revise.`,
      topic: topicRef(fading),
    });
  }

  const average = dashboard.analysis.quizAccuracy;
  const weakest = [...metrics.topics]
    .filter((topic) => topic.quizAccuracy !== null && topic.quizQuestions >= MIN_QUIZ_QUESTIONS)
    .sort((a, b) => (a.quizAccuracy ?? 0) - (b.quizAccuracy ?? 0))[0];
  if (weakest && average !== null && (weakest.quizAccuracy ?? 100) < average) {
    insights.push({
      kind: 'focus',
      title: no ? `Fokuser på ${weakest.name}` : `Focus on ${weakest.name}`,
      text: no
        ? `Quiz-treffprosenten din er ${weakest.quizAccuracy}%, under snittet ditt på ${average}%.`
        : `Your quiz accuracy is ${weakest.quizAccuracy}%, below your average of ${average}%.`,
      topic: topicRef(weakest),
    });
  } else {
    const next = dashboard.analysis.recommendations.map((item) => metrics.topics.find((topic) => String(topic.id) === String(item.topicId) && topic.subjectId === String(item.subjectId)))
      .find((topic) => topic?.status === 'not_started') ?? metrics.topics.find((topic) => topic.status === 'not_started');
    if (next) {
      insights.push({
        kind: 'start',
        title: no ? `Start på ${next.name}` : `Start ${next.name}`,
        text: no ? `Dette temaet i ${next.subjectName} har ingen registrert aktivitet ennå.` : `This ${next.subjectName} topic has no recorded activity yet.`,
        topic: topicRef(next),
      });
    }
  }

  const { accuracy7, previousAccuracy7 } = metrics.quiz;
  if (accuracy7 !== null && previousAccuracy7 !== null && Math.abs(accuracy7 - previousAccuracy7) >= TREND_THRESHOLD) {
    const change = accuracy7 - previousAccuracy7;
    insights.push(change > 0 ? {
      kind: 'improving',
      title: no ? 'Du blir bedre' : "You're improving",
      text: no ? `Quiz-treffprosenten din økte med ${change} prosentpoeng denne uken.` : `Your quiz accuracy rose by ${change} points this week.`,
    } : {
      kind: 'declining',
      title: no ? 'Treffprosenten falt' : 'Accuracy dipped',
      text: no ? `Quiz-treffprosenten din falt med ${-change} prosentpoeng denne uken. Repeter temaene du bommet på.` : `Your quiz accuracy fell by ${-change} points this week. Review the topics you missed.`,
    });
  } else if (average === null) {
    insights.push({
      kind: 'first_quiz',
      title: no ? 'Ta din første quiz' : 'Take your first quiz',
      text: no ? 'En quiz gir deg et mål på hva du kan, og gjør innsikten mer presis.' : 'A quiz measures what you know and makes these insights more precise.',
    });
  }

  const studied = metrics.week.studyDays;
  insights.push({
    kind: 'consistency',
    title: dashboard.currentStreak >= 3
      ? (no ? `${dashboard.currentStreak} dager på rad` : `${dashboard.currentStreak}-day streak`)
      : (no ? 'Hold rytmen' : 'Stay consistent'),
    text: no
      ? `Du studerte ${studied} av de siste 7 dagene.${studied >= 5 ? ' Fortsett slik.' : ' Korte økter hver dag gir mest.'}`
      : `You studied ${studied} of the last 7 days.${studied >= 5 ? ' Keep it going.' : ' Short daily sessions work best.'}`,
  });

  return insights.slice(0, 3);
}
