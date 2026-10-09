import { BackLink } from '@/components/back-link';
import { LocalizedText as Text } from '@/components/localized-text';
import PullToRefreshScrollView from '@/components/pull-to-refresh-scroll-view';
import { StudyIcon } from '@/components/study-icon';
import { appColor } from '@/constants/adaptive-color';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function StudyScreen() {
  const { id, name, subjectId } = useLocalSearchParams();
  const topicName = Array.isArray(name) ? name[0] : String(name ?? 'Topic');
  const routeParams = { id, name, subjectId };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Stack.Screen options={{ headerShown: false }} />
      <PullToRefreshScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <BackLink label={topicName} />
        <Text style={styles.title}>Study</Text>
        <Text style={styles.topicName}>{topicName}</Text>
        <Text style={styles.subtitle}>Choose how you want to practise this topic.</Text>

        <Pressable accessibilityRole="button" style={({ pressed }) => [styles.card, pressed && styles.pressed]} onPress={() => router.push({ pathname: '/subject/topic/study/active-recall', params: routeParams })}>
          <View style={styles.iconBox}><StudyIcon name="brain" size={24} /></View>
          <View style={styles.cardContent}><Text style={styles.cardTitle}>Active Recall</Text><Text style={styles.cardText}>Retrieve what you know, then rate how well you remembered it.</Text></View>
          <StudyIcon name="chevron" size={13} color={appColor('#9AADB8', 'text')} />
        </Pressable>

        <Pressable accessibilityRole="button" style={({ pressed }) => [styles.card, pressed && styles.pressed]} onPress={() => router.push({ pathname: '/subject/topic/study/quiz', params: routeParams })}>
          <View style={styles.iconBox}><StudyIcon name="quiz" size={24} /></View>
          <View style={styles.cardContent}><Text style={styles.cardTitle}>Quiz</Text><Text style={styles.cardText}>Test your knowledge and get explanations for every answer.</Text></View>
          <StudyIcon name="chevron" size={13} color={appColor('#9AADB8', 'text')} />
        </Pressable>

        <View style={styles.infoCard}><View style={styles.infoIcon}><StudyIcon name="layers" size={18} /></View><View style={styles.cardContent}><Text style={styles.infoTitle}>Study tools for {topicName}</Text><Text style={styles.infoText}>Flashcards and scheduled review are available on the topic page. Your sessions update this topic’s progress and the overall Progress dashboard.</Text></View></View>
      </PullToRefreshScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: appColor('#F7FBFE', 'background'), paddingHorizontal: 20 },
  content: { flexGrow: 1, paddingBottom: 36, gap: 15 },
  backButton: { alignSelf: 'flex-start', marginTop: 10, marginBottom: 5, paddingVertical: 5 },
  backText: { fontSize: 14, fontWeight: '700', color: appColor('#3B85A1', 'text') },
  title: { fontSize: 32, fontWeight: '800', color: appColor('#17324D', 'text') },
  topicName: { fontSize: 18, fontWeight: '700', color: appColor('#3B91B3', 'text'), marginTop: -10 },
  subtitle: { fontSize: 14, lineHeight: 21, color: appColor('#7A8D9A', 'text'), marginTop: -8, marginBottom: 4 },
  card: { backgroundColor: appColor('#FFFFFF', 'background'), borderRadius: 19, padding: 16, minHeight: 86, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: appColor('#E6EDF1', 'border') },
  iconBox: { width: 48, height: 48, borderRadius: 15, backgroundColor: appColor('#EAF5F9', 'background'), justifyContent: 'center', alignItems: 'center' },
  cardContent: { flex: 1, marginLeft: 13, marginRight: 7 },
  cardTitle: { fontSize: 16, fontWeight: '800', color: appColor('#17324D', 'text') },
  cardText: { fontSize: 12, color: appColor('#788B98', 'text'), marginTop: 5, lineHeight: 18 },
  arrow: { fontSize: 25, fontWeight: '300', color: appColor('#9AB5C4', 'text') },
  infoCard: { flexDirection: 'row', alignItems: 'flex-start', padding: 15, borderRadius: 17, backgroundColor: appColor('#EFF7FA', 'background'), marginTop: 4 },
  infoIcon: { width: 33, height: 33, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: appColor('#FFFFFF', 'background') },
  infoTitle: { fontSize: 13, fontWeight: '800', color: appColor('#294B5E', 'text') },
  infoText: { fontSize: 12, color: appColor('#718795', 'text'), marginTop: 5, lineHeight: 18 },
  pressed: { opacity: 0.82, transform: [{ scale: 0.99 }] },
});
