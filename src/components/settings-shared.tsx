import { LocalizedText as Text } from '@/components/localized-text';
import { StudyIcon, type StudyIconName } from '@/components/study-icon';
import { appColor } from '@/constants/adaptive-color';
import { useAppSettings } from '@/services/app-settings-context';
import { tr } from '@/services/localization';
import { router } from 'expo-router';
import { Children, Fragment, isValidElement, type ReactNode } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Switch, View, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

/**
 * Building blocks shared by the Profile tab and every Settings screen: the
 * page frame, grouped cards, rows, toggles, choice chips and notes. Keeping
 * them here is what makes those screens look and behave the same.
 */

export function SettingsPage({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  const { preferences } = useAppSettings();
  const language = preferences.language;
  return <SafeAreaView style={styles.screen} edges={['top']}>
    <ScrollView
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
      automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
      showsVerticalScrollIndicator={false}
    >
      <Pressable accessibilityRole="button" accessibilityLabel={tr('Back', language)} onPress={() => router.back()} style={({ pressed }) => [styles.back, pressed && styles.pressed]} hitSlop={10}>
        <StudyIcon name="back" size={20} color={appColor('#327E9D', 'text')} />
      </Pressable>
      <Text style={styles.title} accessibilityRole="header">{tr(title, language)}</Text>
      {description ? <Text style={styles.description}>{tr(description, language)}</Text> : null}
      <View style={styles.body}>{children}</View>
    </ScrollView>
  </SafeAreaView>;
}

/** A titled group. Rows and toggles placed next to each other get a divider between them. */
export function SettingsCard({ title, description, icon, children, style }: { title?: string; description?: string; icon?: StudyIconName; children: ReactNode; style?: ViewStyle }) {
  const { preferences } = useAppSettings();
  const items = Children.toArray(children);
  const isRow = (item: ReactNode) => isValidElement(item) && (item.type === SettingsRow || item.type === SettingsToggle);
  return <View style={[styles.card, style]}>
    {title ? <View style={styles.cardHeader}>
      {icon ? <StudyIcon name={icon} size={19} color={ACCENT} /> : null}
      <Text style={styles.cardTitle}>{tr(title, preferences.language)}</Text>
    </View> : null}
    {description ? <Text style={styles.cardDescription}>{tr(description, preferences.language)}</Text> : null}
    <View>
      {items.map((item, index) => (
        <Fragment key={isValidElement(item) && item.key != null ? item.key : index}>
          {index > 0 && isRow(item) && isRow(items[index - 1]) ? <View style={styles.divider} /> : null}
          {item}
        </Fragment>
      ))}
    </View>
  </View>;
}

export function SettingsRow({ title, description, value, onPress, selected, destructive, icon }: {
  title: string; description?: string; value?: string; onPress: () => void; selected?: boolean; destructive?: boolean; icon?: StudyIconName;
}) {
  const { preferences } = useAppSettings();
  return <Pressable
    accessibilityRole="button"
    accessibilityState={selected === undefined ? undefined : { selected }}
    onPress={onPress}
    style={({ pressed }) => [styles.row, pressed && styles.pressed]}
  >
    {icon ? <View style={styles.rowIcon}><StudyIcon name={icon} size={21} color={destructive ? DESTRUCTIVE : appColor('#577082', 'text')} /></View> : null}
    <View style={styles.rowText}>
      <Text style={[styles.rowTitle, destructive && styles.destructiveText]}>{tr(title, preferences.language)}</Text>
      {description ? <Text style={styles.rowDescription}>{tr(description, preferences.language)}</Text> : null}
    </View>
    {value ? <Text style={styles.rowValue} numberOfLines={1}>{tr(value, preferences.language)}</Text> : null}
    {selected ? <StudyIcon name="check" size={16} color={ACCENT} /> : selected === undefined && !destructive ? <StudyIcon name="chevron" size={13} color={appColor('#8DA2AF', 'text')} /> : null}
  </Pressable>;
}

export function SettingsToggle({ title, description, value, onChange, disabled }: { title: string; description?: string; value: boolean; onChange: (value: boolean) => void; disabled?: boolean }) {
  const { preferences } = useAppSettings();
  return <View style={styles.row}>
    <View style={styles.rowText}>
      <Text style={styles.rowTitle}>{tr(title, preferences.language)}</Text>
      {description ? <Text style={styles.rowDescription}>{tr(description, preferences.language)}</Text> : null}
    </View>
    <Switch accessibilityLabel={tr(title, preferences.language)} value={value} onValueChange={onChange} disabled={disabled} trackColor={{ false: '#C9D6DC', true: ACCENT }} ios_backgroundColor="#C9D6DC" />
  </View>;
}

export function SettingsChoice({ options, value, onChange }: { options: { value: string; label: string }[]; value: string | string[]; onChange: (value: string) => void; multi?: boolean }) {
  const { preferences } = useAppSettings();
  return <View style={styles.choices}>{options.map((option) => {
    const selected = Array.isArray(value) ? value.includes(option.value) : value === option.value;
    return <Pressable key={option.value} accessibilityRole="button" accessibilityState={{ selected }} onPress={() => onChange(option.value)} style={({ pressed }) => [styles.choice, selected && styles.choiceSelected, pressed && styles.pressed]}>
      <Text style={[styles.choiceText, selected && styles.choiceTextSelected]}>{tr(option.label, preferences.language)}</Text>
    </Pressable>;
  })}</View>;
}

export function SettingsNote({ children }: { children: ReactNode }) {
  const { preferences } = useAppSettings();
  return <Text style={styles.note}>{typeof children === 'string' ? tr(children, preferences.language) : children}</Text>;
}

const DESTRUCTIVE = '#D9485A';
/** The blue used for icons, switches and selected choices. */
const ACCENT = '#3B9BD9';

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: appColor('#F7FBFE', 'background') },
  content: { paddingHorizontal: 20, paddingTop: 6, paddingBottom: 44 },
  pressed: { opacity: 0.6 },

  back: { alignSelf: 'flex-start', width: 44, height: 44, justifyContent: 'center' },
  title: { color: appColor('#17324D', 'text'), fontSize: 32, fontWeight: '800', letterSpacing: -0.5 },
  description: { color: appColor('#718493', 'text'), fontSize: 15, lineHeight: 21, marginTop: 6 },
  body: { marginTop: 20 },

  card: { backgroundColor: appColor('#FFFFFF', 'background'), borderRadius: 20, paddingHorizontal: 16, paddingVertical: 8, marginBottom: 16, borderWidth: 1, borderColor: appColor('#E7F0F4', 'border') },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 },
  cardTitle: { color: appColor('#17324D', 'text'), fontSize: 17, fontWeight: '800' },
  cardDescription: { color: appColor('#718493', 'text'), fontSize: 13, lineHeight: 18, marginBottom: 6 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: appColor('#D8E6EC', 'border'), marginLeft: 2 },

  row: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 9 },
  rowIcon: { width: 26, alignItems: 'center' },
  rowText: { flex: 1 },
  rowTitle: { color: appColor('#17324D', 'text'), fontSize: 15, fontWeight: '600' },
  rowDescription: { color: appColor('#718493', 'text'), fontSize: 12, lineHeight: 17, marginTop: 2 },
  rowValue: { maxWidth: 150, color: appColor('#718493', 'text'), fontSize: 14, fontWeight: '500' },
  destructiveText: { color: DESTRUCTIVE },

  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingVertical: 10 },
  choice: { minHeight: 38, minWidth: 44, paddingHorizontal: 13, borderRadius: 12, backgroundColor: appColor('#F4F8FA', 'background'), borderWidth: 1, borderColor: appColor('#E4EDF1', 'border'), justifyContent: 'center', alignItems: 'center' },
  choiceSelected: { backgroundColor: ACCENT, borderColor: ACCENT },
  choiceText: { color: appColor('#577082', 'text'), fontSize: 13, fontWeight: '700' },
  choiceTextSelected: { color: '#FFFFFF' },

  note: { color: appColor('#8799A4', 'text'), fontSize: 12, lineHeight: 18, marginTop: -4, marginBottom: 18, marginHorizontal: 4 },
});
