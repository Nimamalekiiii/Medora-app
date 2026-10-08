import { LocalizedText as Text } from '@/components/localized-text';
import { appColor } from '@/constants/adaptive-color';
import { Stack, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { deleteTopicAndData, getTopicsBySubject, saveTopicsBySubject } from '../../services/storage';
import type { TopicsBySubject } from '../../types/study';
import PullToRefreshScrollView from '../../components/pull-to-refresh-scroll-view';

type Topic = {
  id: number;
  name: string;
};

export default function TopicsScreen() {
  const { id } = useLocalSearchParams();

  const subjectId = Array.isArray(id) ? id[0] : id;

  const [topicsBySubject, setTopicsBySubject] =
    useState<TopicsBySubject>({});

  const [loading, setLoading] = useState(true);

  const [modalVisible, setModalVisible] = useState(false);
  const [editingTopic, setEditingTopic] = useState<Topic | null>(null);
  const [topicName, setTopicName] = useState('');

  const topics = topicsBySubject[subjectId ?? ''] ?? [];

  useFocusEffect(useCallback(() => {
    let active = true;
    loadTopics(active);
    return () => { active = false; };
  }, [subjectId]));

  const loadTopics = async (active = true) => {
    try {
      const saved = await getTopicsBySubject();
      if (active) setTopicsBySubject(saved);
    } catch (error) {
      console.log('Could not load topics:', error);
    } finally {
      if (active) setLoading(false);
    }
  };

  // Save topics to storage
  const saveTopics = async (updatedTopics: TopicsBySubject): Promise<boolean> => {
    try {
      await saveTopicsBySubject(updatedTopics);
      setTopicsBySubject(updatedTopics);
      return true;
    } catch (error) {
      console.log('Could not save topics:', error);
      Alert.alert('Could not save', 'Your changes were not saved. Please try again.');
      return false;
    }
  };

  // Open add modal
  const openAddModal = () => {
    setEditingTopic(null);
    setTopicName('');
    setModalVisible(true);
  };

  // Open edit modal
  const openEditModal = (topic: Topic) => {
    setEditingTopic(topic);
    setTopicName(topic.name);
    setModalVisible(true);
  };

  // Add or edit topic
  const saveTopic = async () => {
    const trimmedName = topicName.trim();

    if (!trimmedName) {
      Alert.alert('Missing topic', 'Please enter a topic name.');
      return;
    }

    if (!subjectId) {
      return;
    }

    let updatedTopics: TopicsBySubject;

    if (editingTopic) {
      updatedTopics = {
        ...topicsBySubject,
        [subjectId]: topics.map((topic) =>
          topic.id === editingTopic.id
            ? {
                ...topic,
                name: trimmedName,
              }
            : topic
        ),
      };
    } else {
      const newTopic: Topic = {
        id: Date.now(),
        name: trimmedName,
      };

      updatedTopics = {
        ...topicsBySubject,
        [subjectId]: [...topics, newTopic],
      };
    }

    if (!await saveTopics(updatedTopics)) return;

    setModalVisible(false);
    setTopicName('');
    setEditingTopic(null);
  };

  // Delete topic
  const deleteTopic = (topic: Topic) => {
    if (!subjectId) {
      return;
    }

    Alert.alert(
      'Delete topic?',
      `This also removes its saved questions, quizzes, flashcards and progress. A recovery copy will be available from Profile.`,
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
              await deleteTopicAndData(subjectId, topic.id);
              await loadTopics();
            } catch (error) {
              console.error('Could not delete topic data:', error);
              Alert.alert('Could not finish deleting', 'A recovery copy was made before deletion. Check Profile before trying again.');
            }
          },
        },
      ]
    );
  };

  // Open topic
  const openTopic = (topic: Topic) => {
    router.push({
      pathname: '/subject/topic/[id]',
      params: {
        id: String(topic.id),
        name: topic.name,
        subjectId: subjectId ?? '',
      },
    });
  };

  return (
    <SafeAreaView style={styles.container}>
      <Stack.Screen
        options={{
          headerShown: false,
        }}
      />

      <PullToRefreshScrollView
        onRefresh={() => loadTopics()}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Back */}
        <Pressable
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Text style={styles.backText}>← Back</Text>
        </Pressable>

        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Topics</Text>

            <Text style={styles.subtitle}>
              Manage the topics you need to study.
            </Text>
          </View>

          <Pressable
            style={styles.addButton}
            onPress={openAddModal}
          >
            <Text style={styles.addButtonText}>+ Add</Text>
          </Pressable>
        </View>

        {/* Topic count */}
        <View style={styles.countCard}>
          <Text style={styles.countNumber}>{topics.length}</Text>

          <Text style={styles.countText}>
            {topics.length === 1 ? 'topic' : 'topics'}
          </Text>
        </View>

        {/* Topics */}
        {loading ? (
          <Text style={styles.emptyText}>
            Loading topics...
          </Text>
        ) : topics.length === 0 ? (
          <View style={styles.emptyCard}>
            <View style={styles.emptyIconBox}>
              <Text style={styles.emptyIcon}>📚</Text>
            </View>

            <Text style={styles.emptyTitle}>
              No topics yet
            </Text>

            <Text style={styles.emptyDescription}>
              Add the topics you need to study for this subject.
            </Text>

            <Pressable
              style={styles.emptyAddButton}
              onPress={openAddModal}
            >
              <Text style={styles.emptyAddButtonText}>
                + Add your first topic
              </Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.topicList}>
            {topics.map((topic, index) => (
              <View
                key={topic.id}
                style={styles.topicCard}
              >
                <Pressable
                  style={styles.topicMain}
                  onPress={() => openTopic(topic)}
                >
                  <View style={styles.numberBox}>
                    <Text style={styles.numberText}>
                      {index + 1}
                    </Text>
                  </View>

                  <View style={styles.topicContent}>
                    <Text style={styles.topicName}>
                      {topic.name}
                    </Text>

                    <Text style={styles.topicHint}>
                      Tap to study this topic
                    </Text>
                  </View>

                  <Text style={styles.arrow}>›</Text>
                </Pressable>

                <View style={styles.actions}>
                  <Pressable
                    style={styles.editButton}
                    onPress={() => openEditModal(topic)}
                  >
                    <Text style={styles.editButtonText}>
                      Edit
                    </Text>
                  </Pressable>

                  <Pressable
                    style={styles.deleteButton}
                    onPress={() => deleteTopic(topic)}
                  >
                    <Text style={styles.deleteButtonText}>
                      Delete
                    </Text>
                  </Pressable>
                </View>
              </View>
            ))}
          </View>
        )}
      </PullToRefreshScrollView>

      {/* Add / Edit Modal */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setModalVisible(false)}
      >
        <KeyboardAvoidingView
          style={styles.keyboardContainer}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={styles.modalOverlay}>
            <ScrollView
              style={styles.modalScroll}
              contentContainerStyle={styles.modalScrollContent}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
              automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
            >
            <View style={styles.modalContainer}>
              <View style={styles.modalHandle} />

              <Text style={styles.modalTitle}>
                {editingTopic ? 'Edit topic' : 'Add topic'}
              </Text>

              <Text style={styles.modalSubtitle}>
                {editingTopic
                  ? 'Change the name of this topic.'
                  : 'Enter the name of the topic you want to study.'}
              </Text>

              <TextInput
                style={styles.input}
                placeholder="e.g. Cranial nerves"
                placeholderTextColor={appColor('#9AAAB5', 'text')}
                value={topicName}
                onChangeText={setTopicName}
                autoFocus
                returnKeyType="done"
                onSubmitEditing={saveTopic}
              />

              <View style={styles.modalButtons}>
                <Pressable
                  style={styles.cancelButton}
                  onPress={() => {
                    setModalVisible(false);
                    setTopicName('');
                    setEditingTopic(null);
                  }}
                >
                  <Text style={styles.cancelButtonText}>
                    Cancel
                  </Text>
                </Pressable>

                <Pressable
                  style={styles.saveButton}
                  onPress={saveTopic}
                >
                  <Text style={styles.saveButtonText}>
                    {editingTopic
                      ? 'Save changes'
                      : 'Add topic'}
                  </Text>
                </Pressable>
              </View>
            </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: appColor('#F7FBFE', 'background'),
  },

  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },

  backButton: {
    marginTop: 12,
    marginBottom: 24,
  },

  backText: {
    fontSize: 15,
    fontWeight: '600',
    color: appColor('#43A5D1', 'text'),
  },

  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
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
    lineHeight: 21,
    maxWidth: 260,
  },

  addButton: {
    backgroundColor: appColor('#4AA9D8', 'background'),
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 14,
  },

  addButtonText: {
    color: appColor('#FFFFFF', 'text'),
    fontSize: 14,
    fontWeight: '700',
  },

  countCard: {
    marginTop: 24,
    backgroundColor: appColor('#E8F7FF', 'background'),
    borderRadius: 18,
    padding: 18,
    flexDirection: 'row',
    alignItems: 'baseline',
  },

  countNumber: {
    fontSize: 28,
    fontWeight: '800',
    color: appColor('#318DBA', 'text'),
  },

  countText: {
    fontSize: 15,
    fontWeight: '600',
    color: appColor('#6C8798', 'text'),
    marginLeft: 8,
  },

  topicList: {
    marginTop: 18,
  },

  topicCard: {
    backgroundColor: appColor('#FFFFFF', 'background'),
    borderRadius: 20,
    marginBottom: 14,
    padding: 16,
  },

  topicMain: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  numberBox: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: appColor('#E3F5FF', 'background'),
    justifyContent: 'center',
    alignItems: 'center',
  },

  numberText: {
    fontSize: 16,
    fontWeight: '800',
    color: appColor('#43A5D1', 'text'),
  },

  topicContent: {
    flex: 1,
    marginLeft: 14,
  },

  topicName: {
    fontSize: 17,
    fontWeight: '700',
    color: appColor('#17324D', 'text'),
  },

  topicHint: {
    fontSize: 12,
    color: appColor('#94A3AE', 'text'),
    marginTop: 4,
  },

  arrow: {
    fontSize: 28,
    fontWeight: '300',
    color: appColor('#9AB5C4', 'text'),
    marginLeft: 10,
  },

  actions: {
    flexDirection: 'row',
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#EEF3F6',
  },

  editButton: {
    flex: 1,
    backgroundColor: appColor('#F0F8FC', 'background'),
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: 'center',
    marginRight: 6,
  },

  editButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: appColor('#43A5D1', 'text'),
  },

  deleteButton: {
    flex: 1,
    backgroundColor: appColor('#FFF3F3', 'background'),
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: 'center',
    marginLeft: 6,
  },

  deleteButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: appColor('#D96B6B', 'text'),
  },

  emptyCard: {
    marginTop: 24,
    backgroundColor: appColor('#FFFFFF', 'background'),
    borderRadius: 22,
    padding: 28,
    alignItems: 'center',
  },

  emptyIconBox: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: appColor('#E3F5FF', 'background'),
    justifyContent: 'center',
    alignItems: 'center',
  },

  emptyIcon: {
    fontSize: 30,
  },

  emptyTitle: {
    fontSize: 19,
    fontWeight: '800',
    color: appColor('#17324D', 'text'),
    marginTop: 18,
  },

  emptyDescription: {
    fontSize: 14,
    color: appColor('#8494A0', 'text'),
    textAlign: 'center',
    lineHeight: 21,
    marginTop: 8,
  },

  emptyAddButton: {
    backgroundColor: appColor('#4AA5D1', 'background'),
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 14,
    marginTop: 20,
  },

  emptyAddButtonText: {
    color: appColor('#FFFFFF', 'text'),
    fontSize: 14,
    fontWeight: '700',
  },

  emptyText: {
    textAlign: 'center',
    marginTop: 30,
    color: appColor('#8494A0', 'text'),
  },

  keyboardContainer: {
    flex: 1,
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(20, 45, 65, 0.25)',
    justifyContent: 'flex-end',
  },
  modalScroll: { flex: 1 },
  modalScrollContent: { flexGrow: 1, justifyContent: 'flex-end' },

  modalContainer: {
    backgroundColor: appColor('#FFFFFF', 'background'),
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 24,
    paddingBottom: 36,
  },

  modalHandle: {
    width: 42,
    height: 5,
    borderRadius: 3,
    backgroundColor: appColor('#D8E2E8', 'background'),
    alignSelf: 'center',
    marginBottom: 22,
  },

  modalTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: appColor('#17324D', 'text'),
  },

  modalSubtitle: {
    fontSize: 14,
    color: appColor('#8494A0', 'text'),
    marginTop: 7,
    lineHeight: 20,
  },

  input: {
    backgroundColor: appColor('#F5F9FB', 'background'),
    borderRadius: 15,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: appColor('#17324D', 'text'),
    marginTop: 20,
    borderWidth: 1,
    borderColor: appColor('#E4EDF2', 'border'),
  },

  modalButtons: {
    flexDirection: 'row',
    marginTop: 18,
  },

  cancelButton: {
    flex: 1,
    backgroundColor: appColor('#F2F6F8', 'background'),
    paddingVertical: 14,
    borderRadius: 15,
    alignItems: 'center',
    marginRight: 6,
  },

  cancelButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: appColor('#718592', 'text'),
  },

  saveButton: {
    flex: 1,
    backgroundColor: appColor('#4AA9D8', 'background'),
    paddingVertical: 14,
    borderRadius: 15,
    alignItems: 'center',
    marginLeft: 6,
  },

  saveButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: appColor('#FFFFFF', 'text'),
  },
});
