import { LocalizedText as Text } from '@/components/localized-text';
import { appColor } from '@/constants/adaptive-color';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import PullToRefreshScrollView from '../../../../components/pull-to-refresh-scroll-view';

import type {
  Flashcard,
  FlashcardReview,
  StudyActivity,
} from '../../../../types/study';

import {
  addFlashcardReview,
  addStudyActivity,
  getFlashcards,
  updateFlashcard,
} from '../../../../services/storage';

import {
  calculateNextReviewDate,
  getDueFlashcards,
} from '../../../../services/study-engine';

type ReviewRating =
  FlashcardReview['rating'];

export default function ReviewScreen() {
  const { id, name, all } = useLocalSearchParams();

  const topicId = String(id ?? '');
  const allTopics = all === '1';
  const topicName = String(
    name ?? (allTopics ? 'Due flashcards' : 'Unknown topic')
  );

  const [flashcards, setFlashcards] =
    useState<Flashcard[]>([]);

  const [currentIndex, setCurrentIndex] =
    useState(0);

  const [showAnswer, setShowAnswer] =
    useState(false);

  const [loading, setLoading] =
    useState(true);

  const [sessionStartedAt] =
    useState(Date.now());

  const [sessionFinished, setSessionFinished] =
    useState(false);

  const [reviewedCount, setReviewedCount] =
    useState(0);

  const [againCount, setAgainCount] =
    useState(0);

  const [hardCount, setHardCount] =
    useState(0);

  const [goodCount, setGoodCount] =
    useState(0);

  const [easyCount, setEasyCount] =
    useState(0);

  const [saving, setSaving] =
    useState(false);
  const ratingTotals = useRef(new Map<string, { topicName: string; count: number; again: number; hard: number; good: number; easy: number }>());

  useEffect(() => {
    loadDueFlashcards();
  }, [topicId, allTopics]);

  const loadDueFlashcards =
    async () => {
      try {
        setLoading(true);

        const allFlashcards =
          await getFlashcards();

        const dueCards =
          getDueFlashcards(
            allFlashcards,
            allTopics ? undefined : topicId
          );

        setFlashcards(dueCards);
        setCurrentIndex(0);
        setShowAnswer(false);
      } catch (error) {
        console.error(
          'Failed to load review flashcards:',
          error
        );
      } finally {
        setLoading(false);
      }
    };

  const refreshDueFlashcards = async () => {
    try {
      const currentCardId = flashcards[currentIndex]?.id;
      const allFlashcards = await getFlashcards();
      const dueCards = getDueFlashcards(allFlashcards, allTopics ? undefined : topicId);
      setFlashcards(dueCards);
      const currentCardIndex = dueCards.findIndex((card) => String(card.id) === String(currentCardId));
      if (currentCardIndex >= 0) setCurrentIndex(currentCardIndex);
      else if (currentIndex >= dueCards.length) {
        setCurrentIndex(Math.max(0, dueCards.length - 1));
        setShowAnswer(false);
      }
    } catch (error) {
      console.warn('Could not refresh review cards:', error);
    }
  };

  const saveReviewActivity =
    async () => {
      const durationSeconds =
        Math.max(
          1,
          Math.round(
            (Date.now() -
              sessionStartedAt) /
              1000
          )
        );

      const groups = [...ratingTotals.current.entries()];
      for (const [index, [groupTopicId, counts]] of groups.entries()) {
        const activity: StudyActivity = {
          id: Date.now() + index,
          topicId: groupTopicId,
          topicName: counts.topicName,
          activity: 'review',
          completedAt: new Date().toISOString(),
          durationSeconds: index === 0 ? durationSeconds : 0,
          questionCount: counts.count,
          againCount: counts.again,
          hardCount: counts.hard,
          goodCount: counts.good,
          easyCount: counts.easy,
        };
        await addStudyActivity(activity);
      }
    };

  const handleRating = async (
    rating: ReviewRating
  ) => {
    if (saving) {
      return;
    }

    const currentFlashcard =
      flashcards[currentIndex];

    if (!currentFlashcard) {
      return;
    }

    try {
      setSaving(true);

      const reviewedAt =
        new Date();

      const nextReviewAt =
        calculateNextReviewDate(
          rating,
          reviewedAt
        );

      const updatedDifficulty =
        rating === 'again'
          ? 'hard'
          : rating === 'hard'
          ? 'hard'
          : rating === 'good'
          ? 'medium'
          : 'easy';

      const review: FlashcardReview = {
        id: `${currentFlashcard.id}-${Date.now()}`,
        flashcardId:
          currentFlashcard.id,
        topicId: String(currentFlashcard.topicId),
        reviewedAt:
          reviewedAt.toISOString(),
        rating,
      };

      await addFlashcardReview(
        review
      );

      await updateFlashcard(
        currentFlashcard.id,
        {
          lastReviewedAt:
            reviewedAt.toISOString(),
          nextReviewAt,
          difficulty:
            updatedDifficulty,
        }
      );

      const cardTopicId = String(currentFlashcard.topicId);
      const cardTopicName = currentFlashcard.topicName || topicName;
      const topicCounts = ratingTotals.current.get(cardTopicId) ?? {
        topicName: cardTopicName, count: 0, again: 0, hard: 0, good: 0, easy: 0,
      };
      topicCounts.count += 1;
      topicCounts[rating] += 1;
      ratingTotals.current.set(cardTopicId, topicCounts);

      setReviewedCount(
        (previous) =>
          previous + 1
      );

      if (rating === 'again') {
        setAgainCount(
          (previous) =>
            previous + 1
        );
      }

      if (rating === 'hard') {
        setHardCount(
          (previous) =>
            previous + 1
        );
      }

      if (rating === 'good') {
        setGoodCount(
          (previous) =>
            previous + 1
        );
      }

      if (rating === 'easy') {
        setEasyCount(
          (previous) =>
            previous + 1
        );
      }

      const isLastCard =
        currentIndex ===
        flashcards.length - 1;

      if (isLastCard) {
        await saveReviewActivity();
        setSessionFinished(true);
        return;
      }

      setCurrentIndex(
        (previous) =>
          previous + 1
      );

      setShowAnswer(false);
    } catch (error) {
      console.error(
        'Failed to save flashcard review:',
        error
      );
    } finally {
      setSaving(false);
    }
  };

  const handleReviewAgain =
    async () => {
      setSessionFinished(false);
      setReviewedCount(0);
      setAgainCount(0);
      setHardCount(0);
      setGoodCount(0);
      setEasyCount(0);
      ratingTotals.current.clear();

      await loadDueFlashcards();
    };

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
          style={styles.loadingContainer}
        >
          <ActivityIndicator
            size="large"
          />

          <Text
            style={styles.loadingText}
          >
            Loading review cards...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

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

        <PullToRefreshScrollView onRefresh={refreshDueFlashcards}
          contentContainerStyle={
            styles.scrollContent
          }
          showsVerticalScrollIndicator={
            false
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
            style={
              styles.finishedHeader
            }
          >
            <Text
              style={
                styles.finishedTitle
              }
            >
              Review complete
            </Text>

            <Text
              style={
                styles.finishedTopic
              }
            >
              {allTopics ? 'All topics' : topicName}
            </Text>

            <Text
              style={
                styles.finishedSubtitle
              }
            >
              Great job. Your review
              progress has been saved.
            </Text>
          </View>

          <View
            style={styles.summaryCard}
          >
            <Text
              style={
                styles.summaryLabel
              }
            >
              Cards reviewed
            </Text>

            <Text
              style={
                styles.summaryValue
              }
            >
              {reviewedCount}
            </Text>

            <View
              style={styles.ratingRow}
            >
              <View
                style={styles.ratingItem}
              >
                <Text
                  style={
                    styles.ratingNumber
                  }
                >
                  {againCount}
                </Text>

                <Text
                  style={
                    styles.ratingLabel
                  }
                >
                  Again
                </Text>
              </View>

              <View
                style={styles.ratingItem}
              >
                <Text
                  style={
                    styles.ratingNumber
                  }
                >
                  {hardCount}
                </Text>

                <Text
                  style={
                    styles.ratingLabel
                  }
                >
                  Hard
                </Text>
              </View>

              <View
                style={styles.ratingItem}
              >
                <Text
                  style={
                    styles.ratingNumber
                  }
                >
                  {goodCount}
                </Text>

                <Text
                  style={
                    styles.ratingLabel
                  }
                >
                  Good
                </Text>
              </View>

              <View
                style={styles.ratingItem}
              >
                <Text
                  style={
                    styles.ratingNumber
                  }
                >
                  {easyCount}
                </Text>

                <Text
                  style={
                    styles.ratingLabel
                  }
                >
                  Easy
                </Text>
              </View>
            </View>
          </View>

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
              Your flashcards have been
              scheduled for their next
              review automatically.
            </Text>
          </View>

          <Pressable
            style={styles.nextButton}
            onPress={
              handleReviewAgain
            }
          >
            <Text
              style={
                styles.nextButtonText
              }
            >
              Check for more cards
            </Text>
          </Pressable>
        </PullToRefreshScrollView>
      </SafeAreaView>
    );
  }

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

        <PullToRefreshScrollView onRefresh={refreshDueFlashcards}
          contentContainerStyle={
            styles.scrollContent
          }
          showsVerticalScrollIndicator={
            false
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
            style={styles.emptyHeader}
          >
            <Text
              style={styles.emptyTitle}
            >
              Nothing to review
            </Text>

            <Text
              style={styles.topicName}
            >
              {allTopics ? 'All topics' : topicName}
            </Text>

            <Text
              style={styles.subtitle}
            >
              There are no flashcards due
              for review right now.
            </Text>
          </View>

          <View
            style={styles.infoCard}
          >
            <Text
              style={styles.infoTitle}
            >
              How Review works
            </Text>

            <Text
              style={styles.infoText}
            >
              When you create and study
              flashcards, MedExam will
              automatically schedule them
              for future review based on
              how well you remember them.
            </Text>
          </View>

          <Pressable
            style={styles.nextButton}
            onPress={() =>
              router.back()
            }
          >
            <Text
              style={
                styles.nextButtonText
              }
            >
              Back to study
            </Text>
          </Pressable>
        </PullToRefreshScrollView>
      </SafeAreaView>
    );
  }

  const currentFlashcard =
    flashcards[currentIndex];

  const progressPercent =
    Math.round(
      ((currentIndex + 1) /
        flashcards.length) *
        100
    );

  return (
    <SafeAreaView
      style={styles.container}
    >
      <Stack.Screen
        options={{
          headerShown: false,
        }}
      />

      <PullToRefreshScrollView onRefresh={refreshDueFlashcards}
        contentContainerStyle={
          styles.scrollContent
        }
        showsVerticalScrollIndicator={
          false
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

        <View style={styles.header}>
          <Text style={styles.title}>
            Review
          </Text>

          <Text
            style={styles.topicName}
          >
            {allTopics ? currentFlashcard.topicName : topicName}
          </Text>

          <Text
            style={styles.subtitle}
          >
            Review your due flashcards
            and strengthen your memory.
          </Text>
        </View>

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

        <View
          style={styles.questionCard}
        >
          <Text
            style={styles.questionLabel}
          >
            Question
          </Text>

          <Text
            style={styles.question}
          >
            {currentFlashcard.front}
          </Text>
        </View>

        {!showAnswer ? (
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
        ) : (
          <>
            <View
              style={styles.answerCard}
            >
              <Text
                style={
                  styles.answerLabel
                }
              >
                Answer
              </Text>

              <Text
                style={styles.answer}
              >
                {currentFlashcard.back}
              </Text>
            </View>

            <View
              style={styles.ratingSection}
            >
              <Text
                style={
                  styles.ratingTitle
                }
              >
                How well did you remember
                this?
              </Text>

              <Text
                style={
                  styles.ratingSubtitle
                }
              >
                Your answer determines when
                this card appears again.
              </Text>

              <View
                style={styles.ratingButtons}
              >
                <Pressable
                  style={[
                    styles.ratingButton,
                    styles.againButton,
                  ]}
                  disabled={saving}
                  onPress={() =>
                    handleRating(
                      'again'
                    )
                  }
                >
                  <Text
                    style={
                      styles.ratingButtonTitle
                    }
                  >
                    Again
                  </Text>

                  <Text
                    style={
                      styles.ratingButtonText
                    }
                  >
                    Tomorrow
                  </Text>
                </Pressable>

                <Pressable
                  style={[
                    styles.ratingButton,
                    styles.hardButton,
                  ]}
                  disabled={saving}
                  onPress={() =>
                    handleRating(
                      'hard'
                    )
                  }
                >
                  <Text
                    style={
                      styles.ratingButtonTitle
                    }
                  >
                    Hard
                  </Text>

                  <Text
                    style={
                      styles.ratingButtonText
                    }
                  >
                    In 2 days
                  </Text>
                </Pressable>

                <Pressable
                  style={[
                    styles.ratingButton,
                    styles.goodButton,
                  ]}
                  disabled={saving}
                  onPress={() =>
                    handleRating(
                      'good'
                    )
                  }
                >
                  <Text
                    style={
                      styles.ratingButtonTitle
                    }
                  >
                    Good
                  </Text>

                  <Text
                    style={
                      styles.ratingButtonText
                    }
                  >
                    In 4 days
                  </Text>
                </Pressable>

                <Pressable
                  style={[
                    styles.ratingButton,
                    styles.easyButton,
                  ]}
                  disabled={saving}
                  onPress={() =>
                    handleRating(
                      'easy'
                    )
                  }
                >
                  <Text
                    style={
                      styles.ratingButtonTitle
                    }
                  >
                    Easy
                  </Text>

                  <Text
                    style={
                      styles.ratingButtonText
                    }
                  >
                    In 7 days
                  </Text>
                </Pressable>
              </View>
            </View>
          </>
        )}

        <View
          style={styles.infoCard}
        >
          <Text
            style={styles.infoTitle}
          >
            Smart repetition
          </Text>

          <Text
            style={styles.infoText}
          >
            MedExam uses your rating to
            decide when this flashcard
            should appear again. Cards you
            struggle with return sooner,
            while cards you know well are
            scheduled further into the
            future.
          </Text>
        </View>
      </PullToRefreshScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: appColor('#F7FAFC', 'background'),
  },

  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },

  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },

  loadingText: {
    fontSize: 15,
    color: appColor('#64748B', 'text'),
  },

  backButton: {
    alignSelf: 'flex-start',
    marginBottom: 24,
    paddingVertical: 6,
  },

  backText: {
    fontSize: 16,
    fontWeight: '600',
    color: appColor('#2563EB', 'text'),
  },

  header: {
    marginBottom: 24,
  },

  title: {
    fontSize: 32,
    fontWeight: '800',
    color: appColor('#0F172A', 'text'),
  },

  topicName: {
    marginTop: 6,
    fontSize: 18,
    fontWeight: '700',
    color: appColor('#2563EB', 'text'),
  },

  subtitle: {
    marginTop: 8,
    fontSize: 15,
    lineHeight: 22,
    color: appColor('#64748B', 'text'),
  },

  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },

  progressText: {
    fontSize: 14,
    fontWeight: '600',
    color: appColor('#475569', 'text'),
  },

  progressPercent: {
    fontSize: 14,
    fontWeight: '700',
    color: appColor('#2563EB', 'text'),
  },

  progressBackground: {
    height: 8,
    borderRadius: 10,
    backgroundColor: appColor('#E2E8F0', 'background'),
    overflow: 'hidden',
    marginBottom: 24,
  },

  progressFill: {
    height: '100%',
    borderRadius: 10,
    backgroundColor: appColor('#3B82F6', 'background'),
  },

  questionCard: {
    backgroundColor: appColor('#FFFFFF', 'background'),
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: appColor('#E2E8F0', 'border'),
    marginBottom: 16,
  },

  questionLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: appColor('#2563EB', 'text'),
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
  },

  question: {
    fontSize: 22,
    lineHeight: 31,
    fontWeight: '700',
    color: appColor('#0F172A', 'text'),
  },

  showButton: {
    backgroundColor: appColor('#2563EB', 'background'),
    borderRadius: 16,
    paddingVertical: 17,
    alignItems: 'center',
    marginBottom: 16,
  },

  showButtonText: {
    color: appColor('#FFFFFF', 'text'),
    fontSize: 16,
    fontWeight: '700',
  },

  answerCard: {
    backgroundColor: appColor('#EFF6FF', 'background'),
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: appColor('#BFDBFE', 'border'),
    marginBottom: 20,
  },

  answerLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: appColor('#2563EB', 'text'),
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
  },

  answer: {
    fontSize: 18,
    lineHeight: 28,
    color: appColor('#1E293B', 'text'),
  },

  ratingSection: {
    marginBottom: 20,
  },

  ratingTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: appColor('#0F172A', 'text'),
  },

  ratingSubtitle: {
    marginTop: 6,
    marginBottom: 14,
    fontSize: 14,
    lineHeight: 20,
    color: appColor('#64748B', 'text'),
  },

  ratingButtons: {
    gap: 10,
  },

  ratingButton: {
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderWidth: 1,
  },

  againButton: {
    backgroundColor: appColor('#FEF2F2', 'background'),
    borderColor: appColor('#FECACA', 'border'),
  },

  hardButton: {
    backgroundColor: appColor('#FFF7ED', 'background'),
    borderColor: appColor('#FED7AA', 'border'),
  },

  goodButton: {
    backgroundColor: appColor('#F0FDF4', 'background'),
    borderColor: appColor('#BBF7D0', 'border'),
  },

  easyButton: {
    backgroundColor: appColor('#EFF6FF', 'background'),
    borderColor: appColor('#BFDBFE', 'border'),
  },

  ratingButtonTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: appColor('#0F172A', 'text'),
  },

  ratingButtonText: {
    marginTop: 2,
    fontSize: 13,
    color: appColor('#64748B', 'text'),
  },

  infoCard: {
    backgroundColor: appColor('#FFFFFF', 'background'),
    borderRadius: 18,
    padding: 20,
    borderWidth: 1,
    borderColor: appColor('#E2E8F0', 'border'),
    marginTop: 8,
  },

  infoTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: appColor('#0F172A', 'text'),
    marginBottom: 8,
  },

  infoText: {
    fontSize: 14,
    lineHeight: 21,
    color: appColor('#64748B', 'text'),
  },

  finishedHeader: {
    marginBottom: 24,
  },

  finishedTitle: {
    fontSize: 32,
    fontWeight: '800',
    color: appColor('#0F172A', 'text'),
  },

  finishedTopic: {
    marginTop: 6,
    fontSize: 18,
    fontWeight: '700',
    color: appColor('#2563EB', 'text'),
  },

  finishedSubtitle: {
    marginTop: 8,
    fontSize: 15,
    lineHeight: 22,
    color: appColor('#64748B', 'text'),
  },

  summaryCard: {
    backgroundColor: appColor('#FFFFFF', 'background'),
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: appColor('#E2E8F0', 'border'),
    marginBottom: 16,
  },

  summaryLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: appColor('#64748B', 'text'),
  },

  summaryValue: {
    marginTop: 4,
    fontSize: 42,
    fontWeight: '800',
    color: appColor('#0F172A', 'text'),
  },

  ratingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 20,
  },

  ratingItem: {
    alignItems: 'center',
  },

  ratingNumber: {
    fontSize: 20,
    fontWeight: '800',
    color: appColor('#0F172A', 'text'),
  },

  ratingLabel: {
    marginTop: 3,
    fontSize: 12,
    color: appColor('#64748B', 'text'),
  },

  savedCard: {
    backgroundColor: appColor('#F0FDF4', 'background'),
    borderRadius: 18,
    padding: 20,
    borderWidth: 1,
    borderColor: appColor('#BBF7D0', 'border'),
    marginBottom: 16,
  },

  savedTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: appColor('#166534', 'text'),
    marginBottom: 6,
  },

  savedText: {
    fontSize: 14,
    lineHeight: 21,
    color: appColor('#166534', 'text'),
  },

  nextButton: {
    backgroundColor: appColor('#2563EB', 'background'),
    borderRadius: 16,
    paddingVertical: 17,
    alignItems: 'center',
    marginTop: 8,
  },

  nextButtonText: {
    color: appColor('#FFFFFF', 'text'),
    fontSize: 16,
    fontWeight: '700',
  },

  emptyHeader: {
    marginBottom: 24,
  },

  emptyTitle: {
    fontSize: 32,
    fontWeight: '800',
    color: appColor('#0F172A', 'text'),
  },
});
