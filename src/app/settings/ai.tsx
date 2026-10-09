import { appColor } from '@/constants/adaptive-color';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert } from 'react-native';
import { SettingsCard, SettingsChoice, SettingsNote, SettingsPage, SettingsToggle } from '@/components/settings-shared';
import { DEFAULT_AI_PREFERENCES, getAIPreferences, saveAIPreferences, type AIPreferences } from '../../services/storage';

export default function AISettings() {
  const [settings, setSettings] = useState<AIPreferences>(DEFAULT_AI_PREFERENCES);
  const [busy, setBusy] = useState(true);
  useEffect(() => { let active = true; void getAIPreferences().then((value) => { if (active) setSettings(value); }).finally(() => { if (active) setBusy(false); }); return () => { active = false; }; }, []);
  async function update(patch: Partial<AIPreferences>) {
    try { await saveAIPreferences(patch); setSettings((current) => ({ ...current, ...patch })); }
    catch (error) { Alert.alert('Could not save AI preferences', error instanceof Error ? error.message : 'Try again.'); }
  }
  return <SettingsPage title="AI preferences" description="Set defaults for AI study materials. You can adjust the number for an individual generation too.">
    {busy ? <ActivityIndicator color={appColor('#327E9D', 'text')} /> : <>
      <SettingsCard title="Available AI study tools" description="These controls only affect features currently available in Medora.">
        <SettingsToggle title="Generate quizzes" description="Allow AI quiz generation from a topic and optional notes." value={settings.generateQuizzes} onChange={(value) => void update({ generateQuizzes: value })} />
        <SettingsToggle title="Generate flashcards" description="Allow AI flashcard generation from a topic and optional notes." value={settings.generateFlashcards} onChange={(value) => void update({ generateFlashcards: value })} />
      </SettingsCard>
      <SettingsCard title="Default amount">
        <SettingsChoice value={String(settings.questionCount)} onChange={(value) => void update({ questionCount: Number(value) as AIPreferences['questionCount'] })} options={[5, 10, 20, 30, 50].map((value) => ({ value: String(value), label: `${value} questions` }))} />
        <SettingsChoice value={String(settings.flashcardCount)} onChange={(value) => void update({ flashcardCount: Number(value) as AIPreferences['flashcardCount'] })} options={[10, 20, 30, 50].map((value) => ({ value: String(value), label: `${value} cards` }))} />
      </SettingsCard>
      <SettingsCard title="Question difficulty">
        <SettingsChoice value={settings.difficulty} onChange={(value) => void update({ difficulty: value as AIPreferences['difficulty'] })} options={[{ value: 'easy', label: 'Foundational' }, { value: 'medium', label: 'Balanced' }, { value: 'hard', label: 'Challenging' }]} />
      </SettingsCard>
      <SettingsCard title="Explanation detail">
        <SettingsChoice value={settings.explanationStyle} onChange={(value) => void update({ explanationStyle: value as AIPreferences['explanationStyle'] })} options={[{ value: 'short', label: 'Short' }, { value: 'balanced', label: 'Balanced' }, { value: 'detailed', label: 'Detailed' }]} />
      </SettingsCard>
      <SettingsNote>AI material can be inaccurate. Check medical content against course material and trusted sources. Summaries and clinical-case generation are not available in this app build, so no inactive controls are shown.</SettingsNote>
    </>}
  </SettingsPage>;
}
