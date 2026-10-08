import type {
  Subject,
  Topic,
  TopicsBySubject,
  ExamsBySubject,
  StudyActivity,
  TopicProgress,
  StudyRecommendation,
  PreparationAnalysis,
  Flashcard,
  FlashcardReview,
} from '../types/study';

/**
 * ----------------------------------------
 * TOPIC PROGRESS
 * ----------------------------------------
 *
 * Calculate progress for one topic.
 */
export function calculateTopicProgress(
  topic: Topic,
  activities: StudyActivity[]
): TopicProgress {
  const topicActivities = activities.filter(
    (activity) =>
      String(activity.topicId) ===
      String(topic.id)
  );

  const quizActivities = topicActivities.filter(
    (activity) =>
      activity.activity === 'quiz' &&
      typeof activity.correctCount === 'number' &&
      typeof activity.questionCount === 'number' &&
      activity.questionCount > 0
  );

  const questionsAnswered =
    quizActivities.reduce(
      (total, activity) =>
        total + (activity.questionCount ?? 0),
      0
    );

  const correctAnswers =
    quizActivities.reduce(
      (total, activity) =>
        total + (activity.correctCount ?? 0),
      0
    );

  const wrongAnswers =
    quizActivities.reduce(
      (total, activity) =>
        total + (activity.wrongCount ?? 0),
      0
    );

  const quizAccuracy =
    questionsAnswered > 0
      ? Math.min(
          100,
          Math.max(
            0,
            Math.round(
              (correctAnswers /
                questionsAnswered) *
                100
            )
          )
        )
      : null;

  const activeRecallCount =
    topicActivities.filter(
      (activity) =>
        activity.activity ===
        'active_recall'
    ).length;

  const quizCount =
    topicActivities.filter(
      (activity) =>
        activity.activity === 'quiz'
    ).length;

  const reviewCount =
    topicActivities.filter(
      (activity) =>
        activity.activity === 'review'
    ).length;

  const flashcardCount =
    topicActivities.filter(
      (activity) =>
        activity.activity ===
        'flashcards'
    ).length;

  const studyTimeSeconds =
    topicActivities.reduce(
      (total, activity) =>
        total +
        (activity.durationSeconds ?? 0),
      0
    );

  const hardCount =
    topicActivities.reduce(
      (total, activity) =>
        total +
        (activity.hardCount ?? 0),
      0
    );

  const againCount =
    topicActivities.reduce(
      (total, activity) =>
        total + (activity.againCount ?? 0),
      0
    );

  const goodCount =
    topicActivities.reduce(
      (total, activity) =>
        total +
        (activity.goodCount ?? 0),
      0
    );

  const easyCount =
    topicActivities.reduce(
      (total, activity) =>
        total +
        (activity.easyCount ?? 0),
      0
    );

  const sortedActivities =
    [...topicActivities].sort(
      (a, b) =>
        new Date(
          b.completedAt
        ).getTime() -
        new Date(
          a.completedAt
        ).getTime()
    );

  const lastStudiedAt =
    sortedActivities[0]
      ?.completedAt;

  return {
    topicId: String(topic.id),
    topicName: topic.name,

    quizAccuracy,

    activeRecallCount,
    quizCount,
    reviewCount,
    flashcardCount,

    questionsAnswered,
    correctAnswers,
    wrongAnswers,

    studyTimeSeconds,

    hardCount,
    againCount,
    goodCount,
    easyCount,

    lastStudiedAt,
  };
}

/**
 * ----------------------------------------
 * ALL TOPIC PROGRESS
 * ----------------------------------------
 */

export function calculateAllTopicProgress(
  topics: Topic[],
  activities: StudyActivity[]
): TopicProgress[] {
  return topics.map((topic) =>
    calculateTopicProgress(
      topic,
      activities
    )
  );
}

/**
 * ----------------------------------------
 * TOPIC COVERAGE
 * ----------------------------------------
 */

export function calculateTopicCoverage(
  topics: Topic[],
  activities: StudyActivity[]
) {
  if (topics.length === 0) {
    return {
      studied: 0,
      total: 0,
      percentage: 0,
    };
  }

  const studiedTopicIds =
    new Set(
      activities.map((activity) =>
        String(activity.topicId)
      )
    );

  const studied = topics.filter(
    (topic) =>
      studiedTopicIds.has(
        String(topic.id)
      )
  ).length;

  const percentage = Math.round(
    (studied / topics.length) * 100
  );

  return {
    studied,
    total: topics.length,
    percentage: Math.min(
      100,
      Math.max(0, percentage)
    ),
  };
}

/**
 * ----------------------------------------
 * OVERALL QUIZ ACCURACY
 * ----------------------------------------
 */

export function calculateOverallQuizAccuracy(
  activities: StudyActivity[]
) {
  const quizActivities =
    activities.filter(
      (activity) =>
        activity.activity === 'quiz' &&
        typeof activity.correctCount ===
          'number' &&
        typeof activity.questionCount ===
          'number' &&
        activity.questionCount > 0
    );

  const totalQuestions =
    quizActivities.reduce(
      (total, activity) =>
        total +
        (activity.questionCount ?? 0),
      0
    );

  const totalCorrect =
    quizActivities.reduce(
      (total, activity) =>
        total +
        (activity.correctCount ?? 0),
      0
    );

  if (totalQuestions === 0) {
    return null;
  }

  const accuracy = Math.round(
    (totalCorrect /
      totalQuestions) *
      100
  );

  return Math.min(
    100,
    Math.max(0, accuracy)
  );
}

/**
 * ----------------------------------------
 * STUDY CONSISTENCY
 * ----------------------------------------
 */

export function calculateStudyDays(
  activities: StudyActivity[]
) {
  const days = new Set(
    activities.map((activity) =>
      new Date(
        activity.completedAt
      ).toDateString()
    )
  );

  return days.size;
}

/**
 * ----------------------------------------
 * ACTIVITY COVERAGE
 * ----------------------------------------
 */

export function calculateActivityCoverage(
  topics: Topic[],
  activities: StudyActivity[],
  activityType: StudyActivity['activity']
): number {
  if (topics.length === 0) {
    return 0;
  }

  // Only topics that currently exist in the app can contribute
  // to global activity coverage. This prevents stale/deleted
  // topic IDs in AsyncStorage from inflating the percentage.
  const existingTopicIds = new Set(
    topics.map((topic) => String(topic.id))
  );

  // A topic counts once for each activity type, regardless of
  // how many times the user completed that activity.
  const completedTopicIds = new Set(
    activities
      .filter(
        (activity) =>
          activity.activity === activityType
      )
      .map((activity) =>
        String(activity.topicId)
      )
      .filter((topicId) =>
        existingTopicIds.has(topicId)
      )
  );

  const percentage = Math.round(
    (completedTopicIds.size /
      topics.length) *
      100
  );

  // Coverage is always a valid percentage.
  return Math.min(
    100,
    Math.max(0, percentage)
  );
}

/**
 * ----------------------------------------
 * RECENCY
 * ----------------------------------------
 *
 * Returns the number of days since a topic
 * was last studied.
 */
export function getDaysSinceStudy(
  lastStudiedAt?: string
): number | null {
  if (!lastStudiedAt) {
    return null;
  }

  const lastStudied =
    new Date(lastStudiedAt);

  const today = new Date();

  lastStudied.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);

  const difference =
    today.getTime() -
    lastStudied.getTime();

  return Math.max(
    0,
    Math.floor(
      difference /
        (1000 * 60 * 60 * 24)
    )
  );
}

/**
 * ----------------------------------------
 * REVIEW URGENCY
 * ----------------------------------------
 *
 * Determines how much a topic should be
 * considered for review based on recency.
 */
export function calculateReviewUrgency(
  lastStudiedAt?: string
): number {
  const daysSince =
    getDaysSinceStudy(
      lastStudiedAt
    );

  if (daysSince === null) {
    return 1;
  }

  if (daysSince >= 14) {
    return 1;
  }

  if (daysSince >= 7) {
    return 0.8;
  }

  if (daysSince >= 4) {
    return 0.6;
  }

  if (daysSince >= 2) {
    return 0.35;
  }

  return 0.1;
}

/**
 * ----------------------------------------
 * FLASHCARD REVIEW
 * ----------------------------------------
 *
 * Determine whether a flashcard is due.
 */
export function isFlashcardDue(
  flashcard: Flashcard,
  now = new Date()
): boolean {
  if (!flashcard.nextReviewAt) {
    return true;
  }

  const nextReview =
    new Date(
      flashcard.nextReviewAt
    );

  return (
    nextReview.getTime() <=
    now.getTime()
  );
}

/**
 * ----------------------------------------
 * DUE FLASHCARDS
 * ----------------------------------------
 */

export function getDueFlashcards(
  flashcards: Flashcard[],
  topicId?: string
): Flashcard[] {
  const now = new Date();

  return flashcards.filter(
    (flashcard) => {
      const topicMatches =
        topicId === undefined ||
        String(
          flashcard.topicId
        ) === String(topicId);

      return (
        topicMatches &&
        isFlashcardDue(
          flashcard,
          now
        )
      );
    }
  );
}

/**
 * ----------------------------------------
 * FLASHCARD INTERVAL
 * ----------------------------------------
 *
 * Simple first version of spaced repetition.
 *
 * Again -> tomorrow
 * Hard  -> 2 days
 * Good  -> 4 days
 * Easy  -> 7 days
 *
 * Later this can become a more advanced
 * algorithm based on previous performance.
 */
export function calculateNextReviewDate(
  rating: FlashcardReview['rating'],
  fromDate = new Date()
): string {
  const daysByRating = {
    again: 1,
    hard: 2,
    good: 4,
    easy: 7,
  };

  const days =
    daysByRating[rating];

  const nextDate =
    new Date(fromDate);

  nextDate.setDate(
    nextDate.getDate() + days
  );

  return nextDate.toISOString();
}

/**
 * ----------------------------------------
 * FLASHCARD PRIORITY
 * ----------------------------------------
 *
 * Higher score means the card should be
 * reviewed sooner.
 */
export function calculateFlashcardPriority(
  flashcard: Flashcard,
  now = new Date()
): number {
  if (!flashcard.nextReviewAt) {
    return 100;
  }

  const nextReview =
    new Date(
      flashcard.nextReviewAt
    );

  const difference =
    nextReview.getTime() -
    now.getTime();

  const daysUntil =
    difference /
    (1000 * 60 * 60 * 24);

  if (daysUntil <= 0) {
    return 100;
  }

  if (daysUntil <= 1) {
    return 80;
  }

  if (daysUntil <= 3) {
    return 60;
  }

  if (daysUntil <= 7) {
    return 40;
  }

  return 20;
}

/**
 * ----------------------------------------
 * WEAK TOPICS
 * ----------------------------------------
 *
 * Priority:
 * 1. Never studied
 * 2. Low quiz accuracy
 * 3. Not studied recently
 * 4. Hard recall / difficult activity
 */
export function findWeakTopics(
  topics: Topic[],
  activities: StudyActivity[],
  limit = 3
): TopicProgress[] {
  const progress =
    calculateAllTopicProgress(
      topics,
      activities
    );

  return [...progress]
    .sort((a, b) => {
      /*
       * Never studied topics come first.
       */
      if (
        a.lastStudiedAt &&
        !b.lastStudiedAt
      ) {
        return 1;
      }

      if (
        !a.lastStudiedAt &&
        b.lastStudiedAt
      ) {
        return -1;
      }

      /*
       * Low accuracy comes next.
       */
      const accuracyA =
        a.quizAccuracy ?? 0;

      const accuracyB =
        b.quizAccuracy ?? 0;

      if (
        accuracyA !== accuracyB
      ) {
        return (
          accuracyA - accuracyB
        );
      }

      /*
       * Topics with more difficult
       * recall activity are prioritized.
       */
      const difficultA = a.hardCount + a.againCount;
      const difficultB = b.hardCount + b.againCount;
      if (difficultA !== difficultB) {
        return (
          difficultB - difficultA
        );
      }

      /*
       * Finally compare recency.
       */
      if (
        a.lastStudiedAt &&
        b.lastStudiedAt
      ) {
        return (
          new Date(
            a.lastStudiedAt
          ).getTime() -
          new Date(
            b.lastStudiedAt
          ).getTime()
        );
      }

      return 0;
    })
    .slice(0, limit);
}

/**
 * ----------------------------------------
 * TOPIC RECOMMENDATION
 * ----------------------------------------
 */

export function createTopicRecommendation(
  topic: Topic,
  subjectId: string,
  subjectName: string,
  progress: TopicProgress
): StudyRecommendation {
  let priority:
    | 'low'
    | 'medium'
    | 'high' = 'medium';

  let reason =
    'This topic could benefit from another study session.';

  const recommendedActivities:
    StudyActivity['activity'][] =
    [];

  /*
   * ----------------------------------------
   * 1. COMPLETELY NEW TOPIC
   * ----------------------------------------
   *
   * Nothing has been studied yet.
   */
  if (
    progress.activeRecallCount === 0 &&
    progress.quizCount === 0 &&
    progress.reviewCount === 0 &&
    progress.flashcardCount === 0
  ) {
    priority = 'high';

    reason =
      'This topic has not been studied yet.';

    recommendedActivities.push(
      'active_recall',
      'quiz'
    );
  }

  /*
   * ----------------------------------------
   * 2. ACTIVE RECALL DONE, BUT NO QUIZ YET
   * ----------------------------------------
   *
   * The user has already started studying.
   * We should not tell them that the topic
   * has not been tested at all.
   */
  else if (
    progress.quizCount === 0 &&
    progress.activeRecallCount > 0
  ) {
    priority = 'medium';

    reason =
      'You have completed Active Recall. The next step is to test your knowledge with a quiz.';

    recommendedActivities.push(
      'quiz'
    );

    if (progress.reviewCount === 0) {
      recommendedActivities.push(
        'review'
      );
    }
  }

  /*
   * ----------------------------------------
   * 3. VERY WEAK QUIZ PERFORMANCE
   * ----------------------------------------
   */
  else if (
    progress.quizAccuracy !== null &&
    progress.quizAccuracy < 60
  ) {
    priority = 'high';

    reason =
      `Your quiz accuracy is ${progress.quizAccuracy}%.`;

    recommendedActivities.push(
      'active_recall',
      'quiz',
      'review'
    );
  }

  /*
   * ----------------------------------------
   * 4. MODERATE QUIZ PERFORMANCE
   * ----------------------------------------
   */
  else if (
    progress.quizAccuracy !== null &&
    progress.quizAccuracy < 80
  ) {
    priority = 'medium';

    reason =
      `Your quiz accuracy is ${progress.quizAccuracy}%.`;

    recommendedActivities.push(
      'quiz',
      'review'
    );

    if (
      progress.activeRecallCount === 0
    ) {
      recommendedActivities.unshift(
        'active_recall'
      );
    }
  }

  /*
   * ----------------------------------------
   * 5. STRONG QUIZ PERFORMANCE
   * ----------------------------------------
   */
  else {
    priority = 'low';

    reason =
      'Your performance is strong. Keep reviewing to maintain it.';

    recommendedActivities.push(
      'review'
    );

    if (
      progress.flashcardCount === 0
    ) {
      recommendedActivities.push(
        'flashcards'
      );
    }
  }

  /*
   * ----------------------------------------
   * 6. FLASHCARDS HAVE NOT BEEN USED
   * ----------------------------------------
   *
   * Introduce flashcards after the user
   * has already completed a quiz.
   */
  if (
    progress.flashcardCount === 0 &&
    progress.quizCount > 0 &&
    !recommendedActivities.includes(
      'flashcards'
    )
  ) {
    recommendedActivities.push(
      'flashcards'
    );
  }

  /*
   * ----------------------------------------
   * 7. REVIEW RECENCY
   * ----------------------------------------
   */
  const daysSince =
    getDaysSinceStudy(
      progress.lastStudiedAt
    );

  if (
    daysSince !== null &&
    daysSince >= 7
  ) {
    if (priority === 'low') {
      priority = 'medium';
    }

    if (
      !recommendedActivities.includes(
        'review'
      )
    ) {
      recommendedActivities.push(
        'review'
      );
    }

    reason =
      `${reason} It has been ${daysSince} days since you last studied this topic.`;
  }

  /*
   * ----------------------------------------
   * 8. DIFFICULT ACTIVE RECALL
   * ----------------------------------------
   */
  if (
    progress.hardCount + progress.againCount >= 3
  ) {
    priority = 'high';

    if (
      !recommendedActivities.includes(
        'active_recall'
      )
    ) {
      recommendedActivities.unshift(
        'active_recall'
      );
    }

    reason =
      `${reason} You have marked several study items as difficult.`;
  }

  /*
   * ----------------------------------------
   * RETURN RECOMMENDATION
   * ----------------------------------------
   */
  return {
    topicId: progress.topicId,
    topicName: topic.name,

    subjectId,
    subjectName,

    priority,
    reason,

    recommendedActivities,

    estimatedMinutes:
      priority === 'high'
        ? 30
        : priority === 'medium'
        ? 20
        : 15,
  };
}

/**
 * ----------------------------------------
 * EXAM DATE
 * ----------------------------------------
 */

function getDaysUntilExam(
  examDate: string
): number {
  const [year, month, day] = examDate.split('-').map(Number);
  const parsed = new Date(year, month - 1, day);
  if (!year || !month || !day || parsed.getFullYear() !== year || parsed.getMonth() !== month - 1 || parsed.getDate() !== day) return -1;
  const today = new Date();
  return Math.round((Date.UTC(year, month - 1, day) - Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())) / 86_400_000);
}

/**
 * ----------------------------------------
 * EXAM URGENCY
 * ----------------------------------------
 */

function getExamUrgencyMultiplier(
  daysUntilExam: number | null
): number {
  if (daysUntilExam === null) {
    return 1;
  }

  if (daysUntilExam <= 7) {
    return 1.4;
  }

  if (daysUntilExam <= 14) {
    return 1.25;
  }

  if (daysUntilExam <= 30) {
    return 1.1;
  }

  return 1;
}

/**
 * ----------------------------------------
 * TOPIC PRIORITY SCORE
 * ----------------------------------------
 *
 * This is an important foundation for
 * Today's Focus and the future Study Plan.
 *
 * The score combines:
 *
 * - quiz weakness
 * - recency
 * - study coverage
 * - difficult recall
 * - exam urgency
 */
export function calculateTopicPriorityScore(
  progress: TopicProgress,
  daysUntilExam: number | null = null
): number {
  /*
   * Never studied.
   */
  if (!progress.lastStudiedAt) {
    return 100;
  }

  /*
   * Quiz weakness.
   */
  const quizWeakness =
    progress.quizAccuracy === null
      ? 50
      : 100 -
        progress.quizAccuracy;

  /*
   * Recency.
   */
  const reviewUrgency =
    calculateReviewUrgency(
      progress.lastStudiedAt
    ) * 100;

  /*
   * Difficult study activity.
   */
  const difficultyScore =
    Math.min(
      100,
      (progress.hardCount + progress.againCount) * 15
    );

  /*
   * Exam urgency.
   */
  const examMultiplier =
    getExamUrgencyMultiplier(
      daysUntilExam
    );

  const baseScore =
    quizWeakness * 0.45 +
    reviewUrgency * 0.25 +
    difficultyScore * 0.20 +
    (progress.quizCount === 0
      ? 10
      : 0);

  return Math.round(
    Math.min(
      100,
      baseScore *
        examMultiplier
    )
  );
}

/**
 * ----------------------------------------
 * PREPARATION ANALYSIS
 * ----------------------------------------
 *
 * This is the central analysis function.
 *
 * It powers:
 *
 * - Global Progress
 * - Today's Focus
 * - Study Plan
 * - Smart recommendations
 * - Future AI prioritization
 */
export function calculatePreparationAnalysis(
  subjects: Subject[],
  topicsBySubject: TopicsBySubject,
  examsBySubject: ExamsBySubject,
  activities: StudyActivity[]
): PreparationAnalysis {
  /*
   * ----------------------------------------
   * ALL TOPICS
   * ----------------------------------------
   */

  const topicEntries =
    subjects.flatMap(
      (subject) =>
        (
          topicsBySubject[
            String(subject.id)
          ] ?? []
        ).map((topic) => ({
          topic,
          subject,
        }))
    );

  const topics =
    topicEntries.map(
      (entry) =>
        entry.topic
    );

  const totalTopics =
    topics.length;

  /*
   * ----------------------------------------
   * BASIC METRICS
   * ----------------------------------------
   */

  const topicCoverage =
    calculateTopicCoverage(
      topics,
      activities
    );

  const quizAccuracy =
    calculateOverallQuizAccuracy(
      activities
    );

  const activeRecallCoverage =
    calculateActivityCoverage(
      topics,
      activities,
      'active_recall'
    );

  const reviewCoverage =
    calculateActivityCoverage(
      topics,
      activities,
      'review'
    );

  const flashcardCoverage =
    calculateActivityCoverage(
      topics,
      activities,
      'flashcards'
    );

  const studyDays =
    calculateStudyDays(
      activities
    );

  /*
   * ----------------------------------------
   * NEXT EXAM
   * ----------------------------------------
   */

  const exams = subjects
    .map((subject) => {
      const exam =
        examsBySubject[
          String(subject.id)
        ];

      if (!exam) {
        return null;
      }

      return {
        subject,
        exam,
        daysUntil:
          getDaysUntilExam(
            exam.date
          ),
      };
    })
    .filter((entry) => entry !== null && entry.daysUntil >= 0) as {
    subject: Subject;
    exam: NonNullable<
      ExamsBySubject[string]
    >;
    daysUntil: number;
  }[];

  exams.sort(
    (a, b) =>
      a.daysUntil -
      b.daysUntil
  );

  const nextExam =
    exams[0] ?? null;

  /*
   * ----------------------------------------
   * WEAK TOPICS
   * ----------------------------------------
   */

  const weakTopicProgress =
    findWeakTopics(
      topics,
      activities,
      5
    );

  const weakTopics =
    weakTopicProgress.map(
      (topic) =>
        topic.topicName
    );

  /*
   * ----------------------------------------
   * PREPARATION INDICATOR
   * ----------------------------------------
   * This is an activity summary, not an exam
   * outcome prediction. Exam urgency affects
   * recommendations, never the score itself.
   */

  let overallScore = 0;

  if (totalTopics > 0) {
    const quizScore =
      quizAccuracy ?? 0;

    const baseScore =
      topicCoverage.percentage *
        0.40 +
      quizScore *
        0.25 +
      activeRecallCoverage *
        0.15 +
      reviewCoverage *
        0.10 +
      flashcardCoverage *
        0.10;

    overallScore =
      Math.min(
        100,
        Math.round(baseScore)
      );
  }

  /*
   * ----------------------------------------
   * RECOMMENDATIONS
   * ----------------------------------------
   */

  const recommendations =
    topicEntries
      .map(
        ({
          topic,
          subject,
        }) => {
          const progress =
            calculateTopicProgress(
              topic,
              activities
            );

          const recommendation =
            createTopicRecommendation(
              topic,
              String(
                subject.id
              ),
              subject.name,
              progress
            );

          /*
           * Increase priority when the
           * exam is close.
           */
          if (
            nextExam &&
            nextExam.daysUntil <=
              14 &&
            recommendation.priority ===
              'medium'
          ) {
            recommendation.priority =
              'high';

            recommendation.reason =
              `${recommendation.reason} Your exam is in ${nextExam.daysUntil} days.`;
          }

          return {
            recommendation,
            progress,
          };
        }
      )
      .sort((a, b) => {
        /*
         * First compare recommendation
         * priority.
         */
        const priorityScore = {
          high: 3,
          medium: 2,
          low: 1,
        };

        const priorityDifference =
          priorityScore[
            b.recommendation.priority
          ] -
          priorityScore[
            a.recommendation.priority
          ];

        if (
          priorityDifference !== 0
        ) {
          return priorityDifference;
        }

        /*
         * Then compare intelligent
         * topic priority score.
         */
        const scoreA =
          calculateTopicPriorityScore(
            a.progress,
            nextExam
              ? nextExam.daysUntil
              : null
          );

        const scoreB =
          calculateTopicPriorityScore(
            b.progress,
            nextExam
              ? nextExam.daysUntil
              : null
          );

        return (
          scoreB - scoreA
        );
      })
      .map(
        (item) =>
          item.recommendation
      );

  /*
   * ----------------------------------------
   * RETURN
   * ----------------------------------------
   */

  return {
    overallScore,

    topicsCovered:
      topicCoverage.studied,

    totalTopics,

    quizAccuracy,

    activeRecallCoverage,

    reviewCoverage,

    flashcardCoverage,

    studyDays,

    weakTopics,

    recommendations,
  };
}
