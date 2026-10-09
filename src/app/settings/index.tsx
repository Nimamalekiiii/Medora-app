import { LocalizedText as Text } from '@/components/localized-text';
import { SettingsCard, SettingsPage, SettingsRow } from '@/components/settings-shared';
import { appColor } from '@/constants/adaptive-color';
import { useAppSettings } from '@/services/app-settings-context';
import Constants from 'expo-constants';
import { router, type Href } from 'expo-router';
import { StyleSheet } from 'react-native';

const APPEARANCE_LABEL = { system: 'Automatic', light: 'Light', dark: 'Dark' } as const;
const LANGUAGE_LABEL = { en: 'English', no: 'Norsk' } as const;

const open = (path: string) => () => router.push(path as Href);

export default function SettingsHome() {
  const { preferences } = useAppSettings();

  return <SettingsPage title="Settings" description="Customize your Medora experience">
    <SettingsCard icon="book" title="Study">
      <SettingsRow icon="calendar" title="Study preferences" onPress={open('/settings/study')} />
      <SettingsRow icon="target" title="Study plan" onPress={open('/settings/planning')} />
    </SettingsCard>

    <SettingsCard icon="bell" title="Notifications">
      <SettingsRow icon="bell" title="Reminders" onPress={open('/settings/notifications')} />
    </SettingsCard>

    <SettingsCard icon="settings" title="App">
      <SettingsRow icon="appearance" title="Appearance" value={APPEARANCE_LABEL[preferences.appearance]} onPress={open('/settings/appearance')} />
      <SettingsRow icon="globe" title="Language" value={LANGUAGE_LABEL[preferences.language]} onPress={open('/settings/language')} />
      <SettingsRow icon="sparkles" title="AI preferences" onPress={open('/settings/ai')} />
    </SettingsCard>

    <SettingsCard icon="person" title="Account">
      <SettingsRow icon="person" title="Personal information" onPress={open('/account')} />
      <SettingsRow icon="lock" title="Data, sync and security" onPress={open('/settings/data')} />
      <SettingsRow icon="shield" title="Privacy and data" onPress={open('/settings/privacy')} />
    </SettingsCard>

    <SettingsCard icon="help" title="Support">
      <SettingsRow icon="help" title="Help & FAQ" onPress={open('/settings/help')} />
      <SettingsRow icon="info" title="About Medora" onPress={open('/settings/about')} />
    </SettingsCard>

    <Text style={styles.version}>Medora {Constants.expoConfig?.version ?? '1.0.0'}</Text>
  </SettingsPage>;
}

const styles = StyleSheet.create({
  version: { color: appColor('#9AAAB4', 'text'), fontSize: 12, textAlign: 'center', marginTop: 6 },
});
