import { ImportNotesButton, mergeNotes } from '@/components/import-notes-button';
import { p, useProgressPalette } from '@/components/progress/theme';
import { StudyIcon } from '@/components/study-icon';
import { appColor } from '@/constants/adaptive-color';
import { ui } from '@/constants/ui';
import { useAppSettings } from '@/services/app-settings-context';
import { MAX_TOPIC_NOTES_LENGTH, getTopicNotes, saveTopicNotes } from '@/services/storage';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

/**
 * Course material that belongs to one topic. It is saved on the topic, so
 * flashcards, quizzes and Active Recall questions for that topic are all
 * made from the same notes without pasting them again.
 */
export type TopicNotesState = {
  notes: string;
  setNotes: (update: string | ((current: string) => string)) => void;
  /** Reads the saved notes again, dropping edits that were not saved. */
  load: () => Promise<void>;
  /** Saves the notes on the topic and returns the text that was saved. */
  save: () => Promise<string>;
  /** Length of the notes saved on the topic. */
  savedLength: number;
};

export function useTopicNotes(topicId: string): TopicNotesState {
  const [notes, setNotes] = useState('');
  const [savedLength, setSavedLength] = useState(0);

  const load = useCallback(async () => {
    try {
      const text = await getTopicNotes(topicId);
      setNotes(text);
      setSavedLength(text.length);
    } catch (error) {
      console.warn('Could not load the topic notes:', error);
    }
  }, [topicId]);

  useEffect(() => { void load(); }, [load]);

  const save = useCallback(async () => {
    const text = notes.trim().slice(0, MAX_TOPIC_NOTES_LENGTH);
    await saveTopicNotes(topicId, text);
    setSavedLength(text.length);
    return text;
  }, [notes, topicId]);

  return { notes, setNotes, load, save, savedLength };
}

/** The notes box and PDF import used inside the "create with AI" sheets. */
export function TopicNotesField({ state, disabled = false }: { state: TopicNotesState; disabled?: boolean }) {
  const { preferences } = useAppSettings();
  const L = (en: string, no: string) => (preferences.language === 'no' ? no : en);
  return (
    <>
      <Text style={ui.fieldLabel}>{L('COURSE MATERIAL FOR THIS TOPIC (OPTIONAL)', 'PENSUM FOR DETTE TEMAET (VALGFRITT)')}</Text>
      <TextInput
        value={state.notes}
        onChangeText={state.setNotes}
        style={[ui.textInput, styles.notes]}
        placeholder={L('Paste lecture notes or learning objectives', 'Lim inn forelesningsnotater eller læringsmål')}
        placeholderTextColor={appColor('#91A2AE', 'text')}
        multiline
        maxLength={MAX_TOPIC_NOTES_LENGTH}
        textAlignVertical="top"
        editable={!disabled}
        accessibilityLabel={L('Course material for this topic', 'Pensum for dette temaet')}
      />
      <ImportNotesButton disabled={disabled} onImported={(imported) => state.setNotes((current) => mergeNotes(current, imported))} />
      <Text style={p.small}>{L(
        'Saved on this topic and used for its flashcards, quizzes and Active Recall. Without material, AI uses general medical knowledge about the topic.',
        'Lagres på dette temaet og brukes til flashcards, quiz og Active Recall her. Uten pensum bruker AI generell medisinsk kunnskap om temaet.',
      )}</Text>
    </>
  );
}

/** Sheet on the topic page for adding or editing the topic's course material. */
export function TopicMaterialSheet({ visible, onClose, state, topicName }: { visible: boolean; onClose: () => void; state: TopicNotesState; topicName: string }) {
  const { preferences } = useAppSettings();
  const L = (en: string, no: string) => (preferences.language === 'no' ? no : en);
  const palette = useProgressPalette();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  function cancel() {
    if (busy) return;
    setError(false);
    void state.load();
    onClose();
  }

  async function save() {
    if (busy) return;
    setBusy(true);
    setError(false);
    try {
      await state.save();
      onClose();
    } catch (saveError) {
      console.warn('Could not save the topic notes:', saveError);
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={cancel}>
      <KeyboardAvoidingView style={styles.keyboard} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={ui.modalBackdrop}>
          <ScrollView style={styles.max} contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'} automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}>
            <View style={ui.modalCard}>
              <View style={ui.modalHeader}>
                <View style={ui.modalIcon}><StudyIcon name="note" size={18} color={palette.accent} /></View>
                <View style={ui.grow}>
                  <Text style={ui.modalTitle}>{L('Course material', 'Pensum')}</Text>
                  <Text style={ui.cardDescription} numberOfLines={1}>{topicName}</Text>
                </View>
              </View>
              <TopicNotesField state={state} disabled={busy} />
              {error ? <Text style={ui.formError}>{L('The material could not be saved. Try again.', 'Pensumet kunne ikke lagres. Prøv igjen.')}</Text> : null}
              <View style={ui.modalActions}>
                <Pressable accessibilityRole="button" style={ui.secondaryButton} onPress={cancel} disabled={busy}><Text style={ui.secondaryButtonText}>{L('Cancel', 'Avbryt')}</Text></Pressable>
                <Pressable accessibilityRole="button" style={[ui.primaryButton, busy && ui.disabled]} onPress={() => { void save(); }} disabled={busy}>
                  {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={ui.primaryButtonText}>{L('Save', 'Lagre')}</Text>}
                </Pressable>
              </View>
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
  notes: { minHeight: 130 },
});
