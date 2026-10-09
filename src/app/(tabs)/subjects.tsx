import { cardShadow } from '@/components/gloss';
import { IconChip } from '@/components/study/icon-chip';
import { ProgressBar } from '@/components/charts';
import { ink, p, useProgressPalette } from '@/components/progress/theme';
import PullToRefreshScrollView from '@/components/pull-to-refresh-scroll-view';
import { Segments } from '@/components/study/study-ui';
import { SubjectGlyph } from '@/components/study/subject-glyph';
import { StudyIcon } from '@/components/study-icon';
import { appColor } from '@/constants/adaptive-color';
import { ui } from '@/constants/ui';
import { useStudyData } from '@/hooks/use-study-data';
import { useAppSettings } from '@/services/app-settings-context';
import { getDaysUntil } from '@/services/dates';
import { deleteSubjectAndData, saveSubjects } from '@/services/storage';
import type { Subject } from '@/types/study';
import { Stack, router } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const MAX_SUBJECT_NAME_LENGTH = 60;
type Filter = 'all' | 'active' | 'upcoming' | 'completed';

/** The Subjects tab: every subject with its topics, exam and progress. */
export default function SubjectsScreen() {
  const { preferences } = useAppSettings();
  const language = preferences.language;
  const L = (en: string, no: string) => (language === 'no' ? no : en);
  const palette = useProgressPalette();
  const { loading, data, metrics, todayKey, reload } = useStudyData();

  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [formVisible, setFormVisible] = useState(false);
  const [editingId, setEditingId] = useState<Subject['id'] | null>(null);
  const [name, setName] = useState('');
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const subjects = data?.subjects ?? [];
  const cards = subjects.map((subject, index) => {
    const subjectId = String(subject.id);
    const summary = metrics?.subjects.find((item) => item.subjectId === subjectId);
    const topics = (data?.topicsBySubject[subjectId] ?? []).length;
    const exam = data?.exams[subjectId];
    const examDays = exam ? getDaysUntil(exam.date, todayKey) : -1;
    const progress = summary?.progress ?? 0;
    const completed = topics > 0 && (summary?.completed ?? 0) >= topics;
    return { subject, subjectId, index, topics, examDays, progress, completed, active: progress > 0 && !completed };
  });

  const search = query.trim().toLocaleLowerCase();
  const shown = cards.filter((card) => {
    if (search && !card.subject.name.toLocaleLowerCase().includes(search)) return false;
    if (filter === 'active') return card.active;
    if (filter === 'upcoming') return card.examDays >= 0;
    if (filter === 'completed') return card.completed;
    return true;
  }).sort((left, right) => (filter === 'upcoming' ? left.examDays - right.examDays : 0));

  function openForm(subject: Subject | null) {
    setEditingId(subject?.id ?? null);
    setName(subject?.name ?? '');
    setFormError('');
    setFormVisible(true);
  }

  async function saveSubject() {
    const trimmed = name.trim();
    if (!trimmed || saving) return;
    if (subjects.some((subject) => subject.id !== editingId && subject.name.trim().toLocaleLowerCase() === trimmed.toLocaleLowerCase())) {
      setFormError(L('You already have a subject with this name.', 'Du har allerede et emne med dette navnet.'));
      return;
    }
    const updated = editingId !== null
      ? subjects.map((subject) => (subject.id === editingId ? { ...subject, name: trimmed } : subject))
      : [...subjects, { id: Date.now(), name: trimmed }];
    setSaving(true);
    try {
      await saveSubjects(updated);
      await reload();
      setFormVisible(false);
    } catch (error) {
      console.warn('Could not save subjects:', error);
      setFormError(L('Your changes were not saved. Try again.', 'Endringene ble ikke lagret. Prøv igjen.'));
    } finally {
      setSaving(false);
    }
  }

  function confirmDelete(subject: Subject) {
    Alert.alert(
      L('Delete subject?', 'Slette emnet?'),
      L(
        `This removes ${subject.name} with its topics, exam, study history, quizzes and flashcards. A recovery copy is kept under Profile.`,
        `Dette fjerner ${subject.name} med temaer, eksamen, studiehistorikk, quizer og flashcards. En gjenopprettingskopi ligger under Profil.`,
      ),
      [
        { text: L('Cancel', 'Avbryt'), style: 'cancel' },
        {
          text: L('Delete', 'Slett'),
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteSubjectAndData(subject.id);
              await reload();
            } catch (error) {
              console.warn('Could not remove subject data:', error);
              Alert.alert(L('Could not finish deleting', 'Kunne ikke fullføre slettingen'), L('A recovery copy was made first. Check Profile before trying again.', 'En gjenopprettingskopi ble laget først. Sjekk Profil før du prøver igjen.'));
            }
          },
        },
      ],
    );
  }

  function openMenu(subject: Subject) {
    Alert.alert(subject.name, undefined, [
      { text: L('Rename', 'Gi nytt navn'), onPress: () => openForm(subject) },
      { text: L('Delete', 'Slett'), style: 'destructive', onPress: () => confirmDelete(subject) },
      { text: L('Cancel', 'Avbryt'), style: 'cancel' },
    ]);
  }

  const openSubject = (subject: Subject) => router.push({ pathname: '/subject/[id]', params: { id: String(subject.id), name: subject.name } });

  const form = (
    <Modal visible={formVisible} transparent animationType="slide" onRequestClose={() => { if (!saving) setFormVisible(false); }}>
      <KeyboardAvoidingView style={ui.modalKeyboard} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <Pressable style={ui.modalBackdrop} onPress={() => { if (!saving) setFormVisible(false); }} accessibilityLabel={L('Cancel', 'Avbryt')}>
          <Pressable style={ui.modalCard} onPress={() => undefined} accessible={false}>
            <View style={ui.modalHeader}>
              <View style={ui.modalIcon}><StudyIcon name="layers" size={18} color={palette.accent} /></View>
              <View style={ui.grow}>
                <Text style={ui.modalTitle}>{editingId !== null ? L('Rename subject', 'Gi emnet nytt navn') : L('New subject', 'Nytt emne')}</Text>
                <Text style={ui.cardDescription}>{editingId !== null ? L('Topics, exam and progress stay with the subject.', 'Temaer, eksamen og fremgang følger emnet.') : L('You add topics and an exam date next.', 'Du legger til temaer og eksamensdato etterpå.')}</Text>
              </View>
            </View>
            <Text style={ui.fieldLabel}>{L('SUBJECT NAME', 'NAVN PÅ EMNET')}</Text>
            <TextInput
              value={name}
              onChangeText={(value) => { setName(value); setFormError(''); }}
              placeholder={L('e.g. Pharmacology', 'f.eks. Farmakologi')}
              placeholderTextColor={appColor('#91A2AE', 'text')}
              style={ui.textInput}
              maxLength={MAX_SUBJECT_NAME_LENGTH}
              autoFocus
              autoCapitalize="sentences"
              returnKeyType="done"
              onSubmitEditing={() => { void saveSubject(); }}
              accessibilityLabel={L('Subject name', 'Navn på emnet')}
            />
            {formError ? <Text style={ui.formError}>{formError}</Text> : null}
            <View style={ui.modalActions}>
              <Pressable accessibilityRole="button" style={ui.secondaryButton} onPress={() => setFormVisible(false)} disabled={saving}>
                <Text style={ui.secondaryButtonText}>{L('Cancel', 'Avbryt')}</Text>
              </Pressable>
              <Pressable accessibilityRole="button" style={[ui.primaryButton, (!name.trim() || saving) && ui.disabled]} onPress={() => { void saveSubject(); }} disabled={!name.trim() || saving}>
                {saving ? <ActivityIndicator color="#FFFFFF" /> : <Text style={ui.primaryButtonText}>{editingId !== null ? L('Save', 'Lagre') : L('Add subject', 'Legg til emne')}</Text>}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );

  let body;
  if (!data) {
    body = <View style={styles.state}>{loading ? <ActivityIndicator color={palette.accent} /> : <Text style={p.body}>{L('Your subjects could not be loaded. Pull down to try again.', 'Emnene kunne ikke lastes inn. Dra ned for å prøve igjen.')}</Text>}</View>;
  } else if (subjects.length === 0) {
    body = (
      <View style={[p.card, p.empty]}>
        <IconChip name="layers" />
        <Text style={p.emptyTitle}>{L('No subjects yet', 'Ingen emner ennå')}</Text>
        <Text style={[p.body, styles.centered]}>{L('Add the first subject you are studying. Topics, exam and study plan come next.', 'Legg til det første emnet du leser. Temaer, eksamen og studieplan kommer etterpå.')}</Text>
        <Pressable accessibilityRole="button" onPress={() => openForm(null)} style={({ pressed }) => [p.button, styles.wide, { backgroundColor: palette.accent }, pressed && p.pressed]}>
          <Text style={p.buttonText}>{L('Add subject', 'Legg til emne')}</Text>
        </Pressable>
      </View>
    );
  } else {
    body = (
      <>
        <View style={styles.search}>
          <StudyIcon name="search" size={17} color={ink.muted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={L('Search subjects', 'Søk i emner')}
            placeholderTextColor={appColor('#91A2AE', 'text')}
            style={styles.searchInput}
            returnKeyType="search"
            autoCorrect={false}
            clearButtonMode="while-editing"
            accessibilityLabel={L('Search subjects', 'Søk i emner')}
          />
        </View>

        <Segments<Filter>
          value={filter}
          onChange={setFilter}
          items={[
            { key: 'all', label: L('All', 'Alle') },
            { key: 'active', label: L('Active', 'Aktive') },
            { key: 'upcoming', label: L('Exam', 'Eksamen') },
            { key: 'completed', label: L('Done', 'Fullført') },
          ]}
        />

        {shown.length === 0 ? (
          <View style={[p.card, p.empty]}>
            <Text style={[p.body, styles.centered]}>{search
              ? L('No subjects match your search.', 'Ingen emner passer til søket.')
              : filter === 'active' ? L('No subjects in progress yet.', 'Ingen påbegynte emner ennå.')
              : filter === 'upcoming' ? L('No subjects have an exam date yet.', 'Ingen emner har eksamensdato ennå.')
              : L('No completed subjects yet.', 'Ingen fullførte emner ennå.')}</Text>
          </View>
        ) : shown.map((card) => {
          const topicText = `${card.topics} ${card.topics === 1 ? L('topic', 'tema') : L('topics', 'temaer')}`;
          const examText = card.examDays === 0 ? L('Exam today', 'Eksamen i dag')
            : card.examDays === 1 ? L('Exam tomorrow', 'Eksamen i morgen')
            : card.examDays > 1 ? L(`Exam in ${card.examDays} days`, `Eksamen om ${card.examDays} dager`)
            : L('No exam planned', 'Ingen eksamen planlagt');
          return (
            <Pressable
              key={card.subjectId}
              accessibilityRole="button"
              accessibilityLabel={`${card.subject.name}. ${topicText}. ${examText}. ${card.progress}%`}
              accessibilityHint={L('Hold for rename and delete', 'Hold inne for å gi nytt navn eller slette')}
              onPress={() => openSubject(card.subject)}
              onLongPress={() => openMenu(card.subject)}
              style={({ pressed }) => [styles.row, pressed && p.pressed]}
            >
              <SubjectGlyph name={card.subject.name} index={card.index} />
              <View style={p.grow}>
                <Text style={styles.rowTitle} numberOfLines={1}>{card.subject.name}</Text>
                <Text style={styles.rowDetail} numberOfLines={1}>{topicText} · {examText}</Text>
                <View style={styles.rowProgress}>
                  <View style={p.grow}><ProgressBar value={card.progress} color={palette.accent} trackColor={palette.track} height={5} /></View>
                  <Text style={styles.rowPercent}>{card.progress}%</Text>
                </View>
              </View>
              <StudyIcon name="chevron" size={12} color={ink.muted} />
            </Pressable>
          );
        })}

        <Pressable accessibilityRole="button" onPress={() => openForm(null)} style={({ pressed }) => [styles.add, pressed && p.pressed]}>
          <StudyIcon name="plus" size={16} color={palette.accent} />
          <Text style={[styles.addText, { color: palette.accent }]}>{L('Add subject', 'Legg til emne')}</Text>
        </Pressable>
        <Text style={[p.small, styles.centered]}>{L('Hold a subject to rename or delete it.', 'Hold inne et emne for å gi det nytt navn eller slette det.')}</Text>
      </>
    );
  }

  return (
    <SafeAreaView style={ui.container} edges={['top']}>
      <Stack.Screen options={{ headerShown: false }} />
      <PullToRefreshScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" onRefresh={reload}>
        <View style={styles.header}>
          <View style={p.grow}>
            <Text style={ui.eyebrow}>{L('YOUR STUDY LIBRARY', 'DITT STUDIEBIBLIOTEK')}</Text>
            <Text style={styles.title} accessibilityRole="header">{L('Subjects', 'Emner')}</Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel={L('Settings', 'Innstillinger')} onPress={() => router.push('/settings')} style={({ pressed }) => [styles.headerButton, pressed && p.pressed]} hitSlop={6}>
            <StudyIcon name="settings" size={19} color={ink.secondary} />
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={L('Add subject', 'Legg til emne')} onPress={() => openForm(null)} style={({ pressed }) => [styles.headerButton, styles.headerPrimary, { backgroundColor: palette.accent }, pressed && p.pressed]} hitSlop={6}>
            <StudyIcon name="plus" size={20} color="#FFFFFF" />
          </Pressable>
        </View>
        <Text style={styles.subtitle}>{L('Manage your subjects and follow your progress.', 'Administrer emnene dine og følg fremgangen.')}</Text>
        {body}
      </PullToRefreshScrollView>
      {form}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 36, gap: 12 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { color: ink.primary, fontSize: 34, fontWeight: '800', letterSpacing: -0.5, marginTop: 2 },
  subtitle: { color: ink.secondary, fontSize: 14, lineHeight: 20, marginTop: -4, marginBottom: 4 },
  headerButton: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: appColor('#FFFFFF', 'background'), borderWidth: 1, borderColor: appColor('#E7F0F4', 'border'), ...cardShadow },
  headerPrimary: { borderWidth: 0 },
  state: { alignItems: 'center', paddingVertical: 60 },
  centered: { textAlign: 'center' },
  wide: { alignSelf: 'stretch' },
  search: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 46, paddingHorizontal: 14, borderRadius: 16, backgroundColor: appColor('#FFFFFF', 'background'), borderWidth: 1, borderColor: appColor('#E7F0F4', 'border'), ...cardShadow },
  searchInput: { flex: 1, color: ink.primary, fontSize: 15, paddingVertical: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 13, padding: 14, borderRadius: 18, backgroundColor: appColor('#FFFFFF', 'background'), borderWidth: 1, borderColor: appColor('#E7F0F4', 'border'), ...cardShadow },
  rowTitle: { color: ink.primary, fontSize: 16, fontWeight: '800' },
  rowDetail: { color: ink.muted, fontSize: 12, marginTop: 3 },
  rowProgress: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 9 },
  rowPercent: { color: ink.secondary, fontSize: 11, fontWeight: '700', minWidth: 30, textAlign: 'right' },
  add: { minHeight: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 16, borderWidth: 1, borderStyle: 'dashed', borderColor: appColor('#BFD9E4', 'border') },
  addText: { fontSize: 14, fontWeight: '800' },
});
