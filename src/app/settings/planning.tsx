import { appColor } from '@/constants/adaptive-color';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert } from 'react-native';
import { SettingsCard, SettingsNote, SettingsPage, SettingsToggle } from '@/components/settings-shared';
import { DEFAULT_STUDY_PREFERENCES, getStudyPreferences, saveStudyPreferences, type StudyPreferences } from '../../services/storage';

const OPTIONS: { key: keyof StudyPreferences; label: string; description: string }[] = [
  { key: 'autoGeneratePlan', label: 'AI planning recommendations', description: 'When enabled, send subject/topic names, study activity and exam timing to the AI to suggest a next step. Turn this off to stop automatic AI planning.' },
  { key: 'includeWeekends', label: 'Include weekends', description: 'Allow Saturday and Sunday in new weekly plans.' },
  { key: 'prioritizeWeakTopics', label: 'Prioritize weaker topics', description: 'Use low quiz scores and recent activity to choose review topics.' },
  { key: 'prioritizeUpcomingExams', label: 'Prioritize upcoming exams', description: 'Give nearer exam dates more weight in recommendations.' },
  { key: 'includeReviewSessions', label: 'Include review sessions', description: 'Favor spaced review when cards or topics are due.' },
  { key: 'includeFlashcards', label: 'Suggest flashcards', description: 'Allow the planner to recommend flashcard practice.' },
  { key: 'includeQuizzes', label: 'Suggest quizzes', description: 'Allow the planner to recommend quiz practice.' },
];

export default function PlanningSettings() {
  const [settings, setSettings] = useState<StudyPreferences>(DEFAULT_STUDY_PREFERENCES);
  const [busy, setBusy] = useState(true);
  useEffect(() => { let active = true; void getStudyPreferences().then((value) => { if (active) setSettings(value); }).finally(() => { if (active) setBusy(false); }); return () => { active = false; }; }, []);
  async function toggle(key: keyof StudyPreferences, value: boolean) {
    try { await saveStudyPreferences({ [key]: value }); setSettings((current) => ({ ...current, [key]: value })); }
    catch (error) { Alert.alert('Could not save plan preference', error instanceof Error ? error.message : 'Try again.'); }
  }
  return <SettingsPage title="Study plan" description="Control which priorities guide suggestions. Medora does not alter completed study activity.">
    {busy ? <ActivityIndicator color={appColor('#327E9D', 'text')} /> : <SettingsCard title="Plan behavior" description="These options are saved and included in cloud sync.">
      {OPTIONS.map((option) => <SettingsToggle key={option.key} title={option.label} description={option.description} value={settings[option.key] as boolean} onChange={(value) => void toggle(option.key, value)} />)}
    </SettingsCard>}
    <SettingsNote>Changes affect the AI recommendation and new plans. Existing per-subject schedules remain editable from that subject&apos;s Study Plan.</SettingsNote>
  </SettingsPage>;
}
