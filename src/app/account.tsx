import { LocalizedText as Text } from '@/components/localized-text';
import { SettingsChoice } from '@/components/settings-shared';
import { StudyIcon, type StudyIconName } from '@/components/study-icon';
import { appColor } from '@/constants/adaptive-color';
import { brand } from '@/constants/ui';
import { useAppSettings } from '@/services/app-settings-context';
import { useAuth } from '@/services/auth-context';
import { getSupabaseAuthClient } from '@/services/cloud-sync';
import { tr } from '@/services/localization';
import { getProfileAvatar, removeProfileAvatar, saveProfileAvatar } from '@/services/profile-avatar';
import * as DocumentPicker from 'expo-document-picker';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { Stack, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const MAX_PHOTO_BYTES = 15 * 1024 * 1024;
const STUDY_YEARS = ['1', '2', '3', '4', '5', '6'];

type Details = {
  fullName: string; dateOfBirth: string; studyProgram: string; institution: string; studyYear: string; location: string; about: string;
};
type FieldName = keyof Details;

/** Saved as YYYY-MM-DD, typed and shown in the form as DD.MM.YYYY. */
function isoToInput(iso: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return match ? `${match[3]}.${match[2]}.${match[1]}` : '';
}

function inputToIso(input: string): string | null {
  const match = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(input);
  if (!match) return null;
  const [day, month, year] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(year, month - 1, day);
  const real = date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
  if (!real || year < 1900 || date.getTime() > Date.now()) return null;
  return `${match[3]}-${match[2]}-${match[1]}`;
}

/** Adds the dots while the date is typed: 14022002 becomes 14.02.2002. */
function formatDateInput(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 8);
  return [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4, 8)].filter(Boolean).join('.');
}

function readDetails(metadata: Record<string, unknown> | undefined): Details {
  const text = (key: string) => String(metadata?.[key] ?? '').trim();
  return {
    fullName: text('full_name'),
    dateOfBirth: isoToInput(text('date_of_birth')),
    studyProgram: text('study_program'),
    institution: text('institution'),
    studyYear: text('study_year'),
    location: text('location'),
    about: text('about'),
  };
}

const ROWS: { field: FieldName; icon: StudyIconName; label: string; placeholder: string }[] = [
  { field: 'fullName', icon: 'person', label: 'Full name', placeholder: 'Your name' },
  { field: 'dateOfBirth', icon: 'calendar', label: 'Date of birth', placeholder: 'DD.MM.YYYY' },
  { field: 'studyProgram', icon: 'book', label: 'Education', placeholder: 'e.g. Medicine' },
  { field: 'institution', icon: 'graduation', label: 'University', placeholder: 'e.g. University of Pécs' },
  { field: 'studyYear', icon: 'chart', label: 'Study year', placeholder: '' },
  { field: 'location', icon: 'location', label: 'Location', placeholder: 'City, country' },
  { field: 'about', icon: 'note', label: 'About', placeholder: 'Add a short bio (optional)' },
];

/** Personal information sheet: shows the profile, and lets the student edit it and the photo. */
export default function AccountScreen() {
  const { session } = useAuth();
  const { preferences } = useAppSettings();
  const tx = (text: string) => tr(text, preferences.language);
  const user = session?.user;
  const userId = user?.id;
  const avatarPath = user?.user_metadata?.medexam_avatar_path;
  const saved = readDetails(user?.user_metadata);

  const [details, setDetails] = useState<Details>(saved);
  const [editing, setEditing] = useState(false);
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let current = true;
    if (!userId) { setAvatarUri(null); return () => { current = false; }; }
    void getProfileAvatar(userId, avatarPath).then((uri) => { if (current) setAvatarUri(uri); }).catch(() => { if (current) setAvatarUri(null); });
    return () => { current = false; };
  }, [userId, avatarPath]);

  const birthIso = details.dateOfBirth ? inputToIso(details.dateOfBirth) : '';
  const birthValid = birthIso !== null;
  const changed = (Object.keys(details) as FieldName[]).some((key) => details[key].trim() !== saved[key]);

  function update(field: FieldName, value: string) {
    setDetails((current) => ({ ...current, [field]: value }));
    setError('');
  }

  function startEditing() {
    setDetails(saved);
    setError('');
    setEditing(true);
  }

  function cancelEditing() {
    setDetails(saved);
    setError('');
    setEditing(false);
  }

  async function save() {
    if (saving) return;
    if (!details.fullName.trim()) { setError('Your name cannot be empty.'); return; }
    if (!birthValid) { setError('Enter the date of birth as DD.MM.YYYY.'); return; }
    if (!changed) { setEditing(false); return; }
    const auth = getSupabaseAuthClient();
    if (!auth) { setError('Please sign in again and retry.'); return; }
    setSaving(true);
    setError('');
    try {
      const { error: saveError } = await auth.updateUser({ data: {
        ...(user?.user_metadata ?? {}),
        full_name: details.fullName.trim(),
        date_of_birth: birthIso ?? '',
        study_program: details.studyProgram.trim(),
        institution: details.institution.trim(),
        study_year: details.studyYear.trim(),
        location: details.location.trim(),
        about: details.about.trim(),
      } });
      if (saveError) throw saveError;
      setEditing(false);
    } catch (saveError) {
      console.warn('Could not save profile details:', saveError);
      setError('Could not save. Check your connection and try again.');
    } finally {
      setSaving(false);
    }
  }

  async function persistPhoto(sourceUri: string, mimeType?: string, fileName?: string | null) {
    if (!userId) return;
    setPhotoBusy(true);
    try {
      const result = await saveProfileAvatar(userId, sourceUri, mimeType, fileName);
      setAvatarUri(result.uri);
      if (!result.cloudSynced) Alert.alert(tx('Photo saved on this device'), tx('It will sync to your account when the connection is back.'));
    } catch (photoError) {
      console.warn('Could not save profile photo:', photoError);
      Alert.alert(tx('Could not save photo'), tx('Choose a different image and try again.'));
    } finally {
      setPhotoBusy(false);
    }
  }

  async function pickFromLibrary() {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.8 });
      if (result.canceled) return;
      const asset = result.assets[0];
      if (!asset?.uri) return;
      if (asset.fileSize && asset.fileSize > MAX_PHOTO_BYTES) { Alert.alert(tx('Could not save photo'), tx('This image is over 15 MB. Choose a smaller photo.')); return; }
      await persistPhoto(asset.uri, asset.mimeType, asset.fileName);
    } catch (photoError) {
      console.warn('Could not open the photo library:', photoError);
      Alert.alert(tx('Could not open photo library'), tx('Please try again.'));
    }
  }

  async function pickFromFiles() {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: 'image/*', copyToCacheDirectory: true, multiple: false });
      if (result.canceled) return;
      const asset = result.assets[0];
      if (!asset) return;
      if (asset.size && asset.size > MAX_PHOTO_BYTES) { Alert.alert(tx('Could not save photo'), tx('This image is over 15 MB. Choose a smaller photo.')); return; }
      if (!asset.mimeType?.startsWith('image/') && !/\.(png|jpe?g|webp|heic)$/i.test(asset.name)) { Alert.alert(tx('Could not save photo'), tx('Choose an image file such as JPG, PNG or HEIC.')); return; }
      await persistPhoto(asset.uri, asset.mimeType, asset.name);
    } catch (photoError) {
      console.warn('Could not open Files:', photoError);
      Alert.alert(tx('Could not open image file'), tx('Please try again.'));
    }
  }

  function removePhoto() {
    if (!userId) return;
    Alert.alert(tx('Remove profile picture?'), tx('Your initials will be shown instead.'), [
      { text: tx('Cancel'), style: 'cancel' },
      { text: tx('Remove'), style: 'destructive', onPress: () => {
        setPhotoBusy(true);
        void removeProfileAvatar(userId, avatarPath)
          .then(() => setAvatarUri(null))
          .catch(() => Alert.alert(tx('Could not remove photo'), tx('Please try again.')))
          .finally(() => setPhotoBusy(false));
      } },
    ]);
  }

  function choosePhoto() {
    if (photoBusy) return;
    Alert.alert(tx('Profile picture'), undefined, [
      { text: tx('Photo library'), onPress: () => { void pickFromLibrary(); } },
      { text: tx('Browse Files'), onPress: () => { void pickFromFiles(); } },
      ...(avatarUri ? [{ text: tx('Remove photo'), style: 'destructive' as const, onPress: removePhoto }] : []),
      { text: tx('Cancel'), style: 'cancel' as const },
    ]);
  }

  function displayValue(field: FieldName) {
    const value = saved[field];
    if (!value) return '';
    if (field === 'dateOfBirth') {
      const iso = inputToIso(value);
      return iso ? new Date(`${iso}T00:00:00`).toLocaleDateString(preferences.language === 'no' ? 'nb-NO' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : value;
    }
    return value;
  }

  const shown = editing ? details : saved;
  const initial = (shown.fullName || user?.email || 'M').slice(0, 1).toUpperCase();

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.grabber} />
      <Pressable accessibilityRole="button" accessibilityLabel={tx('Close')} onPress={() => router.back()} style={({ pressed }) => [styles.close, pressed && styles.pressed]} hitSlop={10}>
        <StudyIcon name="x" size={18} color={appColor('#577082', 'text')} />
      </Pressable>

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <Pressable accessibilityRole="button" accessibilityLabel={tx('Edit photo')} onPress={choosePhoto} disabled={photoBusy} style={({ pressed }) => pressed && styles.pressed}>
            <View style={styles.avatar}>
              {avatarUri ? <Image source={{ uri: avatarUri }} contentFit="cover" style={styles.avatarImage} /> : <Text style={styles.avatarInitial}>{initial}</Text>}
              {photoBusy ? <View style={styles.avatarBusy}><ActivityIndicator color="#FFFFFF" /></View> : null}
            </View>
            <View style={styles.cameraBadge}><StudyIcon name="camera" size={16} color="#FFFFFF" /></View>
          </Pressable>
          <Text style={styles.name} numberOfLines={1}>{shown.fullName || tx('Medora account')}</Text>
          <Text style={styles.email} numberOfLines={1}>{user?.email ?? ''}</Text>
          <View style={styles.chip}>
            <StudyIcon name="graduation" size={14} color={ACCENT} />
            <Text style={styles.chipText}>Medical student</Text>
          </View>
        </View>

        <View style={styles.card}>
          {ROWS.map((row, index) => {
            const content = (
              <>
                <View style={styles.rowIcon}><StudyIcon name={row.icon} size={21} color={appColor('#577082', 'text')} /></View>
                <View style={styles.rowText}>
                  <Text style={styles.rowLabel}>{row.label}</Text>
                  {!editing ? (
                    <Text style={[styles.rowValue, !saved[row.field] && styles.rowEmpty]} numberOfLines={row.field === 'about' ? 3 : 1}>
                      {displayValue(row.field) || (row.field === 'about' ? tx('Add a short bio (optional)') : tx('Not added'))}
                    </Text>
                  ) : row.field === 'studyYear' ? (
                    <SettingsChoice
                      value={details.studyYear}
                      onChange={(value) => update('studyYear', details.studyYear === value ? '' : value)}
                      options={STUDY_YEARS.map((year) => ({ value: year, label: year }))}
                    />
                  ) : (
                    <TextInput
                      style={[styles.input, row.field === 'about' && styles.inputMultiline]}
                      value={details[row.field]}
                      onChangeText={(value) => update(row.field, row.field === 'dateOfBirth' ? formatDateInput(value) : value)}
                      placeholder={tx(row.placeholder)}
                      placeholderTextColor={appColor('#9AAAB4', 'text')}
                      keyboardType={row.field === 'dateOfBirth' ? 'number-pad' : 'default'}
                      autoCapitalize={row.field === 'about' ? 'sentences' : 'words'}
                      autoCorrect={row.field === 'about'}
                      autoComplete={row.field === 'fullName' ? 'name' : row.field === 'dateOfBirth' ? 'birthdate-full' : 'off'}
                      multiline={row.field === 'about'}
                      maxLength={row.field === 'about' ? 200 : row.field === 'dateOfBirth' ? 10 : 100}
                      editable={!saving}
                      accessibilityLabel={tx(row.label)}
                    />
                  )}
                </View>
                {!editing ? <StudyIcon name="chevron" size={13} color={appColor('#8DA2AF', 'text')} /> : null}
              </>
            );
            return (
              <View key={row.field}>
                {index > 0 ? <View style={styles.divider} /> : null}
                {index === 1 ? (
                  // Email sits after the name and cannot be changed here.
                  <>
                    <View style={styles.row}>
                      <View style={styles.rowIcon}><StudyIcon name="mail" size={21} color={appColor('#577082', 'text')} /></View>
                      <View style={styles.rowText}>
                        <Text style={styles.rowLabel}>Email</Text>
                        <Text style={[styles.rowValue, editing && styles.rowEmpty]} numberOfLines={1}>{user?.email ?? ''}</Text>
                      </View>
                    </View>
                    <View style={styles.divider} />
                  </>
                ) : null}
                {editing
                  ? <View style={styles.row}>{content}</View>
                  : <Pressable accessibilityRole="button" onPress={startEditing} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>{content}</Pressable>}
              </View>
            );
          })}
        </View>

        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}

        {editing ? (
          <>
            <Pressable accessibilityRole="button" accessibilityState={{ disabled: saving, busy: saving }} onPress={() => { void save(); }} disabled={saving} style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}>
              {saving ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryText}>Save changes</Text>}
            </Pressable>
            <Pressable accessibilityRole="button" onPress={cancelEditing} disabled={saving} style={styles.cancelButton}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
          </>
        ) : (
          <Pressable accessibilityRole="button" onPress={startEditing} style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}>
            <Text style={styles.primaryText}>Edit profile</Text>
          </Pressable>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const ACCENT = '#3B9BD9';

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: appColor('#F7FBFE', 'background') },
  pressed: { opacity: 0.6 },
  grabber: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, marginTop: 10, backgroundColor: appColor('#C6D5DC', 'border') },
  close: { position: 'absolute', top: 14, right: 14, zIndex: 2, width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: appColor('#E6EEF2', 'background') },
  content: { paddingHorizontal: 20, paddingTop: 22, paddingBottom: 30 },

  hero: { alignItems: 'center', marginBottom: 22 },
  avatar: { width: 116, height: 116, borderRadius: 58, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', backgroundColor: appColor('#E1F3F7', 'background') },
  avatarImage: { width: '100%', height: '100%' },
  avatarInitial: { color: appColor('#0F7181', 'text'), fontSize: 44, fontWeight: '800' },
  avatarBusy: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(14, 31, 43, 0.45)' },
  cameraBadge: { position: 'absolute', right: 0, bottom: 0, width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: ACCENT, borderWidth: 3, borderColor: appColor('#F7FBFE', 'background') },
  name: { color: appColor('#17324D', 'text'), fontSize: 23, fontWeight: '800', letterSpacing: -0.3, marginTop: 14 },
  email: { color: appColor('#718493', 'text'), fontSize: 14, marginTop: 3 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 12, paddingHorizontal: 14, paddingVertical: 7, borderRadius: 14, backgroundColor: 'rgba(59, 155, 217, 0.14)' },
  chipText: { color: ACCENT, fontSize: 13, fontWeight: '700' },

  card: { backgroundColor: appColor('#FFFFFF', 'background'), borderRadius: 20, paddingHorizontal: 16, paddingVertical: 4, borderWidth: 1, borderColor: appColor('#E7F0F4', 'border') },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: appColor('#D8E6EC', 'border') },
  row: { minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 10 },
  rowIcon: { width: 26, alignItems: 'center' },
  rowText: { flex: 1 },
  rowLabel: { color: appColor('#718493', 'text'), fontSize: 12, fontWeight: '600' },
  rowValue: { color: appColor('#17324D', 'text'), fontSize: 15, fontWeight: '500', marginTop: 3 },
  rowEmpty: { color: appColor('#9AAAB4', 'text') },
  input: { minHeight: 28, paddingVertical: 3, paddingHorizontal: 0, marginTop: 1, color: appColor('#17324D', 'text'), fontSize: 16, fontWeight: '500' },
  inputMultiline: { minHeight: 56, textAlignVertical: 'top' },

  error: { color: appColor('#A34338', 'text'), fontSize: 13, fontWeight: '600', textAlign: 'center', marginTop: 14 },
  primaryButton: { minHeight: 56, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginTop: 18, backgroundColor: ACCENT, shadowColor: '#1F6FA8', shadowOpacity: 0.3, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 4 },
  primaryText: { color: brand.onPrimary, fontSize: 17, fontWeight: '800' },
  cancelButton: { minHeight: 48, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  cancelText: { color: appColor('#577082', 'text'), fontSize: 15, fontWeight: '700' },
});
