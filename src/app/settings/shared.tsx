import { LocalizedText as Text } from '@/components/localized-text';
import { appColor } from '@/constants/adaptive-color';
import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, View, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useAppSettings } from '../../services/app-settings-context';
import { tr } from '../../services/localization';

export function SettingsPage({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  const { preferences } = useAppSettings();
  const language = preferences.language;
  return <SafeAreaView style={styles.screen}>
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.back}><Text style={styles.backText}>‹  {tr('Settings', language)}</Text></Pressable>
      <Text style={styles.eyebrow}>MEDEXAM SETTINGS</Text>
      <Text style={styles.title}>{tr(title, language)}</Text>
      <Text style={styles.description}>{tr(description, language)}</Text>
      {children}
    </ScrollView>
  </SafeAreaView>;
}

export function SettingsCard({ title, description, children, style }: { title: string; description?: string; children: ReactNode; style?: ViewStyle }) {
  const { preferences } = useAppSettings();
  return <View style={[styles.card, style]}>
    <Text style={styles.cardTitle}>{tr(title, preferences.language)}</Text>
    {description ? <Text style={styles.cardDescription}>{tr(description, preferences.language)}</Text> : null}
    {children}
  </View>;
}

export function SettingsRow({ title, description, value, onPress, selected, destructive }: { title: string; description?: string; value?: string; onPress: () => void; selected?: boolean; destructive?: boolean }) {
  const { preferences } = useAppSettings();
  return <Pressable accessibilityRole="button" accessibilityState={selected === undefined ? undefined : { selected }} onPress={onPress} style={styles.row}>
    <View style={{ flex: 1 }}><Text style={[styles.rowTitle, destructive && styles.destructiveText]}>{tr(title, preferences.language)}</Text>{description ? <Text style={styles.rowDescription}>{tr(description, preferences.language)}</Text> : null}</View>
    {value ? <Text style={styles.rowValue}>{tr(value, preferences.language)}</Text> : null}
    <Text style={styles.chevron}>{selected ? '✓' : '›'}</Text>
  </Pressable>;
}

export function SettingsToggle({ title, description, value, onChange, disabled }: { title: string; description?: string; value: boolean; onChange: (value: boolean) => void; disabled?: boolean }) {
  const { preferences } = useAppSettings();
  return <View style={styles.toggleRow}>
    <View style={{ flex: 1, paddingRight: 14 }}><Text style={styles.rowTitle}>{tr(title, preferences.language)}</Text>{description ? <Text style={styles.rowDescription}>{tr(description, preferences.language)}</Text> : null}</View>
    <Switch accessibilityLabel={tr(title, preferences.language)} value={value} onValueChange={onChange} disabled={disabled} trackColor={{ false: '#D5E0E5', true: '#8BCBD4' }} thumbColor={value ? '#0F7181' : '#FFFFFF'} />
  </View>;
}

export function SettingsChoice({ options, value, onChange, multi = false }: { options: { value: string; label: string }[]; value: string | string[]; onChange: (value: string) => void; multi?: boolean }) {
  const { preferences } = useAppSettings();
  return <View style={styles.choices}>{options.map((option) => { const selected = Array.isArray(value) ? value.includes(option.value) : value === option.value; return <Pressable key={option.value} accessibilityRole="button" accessibilityState={{ selected }} onPress={() => onChange(option.value)} style={[styles.choice, selected && styles.choiceSelected]}><Text style={[styles.choiceText, selected && styles.choiceTextSelected]}>{tr(option.label, preferences.language)}</Text></Pressable>; })}</View>;
}

export function SettingsNote({ children }: { children: ReactNode }) {
  const { preferences } = useAppSettings();
  return <View style={styles.note}><Text style={styles.noteText}>{typeof children === 'string' ? tr(children, preferences.language) : children}</Text></View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: appColor('#F5FAFC', 'background') }, content: { padding: 20, paddingBottom: 42 },
  back: { alignSelf: 'flex-start', minHeight: 38, justifyContent: 'center', paddingRight: 12 }, backText: { color: appColor('#327E9D', 'text'), fontWeight: '700', fontSize: 14 },
  eyebrow: { color: appColor('#448EA8', 'text'), fontSize: 10, fontWeight: '800', letterSpacing: 1.5, marginTop: 9 },
  title: { color: appColor('#17324D', 'text'), fontSize: 29, fontWeight: '800', marginTop: 6 }, description: { color: appColor('#718493', 'text'), fontSize: 13, lineHeight: 19, marginTop: 6, marginBottom: 18 },
  card: { backgroundColor: appColor('#FFFFFF', 'background'), borderRadius: 18, padding: 15, marginBottom: 13, borderWidth: 1, borderColor: appColor('#E7F0F4', 'border') }, cardTitle: { color: appColor('#17324D', 'text'), fontSize: 15, fontWeight: '800' }, cardDescription: { color: appColor('#718493', 'text'), fontSize: 12, lineHeight: 17, marginTop: 4, marginBottom: 8 },
  row: { minHeight: 54, flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, borderTopColor: '#EDF3F6', paddingVertical: 10, gap: 8 }, rowTitle: { color: appColor('#315267', 'text'), fontSize: 13, fontWeight: '700' }, rowDescription: { color: appColor('#718493', 'text'), fontSize: 11, lineHeight: 16, marginTop: 2 }, rowValue: { color: appColor('#327E9D', 'text'), fontSize: 12, fontWeight: '700' }, chevron: { color: appColor('#83A3B1', 'text'), fontSize: 22, marginLeft: 3 }, destructiveText: { color: appColor('#BA3441', 'text') },
  toggleRow: { minHeight: 58, flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, borderTopColor: '#EDF3F6', paddingVertical: 9 },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }, choice: { minHeight: 36, paddingHorizontal: 11, borderRadius: 11, backgroundColor: appColor('#F4F8FA', 'background'), borderWidth: 1, borderColor: appColor('#E4EDF1', 'border'), justifyContent: 'center', alignItems: 'center' }, choiceSelected: { backgroundColor: appColor('#E1F3F7', 'background'), borderColor: appColor('#7CC1D0', 'border') }, choiceText: { color: appColor('#577082', 'text'), fontSize: 12, fontWeight: '700' }, choiceTextSelected: { color: appColor('#0F7181', 'text') },
  note: { backgroundColor: appColor('#E7F4F8', 'background'), borderRadius: 13, padding: 12, marginBottom: 13 }, noteText: { color: appColor('#577082', 'text'), fontSize: 12, lineHeight: 18 },
});
