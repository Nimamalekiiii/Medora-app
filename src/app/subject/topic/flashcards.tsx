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
import { generateAIFlashcards } from '@/services/ai-api';
import { useAppSettings } from '@/services/app-settings-context';
import { isCardDue, type CardOrder } from '@/services/flashcard-session';
import { getAIPreferences, saveFlashcards, type AIPreferences } from '@/services/storage';
import { calculateTopicMastery } from '@/services/topic-mastery';
import type { Flashcard } from '@/types/study';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const param = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] ?? '' : value ?? '');
const SETTINGS_KEY = 'medexam_flashcard_session_settings';
const COUNT_CHOICES = ['10', '20', '30', '0'] as const;
const AI_COUNT_CHOICES = [10, 20, 30, 50];
const PREVIEW_CARDS = 3;

type SessionSettings = { count: string; order: CardOrder; answerFirst: boolean };
const DEFAULT_SETTINGS: SessionSettings = { count: '10', order: 'smart', answerFirst: false };

/** A topic's flashcards: what is due, how the cards are going, session settings, and the cards themselves. */
export default function FlashcardsScreen() {
  const params = useLocalSearchParams<{ id?: string | string[]; name?: string | string[]; subjectId?: string | string[] }>();
  const topicId = param(params.id);
  const { preferences } = useAppSettings();
  const language = preferences.language;
  const L = (en: string, no: string) => (language === 'no' ? no : en);
  const palette = useProgressPalette();
  const { loading, data, metrics, reload } = useStudyData();

  const topic = metrics?.topics.find((item) => String(item.id) === topicId);
  const topicName = topic?.name ?? (param(params.name) || L('Topic', 'Tema'));
  const subjectId = topic?.subjectId ?? param(params.subjectId);
  const subjectName = topic?.subjectName ?? '';
  const cards = (data?.cards ?? []).filter((card) => String(card.topicId) === topicId);

  const [settings, setSettings] = useState<SessionSettings>(DEFAULT_SETTINGS);
  const [showAll, setShowAll] = useState(false);
  const [busy, setBusy] = useState(false);

  // Add / edit one card.
  const [editorVisible, setEditorVisible] = useState(false);
  const [editing, setEditing] = useState<Flashcard | null>(null);
  const [front, setFront] = useState('');
  const [back, setBack] = useState('');
  const [editorError, setEditorError] = useState('');

  // Generate with AI.
  const [aiPreferences, setAIPreferences] = useState<AIPreferences | null>(null);
  const [aiVisible, setAIVisible] = useState(false);
  const [aiCount, setAICount] = useState(10);
  const topicNotes = useTopicNotes(topicId);
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState(0);
  const [drafts, setDrafts] = useState<Flashcard[] | null>(null);
  const [aiError, setAIError] = useState('');

  useEffect(() => {
    let active = true;
    void AsyncStorage.getItem(SETTINGS_KEY).then((raw) => {
      if (!active || !raw) return;
      try {
        const saved = JSON.parse(raw) as Partial<SessionSettings>;
        setSettings({
          count: COUNT_CHOICES.includes(saved.count as (typeof COUNT_CHOICES)[number]) ? String(saved.count) : DEFAULT_SETTINGS.count,
          order: saved.order === 'ordered' || saved.order === 'shuffled' ? saved.order : 'smart',
          answerFirst: saved.answerFirst === true,
        });
      } catch { /* Keep the defaults when the saved settings cannot be read. */ }
    });
    void getAIPreferences().then((value) => { if (active) { setAIPreferences(value); setAICount(AI_COUNT_CHOICES.includes(value.flashcardCount) ? value.flashcardCount : 10); } });
    return () => { active = false; };
  }, []);

  function updateSettings(change: Partial<SessionSettings>) {
    const next = { ...settings, ...change };
    setSettings(next);
    void AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(next)).catch(() => undefined);
  }

  /** Saves this topic's cards, leaving every other topic's cards untouched. */
  async function saveTopicCards(updated: Flashcard[]) {
    const others = (data?.cards ?? []).filter((card) => String(card.topicId) !== topicId);
    await saveFlashcards([...others, ...updated]);
  }

  const routeParams = { id: topicId, name: topicName, subjectId };
  const startDue = () => router.push({ pathname: '/subject/topic/study/review', params: routeParams });
  const startPractice = () => router.push({
    pathname: '/subject/topic/study/review',
    params: { ...routeParams, mode: 'practice', count: settings.count, order: settings.order, answerFirst: settings.answerFirst ? '1' : '0' },
  });

  function openEditor(card: Flashcard | null) {
    setEditing(card);
    setFront(card?.front ?? '');
    setBack(card?.back ?? '');
    setEditorError('');
    setEditorVisible(true);
  }

  async function saveCard() {
    if (busy) return;
    const question = front.trim();
    const answer = back.trim();
    if (!question || !answer) { setEditorError('Enter both a question and an answer.'); return; }
    setBusy(true);
    try {
      const updated = editing
        ? cards.map((card) => (card.id === editing.id ? { ...card, front: question, back: answer } : card))
        : [...cards, { id: `${topicId}-${Date.now()}`, topicId, topicName, front: question, back: answer, createdAt: new Date().toISOString(), createdBy: 'manual' as const }];
      await saveTopicCards(updated);
      setEditorVisible(false);
    } catch (error) {
      console.warn('Could not save the flashcard:', error);
      setEditorError('The card could not be saved. Try again.');
    } finally {
      setBusy(false);
    }
  }

  function deleteCard(card: Flashcard) {
    Alert.alert(L('Delete flashcard?', 'Slette flashcardet?'), card.front, [
      { text: L('Cancel', 'Avbryt'), style: 'cancel' },
      { text: L('Delete', 'Slett'), style: 'destructive', onPress: () => {
        void saveTopicCards(cards.filter((item) => item.id !== card.id)).catch((error) => {
          console.warn('Could not delete the flashcard:', error);
          Alert.alert(L('Could not delete', 'Kunne ikke slette'), L('Please try again.', 'Prøv igjen.'));
        });
      } },
    ]);
  }

  function openAI() {
    if (aiPreferences && !aiPreferences.generateFlashcards) {
      Alert.alert(L('AI flashcards are off', 'AI-flashcards er slått av'), L('Turn on flashcard generation in Settings, AI preferences.', 'Slå på generering av flashcards i Innstillinger, AI-innstillinger.'));
      return;
    }
    setDrafts(null);
    setAIError('');
    void topicNotes.load();
    setAIVisible(true);
  }

  async function generate() {
    if (generating) return;
    setGenerating(true);
    setGenerated(0);
    setAIError('');
    try {
      const material = await topicNotes.save();
      const result = await generateAIFlashcards({
        subjectName: subjectName || 'Medical studies',
        topicName,
        cardCount: aiCount,
        sourceMaterial: material || undefined,
        difficulty: aiPreferences?.difficulty ?? 'medium',
        explanationStyle: aiPreferences?.explanationStyle ?? 'balanced',
        onProgress: setGenerated,
      });
      const createdAt = new Date().toISOString();
      setDrafts(result.map((card, index) => ({ id: `ai-${topicId}-${Date.now()}-${index}`, topicId, topicName, front: card.front, back: card.back, createdAt, createdBy: 'ai' as const })));
    } catch (error) {
      console.warn('AI flashcard generation failed:', error);
      setAIError(error instanceof Error ? error.message : 'Could not generate flashcards. Please try again.');
    } finally {
      setGenerating(false);
    }
  }

  async function saveDrafts() {
    const complete = (drafts ?? []).filter((card) => card.front.trim() && card.back.trim());
    if (!complete.length) { setAIError('Keep at least one card with both a question and an answer.'); return; }
    setBusy(true);
    try {
      await saveTopicCards([...cards, ...complete.map((card) => ({ ...card, front: card.front.trim(), back: card.back.trim() }))]);
      setAIVisible(false);
      setDrafts(null);
    } catch (error) {
      console.warn('Could not save the AI flashcards:', error);
      setAIError('The cards could not be saved. Try again.');
    } finally {
      setBusy(false);
    }
  }

  function closeAI() {
    if (generating || busy) return;
    if (drafts?.length) {
      Alert.alert(L('Discard these cards?', 'Forkaste disse kortene?'), L('The generated cards have not been saved.', 'De genererte kortene er ikke lagret.'), [
        { text: L('Keep editing', 'Fortsett å redigere'), style: 'cancel' },
        { text: L('Discard', 'Forkast'), style: 'destructive', onPress: () => { setAIVisible(false); setDrafts(null); } },
      ]);
      return;
    }
    setAIVisible(false);
  }

  const due = cards.filter((card) => isCardDue(card)).length;
  const reviews = (data?.reviews ?? []).filter((review) => String(review.topicId) === topicId);
  const remembered = reviews.filter((review) => review.rating === 'good' || review.rating === 'easy').length;
  const forgotten = reviews.filter((review) => review.rating === 'again').length;
  const cardProgress = topic ? calculateTopicMastery({ ...topic, daysSinceLastStudy: topic.daysSinceStudy }).parts.cards : 0;
  const shownCards = showAll ? cards : cards.slice(0, PREVIEW_CARDS);

  const editor = (
    <Modal visible={editorVisible} transparent animationType="slide" onRequestClose={() => !busy && setEditorVisible(false)}>
      <KeyboardAvoidingView style={styles.modalKeyboard} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={ui.modalBackdrop}>
          <ScrollView contentContainerStyle={styles.modalScroll} keyboardShouldPersistTaps="handled">
            <View style={ui.modalCard}>
              <Text style={ui.modalTitle}>{editing ? L('Edit flashcard', 'Rediger flashcard') : L('New flashcard', 'Nytt flashcard')}</Text>
              <Text style={ui.fieldLabel}>{L('QUESTION', 'SPØRSMÅL')}</Text>
              <TextInput value={front} onChangeText={(value) => { setFront(value); setEditorError(''); }} style={[ui.textInput, styles.multiline]} placeholder={L('What do you want to remember?', 'Hva vil du huske?')} placeholderTextColor={appColor('#91A2AE', 'text')} multiline maxLength={500} autoFocus accessibilityLabel={L('Question', 'Spørsmål')} />
              <Text style={ui.fieldLabel}>{L('ANSWER', 'SVAR')}</Text>
              <TextInput value={back} onChangeText={(value) => { setBack(value); setEditorError(''); }} style={[ui.textInput, styles.multiline]} placeholder={L('The answer', 'Svaret')} placeholderTextColor={appColor('#91A2AE', 'text')} multiline maxLength={2000} accessibilityLabel={L('Answer', 'Svar')} />
              {editorError ? <Text style={ui.formError}>{L(editorError, editorError === 'Enter both a question and an answer.' ? 'Skriv inn både spørsmål og svar.' : 'Kortet kunne ikke lagres. Prøv igjen.')}</Text> : null}
              <View style={ui.modalActions}>
                <Pressable accessibilityRole="button" style={ui.secondaryButton} onPress={() => setEditorVisible(false)} disabled={busy}><Text style={ui.secondaryButtonText}>{L('Cancel', 'Avbryt')}</Text></Pressable>
                <Pressable accessibilityRole="button" style={[ui.primaryButton, busy && ui.disabled]} onPress={() => { void saveCard(); }} disabled={busy}>
                  {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={ui.primaryButtonText}>{L('Save card', 'Lagre kort')}</Text>}
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
          <ScrollView style={styles.aiScroll} contentContainerStyle={styles.modalScroll} keyboardShouldPersistTaps="handled" keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'} automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}>
            <View style={ui.modalCard}>
              <View style={ui.modalHeader}>
                <View style={ui.modalIcon}><StudyIcon name="sparkles" size={18} color={palette.accent} /></View>
                <View style={ui.grow}>
                  <Text style={ui.modalTitle}>{drafts ? L('Check the cards', 'Se over kortene') : L('Create flashcards with AI', 'Lag flashcards med AI')}</Text>
                  <Text style={ui.cardDescription}>{drafts ? L('Edit or remove anything before saving. Nothing is saved yet.', 'Rediger eller fjern før du lagrer. Ingenting er lagret ennå.') : topicName}</Text>
                </View>
              </View>

              {!drafts ? (
                <>
                  <Text style={ui.fieldLabel}>{L('HOW MANY CARDS', 'ANTALL KORT')}</Text>
                  <Chips value={String(aiCount)} onChange={(value) => setAICount(Number(value))} items={AI_COUNT_CHOICES.map((value) => ({ key: String(value), label: String(value) }))} />
                  <TopicNotesField state={topicNotes} disabled={generating} />
                  <Text style={p.small}>{L('Always check the cards against your course material.', 'Sjekk alltid kortene mot pensum.')}</Text>
                  {generating ? <View style={styles.generating}><ActivityIndicator color={palette.accent} /><Text style={p.body}>{L(`Creating ${generated} of ${aiCount} cards`, `Lager ${generated} av ${aiCount} kort`)}</Text></View> : null}
                </>
              ) : drafts.map((card, index) => (
                <View key={card.id} style={styles.draft}>
                  <View style={styles.draftTop}>
                    <Text style={ui.fieldLabel}>{L('CARD', 'KORT')} {index + 1}</Text>
                    <Pressable accessibilityRole="button" accessibilityLabel={L('Remove card', 'Fjern kort')} onPress={() => setDrafts((items) => (items ?? []).filter((item) => item.id !== card.id))} hitSlop={10}>
                      <StudyIcon name="x" size={15} color={ink.muted} />
                    </Pressable>
                  </View>
                  <TextInput value={card.front} onChangeText={(value) => setDrafts((items) => (items ?? []).map((item) => (item.id === card.id ? { ...item, front: value } : item)))} style={[ui.textInput, styles.draftInput]} multiline accessibilityLabel={L('Question', 'Spørsmål')} />
                  <TextInput value={card.back} onChangeText={(value) => setDrafts((items) => (items ?? []).map((item) => (item.id === card.id ? { ...item, back: value } : item)))} style={[ui.textInput, styles.draftInput]} multiline accessibilityLabel={L('Answer', 'Svar')} />
                </View>
              ))}

              {aiError ? <Text style={ui.formError}>{aiError}</Text> : null}
              <View style={ui.modalActions}>
                <Pressable accessibilityRole="button" style={ui.secondaryButton} onPress={closeAI} disabled={generating || busy}><Text style={ui.secondaryButtonText}>{drafts ? L('Discard', 'Forkast') : L('Cancel', 'Avbryt')}</Text></Pressable>
                {drafts ? (
                  <Pressable accessibilityRole="button" style={[ui.primaryButton, (busy || drafts.length === 0) && ui.disabled]} onPress={() => { void saveDrafts(); }} disabled={busy || drafts.length === 0}>
                    {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={ui.primaryButtonText}>{L(`Save ${drafts.length} cards`, `Lagre ${drafts.length} kort`)}</Text>}
                  </Pressable>
                ) : (
                  <Pressable accessibilityRole="button" style={[ui.primaryButton, generating && ui.disabled]} onPress={() => { void generate(); }} disabled={generating}>
                    <Text style={ui.primaryButtonText}>{L('Create cards', 'Lag kort')}</Text>
                  </Pressable>
                )}
              </View>
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );

  let body;
  if (!data) {
    body = <View style={styles.state}>{loading ? <ActivityIndicator color={palette.accent} /> : <Text style={p.body}>{L('The flashcards could not be loaded. Pull down to try again.', 'Kortene kunne ikke lastes inn. Dra ned for å prøve igjen.')}</Text>}</View>;
  } else if (cards.length === 0) {
    body = (
      <View style={[p.card, p.empty]}>
        <IconChip name="cards" />
        <Text style={p.emptyTitle}>{L('No flashcards yet', 'Ingen flashcards ennå')}</Text>
        <Text style={[p.body, studyStyles.centered]}>{L('Let AI make cards from your lecture notes, or write your own.', 'La AI lage kort fra forelesningsnotatene dine, eller skriv dine egne.')}</Text>
        <Pressable accessibilityRole="button" onPress={openAI} style={({ pressed }) => [p.button, styles.wide, styles.buttonRow, { backgroundColor: palette.accent }, pressed && p.pressed]}>
          <StudyIcon name="sparkles" size={16} color="#FFFFFF" /><Text style={p.buttonText}>{L('Generate with AI', 'Lag med AI')}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => openEditor(null)} style={({ pressed }) => [p.outlineButton, styles.wide, pressed && p.pressed]}>
          <Text style={p.outlineButtonText}>{L('Write a card', 'Skriv et kort')}</Text>
        </Pressable>
      </View>
    );
  } else {
    body = (
      <>
        <View style={[p.card, p.row]}>
          <IconChip name={due ? 'cards' : 'check'} />
          <View style={p.grow}>
            <Text style={styles.rowTitle}>{due ? L(`${due} ${due === 1 ? 'card' : 'cards'} due now`, `${due} kort har forfalt`) : L('Nothing due right now', 'Ingenting har forfalt nå')}</Text>
            <Text style={p.small}>{due ? L('Review them to keep them in memory.', 'Repeter dem for å holde dem i minnet.') : L('You can still practise below.', 'Du kan fortsatt øve nedenfor.')}</Text>
          </View>
          {due ? <PillButton label={L('Start', 'Start')} onPress={startDue} /> : null}
        </View>

        <View style={p.card}>
          <View style={p.cardHeader}>
            <Text style={p.cardTitle}>{L('Flashcard progress', 'Fremgang med flashcards')}</Text>
            <Text style={styles.percent}>{cardProgress}%</Text>
          </View>
          <ProgressBar value={cardProgress} color={palette.accent} trackColor={palette.track} height={8} />
          <View style={styles.stats}>
            <View style={styles.stat}><Text style={styles.statValue}>{reviews.length}</Text><Text style={styles.statLabel}>{L('Reviews', 'Repetisjoner')}</Text></View>
            <View style={styles.statDivider} />
            <View style={styles.stat}><Text style={styles.statValue}>{remembered}</Text><Text style={styles.statLabel}>{L('Remembered', 'Husket')}</Text></View>
            <View style={styles.statDivider} />
            <View style={styles.stat}><Text style={styles.statValue}>{forgotten}</Text><Text style={styles.statLabel}>{L('Forgotten', 'Glemt')}</Text></View>
          </View>
        </View>

        <SectionHeader title={L('Practice settings', 'Innstillinger for øving')} />
        <View style={p.card}>
          <Text style={styles.settingLabel}>{L('Number of cards', 'Antall kort')}</Text>
          <Chips value={settings.count} onChange={(value) => updateSettings({ count: value })} items={COUNT_CHOICES.map((value) => ({ key: value, label: value === '0' ? L('All', 'Alle') : value }))} />
          <Text style={styles.settingLabel}>{L('Card order', 'Rekkefølge')}</Text>
          <Chips<CardOrder>
            value={settings.order}
            onChange={(value) => updateSettings({ order: value })}
            items={[{ key: 'smart', label: L('Due first', 'Forfalte først') }, { key: 'ordered', label: L('In order', 'I rekkefølge') }, { key: 'shuffled', label: L('Shuffled', 'Stokket') }]}
          />
          <View style={styles.toggle}>
            <Text style={[styles.settingLabel, p.grow]}>{L('Show answer first', 'Vis svaret først')}</Text>
            <Switch accessibilityLabel={L('Show answer first', 'Vis svaret først')} value={settings.answerFirst} onValueChange={(value) => updateSettings({ answerFirst: value })} trackColor={{ false: '#C9D6DC', true: palette.accent }} ios_backgroundColor="#C9D6DC" />
          </View>
        </View>
        <Pressable accessibilityRole="button" onPress={startPractice} style={({ pressed }) => [p.button, styles.start, styles.buttonRow, { backgroundColor: palette.accent }, pressed && p.pressed]}>
          <StudyIcon name="play" size={15} color="#FFFFFF" /><Text style={styles.startText}>{L('Start flashcards', 'Start flashcards')}</Text>
        </Pressable>

        <SectionHeader title={`${L('Your cards', 'Kortene dine')} (${cards.length})`} action={cards.length > PREVIEW_CARDS ? (showAll ? L('Show fewer', 'Vis færre') : L('See all', 'Se alle')) : undefined} onAction={() => setShowAll((value) => !value)} />
        <View style={styles.buttonRow}>
          <Pressable accessibilityRole="button" onPress={openAI} style={({ pressed }) => [p.outlineButton, p.grow, styles.buttonRow, pressed && p.pressed]}>
            <StudyIcon name="sparkles" size={15} color={palette.accent} /><Text style={p.outlineButtonText}>{L('Generate with AI', 'Lag med AI')}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => openEditor(null)} style={({ pressed }) => [p.outlineButton, p.grow, styles.buttonRow, pressed && p.pressed]}>
            <StudyIcon name="plus" size={15} color={palette.accent} /><Text style={p.outlineButtonText}>{L('Add card', 'Legg til kort')}</Text>
          </Pressable>
        </View>
        {shownCards.map((card) => (
          <View key={card.id} style={styles.cardRow}>
            <Pressable accessibilityRole="button" accessibilityLabel={L('Edit card', 'Rediger kort')} onPress={() => openEditor(card)} style={({ pressed }) => [p.grow, pressed && p.pressed]}>
              <Text style={styles.cardFront} numberOfLines={2}>{card.front}</Text>
              <Text style={p.small} numberOfLines={2}>{card.back}</Text>
              <Text style={styles.cardMeta}>
                {isCardDue(card) ? L('Due now', 'Forfalt nå') : `${L('Next review', 'Neste repetisjon')} ${new Date(card.nextReviewAt ?? '').toLocaleDateString(language === 'no' ? 'nb-NO' : 'en-GB', { day: 'numeric', month: 'short' })}`}
                {card.createdBy === 'ai' ? ` · ${L('Made with AI', 'Laget med AI')}` : ''}
              </Text>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel={L('Delete card', 'Slett kort')} onPress={() => deleteCard(card)} style={({ pressed }) => [styles.delete, pressed && p.pressed]} hitSlop={8}>
              <StudyIcon name="trash" size={17} color={ink.muted} />
            </Pressable>
          </View>
        ))}
      </>
    );
  }

  return (
    <SafeAreaView style={ui.container} edges={['top']}>
      <Stack.Screen options={{ headerShown: false }} />
      <PullToRefreshScrollView contentContainerStyle={studyStyles.content} showsVerticalScrollIndicator={false} onRefresh={reload}>
        <ScreenBar backLabel={L('Back', 'Tilbake')} />
        <View>
          <Text style={styles.title} accessibilityRole="header">Flashcards</Text>
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
  buttonRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  rowTitle: { color: ink.primary, fontSize: 16, fontWeight: '800' },
  percent: { color: ink.primary, fontSize: 18, fontWeight: '800' },
  stats: { flexDirection: 'row', alignItems: 'stretch' },
  stat: { flex: 1, alignItems: 'center', gap: 3 },
  statDivider: { width: StyleSheet.hairlineWidth, backgroundColor: appColor('#D8E6EC', 'border') },
  statValue: { color: ink.primary, fontSize: 19, fontWeight: '800' },
  statLabel: { color: ink.muted, fontSize: 11 },
  settingLabel: { color: ink.primary, fontSize: 14, fontWeight: '600' },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  start: { minHeight: 56, borderRadius: 18 },
  startText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: 16, backgroundColor: appColor('#FFFFFF', 'background'), borderWidth: 1, borderColor: appColor('#E7F0F4', 'border'), ...cardShadow },
  cardFront: { color: ink.primary, fontSize: 14, fontWeight: '700', marginBottom: 3 },
  cardMeta: { color: ink.muted, fontSize: 11, marginTop: 6 },
  delete: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: appColor('#F4F8FA', 'background') },

  modalKeyboard: { flex: 1 },
  modalScroll: { flexGrow: 1, justifyContent: 'flex-end' },
  aiScroll: { maxHeight: '92%' },
  multiline: { minHeight: 76, textAlignVertical: 'top' },
  generating: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  draft: { gap: 7, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: appColor('#D8E6EC', 'border') },
  draftTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  draftInput: { minHeight: 44 },
});
