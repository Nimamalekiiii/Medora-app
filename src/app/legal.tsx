import { Gloss, cardShadow } from '@/components/gloss';
import { ink, p, useProgressPalette } from '@/components/progress/theme';
import { StudyIcon } from '@/components/study-icon';
import { appColor } from '@/constants/adaptive-color';
import { LEGAL, LEGAL_PAGES, type LegalPageId } from '@/constants/legal-content';
import { ui } from '@/constants/ui';
import { useAppSettings } from '@/services/app-settings-context';
import { softTint } from '@/services/subject-look';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const param = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] ?? '' : value ?? '');

/**
 * The privacy pages, the health disclaimer, the terms and the licences.
 * One screen shows all of them; which one is chosen by the `page` parameter.
 * It can be opened before signing in, so it is linked from the sign-up form.
 */
export default function LegalScreen() {
  const params = useLocalSearchParams<{ page?: string | string[] }>();
  const requested = param(params.page) as LegalPageId;
  const id: LegalPageId = requested in LEGAL_PAGES ? requested : 'privacy';
  const page = LEGAL_PAGES[id];
  const { preferences } = useAppSettings();
  const language = preferences.language;
  const L = (text: { en: string; no: string }) => (language === 'no' ? text.no : text.en);
  const palette = useProgressPalette();
  const updated = new Date(`${LEGAL.lastUpdated}T12:00:00`).toLocaleDateString(language === 'no' ? 'nb-NO' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <SafeAreaView style={ui.container} edges={['top']}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Pressable accessibilityRole="button" accessibilityLabel={language === 'no' ? 'Tilbake' : 'Back'} onPress={() => router.back()} style={({ pressed }) => [styles.back, pressed && p.pressed]} hitSlop={10}>
          <StudyIcon name="back" size={20} color={ink.secondary} />
        </Pressable>

        <View style={styles.hero}>
          <View style={[styles.heroIcon, { backgroundColor: softTint(palette.accent) }]}>
            <Gloss />
            <StudyIcon name={page.icon} size={30} color={palette.accent} />
          </View>
          <View style={p.grow}>
            <Text style={styles.title} accessibilityRole="header">{L(page.title)}</Text>
            <Text style={styles.subtitle}>{L(page.subtitle)}</Text>
          </View>
        </View>

        {page.intro ? (
          <View style={[p.card, p.row]}>
            <StudyIcon name={page.icon} size={22} color={palette.accent} />
            <Text style={[p.body, p.grow]}>{L(page.intro)}</Text>
          </View>
        ) : null}

        {page.listTitle ? <Text style={styles.listTitle}>{L(page.listTitle)}</Text> : null}

        <View style={styles.group}>
          {page.items.map((item, index) => {
            const content = (
              <>
                <View style={styles.itemIcon}><StudyIcon name={item.icon} size={21} color={palette.accent} /></View>
                <View style={p.grow}>
                  <Text style={styles.itemTitle}>{L(item.title)}</Text>
                  <Text style={styles.itemDetail}>{L(item.detail)}</Text>
                </View>
                {item.link ? <StudyIcon name="chevron" size={12} color={ink.muted} /> : null}
              </>
            );
            const style = [styles.item, index > 0 && styles.divider];
            return item.link ? (
              <Pressable key={item.title.en} accessibilityRole="button" accessibilityLabel={`${L(item.title)}. ${L(item.detail)}`} onPress={() => router.push({ pathname: '/legal', params: { page: item.link } })} style={({ pressed }) => [...style, pressed && p.pressed]}>
                {content}
              </Pressable>
            ) : <View key={item.title.en} style={style}>{content}</View>;
          })}
        </View>

        {page.note ? (
          <View style={[p.inset, p.row]}>
            <StudyIcon name="info" size={19} color={palette.accent} />
            <Text style={[p.body, p.grow]}>{L(page.note)}</Text>
          </View>
        ) : null}

        {LEGAL.contactEmail ? (
          <Pressable accessibilityRole="link" onPress={() => { void Linking.openURL(`mailto:${LEGAL.contactEmail}`); }} style={({ pressed }) => [p.inset, p.row, pressed && p.pressed]}>
            <StudyIcon name="mail" size={19} color={palette.accent} />
            <Text style={[p.body, p.grow]}>{language === 'no' ? 'Spørsmål? Skriv til' : 'Questions? Write to'} {LEGAL.contactEmail}</Text>
          </Pressable>
        ) : null}

        <Text style={[p.small, styles.footer]}>
          {LEGAL.publisher ? `${language === 'no' ? 'Utgitt av' : 'Published by'} ${LEGAL.publisher} · ` : ''}
          {language === 'no' ? 'Sist oppdatert' : 'Last updated'} {updated}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingTop: 6, paddingBottom: 44, gap: 14 },
  back: { alignSelf: 'flex-start', width: 44, height: 44, justifyContent: 'center' },
  hero: { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 4 },
  heroIcon: { width: 64, height: 64, borderRadius: 20, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  title: { color: ink.primary, fontSize: 28, fontWeight: '800', letterSpacing: -0.4 },
  subtitle: { color: ink.secondary, fontSize: 14, lineHeight: 20, marginTop: 3 },
  listTitle: { color: ink.primary, fontSize: 16, fontWeight: '700', marginTop: 2 },
  group: { borderRadius: 22, paddingHorizontal: 16, paddingVertical: 4, backgroundColor: appColor('#FFFFFF', 'background'), borderWidth: 1, borderColor: appColor('#E7F0F4', 'border'), ...cardShadow },
  item: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14 },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: appColor('#D8E6EC', 'border') },
  itemIcon: { width: 30, alignItems: 'center' },
  itemTitle: { color: ink.primary, fontSize: 15, fontWeight: '700' },
  itemDetail: { color: ink.secondary, fontSize: 13, lineHeight: 19, marginTop: 3 },
  footer: { textAlign: 'center', marginTop: 4 },
});
