import { Alert } from 'react-native';
import { SettingsCard, SettingsChoice, SettingsNote, SettingsPage } from './shared';
import { useAppSettings } from '../../services/app-settings-context';
import { tr } from '../../services/localization';

export default function LanguageSettings() {
  const { preferences, setLanguage } = useAppSettings();
  async function update(value: string) {
    try {
      await setLanguage(value as import('../../services/storage').AppLanguage);
    } catch (error) {
      Alert.alert('Could not save language', error instanceof Error ? error.message : 'Try again.');
    }
  }
  return <SettingsPage title="Language" description="Choose the app language. Your choice is saved and used across settings, profile and navigation.">
    <SettingsCard title="Language">
      <SettingsChoice value={preferences.language} onChange={(value) => void update(value)} options={[{ value: 'en', label: 'English' }, { value: 'no', label: 'Norwegian' }]} />
    </SettingsCard>
    <SettingsNote>{tr('Language saved', preferences.language)}. {tr('The language choice is saved on this device and included in backups.', preferences.language)}</SettingsNote>
  </SettingsPage>;
}
