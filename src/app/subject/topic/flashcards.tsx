import { LocalizedText as Text } from '@/components/localized-text';
import { StudyIcon } from '@/components/study-icon';
import { appColor } from '@/constants/adaptive-color';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
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
import PullToRefreshScrollView from '../../../components/pull-to-refresh-scroll-view';

import type {
  Flashcard,
  StudyActivity,
} from '../../../types/study';

import {
  getFlashcards,
  getFlashcardsForTopic,
  getAIPreferences,
  getSubjects,
  saveFlashcards,
  addStudyActivity,
} from '../../../services/storage';
import { generateAIFlashcards } from '../../../services/ai-api';

export default function FlashcardsScreen() {
  const { id, name, subjectId } = useLocalSearchParams();

  const topicId = String(id ?? '');
  const subjectKey = Array.isArray(subjectId) ? subjectId[0] : String(subjectId ?? '');
  const topicName = String(
    name ?? 'Unknown topic'
  );

  const [flashcards, setFlashcards] =
    useState<Flashcard[]>([]);

  const [currentIndex, setCurrentIndex] =
    useState(0);

  const [showAnswer, setShowAnswer] =
    useState(false);

  const [sessionStartedAt] =
    useState(Date.now());

  const [sessionFinished, setSessionFinished] =
    useState(false);

  const [activitySaved, setActivitySaved] =
    useState(false);

  const [loading, setLoading] =
    useState(true);

  const [generatingAI, setGeneratingAI] = useState(false);
  const [cardCount, setCardCount] = useState(10);
  const [aiEnabled, setAIEnabled] = useState(true);
  const [aiDifficulty, setAIDifficulty] = useState<'easy' | 'medium' | 'hard'>('medium');
  const [aiExplanationStyle, setAIExplanationStyle] = useState<'short' | 'balanced' | 'detailed'>('balanced');
  const [aiProgress, setAiProgress] = useState(0);
  const [aiPromptVisible, setAiPromptVisible] = useState(false);
  const [sourceMaterial, setSourceMaterial] = useState('');
  const [aiPreviewVisible, setAIPreviewVisible] = useState(false);
  const [aiDrafts, setAIDrafts] = useState<Flashcard[]>([]);

  const [manageMode, setManageMode] =
    useState(false);

  const [modalVisible, setModalVisible] =
    useState(false);

  const [editingCard, setEditingCard] =
    useState<Flashcard | null>(null);

  const [frontText, setFrontText] =
    useState('');

  const [backText, setBackText] =
    useState('');

  useEffect(() => {
    loadFlashcards();
  }, [topicId]);

  useEffect(() => {
    void getAIPreferences().then((prefs) => {
      setCardCount(prefs.flashcardCount);
      setAIEnabled(prefs.generateFlashcards);
      setAIDifficulty(prefs.difficulty);
      setAIExplanationStyle(prefs.explanationStyle);
    });
  }, []);

  /* ----------------------------------------
     LOAD FLASHCARDS
  ---------------------------------------- */

  const loadFlashcards = async () => {
    try {
      setLoading(true);

      const cards =
        await getFlashcardsForTopic(
          topicId
        );

      setFlashcards(cards);
      setCurrentIndex(0);
      setShowAnswer(false);
      setSessionFinished(false);
      setActivitySaved(false);
    } catch (error) {
      console.error(
        'Failed to load flashcards:',
        error
      );
    } finally {
      setLoading(false);
    }
  };

  const refreshFlashcards = async () => {
    try {
      const currentCardId = flashcards[currentIndex]?.id;
      const cards = await getFlashcardsForTopic(topicId);
      setFlashcards(cards);
      const currentCardIndex = cards.findIndex((card) => String(card.id) === String(currentCardId));
      if (currentCardIndex >= 0) setCurrentIndex(currentCardIndex);
      else if (currentIndex >= cards.length) {
        setCurrentIndex(Math.max(0, cards.length - 1));
        setShowAnswer(false);
      }
    } catch (error) {
      console.warn('Could not refresh flashcards:', error);
    }
  };

  /*
   * Helper used only when creating the
   * initial starter cards.
   */
  const getAllFlashcards = async (): Promise<
    Flashcard[]
  > => {
    return getFlashcards();
  };

  /* ----------------------------------------
     SAVE FLASHCARDS
  ---------------------------------------- */

  const persistFlashcards = async (
    updatedFlashcards: Flashcard[]
  ): Promise<boolean> => {
    try {
      const allFlashcards =
        await getAllFlashcards();

      const topicCardIds = new Set(
        flashcards.map(
          (card) => card.id
        )
      );

      const otherCards =
        allFlashcards.filter(
          (card) =>
            !topicCardIds.has(card.id)
        );

      await saveFlashcards([
        ...otherCards,
        ...updatedFlashcards,
      ]);

      setFlashcards(
        updatedFlashcards
      );
      return true;
    } catch (error) {
      console.error(
        'Failed to save flashcards:',
        error
      );

      Alert.alert(
        'Error',
        'Could not save the flashcard.'
      );
      return false;
    }
  };

  const generateCardsWithAI = async () => {
    if (!aiEnabled) { Alert.alert('AI flashcards are off', 'Turn on flashcard generation in Settings → AI preferences to create cards.'); return; }
    setGeneratingAI(true);
    setAiProgress(0);
    try {
      const subjects = await getSubjects();
      const subject = subjects.find((item) => String(item.id) === subjectKey);
      const generated = await generateAIFlashcards({
        subjectName: subject?.name ?? 'Medical studies',
        topicName,
        cardCount,
        sourceMaterial: sourceMaterial.trim() || undefined,
        difficulty: aiDifficulty,
        explanationStyle: aiExplanationStyle,
        onProgress: (completed) => setAiProgress(completed),
      });
      const createdAt = new Date().toISOString();
      const cards: Flashcard[] = generated.map((card, index) => ({
        id: `ai-${topicId}-${Date.now()}-${index}`,
        topicId,
        topicName,
        front: card.front,
        back: card.back,
        createdAt,
      }));
      setAiPromptVisible(false);
      setAIDrafts(cards);
      setAIPreviewVisible(true);
    } catch (error) {
      Alert.alert('Could not generate flashcards', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setGeneratingAI(false);
    }
  };

  const saveAIDrafts = async () => {
    const reviewedDrafts = aiDrafts.filter((card) => card.front.trim() && card.back.trim());
    if (!reviewedDrafts.length) {
      Alert.alert('No complete cards', 'Keep at least one card with both a question and an answer.');
      return;
    }
    if (!await persistFlashcards([...flashcards, ...reviewedDrafts])) return;
    setAIPreviewVisible(false);
    setAIDrafts([]);
    setSourceMaterial('');
    Alert.alert('Flashcards saved', `${reviewedDrafts.length} edited cards were added to ${topicName}.`);
  };

  const aiMaterialModal = (
    <Modal visible={aiPromptVisible} transparent animationType="slide" onRequestClose={() => !generatingAI && setAiPromptVisible(false)}>
      <KeyboardAvoidingView style={styles.keyboardContainer} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={styles.modalOverlay}>
          <ScrollView
            style={styles.modalScroll}
            contentContainerStyle={styles.modalScrollContent}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
            automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
          >
          <View style={styles.aiModalCard}>
            <Text style={styles.modalTitle}>Create flashcards with AI</Text>
            <Text style={styles.aiModalCopy}>Add lecture notes or learning objectives for more course-focused cards. Leave blank for general study cards.</Text>
            <Text style={styles.aiCountLabel}>How many cards?</Text>
            <View style={styles.aiCountChoices}>{[10, 20, 30, 50].map((count) => <Pressable key={count} accessibilityRole="button" accessibilityState={{ selected: cardCount === count }} onPress={() => setCardCount(count)} style={[styles.aiCountChoice, cardCount === count && styles.aiCountChoiceSelected]}><Text style={[styles.aiCountChoiceText, cardCount === count && styles.aiCountChoiceTextSelected]}>{count}</Text></Pressable>)}</View>
            <TextInput
              value={sourceMaterial}
              onChangeText={setSourceMaterial}
              placeholder="Paste course notes (optional)"
              placeholderTextColor={appColor('#9AAAB4', 'text')}
              multiline
              maxLength={20000}
              textAlignVertical="top"
              style={styles.aiNotes}
              accessibilityLabel="Optional course notes for AI flashcards"
            />
            <Text style={styles.aiCaution}>AI can make mistakes. Check generated cards against the course material.</Text>
            {generatingAI ? <View style={styles.aiBusy}><ActivityIndicator color={appColor('#327E9D', 'text')} /><Text style={styles.aiModalCopy}>Creating {aiProgress} of {cardCount} cards…</Text></View> : <View style={styles.modalActions}>
              <Pressable style={styles.cancelButton} onPress={() => setAiPromptVisible(false)}><Text style={styles.cancelButtonText}>Cancel</Text></Pressable>
              <Pressable style={styles.saveButton} onPress={() => { void generateCardsWithAI(); }}><Text style={styles.saveButtonText}>Create cards</Text></Pressable>
            </View>}
          </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );

  const aiPreviewModal = (
    <Modal visible={aiPreviewVisible} transparent animationType="slide" onRequestClose={() => setAIPreviewVisible(false)}>
      <KeyboardAvoidingView style={styles.keyboardContainer} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={styles.modalOverlay}>
          <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalScrollContent} keyboardShouldPersistTaps="handled" keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'} automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}>
            <View style={styles.aiModalCard}>
              <Text style={styles.modalTitle}>Review AI flashcards</Text>
              <Text style={styles.aiModalCopy}>Edit or remove anything you don’t want. Cards are only saved when you tap Save cards.</Text>
              {aiDrafts.map((card, index) => <View key={card.id} style={styles.aiDraftCard}>
                <View style={styles.aiDraftHeader}><Text style={styles.aiCountLabel}>CARD {index + 1}</Text><Pressable accessibilityRole="button" accessibilityLabel="Remove flashcard" onPress={() => setAIDrafts((items) => items.filter((item) => item.id !== card.id))}><Text style={styles.aiDraftRemove}>Remove</Text></Pressable></View>
                <Text style={styles.modalLabel}>Question</Text>
                <TextInput value={card.front} onChangeText={(front) => setAIDrafts((items) => items.map((item) => item.id === card.id ? { ...item, front } : item))} style={styles.aiDraftInput} multiline />
                <Text style={styles.modalLabel}>Answer</Text>
                <TextInput value={card.back} onChangeText={(back) => setAIDrafts((items) => items.map((item) => item.id === card.id ? { ...item, back } : item))} style={[styles.aiDraftInput, styles.aiDraftAnswer]} multiline />
              </View>)}
              <View style={styles.modalActions}>
                <Pressable style={styles.cancelButton} onPress={() => { setAIPreviewVisible(false); setAIDrafts([]); }}><Text style={styles.cancelButtonText}>Discard</Text></Pressable>
                <Pressable disabled={aiDrafts.length === 0} style={styles.saveButton} onPress={() => { void saveAIDrafts(); }}><Text style={styles.saveButtonText}>Save {aiDrafts.length} cards</Text></Pressable>
              </View>
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );

  /* ----------------------------------------
     ADD / EDIT MODAL
  ---------------------------------------- */

  const openAddModal = () => {
    setEditingCard(null);
    setFrontText('');
    setBackText('');
    setModalVisible(true);
  };

  const openEditModal = (
    card: Flashcard
  ) => {
    setEditingCard(card);
    setFrontText(card.front);
    setBackText(card.back);
    setModalVisible(true);
  };

  const closeModal = () => {
    setModalVisible(false);
    setEditingCard(null);
    setFrontText('');
    setBackText('');
  };

  /* ----------------------------------------
     SAVE CARD
  ---------------------------------------- */

  const handleSaveCard = async () => {
    const front =
      frontText.trim();

    const back =
      backText.trim();

    if (!front || !back) {
      Alert.alert(
        'Missing information',
        'Please enter both a question and an answer.'
      );

      return;
    }

    if (editingCard) {
      const updatedFlashcards =
        flashcards.map(
          (card) =>
            card.id ===
            editingCard.id
              ? {
                  ...card,
                  front,
                  back,
                }
              : card
        );

      if (!await persistFlashcards(updatedFlashcards)) return;
    } else {
      const newCard: Flashcard = {
        id: `${topicId}-${Date.now()}`,
        topicId,
        topicName,
        front,
        back,
        createdAt:
          new Date().toISOString(),
      };

      if (!await persistFlashcards([...flashcards, newCard])) return;
    }

    closeModal();
  };

  /* ----------------------------------------
     DELETE CARD
  ---------------------------------------- */

  const handleDeleteCard = (
    card: Flashcard
  ) => {
    Alert.alert(
      'Delete flashcard',
      'Are you sure you want to delete this flashcard?',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const updatedFlashcards =
              flashcards.filter(
                (item) =>
                  item.id !==
                  card.id
              );

            await persistFlashcards(
              updatedFlashcards
            );

            if (
              currentIndex >=
                updatedFlashcards.length &&
              updatedFlashcards.length > 0
            ) {
              setCurrentIndex(
                updatedFlashcards.length -
                  1
              );
            }

            if (
              updatedFlashcards.length ===
              0
            ) {
              setCurrentIndex(0);
            }

            setShowAnswer(false);
          },
        },
      ]
    );
  };

  /* ----------------------------------------
     STUDY ACTIVITY
  ---------------------------------------- */

  const saveStudyActivity =
    async () => {
      try {
        const durationSeconds =
          Math.max(
            1,
            Math.round(
              (Date.now() -
                sessionStartedAt) /
                1000
            )
          );

        const activity: StudyActivity = {
          id: Date.now(),
          topicId,
          topicName,
          activity: 'flashcards',
          completedAt:
            new Date().toISOString(),
          durationSeconds,
          questionCount:
            flashcards.length,
        };

        await addStudyActivity(
          activity
        );

        setActivitySaved(true);
      } catch (error) {
        console.error(
          'Failed to save flashcard activity:',
          error
        );
      }
    };

  /* ----------------------------------------
     NAVIGATION
  ---------------------------------------- */

  const handleNext = async () => {
    const isLastCard =
      currentIndex ===
      flashcards.length - 1;

    if (isLastCard) {
      await saveStudyActivity();
      setSessionFinished(true);
      return;
    }

    setCurrentIndex(
      (previous) =>
        previous + 1
    );

    setShowAnswer(false);
  };

  const handleStartAgain = async () => {
    await loadFlashcards();

    setCurrentIndex(0);
    setShowAnswer(false);
    setSessionFinished(false);
    setActivitySaved(false);
    setManageMode(false);
  };

  /* ----------------------------------------
     LOADING
  ---------------------------------------- */

  if (loading) {
    return (
      <SafeAreaView
        style={styles.container}
      >
        <Stack.Screen
          options={{
            headerShown: false,
          }}
        />

        <View
          style={
            styles.loadingContainer
          }
        >
          <ActivityIndicator
            size="large"
          />

          <Text
            style={
              styles.loadingText
            }
          >
            Loading flashcards...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  /* ----------------------------------------
     MANAGE FLASHCARDS
  ---------------------------------------- */

  if (manageMode) {
    return (
      <SafeAreaView
        style={styles.container}
      >
        <Stack.Screen
          options={{
            headerShown: false,
          }}
        />

        <PullToRefreshScrollView
          onRefresh={refreshFlashcards}
          showsVerticalScrollIndicator={
            false
          }
          contentContainerStyle={
            styles.manageScrollContent
          }
        >
          <Pressable
            style={styles.backButton}
            onPress={() =>
              setManageMode(false)
            }
          >
            <Text
              style={styles.backText}
            >
              ← Back to flashcards
            </Text>
          </Pressable>

          <Text style={styles.title}>
            My flashcards
          </Text>

          <Text
            style={styles.topicName}
          >
            {topicName}
          </Text>

          <Text
            style={styles.subtitle}
          >
            Create and manage flashcards
            for this topic.
          </Text>

          <Pressable
            style={styles.addButton}
            onPress={openAddModal}
          >
            <Text
              style={
                styles.addButtonText
              }
            >
              + Add flashcard
            </Text>
          </Pressable>

          <Pressable
            style={[styles.aiButton, generatingAI && styles.aiButtonDisabled]}
            disabled={generatingAI}
            onPress={() => setAiPromptVisible(true)}
          >
            {generatingAI ? <ActivityIndicator color={appColor('#327E9D', 'text')} /> : <View style={styles.aiActionContent}><StudyIcon name="sparkles" size={17} /><Text style={styles.aiButtonText}>Generate with AI</Text></View>}
          </Pressable>
          {aiMaterialModal}
          {aiPreviewModal}

          {flashcards.length === 0 ? (
            <View
              style={
                styles.emptyManageCard
              }
            >
              <Text
                style={
                  styles.emptyManageTitle
                }
              >
                No flashcards yet
              </Text>

              <Text
                style={
                  styles.emptyManageText
                }
              >
                Add your first flashcard
                to start studying this
                topic.
              </Text>
            </View>
          ) : (
            flashcards.map(
              (card, index) => (
                <View
                  key={card.id}
                  style={
                    styles.manageCard
                  }
                >
                  <View
                    style={
                      styles.manageCardHeader
                    }
                  >
                    <Text
                      style={
                        styles.manageCardNumber
                      }
                    >
                      Card {index + 1}
                    </Text>

                    <View
                      style={
                        styles.manageActions
                      }
                    >
                      <Pressable
                        style={
                          styles.editButton
                        }
                        onPress={() =>
                          openEditModal(
                            card
                          )
                        }
                      >
                        <Text
                          style={
                            styles.editButtonText
                          }
                        >
                          Edit
                        </Text>
                      </Pressable>

                      <Pressable
                        style={
                          styles.deleteButton
                        }
                        onPress={() =>
                          handleDeleteCard(
                            card
                          )
                        }
                      >
                        <Text
                          style={
                            styles.deleteButtonText
                          }
                        >
                          Delete
                        </Text>
                      </Pressable>
                    </View>
                  </View>

                  <Text
                    style={
                      styles.manageQuestion
                    }
                  >
                    {card.front}
                  </Text>

                  <View
                    style={
                      styles.manageDivider
                    }
                  />

                  <Text
                    style={
                      styles.manageAnswerLabel
                    }
                  >
                    Answer
                  </Text>

                  <Text
                    style={
                      styles.manageAnswer
                    }
                  >
                    {card.back}
                  </Text>
                </View>
              )
            )
          )}
        </PullToRefreshScrollView>

        <Modal
          visible={modalVisible}
          transparent
          animationType="slide"
          onRequestClose={
            closeModal
          }
        >
          <KeyboardAvoidingView
            style={
              styles.keyboardContainer
            }
            behavior={
              Platform.OS === 'ios'
                ? 'padding'
                : 'height'
            }
          >
            <View
              style={
                styles.modalOverlay
              }
            >
              <ScrollView
                style={styles.modalScroll}
                contentContainerStyle={styles.modalScrollContent}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
                automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
              >
              <View style={styles.modalCard}>
                <Text
                  style={
                    styles.modalTitle
                  }
                >
                  {editingCard
                    ? 'Edit flashcard'
                    : 'Add flashcard'}
                </Text>

                <Text
                  style={
                    styles.modalLabel
                  }
                >
                  Question
                </Text>

                <TextInput
                  value={frontText}
                  onChangeText={
                    setFrontText
                  }
                  placeholder="Enter your question..."
                  placeholderTextColor={appColor('#9AAAB4', 'text')}
                  multiline
                  style={styles.input}
                />

                <Text
                  style={
                    styles.modalLabel
                  }
                >
                  Answer
                </Text>

                <TextInput
                  value={backText}
                  onChangeText={
                    setBackText
                  }
                  placeholder="Enter the answer..."
                  placeholderTextColor={appColor('#9AAAB4', 'text')}
                  multiline
                  style={[
                    styles.input,
                    styles.answerInput,
                  ]}
                />

                <View
                  style={
                    styles.modalActions
                  }
                >
                  <Pressable
                    style={
                      styles.cancelButton
                    }
                    onPress={
                      closeModal
                    }
                  >
                    <Text
                      style={
                        styles.cancelButtonText
                      }
                    >
                      Cancel
                    </Text>
                  </Pressable>

                  <Pressable
                    style={
                      styles.saveButton
                    }
                    onPress={
                      handleSaveCard
                    }
                  >
                    <Text
                      style={
                        styles.saveButtonText
                      }
                    >
                      {editingCard
                        ? 'Save changes'
                        : 'Add flashcard'}
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

  /* ----------------------------------------
     EMPTY STATE
  ---------------------------------------- */

  if (flashcards.length === 0) {
    return (
      <SafeAreaView
        style={styles.container}
      >
        <Stack.Screen
          options={{
            headerShown: false,
          }}
        />

        <Pressable
          style={styles.backButton}
          onPress={() =>
            router.back()
          }
        >
          <Text
            style={styles.backText}
          >
            ← Back
          </Text>
        </Pressable>

        <View
          style={
            styles.emptyContainer
          }
        >
          <Text
            style={styles.emptyTitle}
          >
            No flashcards yet
          </Text>

          <Text
            style={styles.emptyText}
          >
            Create your first flashcard
            to start studying this topic.
          </Text>

          <Pressable
            style={styles.addButton}
            onPress={() =>
              setManageMode(true)
            }
          >
            <Text
              style={
                styles.addButtonText
              }
            >
              + Add flashcard
            </Text>
          </Pressable>

          <Pressable
            style={[styles.aiButton, generatingAI && styles.aiButtonDisabled]}
            disabled={generatingAI}
            onPress={() => setAiPromptVisible(true)}
          >
            {generatingAI ? <ActivityIndicator color={appColor('#327E9D', 'text')} /> : <View style={styles.aiActionContent}><StudyIcon name="sparkles" size={17} /><Text style={styles.aiButtonText}>Generate with AI</Text></View>}
          </Pressable>
          {aiMaterialModal}
          {aiPreviewModal}
        </View>
      </SafeAreaView>
    );
  }

  /* ----------------------------------------
     FINISHED
  ---------------------------------------- */

  if (sessionFinished) {
    return (
      <SafeAreaView
        style={styles.container}
      >
        <Stack.Screen
          options={{
            headerShown: false,
          }}
        />

        <PullToRefreshScrollView
          onRefresh={refreshFlashcards}
          showsVerticalScrollIndicator={
            false
          }
          contentContainerStyle={
            styles.finishedScrollContent
          }
        >
          <Pressable
            style={styles.backButton}
            onPress={() =>
              router.back()
            }
          >
            <Text
              style={styles.backText}
            >
              ← Back
            </Text>
          </Pressable>

          <Text
            style={
              styles.finishedTitle
            }
          >
            Flashcards complete
          </Text>

          <Text
            style={styles.topicName}
          >
            {topicName}
          </Text>

          <Text
            style={styles.subtitle}
          >
            You completed this flashcard
            session.
          </Text>

          <View
            style={styles.summaryCard}
          >
            <Text
              style={styles.summaryLabel}
            >
              Cards reviewed
            </Text>

            <Text
              style={styles.summaryNumber}
            >
              {flashcards.length}
            </Text>

            <Text
              style={styles.summaryText}
            >
              Keep reviewing your
              flashcards regularly to
              strengthen your memory.
            </Text>
          </View>

          {activitySaved && (
            <View
              style={styles.savedCard}
            >
              <Text
                style={styles.savedTitle}
              >
                ✓ Saved to your progress
              </Text>

              <Text
                style={styles.savedText}
              >
                This flashcard session has
                been added to your study
                activity.
              </Text>
            </View>
          )}

          <Pressable
            style={styles.nextButton}
            onPress={
              handleStartAgain
            }
          >
            <Text
              style={
                styles.nextButtonText
              }
            >
              Start again
            </Text>
          </Pressable>

          <Pressable
            style={
              styles.manageSecondaryButton
            }
            onPress={() =>
              setManageMode(true)
            }
          >
            <Text
              style={
                styles.manageSecondaryButtonText
              }
            >
              Manage flashcards
            </Text>
          </Pressable>
        </PullToRefreshScrollView>
      </SafeAreaView>
    );
  }

  /* ----------------------------------------
     CURRENT CARD
  ---------------------------------------- */

  const currentCard =
    flashcards[currentIndex];

  const isLastCard =
    currentIndex ===
    flashcards.length - 1;

  const progressPercent =
    Math.round(
      ((currentIndex + 1) /
        flashcards.length) *
        100
    );

  /* ----------------------------------------
     MAIN FLASHCARD VIEW
  ---------------------------------------- */

  return (
    <SafeAreaView
      style={styles.container}
    >
      <Stack.Screen
        options={{
          headerShown: false,
        }}
      />

      <PullToRefreshScrollView
        onRefresh={refreshFlashcards}
        showsVerticalScrollIndicator={
          false
        }
        contentContainerStyle={
          styles.mainScrollContent
        }
      >
        <Pressable
          style={styles.backButton}
          onPress={() =>
            router.back()
          }
        >
          <Text
            style={styles.backText}
          >
            ← Back
          </Text>
        </Pressable>

        <View
          style={styles.headerRow}
        >
          <View
            style={styles.headerContent}
          >
            <Text style={styles.title}>
              Flashcards
            </Text>

            <Text
              style={styles.topicName}
            >
              {topicName}
            </Text>
          </View>

          <Pressable
            style={
              styles.manageTopButton
            }
            onPress={() =>
              setManageMode(true)
            }
          >
            <Text
              style={
                styles.manageTopButtonText
              }
            >
              Manage
            </Text>
          </Pressable>
        </View>

        <Text style={styles.subtitle}>
          Review important information
          and test your memory.
        </Text>

        <View
          style={styles.progressHeader}
        >
          <Text
            style={styles.progressText}
          >
            Card {currentIndex + 1} of{' '}
            {flashcards.length}
          </Text>

          <Text
            style={
              styles.progressPercent
            }
          >
            {progressPercent}%
          </Text>
        </View>

        <View
          style={
            styles.progressBackground
          }
        >
          <View
            style={[
              styles.progressFill,
              {
                width: `${progressPercent}%`,
              },
            ]}
          />
        </View>

        <Pressable
          style={styles.flashcard}
          onPress={() =>
            setShowAnswer(
              (previous) =>
                !previous
            )
          }
        >
          <Text
            style={styles.cardLabel}
          >
            {showAnswer
              ? 'ANSWER'
              : 'QUESTION'}
          </Text>

          <Text
            style={styles.cardText}
          >
            {showAnswer
              ? currentCard.back
              : currentCard.front}
          </Text>

          <Text
            style={styles.tapText}
          >
            {showAnswer
              ? 'Tap to see the question'
              : 'Tap to reveal the answer'}
          </Text>
        </Pressable>

        {!showAnswer && (
          <Pressable
            style={styles.showButton}
            onPress={() =>
              setShowAnswer(true)
            }
          >
            <Text
              style={
                styles.showButtonText
              }
            >
              Show answer
            </Text>
          </Pressable>
        )}

        {showAnswer && (
          <Pressable
            style={styles.nextButton}
            onPress={handleNext}
          >
            <Text
              style={
                styles.nextButtonText
              }
            >
              {isLastCard
                ? 'Finish flashcards'
                : 'Next flashcard'}
            </Text>
          </Pressable>
        )}

        <View
          style={styles.infoCard}
        >
          <Text
            style={styles.infoTitle}
          >
            Active memory practice
          </Text>

          <Text
            style={styles.infoText}
          >
            Try to answer the question in
            your head before revealing the
            answer. This helps strengthen
            recall.
          </Text>
        </View>

        <Pressable
          style={styles.reviewShortcut}
          onPress={() =>
            router.push({
              pathname:
                '/subject/topic/study/review',
              params: {
                id: topicId,
                name: topicName,
                subjectId: subjectKey,
              },
            })
          }
        >
          <Text
            style={
              styles.reviewShortcutText
            }
          >
            Review due cards
          </Text>
        </Pressable>

        <Pressable
          style={styles.addShortcut}
          onPress={openAddModal}
        >
          <Text
            style={
              styles.addShortcutText
            }
          >
            + Add a flashcard
          </Text>
        </Pressable>

        <Pressable
          style={[styles.aiShortcut, generatingAI && styles.aiButtonDisabled]}
          disabled={generatingAI}
          onPress={() => {
            if (!aiEnabled) Alert.alert('AI flashcards are off', 'Turn them on in Settings → AI preferences.');
            else setAiPromptVisible(true);
          }}
        >
          {generatingAI ? <ActivityIndicator color={appColor('#327E9D', 'text')} /> : aiEnabled ? <View style={styles.aiActionContent}><StudyIcon name="sparkles" size={17} /><Text style={styles.aiShortcutText}>Generate flashcards with AI</Text></View> : <Text style={styles.aiShortcutText}>AI flashcards are off — open Settings</Text>}
        </Pressable>
      </PullToRefreshScrollView>

      <Modal
        visible={modalVisible}
        transparent
        animationType="slide"
        onRequestClose={closeModal}
      >
        <KeyboardAvoidingView
          style={
            styles.keyboardContainer
          }
          behavior={
            Platform.OS === 'ios'
              ? 'padding'
              : 'height'
          }
        >
          <View
            style={
              styles.modalOverlay
            }
          >
            <ScrollView
              style={styles.modalScroll}
              contentContainerStyle={styles.modalScrollContent}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
              automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
            >
            <View style={styles.modalCard}>
              <Text
                style={styles.modalTitle}
              >
                {editingCard
                  ? 'Edit flashcard'
                  : 'Add flashcard'}
              </Text>

              <Text
                style={styles.modalLabel}
              >
                Question
              </Text>

              <TextInput
                value={frontText}
                onChangeText={
                  setFrontText
                }
                placeholder="Enter your question..."
                placeholderTextColor={appColor('#9AAAB4', 'text')}
                multiline
                style={styles.input}
              />

              <Text
                style={styles.modalLabel}
              >
                Answer
              </Text>

              <TextInput
                value={backText}
                onChangeText={
                  setBackText
                }
                placeholder="Enter the answer..."
                placeholderTextColor={appColor('#9AAAB4', 'text')}
                multiline
                style={[
                  styles.input,
                  styles.answerInput,
                ]}
              />

              <View
                style={
                  styles.modalActions
                }
              >
                <Pressable
                  style={
                    styles.cancelButton
                  }
                  onPress={closeModal}
                >
                  <Text
                    style={
                      styles.cancelButtonText
                    }
                  >
                    Cancel
                  </Text>
                </Pressable>

                <Pressable
                  style={
                    styles.saveButton
                  }
                  onPress={
                    handleSaveCard
                  }
                >
                  <Text
                    style={
                      styles.saveButtonText
                    }
                  >
                    {editingCard
                      ? 'Save changes'
                      : 'Add flashcard'}
                  </Text>
                </Pressable>
              </View>
            </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
      {aiMaterialModal}
      {aiPreviewModal}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: appColor('#F7FBFE', 'background'),
    paddingHorizontal: 20,
  },

  mainScrollContent: {
    paddingBottom: 40,
  },

  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },

  loadingText: {
    marginTop: 12,
    fontSize: 15,
    fontWeight: '600',
    color: appColor('#66808F', 'text'),
  },

  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },

  emptyTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: appColor('#17324D', 'text'),
  },

  emptyText: {
    fontSize: 15,
    color: appColor('#66808F', 'text'),
    textAlign: 'center',
    lineHeight: 22,
    marginTop: 8,
    marginBottom: 20,
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

  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },

  headerContent: {
    flex: 1,
  },

  title: {
    fontSize: 30,
    fontWeight: '800',
    color: appColor('#17324D', 'text'),
  },

  finishedTitle: {
    fontSize: 30,
    fontWeight: '800',
    color: appColor('#17324D', 'text'),
  },

  topicName: {
    fontSize: 18,
    fontWeight: '700',
    color: appColor('#43A5D1', 'text'),
    marginTop: 6,
  },

  subtitle: {
    fontSize: 15,
    color: appColor('#7A8B99', 'text'),
    lineHeight: 22,
    marginTop: 8,
    marginBottom: 24,
  },

  manageTopButton: {
    backgroundColor: appColor('#EAF7FD', 'background'),
    borderRadius: 14,
    paddingHorizontal: 13,
    paddingVertical: 10,
    marginLeft: 12,
  },

  manageTopButtonText: {
    fontSize: 13,
    fontWeight: '800',
    color: appColor('#43A5D1', 'text'),
  },

  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  progressText: {
    fontSize: 15,
    fontWeight: '700',
    color: appColor('#6F899B', 'text'),
  },

  progressPercent: {
    fontSize: 15,
    fontWeight: '700',
    color: appColor('#43A5D1', 'text'),
  },

  progressBackground: {
    height: 8,
    borderRadius: 10,
    backgroundColor: appColor('#DDEFF7', 'background'),
    overflow: 'hidden',
    marginTop: 10,
    marginBottom: 24,
  },

  progressFill: {
    height: '100%',
    backgroundColor: appColor('#69C4E8', 'background'),
    borderRadius: 10,
  },

  flashcard: {
    minHeight: 330,
    backgroundColor: appColor('#FFFFFF', 'background'),
    borderRadius: 26,
    borderWidth: 1,
    borderColor: appColor('#DDECF3', 'border'),
    padding: 28,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 18,
  },

  cardLabel: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1.2,
    color: appColor('#43A5D1', 'text'),
    marginBottom: 20,
  },

  cardText: {
    fontSize: 24,
    lineHeight: 34,
    fontWeight: '800',
    color: appColor('#17324D', 'text'),
    textAlign: 'center',
  },

  tapText: {
    position: 'absolute',
    bottom: 22,
    fontSize: 12,
    color: appColor('#91A5B1', 'text'),
  },

  showButton: {
    backgroundColor: appColor('#69C4E8', 'background'),
    borderRadius: 18,
    paddingVertical: 18,
    alignItems: 'center',
    marginBottom: 16,
  },

  showButtonText: {
    color: appColor('#FFFFFF', 'text'),
    fontSize: 17,
    fontWeight: '800',
  },

  nextButton: {
    backgroundColor: appColor('#43A5D1', 'background'),
    borderRadius: 18,
    paddingVertical: 18,
    alignItems: 'center',
    marginBottom: 16,
  },

  nextButtonText: {
    color: appColor('#FFFFFF', 'text'),
    fontSize: 17,
    fontWeight: '800',
  },

  infoCard: {
    backgroundColor: appColor('#EAF7FD', 'background'),
    borderRadius: 20,
    padding: 20,
    marginTop: 4,
  },

  infoTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: appColor('#17324D', 'text'),
  },

  infoText: {
    fontSize: 13,
    color: appColor('#66808F', 'text'),
    lineHeight: 20,
    marginTop: 7,
  },

  reviewShortcut: {
    backgroundColor: appColor('#EAF7FD', 'background'),
    borderRadius: 18,
    paddingVertical: 17,
    alignItems: 'center',
    marginTop: 16,
  },

  reviewShortcutText: {
    fontSize: 15,
    fontWeight: '800',
    color: appColor('#43A5D1', 'text'),
  },

  addShortcut: {
    alignItems: 'center',
    marginTop: 16,
    paddingVertical: 8,
  },

  addShortcutText: {
    fontSize: 14,
    fontWeight: '700',
    color: appColor('#43A5D1', 'text'),
  },

  aiShortcut: {
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 12,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: appColor('#EAF7FD', 'background'),
  },

  aiShortcutText: {
    fontSize: 14,
    fontWeight: '800',
    color: appColor('#327E9D', 'text'),
  },

  aiActionContent: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },

  manageScrollContent: {
    paddingBottom: 40,
  },

  addButton: {
    backgroundColor: appColor('#43A5D1', 'background'),
    borderRadius: 18,
    paddingVertical: 17,
    alignItems: 'center',
    marginBottom: 20,
  },

  addButtonText: {
    color: appColor('#FFFFFF', 'text'),
    fontSize: 16,
    fontWeight: '800',
  },

  aiButton: {
    backgroundColor: appColor('#EAF7FD', 'background'),
    borderRadius: 18,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 20,
  },

  aiButtonText: {
    color: appColor('#327E9D', 'text'),
    fontSize: 15,
    fontWeight: '800',
  },

  aiButtonDisabled: {
    opacity: 0.6,
  },

  aiModalCard: { backgroundColor: appColor('#FFFFFF', 'background'), borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: 34 },
  aiModalCopy: { fontSize: 14, lineHeight: 21, color: appColor('#66808F', 'text'), marginBottom: 13 },
  aiCountLabel: { color: appColor('#315267', 'text'), fontSize: 13, fontWeight: '700', marginBottom: 8 },
  aiCountChoices: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  aiCountChoice: { minWidth: 48, minHeight: 40, borderRadius: 12, borderWidth: 1, borderColor: appColor('#DDECF3', 'border'), backgroundColor: appColor('#F9FCFE', 'background'), alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  aiCountChoiceSelected: { borderColor: appColor('#327E9D', 'border'), backgroundColor: appColor('#E4F4F8', 'background') },
  aiCountChoiceText: { color: appColor('#66808F', 'text'), fontWeight: '700' },
  aiCountChoiceTextSelected: { color: appColor('#1E647A', 'text') },
  aiNotes: { minHeight: 150, maxHeight: 240, borderWidth: 1, borderColor: appColor('#DDECF3', 'border'), borderRadius: 16, padding: 14, fontSize: 14, color: appColor('#17324D', 'text'), backgroundColor: appColor('#F9FCFE', 'background'), textAlignVertical: 'top' },
  aiDraftCard: { padding: 12, borderRadius: 15, backgroundColor: appColor('#F3F8FA', 'background'), marginTop: 12 },
  aiDraftHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  aiDraftRemove: { color: appColor('#A34545', 'text'), fontSize: 12, fontWeight: '800' },
  aiDraftInput: { minHeight: 55, borderWidth: 1, borderColor: appColor('#DDECF3', 'border'), borderRadius: 12, padding: 11, color: appColor('#17324D', 'text'), backgroundColor: appColor('#FFFFFF', 'background'), textAlignVertical: 'top', marginBottom: 11 },
  aiDraftAnswer: { minHeight: 65, marginBottom: 0 },
  aiCaution: { color: appColor('#718493', 'text'), fontSize: 12, lineHeight: 18, marginTop: 9 },
  aiBusy: { flexDirection: 'row', gap: 10, alignItems: 'center', justifyContent: 'center', marginTop: 18 },

  manageCard: {
    backgroundColor: appColor('#FFFFFF', 'background'),
    borderRadius: 22,
    borderWidth: 1,
    borderColor: appColor('#E0EDF3', 'border'),
    padding: 20,
    marginBottom: 14,
  },

  manageCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },

  manageCardNumber: {
    fontSize: 13,
    fontWeight: '800',
    color: appColor('#43A5D1', 'text'),
  },

  manageActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  editButton: {
    backgroundColor: appColor('#EAF7FD', 'background'),
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 7,
    marginRight: 8,
  },

  editButtonText: {
    fontSize: 12,
    fontWeight: '800',
    color: appColor('#43A5D1', 'text'),
  },

  deleteButton: {
    backgroundColor: appColor('#FFF1F1', 'background'),
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },

  deleteButtonText: {
    fontSize: 12,
    fontWeight: '800',
    color: appColor('#D95C5C', 'text'),
  },

  manageQuestion: {
    fontSize: 17,
    lineHeight: 25,
    fontWeight: '800',
    color: appColor('#17324D', 'text'),
  },

  manageDivider: {
    height: 1,
    backgroundColor: appColor('#EDF3F6', 'background'),
    marginVertical: 16,
  },

  manageAnswerLabel: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.8,
    color: appColor('#43A5D1', 'text'),
    marginBottom: 6,
  },

  manageAnswer: {
    fontSize: 14,
    lineHeight: 21,
    color: appColor('#66808F', 'text'),
  },

  emptyManageCard: {
    backgroundColor: appColor('#FFFFFF', 'background'),
    borderRadius: 22,
    borderWidth: 1,
    borderColor: appColor('#E0EDF3', 'border'),
    padding: 24,
    alignItems: 'center',
  },

  emptyManageTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: appColor('#17324D', 'text'),
  },

  emptyManageText: {
    fontSize: 14,
    lineHeight: 21,
    color: appColor('#66808F', 'text'),
    textAlign: 'center',
    marginTop: 7,
  },

  keyboardContainer: {
    flex: 1,
  },

  modalOverlay: {
    flex: 1,
    backgroundColor:
      'rgba(23, 50, 77, 0.35)',
    justifyContent: 'flex-end',
  },
  modalScroll: { flex: 1 },
  modalScrollContent: { flexGrow: 1, justifyContent: 'flex-end' },

  modalCard: {
    backgroundColor: appColor('#FFFFFF', 'background'),
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 24,
    paddingBottom: 34,
  },

  modalTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: appColor('#17324D', 'text'),
    marginBottom: 22,
  },

  modalLabel: {
    fontSize: 14,
    fontWeight: '800',
    color: appColor('#17324D', 'text'),
    marginBottom: 8,
  },

  input: {
    minHeight: 90,
    borderWidth: 1,
    borderColor: appColor('#DDECF3', 'border'),
    borderRadius: 16,
    paddingHorizontal: 15,
    paddingVertical: 13,
    fontSize: 15,
    color: appColor('#17324D', 'text'),
    textAlignVertical: 'top',
    marginBottom: 18,
    backgroundColor: appColor('#F9FCFE', 'background'),
  },

  answerInput: {
    minHeight: 110,
  },

  modalActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },

  cancelButton: {
    width: '32%',
    backgroundColor: appColor('#EEF4F7', 'background'),
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
  },

  cancelButtonText: {
    fontSize: 14,
    fontWeight: '800',
    color: appColor('#66808F', 'text'),
  },

  saveButton: {
    width: '64%',
    backgroundColor: appColor('#43A5D1', 'background'),
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
  },

  saveButtonText: {
    fontSize: 14,
    fontWeight: '800',
    color: appColor('#FFFFFF', 'text'),
  },

  finishedScrollContent: {
    paddingBottom: 40,
  },

  summaryCard: {
    backgroundColor: appColor('#FFFFFF', 'background'),
    borderRadius: 22,
    borderWidth: 1,
    borderColor: appColor('#E0EDF3', 'border'),
    padding: 24,
    marginBottom: 16,
  },

  summaryLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: appColor('#43A5D1', 'text'),
  },

  summaryNumber: {
    fontSize: 42,
    fontWeight: '800',
    color: appColor('#17324D', 'text'),
    marginTop: 8,
  },

  summaryText: {
    fontSize: 15,
    color: appColor('#66808F', 'text'),
    lineHeight: 23,
    marginTop: 8,
  },

  savedCard: {
    backgroundColor: appColor('#EAF7FD', 'background'),
    borderRadius: 20,
    borderWidth: 1,
    borderColor: appColor('#BFE7F5', 'border'),
    padding: 20,
    marginBottom: 16,
  },

  savedTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: appColor('#43A5D1', 'text'),
  },

  savedText: {
    fontSize: 14,
    color: appColor('#66808F', 'text'),
    lineHeight: 21,
    marginTop: 6,
  },

  manageSecondaryButton: {
    borderWidth: 1,
    borderColor: appColor('#BFE7F5', 'border'),
    backgroundColor: appColor('#FFFFFF', 'background'),
    borderRadius: 18,
    paddingVertical: 17,
    alignItems: 'center',
    marginBottom: 16,
  },

  manageSecondaryButtonText: {
    fontSize: 16,
    fontWeight: '800',
    color: appColor('#43A5D1', 'text'),
  },
});
