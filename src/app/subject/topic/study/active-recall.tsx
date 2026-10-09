import { cardShadow } from '@/components/gloss';
import { IconChip } from '@/components/study/icon-chip';
import { ProgressBar } from '@/components/charts';
import { ink, p, useProgressPalette } from '@/components/progress/theme';
import PullToRefreshScrollView from '@/components/pull-to-refresh-scroll-view';
import { Chips, PillButton, ScreenBar, SectionHeader, studyStyles } from '@/components/study/study-ui';
import { TopicNotesField, useTopicNotes } from '@/components/study/topic-notes';
import { StudyIcon } from '@/components/study-icon';
import { appColor } from '@/constants/adaptive-color';
import { ui } from '@/constants/ui';
import { useStudyData } from '@/hooks/use-study-data';
import { generateAIActiveRecall } from '@/services/ai-api';
import { useAppSettings } from '@/services/app-settings-context';
import { formatReviewInterval } from '@/services/localization';
import { buildRecallQueue, isRecallDifficult, isRecallDue, recallRememberedRate, type RecallMode } from '@/services/recall-session';
import { previewReviewIntervals, scheduleReview, type ReviewRating } from '@/services/spaced-repetition';
import { getActiveRecallQuestionsForTopic, getAIPreferences, saveActiveRecallProgress, saveActiveRecallQuestionsForTopic } from '@/services/storage';
import { calculateTopicMastery } from '@/services/topic-mastery';
import type { ActiveRecallQuestion, StudyActivity } from '@/types/study';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const param = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] ?? '' : value ?? '');
const RATINGS: ReviewRating[] = ['again', 'hard', 'good', 'easy'];
const RATING_COLOR: Record<ReviewRating, string> = { again: '#D03B3B', hard: '#C98500', good: '#2A78D6', easy: '#0CA30C' };
const AI_COUNT_CHOICES = [5, 10, 20, 30, 50];
const SESSION_COUNT_CHOICES = ['10', '20', '30', '0'] as const;
const PREVIEW_QUESTIONS = 3;

type Counts = Record<ReviewRating, number>;
type Draft = { key: string; question: string; answer: string };
type Difficulty = 'easy' | 'medium' | 'hard';
const noCounts = (): Counts => ({ again: 0, hard: 0, good: 0, easy: 0 });

/**
 * Active Recall for one topic: open questions the student answers from
 * memory, then rates. The rating decides when each question comes back.
 */
export default function ActiveRecallScreen() {
  const params = useLocalSearchParams<{ id?: string | string[]; name?: string | string[]; subjectId?: string | string[] }>();
  const topicId = param(params.id);
  const { preferences } = useAppSettings();
  const language = preferences.language;
  const L = (en: string, no: string) => (language === 'no' ? no : en);
  const palette = useProgressPalette();
  const { metrics, reload } = useStudyData();

  const topic = metrics?.topics.find((item) => String(item.id) === topicId);
  const topicName = topic?.name ?? (param(params.name) || L('Topic', 'Tema'));
  const subjectName = topic?.subjectName ?? '';
  const recallProgress = topic ? calculateTopicMastery({ ...topic, daysSinceLastStudy: topic.daysSinceStudy }).parts.recall : 0;

  const [questions, setQuestions] = useState<ActiveRecallQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showAll, setShowAll] = useState(false);

  // Session settings.
  const [mode, setMode] = useState<RecallMode | null>(null);
  const [sessionCount, setSessionCount] = useState<(typeof SESSION_COUNT_CHOICES)[number]>('10');
  const [writeFirst, setWriteFirst] = useState(false);

  // The session.
  const [queue, setQueue] = useState<ActiveRecallQuestion[]>([]);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [finished, setFinished] = useState(false);
  const [ownAnswer, setOwnAnswer] = useState('');
  const [totals, setTotals] = useState<Counts>(noCounts);
  const [struggledIds, setStruggledIds] = useState<number[]>([]);
  const [rateFailed, setRateFailed] = useState(false);
  const [sessionMinutes, setSessionMinutes] = useState(1);
  const startedAt = useRef(0);
  const activityId = useRef(0);

  // Add or edit one question.
  const [editorVisible, setEditorVisible] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draftQuestion, setDraftQuestion] = useState('');
  const [draftAnswer, setDraftAnswer] = useState('');
  const [editorError, setEditorError] = useState('');

  // Create with AI.
  const [aiVisible, setAIVisible] = useState(false);
  const [aiCount, setAICount] = useState(10);
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState(0);
  const [drafts, setDrafts] = useState<Draft[] | null>(null);
  const [aiError, setAIError] = useState('');
  const topicNotes = useTopicNotes(topicId);

  const loadQuestions = useCallback(async () => {
    try {
      setQuestions(await getActiveRecallQuestionsForTopic(topicId));
      setLoadFailed(false);
    } catch (error) {
      console.warn('Could not load the Active Recall questions:', error);
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }, [topicId]);

  useEffect(() => {
    let active = true;
    void loadQuestions();
    void getAIPreferences().then((prefs) => {
      if (!active) return;
      setAICount(prefs.questionCount);
      setDifficulty(prefs.difficulty);
    });
    return () => { active = false; };
  }, [loadQuestions]);

  const dueCount = questions.filter((question) => isRecallDue(question)).length;
  const difficultCount = questions.filter(isRecallDifficult).length;
  const remembered = recallRememberedRate(questions);
  // Until she chooses, practise what is due, or everything when nothing is due.
  const activeMode: RecallMode = mode ?? (dueCount > 0 ? 'due' : 'all');
  const available = buildRecallQueue(questions, { mode: activeMode, count: Number(sessionCount) }).length;

  async function persist(next: ActiveRecallQuestion[]) {
    setSaving(true);
    try {
      await saveActiveRecallQuestionsForTopic(topicId, next);
      setQuestions(next);
      return true;
    } catch (error) {
      console.warn('Could not save the Active Recall questions:', error);
      return false;
    } finally {
      setSaving(false);
    }
  }

  // ----- Session -----
  function beginSession(selected: ActiveRecallQuestion[]) {
    if (!selected.length) return;
    setQueue(selected);
    setIndex(0);
    setRevealed(false);
    setFinished(false);
    setOwnAnswer('');
    setTotals(noCounts());
    setStruggledIds([]);
    setRateFailed(false);
    startedAt.current = Date.now();
    activityId.current = Date.now();
  }

  function startSession() {
    beginSession(buildRecallQueue(questions, { mode: activeMode, count: Number(sessionCount) }));
  }

  function endSession() {
    setQueue([]);
    setFinished(false);
    setRevealed(false);
    setOwnAnswer('');
    void loadQuestions();
    void reload();
  }

  const current = queue[index];

  async function rate(rating: ReviewRating) {
    if (!current || saving) return;
    const ratedAt = new Date();
    const updated: ActiveRecallQuestion = {
      ...current,
      ...scheduleReview({ ...current, lastReviewedAt: current.lastRatedAt }, rating, ratedAt),
      lastRatedAt: ratedAt.toISOString(),
      againCount: (current.againCount ?? 0) + (rating === 'again' ? 1 : 0),
      hardCount: (current.hardCount ?? 0) + (rating === 'hard' ? 1 : 0),
      goodCount: (current.goodCount ?? 0) + (rating === 'good' ? 1 : 0),
      easyCount: (current.easyCount ?? 0) + (rating === 'easy' ? 1 : 0),
    };
    const nextQuestions = questions.map((question) => (question.id === updated.id ? updated : question));
    const nextTotals = { ...totals, [rating]: totals[rating] + 1 };
    const answered = nextTotals.again + nextTotals.hard + nextTotals.good + nextTotals.easy;
    const durationSeconds = Math.max(1, Math.round((Date.now() - startedAt.current) / 1000));
    // One activity per session, updated after every rating so nothing is lost if she stops early.
    const activity: StudyActivity = {
      id: activityId.current, topicId, topicName, activity: 'active_recall', completedAt: ratedAt.toISOString(), durationSeconds,
      questionCount: answered, correctCount: nextTotals.good + nextTotals.easy, wrongCount: nextTotals.again + nextTotals.hard,
      score: Math.round(((nextTotals.good + nextTotals.easy) / answered) * 100),
      againCount: nextTotals.again, hardCount: nextTotals.hard, goodCount: nextTotals.good, easyCount: nextTotals.easy,
    };
    setSaving(true);
    try {
      await saveActiveRecallProgress(topicId, nextQuestions, activity);
    } catch (error) {
      console.warn('Could not save the Active Recall rating:', error);
      setRateFailed(true);
      return;
    } finally {
      setSaving(false);
    }
    setRateFailed(false);
    setQuestions(nextQuestions);
    setTotals(nextTotals);
    if (rating === 'again' || rating === 'hard') setStruggledIds((ids) => [...ids, updated.id]);
    if (index < queue.length - 1) {
      setIndex((value) => value + 1);
      setRevealed(false);
      setOwnAnswer('');
      return;
    }
    setSessionMinutes(Math.max(1, Math.round(durationSeconds / 60)));
    setFinished(true);
  }

  // ----- Add / edit -----
  function openEditor(question: ActiveRecallQuestion | null) {
    setEditingId(question?.id ?? null);
    setDraftQuestion(question?.question ?? '');
    setDraftAnswer(question?.answer ?? '');
    setEditorError('');
    setEditorVisible(true);
  }

  async function saveQuestion() {
    const question = draftQuestion.trim();
    const answer = draftAnswer.trim();
    if (!question || !answer) {
      setEditorError(L('Enter both a question and an answer.', 'Skriv inn både spørsmål og svar.'));
      return;
    }
    const next = editingId === null
      ? [...questions, { id: Date.now(), question, answer, createdBy: 'manual' as const }]
      : questions.map((item) => (item.id === editingId ? { ...item, question, answer } : item));
    if (await persist(next)) setEditorVisible(false);
    else setEditorError(L('The question could not be saved. Try again.', 'Spørsmålet kunne ikke lagres. Prøv igjen.'));
  }

  function deleteQuestion(question: ActiveRecallQuestion) {
    Alert.alert(L('Delete this question?', 'Slette dette spørsmålet?'), L('It is removed from this topic for good.', 'Det fjernes fra temaet for godt.'), [
      { text: L('Cancel', 'Avbryt'), style: 'cancel' },
      {
        text: L('Delete', 'Slett'), style: 'destructive',
        onPress: () => {
          void persist(questions.filter((item) => item.id !== question.id)).then((saved) => {
            if (!saved) Alert.alert(L('Could not delete', 'Kunne ikke slette'), L('Try again.', 'Prøv igjen.'));
          });
        },
      },
    ]);
  }

  // ----- AI -----
  function openAI() {
    setDrafts(null);
    setAIError('');
    void topicNotes.load();
    setAIVisible(true);
  }

  function closeAI() {
    if (generating || saving) return;
    setAIVisible(false);
    setDrafts(null);
    void topicNotes.load();
  }

  async function generate() {
    if (generating) return;
    setGenerating(true);
    setGenerated(0);
    setAIError('');
    try {
      const material = await topicNotes.save();
      const struggled = questions.filter((item) => (item.againCount ?? 0) + (item.hardCount ?? 0) > 0).length;
      const created = await generateAIActiveRecall({
        subjectName: subjectName || 'Medical studies',
        topicName,
        questionCount: aiCount,
        sourceMaterial: material || undefined,
        previousQuestions: questions.map((item) => item.question),
        struggleSummary: struggled ? `${struggled} saved question${struggled === 1 ? '' : 's'} have been marked Again or Hard; prioritize related foundational concepts.` : undefined,
        difficulty,
        onProgress: setGenerated,
      });
      const stamp = Date.now();
      setDrafts(created.map((item, draftIndex) => ({ key: `${stamp}-${draftIndex}`, question: item.question, answer: item.answer })));
    } catch (error) {
      setAIError(error instanceof Error ? error.message : L('The questions could not be created. Try again.', 'Spørsmålene kunne ikke lages. Prøv igjen.'));
    } finally {
      setGenerating(false);
    }
  }

  async function saveDrafts() {
    const ready = (drafts ?? []).map((item) => ({ question: item.question.trim(), answer: item.answer.trim() })).filter((item) => item.question && item.answer);
    if (!ready.length) return;
    const stamp = Date.now();
    const additions: ActiveRecallQuestion[] = ready.map((item, draftIndex) => ({ id: stamp + draftIndex, ...item, createdBy: 'ai' }));
    if (await persist([...questions, ...additions])) {
      setDrafts(null);
      setAIVisible(false);
    } else {
      setAIError(L('The questions could not be saved. Try again.', 'Spørsmålene kunne ikke lagres. Prøv igjen.'));
    }
  }

  const ratingLabel: Record<ReviewRating, string> = { again: L('Again', 'Igjen'), hard: L('Hard', 'Vanskelig'), good: L('Good', 'Bra'), easy: L('Easy', 'Lett') };
  const difficultyLabel: Record<Difficulty, string> = { easy: L('Easy', 'Lett'), medium: L('Medium', 'Middels'), hard: L('Hard', 'Vanskelig') };
  const locale = language === 'no' ? 'nb-NO' : 'en-GB';

  // ----- Session screens -----
  if (queue.length > 0) {
    const answered = totals.again + totals.hard + totals.good + totals.easy;
    const bar = (
      <View style={styles.bar}>
        <Pressable accessibilityRole="button" accessibilityLabel={L('End session', 'Avslutt økten')} onPress={endSession} style={({ pressed }) => [styles.barButton, pressed && p.pressed]} hitSlop={8}>
          <StudyIcon name="x" size={18} color={ink.secondary} />
        </Pressable>
        <Text style={styles.barTitle} numberOfLines={1}>{topicName}</Text>
        <View style={styles.barButton} />
      </View>
    );

    if (finished || !current) {
      const again = questions.filter((question) => struggledIds.includes(question.id));
      return (
        <SafeAreaView style={ui.container} edges={['top', 'bottom']}>
          <Stack.Screen options={{ headerShown: false }} />
          <View style={styles.page}>
            {bar}
            <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
              <View style={[p.card, styles.doneCard]}>
                <View style={[styles.doneIcon, { backgroundColor: palette.accent }]}><StudyIcon name="check" size={26} color="#FFFFFF" /></View>
                <Text style={styles.doneTitle}>{L('Session complete', 'Økten er fullført')}</Text>
                <Text style={[p.body, styles.centered]}>{answered} {L('questions', 'spørsmål')} · {sessionMinutes} min</Text>
                <View style={styles.summary}>
                  {RATINGS.map((rating) => (
                    <View key={rating} style={styles.summaryItem}>
                      <View style={styles.inline}><View style={[p.legendDot, { backgroundColor: RATING_COLOR[rating] }]} /><Text style={styles.summaryValue}>{totals[rating]}</Text></View>
                      <Text style={p.small}>{ratingLabel[rating]}</Text>
                    </View>
                  ))}
                </View>
                <Text style={[p.small, styles.centered]}>{L('Each question comes back when it is due, based on how you rated it.', 'Hvert spørsmål kommer tilbake når det forfaller, ut fra hvordan du vurderte det.')}</Text>
              </View>
              {again.length ? (
                <Pressable accessibilityRole="button" onPress={() => beginSession(again)} style={({ pressed }) => [p.button, styles.wide, styles.buttonRow, { backgroundColor: palette.accent }, pressed && p.pressed]}>
                  <StudyIcon name="undo" size={15} color="#FFFFFF" /><Text style={p.buttonText}>{L(`Go through the ${again.length} hard ones again`, `Ta de ${again.length} vanskelige en gang til`)}</Text>
                </Pressable>
              ) : null}
              <Pressable accessibilityRole="button" onPress={endSession} style={({ pressed }) => [again.length ? p.outlineButton : p.button, styles.wide, !again.length && { backgroundColor: palette.accent }, pressed && p.pressed]}>
                <Text style={again.length ? p.outlineButtonText : p.buttonText}>{L('Done', 'Ferdig')}</Text>
              </Pressable>
            </ScrollView>
          </View>
        </SafeAreaView>
      );
    }

    const intervals = previewReviewIntervals({ ...current, lastReviewedAt: current.lastRatedAt });
    return (
      <SafeAreaView style={ui.container} edges={['top', 'bottom']}>
        <Stack.Screen options={{ headerShown: false }} />
        <KeyboardAvoidingView style={styles.page} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          {bar}
          <View style={styles.progress}>
            <Text style={p.small}>{L('Question', 'Spørsmål')} {index + 1} {L('of', 'av')} {queue.length}</Text>
            <ProgressBar value={(index / queue.length) * 100} color={palette.accent} trackColor={palette.track} height={6} />
          </View>

          <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <View style={[p.card, styles.card]}>
              <Text style={styles.side}>{L('Question', 'Spørsmål')}</Text>
              <Text style={styles.question}>{current.question}</Text>
              {writeFirst && !revealed ? (
                <TextInput
                  value={ownAnswer}
                  onChangeText={setOwnAnswer}
                  style={[ui.textInput, styles.ownAnswer]}
                  placeholder={L('Write what you remember', 'Skriv det du husker')}
                  placeholderTextColor={appColor('#91A2AE', 'text')}
                  multiline
                  textAlignVertical="top"
                  accessibilityLabel={L('Your answer', 'Ditt svar')}
                />
              ) : null}
              {revealed ? (
                <>
                  {ownAnswer.trim() ? (
                    <View style={p.inset}>
                      <Text style={styles.side}>{L('Your answer', 'Ditt svar')}</Text>
                      <Text style={[p.body, styles.ownShown]}>{ownAnswer.trim()}</Text>
                    </View>
                  ) : null}
                  <View style={styles.divider} />
                  <Text style={styles.side}>{L('Answer', 'Svar')}</Text>
                  <Text style={styles.answer}>{current.answer}</Text>
                </>
              ) : !writeFirst ? (
                <Text style={[p.small, styles.hint]}>{L('Say the answer out loud or in your head before you check.', 'Si svaret høyt eller inni deg før du sjekker.')}</Text>
              ) : null}
            </View>
          </ScrollView>

          <View style={styles.footer}>
            {rateFailed ? <Text style={styles.error}>{L('The rating could not be saved. Try again.', 'Vurderingen kunne ikke lagres. Prøv igjen.')}</Text> : null}
            {revealed ? (
              <>
                <Text style={[p.small, styles.centered]}>{L('How well did you remember it?', 'Hvor godt husket du det?')}</Text>
                <View style={styles.ratings}>
                  {RATINGS.map((rating) => (
                    <Pressable
                      key={rating}
                      accessibilityRole="button"
                      accessibilityLabel={`${ratingLabel[rating]}, ${formatReviewInterval(intervals[rating], language)}`}
                      disabled={saving}
                      onPress={() => { void rate(rating); }}
                      style={({ pressed }) => [styles.rating, (pressed || saving) && p.pressed]}
                    >
                      <View style={[styles.ratingMark, { backgroundColor: RATING_COLOR[rating] }]} />
                      <Text style={styles.ratingLabel}>{ratingLabel[rating]}</Text>
                      <Text style={styles.ratingWhen} numberOfLines={1}>{formatReviewInterval(intervals[rating], language)}</Text>
                    </Pressable>
                  ))}
                </View>
              </>
            ) : (
              <Pressable accessibilityRole="button" onPress={() => setRevealed(true)} style={({ pressed }) => [p.button, styles.big, { backgroundColor: palette.accent }, pressed && p.pressed]}>
                <Text style={styles.bigText}>{L('Show answer', 'Vis svar')}</Text>
              </Pressable>
            )}
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  // ----- Sheets -----
  const editor = (
    <Modal visible={editorVisible} transparent animationType="slide" onRequestClose={() => { if (!saving) setEditorVisible(false); }}>
      <KeyboardAvoidingView style={styles.modalKeyboard} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={ui.modalBackdrop}>
          <ScrollView contentContainerStyle={styles.modalScroll} keyboardShouldPersistTaps="handled">
            <View style={ui.modalCard}>
              <Text style={ui.modalTitle}>{editingId === null ? L('New question', 'Nytt spørsmål') : L('Edit question', 'Rediger spørsmål')}</Text>
              <Text style={ui.fieldLabel}>{L('QUESTION', 'SPØRSMÅL')}</Text>
              <TextInput value={draftQuestion} onChangeText={(value) => { setDraftQuestion(value); setEditorError(''); }} style={[ui.textInput, styles.multiline]} placeholder={L('What should you be able to explain?', 'Hva skal du kunne forklare?')} placeholderTextColor={appColor('#91A2AE', 'text')} multiline maxLength={600} autoFocus accessibilityLabel={L('Question', 'Spørsmål')} />
              <Text style={ui.fieldLabel}>{L('ANSWER', 'SVAR')}</Text>
              <TextInput value={draftAnswer} onChangeText={(value) => { setDraftAnswer(value); setEditorError(''); }} style={[ui.textInput, styles.multiline]} placeholder={L('The answer', 'Svaret')} placeholderTextColor={appColor('#91A2AE', 'text')} multiline maxLength={3000} accessibilityLabel={L('Answer', 'Svar')} />
              {editorError ? <Text style={ui.formError}>{editorError}</Text> : null}
              <View style={ui.modalActions}>
                <Pressable accessibilityRole="button" style={ui.secondaryButton} onPress={() => setEditorVisible(false)} disabled={saving}><Text style={ui.secondaryButtonText}>{L('Cancel', 'Avbryt')}</Text></Pressable>
                <Pressable accessibilityRole="button" style={[ui.primaryButton, saving && ui.disabled]} onPress={() => { void saveQuestion(); }} disabled={saving}>
                  {saving ? <ActivityIndicator color="#FFFFFF" /> : <Text style={ui.primaryButtonText}>{L('Save question', 'Lagre spørsmål')}</Text>}
                </Pressable>
              </View>
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );

  const aiModal = (
    <Modal visible={aiVisible} transparent animationType="slide" onRequestClose={closeAI}>
      <KeyboardAvoidingView style={styles.modalKeyboard} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={ui.modalBackdrop}>
          <ScrollView style={styles.modalMax} contentContainerStyle={styles.modalScroll} keyboardShouldPersistTaps="handled" keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'} automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}>
            <View style={ui.modalCard}>
              <View style={ui.modalHeader}>
                <View style={ui.modalIcon}><StudyIcon name="sparkles" size={18} color={palette.accent} /></View>
                <View style={ui.grow}>
                  <Text style={ui.modalTitle}>{drafts ? L('Check the questions', 'Se over spørsmålene') : L('Create questions with AI', 'Lag spørsmål med AI')}</Text>
                  <Text style={ui.cardDescription} numberOfLines={2}>{drafts ? L('Edit or remove anything before saving. Nothing is saved yet.', 'Rediger eller fjern før du lagrer. Ingenting er lagret ennå.') : [topicName, subjectName].filter(Boolean).join(' · ')}</Text>
                </View>
              </View>

              {!drafts ? (
                <>
                  <Text style={ui.fieldLabel}>{L('HOW MANY QUESTIONS', 'ANTALL SPØRSMÅL')}</Text>
                  <Chips value={String(aiCount)} onChange={(value) => setAICount(Number(value))} items={AI_COUNT_CHOICES.map((value) => ({ key: String(value), label: String(value) }))} />
                  <Text style={ui.fieldLabel}>{L('DIFFICULTY', 'VANSKELIGHETSGRAD')}</Text>
                  <Chips<Difficulty> value={difficulty} onChange={setDifficulty} items={(['easy', 'medium', 'hard'] as const).map((level) => ({ key: level, label: difficultyLabel[level] }))} />
                  <TopicNotesField state={topicNotes} disabled={generating} />
                  <Text style={p.small}>{L('AI avoids questions you already have and focuses on what you rated Again or Hard.', 'AI unngår spørsmål du allerede har, og legger vekt på det du har vurdert som Igjen eller Vanskelig.')}</Text>
                  {generating ? <View style={styles.inline}><ActivityIndicator color={palette.accent} /><Text style={p.body}>{L(`Creating ${generated} of ${aiCount} questions`, `Lager ${generated} av ${aiCount} spørsmål`)}</Text></View> : null}
                </>
              ) : drafts.map((draft, draftIndex) => (
                <View key={draft.key} style={styles.draft}>
                  <View style={styles.draftTop}>
                    <Text style={ui.fieldLabel}>{L('QUESTION', 'SPØRSMÅL')} {draftIndex + 1}</Text>
                    <Pressable accessibilityRole="button" accessibilityLabel={L('Remove question', 'Fjern spørsmål')} onPress={() => setDrafts((items) => (items ?? []).filter((item) => item.key !== draft.key))} hitSlop={10}>
                      <StudyIcon name="x" size={15} color={ink.muted} />
                    </Pressable>
                  </View>
                  <TextInput value={draft.question} onChangeText={(value) => setDrafts((items) => (items ?? []).map((item) => (item.key === draft.key ? { ...item, question: value } : item)))} style={[ui.textInput, styles.draftInput]} multiline accessibilityLabel={L('Question', 'Spørsmål')} />
                  <TextInput value={draft.answer} onChangeText={(value) => setDrafts((items) => (items ?? []).map((item) => (item.key === draft.key ? { ...item, answer: value } : item)))} style={[ui.textInput, styles.draftInput]} multiline accessibilityLabel={L('Answer', 'Svar')} />
                </View>
              ))}

              {aiError ? <Text style={ui.formError}>{aiError}</Text> : null}
              <View style={ui.modalActions}>
                <Pressable accessibilityRole="button" style={ui.secondaryButton} onPress={closeAI} disabled={generating || saving}><Text style={ui.secondaryButtonText}>{drafts ? L('Discard', 'Forkast') : L('Cancel', 'Avbryt')}</Text></Pressable>
                {drafts ? (
                  <Pressable accessibilityRole="button" style={[ui.primaryButton, (saving || drafts.length === 0) && ui.disabled]} onPress={() => { void saveDrafts(); }} disabled={saving || drafts.length === 0}>
                    {saving ? <ActivityIndicator color="#FFFFFF" /> : <Text style={ui.primaryButtonText}>{L(`Save ${drafts.length} questions`, `Lagre ${drafts.length} spørsmål`)}</Text>}
                  </Pressable>
                ) : (
                  <Pressable accessibilityRole="button" style={[ui.primaryButton, generating && ui.disabled]} onPress={() => { void generate(); }} disabled={generating}>
                    <Text style={ui.primaryButtonText}>{L('Create questions', 'Lag spørsmål')}</Text>
                  </Pressable>
                )}
              </View>
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );

  // ----- Start page -----
  let body;
  if (loading) {
    body = <View style={styles.state}><ActivityIndicator color={palette.accent} /></View>;
  } else if (loadFailed) {
    body = <View style={styles.state}><Text style={[p.body, styles.centered]}>{L('The questions could not be loaded. Pull down to try again.', 'Spørsmålene kunne ikke lastes inn. Dra ned for å prøve igjen.')}</Text></View>;
  } else if (questions.length === 0) {
    body = (
      <View style={[p.card, p.empty]}>
        <IconChip name="brain" />
        <Text style={p.emptyTitle}>{L('No questions yet', 'Ingen spørsmål ennå')}</Text>
        <Text style={[p.body, studyStyles.centered]}>{L('Open questions you answer from memory. Let AI write them from your course material, or write your own.', 'Åpne spørsmål du svarer på fra hukommelsen. La AI skrive dem fra pensumet ditt, eller skriv dine egne.')}</Text>
        <Pressable accessibilityRole="button" onPress={openAI} style={({ pressed }) => [p.button, styles.wide, styles.buttonRow, { backgroundColor: palette.accent }, pressed && p.pressed]}>
          <StudyIcon name="sparkles" size={16} color="#FFFFFF" /><Text style={p.buttonText}>{L('Create with AI', 'Lag med AI')}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => openEditor(null)} style={({ pressed }) => [p.outlineButton, styles.wide, pressed && p.pressed]}>
          <Text style={p.outlineButtonText}>{L('Write a question', 'Skriv et spørsmål')}</Text>
        </Pressable>
      </View>
    );
  } else {
    const shown = showAll ? questions : questions.slice(0, PREVIEW_QUESTIONS);
    body = (
      <>
        <View style={[p.card, p.row]}>
          <IconChip name={dueCount ? 'brain' : 'check'} />
          <View style={p.grow}>
            <Text style={styles.rowTitle}>{dueCount ? L(`${dueCount} ${dueCount === 1 ? 'question' : 'questions'} due now`, `${dueCount} spørsmål har forfalt`) : L('Nothing due right now', 'Ingenting har forfalt nå')}</Text>
            <Text style={p.small}>{dueCount ? L('Answer them to keep them in memory.', 'Svar på dem for å holde dem i minnet.') : L('You can still practise below.', 'Du kan fortsatt øve nedenfor.')}</Text>
          </View>
          {dueCount ? <PillButton label={L('Start', 'Start')} onPress={() => beginSession(buildRecallQueue(questions, { mode: 'due' }))} /> : null}
        </View>

        <View style={p.card}>
          <View style={p.cardHeader}>
            <Text style={p.cardTitle}>{L('Active Recall progress', 'Fremgang med Active Recall')}</Text>
            <Text style={styles.percent}>{recallProgress}%</Text>
          </View>
          <ProgressBar value={recallProgress} color={palette.accent} trackColor={palette.track} height={8} />
          <View style={styles.stats}>
            <View style={styles.stat}><Text style={styles.statValue}>{remembered.answers}</Text><Text style={styles.statLabel}>{L('Answers', 'Svar')}</Text></View>
            <View style={styles.statDivider} />
            <View style={styles.stat}><Text style={styles.statValue}>{remembered.rate === null ? '–' : `${remembered.rate}%`}</Text><Text style={styles.statLabel}>{L('Remembered', 'Husket')}</Text></View>
            <View style={styles.statDivider} />
            <View style={styles.stat}><Text style={styles.statValue}>{difficultCount}</Text><Text style={styles.statLabel}>{L('Difficult', 'Vanskelige')}</Text></View>
          </View>
        </View>

        <SectionHeader title={L('Practice settings', 'Innstillinger for øving')} />
        <View style={p.card}>
          <Text style={styles.settingLabel}>{L('What to practise', 'Hva du vil øve på')}</Text>
          <Chips<RecallMode>
            value={activeMode}
            onChange={setMode}
            items={[
              { key: 'due', label: `${L('Due', 'Forfalte')} (${dueCount})` },
              { key: 'difficult', label: `${L('Difficult', 'Vanskelige')} (${difficultCount})` },
              { key: 'all', label: `${L('All', 'Alle')} (${questions.length})` },
            ]}
          />
          <Text style={styles.settingLabel}>{L('Number of questions', 'Antall spørsmål')}</Text>
          <Chips value={sessionCount} onChange={setSessionCount} items={SESSION_COUNT_CHOICES.map((value) => ({ key: value, label: value === '0' ? L('All', 'Alle') : value }))} />
          <View style={styles.toggle}>
            <View style={p.grow}>
              <Text style={styles.settingLabel}>{L('Write my answer first', 'Skriv svaret mitt først')}</Text>
              <Text style={p.small}>{L('Type what you remember, then compare with the answer.', 'Skriv det du husker, og sammenlign med svaret.')}</Text>
            </View>
            <Switch accessibilityLabel={L('Write my answer first', 'Skriv svaret mitt først')} value={writeFirst} onValueChange={setWriteFirst} trackColor={{ false: '#C9D6DC', true: palette.accent }} ios_backgroundColor="#C9D6DC" />
          </View>
        </View>
        <Pressable accessibilityRole="button" disabled={available === 0} onPress={startSession} style={({ pressed }) => [p.button, styles.big, styles.buttonRow, { backgroundColor: palette.accent }, available === 0 && ui.disabled, pressed && p.pressed]}>
          <StudyIcon name="play" size={15} color="#FFFFFF" />
          <Text style={styles.bigText}>{available === 0 ? L('No questions in this selection', 'Ingen spørsmål i dette utvalget') : L(`Start with ${available} ${available === 1 ? 'question' : 'questions'}`, `Start med ${available} spørsmål`)}</Text>
        </Pressable>

        <SectionHeader title={`${L('Your questions', 'Spørsmålene dine')} (${questions.length})`} action={questions.length > PREVIEW_QUESTIONS ? (showAll ? L('Show fewer', 'Vis færre') : L('See all', 'Se alle')) : undefined} onAction={() => setShowAll((value) => !value)} />
        <View style={styles.buttonRow}>
          <Pressable accessibilityRole="button" onPress={openAI} style={({ pressed }) => [p.outlineButton, p.grow, styles.buttonRow, pressed && p.pressed]}>
            <StudyIcon name="sparkles" size={15} color={palette.accent} /><Text style={p.outlineButtonText}>{L('Create with AI', 'Lag med AI')}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => openEditor(null)} style={({ pressed }) => [p.outlineButton, p.grow, styles.buttonRow, pressed && p.pressed]}>
            <StudyIcon name="plus" size={15} color={palette.accent} /><Text style={p.outlineButtonText}>{L('Add question', 'Legg til spørsmål')}</Text>
          </Pressable>
        </View>
        {shown.map((question) => {
          const next = question.nextReviewAt ? new Date(question.nextReviewAt) : null;
          const when = isRecallDue(question) || !next
            ? L('Due now', 'Forfalt nå')
            : `${L('Next review', 'Neste repetisjon')} ${next.toLocaleDateString(locale, { day: 'numeric', month: 'short' })}`;
          return (
            <View key={question.id} style={styles.questionRow}>
              <Pressable accessibilityRole="button" accessibilityLabel={L('Edit question', 'Rediger spørsmål')} onPress={() => openEditor(question)} style={({ pressed }) => [p.grow, pressed && p.pressed]}>
                <Text style={styles.rowQuestion} numberOfLines={2}>{question.question}</Text>
                <Text style={p.small} numberOfLines={2}>{question.answer}</Text>
                <Text style={styles.rowMeta}>
                  {when}
                  {isRecallDifficult(question) ? ` · ${L('Difficult', 'Vanskelig')}` : ''}
                  {question.createdBy === 'ai' ? ` · ${L('Made with AI', 'Laget med AI')}` : ''}
                </Text>
              </Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel={L('Delete question', 'Slett spørsmål')} onPress={() => deleteQuestion(question)} style={({ pressed }) => [styles.delete, pressed && p.pressed]} hitSlop={8}>
                <StudyIcon name="trash" size={17} color={ink.muted} />
              </Pressable>
            </View>
          );
        })}
      </>
    );
  }

  return (
    <SafeAreaView style={ui.container} edges={['top']}>
      <Stack.Screen options={{ headerShown: false }} />
      <PullToRefreshScrollView contentContainerStyle={studyStyles.content} showsVerticalScrollIndicator={false} onRefresh={async () => { await Promise.all([loadQuestions(), reload()]); }}>
        <ScreenBar backLabel={L('Back', 'Tilbake')} />
        <View>
          <Text style={styles.title} accessibilityRole="header">Active Recall</Text>
          <Text style={styles.subtitle} numberOfLines={1}>{[topicName, subjectName].filter(Boolean).join(' · ')}</Text>
        </View>
        {body}
      </PullToRefreshScrollView>
      {editor}
      {aiModal}
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
  percent: { color: ink.primary, fontSize: 18, fontWeight: '800' },
  stats: { flexDirection: 'row', alignItems: 'stretch' },
  stat: { flex: 1, alignItems: 'center', gap: 3 },
  statDivider: { width: StyleSheet.hairlineWidth, backgroundColor: appColor('#D8E6EC', 'border') },
  statValue: { color: ink.primary, fontSize: 19, fontWeight: '800' },
  statLabel: { color: ink.muted, fontSize: 11 },
  settingLabel: { color: ink.primary, fontSize: 14, fontWeight: '600' },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  big: { minHeight: 56, borderRadius: 18 },
  bigText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
  questionRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: 16, backgroundColor: appColor('#FFFFFF', 'background'), borderWidth: 1, borderColor: appColor('#E7F0F4', 'border'), ...cardShadow },
  rowQuestion: { color: ink.primary, fontSize: 14, fontWeight: '700', marginBottom: 3 },
  rowMeta: { color: ink.muted, fontSize: 11, marginTop: 6 },
  delete: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: appColor('#F4F8FA', 'background') },

  page: { flex: 1, paddingHorizontal: 20 },
  bar: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  barButton: { width: 44, height: 44, justifyContent: 'center' },
  barTitle: { flex: 1, color: ink.primary, fontSize: 16, fontWeight: '800', textAlign: 'center' },
  progress: { gap: 8, marginTop: 4 },
  scroll: { flexGrow: 1, paddingVertical: 16, gap: 12 },
  card: { flexGrow: 1, minHeight: 240, justifyContent: 'center', padding: 22, gap: 10 },
  side: { color: ink.muted, fontSize: 11, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase' },
  question: { color: ink.primary, fontSize: 21, lineHeight: 29, fontWeight: '700' },
  ownAnswer: { minHeight: 96, marginTop: 8 },
  ownShown: { marginTop: 4 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: appColor('#D8E6EC', 'border'), marginVertical: 8 },
  answer: { color: ink.primary, fontSize: 17, lineHeight: 26 },
  hint: { marginTop: 12 },
  footer: { gap: 10, paddingTop: 8, paddingBottom: 10 },
  error: { color: appColor('#A34338', 'text'), fontSize: 13, textAlign: 'center' },
  ratings: { flexDirection: 'row', gap: 8 },
  rating: { flex: 1, alignItems: 'center', gap: 4, paddingBottom: 10, borderRadius: 14, overflow: 'hidden', backgroundColor: appColor('#FFFFFF', 'background'), borderWidth: 1, borderColor: appColor('#E7F0F4', 'border'), ...cardShadow },
  ratingMark: { alignSelf: 'stretch', height: 4, marginBottom: 6 },
  ratingLabel: { color: ink.primary, fontSize: 14, fontWeight: '800' },
  ratingWhen: { color: ink.muted, fontSize: 10 },
  doneCard: { alignItems: 'center', paddingVertical: 26 },
  doneIcon: { width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center' },
  doneTitle: { color: ink.primary, fontSize: 22, fontWeight: '800' },
  summary: { flexDirection: 'row', alignSelf: 'stretch', marginTop: 6 },
  summaryItem: { flex: 1, alignItems: 'center', gap: 3 },
  summaryValue: { color: ink.primary, fontSize: 20, fontWeight: '800' },

  modalKeyboard: { flex: 1 },
  modalMax: { maxHeight: '92%' },
  modalScroll: { flexGrow: 1, justifyContent: 'flex-end' },
  multiline: { minHeight: 76, textAlignVertical: 'top' },
  draft: { gap: 7, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: appColor('#D8E6EC', 'border') },
  draftTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  draftInput: { minHeight: 44 },
});
