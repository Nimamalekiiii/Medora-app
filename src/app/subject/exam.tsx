import { LocalizedText as Text } from '@/components/localized-text';
import { appColor } from '@/constants/adaptive-color';
import { Stack, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getTopicsBySubject, getExamForSubject, getExamsBySubject, saveExamsBySubject } from '../../services/storage';
import PullToRefreshScrollView from '../../components/pull-to-refresh-scroll-view';

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

type ModalView =
  | 'edit'
  | 'date'
  | 'type'
  | 'topics'
  | null;

const examTypes = [
  'Written exam',
  'Oral exam',
  'Practical exam',
  'Multiple choice',
  'OSCE',
  'Other',
];

const monthNames = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const weekdayNames = [
  'M',
  'T',
  'W',
  'T',
  'F',
  'S',
  'S',
];

function dateToKey(date: Date) {
  const year = date.getFullYear();

  const month = String(
    date.getMonth() + 1,
  ).padStart(2, '0');

  const day = String(
    date.getDate(),
  ).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function keyToDate(key: string) {
  const [year, month, day] =
    key.split('-').map(Number);

  return new Date(
    year,
    month - 1,
    day,
  );
}

function formatDate(dateKey: string) {
  const date = keyToDate(dateKey);

  return date.toLocaleDateString(
    'en-GB',
    {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    },
  );
}

function getDaysUntilExam(
  dateKey: string,
) {
  const examDate = keyToDate(dateKey);

  const today = new Date();

  examDate.setHours(
    0,
    0,
    0,
    0,
  );

  today.setHours(
    0,
    0,
    0,
    0,
  );

  const difference =
    examDate.getTime() -
    today.getTime();

  return Math.ceil(
    difference /
      (1000 * 60 * 60 * 24),
  );
}

/*
 * Returns the Monday-based index
 * of the first day in a month.
 */
function getFirstDayOfMonth(
  year: number,
  month: number,
) {
  const day =
    new Date(
      year,
      month,
      1,
    ).getDay();

  return day === 0 ? 6 : day - 1;
}

export default function ExamScreen() {
  const { id, name } =
    useLocalSearchParams();

  const subjectId =
    Array.isArray(id)
      ? id[0]
      : id;

  const subjectName =
    Array.isArray(name)
      ? name[0]
      : name;

  const [
    topicsBySubject,
    setTopicsBySubject,
  ] = useState<TopicsBySubject>(
    {},
  );

  const [
    exam,
    setExam,
  ] = useState<Exam | null>(
    null,
  );

  const [
    loading,
    setLoading,
  ] = useState(true);

  /*
   * Only ONE modal is used.
   */
  const [
    modalView,
    setModalView,
  ] = useState<ModalView>(
    null,
  );

  const [
    selectedDate,
    setSelectedDate,
  ] = useState(
    new Date(),
  );

  const [
    selectedType,
    setSelectedType,
  ] = useState(
    'Written exam',
  );

  const [
    selectedTopicIds,
    setSelectedTopicIds,
  ] = useState<number[]>(
    [],
  );

  /*
   * Calendar month currently being viewed.
   */
  const [
    calendarMonth,
    setCalendarMonth,
  ] = useState(
    new Date(),
  );

  /*
   * Topics screen can be opened from
   * Edit exam or directly from Exam.
   */
  const [
    topicsReturnToEdit,
    setTopicsReturnToEdit,
  ] = useState(false);

  const topics =
    topicsBySubject[
      subjectId ?? ''
    ] ?? [];

  const daysUntilExam =
    useMemo(() => {
      if (!exam) {
        return null;
      }

      return getDaysUntilExam(
        exam.date,
      );
    }, [exam]);

  const selectedTopicNames =
    topics
      .filter((topic) =>
        exam?.topicIds.includes(
          topic.id,
        ),
      )
      .map(
        (topic) => topic.name,
      );

  // =================================
  // LOAD DATA
  // =================================

  useFocusEffect(useCallback(() => {
    void loadData(false);
  }, [subjectId]));

  async function loadData(showLoading = true) {
    if (showLoading) setLoading(true);

    await Promise.all([
      loadTopics(),
      loadExam(),
    ]);

    setLoading(false);
  }

  /*
   * Load topics separately.
   *
   * This is important because we can
   * reload them whenever the Topics
   * picker is opened.
   */
  async function loadTopics() {
    try {
      setTopicsBySubject(await getTopicsBySubject());
    } catch (error) {
      console.log(
        'Could not load topics:',
        error,
      );
    }
  }

  async function loadExam() {
    try {
      if (!subjectId) {
        setExam(null);
        return;
      }
      setExam(await getExamForSubject(subjectId));
    } catch (error) {
      console.log(
        'Could not load exam:',
        error,
      );

      setExam(null);
    }
  }

  // =================================
  // SAVE EXAM
  // =================================

  async function saveExam(
    updatedExam: Exam | null,
  ) {
    if (!subjectId) {
      return;
    }

    try {
      const currentExams = await getExamsBySubject();

      const updatedExams: ExamsBySubject =
        {
          ...currentExams,
          [subjectId]:
            updatedExam,
        };

      await saveExamsBySubject(updatedExams);

      setExam(updatedExam);
    } catch (error) {
      console.log(
        'Could not save exam:',
        error,
      );

      Alert.alert(
        'Could not save',
        'Something went wrong while saving the exam.',
      );
    }
  }

  // =================================
  // OPEN EDIT
  // =================================

  function openEdit() {
    if (exam) {
      const date =
        keyToDate(exam.date);

      setSelectedDate(date);

      setCalendarMonth(date);

      setSelectedType(
        exam.type,
      );

      setSelectedTopicIds([
        ...exam.topicIds,
      ]);
    } else {
      const today = new Date();

      setSelectedDate(today);

      setCalendarMonth(today);

      setSelectedType(
        'Written exam',
      );

      setSelectedTopicIds([]);
    }

    setTopicsReturnToEdit(false);

    setModalView('edit');
  }

  // =================================
  // CLOSE MODAL
  // =================================

  function closeModal() {
    setModalView(null);

    setTopicsReturnToEdit(
      false,
    );
  }

  // =================================
  // SAVE CHANGES
  // =================================

  async function saveChanges() {
    const updatedExam: Exam = {
      date: dateToKey(
        selectedDate,
      ),

      type: selectedType,

      topicIds:
        selectedTopicIds,
    };

    await saveExam(
      updatedExam,
    );

    closeModal();
  }

  // =================================
  // DELETE EXAM
  // =================================

  function deleteExam() {
    Alert.alert(
      'Delete exam?',
      'This will remove the exam date, exam type and selected topics.',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },

        {
          text: 'Delete',
          style: 'destructive',

          onPress:
            async () => {
              await saveExam(
                null,
              );
            },
        },
      ],
    );
  }

  // =================================
  // OPEN TOPICS
  // =================================

  async function openTopicsPicker(
    fromEdit: boolean,
  ) {
    /*
     * Reload topics every time.
     *
     * This makes sure topics added on
     * the Topics page are immediately
     * available here.
     */
    await loadTopics();

    if (fromEdit) {
      setSelectedTopicIds([
        ...selectedTopicIds,
      ]);
    } else {
      setSelectedTopicIds([
        ...(exam?.topicIds ?? []),
      ]);
    }

    setTopicsReturnToEdit(
      fromEdit,
    );

    setModalView('topics');
  }

  function toggleTopic(
    topicId: number,
  ) {
    setSelectedTopicIds(
      (current) => {
        if (
          current.includes(
            topicId,
          )
        ) {
          return current.filter(
            (id) =>
              id !== topicId,
          );
        }

        return [
          ...current,
          topicId,
        ];
      },
    );
  }

  async function finishTopicsPicker() {
    /*
     * When coming from Edit exam,
     * simply return to Edit.
     *
     * The main Done button will save
     * everything together.
     */
    if (
      topicsReturnToEdit
    ) {
      setModalView('edit');

      return;
    }

    /*
     * When opened directly from the
     * main Exam page, save immediately.
     */
    if (exam) {
      await saveExam({
        ...exam,

        topicIds:
          selectedTopicIds,
      });
    }

    closeModal();
  }

  // =================================
  // CALENDAR
  // =================================

  function changeCalendarMonth(
    amount: number,
  ) {
    setCalendarMonth(
      (current) =>
        new Date(
          current.getFullYear(),
          current.getMonth() +
            amount,
          1,
        ),
    );
  }

  function selectCalendarDate(
    day: number,
  ) {
    const newDate =
      new Date(
        calendarMonth.getFullYear(),
        calendarMonth.getMonth(),
        day,
      );

    setSelectedDate(
      newDate,
    );
  }

  function isSameDate(
    first: Date,
    second: Date,
  ) {
    return (
      first.getFullYear() ===
        second.getFullYear() &&
      first.getMonth() ===
        second.getMonth() &&
      first.getDate() ===
        second.getDate()
    );
  }

  function renderCalendar() {
    const year =
      calendarMonth.getFullYear();

    const month =
      calendarMonth.getMonth();

    const firstDay =
      getFirstDayOfMonth(
        year,
        month,
      );

    const daysInMonth =
      new Date(
        year,
        month + 1,
        0,
      ).getDate();

    const calendarDays: (
      number | null
    )[] = [];

    for (
      let i = 0;
      i < firstDay;
      i++
    ) {
      calendarDays.push(null);
    }

    for (
      let day = 1;
      day <= daysInMonth;
      day++
    ) {
      calendarDays.push(day);
    }

    return (
      <View
        style={styles.calendar}
      >
        {/* MONTH HEADER */}

        <View
          style={
            styles.calendarHeader
          }
        >
          <Pressable
            style={
              styles.monthArrow
            }
            onPress={() =>
              changeCalendarMonth(
                -1,
              )
            }
          >
            <Text
              style={
                styles.monthArrowText
              }
            >
              ‹
            </Text>
          </Pressable>

          <Text
            style={
              styles.calendarMonthTitle
            }
          >
            {monthNames[
              month
            ]}{' '}
            {year}
          </Text>

          <Pressable
            style={
              styles.monthArrow
            }
            onPress={() =>
              changeCalendarMonth(
                1,
              )
            }
          >
            <Text
              style={
                styles.monthArrowText
              }
            >
              ›
            </Text>
          </Pressable>
        </View>

        {/* WEEKDAYS */}

        <View
          style={
            styles.weekdayRow
          }
        >
          {weekdayNames.map(
            (
              weekday,
              index,
            ) => (
              <View
                key={`${weekday}-${index}`}
                style={
                  styles.weekdayCell
                }
              >
                <Text
                  style={
                    styles.weekdayText
                  }
                >
                  {weekday}
                </Text>
              </View>
            ),
          )}
        </View>

        {/* DAYS */}

        <View
          style={
            styles.daysGrid
          }
        >
          {calendarDays.map(
            (
              day,
              index,
            ) => {
              if (
                day === null
              ) {
                return (
                  <View
                    key={`empty-${index}`}
                    style={
                      styles.dayCell
                    }
                  />
                );
              }

              const date =
                new Date(
                  year,
                  month,
                  day,
                );

              const selected =
                isSameDate(
                  date,
                  selectedDate,
                );

              const today =
                isSameDate(
                  date,
                  new Date(),
                );

              return (
                <Pressable
                  key={day}
                  style={[
                    styles.dayCell,
                    selected &&
                      styles.selectedDay,
                  ]}
                  onPress={() =>
                    selectCalendarDate(
                      day,
                    )
                  }
                >
                  <Text
                    style={[
                      styles.dayText,
                      selected &&
                        styles.selectedDayText,
                      today &&
                        !selected &&
                        styles.todayText,
                    ]}
                  >
                    {day}
                  </Text>
                </Pressable>
              );
            },
          )}
        </View>
      </View>
    );
  }

  // =================================
  // MODAL CONTENT
  // =================================

  function renderModalContent() {
    // =================================
    // EDIT
    // =================================

    if (
      modalView === 'edit'
    ) {
      return (
        <>
          <View
            style={
              styles.modalHandle
            }
          />

          <Text
            style={
              styles.modalTitle
            }
          >
            {exam
              ? 'Edit exam'
              : 'Set up exam'}
          </Text>

          <Text
            style={
              styles.modalSubtitle
            }
          >
            Choose your exam date,
            type and topics.
          </Text>

          {/* DATE */}

          <Pressable
            style={
              styles.settingRow
            }
            onPress={() =>
              setModalView(
                'date',
              )
            }
          >
            <View
              style={
                styles.settingContent
              }
            >
              <Text
                style={
                  styles.settingLabel
                }
              >
                Exam date
              </Text>

              <Text
                style={
                  styles.settingValue
                }
              >
                {selectedDate.toLocaleDateString(
                  'en-GB',
                  {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  },
                )}
              </Text>
            </View>

            <Text
              style={
                styles.settingArrow
              }
            >
              ›
            </Text>
          </Pressable>

          {/* TYPE */}

          <Pressable
            style={
              styles.settingRow
            }
            onPress={() =>
              setModalView(
                'type',
              )
            }
          >
            <View
              style={
                styles.settingContent
              }
            >
              <Text
                style={
                  styles.settingLabel
                }
              >
                Exam type
              </Text>

              <Text
                style={
                  styles.settingValue
                }
              >
                {selectedType}
              </Text>
            </View>

            <Text
              style={
                styles.settingArrow
              }
            >
              ›
            </Text>
          </Pressable>

          {/* TOPICS */}

          <Pressable
            style={
              styles.settingRow
            }
            onPress={() =>
              openTopicsPicker(
                true,
              )
            }
          >
            <View
              style={
                styles.settingContent
              }
            >
              <Text
                style={
                  styles.settingLabel
                }
              >
                Topics included
              </Text>

              <Text
                style={
                  styles.settingValue
                }
              >
                {selectedTopicIds.length ===
                0
                  ? 'No topics selected'
                  : `${selectedTopicIds.length} ${
                      selectedTopicIds.length ===
                      1
                        ? 'topic'
                        : 'topics'
                    } selected`}
              </Text>
            </View>

            <Text
              style={
                styles.settingArrow
              }
            >
              ›
            </Text>
          </Pressable>

          {/* BUTTONS */}

          <View
            style={
              styles.modalButtons
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
                saveChanges
              }
            >
              <Text
                style={
                  styles.saveButtonText
                }
              >
                Done
              </Text>
            </Pressable>
          </View>
        </>
      );
    }

    // =================================
    // DATE
    // =================================

    if (
      modalView === 'date'
    ) {
      return (
        <>
          <View
            style={
              styles.modalHandle
            }
          />

          <View
            style={
              styles.modalHeaderRow
            }
          >
            <Pressable
              style={
                styles.modalBackButton
              }
              onPress={() =>
                setModalView(
                  'edit',
                )
              }
            >
              <Text
                style={
                  styles.modalBackText
                }
              >
                ‹
              </Text>
            </Pressable>

            <Text
              style={
                styles.modalTitle
              }
            >
              Exam date
            </Text>

            <View
              style={
                styles.modalHeaderSpacer
              }
            />
          </View>

          <Text
            style={
              styles.modalSubtitle
            }
          >
            Select the date of your
            examination.
          </Text>

          {renderCalendar()}

          <View
            style={
              styles.selectedDatePreview
            }
          >
            <Text
              style={
                styles.selectedDateLabel
              }
            >
              Selected date
            </Text>

            <Text
              style={
                styles.selectedDateValue
              }
            >
              {selectedDate.toLocaleDateString(
                'en-GB',
                {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                },
              )}
            </Text>
          </View>

          <Pressable
            style={
              styles.fullButton
            }
            onPress={() =>
              setModalView(
                'edit',
              )
            }
          >
            <Text
              style={
                styles.fullButtonText
              }
            >
              Done
            </Text>
          </Pressable>
        </>
      );
    }

    // =================================
    // TYPE
    // =================================

    if (
      modalView === 'type'
    ) {
      return (
        <>
          <View
            style={
              styles.modalHandle
            }
          />

          <View
            style={
              styles.modalHeaderRow
            }
          >
            <Pressable
              style={
                styles.modalBackButton
              }
              onPress={() =>
                setModalView(
                  'edit',
                )
              }
            >
              <Text
                style={
                  styles.modalBackText
                }
              >
                ‹
              </Text>
            </Pressable>

            <Text
              style={
                styles.modalTitle
              }
            >
              Exam type
            </Text>

            <View
              style={
                styles.modalHeaderSpacer
              }
            />
          </View>

          <Text
            style={
              styles.modalSubtitle
            }
          >
            Choose the type of
            examination.
          </Text>

          <ScrollView
            style={
              styles.typeList
            }
            showsVerticalScrollIndicator={
              false
            }
          >
            {examTypes.map(
              (type) => {
                const selected =
                  selectedType ===
                  type;

                return (
                  <Pressable
                    key={type}
                    style={[
                      styles.option,
                      selected &&
                        styles.optionSelected,
                    ]}
                    onPress={() => {
                      setSelectedType(
                        type,
                      );

                      setModalView(
                        'edit',
                      );
                    }}
                  >
                    <Text
                      style={[
                        styles.optionText,
                        selected &&
                          styles.optionTextSelected,
                      ]}
                    >
                      {type}
                    </Text>

                    {selected && (
                      <Text
                        style={
                          styles.check
                        }
                      >
                        ✓
                      </Text>
                    )}
                  </Pressable>
                );
              },
            )}
          </ScrollView>
        </>
      );
    }

    // =================================
    // TOPICS
    // =================================

    if (
      modalView === 'topics'
    ) {
      return (
        <>
          <View
            style={
              styles.modalHandle
            }
          />

          <View
            style={
              styles.modalHeaderRow
            }
          >
            <Pressable
              style={
                styles.modalBackButton
              }
              onPress={() => {
                if (
                  topicsReturnToEdit
                ) {
                  setModalView(
                    'edit',
                  );
                } else {
                  closeModal();
                }
              }}
            >
              <Text
                style={
                  styles.modalBackText
                }
              >
                ‹
              </Text>
            </Pressable>

            <Text
              style={
                styles.modalTitle
              }
            >
              Topics included
            </Text>

            <View
              style={
                styles.modalHeaderSpacer
              }
            />
          </View>

          <Text
            style={
              styles.modalSubtitle
            }
          >
            Select all topics that are
            part of this exam.
          </Text>

          {topics.length ===
          0 ? (
            <View
              style={
                styles.noTopicsContainer
              }
            >
              <Text
                style={
                  styles.noTopicsEmoji
                }
              >
                📚
              </Text>

              <Text
                style={
                  styles.noTopicsTitle
                }
              >
                No topics yet
              </Text>

              <Text
                style={
                  styles.noTopicsText
                }
              >
                Add topics to this subject
                before selecting them for
                the exam.
              </Text>

              <Pressable
                style={
                  styles.fullButton
                }
                onPress={() => {
                  closeModal();

                  router.push({
                    pathname:
                      '/subject/topics',

                    params: {
                      id:
                        subjectId ??
                        '',
                    },
                  });
                }}
              >
                <Text
                  style={
                    styles.fullButtonText
                  }
                >
                  Add topics
                </Text>
              </Pressable>
            </View>
          ) : (
            <>
              <ScrollView
                style={
                  styles.topicSelectionList
                }
                showsVerticalScrollIndicator={
                  false
                }
              >
                {topics.map(
                  (topic) => {
                    const selected =
                      selectedTopicIds.includes(
                        topic.id,
                      );

                    return (
                      <Pressable
                        key={topic.id}
                        style={[
                          styles.topicOption,
                          selected &&
                            styles.topicOptionSelected,
                        ]}
                        onPress={() =>
                          toggleTopic(
                            topic.id,
                          )
                        }
                      >
                        <View
                          style={[
                            styles.checkbox,
                            selected &&
                              styles.checkboxSelected,
                          ]}
                        >
                          {selected && (
                            <Text
                              style={
                                styles.checkboxCheck
                              }
                            >
                              ✓
                            </Text>
                          )}
                        </View>

                        <Text
                          style={[
                            styles.topicOptionText,
                            selected &&
                              styles.topicOptionTextSelected,
                          ]}
                        >
                          {
                            topic.name
                          }
                        </Text>
                      </Pressable>
                    );
                  },
                )}
              </ScrollView>

              <Pressable
                style={
                  styles.fullButton
                }
                onPress={
                  finishTopicsPicker
                }
              >
                <Text
                  style={
                    styles.fullButtonText
                  }
                >
                  Done
                </Text>
              </Pressable>
            </>
          )}
        </>
      );
    }

    return null;
  }

  // =================================
  // LOADING
  // =================================

  if (loading) {
    return (
      <SafeAreaView
        style={
          styles.container
        }
      >
        <Stack.Screen
          options={{
            headerShown: false,
          }}
        />

        <Text
          style={
            styles.loadingText
          }
        >
          Loading exam...
        </Text>
      </SafeAreaView>
    );
  }

  // =================================
  // MAIN SCREEN
  // =================================

  return (
    <SafeAreaView
      style={
        styles.container
      }
    >
      <Stack.Screen
        options={{
          headerShown: false,
        }}
      />

      <PullToRefreshScrollView
        onRefresh={() => loadData(false)}
        contentContainerStyle={
          styles.scrollContent
        }
        showsVerticalScrollIndicator={
          false
        }
      >
        {/* BACK */}

        <Pressable
          style={
            styles.backButton
          }
          onPress={() =>
            router.back()
          }
        >
          <Text
            style={
              styles.backText
            }
          >
            ← Back
          </Text>
        </Pressable>

        {/* HEADER */}

        <Text
          style={
            styles.title
          }
        >
          Exam
        </Text>

        <Text
          style={
            styles.subtitle
          }
        >
          {subjectName
            ? `${subjectName} exam details`
            : 'Manage your exam details.'}
        </Text>

        {/* NO EXAM */}

        {!exam ? (
          <View
            style={
              styles.noExamCard
            }
          >
            <View
              style={
                styles.noExamIcon
              }
            >
              <Text
                style={
                  styles.noExamEmoji
                }
              >
                📝
              </Text>
            </View>

            <Text
              style={
                styles.noExamTitle
              }
            >
              No exam set
            </Text>

            <Text
              style={
                styles.noExamText
              }
            >
              Add your exam date,
              exam type and the
              topics included in the
              exam.
            </Text>

            <Pressable
              style={
                styles.primaryButton
              }
              onPress={
                openEdit
              }
            >
              <Text
                style={
                  styles.primaryButtonText
                }
              >
                + Set up exam
              </Text>
            </Pressable>
          </View>
        ) : (
          <>
            {/* COUNTDOWN */}

            <View
              style={
                styles.countdownCard
              }
            >
              <Text
                style={
                  styles.countdownLabel
                }
              >
                {daysUntilExam !==
                  null &&
                daysUntilExam <
                  0
                  ? 'Exam date passed'
                  : daysUntilExam ===
                      0
                    ? 'Exam day'
                    : 'Days until exam'}
              </Text>

              <Text
                style={
                  styles.countdownNumber
                }
              >
                {daysUntilExam !==
                  null &&
                daysUntilExam >=
                  0
                  ? daysUntilExam
                  : '—'}
              </Text>

              {daysUntilExam !==
                null &&
                daysUntilExam >
                  0 && (
                  <Text
                    style={
                      styles.countdownSmall
                    }
                  >
                    days remaining
                  </Text>
                )}
            </View>

            {/* EXAM DATE */}

            <View
              style={
                styles.infoCard
              }
            >
              <View
                style={
                  styles.infoIconBox
                }
              >
                <Text
                  style={
                    styles.infoIcon
                  }
                >
                  📅
                </Text>
              </View>

              <View
                style={
                  styles.infoContent
                }
              >
                <Text
                  style={
                    styles.infoLabel
                  }
                >
                  Exam date
                </Text>

                <Text
                  style={
                    styles.infoValue
                  }
                >
                  {formatDate(
                    exam.date,
                  )}
                </Text>
              </View>
            </View>

            {/* EXAM TYPE */}

            <View
              style={
                styles.infoCard
              }
            >
              <View
                style={
                  styles.infoIconBox
                }
              >
                <Text
                  style={
                    styles.infoIcon
                  }
                >
                  📝
                </Text>
              </View>

              <View
                style={
                  styles.infoContent
                }
              >
                <Text
                  style={
                    styles.infoLabel
                  }
                >
                  Exam type
                </Text>

                <Text
                  style={
                    styles.infoValue
                  }
                >
                  {exam.type}
                </Text>
              </View>
            </View>

            {/* TOPICS INCLUDED */}

            <Pressable
              style={
                styles.infoCard
              }
              onPress={() =>
                openTopicsPicker(
                  false,
                )
              }
            >
              <View
                style={
                  styles.infoIconBox
                }
              >
                <Text
                  style={
                    styles.infoIcon
                  }
                >
                  📚
                </Text>
              </View>

              <View
                style={
                  styles.infoContent
                }
              >
                <Text
                  style={
                    styles.infoLabel
                  }
                >
                  Topics included
                </Text>

                {selectedTopicNames.length ===
                0 ? (
                  <Text
                    style={
                      styles.infoMuted
                    }
                  >
                    No topics selected
                  </Text>
                ) : (
                  <>
                    <Text
                      style={
                        styles.infoValue
                      }
                    >
                      {
                        selectedTopicNames.length
                      }{' '}
                      {selectedTopicNames.length ===
                      1
                        ? 'topic'
                        : 'topics'}
                    </Text>

                    <Text
                      style={
                        styles.topicPreview
                      }
                      numberOfLines={
                        2
                      }
                    >
                      {selectedTopicNames.join(
                        ' • ',
                      )}
                    </Text>
                  </>
                )}
              </View>

              <Text
                style={
                  styles.arrow
                }
              >
                ›
              </Text>
            </Pressable>

            {/* EDIT */}

            <Pressable
              style={
                styles.editCard
              }
              onPress={
                openEdit
              }
            >
              <Text
                style={
                  styles.editIcon
                }
              >
                ✏️
              </Text>

              <Text
                style={
                  styles.editText
                }
              >
                Edit exam
              </Text>

              <Text
                style={
                  styles.arrow
                }
              >
                ›
              </Text>
            </Pressable>

            {/* DELETE */}

            <Pressable
              style={
                styles.deleteCard
              }
              onPress={
                deleteExam
              }
            >
              <Text
                style={
                  styles.deleteIcon
                }
              >
                🗑️
              </Text>

              <Text
                style={
                  styles.deleteText
                }
              >
                Delete exam
              </Text>

              <Text
                style={
                  styles.arrowDelete
                }
              >
                ›
              </Text>
            </Pressable>
          </>
        )}
      </PullToRefreshScrollView>

      {/* =================================
          ONE SINGLE MODAL
          ================================= */}

      <Modal
        visible={
          modalView !== null
        }
        transparent
        animationType="slide"
        statusBarTranslucent={
          Platform.OS ===
          'android'
        }
        onRequestClose={() => {
          if (
            modalView ===
            'edit'
          ) {
            closeModal();
          } else if (
            modalView ===
              'date' ||
            modalView ===
              'type'
          ) {
            setModalView(
              'edit',
            );
          } else if (
            modalView ===
            'topics'
          ) {
            if (
              topicsReturnToEdit
            ) {
              setModalView(
                'edit',
              );
            } else {
              closeModal();
            }
          }
        }}
      >
        <View
          style={
            styles.modalOverlay
          }
        >
          <View
            style={
              styles.modalContainer
            }
          >
            {renderModalContent()}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// =================================
// STYLES
// =================================

const styles =
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor:
        appColor('#F7FBFE', 'background'),
    },

    scrollContent: {
      paddingHorizontal: 20,
      paddingBottom: 40,
    },

    loadingText: {
      marginTop: 40,
      textAlign: 'center',
      color: appColor('#8494A0', 'text'),
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

    title: {
      fontSize: 30,
      fontWeight: '800',
      color: appColor('#17324D', 'text'),
    },

    subtitle: {
      fontSize: 15,
      color: appColor('#7A8B99', 'text'),
      marginTop: 8,
      marginBottom: 26,
    },

    countdownCard: {
      backgroundColor:
        appColor('#DFF4FF', 'background'),
      borderRadius: 24,
      padding: 24,
      alignItems: 'center',
      marginBottom: 16,
    },

    countdownLabel: {
      fontSize: 14,
      fontWeight: '600',
      color: appColor('#56829A', 'text'),
    },

    countdownNumber: {
      fontSize: 58,
      fontWeight: '800',
      color: appColor('#318DBA', 'text'),
      marginTop: 4,
    },

    countdownSmall: {
      fontSize: 13,
      color: appColor('#6D8A9A', 'text'),
      marginTop: -4,
    },

    infoCard: {
      backgroundColor:
        appColor('#FFFFFF', 'background'),
      borderRadius: 20,
      padding: 17,
      marginBottom: 12,
      flexDirection:
        'row',
      alignItems: 'center',
    },

    infoIconBox: {
      width: 48,
      height: 48,
      borderRadius: 14,
      backgroundColor:
        appColor('#E3F5FF', 'background'),
      justifyContent:
        'center',
      alignItems:
        'center',
    },

    infoIcon: {
      fontSize: 22,
    },

    infoContent: {
      flex: 1,
      marginLeft: 14,
    },

    infoLabel: {
      fontSize: 12,
      fontWeight: '600',
      color: appColor('#8A9BA5', 'text'),
    },

    infoValue: {
      fontSize: 16,
      fontWeight: '700',
      color: appColor('#17324D', 'text'),
      marginTop: 4,
    },

    infoMuted: {
      fontSize: 14,
      color: appColor('#9AAAB5', 'text'),
      marginTop: 4,
    },

    topicPreview: {
      fontSize: 12,
      color: appColor('#7A8F9C', 'text'),
      marginTop: 5,
    },

    arrow: {
      fontSize: 28,
      fontWeight: '300',
      color: appColor('#9AB5C4', 'text'),
      marginLeft: 8,
    },

    editCard: {
      backgroundColor:
        appColor('#EAF7FD', 'background'),
      borderRadius: 18,
      padding: 17,
      marginTop: 8,
      flexDirection:
        'row',
      alignItems:
        'center',
    },

    editIcon: {
      fontSize: 19,
    },

    editText: {
      flex: 1,
      fontSize: 15,
      fontWeight: '700',
      color: appColor('#318DBA', 'text'),
      marginLeft: 12,
    },

    deleteCard: {
      backgroundColor:
        appColor('#FFF4F4', 'background'),
      borderRadius: 18,
      padding: 17,
      marginTop: 10,
      flexDirection:
        'row',
      alignItems:
        'center',
    },

    deleteIcon: {
      fontSize: 19,
    },

    deleteText: {
      flex: 1,
      fontSize: 15,
      fontWeight: '700',
      color: appColor('#D96B6B', 'text'),
      marginLeft: 12,
    },

    arrowDelete: {
      fontSize: 28,
      fontWeight: '300',
      color: appColor('#D99A9A', 'text'),
    },

    noExamCard: {
      backgroundColor:
        appColor('#FFFFFF', 'background'),
      borderRadius: 24,
      padding: 28,
      alignItems:
        'center',
      marginTop: 8,
    },

    noExamIcon: {
      width: 68,
      height: 68,
      borderRadius: 22,
      backgroundColor:
        appColor('#E3F5FF', 'background'),
      justifyContent:
        'center',
      alignItems:
        'center',
    },

    noExamEmoji: {
      fontSize: 30,
    },

    noExamTitle: {
      fontSize: 21,
      fontWeight: '800',
      color: appColor('#17324D', 'text'),
      marginTop: 18,
    },

    noExamText: {
      fontSize: 14,
      color: appColor('#8494A0', 'text'),
      textAlign:
        'center',
      lineHeight: 21,
      marginTop: 8,
    },

    primaryButton: {
      backgroundColor:
        appColor('#4AA9D8', 'background'),
      paddingHorizontal: 20,
      paddingVertical: 14,
      borderRadius: 15,
      marginTop: 20,
    },

    primaryButtonText: {
      color: appColor('#FFFFFF', 'text'),
      fontSize: 15,
      fontWeight: '700',
    },

    // =================================
    // MODAL
    // =================================

    modalOverlay: {
      flex: 1,
      backgroundColor:
        'rgba(20, 45, 65, 0.25)',
      justifyContent:
        'flex-end',
    },

    modalContainer: {
      backgroundColor:
        appColor('#FFFFFF', 'background'),
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
      padding: 24,
      paddingBottom:
        Platform.OS === 'ios'
          ? 36
          : 28,
      maxHeight: '92%',
    },

    modalHandle: {
      width: 42,
      height: 5,
      borderRadius: 3,
      backgroundColor:
        appColor('#D8E2E8', 'background'),
      alignSelf:
        'center',
      marginBottom: 22,
    },

    modalHeaderRow: {
      flexDirection:
        'row',
      alignItems:
        'center',
      justifyContent:
        'space-between',
    },

    modalBackButton: {
      width: 40,
      height: 40,
      borderRadius: 14,
      backgroundColor:
        appColor('#F2F7F9', 'background'),
      alignItems:
        'center',
      justifyContent:
        'center',
    },

    modalBackText: {
      fontSize: 32,
      lineHeight: 32,
      color: appColor('#4AA9D8', 'text'),
      fontWeight: '400',
      marginTop: -3,
    },

    modalHeaderSpacer: {
      width: 40,
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
      marginBottom: 18,
    },

    settingRow: {
      backgroundColor:
        appColor('#F5F9FB', 'background'),
      borderRadius: 16,
      padding: 16,
      marginTop: 10,
      flexDirection:
        'row',
      alignItems:
        'center',
    },

    settingContent: {
      flex: 1,
    },

    settingLabel: {
      fontSize: 12,
      fontWeight: '600',
      color: appColor('#8A9BA5', 'text'),
    },

    settingValue: {
      fontSize: 16,
      fontWeight: '700',
      color: appColor('#17324D', 'text'),
      marginTop: 4,
    },

    settingArrow: {
      fontSize: 25,
      color: appColor('#9AB5C4', 'text'),
    },

    modalButtons: {
      flexDirection:
        'row',
      marginTop: 20,
    },

    cancelButton: {
      flex: 1,
      backgroundColor:
        appColor('#F2F6F8', 'background'),
      paddingVertical: 14,
      borderRadius: 15,
      alignItems:
        'center',
      marginRight: 6,
    },

    cancelButtonText: {
      fontSize: 14,
      fontWeight: '700',
      color: appColor('#718592', 'text'),
    },

    saveButton: {
      flex: 1,
      backgroundColor:
        appColor('#4AA9D8', 'background'),
      paddingVertical: 14,
      borderRadius: 15,
      alignItems:
        'center',
      marginLeft: 6,
    },

    saveButtonText: {
      fontSize: 14,
      fontWeight: '700',
      color: appColor('#FFFFFF', 'text'),
    },

    // =================================
    // CALENDAR
    // =================================

    calendar: {
      backgroundColor:
        appColor('#F7FBFD', 'background'),
      borderRadius: 20,
      padding: 16,
      marginTop: 4,
    },

    calendarHeader: {
      flexDirection:
        'row',
      alignItems:
        'center',
      justifyContent:
        'space-between',
      marginBottom: 18,
    },

    calendarMonthTitle: {
      fontSize: 17,
      fontWeight: '800',
      color: appColor('#17324D', 'text'),
    },

    monthArrow: {
      width: 40,
      height: 40,
      borderRadius: 13,
      backgroundColor:
        appColor('#E3F5FF', 'background'),
      alignItems:
        'center',
      justifyContent:
        'center',
    },

    monthArrowText: {
      fontSize: 30,
      lineHeight: 30,
      color: appColor('#4AA9D8', 'text'),
      marginTop: -3,
    },

    weekdayRow: {
      flexDirection:
        'row',
      marginBottom: 8,
    },

    weekdayCell: {
      width: '14.2857%',
      alignItems:
        'center',
    },

    weekdayText: {
      fontSize: 12,
      fontWeight: '700',
      color: appColor('#8A9BA5', 'text'),
    },

    daysGrid: {
      flexDirection:
        'row',
      flexWrap:
        'wrap',
    },

    dayCell: {
      width: '14.2857%',
      height: 44,
      alignItems:
        'center',
      justifyContent:
        'center',
      borderRadius: 12,
      marginBottom: 3,
    },

    dayText: {
      fontSize: 15,
      fontWeight: '600',
      color: appColor('#526775', 'text'),
    },

    selectedDay: {
      backgroundColor:
        appColor('#4AA9D8', 'background'),
    },

    selectedDayText: {
      color: appColor('#FFFFFF', 'text'),
      fontWeight: '800',
    },

    todayText: {
      color: appColor('#318DBA', 'text'),
      fontWeight: '800',
    },

    selectedDatePreview: {
      backgroundColor:
        appColor('#EAF7FD', 'background'),
      borderRadius: 16,
      padding: 14,
      marginTop: 14,
      flexDirection:
        'row',
      alignItems:
        'center',
      justifyContent:
        'space-between',
    },

    selectedDateLabel: {
      fontSize: 12,
      fontWeight: '600',
      color: appColor('#718592', 'text'),
    },

    selectedDateValue: {
      fontSize: 14,
      fontWeight: '800',
      color: appColor('#318DBA', 'text'),
    },

    // =================================
    // BUTTON
    // =================================

    fullButton: {
      backgroundColor:
        appColor('#4AA9D8', 'background'),
      borderRadius: 16,
      paddingVertical: 15,
      alignItems:
        'center',
      marginTop: 18,
    },

    fullButtonText: {
      color: appColor('#FFFFFF', 'text'),
      fontSize: 15,
      fontWeight: '700',
    },

    // =================================
    // TYPE
    // =================================

    typeList: {
      maxHeight: 360,
    },

    option: {
      backgroundColor:
        appColor('#F5F9FB', 'background'),
      borderRadius: 15,
      padding: 16,
      marginBottom: 9,
      flexDirection:
        'row',
      alignItems:
        'center',
    },

    optionSelected: {
      backgroundColor:
        appColor('#E3F5FF', 'background'),
    },

    optionText: {
      flex: 1,
      fontSize: 15,
      fontWeight: '600',
      color: appColor('#526775', 'text'),
    },

    optionTextSelected: {
      color: appColor('#318DBA', 'text'),
    },

    check: {
      fontSize: 20,
      fontWeight: '800',
      color: appColor('#318DBA', 'text'),
    },

    // =================================
    // TOPICS
    // =================================

    topicSelectionList: {
      marginTop: 4,
      maxHeight: 350,
    },

    topicOption: {
      backgroundColor:
        appColor('#F5F9FB', 'background'),
      borderRadius: 15,
      padding: 15,
      marginBottom: 9,
      flexDirection:
        'row',
      alignItems:
        'center',
    },

    topicOptionSelected: {
      backgroundColor:
        appColor('#E3F5FF', 'background'),
    },

    checkbox: {
      width: 25,
      height: 25,
      borderRadius: 8,
      borderWidth: 2,
      borderColor:
        appColor('#C7D8E1', 'border'),
      justifyContent:
        'center',
      alignItems:
        'center',
    },

    checkboxSelected: {
      backgroundColor:
        appColor('#4AA9D8', 'background'),
      borderColor:
        appColor('#4AA9D8', 'border'),
    },

    checkboxCheck: {
      color: appColor('#FFFFFF', 'text'),
      fontSize: 15,
      fontWeight: '800',
    },

    topicOptionText: {
      flex: 1,
      fontSize: 15,
      fontWeight: '600',
      color: appColor('#526775', 'text'),
      marginLeft: 12,
    },

    topicOptionTextSelected: {
      color: appColor('#318DBA', 'text'),
      fontWeight: '700',
    },

    noTopicsContainer: {
      alignItems:
        'center',
      paddingVertical: 20,
    },

    noTopicsEmoji: {
      fontSize: 38,
    },

    noTopicsTitle: {
      fontSize: 19,
      fontWeight: '800',
      color: appColor('#17324D', 'text'),
      marginTop: 12,
    },

    noTopicsText: {
      fontSize: 14,
      color: appColor('#8494A0', 'text'),
      textAlign:
        'center',
      lineHeight: 21,
      marginTop: 7,
    },
  });
