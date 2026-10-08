import { LocalizedText as Text } from '@/components/localized-text';
import { StudyIcon } from '@/components/study-icon';
import { appColor } from '@/constants/adaptive-color';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import {
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import PullToRefreshScrollView from '../../components/pull-to-refresh-scroll-view';

export default function SubjectStudyScreen() {
  const { id, name } = useLocalSearchParams();

  const subjectName =
    typeof name === 'string' && name.trim().length > 0
      ? name
      : 'Subject';

  return (
    <SafeAreaView style={styles.container}>
      <Stack.Screen
        options={{
          headerShown: false,
        }}
      />

      <PullToRefreshScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        {/* Back */}
        <Pressable
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Text style={styles.backText}>← Back</Text>
        </Pressable>

        {/* Header */}
        <Text style={styles.title}>Study</Text>

        <Text style={styles.subjectName}>{subjectName}</Text>

        <Text style={styles.subtitle}>
          Choose what you want to study.
        </Text>

        {/* Study Topics */}
        <Pressable
          style={styles.card}
          onPress={() =>
            router.push({
              pathname: '/subject/topics',
              params: {
                id,
                name,
              },
            })
          }
        >
          <View style={styles.iconBox}>
            <StudyIcon name="brain" size={24} />
          </View>

          <View style={styles.cardContent}>
            <Text style={styles.cardTitle}>Study topics</Text>

            <Text style={styles.cardText}>
              Choose a topic and start studying with active recall and quizzes.
            </Text>
          </View>

          <Text style={styles.arrow}>›</Text>
        </Pressable>

        {/* Study Plan */}
        <Pressable
          style={styles.card}
          onPress={() =>
            router.push({
              pathname: '/subject/study-plan',
              params: {
                id,
                name,
              },
            })
          }
        >
          <View style={styles.iconBox}>
            <StudyIcon name="calendar" size={24} />
          </View>

          <View style={styles.cardContent}>
            <Text style={styles.cardTitle}>Study Plan</Text>

            <Text style={styles.cardText}>
              Plan your study sessions and prepare for your exam.
            </Text>
          </View>

          <Text style={styles.arrow}>›</Text>
        </Pressable>

        {/* Today's Focus */}
        <View style={styles.focusCard}>
          <Text style={styles.focusTitle}>Today's focus</Text>

          <Text style={styles.focusText}>
            Your recommended topic and study activities will appear here.
          </Text>
        </View>

        {/* Start Studying */}
        <Pressable
          style={styles.startButton}
          onPress={() =>
            router.push({
              pathname: '/subject/topics',
              params: {
                id,
                name,
              },
            })
          }
        >
          <Text style={styles.startButtonText}>
            Start studying
          </Text>

          <Text style={styles.startArrow}>→</Text>
        </Pressable>
      </PullToRefreshScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: appColor('#F7FBFE', 'background'),
  },

  content: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },

  backButton: {
    marginTop: 12,
    marginBottom: 24,
  },

  backText: {
    fontSize: 16,
    fontWeight: '600',
    color: appColor('#43A5D1', 'text'),
  },

  title: {
    fontSize: 42,
    fontWeight: '800',
    color: appColor('#17324D', 'text'),
    letterSpacing: -1,
  },

  subjectName: {
    fontSize: 20,
    fontWeight: '700',
    color: appColor('#43A5D1', 'text'),
    marginTop: 5,
  },

  subtitle: {
    fontSize: 16,
    color: appColor('#7A8B99', 'text'),
    lineHeight: 24,
    marginTop: 9,
    marginBottom: 28,
  },

  card: {
    backgroundColor: appColor('#FFFFFF', 'background'),
    borderRadius: 22,
    padding: 20,
    marginBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
  },

  iconBox: {
    width: 58,
    height: 58,
    borderRadius: 18,
    backgroundColor: appColor('#E3F5FF', 'background'),
    justifyContent: 'center',
    alignItems: 'center',
  },

  icon: {
    fontSize: 27,
  },

  cardContent: {
    flex: 1,
    marginLeft: 16,
    paddingRight: 6,
  },

  cardTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: appColor('#17324D', 'text'),
  },

  cardText: {
    fontSize: 14,
    color: appColor('#8494A0', 'text'),
    lineHeight: 21,
    marginTop: 5,
  },

  arrow: {
    fontSize: 30,
    fontWeight: '300',
    color: appColor('#9AB5C4', 'text'),
    marginLeft: 8,
  },

  focusCard: {
    backgroundColor: appColor('#EAF7FD', 'background'),
    borderRadius: 22,
    padding: 22,
    marginTop: 8,
    marginBottom: 18,
  },

  focusTitle: {
    fontSize: 19,
    fontWeight: '800',
    color: appColor('#17324D', 'text'),
  },

  focusText: {
    fontSize: 14,
    color: appColor('#66808F', 'text'),
    lineHeight: 21,
    marginTop: 8,
  },

  startButton: {
    height: 66,
    borderRadius: 22,
    backgroundColor: appColor('#83C4E3', 'background'),
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },

  startButtonText: {
    fontSize: 19,
    fontWeight: '800',
    color: appColor('#FFFFFF', 'text'),
  },

  startArrow: {
    fontSize: 27,
    fontWeight: '400',
    color: appColor('#FFFFFF', 'text'),
    marginLeft: 12,
  },
});
