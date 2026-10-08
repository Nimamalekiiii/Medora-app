import { appColor } from '@/constants/adaptive-color';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert } from 'react-native';
import { SettingsCard, SettingsChoice, SettingsPage, SettingsRow, SettingsNote, SettingsToggle } from './shared';
import { DEFAULT_STUDY_PREFERENCES, getStudyPreferences, saveStudyPreferences, type StudyMethod, type StudyPeriod, type StudyPreferences } from '../../services/storage';

const DAYS = [{ label: 'Mon', value: 1 }, { label: 'Tue', value: 2 }, { label: 'Wed', value: 3 }, { label: 'Thu', value: 4 }, { label: 'Fri', value: 5 }, { label: 'Sat', value: 6 }, { label: 'Sun', value: 0 }];
const METHODS: { value: StudyMethod; label: string }[] = [{ value: 'active_recall', label: 'Active recall' }, { value: 'flashcards', label: 'Flashcards' }, { value: 'quiz', label: 'Quizzes' }, { value: 'review', label: 'Review' }];

export default function StudySettings() {
  const [settings, setSettings] = useState<StudyPreferences>(DEFAULT_STUDY_PREFERENCES);
  const [busy, setBusy] = useState(true);
  const [saving, setSaving] = useState(false);
  useEffect(() => { let active = true; void getStudyPreferences().then((value) => { if (active) setSettings(value); }).finally(() => { if (active) setBusy(false); }); return () => { active = false; }; }, []);
  async function update(patch: Partial<StudyPreferences>) {
    const next = { ...settings, ...patch };
    if (patch.studyDays && next.studyDays.length === 0) return;
    setSaving(true);
    try { await saveStudyPreferences(patch); setSettings(next); }
    catch (error) { Alert.alert('Could not save study preferences', error instanceof Error ? error.message : 'Try again.'); }
    finally { setSaving(false); }
  }
  const toggleDay = (day: number) => {
    const studyDays = settings.studyDays.includes(day) ? settings.studyDays.filter((item) => item !== day) : [...settings.studyDays, day];
    void update({ studyDays, includeWeekends: studyDays.some((item) => item === 0 || item === 6) });
  };
  const toggleMethod = (method: StudyMethod) => void update({ preferredMethods: settings.preferredMethods.includes(method) ? settings.preferredMethods.filter((item) => item !== method) : [...settings.preferredMethods, method] });

  return <SettingsPage title="Study preferences" description="Set a routine that MedExam and the study assistant can follow.">
    {busy ? <ActivityIndicator color={appColor('#327E9D', 'text')} /> : <>
      <SettingsCard title="Daily study goal" description="The Home assistant uses this target when it suggests what to do next.">
        <SettingsChoice value={String(settings.dailyGoalMinutes)} onChange={(v) => void update({ dailyGoalMinutes: Number(v) })} options={[{ value: '30', label: '30 min' }, { value: '45', label: '45 min' }, { value: '60', label: '1 hour' }, { value: '120', label: '2 hours' }]} />
      </SettingsCard>
      <SettingsCard title="Study days" description="Select at least one day. The planner uses this as the default for new plans.">
        <SettingsChoice value="" onChange={(v) => toggleDay(Number(v))} options={DAYS.map((day) => ({ value: String(day.value), label: `${settings.studyDays.includes(day.value) ? '✓ ' : ''}${day.label}` }))} />
      </SettingsCard>
      <SettingsCard title="Preferred study time">
        <SettingsChoice value={settings.preferredStudyTime} onChange={(v) => void update({ preferredStudyTime: v as StudyPeriod })} options={[{ value: 'morning', label: 'Morning' }, { value: 'afternoon', label: 'Afternoon' }, { value: 'evening', label: 'Evening' }]} />
      </SettingsCard>
      <SettingsCard title="Study session" description="Used by study-plan suggestions and focus-session defaults.">
        <SettingsChoice value={String(settings.sessionLengthMinutes)} onChange={(v) => void update({ sessionLengthMinutes: Number(v) })} options={[15, 25, 45, 60, 90].map((n) => ({ value: String(n), label: `${n} min` }))} />
        <SettingsRow title="Break duration" value={`${settings.breakDurationMinutes} min`} onPress={() => void update({ breakDurationMinutes: settings.breakDurationMinutes === 5 ? 10 : settings.breakDurationMinutes === 10 ? 15 : 5 })} description="Tap to cycle: 5, 10, 15 minutes" />
      </SettingsCard>
      <SettingsCard title="Preferred study methods" description="The Home AI favors these activities when it makes a recommendation.">
        {METHODS.map((method) => <SettingsToggle key={method.value} title={method.label} value={settings.preferredMethods.includes(method.value)} onChange={() => toggleMethod(method.value)} disabled={settings.preferredMethods.length === 1 && settings.preferredMethods.includes(method.value)} />)}
      </SettingsCard>
      <SettingsRow title="Study plan options" description="Exam priority, weak topics, review and automatic planning" onPress={() => router.push('/settings/planning')} />
      {saving ? <ActivityIndicator color={appColor('#327E9D', 'text')} /> : null}
      <SettingsNote>At least one study day and one study method must remain selected. Preferences sync with your signed-in account through MedExam cloud backup.</SettingsNote>
    </>}
  </SettingsPage>;
}
