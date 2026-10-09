import { useAppSettings } from '../../services/app-settings-context';
import { tr } from '../../services/localization';
import { Alert } from 'react-native';
import { SettingsCard, SettingsChoice, SettingsNote, SettingsPage } from '@/components/settings-shared';

const OPTIONS = [
  { value: 'system', label: 'Follow device' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

export default function AppearanceSettings() {
  const { preferences, setAppearance } = useAppSettings();
  async function update(value: string) {
    try {
      await setAppearance(value as import('../../services/storage').AppAppearance);
    } catch (error) {
      Alert.alert('Could not save appearance', error instanceof Error ? error.message : 'Try again.');
    }
  }
  return <SettingsPage title="Appearance" description="Choose a comfortable display style for Medora.">
    <SettingsCard title="Appearance preference">
      <SettingsChoice value={preferences.appearance} onChange={(value) => void update(value)} options={OPTIONS} />
    </SettingsCard>
    <SettingsNote>{tr('Appearance saved', preferences.language)}. {tr('The app appearance updates immediately and is saved with your preferences.', preferences.language)}</SettingsNote>
  </SettingsPage>;
}
