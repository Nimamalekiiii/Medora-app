/**
 * Numbers for the Home screen: study time and quiz accuracy for a chosen
 * period, the study streak, and which motivation line belongs to a day.
 * This module is pure: no storage, no React.
 */

export type HomePeriod = '7d' | '30d' | 'all';

export type HomeActivity = {
  activity: string;
  completedAt: string;
  durationSeconds?: number;
  questionCount?: number;
  correctCount?: number;
};

export type PeriodSummary = {
  studyMinutes: number;
  /** Minutes more or less than the period before, or null when there is nothing to compare. */
  studyMinutesChange: number | null;
  quizAccuracy: number | null;
  /** Percentage points up or down from the period before. */
  quizAccuracyChange: number | null;
  sessions: number;
};

const DAY_MS = 86_400_000;

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function dayKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function totals(activities: HomeActivity[], from: number, to: number) {
  let seconds = 0;
  let questions = 0;
  let correct = 0;
  let sessions = 0;
  for (const activity of activities) {
    const time = new Date(activity.completedAt).getTime();
    if (!Number.isFinite(time) || time < from || time >= to) continue;
    sessions += 1;
    seconds += Math.max(0, activity.durationSeconds ?? 0);
    if (activity.activity === 'quiz' && (activity.questionCount ?? 0) > 0) {
      questions += Math.max(0, activity.questionCount ?? 0);
      correct += Math.max(0, activity.correctCount ?? 0);
    }
  }
  return { minutes: Math.round(seconds / 60), accuracy: questions ? Math.round((correct / questions) * 100) : null, sessions };
}

export function summarizePeriod(activities: HomeActivity[], period: HomePeriod, now: Date = new Date()): PeriodSummary {
  const end = startOfDay(now) + DAY_MS;
  if (period === 'all') {
    const all = totals(activities, Number.NEGATIVE_INFINITY, end);
    return { studyMinutes: all.minutes, studyMinutesChange: null, quizAccuracy: all.accuracy, quizAccuracyChange: null, sessions: all.sessions };
  }
  const days = period === '7d' ? 7 : 30;
  const start = end - days * DAY_MS;
  const current = totals(activities, start, end);
  const previous = totals(activities, start - days * DAY_MS, start);
  return {
    studyMinutes: current.minutes,
    studyMinutesChange: current.minutes === 0 && previous.minutes === 0 ? null : current.minutes - previous.minutes,
    quizAccuracy: current.accuracy,
    quizAccuracyChange: current.accuracy !== null && previous.accuracy !== null ? current.accuracy - previous.accuracy : null,
    sessions: current.sessions,
  };
}

/**
 * Days in a row with any study. A streak is still alive on a day that has
 * no study yet, as long as yesterday had some.
 */
export function calculateStreak(activities: HomeActivity[], now: Date = new Date()): number {
  const days = new Set<string>();
  for (const activity of activities) {
    const date = new Date(activity.completedAt);
    if (Number.isFinite(date.getTime())) days.add(dayKey(date));
  }
  const cursor = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (!days.has(dayKey(cursor))) cursor.setDate(cursor.getDate() - 1);
  let streak = 0;
  while (days.has(dayKey(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

/** The same line all day, the next one tomorrow, and all of them before any repeats. */
export function dailyIndex(dateKey: string, count: number): number {
  if (count <= 0) return 0;
  const [year, month, day] = dateKey.split('-').map(Number);
  const dayNumber = Math.floor(Date.UTC(year || 1970, (month || 1) - 1, day || 1) / DAY_MS);
  return ((dayNumber % count) + count) % count;
}

export function greetingPeriod(hour: number): 'morning' | 'afternoon' | 'evening' {
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 18) return 'afternoon';
  return 'evening';
}
