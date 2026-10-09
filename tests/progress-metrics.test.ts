import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildProgressDashboard } from '../src/services/progress-dashboard.ts';
import { buildProgressInsights } from '../src/services/progress-insights.ts';
import { buildProgressMetrics, formatStudyTime, formatStudyTimeCompact, getExamPace, getTopicStatus, percentChange } from '../src/services/progress-metrics.ts';
import type { StudyActivity } from '../src/types/study.ts';

const NOW = new Date(2026, 9, 8, 15, 0, 0);
const at = (daysAgo: number, hour = 10) => new Date(2026, 9, 8 - daysAgo, hour, 0, 0).toISOString();
let nextId = 1;

function activity(topicId: string, type: StudyActivity['activity'], daysAgo: number, extra: Partial<StudyActivity> = {}): StudyActivity {
  return { id: nextId++, topicId, topicName: `Topic ${topicId}`, activity: type, completedAt: at(daysAgo), durationSeconds: 600, questionCount: 10, ...extra };
}

const subjects = [{ id: 1, name: 'Pharmacology' }, { id: 2, name: 'Pathology' }];
const topicsBySubject = { '1': [{ id: 11, name: 'Heart' }, { id: 12, name: 'Kidney' }], '2': [{ id: 21, name: 'Liver' }] };

/** Enough good practice, spread over many days, for a topic to count as completed. */
function mastered(topicId: string): StudyActivity[] {
  return Array.from({ length: 12 }, (_, day) => [
    activity(topicId, 'quiz', day, { questionCount: 15, correctCount: 14 }),
    activity(topicId, 'active_recall', day, { questionCount: 8, goodCount: 8 }),
    activity(topicId, 'review', day, { questionCount: 15, goodCount: 15 }),
  ]).flat();
}

function build(activities: StudyActivity[], exams = {}, studyDays = [1, 2, 3, 4, 5]) {
  const dashboard = buildProgressDashboard({ subjects, topicsBySubject, examsBySubject: exams, activities, quizResults: [], flashcardReviews: [] }, NOW, 'en');
  return { dashboard, metrics: buildProgressMetrics(dashboard, { now: NOW, studyDays }) };
}

test('with no activity every topic is not started and nothing divides by zero', () => {
  const { metrics } = build([]);
  assert.deepEqual(metrics.statusCounts, { completed: 0, inProgress: 0, notStarted: 3, total: 3 });
  assert.equal(metrics.overallProgress, 0);
  assert.equal(metrics.quiz.accuracy30, null);
  assert.equal(metrics.methods30Days.total, 0);
  assert.equal(metrics.week.studyMinutes, 0);
  assert.equal(metrics.week.days.length, 7);
  assert.equal(metrics.consistency.days.length, 30);
});

test('with no subjects at all the metrics are empty rather than broken', () => {
  const dashboard = buildProgressDashboard({ subjects: [], topicsBySubject: {}, examsBySubject: {}, activities: [], quizResults: [], flashcardReviews: [] }, NOW, 'en');
  const metrics = buildProgressMetrics(dashboard, { now: NOW });
  assert.equal(metrics.statusCounts.total, 0);
  assert.equal(metrics.overallProgress, 0);
  assert.equal(metrics.consistency.percent, null);
  assert.equal(buildProgressInsights(dashboard, metrics, 'en')[0].kind, 'empty');
});

test('a topic is completed only when its mastery score is high enough', () => {
  assert.equal(getTopicStatus({ started: false, practiceProgress: 0 }), 'not_started');
  assert.equal(getTopicStatus({ started: true, practiceProgress: 79 }), 'in_progress');
  assert.equal(getTopicStatus({ started: true, practiceProgress: 80 }), 'completed');
});

test('one session barely moves a topic, and sustained practice completes it', () => {
  const light = build([activity('11', 'quiz', 1, { correctCount: 9 }), activity('11', 'active_recall', 1, { goodCount: 10 })]).metrics;
  const lightTopic = light.topics.find((topic) => topic.id === 11);
  assert.equal(lightTopic?.status, 'in_progress');
  assert.ok((lightTopic?.practiceProgress ?? 100) <= 10, `one session gave ${lightTopic?.practiceProgress}%`);

  const { metrics } = build([...mastered('11'), activity('12', 'flashcards', 3)]);
  const status = Object.fromEntries(metrics.topics.map((topic) => [String(topic.id), topic.status]));
  assert.deepEqual(status, { '11': 'completed', '12': 'in_progress', '21': 'not_started' });
  assert.deepEqual(metrics.statusCounts, { completed: 1, inProgress: 1, notStarted: 1, total: 3 });
  assert.equal(metrics.topics.find((topic) => topic.id === 11)?.methodsDone, 3);
});

test('removing a topic removes it from every figure', () => {
  const activities = [activity('11', 'quiz', 1, { correctCount: 9 }), activity('12', 'quiz', 1, { correctCount: 2 })];
  const before = build(activities).metrics;
  const dashboard = buildProgressDashboard({ subjects, topicsBySubject: { ...topicsBySubject, '1': [{ id: 11, name: 'Heart' }] }, examsBySubject: {}, activities: [activities[0]], quizResults: [], flashcardReviews: [] }, NOW, 'en');
  const after = buildProgressMetrics(dashboard, { now: NOW });
  assert.equal(before.statusCounts.total, 3);
  assert.equal(after.statusCounts.total, 2);
  assert.ok(!after.topics.some((topic) => topic.id === 12));
  assert.equal(after.quiz.accuracy30, 90);
});

test('weekly study time and sessions are compared with the week before', () => {
  const { metrics } = build([
    activity('11', 'focus', 0, { durationSeconds: 3600 }),
    activity('11', 'quiz', 2, { durationSeconds: 1800, correctCount: 5 }),
    activity('11', 'focus', 8, { durationSeconds: 1800 }),
  ]);
  assert.equal(metrics.week.studyMinutes, 90);
  assert.equal(metrics.week.previousStudyMinutes, 30);
  assert.equal(metrics.week.sessions, 2);
  assert.equal(metrics.week.studyDays, 2);
  assert.equal(metrics.week.days[6].studyMinutes, 60);
  assert.equal(percentChange(metrics.week.studyMinutes, metrics.week.previousStudyMinutes), 200);
  assert.equal(percentChange(10, 0), null);
});

test('study methods count sessions from the last 30 days only', () => {
  const { metrics } = build([activity('11', 'quiz', 1), activity('11', 'quiz', 5), activity('11', 'flashcards', 10), activity('11', 'review', 45)]);
  assert.equal(metrics.methods30Days.counts.quiz, 2);
  assert.equal(metrics.methods30Days.counts.flashcards, 1);
  assert.equal(metrics.methods30Days.counts.review, 0);
  assert.equal(metrics.methods30Days.total, 3);
});

test('quiz accuracy is weighted by questions and has one point per quiz day', () => {
  const { metrics } = build([
    activity('11', 'quiz', 1, { questionCount: 10, correctCount: 9 }),
    activity('11', 'quiz', 1, { questionCount: 30, correctCount: 15 }),
    activity('12', 'quiz', 4, { questionCount: 10, correctCount: 5 }),
    activity('12', 'quiz', 40, { questionCount: 10, correctCount: 2 }),
  ]);
  assert.equal(metrics.quiz.accuracy30, 58);
  assert.equal(metrics.quiz.previousAccuracy30, 20);
  assert.deepEqual(metrics.quiz.points30.map((point) => point.accuracy), [50, 60]);
});

test('consistency compares studied days with planned days', () => {
  const { metrics } = build([activity('11', 'quiz', 0), activity('11', 'quiz', 1), activity('11', 'quiz', 4)]);
  assert.equal(metrics.consistency.studiedDays, 3);
  assert.equal(metrics.consistency.plannedDays, 22);
  assert.equal(metrics.consistency.plannedDaysStudied, 2);
  assert.equal(metrics.consistency.percent, 9);
});

test('exam preparation uses the topics included in the exam', () => {
  const exams = { '1': { date: '2026-10-20', type: 'Written', topicIds: [11, 12] } };
  const { metrics } = build(mastered('11'), exams);
  const heart = metrics.topics.find((topic) => topic.id === 11)?.practiceProgress ?? 0;
  assert.equal(metrics.exams.length, 1);
  assert.equal(metrics.exams[0].daysUntil, 12);
  assert.equal(metrics.exams[0].readiness, Math.round(heart / 2));
  assert.equal(metrics.exams[0].notStartedTopics, 1);
  assert.equal(build([], { '1': { date: '2026-10-01', type: 'Written', topicIds: [11] } }).metrics.exams.length, 0);
});

test('insights point at an exam with unstarted topics and at the weakest quiz topic', () => {
  const exams = { '1': { date: '2026-10-20', type: 'Written', topicIds: [11, 12] } };
  const { dashboard, metrics } = build([
    activity('11', 'quiz', 1, { correctCount: 9 }),
    activity('21', 'quiz', 1, { correctCount: 3 }),
  ], exams);
  const insights = buildProgressInsights(dashboard, metrics, 'en');
  assert.ok(insights.length <= 3);
  assert.equal(insights[0].kind, 'exam');
  const focus = insights.find((item) => item.kind === 'focus');
  assert.equal(focus?.topic?.name, 'Liver');
  assert.match(focus?.text ?? '', /30%/);
  assert.match(buildProgressInsights(dashboard, metrics, 'no').find((item) => item.kind === 'focus')?.title ?? '', /Fokuser på Liver/);
});

test('insights report a rising or falling quiz trend', () => {
  const rising = build([activity('11', 'quiz', 1, { correctCount: 9 }), activity('11', 'quiz', 9, { correctCount: 5 })]);
  assert.ok(buildProgressInsights(rising.dashboard, rising.metrics, 'en').some((item) => item.kind === 'improving' && /40 points/.test(item.text)));
  const falling = build([activity('11', 'quiz', 1, { correctCount: 4 }), activity('11', 'quiz', 9, { correctCount: 8 })]);
  assert.ok(buildProgressInsights(falling.dashboard, falling.metrics, 'en').some((item) => item.kind === 'declining'));
});

test('study time is written in hours and minutes', () => {
  assert.equal(formatStudyTime(0, 'en'), '0m');
  assert.equal(formatStudyTime(45, 'en'), '45m');
  assert.equal(formatStudyTime(120, 'en'), '2h');
  assert.equal(formatStudyTime(630, 'en'), '10h 30m');
  assert.equal(formatStudyTime(630, 'no'), '10t 30m');
});

test('the exam pace says how often a topic must be finished', () => {
  assert.deepEqual(getExamPace(0, 10), { kind: 'done' });
  assert.deepEqual(getExamPace(3, 0), { kind: 'today' });
  assert.deepEqual(getExamPace(4, 12), { kind: 'every', days: 3 });
  assert.deepEqual(getExamPace(5, 5), { kind: 'every', days: 1 });
  assert.deepEqual(getExamPace(9, 4), { kind: 'perDay', topics: 3 });
});

test('an exam counts the topics that are not completed yet', () => {
  const exams = { '1': { date: '2026-10-20', type: 'Written', topicIds: [11, 12] } };
  const { metrics } = build(mastered('11'), exams);
  assert.equal(metrics.exams[0].totalTopics, 2);
  assert.equal(metrics.exams[0].remainingTopics, 1);
  assert.deepEqual(metrics.exams[0].pace, { kind: 'every', days: 12 });
});

test('today is measured against the daily goal', () => {
  const dashboard = buildProgressDashboard({ subjects, topicsBySubject, examsBySubject: {}, activities: [activity('11', 'focus', 0, { durationSeconds: 1800 }), activity('11', 'focus', 1, { durationSeconds: 3600 })], quizResults: [], flashcardReviews: [] }, NOW, 'en');
  const half = buildProgressMetrics(dashboard, { now: NOW, dailyGoalMinutes: 60 }).today;
  assert.deepEqual(half, { studyMinutes: 30, goalMinutes: 60, percent: 50, goalMet: false });
  const met = buildProgressMetrics(dashboard, { now: NOW, dailyGoalMinutes: 20 }).today;
  assert.equal(met.percent, 100);
  assert.equal(met.goalMet, true);
  assert.equal(buildProgressMetrics(dashboard, { now: NOW }).today.goalMet, false);
});

test('each subject summarises its own topics', () => {
  const { metrics } = build([...mastered('11'), activity('12', 'quiz', 1, { questionCount: 20, correctCount: 2 })]);
  const pharmacology = metrics.subjects.find((subject) => subject.subjectName === 'Pharmacology');
  assert.equal(pharmacology?.topics, 2);
  assert.equal(pharmacology?.completed, 1);
  assert.equal(pharmacology?.quizAccuracy, 85);
  const pathology = metrics.subjects.find((subject) => subject.subjectName === 'Pathology');
  assert.deepEqual([pathology?.topics, pathology?.completed, pathology?.progress, pathology?.quizAccuracy], [1, 0, 0, null]);
});

test('the review forecast puts overdue and new items on today and ignores deleted topics', () => {
  const day = (offset: number) => new Date(2026, 9, 8 + offset, 9, 0, 0).toISOString();
  const card = (id: string, topicId: string, nextReviewAt?: string) => ({ id, topicId, topicName: 'T', front: 'f', back: 'b', createdAt: day(-5), nextReviewAt });
  const dashboard = buildProgressDashboard({ subjects, topicsBySubject, examsBySubject: {}, activities: [], quizResults: [], flashcardReviews: [] }, NOW, 'en');
  const metrics = buildProgressMetrics(dashboard, {
    now: NOW,
    flashcards: [card('a', '11'), card('b', '11', day(-3)), card('c', '11', day(0)), card('d', '12', day(2)), card('e', '12', day(2)), card('f', '12', day(30)), card('g', '999', day(1))],
    recallQuestions: { '21': [{ id: 1, question: 'q', answer: 'a', nextReviewAt: day(2) }, { id: 2, question: 'q2', answer: 'a' }], '999': [{ id: 3, question: 'q', answer: 'a' }] },
  });
  assert.deepEqual(metrics.reviewForecast.map((item) => item.count), [4, 0, 3, 0, 0, 0, 0]);
  assert.equal(metrics.reviewForecast[0].dateKey, '2026-10-08');
});

test('missed questions are counted across quizzes and ranked by how often they were missed', () => {
  const result = (topicId: string, daysAgo: number, questions: string[]) => ({
    id: `${topicId}-${daysAgo}`, topicId, topicName: 'T', completedAt: at(daysAgo), questionCount: 10, correctCount: 5, wrongCount: 5, score: 50, durationSeconds: 60,
    missedQuestions: questions.map((question) => ({ question, selectedAnswer: 'x', correctAnswer: `answer to ${question.trim().toLowerCase()}` })),
  });
  const dashboard = buildProgressDashboard({ subjects, topicsBySubject, examsBySubject: {}, activities: [], quizResults: [], flashcardReviews: [] }, NOW, 'en');
  const metrics = buildProgressMetrics(dashboard, {
    now: NOW,
    quizResults: [result('11', 3, ['What is ACE?', 'Loop diuretics?']), result('11', 1, ['what is ace? ', 'Beta blockers?']), result('999', 1, ['Deleted topic question'])],
  });
  assert.equal(metrics.missedQuestions.length, 3);
  assert.equal(metrics.missedQuestions[0].question, 'What is ACE?');
  assert.equal(metrics.missedQuestions[0].times, 2);
  assert.equal(metrics.missedQuestions[0].topic.name, 'Heart');
  assert.ok(!metrics.missedQuestions.some((item) => item.question === 'Deleted topic question'));
});

test('a topic left alone for months loses points and is flagged for revision', () => {
  const old = Array.from({ length: 12 }, (_, day) => [
    activity('11', 'quiz', 100 + day, { questionCount: 15, correctCount: 14 }),
    activity('11', 'active_recall', 100 + day, { questionCount: 8, goodCount: 8 }),
    activity('11', 'review', 100 + day, { questionCount: 15, goodCount: 15 }),
  ]).flat();
  const { dashboard, metrics } = build(old);
  const heart = metrics.topics.find((topic) => topic.id === 11);
  assert.equal(heart?.daysSinceStudy, 100);
  assert.ok((heart?.fadedPoints ?? 0) > 20, `faded ${heart?.fadedPoints}`);
  assert.equal(heart?.status, 'in_progress');
  const fading = buildProgressInsights(dashboard, metrics, 'en').find((item) => item.kind === 'fading');
  assert.equal(fading?.topic?.name, 'Heart');
  assert.match(fading?.text ?? '', /100 days/);

  const revised = build([...old, activity('11', 'quiz', 0, { questionCount: 10, correctCount: 9 })]).metrics.topics.find((topic) => topic.id === 11);
  assert.equal(revised?.fadedPoints, 0);
  assert.equal(revised?.status, 'completed');
});

test('a recently studied topic has not faded', () => {
  const topic = build(mastered('11')).metrics.topics.find((item) => item.id === 11);
  assert.equal(topic?.daysSinceStudy, 0);
  assert.equal(topic?.fadedPoints, 0);
});

test('bar labels use a short time format', () => {
  assert.equal(formatStudyTimeCompact(45, 'en'), '45m');
  assert.equal(formatStudyTimeCompact(60, 'en'), '1h');
  assert.equal(formatStudyTimeCompact(90, 'en'), '1.5h');
  assert.equal(formatStudyTimeCompact(90, 'no'), '1,5t');
});
