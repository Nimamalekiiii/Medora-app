import { LocalizedText as Text } from '@/components/localized-text';
import { StudyIcon } from '@/components/study-icon';
import { appColor } from '@/constants/adaptive-color';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import PullToRefreshScrollView from '../../../../components/pull-to-refresh-scroll-view';

import { generateAIQuiz } from '../../../../services/ai-api';
import { adjustAdaptiveDifficulty, getInitialAdaptiveDifficulty, selectAdaptiveQuestionIndex, type QuizDifficulty } from '../../../../services/adaptive-quiz';
import { addGeneratedQuizForTopic, getActiveRecallQuestionsForTopic, getAIPreferences, getGeneratedQuizzesByTopic, getLatestGeneratedQuizForTopic, getQuizResults, getSubjects, saveQuizSession } from '../../../../services/storage';
import type { GeneratedQuizSet, QuizQuestion, QuizResult, StudyActivity, Subject } from '../../../../types/study';

function param(value: string | string[] | undefined) { return Array.isArray(value) ? value[0] ?? '' : value ?? ''; }
type QuizAttempt = { question: string; selectedAnswer: string | null; correctAnswer: string; explanation: string; correct: boolean };
type QuizSavePayload = { result: QuizResult; activity: StudyActivity };

export default function QuizScreen() {
  const params = useLocalSearchParams<{ id?: string | string[]; name?: string | string[]; subjectId?: string | string[] }>();
  const topicId = param(params.id);
  const topicName = param(params.name) || 'Topic';
  const subjectId = param(params.subjectId);
  const [subjectName, setSubjectName] = useState('Medical studies');
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [questionOrder, setQuestionOrder] = useState<number[]>([]);
  const [quizMode, setQuizMode] = useState<'standard' | 'adaptive'>('standard');
  const [adaptiveDifficulty, setAdaptiveDifficulty] = useState<QuizDifficulty>('medium');
  const [busy, setBusy] = useState(false);
  const [generationProgress, setGenerationProgress] = useState(0);
  const [setupVisible, setSetupVisible] = useState(false);
  const [countText, setCountText] = useState('5');
  const [sourceMaterial, setSourceMaterial] = useState('');
  const [aiEnabled, setAIEnabled] = useState(true);
  const [aiDifficulty, setAIDifficulty] = useState<'easy' | 'medium' | 'hard'>('medium');
  const [aiExplanationStyle, setAIExplanationStyle] = useState<'short' | 'balanced' | 'detailed'>('balanced');
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [checked, setChecked] = useState(false);
  const [score, setScore] = useState(0);
  const [finished, setFinished] = useState(false);
  const [sessionStartedAt, setSessionStartedAt] = useState(0);
  const [sessionDurationMinutes, setSessionDurationMinutes] = useState(0);
  const [timerMinutes, setTimerMinutes] = useState(20);
  const [timerEndsAt, setTimerEndsAt] = useState<number | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
  const [timeExpired, setTimeExpired] = useState(false);
  const [attempts, setAttempts] = useState<QuizAttempt[]>([]);
  const [savePayload, setSavePayload] = useState<QuizSavePayload | null>(null);
  const [saveError, setSaveError] = useState(false);
  const [savedToProgress, setSavedToProgress] = useState(false);
  const completionStarted = useRef(false);

  const refreshSavedQuiz = useCallback(async () => {
    try {
      const [saved, subjects] = await Promise.all([getLatestGeneratedQuizForTopic(topicId), getSubjects()]);
      const subject = (subjects as Subject[]).find((item) => String(item.id) === subjectId);
      if (subject) setSubjectName(subject.name);
      // Keep answers and position intact during an active attempt.
      if (saved?.questions?.length && !questions.length) {
        setQuestions(saved.questions);
        const mode = saved.mode ?? 'standard';
        setQuizMode(mode);
        const initialDifficulty: QuizDifficulty = 'medium';
        setAdaptiveDifficulty(initialDifficulty);
        const firstIndex = mode === 'adaptive' ? selectAdaptiveQuestionIndex(saved.questions, [], initialDifficulty) : null;
        setQuestionOrder(mode === 'adaptive' ? [firstIndex ?? 0] : saved.questions.map((_, index) => index));
      }
    } catch (error) {
      console.warn('Could not refresh the saved quiz:', error);
    }
  }, [questions.length, subjectId, topicId]);

  useEffect(() => {
    let active = true;
    const load = setTimeout(() => {
      void refreshSavedQuiz();
    }, 0);
    void getAIPreferences().then((prefs) => {
      if (!active) return;
      setCountText(String(prefs.questionCount));
      setAIEnabled(prefs.generateQuizzes);
      setAIDifficulty(prefs.difficulty);
      setAIExplanationStyle(prefs.explanationStyle);
    });
    return () => { active = false; clearTimeout(load); };
  }, [refreshSavedQuiz, topicId, subjectId]);

  const question = questions[questionOrder[index]];
  const progress = questions.length ? ((index + 1) / questions.length) * 100 : 0;

  async function generateQuiz() {
    if (!aiEnabled) { Alert.alert('AI quizzes are off', 'Turn on quiz generation in Settings → AI preferences to create a new quiz.'); return; }
    const count = Number(countText);
    if (![5, 10, 20, 30, 50].includes(count)) {
      Alert.alert('Choose a valid number', 'Choose 5, 10, 20, 30 or 50 questions.');
      return;
    }
    setBusy(true);
    setGenerationProgress(0);
    try {
      const [quizHistory, quizResults, recallQuestions] = await Promise.all([
        getGeneratedQuizzesByTopic(), getQuizResults(), getActiveRecallQuestionsForTopic(topicId),
      ]);
      const topicResults = quizResults.filter((result) => String(result.topicId) === topicId)
        .sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime()).slice(0, 5);
      const recentQuestionCount = topicResults.reduce((sum, result) => sum + Math.max(0, result.questionCount), 0);
      const recentCorrectCount = topicResults.reduce((sum, result) => sum + Math.max(0, result.correctCount), 0);
      const initialDifficulty = quizMode === 'adaptive'
        ? getInitialAdaptiveDifficulty(topicResults)
        : aiDifficulty;
      const missed = topicResults.flatMap((result) => result.missedQuestions ?? []).slice(0, 8);
      const struggledRecallCount = recallQuestions.reduce((sum, item) => sum + (item.againCount ?? 0) + (item.hardCount ?? 0), 0);
      const historyQuestions = (quizHistory[topicId] ?? []).flatMap((set) => set.questions.map((item) => item.question));
      const previousQuestions = [...historyQuestions, ...questions.map((item) => item.question), ...missed.map((item) => item.question)].slice(-40);
      const contextParts = topicResults.length ? [`Recent quiz accuracy based on ${topicResults.length} recent quiz${topicResults.length === 1 ? '' : 'zes'}: ${recentQuestionCount ? Math.round((recentCorrectCount / recentQuestionCount) * 100) : 0}% (${recentCorrectCount}/${recentQuestionCount}).`] : [];
      if (missed.length) contextParts.push(`Recent missed quiz questions to revisit: ${missed.map((item) => item.question).join(' | ').slice(0, 540)}.`);
      if (struggledRecallCount) contextParts.push(`${struggledRecallCount} saved Active Recall ratings are Again or Hard; prioritize related foundational concepts.`);
      const generated = await generateAIQuiz({
        subjectName, topicName, questionCount: count, sourceMaterial: sourceMaterial.trim() || undefined,
        previousQuestions, struggleSummary: contextParts.join(' ').slice(0, 1_000) || undefined,
        difficulty: aiDifficulty, adaptive: quizMode === 'adaptive', explanationStyle: aiExplanationStyle, onProgress: setGenerationProgress,
      });
      const now = new Date().toISOString();
      const quiz: GeneratedQuizSet = { id: `quiz-${Date.now()}`, topicId, topicName, subjectId, subjectName, generatedAt: now, mode: quizMode, questions: generated };
      await addGeneratedQuizForTopic(quiz);
      const firstIndex = quizMode === 'adaptive' ? selectAdaptiveQuestionIndex(generated, [], initialDifficulty) : null;
      setQuestions(generated); setQuestionOrder(quizMode === 'adaptive' ? [firstIndex ?? 0] : generated.map((_, index) => index)); setAdaptiveDifficulty(initialDifficulty); setIndex(0); setSelected(null); setChecked(false); setScore(0); setFinished(false); setAttempts([]); setSavePayload(null); setSaveError(false); setSavedToProgress(false); setSessionStartedAt(0); setSessionDurationMinutes(0); setSetupVisible(false);
      completionStarted.current = false;
      setTimerEndsAt(null); setRemainingSeconds(null); setTimeExpired(false);
      Alert.alert('Quiz ready', `${generated.length} questions for ${topicName} have been saved.`);
    } catch (error) {
      Alert.alert('Could not generate quiz', error instanceof Error ? error.message : 'Please try again.');
    } finally { setBusy(false); }
  }

  function startAgain() {
    const firstIndex = quizMode === 'adaptive' ? selectAdaptiveQuestionIndex(questions, [], 'medium') : null;
    setQuestionOrder(quizMode === 'adaptive' ? [firstIndex ?? 0] : questions.map((_, questionIndex) => questionIndex));
    setAdaptiveDifficulty('medium');
    setIndex(0); setSelected(null); setChecked(false); setScore(0); setFinished(false); setSessionStartedAt(0); setSessionDurationMinutes(0);
    setAttempts([]); setSavePayload(null); setSaveError(false); setSavedToProgress(false);
    completionStarted.current = false;
    setTimerEndsAt(null); setRemainingSeconds(null); setTimeExpired(false);
  }

  async function completeQuiz(finalScore: number, timedOut = false, finalAttempts = attempts) {
    if (completionStarted.current) return;
    completionStarted.current = true;
    setTimerEndsAt(null);
    setRemainingSeconds(null);
    setTimeExpired(timedOut);
    const completedAt = new Date().toISOString();
    const durationSeconds = Math.max(1, Math.round((Date.now() - (sessionStartedAt || Date.now())) / 1000));
    const answeredCount = finalAttempts.length;
    const incorrectCount = finalAttempts.filter((attempt) => !attempt.correct && attempt.selectedAnswer !== null).length;
    const result: QuizResult = {
      id: `result-${Date.now()}-${topicId}`, topicId, topicName, completedAt, questionCount: answeredCount,
      correctCount: finalScore, wrongCount: incorrectCount,
      score: answeredCount ? Math.round((finalScore / answeredCount) * 100) : 0, durationSeconds,
      answeredCount,
      missedQuestions: finalAttempts.filter((attempt) => !attempt.correct && attempt.selectedAnswer !== null).map((attempt) => ({
        question: attempt.question, selectedAnswer: attempt.selectedAnswer!, correctAnswer: attempt.correctAnswer, explanation: attempt.explanation,
      })),
    };
    const activity: StudyActivity = {
      id: Date.now(), topicId, topicName, activity: 'quiz', completedAt, durationSeconds,
      questionCount: answeredCount, correctCount: finalScore, wrongCount: incorrectCount, score: result.score,
    };
    setSavePayload({ result, activity });
    try {
      await saveQuizSession(result, activity);
      setSavedToProgress(true);
    } catch {
      setSaveError(true);
      Alert.alert('Progress could not be saved', 'The quiz is complete, but MedExam could not save this result. Please export a backup and try again later.');
    }
    setScore(finalScore);
    setSessionDurationMinutes(Math.max(1, Math.round(durationSeconds / 60)));
    setFinished(true);
  }

  async function retrySave() {
    if (!savePayload) return;
    try {
      await saveQuizSession(savePayload.result, savePayload.activity);
      setSavedToProgress(true);
      setSaveError(false);
    } catch {
      setSaveError(true);
      Alert.alert('Still unable to save', 'Keep this screen open and try again when storage is available.');
    }
  }

  useEffect(() => {
    if (timerEndsAt === null || finished) return;
    const updateRemaining = () => {
      const seconds = Math.max(0, Math.ceil((timerEndsAt - Date.now()) / 1000));
      setRemainingSeconds(seconds);
      if (seconds === 0) {
        const currentAttempt = question && selected !== null ? {
          question: question.question, selectedAnswer: question.options[selected], correctAnswer: question.correctAnswer,
          explanation: question.explanation ?? '', correct: question.options[selected] === question.correctAnswer,
        } : null;
        const completedAttempts = currentAttempt ? [...attempts, currentAttempt] : attempts;
        setAttempts(completedAttempts);
        void completeQuiz(score + (currentAttempt?.correct ? 1 : 0), true, completedAttempts);
      }
    };
    updateRemaining();
    const interval = setInterval(updateRemaining, 1000);
    return () => clearInterval(interval);
  }, [timerEndsAt, finished, score, selected, question, attempts]);

  async function next() {
    if (!question || selected === null) return;
    const isCorrect = question.options[selected] === question.correctAnswer;
    const nextScore = score + (isCorrect ? 1 : 0);
    const finalAttempts = [...attempts, { question: question.question, selectedAnswer: question.options[selected], correctAnswer: question.correctAnswer, explanation: question.explanation ?? '', correct: isCorrect }];
    setAttempts(finalAttempts);
    if (index < questions.length - 1) {
      if (quizMode === 'adaptive') {
        const nextDifficulty = adjustAdaptiveDifficulty(adaptiveDifficulty, isCorrect);
        const nextIndex = selectAdaptiveQuestionIndex(questions, questionOrder, nextDifficulty);
        if (nextIndex !== null) {
          setQuestionOrder((order) => [...order, nextIndex]);
          setAdaptiveDifficulty(nextDifficulty);
        }
      }
      if (isCorrect) setScore(nextScore);
      setIndex((value) => value + 1); setSelected(null); setChecked(false); return;
    }
    await completeQuiz(nextScore, false, finalAttempts);
  }

  const correctLabel = useMemo(() => question?.correctAnswer ?? '', [question]);
  const answeredCount = attempts.length;

  return <SafeAreaView style={styles.screen}>
    <Stack.Screen options={{ headerShown: false }} />
    <PullToRefreshScrollView onRefresh={() => refreshSavedQuiz()} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Pressable style={styles.back} onPress={() => router.back()}><Text style={styles.backText}>‹  Back</Text></Pressable>
      <Text style={styles.eyebrow}>STUDY QUIZ</Text><Text style={styles.title}>Quiz</Text><Text style={styles.topic}>{topicName}</Text>
      {question && !finished && <View style={styles.timerPanel}>
        {timerEndsAt === null ? <>
          <View style={styles.timerHeader}><Text style={styles.timerTitle}>Timed exam mode</Text><Text style={styles.timerHint}>Optional</Text></View>
          <Text style={styles.copy}>Challenge yourself with a countdown. You can also use this quiz without a timer.</Text>
          <View style={styles.timerActions}>
            {[10, 20, 30].map((minutes) => <Pressable key={minutes} accessibilityRole="button" accessibilityState={{ selected: timerMinutes === minutes }} onPress={() => setTimerMinutes(minutes)} style={[styles.timeChoice, timerMinutes === minutes && styles.timeChoiceSelected]}><Text style={[styles.timeChoiceText, timerMinutes === minutes && styles.timeChoiceTextSelected]}>{minutes} min</Text></Pressable>)}
            <Pressable style={styles.startTimer} onPress={() => { setSessionStartedAt(Date.now()); setRemainingSeconds(timerMinutes * 60); setTimerEndsAt(Date.now() + timerMinutes * 60_000); }}><Text style={styles.startTimerText}>Start timer</Text></Pressable>
          </View>
        </> : <View style={styles.timerHeader}><Text style={styles.timerTitle}>Time remaining</Text><Text style={[styles.timerValue, remainingSeconds !== null && remainingSeconds < 60 && styles.timerUrgent]}>{remainingSeconds === null ? '—' : `${Math.floor(remainingSeconds / 60).toString().padStart(2, '0')}:${(remainingSeconds % 60).toString().padStart(2, '0')}`}</Text></View>}
      </View>}
      {!questions.length ? <View style={styles.empty}>
        <View style={styles.emptyIcon}><StudyIcon name="sparkles" size={25} /></View><Text style={styles.emptyTitle}>Create a quiz for this topic</Text><Text style={styles.copy}>AI will make questions using the subject and topic. Add course notes to make the questions specific to your material.</Text>
        <Pressable style={styles.primary} onPress={() => setSetupVisible(true)}><Text style={styles.primaryText}>Generate with AI</Text></Pressable>
      </View> : finished ? <View style={styles.empty}>
        <View style={styles.emptyIcon}><StudyIcon name={timeExpired ? 'timer' : 'check'} size={25} /></View><Text style={styles.emptyTitle}>{timeExpired ? 'Time is up' : 'Quiz complete'}</Text><Text style={styles.score}>{score} / {questions.length}</Text><Text style={styles.copy}>Correct answers · {Math.round((score / Math.max(questions.length, 1)) * 100)}% accuracy</Text>
        <View style={styles.resultStats}>
          <View style={styles.resultStat}><Text style={styles.resultStatValue}>{score}</Text><Text style={styles.resultStatLabel}>Correct</Text></View>
          <View style={styles.resultStat}><Text style={styles.resultStatValue}>{attempts.filter((attempt) => !attempt.correct && attempt.selectedAnswer !== null).length}</Text><Text style={styles.resultStatLabel}>Incorrect</Text></View>
          <View style={styles.resultStat}><Text style={styles.resultStatValue}>{Math.max(0, questions.length - attempts.length)}</Text><Text style={styles.resultStatLabel}>Unanswered</Text></View>
          <View style={styles.resultStat}><Text style={styles.resultStatValue}>{sessionDurationMinutes}</Text><Text style={styles.resultStatLabel}>Minutes</Text></View>
        </View>
        {attempts.some((attempt) => !attempt.correct && attempt.selectedAnswer !== null) ? <View style={styles.missedSection}>
          <Text style={styles.missedHeading}>Review difficult questions</Text>
          {attempts.filter((attempt) => !attempt.correct && attempt.selectedAnswer !== null).map((attempt, missedIndex) => <View key={`${missedIndex}-${attempt.question}`} style={styles.missedCard}>
            <Text style={styles.missedQuestion}>{attempt.question}</Text>
            <Text style={styles.missedAnswer}>Your answer: {attempt.selectedAnswer}</Text>
            <Text style={styles.missedAnswer}>Correct answer: {attempt.correctAnswer}</Text>
            {attempt.explanation ? <Text style={styles.missedExplanation}>{attempt.explanation}</Text> : null}
          </View>)}
        </View> : null}
        <Text style={styles.copy}>{savedToProgress ? 'Your result and study activity are saved to Progress.' : 'Your score is visible here but has not been saved to Progress yet.'}</Text>
        {saveError ? <Pressable style={styles.secondary} onPress={() => { void retrySave(); }}><Text style={styles.secondaryText}>Try saving progress again</Text></Pressable> : null}
        {attempts.some((attempt) => !attempt.correct) ? <Pressable style={styles.primary} onPress={() => router.push({ pathname: '/subject/topic/study/active-recall', params: { id: topicId, name: topicName, subjectId } })}><Text style={styles.primaryText}>Practice this topic with Active Recall</Text></Pressable> : null}
        <Pressable style={styles.primary} onPress={startAgain}><Text style={styles.primaryText}>Try again</Text></Pressable>
        <Pressable style={styles.secondary} onPress={() => setSetupVisible(true)}><Text style={styles.secondaryText}>Generate a new quiz</Text></Pressable>
      </View> : question ? <>
        {quizMode === 'adaptive' ? <View style={styles.adaptiveBadge}><StudyIcon name="sparkles" size={16} /><Text style={styles.adaptiveText}>Adaptive · {adaptiveDifficulty[0].toUpperCase() + adaptiveDifficulty.slice(1)}</Text><Text style={styles.adaptiveHint}>Adjusts after each answer</Text></View> : null}
        <View style={styles.progressRow}><Text style={styles.copy}>Question {index + 1} of {questions.length}</Text><Text style={styles.copy}>{Math.round(progress)}%</Text></View>
        <View style={styles.track}><View style={[styles.fill, { width: `${progress}%` }]} /></View>
        <View style={styles.questionCard}><Text style={styles.question}>{question.question}</Text></View>
        <Text style={styles.copy}>Choose one answer</Text>
        {question.options.map((option, optionIndex) => {
          const isCorrect = checked && option === correctLabel;
          const isWrong = checked && selected === optionIndex && option !== correctLabel;
          return <Pressable key={`${optionIndex}-${option}`} disabled={checked} onPress={() => setSelected(optionIndex)} style={[styles.option, selected === optionIndex && styles.optionSelected, isCorrect && styles.optionCorrect, isWrong && styles.optionWrong]}>
            <View style={styles.optionDot}><Text style={styles.optionLetter}>{String.fromCharCode(65 + optionIndex)}</Text></View><Text style={styles.optionText}>{option}</Text>
          </Pressable>;
        })}
        {checked && <View style={styles.explanation}><Text style={styles.explanationTitle}>{question.options[selected ?? -1] === correctLabel ? 'Correct' : 'Review this one'}</Text><Text style={styles.copy}>{question.explanation || `Correct answer: ${correctLabel}`}</Text></View>}
        {!checked ? <Pressable style={[styles.primary, selected === null && styles.disabled]} disabled={selected === null} onPress={() => setChecked(true)}><Text style={styles.primaryText}>Check answer</Text></Pressable> : <Pressable style={styles.primary} onPress={next}><Text style={styles.primaryText}>{index === questions.length - 1 ? 'Finish quiz' : 'Next question'}</Text></Pressable>}
        <Pressable style={styles.secondary} onPress={() => setSetupVisible(true)}><Text style={styles.secondaryText}>Generate a different quiz</Text></Pressable>
      </> : null}
    </PullToRefreshScrollView>
    <Modal visible={setupVisible} transparent animationType="slide" onRequestClose={() => !busy && setSetupVisible(false)}>
      <KeyboardAvoidingView style={styles.scrim} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}><ScrollView style={styles.modalScroll} contentContainerStyle={styles.modal} keyboardShouldPersistTaps="handled" keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'} automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}>
        <Text style={styles.modalTitle}>Make a quiz</Text><Text style={styles.copy}>For {subjectName} · {topicName}. You can add course notes for more focused questions.</Text>
        <Text style={styles.label}>Number of questions</Text><View style={styles.countChoices}>{[5, 10, 20, 30, 50].map((count) => <Pressable key={count} accessibilityRole="button" accessibilityState={{ selected: Number(countText) === count }} onPress={() => setCountText(String(count))} style={[styles.countChoice, Number(countText) === count && styles.countChoiceSelected]}><Text style={[styles.countChoiceText, Number(countText) === count && styles.countChoiceTextSelected]}>{count}</Text></Pressable>)}</View>
        <Text style={styles.label}>Course notes (optional)</Text><TextInput value={sourceMaterial} onChangeText={setSourceMaterial} multiline maxLength={20000} textAlignVertical="top" style={styles.notes} placeholder="Paste lecture notes or learning objectives" />
        <Text style={styles.aiDisclaimer}>AI can make mistakes. Check generated questions and explanations against the course material.</Text>
        {busy ? <View style={styles.busy}><ActivityIndicator color={appColor('#327E9D', 'text')} /><Text style={styles.copy}>Creating {generationProgress} of {countText} questions…</Text></View> : <View style={styles.modalButtons}><Pressable style={styles.cancel} onPress={() => setSetupVisible(false)}><Text style={styles.secondaryText}>Cancel</Text></Pressable><Pressable style={styles.primarySmall} onPress={generateQuiz}><Text style={styles.primaryText}>Generate</Text></Pressable></View>}
      </ScrollView></KeyboardAvoidingView>
    </Modal>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: appColor('#F5FAFC', 'background') }, content: { padding: 22, paddingBottom: 36 }, back: { marginBottom: 18, marginTop: 4 }, backText: { color: appColor('#327E9D', 'text'), fontSize: 15, fontWeight: '700' }, eyebrow: { color: appColor('#448EA8', 'text'), fontSize: 11, fontWeight: '800', letterSpacing: 1.4 }, title: { color: appColor('#17324D', 'text'), fontSize: 32, fontWeight: '800', marginTop: 5 }, topic: { color: appColor('#327E9D', 'text'), fontSize: 16, fontWeight: '700', marginTop: 3, marginBottom: 22 },
  empty: { backgroundColor: appColor('#FFFFFF', 'background'), borderRadius: 20, padding: 22, alignItems: 'stretch' }, emptyIcon: { alignSelf: 'center', width: 54, height: 54, borderRadius: 17, backgroundColor: appColor('#EEF7FA', 'background'), alignItems: 'center', justifyContent: 'center', marginBottom: 10 }, emptyTitle: { color: appColor('#17324D', 'text'), fontSize: 20, fontWeight: '800', textAlign: 'center' }, copy: { color: appColor('#748592', 'text'), fontSize: 14, lineHeight: 21, marginTop: 7 }, primary: { backgroundColor: appColor('#327E9D', 'background'), borderRadius: 13, minHeight: 50, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, marginTop: 18 }, primaryText: { color: appColor('#FFFFFF', 'text'), fontSize: 15, fontWeight: '700' }, secondary: { minHeight: 46, alignItems: 'center', justifyContent: 'center', marginTop: 8 }, secondaryText: { color: appColor('#327E9D', 'text'), fontSize: 14, fontWeight: '700' }, score: { textAlign: 'center', color: appColor('#327E9D', 'text'), fontSize: 38, fontWeight: '800', marginTop: 8 },
  resultStats: { flexDirection: 'row', gap: 8, marginTop: 15 }, resultStat: { flex: 1, alignItems: 'center', backgroundColor: appColor('#F4F8FA', 'background'), borderRadius: 12, paddingVertical: 11, paddingHorizontal: 5 }, resultStatValue: { color: appColor('#17324D', 'text'), fontSize: 18, fontWeight: '800' }, resultStatLabel: { color: appColor('#748592', 'text'), fontSize: 11, marginTop: 2 }, missedSection: { alignSelf: 'stretch', marginTop: 17, gap: 8 }, missedHeading: { color: appColor('#17324D', 'text'), fontSize: 15, fontWeight: '800', marginBottom: 2 }, missedCard: { backgroundColor: appColor('#FFF8F5', 'background'), borderColor: appColor('#F0DFD5', 'border'), borderWidth: 1, borderRadius: 13, padding: 12, gap: 4 }, missedQuestion: { color: appColor('#17324D', 'text'), fontSize: 14, lineHeight: 20, fontWeight: '700' }, missedAnswer: { color: appColor('#536D7D', 'text'), fontSize: 12, lineHeight: 17 }, missedExplanation: { color: appColor('#748592', 'text'), fontSize: 12, lineHeight: 17, marginTop: 3 },
  progressRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }, track: { height: 7, borderRadius: 8, backgroundColor: appColor('#DDE9EE', 'background'), overflow: 'hidden', marginBottom: 18 }, fill: { height: '100%', borderRadius: 8, backgroundColor: appColor('#4BA1B7', 'background') }, questionCard: { backgroundColor: appColor('#FFFFFF', 'background'), padding: 20, borderRadius: 18, marginBottom: 17 }, question: { color: appColor('#17324D', 'text'), fontSize: 19, lineHeight: 27, fontWeight: '700' }, option: { backgroundColor: appColor('#FFFFFF', 'background'), borderColor: appColor('#E5EDF1', 'border'), borderWidth: 1, borderRadius: 14, minHeight: 58, padding: 12, flexDirection: 'row', alignItems: 'center', marginTop: 9 }, optionSelected: { borderColor: appColor('#4BA1B7', 'border'), backgroundColor: appColor('#F0F9FB', 'background') }, optionCorrect: { borderColor: appColor('#56A985', 'border'), backgroundColor: appColor('#EFF9F3', 'background') }, optionWrong: { borderColor: appColor('#D47979', 'border'), backgroundColor: appColor('#FFF4F3', 'background') }, optionDot: { width: 30, height: 30, borderRadius: 15, backgroundColor: appColor('#EDF4F7', 'background'), alignItems: 'center', justifyContent: 'center', marginRight: 11 }, optionLetter: { color: appColor('#507181', 'text'), fontWeight: '700', fontSize: 12 }, optionText: { color: appColor('#29475B', 'text'), flex: 1, fontSize: 14, lineHeight: 20 }, explanation: { backgroundColor: appColor('#EAF5F8', 'background'), borderRadius: 14, padding: 15, marginTop: 14 }, explanationTitle: { color: appColor('#17324D', 'text'), fontSize: 15, fontWeight: '800' }, disabled: { opacity: 0.5 },
  timerPanel: { backgroundColor: appColor('#EAF5F8', 'background'), borderRadius: 16, padding: 15, marginBottom: 17 }, timerHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, timerTitle: { color: appColor('#17324D', 'text'), fontWeight: '800', fontSize: 14 }, timerHint: { color: appColor('#748592', 'text'), fontSize: 12 }, timerActions: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 12 }, timeChoice: { backgroundColor: appColor('#FFFFFF', 'background'), borderColor: appColor('#DCE9EE', 'border'), borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 9 }, timeChoiceSelected: { borderColor: appColor('#327E9D', 'border'), backgroundColor: appColor('#DDF1F5', 'background') }, timeChoiceText: { color: appColor('#4F6877', 'text'), fontWeight: '700', fontSize: 12 }, timeChoiceTextSelected: { color: appColor('#1E647A', 'text') }, startTimer: { marginLeft: 'auto', backgroundColor: appColor('#327E9D', 'background'), borderRadius: 10, paddingHorizontal: 13, paddingVertical: 10 }, startTimerText: { color: appColor('#FFFFFF', 'text'), fontWeight: '800', fontSize: 12 }, timerValue: { color: appColor('#0F7181', 'text'), fontSize: 20, fontVariant: ['tabular-nums'], fontWeight: '800' }, timerUrgent: { color: appColor('#B44B3D', 'text') },
  scrim: { flex: 1, justifyContent: 'flex-end', backgroundColor: appColor('#10283B88', 'background') }, modalScroll: { maxHeight: '90%', backgroundColor: appColor('#F7FBFE', 'background'), borderTopLeftRadius: 24, borderTopRightRadius: 24 }, modal: { padding: 22, paddingBottom: 30 }, modalTitle: { color: appColor('#17324D', 'text'), fontSize: 23, fontWeight: '800' }, label: { color: appColor('#315267', 'text'), fontSize: 13, fontWeight: '700', marginTop: 16, marginBottom: 7 }, countChoices: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' }, countChoice: { minWidth: 46, minHeight: 42, borderRadius: 11, borderWidth: 1, borderColor: appColor('#DCE9EE', 'border'), backgroundColor: appColor('#FFFFFF', 'background'), alignItems: 'center', justifyContent: 'center', paddingHorizontal: 13 }, countChoiceSelected: { borderColor: appColor('#327E9D', 'border'), backgroundColor: appColor('#DDF1F5', 'background') }, countChoiceText: { color: appColor('#4F6877', 'text'), fontWeight: '700' }, countChoiceTextSelected: { color: appColor('#1E647A', 'text') }, notes: { height: 130, backgroundColor: appColor('#FFFFFF', 'background'), borderRadius: 12, padding: 13, color: appColor('#17324D', 'text'), fontSize: 14 }, aiDisclaimer: { color: appColor('#748592', 'text'), fontSize: 12, lineHeight: 18, marginTop: 8 }, modalButtons: { flexDirection: 'row', gap: 10, marginTop: 17 }, cancel: { flex: 1, backgroundColor: appColor('#E6EEF2', 'background'), borderRadius: 12, minHeight: 48, alignItems: 'center', justifyContent: 'center' }, primarySmall: { flex: 1, backgroundColor: appColor('#327E9D', 'background'), borderRadius: 12, minHeight: 48, alignItems: 'center', justifyContent: 'center' }, busy: { flexDirection: 'row', alignItems: 'center', gap: 10, justifyContent: 'center', marginTop: 20 },
});
