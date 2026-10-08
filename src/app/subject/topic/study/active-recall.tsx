import { LocalizedText as Text } from '@/components/localized-text';
import PullToRefreshScrollView from '@/components/pull-to-refresh-scroll-view';
import { StudyIcon } from '@/components/study-icon';
import { appColor } from '@/constants/adaptive-color';
import { generateAIActiveRecall } from '@/services/ai-api';
import { getActiveRecallQuestionsForTopic, getAIPreferences, getSubjects, saveActiveRecallProgress, saveActiveRecallQuestionsForTopic } from '@/services/storage';
import { calculateNextReviewDate } from '@/services/study-engine';
import type { ActiveRecallQuestion, StudyActivity } from '@/types/study';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView,
  StyleSheet, TextInput, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type RecallRating = 'again' | 'hard' | 'good' | 'easy';
type DraftQuestion = { question: string; answer: string };

const RATING_DAYS: Record<RecallRating, number> = { again: 1, hard: 2, good: 4, easy: 7 };

function isDue(question: ActiveRecallQuestion, now = Date.now()) {
  if (!question.nextReviewAt) return true;
  const date = new Date(question.nextReviewAt).getTime();
  return !Number.isFinite(date) || date <= now;
}

function getNextReviewAt(rating: RecallRating, now = new Date()) {
  return calculateNextReviewDate(rating, now);
}

function createBlankDraft(): DraftQuestion { return { question: '', answer: '' }; }

export default function ActiveRecallScreen() {
  const params = useLocalSearchParams();
  const topicId = Array.isArray(params.id) ? params.id[0] : String(params.id ?? '');
  const topicName = Array.isArray(params.name) ? params.name[0] : String(params.name ?? 'Topic');
  const subjectId = Array.isArray(params.subjectId) ? params.subjectId[0] : String(params.subjectId ?? '');
  const [questions, setQuestions] = useState<ActiveRecallQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionQuestions, setSessionQuestions] = useState<ActiveRecallQuestion[]>([]);
  const [sessionIndex, setSessionIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [sessionFinished, setSessionFinished] = useState(false);
  const [ratings, setRatings] = useState<RecallRating[]>([]);
  const [sessionStartedAt, setSessionStartedAt] = useState(0);
  const [sessionActivityId, setSessionActivityId] = useState<number | null>(null);
  const [questionModalVisible, setQuestionModalVisible] = useState(false);
  const [editingQuestionId, setEditingQuestionId] = useState<number | null>(null);
  const [questionDraft, setQuestionDraft] = useState<DraftQuestion>(createBlankDraft());
  const [aiModalVisible, setAIModalVisible] = useState(false);
  const [sourceMaterial, setSourceMaterial] = useState('');
  const [questionCount, setQuestionCount] = useState(10);
  const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard'>('medium');
  const [generating, setGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState(0);
  const [generatedDrafts, setGeneratedDrafts] = useState<DraftQuestion[] | null>(null);

  const loadQuestions = useCallback(async (showSpinner = false) => {
    if (showSpinner) setLoading(true);
    setError(null);
    try {
      const nextQuestions = await getActiveRecallQuestionsForTopic(topicId);
      setQuestions(nextQuestions);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load your questions.');
    } finally {
      setLoading(false);
    }
  }, [topicId]);

  useEffect(() => {
    void loadQuestions(true);
    void getAIPreferences().then((preferences) => {
      setQuestionCount(preferences.questionCount);
      setDifficulty(preferences.difficulty);
    });
  }, [loadQuestions]);

  const dueQuestions = useMemo(() => questions.filter((question) => isDue(question)), [questions]);
  const currentQuestion = sessionQuestions[sessionIndex];
  const counts = useMemo(() => ratings.reduce((result, rating) => ({ ...result, [rating]: result[rating] + 1 }),
    { again: 0, hard: 0, good: 0, easy: 0 }), [ratings]);

  async function persist(next: ActiveRecallQuestion[]) {
    setSaving(true);
    try {
      await saveActiveRecallQuestionsForTopic(topicId, next);
      setQuestions(next);
      return true;
    } catch (saveError) {
      Alert.alert('Could not save', saveError instanceof Error ? saveError.message : 'Your changes were not saved. Please try again.');
      return false;
    } finally {
      setSaving(false);
    }
  }

  function openCreateQuestion() {
    setEditingQuestionId(null);
    setQuestionDraft(createBlankDraft());
    setQuestionModalVisible(true);
  }

  function openEditQuestion(question: ActiveRecallQuestion) {
    setEditingQuestionId(question.id);
    setQuestionDraft({ question: question.question, answer: question.answer });
    setQuestionModalVisible(true);
  }

  async function saveManualQuestion() {
    const question = questionDraft.question.trim();
    const answer = questionDraft.answer.trim();
    if (!question || !answer) {
      Alert.alert('Add both sides', 'Enter a question and its answer before saving.');
      return;
    }
    const next = editingQuestionId === null
      ? [...questions, { id: Date.now(), question, answer, createdBy: 'manual' as const }]
      : questions.map((item) => item.id === editingQuestionId ? { ...item, question, answer } : item);
    if (await persist(next)) {
      setQuestionModalVisible(false);
      setEditingQuestionId(null);
      setQuestionDraft(createBlankDraft());
    }
  }

  function deleteQuestion(question: ActiveRecallQuestion) {
    Alert.alert('Delete question?', 'This permanently removes the question from this topic.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => { void persist(questions.filter((item) => item.id !== question.id)); } },
    ]);
  }

  async function generateQuestions() {
    setGenerating(true);
    setGenerationProgress(0);
    try {
      const subjects = await getSubjects();
      const subject = subjects.find((item) => String(item.id) === subjectId);
      const hardOrAgain = questions.filter((item) => (item.againCount ?? 0) + (item.hardCount ?? 0) > 0);
      const struggleSummary = hardOrAgain.length
        ? `${hardOrAgain.length} saved question${hardOrAgain.length === 1 ? '' : 's'} have been marked Again or Hard; prioritize related foundational concepts.`
        : undefined;
      const generated = await generateAIActiveRecall({
        subjectName: subject?.name ?? 'Medical studies',
        topicName,
        questionCount,
        sourceMaterial: sourceMaterial.trim() || undefined,
        previousQuestions: questions.map((item) => item.question),
        struggleSummary,
        difficulty,
        onProgress: (completed) => setGenerationProgress(completed),
      });
      setGeneratedDrafts(generated);
    } catch (generationError) {
      Alert.alert('Could not generate questions', generationError instanceof Error ? generationError.message : 'Please check your connection and try again.');
    } finally {
      setGenerating(false);
    }
  }

  async function saveGeneratedQuestions() {
    const drafts = (generatedDrafts ?? []).map((item) => ({ question: item.question.trim(), answer: item.answer.trim() })).filter((item) => item.question && item.answer);
    if (!drafts.length) return;
    const createdAt = Date.now();
    const additions: ActiveRecallQuestion[] = drafts.map((item, index) => ({
      id: createdAt + index, ...item, createdBy: 'ai',
    }));
    if (await persist([...questions, ...additions])) {
      setGeneratedDrafts(null);
      setAIModalVisible(false);
      setSourceMaterial('');
      Alert.alert('Questions saved', `${additions.length} Active Recall questions were added to ${topicName}.`);
    }
  }

  function startSession(includeAll = false) {
    const selected = includeAll ? questions : dueQuestions;
    if (!selected.length) return;
    setSessionQuestions([...selected].sort((a, b) => {
      const aNext = a.nextReviewAt ? new Date(a.nextReviewAt).getTime() : 0;
      const bNext = b.nextReviewAt ? new Date(b.nextReviewAt).getTime() : 0;
      return aNext - bNext;
    }));
    setSessionIndex(0);
    setShowAnswer(false);
    setRatings([]);
    setSessionFinished(false);
    setSessionStartedAt(Date.now());
    setSessionActivityId(Date.now());
  }

  async function rateQuestion(rating: RecallRating) {
    if (!currentQuestion || saving) return;
    const ratedAt = new Date();
    const updated = {
      ...currentQuestion,
      nextReviewAt: getNextReviewAt(rating, ratedAt),
      lastRatedAt: ratedAt.toISOString(),
      againCount: (currentQuestion.againCount ?? 0) + (rating === 'again' ? 1 : 0),
      hardCount: (currentQuestion.hardCount ?? 0) + (rating === 'hard' ? 1 : 0),
      goodCount: (currentQuestion.goodCount ?? 0) + (rating === 'good' ? 1 : 0),
      easyCount: (currentQuestion.easyCount ?? 0) + (rating === 'easy' ? 1 : 0),
    };
    const updatedQuestions = questions.map((question) => question.id === updated.id ? updated : question);
    const nextRatings = [...ratings, rating];
    const finalCounts = nextRatings.reduce((result, value) => ({ ...result, [value]: result[value] + 1 }), { again: 0, hard: 0, good: 0, easy: 0 });
    const activity: StudyActivity = {
      id: sessionActivityId ?? Date.now(), topicId, topicName, activity: 'active_recall', completedAt: ratedAt.toISOString(),
      durationSeconds: Math.max(1, Math.round((Date.now() - sessionStartedAt) / 1000)),
      questionCount: nextRatings.length, correctCount: finalCounts.good + finalCounts.easy,
      wrongCount: finalCounts.again + finalCounts.hard,
      score: Math.round(((finalCounts.good + finalCounts.easy) / nextRatings.length) * 100),
      againCount: finalCounts.again, hardCount: finalCounts.hard, goodCount: finalCounts.good, easyCount: finalCounts.easy,
    };
    setSaving(true);
    try {
      await saveActiveRecallProgress(topicId, updatedQuestions, activity);
    } catch (saveError) {
      Alert.alert('Could not save this rating', saveError instanceof Error ? saveError.message : 'Your answer was not recorded. Please try again.');
      return;
    } finally {
      setSaving(false);
    }
    setSessionActivityId(activity.id);
    setQuestions(updatedQuestions);
    setSessionQuestions((items) => items.map((question) => question.id === updated.id ? updated : question));
    setRatings(nextRatings);
    if (sessionIndex < sessionQuestions.length - 1) {
      setSessionIndex((index) => index + 1);
      setShowAnswer(false);
      return;
    }
    setSessionFinished(true);
  }

  function ratingLabel(rating: RecallRating) {
    switch (rating) {
      case 'again': return 'Again';
      case 'hard': return 'Hard';
      case 'good': return 'Good';
      case 'easy': return 'Easy';
    }
  }

  const manualModal = (
    <Modal visible={questionModalVisible} transparent animationType="slide" onRequestClose={() => setQuestionModalVisible(false)}>
      <KeyboardAvoidingView style={styles.modalKeyboard} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={styles.modalBackdrop}>
          <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalScrollContent} keyboardShouldPersistTaps="handled">
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>{editingQuestionId === null ? 'Add a question' : 'Edit question'}</Text>
              <Text style={styles.fieldLabel}>QUESTION</Text>
              <TextInput value={questionDraft.question} onChangeText={(question) => setQuestionDraft((draft) => ({ ...draft, question }))} style={styles.textInput} placeholder="Write a question" placeholderTextColor={appColor('#91A2AE', 'text')} multiline />
              <Text style={styles.fieldLabel}>ANSWER</Text>
              <TextInput value={questionDraft.answer} onChangeText={(answer) => setQuestionDraft((draft) => ({ ...draft, answer }))} style={[styles.textInput, styles.multiline]} placeholder="Write the answer" placeholderTextColor={appColor('#91A2AE', 'text')} multiline />
              <View style={styles.modalActions}>
                <Pressable onPress={() => setQuestionModalVisible(false)} style={styles.secondaryButton}><Text style={styles.secondaryButtonText}>Cancel</Text></Pressable>
                <Pressable disabled={saving} onPress={() => { void saveManualQuestion(); }} style={styles.primaryButton}><Text style={styles.primaryButtonText}>{saving ? 'Saving…' : 'Save question'}</Text></Pressable>
              </View>
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );

  const aiModal = (
    <Modal visible={aiModalVisible} transparent animationType="slide" onRequestClose={() => { if (!generating) { setAIModalVisible(false); setGeneratedDrafts(null); } }}>
      <KeyboardAvoidingView style={styles.modalKeyboard} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={styles.modalBackdrop}>
          <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalScrollContent} keyboardShouldPersistTaps="handled" keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'} automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}>
            <View style={styles.modalCard}>
              <View style={styles.modalHeader}><View style={styles.aiBadge}><StudyIcon name="sparkles" size={18} /></View><View style={styles.grow}><Text style={styles.modalTitle}>Create with AI</Text><Text style={styles.cardCopy}>{topicName} · review and edit before saving</Text></View></View>
              {!generatedDrafts ? <>
                <Text style={styles.fieldLabel}>NUMBER OF QUESTIONS</Text>
                <View style={styles.choiceRow}>{[5, 10, 20, 30, 50].map((count) => <Pressable key={count} accessibilityRole="button" accessibilityState={{ selected: questionCount === count }} onPress={() => setQuestionCount(count)} style={[styles.choice, questionCount === count && styles.choiceSelected]}><Text style={[styles.choiceText, questionCount === count && styles.choiceTextSelected]}>{count}</Text></Pressable>)}</View>
                <Text style={styles.fieldLabel}>DIFFICULTY</Text>
                <View style={styles.choiceRow}>{(['easy', 'medium', 'hard'] as const).map((level) => <Pressable key={level} accessibilityRole="button" accessibilityState={{ selected: difficulty === level }} onPress={() => setDifficulty(level)} style={[styles.choice, difficulty === level && styles.choiceSelected]}><Text style={[styles.choiceText, difficulty === level && styles.choiceTextSelected]}>{level[0].toUpperCase() + level.slice(1)}</Text></Pressable>)}</View>
                <Text style={styles.fieldLabel}>COURSE MATERIAL (OPTIONAL)</Text>
                <TextInput value={sourceMaterial} onChangeText={setSourceMaterial} style={[styles.textInput, styles.notesInput]} placeholder="Paste lecture notes or learning objectives" placeholderTextColor={appColor('#91A2AE', 'text')} multiline maxLength={20000} />
                <Text style={styles.cardCopy}>The AI also uses earlier questions and saved difficulty ratings to reduce repetition and focus on topics marked Again or Hard.</Text>
                {generating ? <View style={styles.progressStatus}><ActivityIndicator color={appColor('#328FB5', 'text')} /><Text style={styles.cardCopy}>Generating questions… {generationProgress} of {questionCount}</Text></View> : null}
                <View style={styles.modalActions}>
                  <Pressable disabled={generating} onPress={() => setAIModalVisible(false)} style={styles.secondaryButton}><Text style={styles.secondaryButtonText}>Cancel</Text></Pressable>
                  <Pressable disabled={generating} onPress={() => { void generateQuestions(); }} style={styles.primaryButton}><Text style={styles.primaryButtonText}>{generating ? 'Generating…' : 'Generate questions'}</Text></Pressable>
                </View>
              </> : <>
                <Text style={styles.cardCopy}>Review and edit these suggestions. Nothing is saved until you choose Save questions.</Text>
                {generatedDrafts.map((draft, index) => <View key={`draft-${index}`} style={styles.draftCard}>
                  <View style={styles.draftHeader}><Text style={styles.fieldLabel}>QUESTION {index + 1}</Text><Pressable accessibilityRole="button" onPress={() => setGeneratedDrafts((items) => items?.filter((_, itemIndex) => itemIndex !== index) ?? null)}><StudyIcon name="x" size={18} /></Pressable></View>
                  <TextInput value={draft.question} onChangeText={(value) => setGeneratedDrafts((items) => items?.map((item, itemIndex) => itemIndex === index ? { ...item, question: value } : item) ?? null)} style={styles.textInput} multiline />
                  <Text style={styles.fieldLabel}>ANSWER</Text>
                  <TextInput value={draft.answer} onChangeText={(value) => setGeneratedDrafts((items) => items?.map((item, itemIndex) => itemIndex === index ? { ...item, answer: value } : item) ?? null)} style={[styles.textInput, styles.answerDraft]} multiline />
                </View>)}
                <View style={styles.modalActions}>
                  <Pressable onPress={() => setGeneratedDrafts(null)} style={styles.secondaryButton}><Text style={styles.secondaryButtonText}>Generate again</Text></Pressable>
                  <Pressable disabled={saving || generatedDrafts.length === 0} onPress={() => { void saveGeneratedQuestions(); }} style={styles.primaryButton}><Text style={styles.primaryButtonText}>{saving ? 'Saving…' : `Save ${generatedDrafts.length} questions`}</Text></Pressable>
                </View>
              </>}
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Stack.Screen options={{ headerShown: false }} />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <PullToRefreshScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} onRefresh={() => loadQuestions()}>
          <Pressable style={styles.backButton} onPress={() => router.back()}><Text style={styles.backText}>‹  Study</Text></Pressable>
          <View style={styles.pageHeader}>
            <View style={styles.headerIcon}><StudyIcon name="brain" size={24} /></View>
            <View style={styles.grow}><Text style={styles.title}>Active Recall</Text><Text style={styles.subtitle}>{topicName}</Text></View>
          </View>
          {error ? <View style={styles.errorCard}><Text style={styles.errorText}>{error}</Text><Pressable onPress={() => { void loadQuestions(true); }}><Text style={styles.retryText}>Try again</Text></Pressable></View> : null}
          {loading ? <View style={styles.loading}><ActivityIndicator color={appColor('#328FB5', 'text')} /><Text style={styles.cardCopy}>Loading saved questions…</Text></View> : sessionFinished ? (
            <View style={styles.finishedCard}>
              <View style={styles.finishedIcon}><StudyIcon name="check" size={24} /></View>
              <Text style={styles.sectionTitle}>Session complete</Text>
              <Text style={styles.cardCopy}>{topicName} · {sessionQuestions.length} question{sessionQuestions.length === 1 ? '' : 's'} · {Math.max(1, Math.round((Date.now() - sessionStartedAt) / 60_000))} min</Text>
              <View style={styles.summaryGrid}>{(['again', 'hard', 'good', 'easy'] as RecallRating[]).map((rating) => <View key={rating} style={styles.summaryTile}><Text style={styles.summaryValue}>{counts[rating]}</Text><Text style={styles.summaryLabel}>{ratingLabel(rating)}</Text></View>)}</View>
              <Text style={styles.cardCopy}>Your ratings are saved on each question and will shape future review timing and study recommendations.</Text>
              <Pressable style={styles.primaryWide} onPress={() => { setSessionFinished(false); setSessionQuestions([]); setRatings([]); void loadQuestions(); }}><Text style={styles.primaryButtonText}>Done</Text></Pressable>
            </View>
          ) : sessionQuestions.length > 0 && currentQuestion ? (
            <>
              <View style={styles.sessionHeader}><Text style={styles.fieldLabel}>QUESTION {sessionIndex + 1} OF {sessionQuestions.length}</Text><Pressable onPress={() => { setSessionQuestions([]); setShowAnswer(false); }}><Text style={styles.exitSession}>End session</Text></Pressable></View>
              <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${Math.round(((sessionIndex + 1) / sessionQuestions.length) * 100)}%` }]} /></View>
              <View style={styles.questionCard}>
                <Text style={styles.fieldLabel}>QUESTION</Text>
                <Text style={styles.questionText}>{currentQuestion.question}</Text>
                {!showAnswer ? <Pressable style={styles.primaryWide} onPress={() => setShowAnswer(true)}><Text style={styles.primaryButtonText}>Show answer</Text></Pressable> : <>
                  <View style={styles.answerBox}><Text style={styles.fieldLabel}>ANSWER</Text><Text style={styles.answerText}>{currentQuestion.answer}</Text></View>
                  <Text style={styles.ratingQuestion}>How well did you remember it?</Text>
                  <Text style={styles.cardCopy}>This rating schedules the next review: Again in 1 day, Hard in 2, Good in 4 or Easy in 7.</Text>
                  <View style={styles.ratingGrid}>{(['again', 'hard', 'good', 'easy'] as RecallRating[]).map((rating) => <Pressable key={rating} disabled={saving} onPress={() => { void rateQuestion(rating); }} style={[styles.ratingButton, styles[`rating_${rating}`]]}><Text style={styles.ratingTitle}>{ratingLabel(rating)}</Text><Text style={styles.ratingWhen}>{RATING_DAYS[rating]} day{RATING_DAYS[rating] === 1 ? '' : 's'}</Text></Pressable>)}</View>
                </>}
                {saving ? <View style={styles.saving}><ActivityIndicator color={appColor('#328FB5', 'text')} /><Text style={styles.cardCopy}>Saving your rating…</Text></View> : null}
              </View>
            </>
          ) : <>
            <View style={styles.statsCard}>
              <View style={styles.stat}><Text style={styles.statValue}>{questions.length}</Text><Text style={styles.statLabel}>Saved</Text></View>
              <View style={styles.statDivider} />
              <View style={styles.stat}><Text style={styles.statValue}>{dueQuestions.length}</Text><Text style={styles.statLabel}>Due now</Text></View>
              <View style={styles.statDivider} />
              <View style={styles.stat}><Text style={styles.statValue}>{questions.reduce((sum, item) => sum + (item.againCount ?? 0) + (item.hardCount ?? 0), 0)}</Text><Text style={styles.statLabel}>Again / Hard</Text></View>
            </View>
            <View style={styles.actionsRow}>
              <Pressable style={styles.aiButton} onPress={() => { setAIModalVisible(true); setGeneratedDrafts(null); }}><StudyIcon name="sparkles" size={18} color="#FFFFFF" /><Text style={styles.primaryButtonText}>Create with AI</Text></Pressable>
              <Pressable style={styles.addButton} onPress={openCreateQuestion}><StudyIcon name="plus" size={18} /><Text style={styles.addButtonText}>Add</Text></Pressable>
            </View>
            {dueQuestions.length ? <Pressable style={styles.primaryWide} onPress={() => startSession(false)}><Text style={styles.primaryButtonText}>Start review · {dueQuestions.length} due</Text></Pressable> : questions.length ? <View style={styles.caughtUpCard}><StudyIcon name="check" size={19} /><View style={styles.grow}><Text style={styles.caughtUpTitle}>You’re up to date</Text><Text style={styles.cardCopy}>Your next review dates are saved with each question.</Text></View></View> : null}
            {!dueQuestions.length && questions.length ? <Pressable style={styles.secondaryWide} onPress={() => startSession(true)}><Text style={styles.secondaryButtonText}>Study all questions</Text></Pressable> : null}
            {questions.length === 0 ? <View style={styles.emptyCard}>
              <View style={styles.emptyIcon}><StudyIcon name="brain" size={26} /></View><Text style={styles.sectionTitle}>No questions yet</Text><Text style={styles.cardCopy}>Create a few questions yourself or ask AI to draft some for this topic. You can edit everything before saving.</Text>
            </View> : null}
            {questions.length ? <>
              <View style={styles.listHeading}><View><Text style={styles.sectionTitle}>Your questions</Text><Text style={styles.cardCopy}>Saved to this topic on this device and included in cloud backup.</Text></View><Text style={styles.countBadge}>{questions.length}</Text></View>
              {questions.map((question) => {
                const due = isDue(question);
                const nextDate = question.nextReviewAt ? new Date(question.nextReviewAt) : null;
                return <View key={question.id} style={styles.questionRow}>
                  <View style={styles.grow}><Text style={styles.listQuestion} numberOfLines={2}>{question.question}</Text><Text style={styles.cardCopy}>{due ? 'Ready to review' : `Next review ${nextDate?.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`} · {question.createdBy === 'ai' ? 'AI draft' : 'Manual'}</Text></View>
                  <Pressable accessibilityRole="button" accessibilityLabel="Edit question" onPress={() => openEditQuestion(question)} style={styles.iconButton}><StudyIcon name="book" size={16} /></Pressable>
                  <Pressable accessibilityRole="button" accessibilityLabel="Delete question" onPress={() => deleteQuestion(question)} style={styles.iconButton}><StudyIcon name="x" size={16} /></Pressable>
                </View>;
              })}
            </> : null}
          </>}
        </PullToRefreshScrollView>
      </KeyboardAvoidingView>
      {manualModal}
      {aiModal}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: appColor('#F7FBFE', 'background') },
  flex: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 36, gap: 15 },
  backButton: { alignSelf: 'flex-start', paddingVertical: 5 },
  backText: { color: appColor('#3684A2', 'text'), fontSize: 14, fontWeight: '700' },
  pageHeader: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  headerIcon: { width: 48, height: 48, borderRadius: 15, backgroundColor: appColor('#E8F5FA', 'background'), alignItems: 'center', justifyContent: 'center' },
  grow: { flex: 1 },
  title: { color: appColor('#17324D', 'text'), fontSize: 26, fontWeight: '800' },
  subtitle: { color: appColor('#738795', 'text'), fontSize: 14, marginTop: 3 },
  statsCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', paddingVertical: 15, borderRadius: 18, backgroundColor: appColor('#FFFFFF', 'background'), borderWidth: 1, borderColor: appColor('#E6EDF1', 'border') },
  stat: { alignItems: 'center', gap: 3, flex: 1 },
  statValue: { color: appColor('#17324D', 'text'), fontSize: 20, fontWeight: '800' },
  statLabel: { color: appColor('#778B98', 'text'), fontSize: 10, fontWeight: '700' },
  statDivider: { width: 1, height: 32, backgroundColor: appColor('#E5EDF1', 'border') },
  actionsRow: { flexDirection: 'row', gap: 10 },
  aiButton: { flex: 1, minHeight: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#328FB5', borderRadius: 14 },
  addButton: { minWidth: 82, minHeight: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, backgroundColor: appColor('#FFFFFF', 'background'), borderRadius: 14, borderWidth: 1, borderColor: appColor('#DDE8ED', 'border') },
  addButtonText: { color: appColor('#337F9E', 'text'), fontSize: 13, fontWeight: '800' },
  primaryWide: { minHeight: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: '#328FB5', paddingHorizontal: 14 },
  primaryButtonText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  secondaryWide: { minHeight: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: appColor('#FFFFFF', 'background'), borderWidth: 1, borderColor: appColor('#DDE8ED', 'border') },
  secondaryButtonText: { color: appColor('#3E778F', 'text'), fontSize: 13, fontWeight: '800' },
  caughtUpCard: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, backgroundColor: appColor('#EAF7F1', 'background'), borderRadius: 15 },
  caughtUpTitle: { color: appColor('#265C4D', 'text'), fontSize: 13, fontWeight: '800' },
  sectionTitle: { color: appColor('#17324D', 'text'), fontSize: 17, fontWeight: '800' },
  cardCopy: { color: appColor('#748895', 'text'), fontSize: 12, lineHeight: 18, marginTop: 3 },
  emptyCard: { alignItems: 'center', gap: 8, padding: 22, backgroundColor: appColor('#FFFFFF', 'background'), borderWidth: 1, borderColor: appColor('#E6EDF1', 'border'), borderRadius: 18 },
  emptyIcon: { width: 54, height: 54, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: appColor('#EEF7FA', 'background') },
  listHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
  countBadge: { color: appColor('#3F7E98', 'text'), fontSize: 12, fontWeight: '800', backgroundColor: appColor('#E8F4F8', 'background'), borderRadius: 10, paddingHorizontal: 9, paddingVertical: 5 },
  questionRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: appColor('#FFFFFF', 'background'), borderRadius: 15, borderWidth: 1, borderColor: appColor('#E6EDF1', 'border'), padding: 11 },
  listQuestion: { color: appColor('#17324D', 'text'), fontSize: 13, fontWeight: '700', lineHeight: 19 },
  iconButton: { width: 34, height: 34, borderRadius: 11, backgroundColor: appColor('#F1F7F9', 'background'), alignItems: 'center', justifyContent: 'center' },
  sessionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  fieldLabel: { color: appColor('#77909F', 'text'), fontSize: 10, fontWeight: '800', letterSpacing: 0.8, marginBottom: 7 },
  exitSession: { color: appColor('#4A8199', 'text'), fontSize: 12, fontWeight: '700' },
  progressTrack: { height: 7, backgroundColor: appColor('#DFEAF0', 'background'), borderRadius: 8, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 8, backgroundColor: '#45A1C3' },
  questionCard: { padding: 18, gap: 13, borderRadius: 20, backgroundColor: appColor('#FFFFFF', 'background'), borderWidth: 1, borderColor: appColor('#E6EDF1', 'border') },
  questionText: { color: appColor('#17324D', 'text'), fontSize: 21, fontWeight: '700', lineHeight: 30, marginBottom: 3 },
  answerBox: { gap: 5, padding: 14, borderRadius: 14, backgroundColor: appColor('#EFF8FB', 'background') },
  answerText: { color: appColor('#29495D', 'text'), fontSize: 15, lineHeight: 23 },
  ratingQuestion: { color: appColor('#17324D', 'text'), fontSize: 14, fontWeight: '800', marginTop: 3 },
  ratingGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  ratingButton: { flexGrow: 1, flexBasis: '45%', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderRadius: 13, borderWidth: 1 },
  rating_again: { backgroundColor: appColor('#FFF3F1', 'background'), borderColor: appColor('#F4D8D2', 'border') },
  rating_hard: { backgroundColor: appColor('#FFF8ED', 'background'), borderColor: appColor('#F0E1C8', 'border') },
  rating_good: { backgroundColor: appColor('#EFF8FC', 'background'), borderColor: appColor('#D5EAF3', 'border') },
  rating_easy: { backgroundColor: appColor('#EFF8F3', 'background'), borderColor: appColor('#D4EADF', 'border') },
  ratingTitle: { color: appColor('#29495D', 'text'), fontSize: 13, fontWeight: '800' },
  ratingWhen: { color: appColor('#788B97', 'text'), fontSize: 10, marginTop: 3 },
  saving: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  finishedCard: { alignItems: 'center', gap: 9, padding: 20, backgroundColor: appColor('#FFFFFF', 'background'), borderWidth: 1, borderColor: appColor('#E6EDF1', 'border'), borderRadius: 20 },
  finishedIcon: { width: 48, height: 48, borderRadius: 16, backgroundColor: appColor('#EAF7F1', 'background'), alignItems: 'center', justifyContent: 'center' },
  summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, width: '100%', marginVertical: 7 },
  summaryTile: { flex: 1, minWidth: '43%', alignItems: 'center', padding: 12, backgroundColor: appColor('#F5F9FB', 'background'), borderRadius: 13 },
  summaryValue: { color: appColor('#17324D', 'text'), fontSize: 19, fontWeight: '800' },
  summaryLabel: { color: appColor('#718594', 'text'), fontSize: 11, marginTop: 3 },
  errorCard: { padding: 14, borderRadius: 14, backgroundColor: appColor('#FFF2F0', 'background') },
  errorText: { color: appColor('#9B3C34', 'text'), fontSize: 13 },
  retryText: { color: appColor('#327E9D', 'text'), fontWeight: '800', marginTop: 6 },
  loading: { alignItems: 'center', gap: 9, padding: 28 },
  modalKeyboard: { flex: 1 },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(14, 31, 43, 0.42)' },
  modalScroll: { maxHeight: '92%' },
  modalScrollContent: { flexGrow: 1, justifyContent: 'flex-end', padding: 14 },
  modalCard: { padding: 18, borderRadius: 22, backgroundColor: appColor('#F9FCFD', 'background'), gap: 9 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 },
  aiBadge: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: appColor('#E8F5FA', 'background') },
  modalTitle: { color: appColor('#17324D', 'text'), fontSize: 19, fontWeight: '800' },
  choiceRow: { flexDirection: 'row', gap: 7 },
  choice: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 38, backgroundColor: appColor('#FFFFFF', 'background'), borderRadius: 11, borderWidth: 1, borderColor: appColor('#E1E9ED', 'border') },
  choiceSelected: { backgroundColor: appColor('#E8F5FA', 'background'), borderColor: appColor('#73B5CD', 'border') },
  choiceText: { color: appColor('#5F7684', 'text'), fontSize: 11, fontWeight: '700' },
  choiceTextSelected: { color: appColor('#2E7795', 'text') },
  textInput: { minHeight: 46, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, backgroundColor: appColor('#FFFFFF', 'background'), borderWidth: 1, borderColor: appColor('#DFE8EC', 'border'), color: appColor('#17324D', 'text'), fontSize: 14, lineHeight: 20 },
  multiline: { minHeight: 110, textAlignVertical: 'top' },
  notesInput: { minHeight: 112, textAlignVertical: 'top' },
  answerDraft: { minHeight: 68, textAlignVertical: 'top' },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 9, marginTop: 8 },
  secondaryButton: { minHeight: 43, paddingHorizontal: 14, borderRadius: 12, backgroundColor: appColor('#EFF4F6', 'background'), alignItems: 'center', justifyContent: 'center' },
  primaryButton: { minHeight: 43, paddingHorizontal: 15, borderRadius: 12, backgroundColor: '#328FB5', alignItems: 'center', justifyContent: 'center' },
  progressStatus: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 5 },
  draftCard: { padding: 11, gap: 8, backgroundColor: appColor('#F2F8FA', 'background'), borderRadius: 14, marginTop: 8 },
  draftHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
});
