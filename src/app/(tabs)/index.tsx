import { LocalizedText as Text } from '@/components/localized-text';
import { appColor } from '@/constants/adaptive-color';
import { router, useFocusEffect, type Href } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Image } from 'expo-image';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { calculatePreparationAnalysis } from '../../services/study-engine';
import { getSubjects, getTopicsBySubject, getExamsBySubject, getStudyActivity, getStudyPreferences } from '../../services/storage';
import PullToRefreshScrollView from '../../components/pull-to-refresh-scroll-view';
import { useDayRefresh } from '../../hooks/use-day-refresh';
import { useAuth } from '../../services/auth-context';
import { getAIStudyAnalysis } from '../../services/ai-api';
import { getProfileAvatar } from '../../services/profile-avatar';

type Subject = {
  id: string | number;
  name: string;
  icon?: string;
  emoji?: string;
};

type Topic = {
  id: number;
  name: string;
};

type TopicsBySubject = {
  [subjectId: string]: Topic[];
};

type Exam = {
  date: string;
  type: string;
  topicIds: number[];
};

type ExamsBySubject = {
  [subjectId: string]: Exam | null;
};

type StudyActivity = {
  id: number;
  topicId: string;
  topicName: string;
  activity:
    | 'active_recall'
    | 'quiz'
    | 'review'
    | 'flashcards'
    | 'focus';
  completedAt: string;
  durationSeconds: number;
  questionCount: number;
  correctCount?: number;
  wrongCount?: number;
  score?: number;
  hardCount?: number;
  goodCount?: number;
  easyCount?: number;
};

type AIStudyAnalysis = {
  topicId: string;
  topicName: string;
  subjectId: string;
  subjectName: string;
  priority: 'low' | 'medium' | 'high';
  reason: string;
  recommendedActivities: Array<
    'active_recall' | 'quiz' | 'review' | 'flashcards'
  >;
  estimatedMinutes: number;
};


function keyToDate(key: string) {
  const [year, month, day] = key.split('-').map(Number);

  return new Date(year, month - 1, day);
}

function formatDate(dateKey: string) {
  const date = keyToDate(dateKey);

  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function getDaysUntilExam(dateKey: string, todayKey: string) {
  const [year, month, day] = dateKey.split('-').map(Number);
  const [todayYear, todayMonth, todayDay] = todayKey.split('-').map(Number);
  const parsed = new Date(year, month - 1, day);
  if (!year || !month || !day || parsed.getFullYear() !== year || parsed.getMonth() !== month - 1 || parsed.getDate() !== day) return -1;
  return Math.round((Date.UTC(year, month - 1, day) - Date.UTC(todayYear, todayMonth - 1, todayDay)) / 86_400_000);
}

function getDateOnly(date: Date) {
  const year = date.getFullYear();
  const month = String(
    date.getMonth() + 1
  ).padStart(2, '0');
  const day = String(
    date.getDate()
  ).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function formatMinutes(seconds: number) {
  const minutes = Math.round(seconds / 60);

  if (minutes < 1) {
    return '<1 min';
  }

  if (minutes < 60) {
    return `${minutes} min`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  if (remainingMinutes === 0) {
    return `${hours}h`;
  }

  return `${hours}h ${remainingMinutes}m`;
}

function getGreeting() {
  const hour = new Date().getHours();

  if (hour < 12) {
    return 'Good morning';
  }

  if (hour < 18) {
    return 'Good afternoon';
  }

  return 'Good evening';
}

function getActivityMeta(
  activity:
    | 'active_recall'
    | 'quiz'
    | 'review'
    | 'flashcards'
    | 'focus'
) {
  switch (activity) {
    case 'active_recall':
      return {
        title: 'Active Recall',
        description: 'Test what you can remember without notes.',
      };

    case 'quiz':
      return {
        title: 'Quiz',
        description: 'Practice questions and measure your accuracy.',
      };

    case 'review':
      return {
        title: 'Review',
        description: 'Strengthen weak or recently forgotten areas.',
      };

    case 'flashcards':
      return {
        title: 'Flashcards',
        description: 'Reinforce key facts with spaced repetition.',
      };

    case 'focus':
      return {
        title: 'Focus session',
        description: 'Build a steady study routine and track focused time.',
      };
  }
}

function getSubjectIcon(subject: Subject) {
  if (subject.icon) {
    return subject.icon;
  }

  if (subject.emoji) {
    return subject.emoji;
  }

  const name = subject.name.toLowerCase();

  if (
    name.includes('neuro') ||
    name.includes('brain')
  ) {
    return '🧠';
  }

  if (
    name.includes('pharma') ||
    name.includes('drug')
  ) {
    return '💊';
  }

  if (
    name.includes('cardio') ||
    name.includes('heart')
  ) {
    return '❤️';
  }

  if (
    name.includes('anatom')
  ) {
    return '🫀';
  }

  if (
    name.includes('micro')
  ) {
    return '🦠';
  }

  if (
    name.includes('path')
  ) {
    return '🔬';
  }

  return '📚';
}

export default function HomeScreen() {
  const todayKey = useDayRefresh();
  const { session } = useAuth();
  const displayName = String(session?.user.user_metadata.full_name ?? '').trim();
  const avatarInitial = (displayName || session?.user.email || 'M').slice(0, 1).toUpperCase();
  const [profileAvatarUri, setProfileAvatarUri] = useState<string | null>(null);
  const [subjects, setSubjects] = useState<Subject[]>(
    []
  );

  const [topicsBySubject, setTopicsBySubject] =
    useState<TopicsBySubject>({});

  const [examsBySubject, setExamsBySubject] =
    useState<ExamsBySubject>({});

  const [activities, setActivities] =
    useState<StudyActivity[]>([]);

  const [dailyGoalMinutes, setDailyGoalMinutes] = useState(45);

  const [aiAnalysis, setAiAnalysis] =
    useState<AIStudyAnalysis | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const aiRequestKey = useRef('');

  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      loadHomeData(false);
      if (session?.user.id) {
        void getProfileAvatar(session.user.id, session.user.user_metadata.medexam_avatar_path)
          .then((uri) => { if (active) setProfileAvatarUri(uri); })
          .catch(() => { if (active) setProfileAvatarUri(null); });
      } else {
        setProfileAvatarUri(null);
      }
      return () => { active = false; };
    }, [todayKey, session?.user.id])
  );

  async function loadHomeData(showLoading = true, refreshAI = false) {
    if (showLoading) setLoading(true);

    try {
      const [parsedSubjects, parsedTopics, parsedExams, parsedActivities, preferences] = await Promise.all([
        getSubjects(),
        getTopicsBySubject(),
        getExamsBySubject(),
        getStudyActivity(),
        getStudyPreferences(),
      ]);

      setSubjects(parsedSubjects);
      setTopicsBySubject(parsedTopics);
      setExamsBySubject(parsedExams);
      setActivities(parsedActivities);
      setDailyGoalMinutes(preferences.dailyGoalMinutes);
      const planKey = JSON.stringify({ userId: session?.user.id, todayKey, parsedSubjects, parsedTopics, parsedExams, recent: parsedActivities.slice(-20), preferences });
      if (parsedSubjects.length && Object.values(parsedTopics).some((items) => items.length) &&
        preferences.autoGeneratePlan && (refreshAI || planKey !== aiRequestKey.current)) {
        aiRequestKey.current = planKey;
        setAiAnalysis(null);
        setAiLoading(true);
        const subjectsForAI = parsedSubjects.map((subject) => {
          const subjectId = String(subject.id);
          const exam = parsedExams[subjectId];
          return {
            id: subjectId,
            name: subject.name,
            exam: exam ? { date: exam.date, daysUntil: getDaysUntilExam(exam.date, todayKey) } : null,
            topics: (parsedTopics[subjectId] ?? []).map((topic) => {
              const topicActivities = parsedActivities.filter((item) => String(item.topicId) === String(topic.id));
              const quizzes = topicActivities.filter((item) => item.activity === 'quiz');
              const quizTotal = quizzes.reduce((sum, item) => sum + (item.questionCount || 0), 0);
              const correct = quizzes.reduce((sum, item) => sum + (item.correctCount || 0), 0);
              return {
                id: String(topic.id), name: topic.name, studySessions: topicActivities.length,
                quizAccuracy: quizTotal ? Math.round(correct / quizTotal * 100) : null,
                confidence: [...topicActivities].reverse().find((item) => item.confidence)?.confidence ?? null,
                lastStudiedAt: topicActivities.at(-1)?.completedAt ?? null,
              };
            }),
          };
        });
        const recentActivity = parsedActivities.slice(-20).map(({ topicName, activity, completedAt, questionCount, score }) => ({ topicName, activity, completedAt, questionCount, score }));
        const preferredActivities = preferences.preferredMethods.filter((method) =>
          (method !== 'quiz' || preferences.includeQuizzes) &&
          (method !== 'flashcards' || preferences.includeFlashcards) &&
          (method !== 'review' || preferences.includeReviewSessions)
        );
        void getAIStudyAnalysis({
          subjects: subjectsForAI,
          recentActivity,
          dailyGoalMinutes: preferences.dailyGoalMinutes,
          preferredMethods: preferredActivities.length ? preferredActivities : preferences.preferredMethods,
          studyDays: preferences.studyDays,
          preferredStudyTime: preferences.preferredStudyTime,
          sessionLengthMinutes: preferences.sessionLengthMinutes,
          breakDurationMinutes: preferences.breakDurationMinutes,
          prioritizeWeakTopics: preferences.prioritizeWeakTopics,
          prioritizeUpcomingExams: preferences.prioritizeUpcomingExams,
          includeReviewSessions: preferences.includeReviewSessions,
          includeFlashcards: preferences.includeFlashcards,
          includeQuizzes: preferences.includeQuizzes,
          date: todayKey,
        })
          .then((suggestion) => {
            const subject = parsedSubjects.find((item) => String(item.id) === String(suggestion.subjectId));
            const topic = (parsedTopics[String(suggestion.subjectId)] ?? []).find((item) => String(item.id) === String(suggestion.topicId));
            if (subject && topic && subject.name === suggestion.subjectName && topic.name === suggestion.topicName) setAiAnalysis(suggestion);
            else setAiAnalysis(null);
          })
          .catch((error) => { console.warn('AI plan unavailable; using the local study plan:', error); setAiAnalysis(null); })
          .finally(() => setAiLoading(false));
      } else if (!parsedSubjects.length || !Object.values(parsedTopics).some((items) => items.length)) {
        setAiAnalysis(null);
      }
    } catch (error) {
      console.log(
        'Could not load Home data:',
        error
      );
    } finally {
      setLoading(false);
    }
  }

  /*
   * ----------------------------------------
   * ALL TOPICS
   * ----------------------------------------
   */

  const allTopics = subjects.flatMap(
    (subject) => {
      const subjectId = String(
        subject.id
      );

      return (
        topicsBySubject[subjectId] ?? []
      );
    }
  );

  const totalTopics = allTopics.length;

  /*
   * ----------------------------------------
   * UNIQUE STUDIED TOPICS
   * ----------------------------------------
   */

  const studiedTopicIds = new Set(
    activities
      .map((activity) =>
        String(activity.topicId)
      )
      .filter(Boolean)
  );

  const studiedTopicsCount =
    allTopics.filter((topic) =>
      studiedTopicIds.has(
        String(topic.id)
      )
    ).length;

  /*
   * Overall progress is based on topic
   * coverage rather than a fake hardcoded
   * percentage.
   */

  const overallProgress =
    totalTopics > 0
      ? Math.min(
          100,
          Math.round(
            (studiedTopicsCount /
              totalTopics) *
              100
          )
        )
      : 0;

  /*
   * ----------------------------------------
   * NEXT EXAM
   * ----------------------------------------
   */

  type UpcomingExam = {
    subject: Subject;
    exam: Exam;
    daysUntilExam: number;
  };

  const upcomingExams: UpcomingExam[] =
    subjects
      .map(
        (
          subject
        ): UpcomingExam | null => {
          const subjectId = String(
            subject.id
          );

          const exam =
            examsBySubject[subjectId];

          if (!exam) {
            return null;
          }

          const daysUntilExam =
            getDaysUntilExam(exam.date, todayKey);

          if (daysUntilExam < 0) {
            return null;
          }

          return {
            subject,
            exam,
            daysUntilExam,
          };
        }
      )
      .filter(
        (
          exam
        ): exam is UpcomingExam =>
          exam !== null
      )
      .sort(
        (a, b) =>
          a.daysUntilExam -
          b.daysUntilExam
      );

  const nextExam: UpcomingExam | null =
    upcomingExams[0] ?? null;

  /*
   * ----------------------------------------
   * ACTIVITY STATS
   * ----------------------------------------
   */

  const todayActivities =
    activities.filter((activity) => {
      const activityDate =
        new Date(
          activity.completedAt
        );

      return (
        getDateOnly(
          activityDate
        ) === todayKey
      );
    });

  const todayStudySeconds =
    todayActivities.reduce(
      (total, activity) =>
        total +
        (activity.durationSeconds ||
          0),
      0
    );

  const todayQuestions =
    todayActivities.reduce(
      (total, activity) =>
        total +
        (activity.questionCount ||
          0),
      0
    );

  const todayStudyMinutes = Math.floor(todayStudySeconds / 60);
  const todayGoalProgress = Math.min(
    100,
    Math.round((todayStudySeconds / (dailyGoalMinutes * 60)) * 100)
  );

  const weekStart = new Date();

  weekStart.setHours(
    0,
    0,
    0,
    0
  );

  weekStart.setDate(
    weekStart.getDate() - 6
  );

  const weekActivities =
    activities.filter(
      (activity) =>
        new Date(
          activity.completedAt
        ) >= weekStart
    );

  const weekStudySeconds =
    weekActivities.reduce(
      (total, activity) =>
        total +
        (activity.durationSeconds ||
          0),
      0
    );

  /*
   * ----------------------------------------
   * QUIZ ACCURACY
   * ----------------------------------------
   */

  const quizActivities =
    activities.filter(
      (activity) =>
        activity.activity ===
        'quiz'
    );

  const totalQuizQuestions =
    quizActivities.reduce(
      (total, activity) =>
        total +
        (activity.questionCount ||
          0),
      0
    );

  const totalCorrect =
    quizActivities.reduce(
      (total, activity) =>
        total +
        (activity.correctCount ||
          0),
      0
    );

  const quizAccuracy =
    totalQuizQuestions > 0
      ? Math.round(
          (totalCorrect /
            totalQuizQuestions) *
            100
        )
      : null;

  /*
   * ----------------------------------------
   * STUDY STREAK
   * ----------------------------------------
   */

  const activityDates =
    new Set(
      activities.map(
        (activity) =>
          getDateOnly(
            new Date(
              activity.completedAt
            )
          )
      )
    );

  let streak = 0;
  const streakDate =
    new Date();

  streakDate.setHours(
    0,
    0,
    0,
    0
  );

  while (
    activityDates.has(
      getDateOnly(streakDate)
    )
  ) {
    streak += 1;

    streakDate.setDate(
      streakDate.getDate() - 1
    );
  }

  /*
   * ----------------------------------------
   * TOPIC STATS
   * ----------------------------------------
   */

  function getTopicStats(
    topicId: number
  ) {
    const topicActivities =
      activities.filter(
        (activity) =>
          String(
            activity.topicId
          ) ===
          String(topicId)
      );

    const quiz =
      topicActivities.filter(
        (activity) =>
          activity.activity ===
          'quiz'
      );

    const hardCount =
      topicActivities.reduce(
        (total, activity) =>
          total +
          (activity.hardCount ||
            0),
        0
      );

    const quizQuestions =
      quiz.reduce(
        (total, activity) =>
          total +
          (activity.questionCount ||
            0),
        0
      );

    const correct =
      quiz.reduce(
        (total, activity) =>
          total +
          (activity.correctCount ||
            0),
        0
      );

    const accuracy =
      quizQuestions > 0
        ? Math.round(
            (correct /
              quizQuestions) *
              100
          )
        : null;

    let lastStudiedAt: string | null =
      null;

    topicActivities.forEach(
      (activity) => {
        if (
          !lastStudiedAt ||
          new Date(
            activity.completedAt
          ) >
            new Date(
              lastStudiedAt
            )
        ) {
          lastStudiedAt =
            activity.completedAt;
        }
      }
    );

    return {
      accuracy,
      hardCount,
      lastStudiedAt,
      activityCount:
        topicActivities.length,
      quizQuestionCount: quizQuestions,
    };
  }

  // This is a transparent study signal, not a claim that a topic is mastered.
  const strongQuizTopicsCount = allTopics.filter((topic) => {
    const stats = getTopicStats(topic.id);
    return stats.quizQuestionCount >= 5 && (stats.accuracy ?? 0) >= 80;
  }).length;

  /*
   * ----------------------------------------
   * TODAY'S FOCUS
   * ----------------------------------------
   *
   * Today's Focus is powered by the central
   * Study Engine. This keeps Home consistent
   * with Global Progress, Study Plan and the
   * future AI layer.
   */

  const preparationAnalysis =
    calculatePreparationAnalysis(
      subjects,
      topicsBySubject,
      examsBySubject,
      activities
    );

  const deterministicRecommendation =
    preparationAnalysis.recommendations[0] ??
    null;

  // AI is the primary recommendation when it returns a valid topic.
  // The Study Engine remains the automatic fallback.
  const todayRecommendation =
    aiAnalysis
      ? {
          topicId: String(
            aiAnalysis.topicId
          ),
          topicName: aiAnalysis.topicName,
          subjectId: String(
            aiAnalysis.subjectId
          ),
          subjectName: aiAnalysis.subjectName,
          priority: aiAnalysis.priority,
          reason: aiAnalysis.reason,
          recommendedActivities:
            aiAnalysis.recommendedActivities,
          estimatedMinutes:
            aiAnalysis.estimatedMinutes,
        }
      : deterministicRecommendation;

  const focusSubject = todayRecommendation
    ? subjects.find(
        (subject) =>
          String(subject.id) ===
          String(todayRecommendation.subjectId)
      ) ?? null
    : null;

  const focusTopic = focusSubject
    ? (
        topicsBySubject[
          String(focusSubject.id)
        ] ?? []
      ).find(
        (topic) =>
          String(topic.id) ===
          String(todayRecommendation?.topicId)
      ) ?? null
    : null;

  const todayFocus =
    todayRecommendation &&
    focusSubject &&
    focusTopic
      ? {
          subject: focusSubject,
          topic: focusTopic,
          recommendation:
            todayRecommendation,
        }
      : null;

  /*
   * ----------------------------------------
   * SUBJECT PROGRESS
   * ----------------------------------------
   */

  const subjectCards = subjects
    .map((subject) => {
      const subjectId = String(
        subject.id
      );

      const subjectTopics =
        topicsBySubject[
          subjectId
        ] ?? [];

      const studiedCount =
        subjectTopics.filter(
          (topic) =>
            studiedTopicIds.has(
              String(topic.id)
            )
        ).length;

      const percentage =
        subjectTopics.length > 0
          ? Math.round(
              (studiedCount /
                subjectTopics.length) *
                100
            )
          : 0;

      return {
        subject,
        topics:
          subjectTopics,
        studiedCount,
        percentage,
      };
    })
    .sort(
      (a, b) =>
        a.percentage -
        b.percentage
    );

  /*
   * ----------------------------------------
   * NAVIGATION
   * ----------------------------------------
   */

  function openSubject(
    subject: Subject
  ) {
    router.push({
      pathname:
        '/subject/[id]',
      params: {
        id: String(
          subject.id
        ),
        name: subject.name,
      },
    });
  }

  function openTopic(
    subject: Subject,
    topic: Topic
  ) {
    router.push({
      pathname:
        '/subject/topic/[id]',
      params: {
        id: String(
          topic.id
        ),
        name: topic.name,
        subjectId: String(
          subject.id
        ),
      },
    });
  }

  function openExam(
    subject: Subject
  ) {
    router.push({
      pathname:
        '/subject/exam',
      params: {
        id: String(
          subject.id
        ),
        name: subject.name,
      },
    });
  }

  /*
   * ----------------------------------------
   * LOADING
   * ----------------------------------------
   */

  if (loading) {
    return (
      <SafeAreaView
        style={styles.container}
      >
        <View
          style={
            styles.loadingContainer
          }
        >
          <ActivityIndicator
            size="large"
            color={appColor('#75C9ED', 'text')}
          />

          <Text
            style={
              styles.loadingText
            }
          >
            Loading your dashboard...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={styles.container}
    >
      <PullToRefreshScrollView
        onRefresh={() => loadHomeData(false)}
        showsVerticalScrollIndicator={
          false
        }
        contentContainerStyle={
          styles.content
        }
      >
        {/* -------------------------------- */}
        {/* HEADER */}
        {/* -------------------------------- */}

        <View
          style={styles.header}
        >
          <View>
            <Text
              style={styles.greeting}
            >
              {getGreeting()}{displayName ? `, ${displayName}` : ''} 👋
            </Text>

            <Text
              style={styles.title}
            >
              MedExam
            </Text>

            <Text
              style={styles.headerSubtitle}
            >
              Your personal exam dashboard
            </Text>
          </View>

          <Pressable
            style={({ pressed }) => [
              styles.profileCircle,
              pressed &&
                styles.pressed,
            ]}
            onPress={() =>
              router.push(
                '/profile' as never
              )
            }
          >
            {profileAvatarUri
              ? <Image source={{ uri: profileAvatarUri }} contentFit="cover" style={styles.profileImage} />
              : <Text style={styles.profileText}>{avatarInitial}</Text>}
          </Pressable>
        </View>

        {/* -------------------------------- */}
        {/* NEXT EXAM */}
        {/* -------------------------------- */}

        {nextExam ? (
          <Pressable
            style={({ pressed }) => [
              styles.examCard,
              pressed &&
                styles.pressed,
            ]}
            onPress={() =>
              openExam(
                nextExam.subject
              )
            }
          >
            <View
              style={
                styles.examMain
              }
            >
              <View
                style={
                  styles.examIconBox
                }
              >
                <Text
                  style={
                    styles.examIcon
                  }
                >
                  📅
                </Text>
              </View>

              <View
                style={
                  styles.examContent
                }
              >
                <Text
                  style={
                    styles.examLabel
                  }
                >
                  NEXT EXAM
                </Text>

                <Text
                  style={
                    styles.examName
                  }
                  numberOfLines={1}
                >
                  {nextExam.subject.name}
                </Text>

                <Text
                  style={
                    styles.examDate
                  }
                >
                  {formatDate(
                    nextExam.exam.date
                  )}
                </Text>

                <Text
                  style={
                    styles.examType
                  }
                >
                  {nextExam.exam.type}
                </Text>
              </View>
            </View>

            <View
              style={
                styles.daysContainer
              }
            >
              <Text
                style={
                  styles.days
                }
              >
                {nextExam.daysUntilExam}
              </Text>

              <Text
                style={
                  styles.daysLabel
                }
              >
                {nextExam.daysUntilExam ===
                1
                  ? 'day'
                  : 'days'}
              </Text>
            </View>
          </Pressable>
        ) : (
          <Pressable
            style={({ pressed }) => [
              styles.noExamCard,
              pressed &&
                styles.pressed,
            ]}
            onPress={() =>
              router.push(
                '/subjects'
              )
            }
          >
            <View
              style={
                styles.noExamIconBox
              }
            >
              <Text
                style={
                  styles.noExamIcon
                }
              >
                📅
              </Text>
            </View>

            <View
              style={
                styles.noExamContent
              }
            >
              <Text
                style={
                  styles.noExamTitle
                }
              >
                No upcoming exam
              </Text>

              <Text
                style={
                  styles.noExamText
                }
              >
                Add an exam to start planning
                your preparation.
              </Text>
            </View>

            <Text
              style={
                styles.cardArrow
              }
            >
              ›
            </Text>
          </Pressable>
        )}

        {/* -------------------------------- */}
        {/* PROGRESS */}
        {/* -------------------------------- */}

        <Pressable
          style={({ pressed }) => [
            styles.progressCard,
            pressed &&
              styles.pressed,
          ]}
          onPress={() =>
            router.push(
              '/progress'
            )
          }
        >
          <View
            style={
              styles.progressHeader
            }
          >
            <View>
              <Text
                style={
                  styles.progressEyebrow
                }
              >
                TOPICS STARTED
              </Text>

              <Text
                style={
                  styles.sectionTitle
                }
              >
                Preparation progress
              </Text>
            </View>

            <Text
              style={
                styles.progressPercentage
              }
            >
              {overallProgress}%
            </Text>
          </View>

          <View
            style={
              styles.progressBackground
            }
          >
            <View
              style={[
                styles.progress,
                {
                  width: `${overallProgress}%`,
                },
              ]}
            />
          </View>

          <View
            style={
              styles.progressBottom
            }
          >
            <View style={styles.progressCopyBlock}>
              <Text style={styles.progressText}>
                {studiedTopicsCount} of {totalTopics} topics started
              </Text>
              <Text style={styles.progressEvidence}>
                {strongQuizTopicsCount} with strong quiz results · {Math.max(0, totalTopics - studiedTopicsCount)} not started
              </Text>
            </View>

            <Text
              style={
                styles.progressLink
              }
            >
              View progress →
            </Text>
          </View>
        </Pressable>

        {/* -------------------------------- */}
        {/* TODAY'S PLAN */}
        {/* -------------------------------- */}

        <View
          style={
            styles.sectionHeader
          }
        >
          <View>
            <Text
              style={
                styles.sectionEyebrow
              }
            >
              TODAY'S PLAN
            </Text>

            <Text
              style={
                styles.sectionTitle
              }
            >
              Today's focus
            </Text>
          </View>

          <Pressable accessibilityRole="button" disabled={aiLoading} onPress={() => { void loadHomeData(false, true); }} style={styles.aiRefresh}>
            {aiLoading ? <ActivityIndicator size="small" color={appColor('#327E9D', 'text')} /> : null}
            <Text style={styles.sectionHint}>{aiLoading ? 'Planning…' : aiAnalysis ? 'AI plan · Refresh' : 'AI plan'}</Text>
          </Pressable>
        </View>

        {todayFocus ? (
          <>
          <Pressable
            style={({ pressed }) => [
              styles.focusCard,
              pressed &&
                styles.pressed,
            ]}
            onPress={() =>
              openTopic(
                todayFocus.subject,
                todayFocus.topic
              )
            }
          >
            <View
              style={
                styles.focusTop
              }
            >
              <View
                style={
                  styles.focusIconBox
                }
              >
                <Text
                  style={
                    styles.focusIcon
                  }
                >
                  🎯
                </Text>
              </View>

              <View
                style={
                  styles.focusHeading
                }
              >
                <Text
                  style={
                    styles.focusLabel
                  }
                >
                  RECOMMENDED TOPIC
                </Text>

                <Text
                  style={
                    styles.focusTopic
                  }
                  numberOfLines={1}
                >
                  {todayFocus.topic.name}
                </Text>

                <Text
                  style={
                    styles.focusSubject
                  }
                >
                  {todayFocus.subject.name}
                </Text>
              </View>

              <Text
                style={
                  styles.focusArrow
                }
              >
                ›
              </Text>
            </View>

            <View
              style={
                styles.focusMetaRow
              }
            >
              <View
                style={[
                  styles.priorityBadge,
                  todayFocus
                    .recommendation
                    .priority ===
                    'high'
                    ? styles.priorityHigh
                    : todayFocus
                        .recommendation
                        .priority ===
                      'medium'
                    ? styles.priorityMedium
                    : styles.priorityLow,
                ]}
              >
                <Text
                  style={
                    styles.priorityBadgeText
                  }
                >
                  {todayFocus
                    .recommendation
                    .priority
                    .toUpperCase()}{' '}
                  PRIORITY
                </Text>
              </View>

              <Text
                style={
                  styles.focusReason
                }
                numberOfLines={2}
              >
                {todayFocus
                  .recommendation
                  .reason}
              </Text>
            </View>

            <View
              style={
                styles.planSteps
              }
            >
              {todayFocus.recommendation
                .recommendedActivities
                .map(
                  (
                    activity,
                    index
                  ) => {
                    const meta =
                      getActivityMeta(
                        activity
                      );

                    return (
                      <View
                        key={`${activity}-${index}`}
                      >
                        <View
                          style={
                            styles.planStep
                          }
                        >
                          <View
                            style={
                              styles.stepNumber
                            }
                          >
                            <Text
                              style={
                                styles.stepNumberText
                              }
                            >
                              {index + 1}
                            </Text>
                          </View>

                          <View
                            style={
                              styles.stepContent
                            }
                          >
                            <Text
                              style={
                                styles.stepTitle
                              }
                            >
                              {meta.title}
                            </Text>

                            <Text
                              style={
                                styles.stepText
                              }
                              numberOfLines={2}
                            >
                              {meta.description}
                            </Text>
                          </View>
                        </View>

                        {index <
                          todayFocus
                            .recommendation
                            .recommendedActivities
                            .length -
                            1 && (
                          <View
                            style={
                              styles.stepDivider
                            }
                          />
                        )}
                      </View>
                    );
                  }
                )}
            </View>

            <View
              style={
                styles.focusFooter
              }
            >
              <View
                style={
                  styles.focusTime
                }
              >
                <Text
                  style={
                    styles.focusTimeIcon
                  }
                >
                  ⏱️
                </Text>

                <Text
                  style={
                    styles.focusTimeText
                  }
                >
                  About{' '}
                  {
                    todayFocus
                      .recommendation
                      .estimatedMinutes
                  }{' '}
                  min
                </Text>
              </View>

              <View
                style={
                  styles.startPill
                }
              >
                <Text
                  style={
                    styles.startPillText
                  }
                >
                  Start →
                </Text>
              </View>
            </View>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            style={({ pressed }) => [styles.focusStartButton, pressed && styles.pressed]}
            onPress={() => router.push({ pathname: '/focus', params: {
              id: String(todayFocus.topic.id), name: todayFocus.topic.name,
              subjectId: String(todayFocus.subject.id), subjectName: todayFocus.subject.name,
            } } as unknown as Href)}
          >
            <Text style={styles.focusStartButtonText}>Start a focus session · 25 min</Text>
          </Pressable>
          </>
        ) : (
          <View
            style={
              styles.emptyFocusCard
            }
          >
            <Text
              style={
                styles.emptyFocusIcon
              }
            >
              🎯
            </Text>

            <View
              style={
                styles.emptyFocusContent
              }
            >
              <Text
                style={
                  styles.emptyFocusTitle
                }
              >
                Your study plan starts here
              </Text>

              <Text
                style={
                  styles.emptyFocusText
                }
              >
                Add subjects and topics to get
                a personalized daily focus.
              </Text>
            </View>
          </View>
        )}

        <View style={styles.todaySummary}>
          <View style={styles.goalHeader}>
            <View style={styles.goalTextBlock}>
              <Text style={styles.summaryEyebrow}>TODAY'S STUDY GOAL</Text>
              <Text style={styles.summaryTitle}>{todayStudyMinutes} / {dailyGoalMinutes} min</Text>
              <Text style={styles.summaryText}>
                {todayGoalProgress >= 100
                  ? 'Daily goal reached. A short review is always optional.'
                  : `${Math.max(0, dailyGoalMinutes - todayStudyMinutes)} min left in your daily goal.`}
              </Text>
            </View>
            <Pressable accessibilityRole="button" onPress={() => router.push('/profile' as never)} style={styles.goalEditButton}>
              <Text style={styles.goalEditText}>Edit goal</Text>
            </Pressable>
          </View>
          <View accessibilityLabel={`Daily goal ${todayGoalProgress}% complete`} style={styles.goalProgressBackground}>
            <View style={[styles.goalProgressFill, { width: `${todayGoalProgress}%` }]} />
          </View>
        </View>

        {/* -------------------------------- */}
        {/* QUICK STATS */}
        {/* -------------------------------- */}

        <View
          style={
            styles.sectionHeaderStats
          }
        >
          <Text
            style={
              styles.sectionTitle
            }
          >
            Your activity
          </Text>

          <Text
            style={
              styles.sectionHint
            }
          >
            Last 7 days
          </Text>
        </View>

        <View
          style={
            styles.statsGrid
          }
        >
          <Pressable
            style={({ pressed }) => [
              styles.statCard,
              pressed &&
                styles.pressed,
            ]}
            onPress={() =>
              router.push(
                '/progress'
              )
            }
          >
            <View
              style={
                styles.statIconBox
              }
            >
              <Text
                style={
                  styles.statIcon
                }
              >
                ⏱️
              </Text>
            </View>

            <Text
              style={
                styles.statValue
              }
            >
              {formatMinutes(
                weekStudySeconds
              )}
            </Text>

            <Text
              style={
                styles.statLabel
              }
            >
              study time
            </Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [
              styles.statCard,
              pressed &&
                styles.pressed,
            ]}
            onPress={() =>
              router.push(
                '/progress'
              )
            }
          >
            <View
              style={
                styles.statIconBox
              }
            >
              <Text
                style={
                  styles.statIcon
                }
              >
                📝
              </Text>
            </View>

            <Text
              style={
                styles.statValue
              }
            >
              {todayQuestions}
            </Text>

            <Text
              style={
                styles.statLabel
              }
            >
              questions today
            </Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [
              styles.statCard,
              pressed &&
                styles.pressed,
            ]}
            onPress={() =>
              router.push(
                '/progress'
              )
            }
          >
            <View
              style={
                styles.statIconBox
              }
            >
              <Text
                style={
                  styles.statIcon
                }
              >
                🎯
              </Text>
            </View>

            <Text
              style={
                styles.statValue
              }
            >
              {quizAccuracy !== null
                ? `${quizAccuracy}%`
                : '—'}
            </Text>

            <Text
              style={
                styles.statLabel
              }
            >
              quiz accuracy
            </Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [
              styles.statCard,
              pressed &&
                styles.pressed,
            ]}
            onPress={() =>
              router.push(
                '/progress'
              )
            }
          >
            <View
              style={
                styles.statIconBox
              }
            >
              <Text
                style={
                  styles.statIcon
                }
              >
                🔥
              </Text>
            </View>

            <Text
              style={
                styles.statValue
              }
            >
              {streak}
            </Text>

            <Text
              style={
                styles.statLabel
              }
            >
              day streak
            </Text>
          </Pressable>
        </View>

        {/* -------------------------------- */}
        {/* SUBJECTS */}
        {/* -------------------------------- */}

        <View
          style={
            styles.sectionHeader
          }
        >
          <Text
            style={
              styles.sectionTitle
            }
          >
            Your subjects
          </Text>

          <Pressable
            onPress={() =>
              router.push(
                '/subjects'
              )
            }
          >
            <Text
              style={
                styles.seeAll
              }
            >
              See all →
            </Text>
          </Pressable>
        </View>

        {subjectCards.length === 0 ? (
          <Pressable
            style={({ pressed }) => [
              styles.emptySubjectsCard,
              pressed &&
                styles.pressed,
            ]}
            onPress={() =>
              router.push(
                '/subjects'
              )
            }
          >
            <View
              style={
                styles.emptySubjectIconBox
              }
            >
              <Text
                style={
                  styles.emptySubjectIcon
                }
              >
                📚
              </Text>
            </View>

            <View
              style={
                styles.emptySubjectContent
              }
            >
              <Text
                style={
                  styles.emptySubjectTitle
                }
              >
                No subjects yet
              </Text>

              <Text
                style={
                  styles.emptySubjectText
                }
              >
                Add your first subject to start
                building your exam preparation.
              </Text>
            </View>

            <Text
              style={
                styles.cardArrow
              }
            >
              ›
            </Text>
          </Pressable>
        ) : (
          subjectCards
            .slice(0, 4)
            .map(
              ({
                subject,
                topics,
                studiedCount,
                percentage,
              }) => (
                <Pressable
                  key={String(
                    subject.id
                  )}
                  style={({
                    pressed,
                  }) => [
                    styles.subjectCard,
                    pressed &&
                      styles.pressed,
                  ]}
                  onPress={() =>
                    openSubject(
                      subject
                    )
                  }
                >
                  <View
                    style={[
                      styles.subjectIconBox,
                      {
                        backgroundColor:
                          percentage >=
                          70
                            ? '#E7F8F2'
                            : percentage >=
                              40
                            ? '#E3F5FF'
                            : '#EEF1FF',
                      },
                    ]}
                  >
                    <Text
                      style={
                        styles.subjectIcon
                      }
                    >
                      {getSubjectIcon(
                        subject
                      )}
                    </Text>
                  </View>

                  <View
                    style={
                      styles.subjectInfo
                    }
                  >
                    <View
                      style={
                        styles.subjectTitleRow
                      }
                    >
                      <Text
                        style={
                          styles.subjectName
                        }
                        numberOfLines={1}
                      >
                        {subject.name}
                      </Text>

                      <Text
                        style={
                          styles.subjectPercentage
                        }
                      >
                        {percentage}%
                      </Text>
                    </View>

                    <Text
                      style={
                        styles.subjectDetails
                      }
                    >
                      {studiedCount} of {topics.length} topics started
                    </Text>

                    <View
                      style={
                        styles.subjectProgressBackground
                      }
                    >
                      <View
                        style={[
                          styles.subjectProgress,
                          {
                            width: `${percentage}%`,
                          },
                        ]}
                      />
                    </View>
                  </View>

                  <Text
                    style={
                      styles.subjectArrow
                    }
                  >
                    ›
                  </Text>
                </Pressable>
              )
            )
        )}

        <View
          style={
            styles.bottomSpacing
          }
        />
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
    paddingTop: 12,
    paddingBottom: 40,
  },

  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },

  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: appColor('#7A8B99', 'text'),
  },

  pressed: {
    opacity: 0.86,
    transform: [
      {
        scale: 0.985,
      },
    ],
  },

  /* HEADER */

  header: {
    flexDirection: 'row',
    justifyContent:
      'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },

  greeting: {
    fontSize: 15,
    color: appColor('#7A8B99', 'text'),
    marginBottom: 4,
    fontWeight: '500',
  },

  title: {
    fontSize: 32,
    fontWeight: '800',
    color: appColor('#17324D', 'text'),
    letterSpacing: -0.5,
  },

  headerSubtitle: {
    fontSize: 12,
    color: appColor('#91A0AA', 'text'),
    marginTop: 3,
  },

  profileCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: appColor('#C5ECFA', 'background'),
    justifyContent:
      'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: appColor('#A8DFF3', 'border'),
    overflow: 'hidden',
  },

  profileImage: { width: '100%', height: '100%' },

  profileText: {
    fontSize: 17,
    fontWeight: '800',
    color: appColor('#2E789A', 'text'),
  },

  /* EXAM */

  examCard: {
    backgroundColor: appColor('#CDEFFF', 'background'),
    borderRadius: 24,
    padding: 18,
    flexDirection: 'row',
    justifyContent:
      'space-between',
    alignItems: 'center',
    marginBottom: 14,
    borderWidth: 1,
    borderColor: appColor('#BDE8F8', 'border'),
  },

  examMain: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 12,
  },

  examIconBox: {
    width: 48,
    height: 48,
    borderRadius: 15,
    backgroundColor: appColor('#E9F9FF', 'background'),
    justifyContent:
      'center',
    alignItems: 'center',
  },

  examIcon: {
    fontSize: 22,
  },

  examContent: {
    flex: 1,
    marginLeft: 12,
  },

  examLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.3,
    color: appColor('#4C829F', 'text'),
    marginBottom: 4,
  },

  examName: {
    fontSize: 19,
    fontWeight: '800',
    color: appColor('#173B55', 'text'),
  },

  examDate: {
    fontSize: 12,
    color: appColor('#5C8298', 'text'),
    marginTop: 3,
  },

  examType: {
    fontSize: 11,
    color: appColor('#6F8FA0', 'text'),
    marginTop: 2,
  },

  daysContainer: {
    minWidth: 66,
    alignItems: 'center',
    backgroundColor: appColor('#FFFFFF', 'background'),
    borderRadius: 18,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },

  days: {
    fontSize: 27,
    fontWeight: '800',
    color: appColor('#3C9AC5', 'text'),
  },

  daysLabel: {
    fontSize: 10,
    color: appColor('#718898', 'text'),
    marginTop: -2,
  },

  noExamCard: {
    backgroundColor: appColor('#FFFFFF', 'background'),
    borderRadius: 22,
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
    borderWidth: 1,
    borderColor: appColor('#E6F0F5', 'border'),
  },

  noExamIconBox: {
    width: 48,
    height: 48,
    borderRadius: 15,
    backgroundColor: appColor('#EAF7FD', 'background'),
    justifyContent:
      'center',
    alignItems: 'center',
  },

  noExamIcon: {
    fontSize: 22,
  },

  noExamContent: {
    flex: 1,
    marginLeft: 13,
  },

  noExamTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: appColor('#17324D', 'text'),
  },

  noExamText: {
    fontSize: 12,
    color: appColor('#7A8B99', 'text'),
    marginTop: 4,
    lineHeight: 17,
  },

  cardArrow: {
    fontSize: 28,
    color: appColor('#65B8DB', 'text'),
    marginLeft: 8,
  },

  /* PROGRESS */

  progressCard: {
    backgroundColor: appColor('#FFFFFF', 'background'),
    borderRadius: 22,
    padding: 20,
    marginBottom: 27,
    borderWidth: 1,
    borderColor: appColor('#EDF4F8', 'border'),
  },

  progressHeader: {
    flexDirection: 'row',
    justifyContent:
      'space-between',
    alignItems: 'flex-end',
  },

  progressEyebrow: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.2,
    color: appColor('#79A9BF', 'text'),
    marginBottom: 4,
  },

  sectionTitle: {
    fontSize: 19,
    fontWeight: '800',
    color: appColor('#17324D', 'text'),
  },

  progressPercentage: {
    fontSize: 21,
    fontWeight: '800',
    color: appColor('#43A5D1', 'text'),
  },

  progressBackground: {
    height: 10,
    backgroundColor: appColor('#E7F1F6', 'background'),
    borderRadius: 10,
    marginTop: 15,
    overflow: 'hidden',
  },

  progress: {
    height: '100%',
    backgroundColor: appColor('#79CCE9', 'background'),
    borderRadius: 10,
  },

  progressBottom: {
    flexDirection: 'row',
    justifyContent:
      'space-between',
    alignItems: 'center',
    marginTop: 10,
  },

  progressText: {
    fontSize: 12,
    color: appColor('#7A8B99', 'text'),
  },

  progressCopyBlock: {
    flex: 1,
    paddingRight: 8,
  },

  progressEvidence: {
    fontSize: 10,
    color: appColor('#8A9AA5', 'text'),
    marginTop: 4,
  },

  progressLink: {
    fontSize: 11,
    fontWeight: '700',
    color: appColor('#43A5D1', 'text'),
  },

  /* SECTION HEADERS */

  sectionHeader: {
    flexDirection: 'row',
    justifyContent:
      'space-between',
    alignItems: 'flex-end',
    marginBottom: 13,
  },

  sectionEyebrow: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.2,
    color: appColor('#79A9BF', 'text'),
    marginBottom: 3,
  },

  sectionHint: {
    fontSize: 11,
    fontWeight: '600',
    color: appColor('#8CA2AF', 'text'),
  },

  aiRefresh: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 36, paddingHorizontal: 6 },

  seeAll: {
    fontSize: 12,
    fontWeight: '700',
    color: appColor('#43A5D1', 'text'),
  },

  /* TODAY FOCUS */

  focusCard: {
    backgroundColor: appColor('#FFFFFF', 'background'),
    borderRadius: 23,
    padding: 19,
    marginBottom: 27,
    borderWidth: 1,
    borderColor: appColor('#E6F1F6', 'border'),
  },

  focusStartButton: { minHeight: 50, backgroundColor: appColor('#327E9D', 'background'), borderRadius: 15, alignItems: 'center', justifyContent: 'center', marginTop: -13, marginBottom: 27 },
  focusStartButtonText: { color: appColor('#FFFFFF', 'text'), fontWeight: '800', fontSize: 14 },

  focusTop: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  focusIconBox: {
    width: 51,
    height: 51,
    borderRadius: 16,
    backgroundColor: appColor('#E5F7FE', 'background'),
    justifyContent:
      'center',
    alignItems: 'center',
  },

  focusIcon: {
    fontSize: 24,
  },

  focusHeading: {
    flex: 1,
    marginLeft: 13,
  },

  focusLabel: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1,
    color: appColor('#76A5B9', 'text'),
    marginBottom: 3,
  },

  focusTopic: {
    fontSize: 18,
    fontWeight: '800',
    color: appColor('#17324D', 'text'),
  },

  focusSubject: {
    fontSize: 11,
    color: appColor('#7C919D', 'text'),
    marginTop: 2,
  },

  focusMetaRow: {
    marginTop: 15,
    flexDirection: 'row',
    alignItems: 'center',
  },

  priorityBadge: {
    borderRadius: 10,
    paddingHorizontal: 9,
    paddingVertical: 6,
    marginRight: 9,
  },

  priorityHigh: {
    backgroundColor: appColor('#FFF0F0', 'background'),
  },

  priorityMedium: {
    backgroundColor: appColor('#FFF7E6', 'background'),
  },

  priorityLow: {
    backgroundColor: appColor('#EAF7FD', 'background'),
  },

  priorityBadgeText: {
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.7,
    color: appColor('#4E7386', 'text'),
  },

  focusReason: {
    flex: 1,
    fontSize: 10,
    lineHeight: 14,
    color: appColor('#7A8E9A', 'text'),
  },

  focusArrow: {
    fontSize: 29,
    color: appColor('#65B8DB', 'text'),
    marginLeft: 8,
  },

  planSteps: {
    marginTop: 18,
    paddingHorizontal: 2,
  },

  planStep: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  stepNumber: {
    width: 29,
    height: 29,
    borderRadius: 15,
    backgroundColor: appColor('#EAF7FD', 'background'),
    justifyContent:
      'center',
    alignItems: 'center',
  },

  stepNumberText: {
    fontSize: 12,
    fontWeight: '800',
    color: appColor('#3E99BE', 'text'),
  },

  stepContent: {
    marginLeft: 11,
  },

  stepTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: appColor('#28465C', 'text'),
  },

  stepText: {
    fontSize: 11,
    color: appColor('#8799A4', 'text'),
    marginTop: 2,
  },

  stepDivider: {
    width: 1,
    height: 12,
    backgroundColor: appColor('#DCECF3', 'background'),
    marginLeft: 14,
    marginVertical: 4,
  },

  focusFooter: {
    marginTop: 18,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: '#EDF3F6',
    flexDirection: 'row',
    justifyContent:
      'space-between',
    alignItems: 'center',
  },

  focusTime: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  focusTimeIcon: {
    fontSize: 14,
  },

  focusTimeText: {
    fontSize: 11,
    color: appColor('#7E929E', 'text'),
    marginLeft: 6,
  },

  startPill: {
    backgroundColor: appColor('#75C9ED', 'background'),
    borderRadius: 13,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },

  startPillText: {
    fontSize: 11,
    fontWeight: '800',
    color: appColor('#FFFFFF', 'text'),
  },

  emptyFocusCard: {
    backgroundColor: appColor('#FFFFFF', 'background'),
    borderRadius: 22,
    padding: 19,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 27,
    borderWidth: 1,
    borderColor: appColor('#E6F1F6', 'border'),
  },

  emptyFocusIcon: {
    fontSize: 30,
  },

  emptyFocusContent: {
    flex: 1,
    marginLeft: 13,
  },

  emptyFocusTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: appColor('#17324D', 'text'),
  },

  emptyFocusText: {
    fontSize: 12,
    color: appColor('#7A8B99', 'text'),
    lineHeight: 17,
    marginTop: 4,
  },

  /* STATS */

  sectionHeaderStats: {
    flexDirection: 'row',
    justifyContent:
      'space-between',
    alignItems: 'center',
    marginBottom: 13,
  },

  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent:
      'space-between',
    marginBottom: 27,
  },

  statCard: {
    width: '48.3%',
    backgroundColor: appColor('#FFFFFF', 'background'),
    borderRadius: 19,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: appColor('#EDF4F8', 'border'),
  },

  statIconBox: {
    width: 34,
    height: 34,
    borderRadius: 11,
    backgroundColor: appColor('#EAF7FD', 'background'),
    justifyContent:
      'center',
    alignItems: 'center',
    marginBottom: 10,
  },

  statIcon: {
    fontSize: 17,
  },

  statValue: {
    fontSize: 21,
    fontWeight: '800',
    color: appColor('#17324D', 'text'),
  },

  statLabel: {
    fontSize: 11,
    color: appColor('#82939D', 'text'),
    marginTop: 2,
  },

  /* TODAY SUMMARY */

  todaySummary: {
    backgroundColor: appColor('#EAF7FD', 'background'),
    borderRadius: 22,
    padding: 18,
    flexDirection: 'column',
    marginBottom: 28,
    borderWidth: 1,
    borderColor: appColor('#D8F0F9', 'border'),
  },

  goalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },

  goalTextBlock: {
    flex: 1,
  },

  goalEditButton: {
    minHeight: 40,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: appColor('#FFFFFF', 'background'),
    justifyContent: 'center',
  },

  goalEditText: {
    color: appColor('#327E9D', 'text'),
    fontSize: 12,
    fontWeight: '800',
  },

  goalProgressBackground: {
    height: 8,
    backgroundColor: appColor('#D3EAF2', 'background'),
    borderRadius: 8,
    overflow: 'hidden',
    marginTop: 13,
  },

  goalProgressFill: {
    height: '100%',
    backgroundColor: appColor('#3B9BBB', 'background'),
    borderRadius: 8,
  },

  summaryEyebrow: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.1,
    color: appColor('#5E9AB5', 'text'),
    marginBottom: 4,
  },

  summaryTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: appColor('#173B55', 'text'),
  },

  summaryText: {
    fontSize: 11,
    color: appColor('#668595', 'text'),
    lineHeight: 16,
    marginTop: 5,
    maxWidth: 265,
  },

  summaryBadge: {
    width: 47,
    height: 47,
    borderRadius: 17,
    backgroundColor: appColor('#FFFFFF', 'background'),
    justifyContent:
      'center',
    alignItems: 'center',
    marginLeft: 12,
  },

  summaryBadgeIcon: {
    fontSize: 21,
  },

  /* SUBJECTS */

  subjectCard: {
    backgroundColor: appColor('#FFFFFF', 'background'),
    borderRadius: 19,
    padding: 14,
    marginBottom: 11,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: appColor('#EDF4F8', 'border'),
  },

  subjectIconBox: {
    width: 49,
    height: 49,
    borderRadius: 15,
    justifyContent:
      'center',
    alignItems: 'center',
  },

  subjectIcon: {
    fontSize: 22,
  },

  subjectInfo: {
    flex: 1,
    marginLeft: 12,
  },

  subjectTitleRow: {
    flexDirection: 'row',
    justifyContent:
      'space-between',
    alignItems: 'center',
  },

  subjectName: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: appColor('#17324D', 'text'),
    marginRight: 8,
  },

  subjectPercentage: {
    fontSize: 14,
    fontWeight: '800',
    color: appColor('#43A5D1', 'text'),
  },

  subjectDetails: {
    fontSize: 11,
    color: appColor('#8596A0', 'text'),
    marginTop: 3,
  },

  subjectProgressBackground: {
    height: 5,
    backgroundColor: appColor('#EAF1F5', 'background'),
    borderRadius: 5,
    marginTop: 8,
    overflow: 'hidden',
  },

  subjectProgress: {
    height: '100%',
    backgroundColor: appColor('#80CCE9', 'background'),
    borderRadius: 5,
  },

  subjectArrow: {
    fontSize: 27,
    color: appColor('#6ABBDD', 'text'),
    marginLeft: 7,
  },

  emptySubjectsCard: {
    backgroundColor: appColor('#FFFFFF', 'background'),
    borderRadius: 21,
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 27,
    borderWidth: 1,
    borderColor: appColor('#E7F1F6', 'border'),
  },

  emptySubjectIconBox: {
    width: 49,
    height: 49,
    borderRadius: 15,
    backgroundColor: appColor('#EAF7FD', 'background'),
    justifyContent:
      'center',
    alignItems: 'center',
  },

  emptySubjectIcon: {
    fontSize: 23,
  },

  emptySubjectContent: {
    flex: 1,
    marginLeft: 12,
  },

  emptySubjectTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: appColor('#17324D', 'text'),
  },

  emptySubjectText: {
    fontSize: 11,
    color: appColor('#7A8B99', 'text'),
    lineHeight: 16,
    marginTop: 4,
  },

  bottomSpacing: {
    height: 20,
  },
});
