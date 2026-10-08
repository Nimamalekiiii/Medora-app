import { LocalizedText as Text } from '@/components/localized-text';
import { appColor } from '@/constants/adaptive-color';
import Constants from 'expo-constants';
import { useState } from 'react';
import { Alert, Pressable, Share, StyleSheet, TextInput, View } from 'react-native';
import { SettingsPage } from './shared';
import { useAppSettings } from '../../services/app-settings-context';
import { tr } from '../../services/localization';

const FAQ = [
  ['How is my study data saved?', 'MedExam saves study data on this device as you use it. When cloud sync is configured and you are signed in, it syncs to your private account. Use Data & account to export or restore a backup.'],
  ['Does AI see my notes?', 'AI uses the subject, topic and notes you choose when generating cards or questions. When you tap Review my progress, MedExam sends calculated summaries of your study activity, quiz and practice results, exam dates, saved plans and study preferences. It does not send your study notes or account email for that progress review. Automatic study-plan recommendations have a separate setting. Avoid sensitive personal or patient information.'],
  ['Can I undo deleting study data?', 'MedExam first creates a recovery backup on this device. You can restore it from Data & account → Recovery options.'],
  ['How do I report a problem?', 'Use Send feedback below. Your device opens its share sheet so you can choose Mail or another app. Review the message before sending it.'],
];

export default function HelpSettings() {
  const { preferences } = useAppSettings();
  const [open, setOpen] = useState<number | null>(0);
  const [feedback, setFeedback] = useState('');
  async function sendFeedback() {
    if (!feedback.trim()) return Alert.alert('Add a little detail', 'Describe what happened before opening the share sheet.');
    try {
      await Share.share({ title: 'MedExam feedback', message: `MedExam feedback\n\n${feedback.trim()}\n\nApp version: ${require('expo-constants').default.expoConfig?.version ?? 'unknown'}` });
    } catch (error) {
      Alert.alert('Could not open sharing', error instanceof Error ? error.message : 'Try again.');
    }
  }
  return <SettingsPage title="Help & FAQ" description="Quick answers and a simple way to share feedback.">
    <View style={styles.card}>{FAQ.map(([question, answer], index) => <View key={question} style={styles.faqItem}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: open === index }} onPress={() => setOpen(open === index ? null : index)} style={styles.questionRow}><Text style={styles.question}>{tr(question, preferences.language)}</Text><Text style={styles.chevron}>{open === index ? '−' : '+'}</Text></Pressable>
      {open === index ? <Text style={styles.answer}>{tr(answer, preferences.language)}</Text> : null}
    </View>)}</View>
    <View style={styles.card}><Text style={styles.heading}>{tr('Send feedback', preferences.language)}</Text><Text style={styles.answer}>Describe a problem or suggestion. MedExam will open your device share sheet; you choose where to send it.</Text>
      <TextInput accessibilityLabel="Feedback" multiline value={feedback} onChangeText={setFeedback} placeholder="What should we know?" placeholderTextColor={appColor('#8296A2', 'text')} style={styles.input} textAlignVertical="top" />
      <Pressable accessibilityRole="button" onPress={() => void sendFeedback()} style={styles.button}><Text style={styles.buttonText}>{tr('Send feedback', preferences.language)}</Text></Pressable>
    </View>
  </SettingsPage>;
}

const styles = StyleSheet.create({
  card: { backgroundColor: appColor('#FFFFFF', 'background'), borderRadius: 18, padding: 15, marginBottom: 13, borderWidth: 1, borderColor: appColor('#E7F0F4', 'border') },
  faqItem: { borderBottomWidth: 1, borderBottomColor: '#EDF3F6', paddingVertical: 8 }, questionRow: { minHeight: 38, flexDirection: 'row', alignItems: 'center' }, question: { color: appColor('#17324D', 'text'), fontSize: 14, fontWeight: '700', flex: 1 }, chevron: { color: appColor('#327E9D', 'text'), fontSize: 20, paddingHorizontal: 5 }, answer: { color: appColor('#718493', 'text'), fontSize: 12, lineHeight: 19, paddingVertical: 7 }, heading: { color: appColor('#17324D', 'text'), fontSize: 15, fontWeight: '800' }, input: { minHeight: 100, borderWidth: 1, borderColor: appColor('#D8E6EC', 'border'), borderRadius: 12, padding: 12, color: appColor('#17324D', 'text'), marginTop: 12, backgroundColor: appColor('#F7FBFE', 'background') }, button: { alignSelf: 'flex-start', backgroundColor: appColor('#327E9D', 'background'), borderRadius: 12, minHeight: 42, justifyContent: 'center', paddingHorizontal: 15, marginTop: 12 }, buttonText: { color: appColor('#FFFFFF', 'text'), fontSize: 13, fontWeight: '800' },
});
