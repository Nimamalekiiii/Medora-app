import { LocalizedText as Text } from '@/components/localized-text';
import { StudyIcon } from '@/components/study-icon';
import { appColor } from '@/constants/adaptive-color';
import { Stack, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useDayRefresh } from '../../hooks/use-day-refresh';
import type { Exam, StudyPlanSettings, Topic } from '../../types/study';
import {
  getExamForSubject,
  getStudyPlanForSubject,
  getStudyPreferences,
  getTopicsForSubject,
  saveStudyPlanForSubject,
} from '../../services/storage';
import PullToRefreshScrollView from '../../components/pull-to-refresh-scroll-view';

const DEFAULT_STUDY_PLAN: StudyPlanSettings = {
  studyDays: [1, 2, 3, 4, 5, 6],
  dailyStudyMinutes: 120,
};

const DAY_OPTIONS = [
  { label: 'Mon', value: 1 },
  { label: 'Tue', value: 2 },
  { label: 'Wed', value: 3 },
  { label: 'Thu', value: 4 },
  { label: 'Fri', value: 5 },
  { label: 'Sat', value: 6 },
  { label: 'Sun', value: 0 },
];

const STUDY_TIME_OPTIONS = [30, 60, 90, 120, 180];

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

function getTopicForDate(
  topics: Topic[],
  date: Date,
  studyDays: number[]
) {
  if (topics.length === 0) {
    return null;
  }

  const mondayIndex = date.getDay() === 0 ? 6 : date.getDay() - 1;
  const orderedStudyDays = DAY_OPTIONS
    .filter((day) => studyDays.includes(day.value))
    .map((day) => (day.value === 0 ? 6 : day.value - 1));
  const sessionInWeek = orderedStudyDays.indexOf(mondayIndex);

  if (sessionInWeek < 0 || orderedStudyDays.length === 0) {
    return null;
  }

  const dayNumber = Math.floor(
    (Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) -
      Date.UTC(1970, 0, 5)) /
      (1000 * 60 * 60 * 24)
  );
  const completedWeeks = Math.floor(dayNumber / 7);
  const sessionNumber = completedWeeks * orderedStudyDays.length + sessionInWeek;
  const index = ((sessionNumber % topics.length) + topics.length) % topics.length;

  return topics[index];
}

function getNextStudyDate(studyDays: number[]) {
  const today = new Date();
  today.setHours(12, 0, 0, 0);

  for (let offset = 1; offset <= 7; offset += 1) {
    const candidate = new Date(today);
    candidate.setDate(today.getDate() + offset);

    if (studyDays.includes(candidate.getDay())) {
      return candidate;
    }
  }

  return null;
}

function formatDuration(minutes: number) {
  if (minutes < 60) {
    return `${minutes} min`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  return remainingMinutes === 0
    ? `${hours} hr`
    : `${hours} hr ${remainingMinutes} min`;
}

export default function StudyPlanScreen() {
  const todayKey = useDayRefresh();
  const { id, name } = useLocalSearchParams();

  const subjectId =
    Array.isArray(id) ? id[0] : id;

  const subjectName =
    Array.isArray(name) ? name[0] : name;

  const [topics, setTopics] = useState<Topic[]>([]);
  const [exam, setExam] = useState<Exam | null>(null);
  const [studyPlan, setStudyPlan] = useState<StudyPlanSettings>(
    DEFAULT_STUDY_PLAN
  );
  const [draftStudyPlan, setDraftStudyPlan] =
    useState<StudyPlanSettings>(DEFAULT_STUDY_PLAN);
  const [loading, setLoading] = useState(true);
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);

  async function loadData(isCurrent: () => boolean = () => true, showLoading = true) {
    if (showLoading) setLoading(true);
    try {
      const [subjectTopics, subjectExam, savedStudyPlan, preferences] = await Promise.all([
        getTopicsForSubject(subjectId ?? ''),
        getExamForSubject(subjectId ?? ''),
        subjectId ? getStudyPlanForSubject(subjectId) : Promise.resolve(null),
        getStudyPreferences(),
      ]);
      if (!isCurrent()) return;
      setTopics(subjectTopics);
      setExam(subjectExam);
      const defaultStudyDays = preferences.includeWeekends
        ? [...preferences.studyDays, 0, 6]
        : preferences.studyDays.filter((day) => day !== 0 && day !== 6);
      const nextDefault = {
        studyDays: defaultStudyDays.length ? [...new Set(defaultStudyDays)] : DEFAULT_STUDY_PLAN.studyDays,
        dailyStudyMinutes: preferences.dailyGoalMinutes,
      };
      setStudyPlan(savedStudyPlan ?? nextDefault);
    } catch (error) {
      console.log('Could not load study plan data:', error);
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }

  useFocusEffect(useCallback(() => {
    let isCurrent = true;
    void loadData(() => isCurrent, false);
    return () => { isCurrent = false; };
  }, [subjectId]));

  const daysUntilExam =
    exam ? getDaysUntilExam(exam.date, todayKey) : null;

  /*
   * If an exam exists and specific topics
   * have been selected for that exam,
   * show only those topics.
   *
   * Otherwise show all topics belonging
   * to the subject.
   */
  const examTopics =
    exam && exam.topicIds.length > 0
      ? topics.filter((topic) =>
          exam.topicIds.includes(topic.id)
        )
      : topics;

  /*
   * Pick today's topic automatically.
   */
  const today = new Date();
  const isStudyDay = studyPlan.studyDays.includes(today.getDay());
  const todayTopic = isStudyDay
    ? getTopicForDate(examTopics, today, studyPlan.studyDays)
    : null;
  const nextStudyDate = !isStudyDay
    ? getNextStudyDate(studyPlan.studyDays)
    : null;
  const nextStudyTopic = nextStudyDate
    ? getTopicForDate(examTopics, nextStudyDate, studyPlan.studyDays)
    : null;

  const activeRecallMinutes = Math.round(studyPlan.dailyStudyMinutes * 0.5);
  const quizMinutes = Math.round(studyPlan.dailyStudyMinutes * 0.3);
  const reviewMinutes = studyPlan.dailyStudyMinutes - activeRecallMinutes - quizMinutes;

  /*
   * Open the existing Topic → Study page.
   */
  function openTopicStudy(topic: Topic) {
    router.push({
      pathname: '/subject/topic/study',
      params: {
        id: String(topic.id),
        name: topic.name,
        subjectId: subjectId ?? '',
      },
    });
  }

  function startTodaysPlan() {
    if (!todayTopic) {
      return;
    }

    openTopicStudy(todayTopic);
  }

  function openSettings() {
    setDraftStudyPlan({
      studyDays: [...studyPlan.studyDays],
      dailyStudyMinutes: studyPlan.dailyStudyMinutes,
    });
    setSettingsVisible(true);
  }

  function toggleStudyDay(day: number) {
    setDraftStudyPlan((current) => ({
      ...current,
      studyDays: current.studyDays.includes(day)
        ? current.studyDays.filter((studyDay) => studyDay !== day)
        : [...current.studyDays, day],
    }));
  }

  async function saveSettings() {
    if (!subjectId) {
      return;
    }

    if (draftStudyPlan.studyDays.length === 0) {
      Alert.alert('Choose a study day', 'Select at least one day for your weekly plan.');
      return;
    }

    setSavingSettings(true);

    try {
      const updatedPlan = {
        ...draftStudyPlan,
        studyDays: [...draftStudyPlan.studyDays].sort((a, b) => a - b),
      };

      await saveStudyPlanForSubject(subjectId, updatedPlan);
      setStudyPlan(updatedPlan);
      setSettingsVisible(false);
    } catch {
      Alert.alert('Could not save plan', 'Please try again.');
    } finally {
      setSavingSettings(false);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <Stack.Screen
        options={{
          headerShown: false,
        }}
      />

      <PullToRefreshScrollView
        onRefresh={() => loadData(() => true, false)}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        {/* Back */}
        <Pressable
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Text style={styles.backText}>
            ← Back
          </Text>
        </Pressable>

        {/* Header */}
        <Text style={styles.title}>
          Study Plan
        </Text>

        <Text style={styles.subjectName}>
          {subjectName || 'Subject'}
        </Text>

        <Text style={styles.subtitle}>
          Your study plan for this subject.
        </Text>

        {loading ? (
          <Text style={styles.loadingText}>
            Loading study plan...
          </Text>
        ) : (
          <>
            {/* Exam */}
            <View style={styles.examCard}>
              <View style={styles.examIconBox}>
                <StudyIcon name="calendar" size={22} />
              </View>

              <View style={styles.examContent}>
                <Text style={styles.examLabel}>
                  EXAM
                </Text>

                {exam ? (
                  <>
                    <Text style={styles.examDate}>
                      {formatDate(exam.date)}
                    </Text>

                    <Text style={styles.examType}>
                      {exam.type}
                    </Text>
                  </>
                ) : (
                  <Text style={styles.noExamText}>
                    No exam date set yet
                  </Text>
                )}
              </View>

              <Pressable
                style={styles.examAction}
                onPress={() =>
                  router.push({
                    pathname: '/subject/exam',
                    params: { id: subjectId ?? '', name: subjectName ?? '' },
                  })
                }
              >
                <Text style={styles.examActionText}>
                  {exam ? 'Edit' : 'Set up'}
                </Text>
              </Pressable>
            </View>

            {/* Weekly settings */}
            <View style={styles.settingsCard}>
              <View style={styles.settingsHeader}>
                <View>
                  <Text style={styles.settingsEyebrow}>
                    YOUR ROUTINE
                  </Text>
                  <Text style={styles.settingsTitle}>
                    Weekly study plan
                  </Text>
                </View>

                <Pressable
                  style={styles.editSettingsButton}
                  onPress={openSettings}
                  accessibilityRole="button"
                  accessibilityLabel="Edit weekly study plan"
                >
                  <Text style={styles.editSettingsText}>Edit</Text>
                </Pressable>
              </View>

              <View style={styles.weekdayRow}>
                {DAY_OPTIONS.map((day) => {
                  const selected = studyPlan.studyDays.includes(day.value);

                  return (
                    <View
                      key={day.value}
                      style={[
                        styles.weekdayPill,
                        selected && styles.weekdayPillSelected,
                      ]}
                    >
                      <Text
                        style={[
                          styles.weekdayText,
                          selected && styles.weekdayTextSelected,
                        ]}
                      >
                        {day.label}
                      </Text>
                    </View>
                  );
                })}
              </View>

              <View style={styles.dailyTimeRow}>
                <View style={styles.dailyTimeIconBox}>
                  <StudyIcon name="timer" size={20} />
                </View>
                <View style={styles.dailyTimeCopy}>
                  <Text style={styles.dailyTimeLabel}>Daily study time</Text>
                  <Text style={styles.dailyTimeValue}>
                    {formatDuration(studyPlan.dailyStudyMinutes)} per study day
                  </Text>
                </View>
              </View>
            </View>

            {/* Countdown */}
            {exam &&
              daysUntilExam !== null && (
                <View
                  style={styles.countdownCard}
                >
                  <Text
                    style={styles.countdownLabel}
                  >
                    {daysUntilExam < 0
                      ? 'Exam date passed'
                      : daysUntilExam === 0
                        ? 'Exam day'
                        : 'Days until exam'}
                  </Text>

                  <Text
                    style={styles.countdownNumber}
                  >
                    {daysUntilExam >= 0
                      ? daysUntilExam
                      : '—'}
                  </Text>

                  {daysUntilExam > 0 && (
                    <Text
                      style={styles.countdownSmall}
                    >
                      days remaining
                    </Text>
                  )}
                </View>
              )}

            {/* Today's Plan */}
            {todayTopic && (
              <View style={styles.todayCard}>
                <View style={styles.todayHeader}>
                  <View>
                    <Text style={styles.todayEyebrow}>
                      TODAY'S PLAN
                    </Text>

                    <Text style={styles.todayTitle}>
                      Today's focus
                    </Text>
                  </View>

                  <View style={styles.todayIconBox}>
                    <StudyIcon name="target" size={22} />
                  </View>
                </View>

                <Text style={styles.todayTopicLabel}>
                  Recommended topic
                </Text>

                <Text style={styles.todayTopicName}>
                  {todayTopic.name}
                </Text>

                {/* Study steps */}
                <View style={styles.stepsContainer}>
                  <View style={styles.stepRow}>
                    <View style={styles.stepNumber}>
                      <Text style={styles.stepNumberText}>
                        1
                      </Text>
                    </View>

                    <View style={styles.stepContent}>
                      <Text style={styles.stepTitle}>
                        Active Recall
                      </Text>

                      <Text style={styles.stepText}>
                        Test what you remember · {activeRecallMinutes} min
                      </Text>
                    </View>
                  </View>

                  <View style={styles.stepRow}>
                    <View style={styles.stepNumber}>
                      <Text style={styles.stepNumberText}>
                        2
                      </Text>
                    </View>

                    <View style={styles.stepContent}>
                      <Text style={styles.stepTitle}>
                        Quiz
                      </Text>

                      <Text style={styles.stepText}>
                        Practice with questions · {quizMinutes} min
                      </Text>
                    </View>
                  </View>

                  <View style={styles.stepRow}>
                    <View style={styles.stepNumber}>
                      <Text style={styles.stepNumberText}>
                        3
                      </Text>
                    </View>

                    <View style={styles.stepContent}>
                      <Text style={styles.stepTitle}>
                        Review
                      </Text>

                      <Text style={styles.stepText}>
                        Review what you struggled with · {reviewMinutes} min
                      </Text>
                    </View>
                  </View>
                </View>

                <View style={styles.todayInfoRow}>
                  <View style={styles.todayInfo}>
                    <StudyIcon name="brain" size={17} />

                    <View>
                      <Text style={styles.todayInfoLabel}>
                        Focus
                      </Text>

                      <Text style={styles.todayInfoValue}>
                        {todayTopic.name}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.todayInfo}>
                    <StudyIcon name="timer" size={17} />

                    <View>
                      <Text style={styles.todayInfoLabel}>
                        Estimated time
                      </Text>

                      <Text style={styles.todayInfoValue}>
                        {formatDuration(studyPlan.dailyStudyMinutes)}
                      </Text>
                    </View>
                  </View>
                </View>

                <Text style={styles.todayReason}>
                  Start with one focused session and
                  work through the three study steps.
                </Text>

                <Pressable
                  style={styles.todayButton}
                  onPress={startTodaysPlan}
                >
                  <Text style={styles.todayButtonText}>
                    Start today's plan
                  </Text>

                  <Text style={styles.todayButtonArrow}>
                    →
                  </Text>
                </Pressable>
              </View>
            )}

            {!loading && examTopics.length > 0 && !isStudyDay && (
              <View style={styles.restDayCard}>
                <View style={styles.restDayIconBox}>
                  <StudyIcon name="check" size={23} />
                </View>
                <View style={styles.restDayContent}>
                  <Text style={styles.restDayEyebrow}>TODAY</Text>
                  <Text style={styles.restDayTitle}>A day off from studying</Text>
                  {nextStudyDate && nextStudyTopic ? (
                    <Text style={styles.restDayText}>
                      Next up: {nextStudyTopic.name} · {nextStudyDate.toLocaleDateString('en-GB', {
                        weekday: 'short',
                        day: 'numeric',
                        month: 'short',
                      })}
                    </Text>
                  ) : (
                    <Text style={styles.restDayText}>
                      Add a study day in your weekly plan to see your next session.
                    </Text>
                  )}
                </View>
              </View>
            )}

            {/* Topics */}
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>
                Topics
              </Text>

              <Text style={styles.topicCount}>
                {exam &&
                exam.topicIds.length > 0
                  ? `${examTopics.length} of ${topics.length}`
                  : `${topics.length}`}
              </Text>
            </View>

            {examTopics.length === 0 ? (
              <View style={styles.emptyCard}>
                <StudyIcon name="layers" size={24} />

                <Text style={styles.emptyTitle}>
                  No topics yet
                </Text>

                <Text style={styles.emptyText}>
                  Add topics to this subject
                  to build your study plan.
                </Text>

                <Pressable
                  style={styles.primaryButton}
                  onPress={() =>
                    router.push({
                      pathname:
                        '/subject/topics',
                      params: {
                        id,
                        name,
                      },
                    })
                  }
                >
                  <Text
                    style={styles.primaryButtonText}
                  >
                    Go to Topics
                  </Text>
                </Pressable>
              </View>
            ) : (
              <View style={styles.topicList}>
                {examTopics.map(
                  (topic, index) => (
                    <Pressable
                      key={topic.id}
                      style={({ pressed }) => [
                        styles.topicCard,
                        pressed &&
                          styles.topicCardPressed,
                      ]}
                      onPress={() =>
                        openTopicStudy(topic)
                      }
                    >
                      <View
                        style={styles.numberBox}
                      >
                        <Text
                          style={styles.numberText}
                        >
                          {index + 1}
                        </Text>
                      </View>

                      <View
                        style={styles.topicContent}
                      >
                        <Text
                          style={styles.topicName}
                        >
                          {topic.name}
                        </Text>

                        <Text
                          style={styles.topicStatus}
                        >
                          Tap to start studying
                        </Text>
                      </View>

                      <Text style={styles.arrow}>
                        ›
                      </Text>
                    </Pressable>
                  )
                )}
              </View>
            )}

            {/* Smart planning */}
            <View style={styles.nextCard}>
              <Text style={styles.nextTitle}>Smart planning</Text>

              <Text style={styles.nextText}>
                Your weekly routine is saved on this device. Each study day focuses on an exam topic, with your available time split across active recall, a quiz and review.
              </Text>
            </View>
          </>
        )}
      </PullToRefreshScrollView>

      <Modal
        visible={settingsVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setSettingsVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setSettingsVisible(false)}
            accessibilityLabel="Close study plan settings"
          />

          <View style={styles.settingsSheet}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Study plan settings</Text>
            <Text style={styles.sheetSubtitle}>
              Choose the days and time that work for you.
            </Text>

            <Text style={styles.optionLabel}>Study days</Text>
            <View style={styles.dayOptionsRow}>
              {DAY_OPTIONS.map((day) => {
                const selected = draftStudyPlan.studyDays.includes(day.value);

                return (
                  <Pressable
                    key={day.value}
                    style={[
                      styles.dayOption,
                      selected && styles.dayOptionSelected,
                    ]}
                    onPress={() => toggleStudyDay(day.value)}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: selected }}
                    accessibilityLabel={day.label}
                  >
                    <Text
                      style={[
                        styles.dayOptionText,
                        selected && styles.dayOptionTextSelected,
                      ]}
                    >
                      {day.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={styles.optionLabel}>Daily study time</Text>
            <View style={styles.timeOptionsGrid}>
              {STUDY_TIME_OPTIONS.map((minutes) => {
                const selected = draftStudyPlan.dailyStudyMinutes === minutes;

                return (
                  <Pressable
                    key={minutes}
                    style={[
                      styles.timeOption,
                      selected && styles.timeOptionSelected,
                    ]}
                    onPress={() =>
                      setDraftStudyPlan((current) => ({
                        ...current,
                        dailyStudyMinutes: minutes,
                      }))
                    }
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    accessibilityLabel={`${formatDuration(minutes)} per day`}
                  >
                    <Text
                      style={[
                        styles.timeOptionText,
                        selected && styles.timeOptionTextSelected,
                      ]}
                    >
                      {formatDuration(minutes)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.sheetActions}>
              <Pressable
                style={styles.cancelButton}
                onPress={() => setSettingsVisible(false)}
                disabled={savingSettings}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[
                  styles.saveButton,
                  savingSettings && styles.saveButtonDisabled,
                ]}
                onPress={saveSettings}
                disabled={savingSettings}
              >
                <Text style={styles.saveButtonText}>
                  {savingSettings ? 'Saving…' : 'Save plan'}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
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
    fontSize: 36,
    fontWeight: '800',
    color: appColor('#17324D', 'text'),
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
    marginTop: 8,
    marginBottom: 24,
  },

  loadingText: {
    textAlign: 'center',
    marginTop: 40,
    color: appColor('#8494A0', 'text'),
  },

  examCard: {
    backgroundColor: appColor('#FFFFFF', 'background'),
    borderRadius: 22,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },

  examIconBox: {
    width: 58,
    height: 58,
    borderRadius: 18,
    backgroundColor: appColor('#E3F5FF', 'background'),
    justifyContent: 'center',
    alignItems: 'center',
  },

  examIcon: {
    fontSize: 27,
  },

  examContent: {
    flex: 1,
    marginLeft: 16,
  },

  examAction: {
    alignSelf: 'center',
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 12,
    backgroundColor: appColor('#EAF7FD', 'background'),
    marginLeft: 10,
  },

  examActionText: {
    color: appColor('#318DBA', 'text'),
    fontSize: 13,
    fontWeight: '800',
  },

  examLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: appColor('#8A9BA5', 'text'),
    letterSpacing: 0.5,
  },

  examDate: {
    fontSize: 18,
    fontWeight: '800',
    color: appColor('#17324D', 'text'),
    marginTop: 4,
  },

  examType: {
    fontSize: 13,
    color: appColor('#8494A0', 'text'),
    marginTop: 3,
  },

  noExamText: {
    fontSize: 16,
    fontWeight: '700',
    color: appColor('#17324D', 'text'),
    marginTop: 4,
  },

  countdownCard: {
    backgroundColor: appColor('#DFF4FF', 'background'),
    borderRadius: 22,
    padding: 22,
    alignItems: 'center',
    marginBottom: 18,
  },

  countdownLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: appColor('#56829A', 'text'),
  },

  countdownNumber: {
    fontSize: 52,
    fontWeight: '800',
    color: appColor('#318DBA', 'text'),
    marginTop: 2,
  },

  countdownSmall: {
    fontSize: 13,
    color: appColor('#6D8A9A', 'text'),
    marginTop: -3,
  },

  /* Weekly study plan */

  settingsCard: {
    backgroundColor: appColor('#FFFFFF', 'background'),
    borderRadius: 22,
    padding: 20,
    marginBottom: 18,
  },

  settingsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  settingsEyebrow: {
    fontSize: 10,
    fontWeight: '800',
    color: appColor('#43A5D1', 'text'),
    letterSpacing: 1,
  },

  settingsTitle: {
    fontSize: 19,
    fontWeight: '800',
    color: appColor('#17324D', 'text'),
    marginTop: 4,
  },

  editSettingsButton: {
    paddingHorizontal: 13,
    paddingVertical: 9,
    borderRadius: 12,
    backgroundColor: appColor('#EAF7FD', 'background'),
  },

  editSettingsText: {
    fontSize: 13,
    fontWeight: '800',
    color: appColor('#318DBA', 'text'),
  },

  weekdayRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 18,
  },

  weekdayPill: {
    width: 37,
    height: 34,
    borderRadius: 12,
    backgroundColor: appColor('#F2F7FA', 'background'),
    alignItems: 'center',
    justifyContent: 'center',
  },

  weekdayPillSelected: {
    backgroundColor: appColor('#DFF4FF', 'background'),
  },

  weekdayText: {
    fontSize: 11,
    fontWeight: '700',
    color: appColor('#9AAAB4', 'text'),
  },

  weekdayTextSelected: {
    color: appColor('#318DBA', 'text'),
  },

  dailyTimeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#EDF3F6',
    paddingTop: 15,
    marginTop: 16,
  },

  dailyTimeIconBox: {
    width: 40,
    height: 40,
    borderRadius: 13,
    backgroundColor: appColor('#EAF7FD', 'background'),
    alignItems: 'center',
    justifyContent: 'center',
  },

  dailyTimeIcon: {
    fontSize: 18,
  },

  dailyTimeCopy: {
    marginLeft: 12,
  },

  dailyTimeLabel: {
    fontSize: 12,
    color: appColor('#8494A0', 'text'),
  },

  dailyTimeValue: {
    fontSize: 15,
    fontWeight: '800',
    color: appColor('#17324D', 'text'),
    marginTop: 3,
  },

  /* Today's Plan */

  todayCard: {
    backgroundColor: appColor('#FFFFFF', 'background'),
    borderRadius: 24,
    padding: 22,
    marginBottom: 28,
  },

  todayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  todayEyebrow: {
    fontSize: 11,
    fontWeight: '800',
    color: appColor('#43A5D1', 'text'),
    letterSpacing: 1,
  },

  todayTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: appColor('#17324D', 'text'),
    marginTop: 3,
  },

  todayIconBox: {
    width: 52,
    height: 52,
    borderRadius: 17,
    backgroundColor: appColor('#E3F5FF', 'background'),
    justifyContent: 'center',
    alignItems: 'center',
  },

  todayIcon: {
    fontSize: 25,
  },

  todayTopicLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: appColor('#8A9BA5', 'text'),
    marginTop: 22,
  },

  todayTopicName: {
    fontSize: 22,
    fontWeight: '800',
    color: appColor('#17324D', 'text'),
    marginTop: 4,
  },

  stepsContainer: {
    marginTop: 20,
  },

  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },

  stepNumber: {
    width: 32,
    height: 32,
    borderRadius: 11,
    backgroundColor: appColor('#E3F5FF', 'background'),
    justifyContent: 'center',
    alignItems: 'center',
  },

  stepNumberText: {
    fontSize: 13,
    fontWeight: '800',
    color: appColor('#43A5D1', 'text'),
  },

  stepContent: {
    flex: 1,
    marginLeft: 11,
  },

  stepTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: appColor('#17324D', 'text'),
  },

  stepText: {
    fontSize: 12,
    color: appColor('#8494A0', 'text'),
    marginTop: 2,
  },

  todayInfoRow: {
    flexDirection: 'row',
    marginTop: 8,
    gap: 12,
  },

  todayInfo: {
    flex: 1,
    backgroundColor: appColor('#F7FBFE', 'background'),
    borderRadius: 16,
    padding: 13,
    flexDirection: 'row',
    alignItems: 'center',
  },

  todayInfoIcon: {
    fontSize: 20,
    marginRight: 9,
  },

  todayInfoLabel: {
    fontSize: 10,
    color: appColor('#8A9BA5', 'text'),
    fontWeight: '600',
  },

  todayInfoValue: {
    fontSize: 12,
    color: appColor('#17324D', 'text'),
    fontWeight: '800',
    marginTop: 2,
  },

  todayReason: {
    fontSize: 13,
    color: appColor('#718795', 'text'),
    lineHeight: 20,
    marginTop: 16,
  },

  todayButton: {
    height: 54,
    borderRadius: 17,
    backgroundColor: appColor('#4AA9D8', 'background'),
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 18,
  },

  todayButtonText: {
    color: appColor('#FFFFFF', 'text'),
    fontSize: 16,
    fontWeight: '800',
  },

  todayButtonArrow: {
    color: appColor('#FFFFFF', 'text'),
    fontSize: 23,
    marginLeft: 10,
  },

  restDayCard: {
    backgroundColor: appColor('#EAF7FD', 'background'),
    borderRadius: 22,
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
  },

  restDayIconBox: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: appColor('#FFFFFF', 'background'),
    alignItems: 'center',
    justifyContent: 'center',
  },

  restDayIcon: {
    fontSize: 23,
  },

  restDayContent: {
    flex: 1,
    marginLeft: 14,
  },

  restDayEyebrow: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
    color: appColor('#43A5D1', 'text'),
  },

  restDayTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: appColor('#17324D', 'text'),
    marginTop: 3,
  },

  restDayText: {
    fontSize: 12,
    lineHeight: 18,
    color: appColor('#66808F', 'text'),
    marginTop: 4,
  },

  /* Topics */

  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },

  sectionTitle: {
    fontSize: 21,
    fontWeight: '800',
    color: appColor('#17324D', 'text'),
  },

  topicCount: {
    fontSize: 13,
    fontWeight: '700',
    color: appColor('#43A5D1', 'text'),
  },

  topicList: {
    marginBottom: 18,
  },

  topicCard: {
    backgroundColor: appColor('#FFFFFF', 'background'),
    borderRadius: 18,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },

  topicCardPressed: {
    opacity: 0.7,
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
    fontSize: 16,
    fontWeight: '700',
    color: appColor('#17324D', 'text'),
  },

  topicStatus: {
    fontSize: 12,
    color: appColor('#43A5D1', 'text'),
    marginTop: 4,
  },

  arrow: {
    fontSize: 28,
    fontWeight: '300',
    color: appColor('#9AB5C4', 'text'),
    marginLeft: 8,
  },

  emptyCard: {
    backgroundColor: appColor('#FFFFFF', 'background'),
    borderRadius: 22,
    padding: 26,
    alignItems: 'center',
  },

  emptyIcon: {
    fontSize: 32,
  },

  emptyTitle: {
    fontSize: 19,
    fontWeight: '800',
    color: appColor('#17324D', 'text'),
    marginTop: 12,
  },

  emptyText: {
    fontSize: 14,
    color: appColor('#8494A0', 'text'),
    textAlign: 'center',
    lineHeight: 21,
    marginTop: 7,
  },

  primaryButton: {
    backgroundColor: appColor('#4AA9D8', 'background'),
    paddingHorizontal: 20,
    paddingVertical: 13,
    borderRadius: 15,
    marginTop: 18,
  },

  primaryButtonText: {
    color: appColor('#FFFFFF', 'text'),
    fontSize: 14,
    fontWeight: '700',
  },

  /* Smart planning */

  nextCard: {
    backgroundColor: appColor('#EAF7FD', 'background'),
    borderRadius: 22,
    padding: 20,
    marginTop: 8,
  },

  nextTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: appColor('#17324D', 'text'),
  },

  nextText: {
    fontSize: 13,
    color: appColor('#66808F', 'text'),
    lineHeight: 20,
    marginTop: 7,
  },

  /* Study plan settings sheet */

  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(23, 50, 77, 0.32)',
  },

  settingsSheet: {
    backgroundColor: appColor('#FFFFFF', 'background'),
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 22,
    paddingTop: 12,
    paddingBottom: 32,
  },

  sheetHandle: {
    width: 40,
    height: 5,
    borderRadius: 3,
    backgroundColor: appColor('#D9E5EA', 'background'),
    alignSelf: 'center',
    marginBottom: 18,
  },

  sheetTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: appColor('#17324D', 'text'),
  },

  sheetSubtitle: {
    fontSize: 14,
    color: appColor('#7A8B99', 'text'),
    lineHeight: 20,
    marginTop: 5,
  },

  optionLabel: {
    fontSize: 14,
    fontWeight: '800',
    color: appColor('#17324D', 'text'),
    marginTop: 23,
    marginBottom: 11,
  },

  dayOptionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },

  dayOption: {
    width: 40,
    height: 44,
    borderRadius: 14,
    backgroundColor: appColor('#F2F7FA', 'background'),
    alignItems: 'center',
    justifyContent: 'center',
  },

  dayOptionSelected: {
    backgroundColor: appColor('#4AA9D8', 'background'),
  },

  dayOptionText: {
    fontSize: 11,
    fontWeight: '700',
    color: appColor('#7A8B99', 'text'),
  },

  dayOptionTextSelected: {
    color: appColor('#FFFFFF', 'text'),
  },

  timeOptionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 9,
  },

  timeOption: {
    minWidth: 84,
    height: 42,
    paddingHorizontal: 13,
    borderRadius: 13,
    backgroundColor: appColor('#F2F7FA', 'background'),
    alignItems: 'center',
    justifyContent: 'center',
  },

  timeOptionSelected: {
    backgroundColor: appColor('#DFF4FF', 'background'),
    borderWidth: 1,
    borderColor: appColor('#8CCDEA', 'border'),
  },

  timeOptionText: {
    fontSize: 13,
    fontWeight: '700',
    color: appColor('#718795', 'text'),
  },

  timeOptionTextSelected: {
    color: appColor('#287DA5', 'text'),
  },

  sheetActions: {
    flexDirection: 'row',
    marginTop: 28,
    gap: 10,
  },

  cancelButton: {
    flex: 1,
    height: 52,
    borderRadius: 16,
    backgroundColor: appColor('#F2F7FA', 'background'),
    alignItems: 'center',
    justifyContent: 'center',
  },

  cancelButtonText: {
    fontSize: 15,
    fontWeight: '800',
    color: appColor('#718795', 'text'),
  },

  saveButton: {
    flex: 1.5,
    height: 52,
    borderRadius: 16,
    backgroundColor: appColor('#4AA9D8', 'background'),
    alignItems: 'center',
    justifyContent: 'center',
  },

  saveButtonDisabled: {
    opacity: 0.6,
  },

  saveButtonText: {
    fontSize: 15,
    fontWeight: '800',
    color: appColor('#FFFFFF', 'text'),
  },
});
