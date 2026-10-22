import { cardShadow } from '@/components/gloss';
import { ink, p, useProgressPalette } from '@/components/progress/theme';
import { StudyIcon, type StudyIconName } from '@/components/study-icon';
import { appColor } from '@/constants/adaptive-color';
import { LEGAL, type LegalPageId } from '@/constants/legal-content';
import { ui } from '@/constants/ui';
import { useAppSettings } from '@/services/app-settings-context';
import Constants from 'expo-constants';
import { Image } from 'expo-image';
import { Stack, router } from 'expo-router';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

/** More information: privacy, health disclaimer, terms, licences, contact and the app version. */
export default function AboutSettings() {
  const { preferences } = useAppSettings();
  const language = preferences.language;
  const L = (en: string, no: string) => (language === 'no' ? no : en);
  const palette = useProgressPalette();
  const version = Constants.expoConfig?.version ?? '1.0.0';

  const openLegal = (page: LegalPageId) => () => router.push({ pathname: '/legal', params: { page } });
  const contact = () => {
    if (LEGAL.contactEmail) void Linking.openURL(`mailto:${LEGAL.contactEmail}`);
    else router.push('/settings/help');
  };

  const rows: { icon: StudyIconName; title: string; value?: string; onPress?: () => void }[] = [
    { icon: 'shieldLock', title: L('Privacy', 'Personvern'), onPress: openLegal('privacy') },
    { icon: 'heartPulse', title: L('Health disclaimer', 'Helseforbehold'), onPress: openLegal('health') },
    { icon: 'note', title: L('Terms of use', 'Vilkår for bruk'), onPress: openLegal('terms') },
    { icon: 'checkShield', title: L('Licence information', 'Lisensinformasjon'), onPress: openLegal('licenses') },
    { icon: 'mail', title: L('Contact us', 'Kontakt oss'), onPress: contact },
    { icon: 'info', title: L('Version', 'Versjon'), value: version },
  ];

  return (
    <SafeAreaView style={ui.container} edges={['top']}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Pressable accessibilityRole="button" accessibilityLabel={L('Back', 'Tilbake')} onPress={() => router.back()} style={({ pressed }) => [styles.back, pressed && p.pressed]} hitSlop={10}>
          <StudyIcon name="back" size={20} color={ink.secondary} />
        </Pressable>
        <Text style={styles.title} accessibilityRole="header">{L('More information', 'Mer informasjon')}</Text>

        <View style={styles.group}>
          {rows.map((row, index) => {
            const content = (
              <>
                <View style={styles.rowIcon}><StudyIcon name={row.icon} size={21} color={palette.accent} /></View>
                <Text style={[styles.rowTitle, p.grow]}>{row.title}</Text>
                {row.value ? <Text style={styles.rowValue}>{row.value}</Text> : null}
                {row.onPress ? <StudyIcon name="chevron" size={12} color={ink.muted} /> : null}
              </>
            );
            const style = [styles.row, index > 0 && styles.divider];
            return row.onPress
              ? <Pressable key={row.title} accessibilityRole="button" onPress={row.onPress} style={({ pressed }) => [...style, pressed && p.pressed]}>{content}</Pressable>
              : <View key={row.title} style={style} accessible accessibilityLabel={`${row.title} ${row.value ?? ''}`}>{content}</View>;
          })}
        </View>

        <View style={[styles.group, styles.brand]}>
          <Image source={require('@/assets/images/logo-symbol.png')} style={styles.logo} contentFit="contain" accessibilityLabel="Medora" />
          <Text style={styles.brandName}>Medora</Text>
          <Text style={styles.brandLine}>{L('Smarter medical learning.', 'Smartere medisinsk læring.')}</Text>
          <Text style={[p.small, styles.centered]}>{L('Made with a focus on learning, structure and progress.', 'Laget med fokus på læring, struktur og fremgang.')}</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingTop: 6, paddingBottom: 44, gap: 16 },
  back: { alignSelf: 'flex-start', width: 44, height: 44, justifyContent: 'center' },
  title: { color: ink.primary, fontSize: 30, fontWeight: '800', letterSpacing: -0.4 },
  centered: { textAlign: 'center' },
  group: { borderRadius: 22, paddingHorizontal: 16, paddingVertical: 4, backgroundColor: appColor('#FFFFFF', 'background'), borderWidth: 1, borderColor: appColor('#E7F0F4', 'border'), ...cardShadow },
  row: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 14 },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: appColor('#D8E6EC', 'border') },
  rowIcon: { width: 30, alignItems: 'center' },
  rowTitle: { color: ink.primary, fontSize: 15, fontWeight: '600' },
  rowValue: { color: ink.secondary, fontSize: 14 },
  brand: { alignItems: 'center', gap: 6, paddingVertical: 26 },
  logo: { width: 84, height: 84, marginBottom: 4 },
  brandName: { color: ink.primary, fontSize: 24, fontWeight: '800' },
  brandLine: { color: ink.secondary, fontSize: 14 },
});
