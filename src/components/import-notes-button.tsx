import { LocalizedText as Text } from '@/components/localized-text';
import { StudyIcon } from '@/components/study-icon';
import { appColor } from '@/constants/adaptive-color';
import { MAX_NOTES_PDF_BYTES, extractNotesFromPdf } from '@/services/ai-api';
import { useAppSettings } from '@/services/app-settings-context';
import { tr } from '@/services/localization';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, View } from 'react-native';

export const MAX_NOTES_LENGTH = 20_000;

/** Adds imported notes after anything already written, within the notes limit. */
export function mergeNotes(current: string, imported: string) {
  const existing = current.trim();
  return (existing ? `${existing}\n\n${imported}` : imported).slice(0, MAX_NOTES_LENGTH);
}

type Props = {
  /** Called with study notes the AI wrote from the chosen PDF. */
  onImported: (notes: string) => void;
  disabled?: boolean;
};

/**
 * Lets the student pick a lecture PDF instead of pasting notes. The AI server
 * reads the PDF and returns notes that fill the "course notes" field, where
 * they can be checked and edited before any questions are generated.
 */
export function ImportNotesButton({ onImported, disabled = false }: Props) {
  const { preferences } = useAppSettings();
  const tx = (text: string) => tr(text, preferences.language);
  const [reading, setReading] = useState(false);
  const [importedName, setImportedName] = useState('');

  async function importPdf() {
    if (reading || disabled) return;
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true, multiple: false });
      if (result.canceled) return;
      const asset = result.assets[0];
      if (!asset) return;
      if (asset.size && asset.size > MAX_NOTES_PDF_BYTES) {
        Alert.alert(tx('Could not read this PDF'), tx('The PDF is over 10 MB. Choose a smaller file or split it into parts.'));
        return;
      }

      setReading(true);
      setImportedName('');
      const dataBase64 = await new File(asset.uri).base64();
      const { notes, truncated } = await extractNotesFromPdf({ fileName: asset.name, dataBase64 });
      onImported(notes);
      setImportedName(asset.name);
      if (truncated) {
        Alert.alert(tx('Notes shortened'), tx('This PDF is long, so only the first part of the notes fits. Split the PDF to cover the rest.'));
      }
    } catch (error) {
      Alert.alert(tx('Could not read this PDF'), error instanceof Error ? tx(error.message) : tx('Please try again.'));
    } finally {
      setReading(false);
    }
  }

  return (
    <View style={styles.wrap}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: disabled || reading, busy: reading }}
        onPress={() => { void importPdf(); }}
        disabled={disabled || reading}
        style={({ pressed }) => [styles.button, (disabled || reading) && styles.disabled, pressed && styles.pressed]}
      >
        {reading ? <ActivityIndicator color={appColor('#327E9D', 'text')} /> : <StudyIcon name="book" size={17} />}
        <Text style={styles.buttonText}>{reading ? 'Reading the PDF…' : 'Import notes from a PDF'}</Text>
      </Pressable>
      <Text style={styles.hint}>
        {importedName
          ? 'Notes added from your PDF. Check them before you generate.'
          : reading
            ? 'This can take up to a minute for long lectures.'
            : 'The PDF is sent to the AI to be read. Maximum 10 MB.'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6, marginTop: 8 },
  button: { minHeight: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 12, borderWidth: 1, borderColor: appColor('#DDE8ED', 'border'), backgroundColor: appColor('#FFFFFF', 'background'), paddingHorizontal: 14 },
  buttonText: { color: appColor('#337E9C', 'text'), fontSize: 13, fontWeight: '800' },
  hint: { color: appColor('#7B8E9B', 'text'), fontSize: 11, lineHeight: 16 },
  disabled: { opacity: 0.55 },
  pressed: { opacity: 0.82 },
});
