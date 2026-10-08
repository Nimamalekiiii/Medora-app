import { LocalizedText as Text } from '@/components/localized-text';
import { appColor } from '@/constants/adaptive-color';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Platform, Pressable, View } from 'react-native';
import { SettingsCard, SettingsChoice, SettingsNote, SettingsPage, SettingsToggle } from './shared';
import { getStudyReminderPreferences, ReminderPermissionError, saveStudyReminderPreferences, sendTestStudyReminder, type StudyReminderPreferences } from '../../services/study-reminder';

const TIMES = ['08:00', '12:00', '17:00', '19:00', '20:00', '21:00'];
const CATEGORIES: { key: 'dailyStudy' | 'dailyPlan' | 'reviews' | 'flashcards' | 'exams'; label: string; description: string }[] = [
  { key: 'dailyStudy', label: 'Daily study reminder', description: 'A single daily notification for focused study time.' },
  { key: 'dailyPlan', label: 'Daily plan reminder', description: 'Remind you to check today’s suggested plan.' },
  { key: 'reviews', label: 'Review reminders', description: 'Nudge you to revisit studied topics.' },
  { key: 'flashcards', label: 'Flashcard reminders', description: 'Include flashcard practice in the daily study nudge.' },
  { key: 'exams', label: 'Exam reminders', description: 'Schedule notifications before saved exam dates.' },
];

export default function NotificationSettings() {
  const [prefs, setPrefs] = useState<StudyReminderPreferences | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  useEffect(() => { let active = true; void getStudyReminderPreferences().then((value) => { if (active) setPrefs(value); }).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, []);
  async function save(next: StudyReminderPreferences, success?: string) {
    setBusy(true);
    try { await saveStudyReminderPreferences(next); setPrefs(next); if (success) Alert.alert('Reminder saved', success); }
    catch (error) {
      if (error instanceof ReminderPermissionError) Alert.alert('Allow notifications', error.message, [{ text: 'Cancel', style: 'cancel' }, { text: 'Open Settings', onPress: () => { void Linking.openSettings(); } }]);
      else Alert.alert('Could not save reminder', error instanceof Error ? error.message : 'Try again.');
    } finally { setBusy(false); }
  }
  async function sendTest() {
    setBusy(true);
    try { await sendTestStudyReminder(); Alert.alert('Test scheduled', 'Put MedExam in the background. The test notification should arrive in about five seconds.'); }
    catch (error) { if (error instanceof ReminderPermissionError) Alert.alert('Allow notifications', error.message, [{ text: 'Cancel', style: 'cancel' }, { text: 'Open Settings', onPress: () => { void Linking.openSettings(); } }]); else Alert.alert('Test failed', error instanceof Error ? error.message : 'Try again.'); }
    finally { setBusy(false); }
  }
  if (loading || !prefs) return <SettingsPage title="Notifications" description="Control your study reminders."><ActivityIndicator color={appColor('#327E9D', 'text')} /></SettingsPage>;

  return <SettingsPage title="Notifications" description="Choose which reminders MedExam can schedule on this device.">
    {Platform.OS === 'web' ? <SettingsNote>Local notifications require the iPhone or Android app.</SettingsNote> : <>
      <SettingsCard title="Daily reminders" description="MedExam combines enabled daily categories into one notification to avoid sending several alerts at once.">
        {CATEGORIES.filter((option) => option.key !== 'exams').map((option) => <SettingsToggle key={option.key} title={option.label} description={option.description} value={prefs[option.key]} onChange={(value) => void save({ ...prefs, [option.key]: value })} disabled={busy} />)}
        <Text style={{ color: appColor('#315267', 'text'), fontSize: 12, fontWeight: '700', marginTop: 10 }}>Daily reminder times (choose up to 3)</Text>
        <SettingsChoice multi value={prefs.times} onChange={(time) => {
          const times = prefs.times.includes(time) ? prefs.times.filter((item) => item !== time) : prefs.times.length < 3 ? [...prefs.times, time].sort() : prefs.times;
          if (times.length === prefs.times.length && !prefs.times.includes(time)) return Alert.alert('Limit reached', 'Choose up to three daily reminder times.');
          if (!times.length) return Alert.alert('Keep one time selected', 'Select at least one time for your daily reminders.');
          void save({ ...prefs, times, time: times[0] }, `Your daily reminder will be sent at ${times.join(', ')}.`);
        }} options={TIMES.map((time) => ({ value: time, label: time }))} />
      </SettingsCard>
      <SettingsCard title="Exam reminders" description="Notifications use the exam dates saved under each subject. They are rescheduled when an exam date changes.">
        <SettingsToggle title="Enable exam reminders" description="Send a notification before each upcoming exam." value={prefs.exams} onChange={(value) => void save({ ...prefs, exams: value })} disabled={busy} />
        {prefs.exams && [7, 3, 1, 0].map((day) => <SettingsToggle key={day} title={day === 0 ? 'On exam day' : `${day} days before`} value={prefs.examDaysBefore.includes(day)} onChange={(value) => {
          const examDaysBefore = value ? [...prefs.examDaysBefore, day] : prefs.examDaysBefore.filter((item) => item !== day);
          void save({ ...prefs, examDaysBefore });
        }} disabled={busy} />)}
      </SettingsCard>
      <View style={{ paddingHorizontal: 2, marginBottom: 12 }}><Pressable accessibilityRole="button" disabled={busy} onPress={() => { void sendTest(); }} style={{ alignSelf: 'flex-start', paddingVertical: 10 }}><Text style={{ color: appColor('#327E9D', 'text'), fontWeight: '800' }}>{busy ? 'Working…' : 'Send a test notification'}</Text></Pressable></View>
      <SettingsNote>All reminders are stored and scheduled on this device. Your phone may still silence them if MedExam notifications are disabled in system settings.</SettingsNote>
    </>}
  </SettingsPage>;
}
