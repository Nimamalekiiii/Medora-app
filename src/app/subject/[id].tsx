import { LocalizedText as Text } from '@/components/localized-text';
import { appColor } from '@/constants/adaptive-color';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import PullToRefreshScrollView from '../../components/pull-to-refresh-scroll-view';

export default function SubjectScreen() {
  const { id, name } = useLocalSearchParams();

  return (
    <SafeAreaView style={styles.container}>
      <Stack.Screen
        options={{
          headerShown: false,
        }}
      />

      <PullToRefreshScrollView contentContainerStyle={styles.scrollContent}>
      {/* Back button */}
      <Pressable
        style={styles.backButton}
        onPress={() => router.back()}
      >
        <Text style={styles.backText}>← Back</Text>
      </Pressable>

      {/* Header */}
      <Text style={styles.title}>{name}</Text>

      <Text style={styles.subtitle}>
        Manage everything for this subject.
      </Text>

      {/* Topics */}
      <Pressable
        style={styles.card}
        onPress={() =>
          router.push({
            pathname: '/subject/topics',
            params: {
              id,
            },
          })
        }
      >
        <View style={styles.iconBox}>
          <Text style={styles.icon}>📚</Text>
        </View>

        <View style={styles.cardContent}>
          <Text style={styles.cardTitle}>Topics</Text>

          <Text style={styles.cardText}>
            Add and manage the topics you need to study.
          </Text>
        </View>

        <Text style={styles.arrow}>›</Text>
      </Pressable>

      {/* Exam */}
      <Pressable
        style={styles.card}
        onPress={() =>
          router.push({
            pathname: '/subject/exam',
            params: {
              id,
              name,
            },
          })
        }
      >
        <View style={styles.iconBox}>
          <Text style={styles.icon}>📝</Text>
        </View>

        <View style={styles.cardContent}>
          <Text style={styles.cardTitle}>Exam</Text>

          <Text style={styles.cardText}>
            Set your exam date and exam details.
          </Text>
        </View>

        <Text style={styles.arrow}>›</Text>
      </Pressable>

      {/* Study */}
      <Pressable
        style={styles.card}
        onPress={() =>
          router.push({
            pathname: '/subject/study',
            params: {
              id,
              name,
            },
          })
        }
      >
        <View style={styles.iconBox}>
          <Text style={styles.icon}>🧠</Text>
        </View>

        <View style={styles.cardContent}>
          <Text style={styles.cardTitle}>Study</Text>

          <Text style={styles.cardText}>
            Practice quizzes and active recall.
          </Text>
        </View>

        <Text style={styles.arrow}>›</Text>
      </Pressable>
      </PullToRefreshScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: appColor('#F7FBFE', 'background'),
    paddingHorizontal: 20,
  },
  scrollContent: { flexGrow: 1, paddingBottom: 28 },

  backButton: {
    marginTop: 12,
    marginBottom: 24,
  },

  backText: {
    fontSize: 15,
    fontWeight: '600',
    color: appColor('#43A5D1', 'text'),
  },

  title: {
    fontSize: 30,
    fontWeight: '800',
    color: appColor('#17324D', 'text'),
  },

  subtitle: {
    fontSize: 15,
    color: appColor('#7A8B99', 'text'),
    marginTop: 8,
    marginBottom: 28,
  },

  card: {
    backgroundColor: appColor('#FFFFFF', 'background'),
    borderRadius: 20,
    padding: 18,
    marginBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
  },

  iconBox: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: appColor('#E3F5FF', 'background'),
    justifyContent: 'center',
    alignItems: 'center',
  },

  icon: {
    fontSize: 24,
  },

  cardContent: {
    flex: 1,
    marginLeft: 15,
  },

  cardTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: appColor('#17324D', 'text'),
  },

  cardText: {
    fontSize: 13,
    color: appColor('#8494A0', 'text'),
    marginTop: 5,
    lineHeight: 19,
  },

  arrow: {
    fontSize: 28,
    fontWeight: '300',
    color: appColor('#9AB5C4', 'text'),
    marginLeft: 10,
  },
});
