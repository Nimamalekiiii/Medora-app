import { LocalizedText as Text } from '@/components/localized-text';
import { appColor } from '@/constants/adaptive-color';
import Constants from 'expo-constants';
import { StyleSheet, View } from 'react-native';
import { useAppSettings } from '../../services/app-settings-context';
import { tr } from '../../services/localization';
import { SettingsPage } from '@/components/settings-shared';

export default function AboutSettings() {
  const { preferences } = useAppSettings();
  return <SettingsPage title="About Medora" description="App information, privacy notes and third-party disclosures.">
    <View style={styles.card}><Text style={styles.title}>Medora</Text><Text style={styles.copy}>{tr('A calm, structured study companion for medical exams.', preferences.language)}</Text><Text style={styles.label}>Version</Text><Text style={styles.copy}>{Constants.expoConfig?.version ?? '1.0.0'}</Text><Text style={styles.label}>Platform</Text><Text style={styles.copy}>{Constants.platform?.ios ? 'iOS' : Constants.platform?.android ? 'Android' : 'Web / Expo'}</Text></View>
    <View style={styles.card}><Text style={styles.section}>{tr('Privacy & AI', preferences.language)}</Text><Text style={styles.copy}>{tr('Study content stays on this device unless you sign in and configure cloud sync. AI study materials use the subject, topic and notes only when you request them. When you tap Review my progress, the app sends calculated progress summaries, exam details, saved study plans and study preferences so AI can interpret your activity and suggest a next step; it does not send your study notes or account email for this review. Automatic study-plan recommendations have a separate setting. Do not include sensitive or patient-identifiable information, and verify generated medical content against trusted course sources.', preferences.language)}</Text></View>
    <View style={styles.card}><Text style={styles.section}>{tr('Terms & licenses', preferences.language)}</Text><Text style={styles.copy}>{tr('Terms of service and third-party license details have not been published in this build.', preferences.language)}</Text></View>
  </SettingsPage>;
}

const styles = StyleSheet.create({ card: { backgroundColor: appColor('#FFFFFF', 'background'), borderRadius: 18, padding: 16, marginBottom: 13, borderWidth: 1, borderColor: appColor('#E7F0F4', 'border') }, title: { color: appColor('#17324D', 'text'), fontSize: 19, fontWeight: '800' }, section: { color: appColor('#17324D', 'text'), fontSize: 15, fontWeight: '800', marginBottom: 7 }, label: { color: appColor('#315267', 'text'), fontSize: 12, fontWeight: '700', marginTop: 13 }, copy: { color: appColor('#718493', 'text'), fontSize: 12, lineHeight: 19, marginTop: 5 } });
