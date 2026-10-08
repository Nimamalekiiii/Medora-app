import { router } from 'expo-router';
import { SettingsCard, SettingsPage, SettingsRow, SettingsNote } from './shared';

export default function SettingsHome() {
  return <SettingsPage title="Settings" description="Personalize how MedExam plans, reminds and supports your study.">
    <SettingsCard title="Study">
      <SettingsRow title="Study preferences" description="Days, daily goal, study time and breaks" onPress={() => router.push('/settings/study' as never)} />
      <SettingsRow title="Study plan" description="Choose what the plan prioritizes" onPress={() => router.push('/settings/planning' as never)} />
    </SettingsCard>
    <SettingsCard title="Notifications">
      <SettingsRow title="Reminders" description="Daily study, exam and review reminders" onPress={() => router.push('/settings/notifications' as never)} />
    </SettingsCard>
    <SettingsCard title="App">
      <SettingsRow title="Appearance" description="Light, dark or follow the device" onPress={() => router.push('/settings/appearance' as never)} />
      <SettingsRow title="Language" description="Choose the app language" onPress={() => router.push('/settings/language' as never)} />
      <SettingsRow title="AI preferences" description="Quiz and flashcard generation" onPress={() => router.push('/settings/ai' as never)} />
    </SettingsCard>
    <SettingsCard title="Your account">
      <SettingsRow title="Data, sync & security" description="Backups, restore, cloud sync and sign-in" onPress={() => router.push('/settings/data' as never)} />
      <SettingsRow title="Privacy & data" description="AI use, export and deletion controls" onPress={() => router.push('/settings/privacy' as never)} />
    </SettingsCard>
    <SettingsCard title="Support">
      <SettingsRow title="Help & FAQ" description="Answers and ways to report a problem" onPress={() => router.push('/settings/help' as never)} />
      <SettingsRow title="About MedExam" description="Version, terms and licenses" onPress={() => router.push('/settings/about' as never)} />
    </SettingsCard>
    <SettingsNote>Study settings are saved on this device and included in your MedExam backup and cloud sync.</SettingsNote>
  </SettingsPage>;
}
