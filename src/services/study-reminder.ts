import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

const SETTINGS_KEY = 'medexam_notification_preferences';
const DAILY_ID_KEY = 'medexam_notification_daily_id';
const EXAM_IDS_KEY = 'medexam_notification_exam_ids';
const LEGACY_SETTINGS_KEY = 'medexam_daily_study_reminder';
const LEGACY_ID_KEY = 'medexam_daily_study_reminder_id';
const ANDROID_CHANNEL_ID = 'study-reminders';

export type DailyStudyReminder = { enabled: boolean; time: string };
export type StudyReminderPreferences = {
  dailyStudy: boolean;
  dailyPlan: boolean;
  exams: boolean;
  reviews: boolean;
  flashcards: boolean;
  time: string;
  times: string[];
  examDaysBefore: number[];
};

const DEFAULTS: StudyReminderPreferences = {
  dailyStudy: false,
  dailyPlan: false,
  exams: false,
  reviews: false,
  flashcards: false,
  time: '19:00',
  times: ['19:00'],
  examDaysBefore: [7, 3, 1, 0],
};

export class ReminderPermissionError extends Error {
  constructor() {
    super('Notifications are turned off for Medora. Turn them on in your device Settings, then try again.');
    this.name = 'ReminderPermissionError';
  }
}

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldPlaySound: false, shouldSetBadge: false, shouldShowBanner: true, shouldShowList: true }),
});

function parseTime(time: string) {
  const match = /^(\d{2}):(\d{2})$/.exec(time);
  if (!match) throw new Error('Enter a time as HH:MM, for example 19:00.');
  const hour = Number(match[1]); const minute = Number(match[2]);
  if (hour > 23 || minute > 59) throw new Error('Enter a valid time between 00:00 and 23:59.');
  return { hour, minute };
}

export async function getStudyReminderPreferences(): Promise<StudyReminderPreferences> {
  const raw = await AsyncStorage.getItem(SETTINGS_KEY);
  if (raw) {
    try {
      const saved = JSON.parse(raw) as Partial<StudyReminderPreferences>;
      const time = typeof saved.time === 'string' ? saved.time : DEFAULTS.time;
      parseTime(time);
      const times = Array.isArray(saved.times) ? [...new Set(saved.times.filter((item): item is string => typeof item === 'string'))].slice(0, 3) : [time];
      times.forEach(parseTime);
      const validDays = Array.isArray(saved.examDaysBefore) ? [...new Set(saved.examDaysBefore.filter((day): day is number => [7, 3, 1, 0].includes(day)))] : DEFAULTS.examDaysBefore;
      return {
        dailyStudy: saved.dailyStudy === true, dailyPlan: saved.dailyPlan === true, exams: saved.exams === true,
        reviews: saved.reviews === true, flashcards: saved.flashcards === true, time: times[0] ?? time, times: times.length ? times : [time], examDaysBefore: validDays,
      };
    } catch { return DEFAULTS; }
  }
  // Keep the daily reminder that may already have been scheduled by older versions.
  const legacy = await AsyncStorage.getItem(LEGACY_SETTINGS_KEY);
  if (legacy) {
    try {
      const parsed = JSON.parse(legacy) as Partial<DailyStudyReminder>;
      const time = typeof parsed.time === 'string' ? parsed.time : DEFAULTS.time;
      parseTime(time);
      return { ...DEFAULTS, dailyStudy: parsed.enabled === true, time, times: [time] };
    } catch { /* Use defaults for a damaged preference record. */ }
  }
  return DEFAULTS;
}

async function requestNotificationPermission() {
  const current = await Notifications.getPermissionsAsync();
  const permission = current.granted || !current.canAskAgain ? current : await Notifications.requestPermissionsAsync();
  if (!permission.granted) throw new ReminderPermissionError();
}

async function prepareAndroidChannel() {
  if (Platform.OS === 'android') await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, { name: 'Study reminders', importance: Notifications.AndroidImportance.DEFAULT });
}

async function scheduledDaily(reminder: StudyReminderPreferences) {
  if (!(reminder.dailyStudy || reminder.dailyPlan || reminder.reviews || reminder.flashcards)) return [] as string[];
  const reasons = [reminder.dailyStudy && 'a focused study session', reminder.dailyPlan && 'your study plan', reminder.reviews && 'a quick review', reminder.flashcards && 'flashcards to practice'].filter(Boolean);
  const ids: string[] = [];
  try {
    for (const time of reminder.times) {
      const { hour, minute } = parseTime(time);
      ids.push(await Notifications.scheduleNotificationAsync({
        content: { title: 'Your Medora study reminder', body: `Make time for ${reasons.join(', ')} today.`, sound: false, data: { medexam: 'daily-study', time } },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour, minute, ...(Platform.OS === 'android' ? { channelId: ANDROID_CHANNEL_ID } : {}) },
      }));
    }
    return ids;
  } catch (error) {
    await Promise.all(ids.map((id) => Notifications.cancelScheduledNotificationAsync(id).catch(() => undefined)));
    throw error;
  }
}

function localExamDate(dateValue: string, daysBefore: number) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateValue);
  if (!match) return null;
  const year = Number(match[1]); const month = Number(match[2]) - 1; const day = Number(match[3]);
  const exam = new Date(year, month, day, 9, 0, 0, 0);
  if (exam.getFullYear() !== year || exam.getMonth() !== month || exam.getDate() !== day) return null;
  exam.setDate(exam.getDate() - daysBefore);
  return exam > new Date() ? exam : null;
}

type ExamRecord = { date: string; type?: string; topicIds?: number[] } | null;
type SubjectRecord = { id: string | number; name: string };

async function scheduleExamNotifications(exams: Record<string, ExamRecord>, subjects: SubjectRecord[], daysBefore: number[]) {
  const subjectNames = new Map(subjects.map((subject) => [String(subject.id), subject.name]));
  const scheduledIds: string[] = [];
  for (const [subjectId, exam] of Object.entries(exams)) {
    if (!exam || typeof exam.date !== 'string') continue;
    const name = subjectNames.get(subjectId) ?? exam.type ?? 'your exam';
    for (const lead of daysBefore) {
      if (scheduledIds.length >= 60) break;
      const date = localExamDate(exam.date, lead);
      if (!date) continue;
      try {
        const id = await Notifications.scheduleNotificationAsync({
          content: {
            title: lead === 0 ? `${name} exam is today` : `${name} exam is coming up`,
            body: lead === 0 ? 'Your exam date is today. Open Medora to review your plan.' : `${lead} ${lead === 1 ? 'day' : 'days'} left. Open Medora to review your study plan.`,
            sound: false,
            data: { medexam: 'exam', subjectId, examDate: exam.date, daysBefore: lead },
          },
          trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date, ...(Platform.OS === 'android' ? { channelId: ANDROID_CHANNEL_ID } : {}) },
        });
        scheduledIds.push(id);
      } catch (error) {
        await Promise.all(scheduledIds.map((id) => Notifications.cancelScheduledNotificationAsync(id).catch(() => undefined)));
        throw error;
      }
    }
  }
  // Keep pending OS notifications below the platform limit and reserve room for daily reminders.
  return scheduledIds;
}

export async function saveStudyReminderPreferences(next: StudyReminderPreferences) {
  const times = Array.isArray(next.times) ? [...new Set(next.times)] : [next.time];
  if (times.length < 1 || times.length > 3) throw new Error('Choose between one and three daily reminder times.');
  times.forEach(parseTime);
  const normalized = { ...next, times, time: times[0] };
  if (!Array.isArray(next.examDaysBefore) || next.examDaysBefore.some((day) => ![7, 3, 1, 0].includes(day))) throw new Error('Choose valid exam reminder days.');
  if (Platform.OS === 'web') throw new Error('Notifications are available in the iPhone and Android apps.');

  const previousDaily = await AsyncStorage.getItem(DAILY_ID_KEY);
  const previousExamsRaw = await AsyncStorage.getItem(EXAM_IDS_KEY);
  let previousExams: string[] = [];
  try { previousExams = previousExamsRaw ? JSON.parse(previousExamsRaw) as string[] : []; } catch { previousExams = []; }
  const legacyId = await AsyncStorage.getItem(LEGACY_ID_KEY);
  const hasAny = next.dailyStudy || next.dailyPlan || next.exams || next.reviews || next.flashcards;
  let newDaily: string[] = [];
  let newExams: string[] = [];
  if (hasAny) {
    await prepareAndroidChannel();
    await requestNotificationPermission();
    try {
      newDaily = await scheduledDaily(normalized);
      if (next.exams) {
        const { getExamsBySubject, getSubjects } = await import('./storage');
        const [exams, subjects] = await Promise.all([getExamsBySubject(), getSubjects()]);
        newExams = await scheduleExamNotifications(exams, subjects, next.examDaysBefore);
      }
    } catch (error) {
      await Promise.all(newDaily.map((id) => Notifications.cancelScheduledNotificationAsync(id).catch(() => undefined)));
      await Promise.all(newExams.map((id) => Notifications.cancelScheduledNotificationAsync(id).catch(() => undefined)));
      throw error;
    }
  }
  await AsyncStorage.multiSet([
    [SETTINGS_KEY, JSON.stringify(normalized)],
    [DAILY_ID_KEY, JSON.stringify(newDaily)],
    [EXAM_IDS_KEY, JSON.stringify(newExams)],
    [LEGACY_SETTINGS_KEY, JSON.stringify({ enabled: normalized.dailyStudy, time: normalized.time })],
    [LEGACY_ID_KEY, newDaily[0] ?? ''],
  ]);
  let previousDailyIds: string[] = [];
  if (previousDaily) {
    try { previousDailyIds = JSON.parse(previousDaily) as string[]; }
    catch { previousDailyIds = [previousDaily]; }
  }
  const oldIds = [...previousDailyIds, legacyId ?? '', ...previousExams].filter((id) => Boolean(id) && !newDaily.includes(id) && !newExams.includes(id));
  await Promise.all(oldIds.map((id) => Notifications.cancelScheduledNotificationAsync(id).catch(() => undefined)));
}

export async function reconcileExamReminders(exams: Record<string, ExamRecord>, subjects: SubjectRecord[]) {
  if (Platform.OS === 'web') return;
  const settings = await getStudyReminderPreferences();
  const rawIds = await AsyncStorage.getItem(EXAM_IDS_KEY);
  let previousIds: string[] = [];
  try { previousIds = rawIds ? JSON.parse(rawIds) as string[] : []; } catch { previousIds = []; }
  if (!settings.exams) return;
  const permission = await Notifications.getPermissionsAsync().catch(() => null);
  if (!permission?.granted) {
    await Promise.all(previousIds.map((id) => Notifications.cancelScheduledNotificationAsync(id).catch(() => undefined)));
    await AsyncStorage.setItem(EXAM_IDS_KEY, '[]');
    return;
  }
  await prepareAndroidChannel();
  const nextIds = await scheduleExamNotifications(exams, subjects, settings.examDaysBefore);
  await AsyncStorage.setItem(EXAM_IDS_KEY, JSON.stringify(nextIds));
  await Promise.all(previousIds.map((id) => Notifications.cancelScheduledNotificationAsync(id).catch(() => undefined)));
}

// Backwards-compatible API for the Profile screen while reminders move to Settings.
export async function getDailyStudyReminder(): Promise<DailyStudyReminder> {
  const settings = await getStudyReminderPreferences();
  return { enabled: settings.dailyStudy, time: settings.time };
}

export async function saveDailyStudyReminder(reminder: DailyStudyReminder) {
  const current = await getStudyReminderPreferences();
  await saveStudyReminderPreferences({ ...current, dailyStudy: reminder.enabled, time: reminder.time, times: [reminder.time] });
}

export async function sendTestStudyReminder() {
  if (Platform.OS === 'web') throw new Error('Test reminders are available in the iPhone and Android apps.');
  await prepareAndroidChannel();
  await requestNotificationPermission();
  await Notifications.scheduleNotificationAsync({
    content: { title: 'Medora test reminder', body: 'Notifications are working. Your study reminder is ready.', sound: false },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 5, ...(Platform.OS === 'android' ? { channelId: ANDROID_CHANNEL_ID } : {}) },
  });
}
