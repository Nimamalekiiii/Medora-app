import assert from 'node:assert/strict';
import { test } from 'node:test';

import { softTint, subjectIcon, subjectTint } from '../src/services/subject-look.ts';
import { buildSubjectPlan, countStudyDaysUntil, orderPlanTopics, splitSessionMinutes, type PlanTopic } from '../src/services/subject-plan.ts';

// Friday 9 October 2026.
const NOW = new Date(2026, 9, 9, 10, 0, 0);
const WEEKDAYS = [1, 2, 3, 4, 5];

const topic = (id: number, practiceProgress: number, status: PlanTopic['status'], fadedPoints = 0): PlanTopic => ({ id, name: `t${id}`, practiceProgress, status, fadedPoints });
const topics = [
  topic(1, 85, 'completed'),
  topic(2, 0, 'not_started'),
  topic(3, 40, 'in_progress'),
  topic(4, 20, 'in_progress'),
  topic(5, 60, 'in_progress', 8),
  topic(6, 0, 'not_started'),
];
const ids = (list: PlanTopic[]) => list.map((item) => item.id).join('');

test('fading topics come first, then started, then new, then completed', () => {
  assert.equal(ids(orderPlanTopics(topics)), '543261');
});

test('only exam topics are planned when the exam lists topics', () => {
  assert.equal(ids(orderPlanTopics(topics, [1, '2', 3])), '321');
});

test('today gets the most urgent topic and the next study days continue down the list', () => {
  const plan = buildSubjectPlan(topics, { studyDays: WEEKDAYS, now: NOW, days: 3 });
  assert.equal(plan.isStudyDayToday, true);
  assert.equal(plan.today?.id, 5);
  // Saturday and Sunday are skipped.
  assert.deepEqual(plan.upcoming.map((day) => day.dateKey), ['2026-10-12', '2026-10-13', '2026-10-14']);
  assert.equal(ids(plan.upcoming.map((day) => day.topic)), '432');
});

test('a day off has no topic today and starts the list on the next study day', () => {
  const plan = buildSubjectPlan(topics, { studyDays: [1, 3], now: NOW, days: 2 });
  assert.equal(plan.isStudyDayToday, false);
  assert.equal(plan.today, null);
  assert.deepEqual(plan.upcoming.map((day) => day.dateKey), ['2026-10-12', '2026-10-14']);
  assert.equal(ids(plan.upcoming.map((day) => day.topic)), '54');
});

test('the plan stops at the exam date and repeats topics when there are few', () => {
  const plan = buildSubjectPlan([topics[1]], { studyDays: WEEKDAYS, now: NOW, examDateKey: '2026-10-13', days: 5 });
  assert.deepEqual(plan.upcoming.map((day) => day.dateKey), ['2026-10-12', '2026-10-13']);
  assert.equal(ids(plan.upcoming.map((day) => day.topic)), '22');
});

test('no topics or no study days gives an empty plan', () => {
  assert.deepEqual(buildSubjectPlan([], { studyDays: WEEKDAYS, now: NOW }).upcoming, []);
  assert.equal(buildSubjectPlan([], { studyDays: WEEKDAYS, now: NOW }).today, null);
  assert.deepEqual(buildSubjectPlan(topics, { studyDays: [], now: NOW }).upcoming, []);
});

test('session minutes are split 50 / 30 / 20 and always add up', () => {
  assert.deepEqual(splitSessionMinutes(120), { recall: 60, quiz: 36, review: 24 });
  const split = splitSessionMinutes(25);
  assert.equal(split.recall + split.quiz + split.review, 25);
  assert.deepEqual(splitSessionMinutes(0), { recall: 0, quiz: 0, review: 0 });
});

test('study days until the exam include today and the exam day', () => {
  assert.equal(countStudyDaysUntil('2026-10-09', WEEKDAYS, NOW), 1);
  assert.equal(countStudyDaysUntil('2026-10-16', WEEKDAYS, NOW), 6);
  assert.equal(countStudyDaysUntil('2026-10-08', WEEKDAYS, NOW), 0);
});

test('subject icons follow the subject name in English and Norwegian', () => {
  assert.equal(subjectIcon('Nevrologi'), 'brain');
  assert.equal(subjectIcon('Pharmacology'), 'pills');
  assert.equal(subjectIcon('Anatomy'), 'figure');
  assert.equal(subjectIcon('Mikrobiologi'), 'microbe');
  assert.equal(subjectIcon('Pathology'), 'flask');
  assert.equal(subjectIcon('Physiology'), 'stethoscope');
  assert.equal(subjectIcon('Statistics'), 'layers');
});

test('subject colours repeat and get a soft version', () => {
  const series = ['#111111', '#222222', '#333333'];
  assert.equal(subjectTint(0, series), '#111111');
  assert.equal(subjectTint(4, series), '#222222');
  assert.equal(softTint('#2A78D6'), '#2A78D626');
});

test('the weekly plan falls back to the general study preferences', async () => {
  const { resolveStudyPlan } = await import('../src/services/subject-plan.ts');
  const prefs = { studyDays: [1, 2, 3, 6], includeWeekends: false, dailyGoalMinutes: 45 };
  assert.deepEqual(resolveStudyPlan(null, prefs), { studyDays: [1, 2, 3], dailyStudyMinutes: 45 });
  assert.deepEqual(resolveStudyPlan(null, { ...prefs, includeWeekends: true }).studyDays, [0, 1, 2, 3, 6]);
  assert.deepEqual(resolveStudyPlan(null, { ...prefs, studyDays: [] }).studyDays, [1, 2, 3, 4, 5, 6]);
  const saved = { studyDays: [2, 4], dailyStudyMinutes: 90 };
  assert.equal(resolveStudyPlan(saved, prefs), saved);
});
