import { cardShadow } from '@/components/gloss';
import { IconChip } from '@/components/study/icon-chip';
import { ProgressBar } from '@/components/charts';
import { ink, p, useProgressPalette } from '@/components/progress/theme';
import PullToRefreshScrollView from '@/components/pull-to-refresh-scroll-view';
import { Chips, ScreenBar, studyStyles } from '@/components/study/study-ui';
import { TopicNotesField, useTopicNotes } from '@/components/study/topic-notes';
import { StudyIcon } from '@/components/study-icon';
import { appColor } from '@/constants/adaptive-color';
import { ui } from '@/constants/ui';
import { useStudyData } from '@/hooks/use-study-data';
import { adjustAdaptiveDifficulty, getInitialAdaptiveDifficulty, selectAdaptiveQuestionIndex, type QuizDifficulty } from '@/services/adaptive-quiz';
import { generateAIQuiz } from '@/services/ai-api';
import { useAppSettings } from '@/services/app-settings-context';
import { formatCountdown, missedToRecallQuestions, summarizeQuizHistory } from '@/services/quiz-session';
import {
  addGeneratedQuizForTopic, getActiveRecallQuestionsForTopic, getAIPreferences, getGeneratedQuizzesByTopic, getLatestGeneratedQuizForTopic,
  saveActiveRecallQuestionsForTopic, saveQuizSession,
} from '@/services/storage';
import { calculateTopicMastery } from '@/services/topic-mastery';
import type { GeneratedQuizSet, QuizResult, StudyActivity } from '@/types/study';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const param = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] ?? '' : value ?? '');
const COUNT_CHOICES = [5, 10, 20, 30, 50];
const TIME_CHOICES = ['0', '10', '20', '30'] as const;
const CORRECT = '#0CA30C';
const WRONG = '#D03B3B';

type Phase = 'home' | 'active' | 'finished';
type QuizMode = 'standard' | 'adaptive';
type TimeChoice = (typeof TIME_CHOICES)[number];
type QuizAttempt = { index: number; question: string; selectedAnswer: string | null; correctAnswer: string; explanation: string; correct: boolean };
type QuizSavePayload = { result: QuizResult; activity: StudyActivity };

/**
 * A topic's multiple-choice quiz: the latest quiz and earlier results, the
 * attempt itself (with an optional time limit), and the result with every
 * missed question explained.
 */
export default function QuizScreen() {
  const params = useLocalSearchParams<{ id?: string | string[]; name?: string | string[]; subjectId?: string | string[] }>();
  const topicId = param(params.id);
  const { preferences } = useAppSettings();
  const language = preferences.language;
  const L = (en: string, no: string) => (language === 'no' ? no : en);
  const palette = useProgressPalette();
  const { data, metrics, reload } = useStudyData();

  const topic = metrics?.topics.find((item) => String(item.id) === topicId);
  const topicName = topic?.name ?? (param(params.name) || L('Topic', 'Tema'));
  const subjectId = topic?.subjectId ? String(topic.subjectId) : param(params.subjectId);
  const subjectName = topic?.subjectName ?? '';
  const topicResults = (data?.quizResults ?? []).filter((result) => String(result.topicId) === topicId);
  const history = summarizeQuizHistory(topicResults, topicId);
  const quizProgress = topic ? calculateTopicMastery({ ...topic, daysSinceLastStudy: topic.daysSinceStudy }).parts.quiz : 0;

  const [quiz, setQuiz] = useState<GeneratedQuizSet | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [phase, setPhase] = useState<Phase>('home');
  const phaseRef = useRef<Phase>('home');

  // The attempt.
  const [order, setOrder] = useState<number[]>([]);
  const [adaptiveSession, setAdaptiveSession] = useState(false);
  const [adaptiveDifficulty, setAdaptiveDifficulty] = useState<QuizDifficulty>('medium');
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [checked, setChecked] = useState(false);
  const [score, setScore] = useState(0);
  const [attempts, setAttempts] = useState<QuizAttempt[]>([]);
  const [sessionTotal, setSessionTotal] = useState(0);
  const [durationMinutes, setDurationMinutes] = useState(0);
  const startedAt = useRef(0);
  const completionStarted = useRef(false);

  // Optional time limit.
  const [timeLimit, setTimeLimit] = useState<TimeChoice>('0');
  const [timerEndsAt, setTimerEndsAt] = useState<number | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
  const [timeExpired, setTimeExpired] = useState(false);

  // Saving the result.
  const [savePayload, setSavePayload] = useState<QuizSavePayload | null>(null);
  const [saveError, setSaveError] = useState(false);
  const [savedToProgress, setSavedToProgress] = useState(false);
  const [addingRecall, setAddingRecall] = useState(false);
  const [recallAdded, setRecallAdded] = useState<number | null>(null);

  // Making a new quiz with AI.
  const [setupVisible, setSetupVisible] = useState(false);
  const [count, setCount] = useState(10);
  const [setupMode, setSetupMode] = useState<QuizMode>('standard');
  const [aiEnabled, setAIEnabled] = useState(true);
  const [aiDifficulty, setAIDifficulty] = useState<QuizDifficulty>('medium');
  const [explanationStyle, setExplanationStyle] = useState<'short' | 'balanced' | 'detailed'>('balanced');
  const topicNotes = useTopicNotes(topicId);
  const [busy, setBusy] = useState(false);
  const [generated, setGenerated] = useState(0);
  const [setupError, setSetupError] = useState('');

  function goTo(next: Phase) {
    phaseRef.current = next;
    setPhase(next);
  }

  const loadQuiz = useCallback(async () => {
    try {
      const saved = await getLatestGeneratedQuizForTopic(topicId);
      // An attempt in progress keeps its questions.
      if (phaseRef.current === 'home') setQuiz(saved?.questions?.length ? saved : null);
    } catch (error) {
      console.warn('Could not load the saved quiz:', error);
    } finally {
      setLoaded(true);
    }
  }, [topicId]);

  useEffect(() => {
    let active = true;
    void loadQuiz();
    void getAIPreferences().then((prefs) => {
      if (!active) return;
      setCount(prefs.questionCount);
      setAIEnabled(prefs.generateQuizzes);
      setAIDifficulty(prefs.difficulty);
      setExplanationStyle(prefs.explanationStyle);
    });
    return () => { active = false; };
  }, [loadQuiz]);

  const questions = quiz?.questions ?? [];
  const question = questions[order[index]];
  const total = sessionTotal;

  function start(only?: number[]) {
    if (!quiz) return;
    const adaptive = !only && quiz.mode === 'adaptive';
    const firstDifficulty = adaptive ? getInitialAdaptiveDifficulty(topicResults) : 'medium';
    const first = adaptive ? selectAdaptiveQuestionIndex(quiz.questions, [], firstDifficulty) : null;
    const nextOrder = only ?? (adaptive ? [first ?? 0] : quiz.questions.map((_, questionIndex) => questionIndex));
    setOrder(nextOrder);
    setSessionTotal(only ? only.length : quiz.questions.length);
    setAdaptiveSession(adaptive);
    setAdaptiveDifficulty(firstDifficulty);
    setIndex(0); setSelected(null); setChecked(false); setScore(0); setAttempts([]);
    setSavePayload(null); setSaveError(false); setSavedToProgress(false); setRecallAdded(null); setTimeExpired(false);
    completionStarted.current = false;
    startedAt.current = Date.now();
    const minutes = Number(timeLimit);
    setRemainingSeconds(minutes > 0 ? minutes * 60 : null);
    setTimerEndsAt(minutes > 0 ? Date.now() + minutes * 60_000 : null);
    goTo('active');
  }

  function backToHome() {
    setTimerEndsAt(null);
    setRemainingSeconds(null);
    goTo('home');
    void loadQuiz();
  }

  function currentAttempt(): QuizAttempt | null {
    if (!question || selected === null) return null;
    const answer = question.options[selected];
    return { index: order[index], question: question.question, selectedAnswer: answer, correctAnswer: question.correctAnswer, explanation: question.explanation ?? '', correct: answer === question.correctAnswer };
  }

  async function completeQuiz(finalScore: number, finalAttempts: QuizAttempt[], timedOut = false) {
    if (completionStarted.current) return;
    completionStarted.current = true;
    setTimerEndsAt(null);
    setRemainingSeconds(null);
    setTimeExpired(timedOut);
    const completedAt = new Date().toISOString();
    const durationSeconds = Math.max(1, Math.round((Date.now() - (startedAt.current || Date.now())) / 1000));
    const answeredCount = finalAttempts.length;
    const missed = finalAttempts.filter((attempt) => !attempt.correct && attempt.selectedAnswer !== null);
    const result: QuizResult = {
      id: `result-${Date.now()}-${topicId}`, topicId, topicName, completedAt, questionCount: answeredCount,
      correctCount: finalScore, wrongCount: missed.length,
      score: answeredCount ? Math.round((finalScore / answeredCount) * 100) : 0, durationSeconds, answeredCount,
      missedQuestions: missed.map((attempt) => ({ question: attempt.question, selectedAnswer: attempt.selectedAnswer ?? '', correctAnswer: attempt.correctAnswer, explanation: attempt.explanation })),
    };
    const activity: StudyActivity = {
      id: Date.now(), topicId, topicName, activity: 'quiz', completedAt, durationSeconds,
      questionCount: answeredCount, correctCount: finalScore, wrongCount: missed.length, score: result.score,
    };
    setAttempts(finalAttempts);
    setScore(finalScore);
    setDurationMinutes(Math.max(1, Math.round(durationSeconds / 60)));
    setSavePayload({ result, activity });
    try {
      await saveQuizSession(result, activity);
      setSavedToProgress(true);
    } catch (error) {
      console.warn('Could not save the quiz result:', error);
      setSaveError(true);
    }
    goTo('finished');
  }

  async function retrySave() {
    if (!savePayload) return;
    try {
      await saveQuizSession(savePayload.result, savePayload.activity);
      setSavedToProgress(true);
      setSaveError(false);
    } catch {
      setSaveError(true);
      Alert.alert(L('Still unable to save', 'Kunne fortsatt ikke lagre'), L('Keep this screen open and try again in a moment.', 'La denne siden stå åpen og prøv igjen om litt.'));
    }
  }

  // The countdown reads the newest answer state through a ref, so it keeps one steady interval.
  const latest = useRef({ score, attempts, currentAttempt, completeQuiz });
  useEffect(() => { latest.current = { score, attempts, currentAttempt, completeQuiz }; });

  useEffect(() => {
    if (timerEndsAt === null || phase !== 'active') return;
    const tick = () => {
      const seconds = Math.max(0, Math.ceil((timerEndsAt - Date.now()) / 1000));
      setRemainingSeconds(seconds);
      if (seconds > 0) return;
      const state = latest.current;
      const last = state.currentAttempt();
      void state.completeQuiz(state.score + (last?.correct ? 1 : 0), last ? [...state.attempts, last] : state.attempts, true);
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [timerEndsAt, phase]);

  async function next() {
    const attempt = currentAttempt();
    if (!attempt) return;
    const nextScore = score + (attempt.correct ? 1 : 0);
    const nextAttempts = [...attempts, attempt];
    if (index >= total - 1) {
      await completeQuiz(nextScore, nextAttempts);
      return;
    }
    if (adaptiveSession) {
      const nextDifficulty = adjustAdaptiveDifficulty(adaptiveDifficulty, attempt.correct);
      const nextIndex = selectAdaptiveQuestionIndex(questions, order, nextDifficulty);
      if (nextIndex === null) {
        await completeQuiz(nextScore, nextAttempts);
        return;
      }
      setOrder((current) => [...current, nextIndex]);
      setAdaptiveDifficulty(nextDifficulty);
    }
    setAttempts(nextAttempts);
    setScore(nextScore);
    setIndex((value) => value + 1);
    setSelected(null);
    setChecked(false);
  }

  function closeAttempt() {
    const answered = attempts.length + (checked ? 1 : 0);
    if (answered === 0) { backToHome(); return; }
    Alert.alert(
      L('End the quiz?', 'Avslutte quizen?'),
      L(`You have answered ${answered} of ${total} questions.`, `Du har svart på ${answered} av ${total} spørsmål.`),
      [
        { text: L('Keep going', 'Fortsett'), style: 'cancel' },
        {
          text: L('Finish and save', 'Avslutt og lagre'),
          onPress: () => {
            const last = checked ? currentAttempt() : null;
            void completeQuiz(score + (last?.correct ? 1 : 0), last ? [...attempts, last] : attempts);
          },
        },
        { text: L('Discard', 'Forkast'), style: 'destructive', onPress: backToHome },
      ],
    );
  }

  const missed = attempts.filter((attempt) => !attempt.correct && attempt.selectedAnswer !== null);

  async function addMissedToRecall() {
    if (addingRecall || missed.length === 0) return;
    setAddingRecall(true);
    try {
      const existing = await getActiveRecallQuestionsForTopic(topicId);
      const additions = missedToRecallQuestions(missed, existing);
      if (additions.length) await saveActiveRecallQuestionsForTopic(topicId, [...existing, ...additions]);
      setRecallAdded(additions.length);
    } catch (error) {
      console.warn('Could not add missed questions to Active Recall:', error);
      Alert.alert(L('Could not save', 'Kunne ikke lagre'), L('The questions were not added. Try again.', 'Spørsmålene ble ikke lagt til. Prøv igjen.'));
    } finally {
      setAddingRecall(false);
    }
  }

  function openSetup() {
    if (!aiEnabled) {
      Alert.alert(L('AI quizzes are off', 'AI-quizer er slått av'), L('Turn on quiz generation in Settings, under AI preferences, to create a new quiz.', 'Slå på quizgenerering i Innstillinger, under AI-preferanser, for å lage en ny quiz.'));
      return;
    }
    setSetupError('');
    setSetupMode(quiz?.mode ?? 'standard');
    void topicNotes.load();
    setSetupVisible(true);
  }

  async function generateQuiz() {
    if (busy) return;
    setBusy(true);
    setGenerated(0);
    setSetupError('');
    try {
      const material = await topicNotes.save();
      const [quizHistory, recallQuestions] = await Promise.all([getGeneratedQuizzesByTopic(), getActiveRecallQuestionsForTopic(topicId)]);
      const recent = [...topicResults].sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime()).slice(0, 5);
      const recentQuestions = recent.reduce((sum, result) => sum + Math.max(0, result.questionCount), 0);
      const recentCorrect = recent.reduce((sum, result) => sum + Math.max(0, result.correctCount), 0);
      const recentMissed = recent.flatMap((result) => result.missedQuestions ?? []).slice(0, 8);
      const struggledRecall = recallQuestions.reduce((sum, item) => sum + (item.againCount ?? 0) + (item.hardCount ?? 0), 0);
      const earlier = (quizHistory[topicId] ?? []).flatMap((set) => set.questions.map((item) => item.question));
      const previousQuestions = [...earlier, ...recentMissed.map((item) => item.question)].slice(-40);
      const context: string[] = [];
      if (recent.length) context.push(`Recent quiz accuracy based on ${recent.length} recent quiz${recent.length === 1 ? '' : 'zes'}: ${recentQuestions ? Math.round((recentCorrect / recentQuestions) * 100) : 0}% (${recentCorrect}/${recentQuestions}).`);
      if (recentMissed.length) context.push(`Recent missed quiz questions to revisit: ${recentMissed.map((item) => item.question).join(' | ').slice(0, 540)}.`);
      if (struggledRecall) context.push(`${struggledRecall} saved Active Recall ratings are Again or Hard; prioritize related foundational concepts.`);

      const created = await generateAIQuiz({
        subjectName: subjectName || 'Medical studies', topicName, questionCount: count, sourceMaterial: material || undefined,
        previousQuestions, struggleSummary: context.join(' ').slice(0, 1_000) || undefined,
        difficulty: aiDifficulty, adaptive: setupMode === 'adaptive', explanationStyle, onProgress: setGenerated,
      });
      const next: GeneratedQuizSet = {
        id: `quiz-${Date.now()}`, topicId, topicName, subjectId, subjectName: subjectName || 'Medical studies',
        generatedAt: new Date().toISOString(), mode: setupMode, questions: created,
      };
      await addGeneratedQuizForTopic(next);
      setTimerEndsAt(null);
      setRemainingSeconds(null);
      goTo('home');
      setQuiz(next);
      setSetupVisible(false);
    } catch (error) {
      setSetupError(error instanceof Error ? error.message : L('The quiz could not be created. Try again.', 'Quizen kunne ikke lages. Prøv igjen.'));
    } finally {
      setBusy(false);
    }
  }

  const difficultyLabel: Record<QuizDifficulty, string> = { easy: L('Easy', 'Lett'), medium: L('Medium', 'Middels'), hard: L('Hard', 'Vanskelig') };
  const locale = language === 'no' ? 'nb-NO' : 'en-GB';

  const setup = (
    <Modal visible={setupVisible} transparent animationType="slide" onRequestClose={() => { if (!busy) setSetupVisible(false); }}>
      <KeyboardAvoidingView style={styles.modalKeyboard} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={ui.modalBackdrop}>
          <ScrollView style={styles.modalMax} contentContainerStyle={styles.modalScroll} keyboardShouldPersistTaps="handled" keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'} automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}>
            <View style={ui.modalCard}>
              <View style={ui.modalHeader}>
                <View style={ui.modalIcon}><StudyIcon name="sparkles" size={18} color={palette.accent} /></View>
                <View style={ui.grow}>
                  <Text style={ui.modalTitle}>{L('New quiz with AI', 'Ny quiz med AI')}</Text>
                  <Text style={ui.cardDescription} numberOfLines={1}>{[topicName, subjectName].filter(Boolean).join(' · ')}</Text>
                </View>
              </View>

              <Text style={ui.fieldLabel}>{L('HOW MANY QUESTIONS', 'ANTALL SPØRSMÅL')}</Text>
              <Chips value={String(count)} onChange={(value) => setCount(Number(value))} items={COUNT_CHOICES.map((value) => ({ key: String(value), label: String(value) }))} />

              <Text style={ui.fieldLabel}>{L('QUIZ TYPE', 'TYPE QUIZ')}</Text>
              <Chips<QuizMode> value={setupMode} onChange={setSetupMode} items={[{ key: 'standard', label: L('Standard', 'Standard') }, { key: 'adaptive', label: L('Adaptive', 'Adaptiv') }]} />
              <Text style={p.small}>{setupMode === 'adaptive'
                ? L('Starts at your level and gets harder or easier after each answer.', 'Starter på ditt nivå og blir vanskeligere eller lettere etter hvert svar.')
                : L('All questions at the level you choose, in a fixed order.', 'Alle spørsmål på nivået du velger, i fast rekkefølge.')}</Text>

              {setupMode === 'standard' ? (
                <>
                  <Text style={ui.fieldLabel}>{L('DIFFICULTY', 'VANSKELIGHETSGRAD')}</Text>
                  <Chips<QuizDifficulty> value={aiDifficulty} onChange={setAIDifficulty} items={(['easy', 'medium', 'hard'] as const).map((level) => ({ key: level, label: difficultyLabel[level] }))} />
                </>
              ) : null}

              <TopicNotesField state={topicNotes} disabled={busy} />
              <Text style={p.small}>{L('AI also looks at what you missed before. Always check questions and explanations against your course material.', 'AI ser også på hva du har bommet på før. Sjekk alltid spørsmål og forklaringer mot pensum.')}</Text>

              {busy ? <View style={styles.inline}><ActivityIndicator color={palette.accent} /><Text style={p.body}>{L(`Creating ${generated} of ${count} questions`, `Lager ${generated} av ${count} spørsmål`)}</Text></View> : null}
              {setupError ? <Text style={ui.formError}>{setupError}</Text> : null}
              <View style={ui.modalActions}>
                <Pressable accessibilityRole="button" style={ui.secondaryButton} onPress={() => { setSetupVisible(false); void topicNotes.load(); }} disabled={busy}><Text style={ui.secondaryButtonText}>{L('Cancel', 'Avbryt')}</Text></Pressable>
                <Pressable accessibilityRole="button" style={[ui.primaryButton, busy && ui.disabled]} onPress={() => { void generateQuiz(); }} disabled={busy}>
                  <Text style={ui.primaryButtonText}>{L('Create quiz', 'Lag quiz')}</Text>
                </Pressable>
              </View>
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );

  // ----- Attempt in progress -----
  if (phase === 'active' && question) {
    const picked = selected !== null ? question.options[selected] : null;
    const wasCorrect = picked === question.correctAnswer;
    const urgent = remainingSeconds !== null && remainingSeconds < 60;
    return (
      <SafeAreaView style={ui.container} edges={['top', 'bottom']}>
        <Stack.Screen options={{ headerShown: false, gestureEnabled: false }} />
        <View style={styles.page}>
          <View style={styles.bar}>
            <Pressable accessibilityRole="button" accessibilityLabel={L('End quiz', 'Avslutt quiz')} onPress={closeAttempt} style={({ pressed }) => [styles.barButton, pressed && p.pressed]} hitSlop={8}>
              <StudyIcon name="x" size={18} color={ink.secondary} />
            </Pressable>
            {remainingSeconds !== null ? (
              <View style={styles.timer} accessibilityLabel={`${L('Time left', 'Tid igjen')} ${formatCountdown(remainingSeconds)}`}>
                <StudyIcon name="timer" size={15} color={urgent ? WRONG : ink.secondary} />
                <Text style={[styles.timerText, urgent && { color: WRONG }]}>{formatCountdown(remainingSeconds)}</Text>
              </View>
            ) : <Text style={styles.barTitle} numberOfLines={1}>{topicName}</Text>}
            <View style={styles.barButton} />
          </View>

          <View style={styles.progress}>
            <View style={styles.progressTop}>
              <Text style={p.small}>{L('Question', 'Spørsmål')} {index + 1} {L('of', 'av')} {total}</Text>
              {adaptiveSession ? <Text style={p.chip}>{L('Adaptive', 'Adaptiv')} · {difficultyLabel[adaptiveDifficulty]}</Text> : null}
            </View>
            <ProgressBar value={(index / Math.max(total, 1)) * 100} color={palette.accent} trackColor={palette.track} height={6} />
          </View>

          <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
            <Text style={styles.question} accessibilityRole="header">{question.question}</Text>
            {question.options.map((option, optionIndex) => {
              const isSelected = selected === optionIndex;
              const isCorrect = checked && option === question.correctAnswer;
              const isWrong = checked && isSelected && !isCorrect;
              const mark = isCorrect ? CORRECT : isWrong ? WRONG : isSelected ? palette.accent : undefined;
              return (
                <Pressable
                  key={`${optionIndex}-${option}`}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: isSelected, disabled: checked }}
                  accessibilityLabel={`${String.fromCharCode(65 + optionIndex)}. ${option}${isCorrect ? `. ${L('Correct answer', 'Riktig svar')}` : isWrong ? `. ${L('Your answer, wrong', 'Ditt svar, feil')}` : ''}`}
                  disabled={checked}
                  onPress={() => setSelected(optionIndex)}
                  style={({ pressed }) => [styles.option, mark ? { borderColor: mark, borderWidth: 2, padding: 13 } : null, pressed && p.pressed]}
                >
                  <View style={[styles.letter, mark ? { backgroundColor: mark } : null]}>
                    {isCorrect ? <StudyIcon name="check" size={14} color="#FFFFFF" /> : isWrong ? <StudyIcon name="x" size={14} color="#FFFFFF" /> : <Text style={[styles.letterText, isSelected && styles.letterTextOn]}>{String.fromCharCode(65 + optionIndex)}</Text>}
                  </View>
                  <Text style={styles.optionText}>{option}</Text>
                </Pressable>
              );
            })}
            {checked ? (
              <View style={[p.inset, styles.explanation]}>
                <View style={styles.inline}>
                  <StudyIcon name={wasCorrect ? 'check' : 'x'} size={15} color={wasCorrect ? CORRECT : WRONG} />
                  <Text style={styles.explanationTitle}>{wasCorrect ? L('Correct', 'Riktig') : L('Not quite', 'Ikke helt')}</Text>
                </View>
                {!wasCorrect ? <Text style={styles.explanationAnswer}>{L('Correct answer:', 'Riktig svar:')} {question.correctAnswer}</Text> : null}
                {question.explanation ? <Text style={p.body}>{question.explanation}</Text> : null}
              </View>
            ) : null}
          </ScrollView>

          <View style={styles.footer}>
            {!checked ? (
              <Pressable accessibilityRole="button" disabled={selected === null} onPress={() => setChecked(true)} style={({ pressed }) => [p.button, styles.big, { backgroundColor: palette.accent }, selected === null && ui.disabled, pressed && p.pressed]}>
                <Text style={styles.bigText}>{L('Check answer', 'Sjekk svaret')}</Text>
              </Pressable>
            ) : (
              <Pressable accessibilityRole="button" onPress={() => { void next(); }} style={({ pressed }) => [p.button, styles.big, { backgroundColor: palette.accent }, pressed && p.pressed]}>
                <Text style={styles.bigText}>{index >= total - 1 ? L('See result', 'Se resultatet') : L('Next question', 'Neste spørsmål')}</Text>
              </Pressable>
            )}
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // ----- Result -----
  if (phase === 'finished') {
    const answered = attempts.length;
    const percent = answered ? Math.round((score / answered) * 100) : 0;
    const unanswered = Math.max(0, total - answered);
    const stats = [
      { label: L('Correct', 'Riktige'), value: score },
      { label: L('Wrong', 'Feil'), value: missed.length },
      { label: L('Unanswered', 'Ubesvart'), value: unanswered },
      { label: L('Minutes', 'Minutter'), value: durationMinutes },
    ];
    return (
      <SafeAreaView style={ui.container} edges={['top', 'bottom']}>
        <Stack.Screen options={{ headerShown: false, gestureEnabled: true }} />
        <View style={styles.page}>
          <View style={styles.bar}>
            <Pressable accessibilityRole="button" accessibilityLabel={L('Close', 'Lukk')} onPress={backToHome} style={({ pressed }) => [styles.barButton, pressed && p.pressed]} hitSlop={8}>
              <StudyIcon name="x" size={18} color={ink.secondary} />
            </Pressable>
            <Text style={styles.barTitle} numberOfLines={1}>{topicName}</Text>
            <View style={styles.barButton} />
          </View>
          <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
            <View style={[p.card, styles.doneCard]}>
              <View style={[styles.doneIcon, { backgroundColor: palette.accent }]}><StudyIcon name={timeExpired ? 'timer' : 'check'} size={26} color="#FFFFFF" /></View>
              <Text style={styles.doneTitle}>{timeExpired ? L('Time is up', 'Tiden er ute') : L('Quiz complete', 'Quizen er fullført')}</Text>
              <Text style={styles.score}>{percent}%</Text>
              <Text style={[p.body, styles.centered]}>{L(`${score} of ${answered} answered questions correct`, `${score} av ${answered} besvarte spørsmål riktig`)}</Text>
              <View style={styles.stats}>
                {stats.map((item) => (
                  <View key={item.label} style={styles.stat}><Text style={styles.statValue}>{item.value}</Text><Text style={styles.statLabel} numberOfLines={1}>{item.label}</Text></View>
                ))}
              </View>
              <Text style={[p.small, styles.centered]}>{savedToProgress
                ? L('Saved to Progress.', 'Lagret i Fremgang.')
                : L('The result has not been saved to Progress yet.', 'Resultatet er ikke lagret i Fremgang ennå.')}</Text>
              {saveError ? (
                <Pressable accessibilityRole="button" onPress={() => { void retrySave(); }} style={({ pressed }) => [p.outlineButton, styles.wide, pressed && p.pressed]}>
                  <Text style={p.outlineButtonText}>{L('Try saving again', 'Prøv å lagre igjen')}</Text>
                </Pressable>
              ) : null}
            </View>

            {missed.length ? (
              <>
                <Text style={styles.sectionTitle}>{L('Questions you missed', 'Spørsmål du bommet på')}</Text>
                {missed.map((attempt, missedIndex) => (
                  <View key={`${missedIndex}-${attempt.index}`} style={[p.card, styles.missed]}>
                    <Text style={styles.missedQuestion}>{attempt.question}</Text>
                    <View style={styles.answerRow}><StudyIcon name="x" size={13} color={WRONG} /><Text style={[p.body, p.grow]}>{L('Your answer:', 'Ditt svar:')} {attempt.selectedAnswer}</Text></View>
                    <View style={styles.answerRow}><StudyIcon name="check" size={13} color={CORRECT} /><Text style={[styles.correctText, p.grow]}>{L('Correct answer:', 'Riktig svar:')} {attempt.correctAnswer}</Text></View>
                    {attempt.explanation ? <Text style={p.small}>{attempt.explanation}</Text> : null}
                  </View>
                ))}
                <Pressable accessibilityRole="button" onPress={() => start(missed.map((attempt) => attempt.index))} style={({ pressed }) => [p.button, styles.wide, styles.buttonRow, { backgroundColor: palette.accent }, pressed && p.pressed]}>
                  <StudyIcon name="undo" size={15} color="#FFFFFF" /><Text style={p.buttonText}>{L(`Retry the ${missed.length} you missed`, `Prøv de ${missed.length} du bommet på igjen`)}</Text>
                </Pressable>
                {recallAdded === null ? (
                  <Pressable accessibilityRole="button" disabled={addingRecall} onPress={() => { void addMissedToRecall(); }} style={({ pressed }) => [p.outlineButton, styles.wide, styles.buttonRow, (pressed || addingRecall) && p.pressed]}>
                    <StudyIcon name="brain" size={15} color={palette.accent} /><Text style={p.outlineButtonText}>{L('Save them as Active Recall questions', 'Lagre dem som Active Recall-spørsmål')}</Text>
                  </Pressable>
                ) : (
                  <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/subject/topic/study/active-recall', params: { id: topicId, name: topicName, subjectId } })} style={({ pressed }) => [p.outlineButton, styles.wide, styles.buttonRow, pressed && p.pressed]}>
                    <StudyIcon name="check" size={15} color={palette.accent} />
                    <Text style={p.outlineButtonText}>{recallAdded > 0 ? L(`${recallAdded} added. Open Active Recall`, `${recallAdded} lagt til. Åpne Active Recall`) : L('Already saved. Open Active Recall', 'Allerede lagret. Åpne Active Recall')}</Text>
                  </Pressable>
                )}
              </>
            ) : answered ? (
              <Text style={[p.body, styles.centered]}>{L('No wrong answers this time.', 'Ingen feil denne gangen.')}</Text>
            ) : null}

            <Pressable accessibilityRole="button" onPress={() => start()} style={({ pressed }) => [missed.length ? p.outlineButton : p.button, styles.wide, !missed.length && { backgroundColor: palette.accent }, pressed && p.pressed]}>
              <Text style={missed.length ? p.outlineButtonText : p.buttonText}>{L('Take the whole quiz again', 'Ta hele quizen på nytt')}</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={openSetup} style={({ pressed }) => [p.outlineButton, styles.wide, styles.buttonRow, pressed && p.pressed]}>
              <StudyIcon name="sparkles" size={15} color={palette.accent} /><Text style={p.outlineButtonText}>{L('New quiz with AI', 'Ny quiz med AI')}</Text>
            </Pressable>
          </ScrollView>
        </View>
        {setup}
      </SafeAreaView>
    );
  }

  // ----- Start page -----
  let body;
  if (!loaded) {
    body = <View style={styles.state}><ActivityIndicator color={palette.accent} /></View>;
  } else if (!quiz) {
    body = (
      <View style={[p.card, p.empty]}>
        <IconChip name="quiz" />
        <Text style={p.emptyTitle}>{L('No quiz for this topic yet', 'Ingen quiz for dette temaet ennå')}</Text>
        <Text style={[p.body, studyStyles.centered]}>{L('AI writes multiple-choice questions for the topic. Add your lecture notes or a PDF and the questions follow your course.', 'AI skriver flervalgsspørsmål for temaet. Legg til forelesningsnotater eller en PDF, så følger spørsmålene pensumet ditt.')}</Text>
        <Pressable accessibilityRole="button" onPress={openSetup} style={({ pressed }) => [p.button, styles.wide, styles.buttonRow, { backgroundColor: palette.accent }, pressed && p.pressed]}>
          <StudyIcon name="sparkles" size={16} color="#FFFFFF" /><Text style={p.buttonText}>{L('Create quiz with AI', 'Lag quiz med AI')}</Text>
        </Pressable>
      </View>
    );
  } else {
    const made = new Date(quiz.generatedAt);
    const madeLabel = Number.isFinite(made.getTime()) ? made.toLocaleDateString(locale, { day: 'numeric', month: 'short' }) : '';
    body = (
      <>
        <View style={p.card}>
          <View style={p.row}>
            <IconChip name="quiz" />
            <View style={p.grow}>
              <Text style={styles.rowTitle}>{questions.length} {L('questions ready', 'spørsmål klare')}</Text>
              <Text style={p.small}>{[quiz.mode === 'adaptive' ? L('Adaptive', 'Adaptiv') : L('Standard', 'Standard'), madeLabel ? `${L('made', 'laget')} ${madeLabel}` : ''].filter(Boolean).join(' · ')}</Text>
            </View>
          </View>
          <Text style={styles.settingLabel}>{L('Time limit', 'Tidsgrense')}</Text>
          <Chips<TimeChoice> value={timeLimit} onChange={setTimeLimit} items={TIME_CHOICES.map((value) => ({ key: value, label: value === '0' ? L('None', 'Ingen') : `${value} min` }))} />
          <Text style={p.small}>{timeLimit === '0'
            ? L('Take the time you need. Each answer is explained as you go.', 'Bruk den tiden du trenger. Hvert svar forklares underveis.')
            : L('The quiz ends when the time runs out, like an exam.', 'Quizen avsluttes når tiden er ute, som på eksamen.')}</Text>
          <Pressable accessibilityRole="button" onPress={() => start()} style={({ pressed }) => [p.button, styles.big, styles.buttonRow, { backgroundColor: palette.accent }, pressed && p.pressed]}>
            <StudyIcon name="play" size={15} color="#FFFFFF" /><Text style={styles.bigText}>{L('Start quiz', 'Start quiz')}</Text>
          </Pressable>
        </View>

        <View style={p.card}>
          <View style={p.cardHeader}>
            <Text style={p.cardTitle}>{L('Quiz progress', 'Fremgang med quiz')}</Text>
            <Text style={styles.percent}>{quizProgress}%</Text>
          </View>
          <ProgressBar value={quizProgress} color={palette.accent} trackColor={palette.track} height={8} />
          {history.attempts ? (
            <>
              <View style={styles.stats}>
                <View style={styles.stat}><Text style={styles.statValue}>{history.attempts}</Text><Text style={styles.statLabel}>{L('Attempts', 'Forsøk')}</Text></View>
                <View style={styles.statDivider} />
                <View style={styles.stat}><Text style={styles.statValue}>{history.lastScore}%</Text><Text style={styles.statLabel}>{L('Last', 'Siste')}</Text></View>
                <View style={styles.statDivider} />
                <View style={styles.stat}><Text style={styles.statValue}>{history.bestScore}%</Text><Text style={styles.statLabel}>{L('Best', 'Beste')}</Text></View>
              </View>
              {history.change !== null && history.change !== 0 ? (
                <Text style={p.small}>{history.change > 0
                  ? L(`Up ${history.change} points from the attempt before.`, `Opp ${history.change} poeng fra forrige forsøk.`)
                  : L(`Down ${Math.abs(history.change)} points from the attempt before.`, `Ned ${Math.abs(history.change)} poeng fra forrige forsøk.`)}</Text>
              ) : null}
            </>
          ) : (
            <Text style={p.small}>{L('Fills up as you answer more questions correctly in this topic.', 'Fylles opp etter hvert som du svarer riktig på flere spørsmål i temaet.')}</Text>
          )}
        </View>

        <Pressable accessibilityRole="button" onPress={openSetup} style={({ pressed }) => [p.outlineButton, styles.buttonRow, pressed && p.pressed]}>
          <StudyIcon name="sparkles" size={15} color={palette.accent} /><Text style={p.outlineButtonText}>{L('New quiz with AI', 'Ny quiz med AI')}</Text>
        </Pressable>
      </>
    );
  }

  return (
    <SafeAreaView style={ui.container} edges={['top']}>
      <Stack.Screen options={{ headerShown: false, gestureEnabled: true }} />
      <PullToRefreshScrollView contentContainerStyle={studyStyles.content} showsVerticalScrollIndicator={false} onRefresh={async () => { await Promise.all([loadQuiz(), reload()]); }}>
        <ScreenBar backLabel={L('Back', 'Tilbake')} />
        <View>
          <Text style={styles.title} accessibilityRole="header">Quiz</Text>
          <Text style={styles.subtitle} numberOfLines={1}>{[topicName, subjectName].filter(Boolean).join(' · ')}</Text>
        </View>
        {body}
      </PullToRefreshScrollView>
      {setup}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  title: { color: ink.primary, fontSize: 30, fontWeight: '800', letterSpacing: -0.4 },
  subtitle: { color: ink.secondary, fontSize: 14, marginTop: 2 },
  state: { alignItems: 'center', paddingVertical: 60 },
  wide: { alignSelf: 'stretch' },
  centered: { textAlign: 'center' },
  buttonRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowTitle: { color: ink.primary, fontSize: 16, fontWeight: '800' },
  settingLabel: { color: ink.primary, fontSize: 14, fontWeight: '600' },
  percent: { color: ink.primary, fontSize: 18, fontWeight: '800' },
  big: { minHeight: 56, borderRadius: 18 },
  bigText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
  stats: { flexDirection: 'row', alignItems: 'stretch', alignSelf: 'stretch' },
  stat: { flex: 1, alignItems: 'center', gap: 3 },
  statDivider: { width: StyleSheet.hairlineWidth, backgroundColor: appColor('#D8E6EC', 'border') },
  statValue: { color: ink.primary, fontSize: 19, fontWeight: '800' },
  statLabel: { color: ink.muted, fontSize: 11 },

  page: { flex: 1, paddingHorizontal: 20 },
  bar: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  barButton: { width: 44, height: 44, justifyContent: 'center' },
  barTitle: { flex: 1, color: ink.primary, fontSize: 16, fontWeight: '800', textAlign: 'center' },
  timer: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, minHeight: 32, borderRadius: 16, backgroundColor: appColor('#FFFFFF', 'background'), borderWidth: 1, borderColor: appColor('#E7F0F4', 'border'), ...cardShadow },
  timerText: { color: ink.primary, fontSize: 15, fontWeight: '800', fontVariant: ['tabular-nums'] },
  progress: { gap: 8, marginTop: 4 },
  progressTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, minHeight: 26 },
  scroll: { flexGrow: 1, paddingVertical: 16, gap: 10 },
  question: { color: ink.primary, fontSize: 20, lineHeight: 28, fontWeight: '700', marginBottom: 6 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 16, backgroundColor: appColor('#FFFFFF', 'background'), borderWidth: 1, borderColor: appColor('#E7F0F4', 'border'), ...cardShadow },
  letter: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: appColor('#EEF4F7', 'background') },
  letterText: { color: ink.secondary, fontSize: 13, fontWeight: '800' },
  letterTextOn: { color: '#FFFFFF' },
  optionText: { flex: 1, color: ink.primary, fontSize: 15, lineHeight: 21 },
  explanation: { gap: 6, marginTop: 4 },
  explanationTitle: { color: ink.primary, fontSize: 15, fontWeight: '800' },
  explanationAnswer: { color: ink.primary, fontSize: 14, fontWeight: '700', lineHeight: 20 },
  footer: { paddingTop: 8, paddingBottom: 10 },

  doneCard: { alignItems: 'center', paddingVertical: 24, gap: 10 },
  doneIcon: { width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center' },
  doneTitle: { color: ink.primary, fontSize: 20, fontWeight: '800' },
  score: { color: ink.primary, fontSize: 44, fontWeight: '800', letterSpacing: -1 },
  sectionTitle: { color: ink.primary, fontSize: 18, fontWeight: '800', marginTop: 8 },
  missed: { gap: 8 },
  missedQuestion: { color: ink.primary, fontSize: 15, fontWeight: '700', lineHeight: 21 },
  answerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  correctText: { color: ink.primary, fontSize: 13, lineHeight: 19, fontWeight: '700' },

  modalKeyboard: { flex: 1 },
  modalMax: { maxHeight: '92%' },
  modalScroll: { flexGrow: 1, justifyContent: 'flex-end' },
});
