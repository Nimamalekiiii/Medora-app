import { cardShadow } from '@/components/gloss';
import { IconChip } from '@/components/study/icon-chip';
import { ProgressBar } from '@/components/charts';
import { ink, p, useProgressPalette } from '@/components/progress/theme';
import PullToRefreshScrollView from '@/components/pull-to-refresh-scroll-view';
import { AddTopicSheet } from '@/components/study/add-topic-sheet';
import { Chips, PillButton, ScreenBar, SectionHeader, Segments, StudyRow, studyStyles } from '@/components/study/study-ui';
import { SubjectGlyph, TopicRing } from '@/components/study/subject-glyph';
import { TopicMaterialSheet, useTopicNotes } from '@/components/study/topic-notes';
import { StudyIcon } from '@/components/study-icon';
import { appColor } from '@/constants/adaptive-color';
import { ui } from '@/constants/ui';
import { useStudyData } from '@/hooks/use-study-data';
import { useAppSettings } from '@/services/app-settings-context';
import type { ProgressTopic, TopicStatus } from '@/services/progress-metrics';
import { deleteTopicAndData, getTopicNotesByTopic, saveTopicsBySubject } from '@/services/storage';
import type { TopicNotesByTopic } from '@/types/study';
import { Stack, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type Tab = 'topics' | 'flashcards' | 'quizzes' | 'notes';
type Filter = 'all' | TopicStatus;
const TABS: Tab[] = ['topics', 'flashcards', 'quizzes', 'notes'];
const MAX_TOPIC_NAME_LENGTH = 60;

const param = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] ?? '' : value ?? '');

/**
 * A subject's topics, opened both from the Subjects tab and the Study tab:
 * the topics with their progress, their flashcards, quizzes and course
 * material, and adding, renaming and deleting topics.
 */
export default function SubjectTopicsScreen() {
  const params = useLocalSearchParams<{ id?: string | string[]; name?: string | string[]; tab?: string | string[] }>();
  const subjectId = param(params.id);
  const initialTab = TABS.includes(param(params.tab) as Tab) ? (param(params.tab) as Tab) : 'topics';
  const { preferences } = useAppSettings();
  const language = preferences.language;
  const L = (en: string, no: string) => (language === 'no' ? no : en);
  const palette = useProgressPalette();
  const { loading, data, metrics, reload } = useStudyData();

  const [tab, setTab] = useState<Tab>(initialTab);
  const [filter, setFilter] = useState<Filter>('all');
  const [weakestFirst, setWeakestFirst] = useState(false);
  const [addVisible, setAddVisible] = useState(false);

  // Rename one topic.
  const [renaming, setRenaming] = useState<ProgressTopic | null>(null);
  const [renameText, setRenameText] = useState('');
  const [renameError, setRenameError] = useState('');
  const [saving, setSaving] = useState(false);

  // Course material per topic.
  const [notesByTopic, setNotesByTopic] = useState<TopicNotesByTopic>({});
  const [materialTopic, setMaterialTopic] = useState<ProgressTopic | null>(null);
  const materialNotes = useTopicNotes(materialTopic ? String(materialTopic.id) : '');

  const loadNotes = useCallback(async () => {
    try {
      setNotesByTopic(await getTopicNotesByTopic());
    } catch (error) {
      console.warn('Could not load the topic notes:', error);
    }
  }, []);
  useFocusEffect(useCallback(() => { void loadNotes(); }, [loadNotes]));

  const subjectIndex = data?.subjects.findIndex((item) => String(item.id) === subjectId) ?? -1;
  const subject = subjectIndex >= 0 ? data?.subjects[subjectIndex] : undefined;
  const subjectName = subject?.name ?? (param(params.name) || L('Subject', 'Emne'));
  const routeParams = { id: subjectId, name: subjectName };
  const savedTopics = data?.topicsBySubject[subjectId] ?? [];

  const topicParams = (topic: ProgressTopic) => ({ id: String(topic.id), name: topic.name, subjectId });
  const openTopic = (topic: ProgressTopic) => router.push({ pathname: '/subject/topic/[id]', params: { ...topicParams(topic), subjectName } });

  function openMenu() {
    Alert.alert(subjectName, undefined, [
      { text: L('Add topic', 'Legg til tema'), onPress: () => setAddVisible(true) },
      { text: L('Exam', 'Eksamen'), onPress: () => router.push({ pathname: '/subject/exam', params: routeParams }) },
      { text: L('Study plan', 'Studieplan'), onPress: () => router.push({ pathname: '/subject/study-plan', params: routeParams }) },
      { text: L('Cancel', 'Avbryt'), style: 'cancel' },
    ]);
  }

  async function addTopics(names: string[]) {
    if (!data || !subjectId) return false;
    const stamp = Date.now();
    const additions = names.map((name, index) => ({ id: stamp + index, name: name.trim().slice(0, MAX_TOPIC_NAME_LENGTH) }));
    try {
      await saveTopicsBySubject({ ...data.topicsBySubject, [subjectId]: [...savedTopics, ...additions] });
      await reload();
      return true;
    } catch (error) {
      console.warn('Could not save topics:', error);
      return false;
    }
  }

  function openRename(topic: ProgressTopic) {
    setRenaming(topic);
    setRenameText(topic.name);
    setRenameError('');
  }

  async function saveRename() {
    const trimmed = renameText.trim();
    if (!data || !renaming || !trimmed || saving) return;
    if (savedTopics.some((topic) => topic.id !== renaming.id && topic.name.trim().toLocaleLowerCase() === trimmed.toLocaleLowerCase())) {
      setRenameError(L('This subject already has a topic with that name.', 'Emnet har allerede et tema med det navnet.'));
      return;
    }
    setSaving(true);
    try {
      await saveTopicsBySubject({ ...data.topicsBySubject, [subjectId]: savedTopics.map((topic) => (topic.id === renaming.id ? { ...topic, name: trimmed } : topic)) });
      await reload();
      setRenaming(null);
    } catch (error) {
      console.warn('Could not rename the topic:', error);
      setRenameError(L('The name could not be saved. Try again.', 'Navnet kunne ikke lagres. Prøv igjen.'));
    } finally {
      setSaving(false);
    }
  }

  function confirmDelete(topic: ProgressTopic) {
    Alert.alert(
      L('Delete topic?', 'Slette temaet?'),
      L(
        `This removes ${topic.name} with its questions, quizzes, flashcards, course material and progress. A recovery copy is kept under Profile.`,
        `Dette fjerner ${topic.name} med spørsmål, quizer, flashcards, pensum og fremgang. En gjenopprettingskopi ligger under Profil.`,
      ),
      [
        { text: L('Cancel', 'Avbryt'), style: 'cancel' },
        {
          text: L('Delete', 'Slett'),
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteTopicAndData(subjectId, topic.id);
              await Promise.all([reload(), loadNotes()]);
            } catch (error) {
              console.warn('Could not delete topic data:', error);
              Alert.alert(L('Could not finish deleting', 'Kunne ikke fullføre slettingen'), L('A recovery copy was made first. Check Profile before trying again.', 'En gjenopprettingskopi ble laget først. Sjekk Profil før du prøver igjen.'));
            }
          },
        },
      ],
    );
  }

  function openTopicMenu(topic: ProgressTopic) {
    Alert.alert(topic.name, undefined, [
      { text: L('Rename', 'Gi nytt navn'), onPress: () => openRename(topic) },
      { text: L('Course material', 'Pensum'), onPress: () => setMaterialTopic(topic) },
      { text: L('Delete', 'Slett'), style: 'destructive', onPress: () => confirmDelete(topic) },
      { text: L('Cancel', 'Avbryt'), style: 'cancel' },
    ]);
  }

  const addButton = (
    <Pressable accessibilityRole="button" onPress={() => setAddVisible(true)} style={({ pressed }) => [styles.add, pressed && p.pressed]}>
      <StudyIcon name="plus" size={16} color={palette.accent} />
      <Text style={[styles.addText, { color: palette.accent }]}>{L('Add topic', 'Legg til tema')}</Text>
    </Pressable>
  );

  let body;
  if (!data || !metrics) {
    body = <View style={styles.state}>{loading ? <ActivityIndicator color={palette.accent} /> : <Text style={p.body}>{L('This subject could not be loaded. Pull down to try again.', 'Emnet kunne ikke lastes inn. Dra ned for å prøve igjen.')}</Text>}</View>;
  } else if (!subject) {
    body = <View style={[p.card, p.empty]}><Text style={p.emptyTitle}>{L('This subject no longer exists', 'Dette emnet finnes ikke lenger')}</Text></View>;
  } else {
    const topics = metrics.topics.filter((topic) => topic.subjectId === subjectId);
    const summary = metrics.subjects.find((item) => item.subjectId === subjectId);
    const progress = summary?.progress ?? 0;
    const count = (status: TopicStatus) => topics.filter((topic) => topic.status === status).length;
    const shown = topics.filter((topic) => filter === 'all' || topic.status === filter);
    const ordered = weakestFirst ? [...shown].sort((a, b) => a.practiceProgress - b.practiceProgress) : shown;
    const now = Date.now();
    const statusText = (topic: ProgressTopic) => (topic.status === 'completed' ? L('Completed', 'Fullført') : topic.status === 'in_progress' ? L('In progress', 'Påbegynt') : L('Not started', 'Ikke startet'));

    let list;
    if (topics.length === 0) {
      list = (
        <View style={[p.card, p.empty]}>
          <IconChip name="book" />
          <Text style={p.emptyTitle}>{L('No topics yet', 'Ingen temaer ennå')}</Text>
          <Text style={[p.body, studyStyles.centered]}>{L('Topics are what you study in this subject. Let AI suggest them, or add your own.', 'Temaer er det du studerer i emnet. La AI foreslå dem, eller legg til dine egne.')}</Text>
          <Pressable accessibilityRole="button" onPress={() => setAddVisible(true)} style={({ pressed }) => [p.button, styles.wide, { backgroundColor: palette.accent }, pressed && p.pressed]}>
            <Text style={p.buttonText}>{L('Add topics', 'Legg til temaer')}</Text>
          </Pressable>
        </View>
      );
    } else if (tab === 'topics') {
      list = (
        <>
          <SectionHeader title={L('Topics', 'Temaer')} action={weakestFirst ? L('Lowest first', 'Lavest først') : L('Sort', 'Sorter')} onAction={() => setWeakestFirst((value) => !value)} />
          <Chips<Filter>
            value={filter}
            onChange={setFilter}
            items={[
              { key: 'all', label: `${L('All', 'Alle')} ${topics.length}` },
              { key: 'not_started', label: `${L('Not started', 'Ikke startet')} ${count('not_started')}` },
              { key: 'in_progress', label: `${L('In progress', 'Påbegynt')} ${count('in_progress')}` },
              { key: 'completed', label: `${L('Completed', 'Fullført')} ${count('completed')}` },
            ]}
          />
          {ordered.length === 0 ? <View style={[p.card, p.empty]}><Text style={p.body}>{L('No topics match this filter.', 'Ingen temaer passer til dette filteret.')}</Text></View> : ordered.map((topic) => (
            <View key={String(topic.id)} style={styles.topicRow}>
              <Pressable accessibilityRole="button" accessibilityLabel={`${topic.name}. ${statusText(topic)}, ${topic.practiceProgress}%`} onPress={() => openTopic(topic)} style={({ pressed }) => [styles.topicMain, pressed && p.pressed]}>
                <TopicRing progress={topic.practiceProgress} completed={topic.status === 'completed'} />
                <View style={p.grow}>
                  <Text style={styles.topicName} numberOfLines={1}>{topic.name}</Text>
                  <Text style={styles.topicDetail} numberOfLines={1}>
                    {statusText(topic)} · {topic.practiceProgress}%
                    {topic.fadedPoints > 0 ? ` · ${L('fading', 'falmer')}` : ''}
                  </Text>
                </View>
              </Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel={L(`Options for ${topic.name}`, `Valg for ${topic.name}`)} onPress={() => openTopicMenu(topic)} style={({ pressed }) => [styles.more, pressed && p.pressed]} hitSlop={6}>
                <StudyIcon name="more" size={17} color={ink.muted} />
              </Pressable>
            </View>
          ))}
          {addButton}
        </>
      );
    } else if (tab === 'flashcards') {
      list = (
        <>
          <SectionHeader title="Flashcards" />
          {topics.map((topic) => {
            const cards = data.cards.filter((card) => String(card.topicId) === String(topic.id));
            const due = cards.filter((card) => !card.nextReviewAt || !(new Date(card.nextReviewAt).getTime() > now)).length;
            return (
              <StudyRow
                key={String(topic.id)}
                icon="cards"
                title={topic.name}
                detail={cards.length === 0 ? L('No cards yet', 'Ingen kort ennå') : `${cards.length} ${L('cards', 'kort')} · ${due} ${L('due', 'forfalt')}`}
                onPress={() => router.push({ pathname: '/subject/topic/flashcards', params: topicParams(topic) })}
                trailing={due > 0 ? <PillButton label={`${L('Review', 'Repeter')} ${due}`} onPress={() => router.push({ pathname: '/subject/topic/study/review', params: topicParams(topic) })} /> : undefined}
              />
            );
          })}
        </>
      );
    } else if (tab === 'quizzes') {
      list = (
        <>
          <SectionHeader title={L('Quizzes', 'Quizer')} />
          {topics.map((topic) => {
            const attempts = data.quizResults.filter((result) => String(result.topicId) === String(topic.id)).length;
            return (
              <StudyRow
                key={String(topic.id)}
                icon="quiz"
                title={topic.name}
                detail={attempts === 0 || topic.quizAccuracy === null
                  ? L('No quiz taken yet', 'Ingen quiz tatt ennå')
                  : `${attempts} ${attempts === 1 ? L('attempt', 'forsøk') : L('attempts', 'forsøk')} · ${topic.quizAccuracy}% ${L('correct', 'riktig')}`}
                onPress={() => router.push({ pathname: '/subject/topic/study/quiz', params: topicParams(topic) })}
              />
            );
          })}
        </>
      );
    } else {
      list = (
        <>
          <SectionHeader title={L('Course material', 'Pensum')} />
          <Text style={p.small}>{L('Notes and PDFs you save on a topic. AI uses them for that topic\'s flashcards, quizzes and Active Recall.', 'Notater og PDF-er du lagrer på et tema. AI bruker dem til flashcards, quiz og Active Recall i det temaet.')}</Text>
          {topics.map((topic) => {
            const saved = notesByTopic[String(topic.id)]?.text.length ?? 0;
            return (
              <StudyRow
                key={String(topic.id)}
                icon="note"
                title={topic.name}
                detail={saved ? L(`Material saved · ${saved.toLocaleString('en-GB')} characters`, `Pensum lagret · ${saved.toLocaleString('nb-NO')} tegn`) : L('No material yet', 'Ikke noe pensum ennå')}
                onPress={() => setMaterialTopic(topic)}
                trailing={<StudyIcon name={saved ? 'pencil' : 'plus'} size={15} color={ink.muted} />}
              />
            );
          })}
        </>
      );
    }

    body = (
      <>
        <View style={styles.hero}>
          <SubjectGlyph name={subjectName} index={subjectIndex} size={64} />
          <View style={p.grow}>
            <Text style={styles.heroTitle} numberOfLines={2} accessibilityRole="header">{subjectName}</Text>
            <Text style={styles.heroDetail}>{L(`${count('completed')} of ${topics.length} topics completed`, `${count('completed')} av ${topics.length} temaer fullført`)}</Text>
            <View style={styles.heroProgress}>
              <View style={p.grow}><ProgressBar value={progress} color={palette.accent} trackColor={palette.track} height={7} /></View>
              <Text style={styles.heroPercent}>{progress}%</Text>
            </View>
          </View>
        </View>

        <Segments<Tab>
          value={tab}
          onChange={setTab}
          items={[
            { key: 'topics', label: L('Topics', 'Temaer') },
            { key: 'flashcards', label: L('Cards', 'Kort') },
            { key: 'quizzes', label: L('Quizzes', 'Quizer') },
            { key: 'notes', label: L('Notes', 'Pensum') },
          ]}
        />
        {list}
      </>
    );
  }

  return (
    <SafeAreaView style={ui.container} edges={['top']}>
      <Stack.Screen options={{ headerShown: false }} />
      <PullToRefreshScrollView contentContainerStyle={studyStyles.content} showsVerticalScrollIndicator={false} onRefresh={async () => { await Promise.all([reload(), loadNotes()]); }}>
        <ScreenBar backLabel={L('Back', 'Tilbake')} onMenu={subject ? openMenu : undefined} menuLabel={L('More options', 'Flere valg')} />
        {body}
      </PullToRefreshScrollView>

      <AddTopicSheet visible={addVisible} onClose={() => setAddVisible(false)} subjectName={subjectName} existingNames={savedTopics.map((topic) => topic.name)} onAdd={addTopics} />

      <TopicMaterialSheet
        visible={materialTopic !== null}
        onClose={() => { setMaterialTopic(null); void loadNotes(); }}
        state={materialNotes}
        topicName={materialTopic?.name ?? ''}
      />

      <Modal visible={renaming !== null} transparent animationType="slide" onRequestClose={() => { if (!saving) setRenaming(null); }}>
        <KeyboardAvoidingView style={ui.modalKeyboard} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={ui.modalBackdrop}>
            <View style={ui.modalCard}>
              <Text style={ui.modalTitle}>{L('Rename topic', 'Gi temaet nytt navn')}</Text>
              <Text style={ui.cardDescription}>{L('Questions, flashcards and progress stay with the topic.', 'Spørsmål, flashcards og fremgang følger temaet.')}</Text>
              <TextInput
                value={renameText}
                onChangeText={(value) => { setRenameText(value); setRenameError(''); }}
                style={ui.textInput}
                maxLength={MAX_TOPIC_NAME_LENGTH}
                autoFocus
                returnKeyType="done"
                onSubmitEditing={() => { void saveRename(); }}
                placeholderTextColor={appColor('#91A2AE', 'text')}
                accessibilityLabel={L('Topic name', 'Navn på temaet')}
              />
              {renameError ? <Text style={ui.formError}>{renameError}</Text> : null}
              <View style={ui.modalActions}>
                <Pressable accessibilityRole="button" style={ui.secondaryButton} onPress={() => setRenaming(null)} disabled={saving}><Text style={ui.secondaryButtonText}>{L('Cancel', 'Avbryt')}</Text></Pressable>
                <Pressable accessibilityRole="button" style={[ui.primaryButton, (!renameText.trim() || saving) && ui.disabled]} onPress={() => { void saveRename(); }} disabled={!renameText.trim() || saving}>
                  {saving ? <ActivityIndicator color="#FFFFFF" /> : <Text style={ui.primaryButtonText}>{L('Save', 'Lagre')}</Text>}
                </Pressable>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  state: { alignItems: 'center', paddingVertical: 60 },
  wide: { alignSelf: 'stretch' },
  hero: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  heroTitle: { color: ink.primary, fontSize: 24, fontWeight: '800', letterSpacing: -0.3 },
  heroDetail: { color: ink.secondary, fontSize: 13, marginTop: 3 },
  heroProgress: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 9 },
  heroPercent: { color: ink.primary, fontSize: 13, fontWeight: '800', minWidth: 34, textAlign: 'right' },
  topicRow: { flexDirection: 'row', alignItems: 'center', borderRadius: 18, backgroundColor: appColor('#FFFFFF', 'background'), borderWidth: 1, borderColor: appColor('#E7F0F4', 'border'), ...cardShadow },
  topicMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 13, paddingVertical: 13, paddingLeft: 14 },
  topicName: { color: ink.primary, fontSize: 15, fontWeight: '700' },
  topicDetail: { color: ink.muted, fontSize: 12, marginTop: 3 },
  more: { width: 48, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center' },
  add: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 16, borderWidth: 1, borderStyle: 'dashed', borderColor: appColor('#BFD9E4', 'border') },
  addText: { fontSize: 14, fontWeight: '800' },
});
