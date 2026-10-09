import { cardShadow } from '@/components/gloss';
import { ImportNotesButton, mergeNotes } from '@/components/import-notes-button';
import { ink, p, useProgressPalette } from '@/components/progress/theme';
import { StudyIcon, type StudyIconName } from '@/components/study-icon';
import { appColor } from '@/constants/adaptive-color';
import { ui } from '@/constants/ui';
import { suggestAITopics } from '@/services/ai-api';
import { useAppSettings } from '@/services/app-settings-context';
import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

const MAX_TOPIC_NAME_LENGTH = 60;
type View_ = 'menu' | 'manual' | 'import';

type Props = {
  visible: boolean;
  onClose: () => void;
  subjectName: string;
  /** Names of the topics the subject already has. */
  existingNames: string[];
  /** Saves new topics. Resolves false when saving failed. */
  onAdd: (names: string[]) => Promise<boolean>;
};

/**
 * Sheet for adding topics to a subject: let AI suggest the subject's core
 * topics, write one yourself, or let AI find the topics in your own notes.
 */
export function AddTopicSheet({ visible, onClose, subjectName, existingNames, onAdd }: Props) {
  const { preferences } = useAppSettings();
  const L = (en: string, no: string) => (preferences.language === 'no' ? no : en);
  const palette = useProgressPalette();

  const [view, setView] = useState<View_>('menu');
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [fromNotes, setFromNotes] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const taken = new Set(existingNames.map((item) => item.trim().toLocaleLowerCase()));
  const isTaken = (value: string) => taken.has(value.trim().toLocaleLowerCase());
  const open = suggestions.filter((item) => !isTaken(item));

  function close() {
    if (loading || saving) return;
    setView('menu');
    setName('');
    setMessage('');
    setError('');
    onClose();
  }

  async function add(names: string[]) {
    const fresh = names.map((item) => item.trim()).filter((item) => item && !isTaken(item));
    if (fresh.length === 0 || saving) return false;
    setSaving(true);
    setError('');
    const saved = await onAdd(fresh);
    setSaving(false);
    if (!saved) setError(L('The topic could not be saved. Try again.', 'Temaet kunne ikke lagres. Prøv igjen.'));
    return saved;
  }

  async function addManual() {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (isTaken(trimmed)) {
      setError(L('This subject already has a topic with that name.', 'Emnet har allerede et tema med det navnet.'));
      return;
    }
    if (await add([trimmed])) {
      setMessage(L(`Added "${trimmed}". Add another, or close.`, `La til «${trimmed}». Legg til et til, eller lukk.`));
      setName('');
    }
  }

  async function suggest(useNotes: boolean) {
    if (loading) return;
    const material = useNotes ? notes.trim() : '';
    if (useNotes && !material) {
      setError(L('Paste notes or import a PDF first.', 'Lim inn notater eller importer en PDF først.'));
      return;
    }
    setLoading(true);
    setError('');
    setMessage('');
    try {
      const topics = await suggestAITopics({ subjectName, existingTopics: existingNames, sourceMaterial: material || undefined, count: 12 });
      setSuggestions(topics);
      setFromNotes(useNotes);
      setView('menu');
    } catch (suggestError) {
      setError(suggestError instanceof Error ? suggestError.message : L('AI could not suggest topics. Try again.', 'AI kunne ikke foreslå temaer. Prøv igjen.'));
    } finally {
      setLoading(false);
    }
  }

  const option = (icon: StudyIconName, title: string, detail: string, onPress: () => void, busy = false) => (
    <Pressable accessibilityRole="button" accessibilityLabel={`${title}. ${detail}`} disabled={loading || saving} onPress={onPress} style={({ pressed }) => [styles.option, pressed && p.pressed]}>
      <View style={p.iconChip}>{busy ? <ActivityIndicator color={palette.accent} /> : <StudyIcon name={icon} size={20} color={palette.accent} />}</View>
      <View style={p.grow}>
        <Text style={styles.optionTitle}>{title}</Text>
        <Text style={p.small}>{detail}</Text>
      </View>
      <StudyIcon name="chevron" size={12} color={ink.muted} />
    </Pressable>
  );

  let content;
  if (view === 'manual') {
    content = (
      <>
        <Text style={ui.fieldLabel}>{L('TOPIC NAME', 'NAVN PÅ TEMAET')}</Text>
        <TextInput
          value={name}
          onChangeText={(value) => { setName(value); setError(''); }}
          style={ui.textInput}
          placeholder={L('e.g. Cranial nerves', 'f.eks. Hjernenerver')}
          placeholderTextColor={appColor('#91A2AE', 'text')}
          maxLength={MAX_TOPIC_NAME_LENGTH}
          autoFocus
          autoCapitalize="sentences"
          returnKeyType="done"
          blurOnSubmit={false}
          onSubmitEditing={() => { void addManual(); }}
          accessibilityLabel={L('Topic name', 'Navn på temaet')}
        />
        {message ? <Text style={p.small}>{message}</Text> : null}
        {error ? <Text style={ui.formError}>{error}</Text> : null}
        <View style={ui.modalActions}>
          <Pressable accessibilityRole="button" style={ui.secondaryButton} onPress={() => { setView('menu'); setError(''); setMessage(''); }} disabled={saving}><Text style={ui.secondaryButtonText}>{L('Back', 'Tilbake')}</Text></Pressable>
          <Pressable accessibilityRole="button" style={[ui.primaryButton, (!name.trim() || saving) && ui.disabled]} onPress={() => { void addManual(); }} disabled={!name.trim() || saving}>
            {saving ? <ActivityIndicator color="#FFFFFF" /> : <Text style={ui.primaryButtonText}>{L('Add topic', 'Legg til tema')}</Text>}
          </Pressable>
        </View>
      </>
    );
  } else if (view === 'import') {
    content = (
      <>
        <Text style={ui.fieldLabel}>{L('YOUR NOTES OR CURRICULUM', 'NOTATENE ELLER PENSUMLISTEN DIN')}</Text>
        <TextInput
          value={notes}
          onChangeText={(value) => { setNotes(value); setError(''); }}
          style={[ui.textInput, styles.notes]}
          placeholder={L('Paste lecture notes, a syllabus or learning objectives', 'Lim inn forelesningsnotater, pensumliste eller læringsmål')}
          placeholderTextColor={appColor('#91A2AE', 'text')}
          multiline
          maxLength={20000}
          textAlignVertical="top"
          editable={!loading}
          accessibilityLabel={L('Your notes', 'Notatene dine')}
        />
        <ImportNotesButton disabled={loading} onImported={(imported) => setNotes((current) => mergeNotes(current, imported))} />
        <Text style={p.small}>{L('AI reads the text and lists the topics it covers. You choose which ones to add.', 'AI leser teksten og lister opp temaene den dekker. Du velger hvilke du vil legge til.')}</Text>
        {error ? <Text style={ui.formError}>{error}</Text> : null}
        <View style={ui.modalActions}>
          <Pressable accessibilityRole="button" style={ui.secondaryButton} onPress={() => { setView('menu'); setError(''); }} disabled={loading}><Text style={ui.secondaryButtonText}>{L('Back', 'Tilbake')}</Text></Pressable>
          <Pressable accessibilityRole="button" style={[ui.primaryButton, loading && ui.disabled]} onPress={() => { void suggest(true); }} disabled={loading}>
            {loading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={ui.primaryButtonText}>{L('Find topics', 'Finn temaer')}</Text>}
          </Pressable>
        </View>
      </>
    );
  } else {
    content = (
      <>
        {option('sparkles', L('Suggest topics with AI', 'Få forslag fra AI'), L('AI lists the core topics normally taught in this subject.', 'AI lister opp kjernetemaene som vanligvis undervises i emnet.'), () => { void suggest(false); }, loading)}
        {option('pencil', L('Add topic manually', 'Legg til tema selv'), L('Write the name of a topic yourself.', 'Skriv navnet på et tema selv.'), () => { setView('manual'); setError(''); setMessage(''); })}
        {option('upload', L('Import from notes or PDF', 'Importer fra notater eller PDF'), L('AI finds the topics in your own course material.', 'AI finner temaene i ditt eget pensum.'), () => { setView('import'); setError(''); })}
        {error ? <Text style={ui.formError}>{error}</Text> : null}

        {suggestions.length > 0 ? (
          <>
            <View style={styles.suggestHeader}>
              <Text style={ui.fieldLabel}>{fromNotes ? L('TOPICS IN YOUR NOTES', 'TEMAER I NOTATENE DINE') : L('SUGGESTED TOPICS', 'FORESLÅTTE TEMAER')}</Text>
              {open.length > 1 ? (
                <Pressable accessibilityRole="button" disabled={saving} onPress={() => { void add(open); }} hitSlop={8}>
                  <Text style={[styles.addAll, { color: palette.accent }]}>{L(`Add all ${open.length}`, `Legg til alle ${open.length}`)}</Text>
                </Pressable>
              ) : null}
            </View>
            {suggestions.map((item) => {
              const added = isTaken(item);
              return (
                <Pressable key={item} accessibilityRole="button" accessibilityState={{ disabled: added }} accessibilityLabel={added ? L(`${item}, added`, `${item}, lagt til`) : L(`Add ${item}`, `Legg til ${item}`)} disabled={added || saving} onPress={() => { void add([item]); }} style={({ pressed }) => [styles.suggestion, pressed && p.pressed]}>
                  <Text style={[styles.suggestionText, added && styles.suggestionAdded]} numberOfLines={2}>{item}</Text>
                  <View style={[styles.plus, { borderColor: added ? 'transparent' : palette.accent }]}>
                    <StudyIcon name={added ? 'check' : 'plus'} size={13} color={added ? ink.muted : palette.accent} />
                  </View>
                </Pressable>
              );
            })}
            <Text style={p.small}>{L('AI suggestions can be wrong for your course. Check them against your curriculum.', 'AI-forslag kan være feil for ditt studium. Sjekk dem mot pensumlisten.')}</Text>
          </>
        ) : null}
      </>
    );
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <KeyboardAvoidingView style={styles.keyboard} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={ui.modalBackdrop}>
          <ScrollView style={styles.max} contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'} automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}>
            <View style={ui.modalCard}>
              <View style={styles.top}>
                <Text style={[ui.modalTitle, p.grow]} numberOfLines={2}>{L(`Add topic to ${subjectName}`, `Legg til tema i ${subjectName}`)}</Text>
                <Pressable accessibilityRole="button" accessibilityLabel={L('Close', 'Lukk')} onPress={close} style={({ pressed }) => [styles.close, pressed && p.pressed]} hitSlop={8}>
                  <StudyIcon name="x" size={16} color={ink.secondary} />
                </Pressable>
              </View>
              {content}
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  keyboard: { flex: 1 },
  max: { maxHeight: '92%' },
  scroll: { flexGrow: 1, justifyContent: 'flex-end' },
  top: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4 },
  close: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: appColor('#EFF4F6', 'background') },
  option: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 13, borderRadius: 16, backgroundColor: appColor('#FFFFFF', 'background'), borderWidth: 1, borderColor: appColor('#E7F0F4', 'border'), ...cardShadow },
  optionTitle: { color: ink.primary, fontSize: 15, fontWeight: '700', marginBottom: 2 },
  notes: { minHeight: 120 },
  suggestHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
  addAll: { fontSize: 13, fontWeight: '800' },
  suggestion: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 46, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: appColor('#D8E6EC', 'border') },
  suggestionText: { flex: 1, color: ink.primary, fontSize: 15 },
  suggestionAdded: { color: ink.muted },
  plus: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5 },
});
