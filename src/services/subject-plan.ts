/**
 * The study plan for one subject: which topic to study on which day.
 * Topics that need the most work come first, so the plan changes as the
 * student's progress changes. This module is pure: no storage, no React.
 */

export type PlanTopic = {
  id: string | number;
  name: string;
  /** Topic progress, 0 to 100. */
  practiceProgress: number;
  /** Points lost because the topic has not been revised lately. */
  fadedPoints: number;
  status: 'not_started' | 'in_progress' | 'completed';
};

export type PlanDay<T extends PlanTopic> = { dateKey: string; date: Date; topic: T };

export type SubjectPlan<T extends PlanTopic> = {
  /** Topics in the order they should be studied. */
  queue: T[];
  isStudyDayToday: boolean;
  /** Today's topic, or null on a day off or with no topics. */
  today: T | null;
  /** The coming study days after today, each with its topic. */
  upcoming: PlanDay<T>[];
};

export type PlanOptions = {
  /** Weekdays to study, as Date.getDay() values. */
  studyDays: number[];
  /** Exam topic ids. Empty or missing means every topic counts. */
  examTopicIds?: (string | number)[];
  /** Last day worth planning for, as YYYY-MM-DD. Days after it are left out. */
  examDateKey?: string;
  now?: Date;
  /** How many coming study days to list. */
  days?: number;
};

function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/** Lower is more urgent: fading topics, then started ones, then new ones, then completed ones. */
function urgency(topic: PlanTopic) {
  if (topic.status === 'completed') return topic.fadedPoints > 0 ? 0 : 3;
  if (topic.fadedPoints > 0) return 0;
  return topic.status === 'in_progress' ? 1 : 2;
}

export function orderPlanTopics<T extends PlanTopic>(topics: T[], examTopicIds: (string | number)[] = []): T[] {
  const wanted = new Set(examTopicIds.map(String));
  const included = wanted.size > 0 ? topics.filter((topic) => wanted.has(String(topic.id))) : topics;
  return included
    .map((topic, index) => ({ topic, index }))
    .sort((left, right) =>
      urgency(left.topic) - urgency(right.topic)
      || left.topic.practiceProgress - right.topic.practiceProgress
      || left.index - right.index)
    .map((item) => item.topic);
}

export function buildSubjectPlan<T extends PlanTopic>(topics: T[], options: PlanOptions): SubjectPlan<T> {
  const now = options.now ?? new Date();
  const queue = orderPlanTopics(topics, options.examTopicIds);
  const studyDays = new Set(options.studyDays);
  const isStudyDayToday = studyDays.has(now.getDay());
  const today = isStudyDayToday && queue.length > 0 ? queue[0] : null;

  const upcoming: PlanDay<T>[] = [];
  const wanted = options.days ?? 5;
  // Today takes the first topic, so the following days continue from the second.
  let position = today ? 1 : 0;
  if (queue.length > 0 && studyDays.size > 0) {
    for (let offset = 1; offset <= 60 && upcoming.length < wanted; offset += 1) {
      const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset, 12);
      const key = dateKey(date);
      if (options.examDateKey && key > options.examDateKey) break;
      if (!studyDays.has(date.getDay())) continue;
      upcoming.push({ dateKey: key, date, topic: queue[position % queue.length] });
      position += 1;
    }
  }

  return { queue, isStudyDayToday, today, upcoming };
}

/** Splits a study session across the three steps: recall 50 %, quiz 30 %, review the rest. */
export function splitSessionMinutes(totalMinutes: number) {
  const total = Math.max(0, Math.round(totalMinutes));
  const recall = Math.round(total * 0.5);
  const quiz = Math.round(total * 0.3);
  return { recall, quiz, review: Math.max(0, total - recall - quiz) };
}

/** Study days left up to and including the exam day. */
export function countStudyDaysUntil(examDateKey: string, studyDays: number[], now: Date = new Date()) {
  const days = new Set(studyDays);
  let count = 0;
  for (let offset = 0; offset <= 730; offset += 1) {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset, 12);
    if (dateKey(date) > examDateKey) break;
    if (days.has(date.getDay())) count += 1;
  }
  return count;
}

export type WeeklyPlan = { studyDays: number[]; dailyStudyMinutes: number };

/** The subject's own weekly plan, or one built from the student's general study preferences. */
export function resolveStudyPlan(
  saved: WeeklyPlan | null | undefined,
  preferences: { studyDays: number[]; includeWeekends: boolean; dailyGoalMinutes: number },
): WeeklyPlan {
  if (saved && Array.isArray(saved.studyDays) && saved.studyDays.length > 0) return saved;
  const days = preferences.includeWeekends
    ? [...preferences.studyDays, 0, 6]
    : preferences.studyDays.filter((day) => day !== 0 && day !== 6);
  const unique = [...new Set(days)].sort((left, right) => left - right);
  return { studyDays: unique.length ? unique : [1, 2, 3, 4, 5, 6], dailyStudyMinutes: preferences.dailyGoalMinutes };
}
