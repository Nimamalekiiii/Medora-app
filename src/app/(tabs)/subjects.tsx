import { LocalizedText as Text } from '@/components/localized-text';
import { appColor } from '@/constants/adaptive-color';
import { useCallback, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import {
  Alert,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { deleteSubjectAndData, getSubjects as readSubjects, getTopicsBySubject, saveSubjects as writeSubjects } from '../../services/storage';
import type { Subject, TopicsBySubject } from '../../types/study';
import PullToRefreshScrollView from '../../components/pull-to-refresh-scroll-view';

export default function SubjectsScreen() {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [topicsBySubject, setTopicsBySubject] = useState<TopicsBySubject>({});
  const [showForm, setShowForm] = useState(false);
  const [subjectName, setSubjectName] = useState('');
  const [editingSubjectId, setEditingSubjectId] = useState<string | number | null>(
    null
  );
  const [loading, setLoading] = useState(true);

  useFocusEffect(useCallback(() => {
    let active = true;
    loadSubjects(active);
    return () => { active = false; };
  }, []));

  async function loadSubjects(active = true) {
    try {
      const [savedSubjects, savedTopics] = await Promise.all([readSubjects(), getTopicsBySubject()]);
      if (active) { setSubjects(savedSubjects); setTopicsBySubject(savedTopics); }
    } catch (error) {
      console.log('Could not load subjects:', error);
    } finally {
      if (active) setLoading(false);
    }
  }

  // Save subjects permanently
  async function persistSubjects(updatedSubjects: Subject[]): Promise<boolean> {
    try {
      await writeSubjects(updatedSubjects);
      setSubjects(updatedSubjects);
      return true;
    } catch (error) {
      console.log('Could not save subjects:', error);
      Alert.alert('Could not save', 'Your changes were not saved. Please try again.');
      return false;
    }
  }

  function openAddForm() {
    setEditingSubjectId(null);
    setSubjectName('');
    setShowForm(true);
  }

  function openEditForm(subject: Subject) {
    setEditingSubjectId(subject.id);
    setSubjectName(subject.name);
    setShowForm(true);
  }

  async function saveSubject() {
    const trimmedName = subjectName.trim();

    if (!trimmedName) {
      return;
    }

    let updatedSubjects: Subject[];

    if (editingSubjectId !== null) {
      updatedSubjects = subjects.map((subject) =>
        subject.id === editingSubjectId
          ? { ...subject, name: trimmedName }
          : subject
      );
    } else {
      const newSubject: Subject = {
        id: Date.now(),
        name: trimmedName,
      };

      updatedSubjects = [...subjects, newSubject];
    }

    if (!await persistSubjects(updatedSubjects)) return;

    setSubjectName('');
    setEditingSubjectId(null);
    setShowForm(false);
  }

  function deleteSubject(subject: Subject) {
    Alert.alert(
      'Delete subject',
      `This will remove ${subject.name}, its topics, exam plan, study history, quizzes and flashcards. A recovery copy will be available from Profile.`,
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteSubjectAndData(subject.id);
              await loadSubjects();
            } catch (error) {
              console.error('Could not remove subject data:', error);
              Alert.alert('Could not finish deleting', 'A recovery copy was made before deletion. Check Profile before trying again.');
            }
          },
        },
      ]
    );
  }

  function showSubjectMenu(subject: Subject) {
    Alert.alert(subject.name, 'What would you like to do?', [
      {
        text: 'Edit',
        onPress: () => openEditForm(subject),
      },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => deleteSubject(subject),
      },
      {
        text: 'Cancel',
        style: 'cancel',
      },
    ]);
  }

  function openSubject(subject: Subject) {
    router.push({
      pathname: '/subject/[id]',
      params: {
        id: subject.id.toString(),
        name: subject.name,
      },
    });
  }

  return (
    <SafeAreaView style={styles.container}>
      <PullToRefreshScrollView onRefresh={() => loadSubjects()} contentContainerStyle={styles.scrollContent}>
      <Text style={styles.title}>Your subjects</Text>

      <Text style={styles.subtitle}>
        Add and manage the subjects you are preparing for your exams.
      </Text>

      {loading ? (
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Loading subjects...</Text>
        </View>
      ) : subjects.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.icon}>📚</Text>

          <Text style={styles.emptyTitle}>No subjects yet</Text>

          <Text style={styles.emptyText}>
            Add your first subject to start building your study plan.
          </Text>
        </View>
      ) : (
        <View style={styles.subjectList}>
          {subjects.map((subject) => (
            <View key={subject.id} style={styles.subjectRow}>
              <Pressable
                style={({ pressed }) => [
                  styles.subjectCard,
                  pressed && styles.subjectCardPressed,
                ]}
                onPress={() => openSubject(subject)}
              >
                <View style={styles.subjectIcon}>
                  <Text style={styles.subjectEmoji}>📚</Text>
                </View>

                <View style={styles.subjectContent}>
                  <Text style={styles.subjectName}>
                    {subject.name}
                  </Text>

                  <Text style={styles.topicText}>
                    {(topicsBySubject[String(subject.id)] ?? []).length}{' '}
                    {(topicsBySubject[String(subject.id)] ?? []).length === 1 ? 'topic' : 'topics'}
                  </Text>
                </View>

                <Text style={styles.arrow}>›</Text>
              </Pressable>

              <Pressable
                style={styles.menuButton}
                onPress={() => showSubjectMenu(subject)}
              >
                <Text style={styles.menuText}>•••</Text>
              </Pressable>
            </View>
          ))}
        </View>
      )}

      {showForm && (
        <View style={styles.formCard}>
          <View style={styles.formHeader}>
            <Text style={styles.formTitle}>
              {editingSubjectId !== null
                ? 'Edit subject'
                : 'Add a subject'}
            </Text>

            <Pressable
              onPress={() => {
                setShowForm(false);
                setSubjectName('');
                setEditingSubjectId(null);
              }}
            >
              <Text style={styles.closeButton}>✕</Text>
            </Pressable>
          </View>

          <Text style={styles.inputLabel}>Subject name</Text>

          <TextInput
            style={styles.input}
            placeholder="e.g. Pharmacology"
            placeholderTextColor={appColor('#9AAAB5', 'text')}
            value={subjectName}
            onChangeText={setSubjectName}
            autoFocus
          />

          <Pressable
            style={styles.saveButton}
            onPress={saveSubject}
          >
            <Text style={styles.saveButtonText}>
              {editingSubjectId !== null
                ? 'Save changes'
                : 'Add subject'}
            </Text>
          </Pressable>
        </View>
      )}

      {!showForm && (
        <Pressable
          style={styles.addButton}
          onPress={openAddForm}
        >
          <Text style={styles.addButtonText}>
            + Add subject
          </Text>
        </Pressable>
      )}
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

  title: {
    fontSize: 30,
    fontWeight: '800',
    color: appColor('#17324D', 'text'),
    marginTop: 20,
  },

  subtitle: {
    fontSize: 15,
    color: appColor('#7A8B99', 'text'),
    lineHeight: 22,
    marginTop: 8,
    marginBottom: 28,
  },

  loadingContainer: {
    alignItems: 'center',
    marginTop: 40,
  },

  loadingText: {
    fontSize: 14,
    color: appColor('#8494A0', 'text'),
  },

  emptyCard: {
    backgroundColor: appColor('#FFFFFF', 'background'),
    borderRadius: 22,
    padding: 28,
    alignItems: 'center',
  },

  icon: {
    fontSize: 42,
    marginBottom: 12,
  },

  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: appColor('#17324D', 'text'),
  },

  emptyText: {
    fontSize: 14,
    color: appColor('#7A8B99', 'text'),
    textAlign: 'center',
    lineHeight: 21,
    marginTop: 8,
  },

  addButton: {
    backgroundColor: appColor('#75C9ED', 'background'),
    borderRadius: 18,
    paddingVertical: 17,
    alignItems: 'center',
    marginTop: 18,
  },

  addButtonText: {
    color: appColor('#FFFFFF', 'text'),
    fontSize: 16,
    fontWeight: '700',
  },

  subjectList: {
    width: '100%',
  },

  subjectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },

  subjectCard: {
    flex: 1,
    backgroundColor: appColor('#FFFFFF', 'background'),
    borderRadius: 18,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 80,
  },

  subjectCardPressed: {
    opacity: 0.7,
  },

  subjectIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: appColor('#E3F5FF', 'background'),
    justifyContent: 'center',
    alignItems: 'center',
  },

  subjectEmoji: {
    fontSize: 22,
  },

  subjectContent: {
    flex: 1,
    marginLeft: 14,
  },

  subjectName: {
    fontSize: 17,
    fontWeight: '700',
    color: appColor('#17324D', 'text'),
  },

  topicText: {
    fontSize: 13,
    color: appColor('#8494A0', 'text'),
    marginTop: 4,
  },

  arrow: {
    fontSize: 28,
    fontWeight: '300',
    color: appColor('#9AB5C4', 'text'),
    marginLeft: 8,
  },

  menuButton: {
    width: 48,
    height: 56,
    marginLeft: 6,
    backgroundColor: appColor('#FFFFFF', 'background'),
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },

  menuText: {
    fontSize: 17,
    fontWeight: '700',
    color: appColor('#7A8B99', 'text'),
    letterSpacing: 2,
  },

  formCard: {
    backgroundColor: appColor('#FFFFFF', 'background'),
    borderRadius: 22,
    padding: 20,
    marginTop: 18,
  },

  formHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },

  formTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: appColor('#17324D', 'text'),
  },

  closeButton: {
    fontSize: 18,
    color: appColor('#7A8B99', 'text'),
  },

  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: appColor('#526775', 'text'),
    marginBottom: 8,
  },

  input: {
    height: 52,
    borderWidth: 1,
    borderColor: appColor('#CDEFFF', 'border'),
    borderRadius: 14,
    paddingHorizontal: 15,
    fontSize: 16,
    color: appColor('#17324D', 'text'),
    backgroundColor: appColor('#F7FBFE', 'background'),
  },

  saveButton: {
    backgroundColor: appColor('#75C9ED', 'background'),
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 14,
  },

  saveButtonText: {
    color: appColor('#FFFFFF', 'text'),
    fontSize: 16,
    fontWeight: '700',
  },
});
