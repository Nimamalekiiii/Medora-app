import { LocalizedText as Text } from '@/components/localized-text';
import { appColor } from '@/constants/adaptive-color';
import { useEffect, useState } from 'react';
import { Alert, ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { useRouter } from 'expo-router';

import PullToRefreshScrollView from '../../components/pull-to-refresh-scroll-view';
import { useAuth } from '../../services/auth-context';
import { getSupabaseAuthClient } from '../../services/cloud-sync';
import { getProfileAvatar, removeProfileAvatar, saveProfileAvatar } from '../../services/profile-avatar';
import { useAppSettings } from '../../services/app-settings-context';
import { tr } from '../../services/localization';

export default function ProfileTab() {
  const router = useRouter();
  const { session } = useAuth();
  const { preferences } = useAppSettings();
  const tx = (text: string) => tr(text, preferences.language);
  const [fullName, setFullName] = useState(String(session?.user.user_metadata.full_name ?? ''));
  const [studyProgram, setStudyProgram] = useState(String(session?.user.user_metadata.study_program ?? ''));
  const [institution, setInstitution] = useState(String(session?.user.user_metadata.institution ?? ''));
  const [studyYear, setStudyYear] = useState(String(session?.user.user_metadata.study_year ?? ''));
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [profileVisible, setProfileVisible] = useState(false);
  const [profileBusy, setProfileBusy] = useState(false);

  useEffect(() => {
    setFullName(String(session?.user.user_metadata.full_name ?? ''));
    setStudyProgram(String(session?.user.user_metadata.study_program ?? ''));
    setInstitution(String(session?.user.user_metadata.institution ?? ''));
    setStudyYear(String(session?.user.user_metadata.study_year ?? ''));
  }, [session?.user.id, session?.user.user_metadata.full_name, session?.user.user_metadata.study_program, session?.user.user_metadata.institution, session?.user.user_metadata.study_year]);

  useEffect(() => {
    let current = true;
    if (!session?.user.id) {
      setAvatarUri(null);
      return () => { current = false; };
    }
    void getProfileAvatar(session.user.id, session.user.user_metadata.medexam_avatar_path).then((uri) => { if (current) setAvatarUri(uri); }).catch(() => { if (current) setAvatarUri(null); });
    return () => { current = false; };
  }, [session?.user.id]);

  function openProfileEditor() {
    setFullName(String(session?.user.user_metadata.full_name ?? ''));
    setStudyProgram(String(session?.user.user_metadata.study_program ?? ''));
    setInstitution(String(session?.user.user_metadata.institution ?? ''));
    setStudyYear(String(session?.user.user_metadata.study_year ?? ''));
    setProfileVisible(true);
  }

  async function saveProfileDetails() {
    const auth = getSupabaseAuthClient();
    if (!auth) return Alert.alert('Sign in required', 'Please sign in again and retry.');
    if (!fullName.trim()) return Alert.alert('Add your name', 'Your name cannot be empty.');
    setProfileBusy(true);
    try {
      const { error } = await auth.updateUser({ data: {
        ...(session?.user.user_metadata ?? {}),
        full_name: fullName.trim(),
        study_program: studyProgram.trim(),
        institution: institution.trim(),
        study_year: studyYear.trim(),
      } });
      if (error) throw error;
      setProfileVisible(false);
      Alert.alert('Profile saved', 'Your profile details are updated on your account.');
    } catch (error) {
      Alert.alert('Could not save profile', error instanceof Error ? error.message : 'Check your connection and try again.');
    } finally { setProfileBusy(false); }
  }

  async function persistAvatar(sourceUri: string, mimeType?: string, fileName?: string | null) {
    if (!session?.user.id) return Alert.alert('Sign in required', 'Sign in to save a profile picture.');
    setProfileBusy(true);
    try {
      const result = await saveProfileAvatar(session.user.id, sourceUri, mimeType, fileName);
      setAvatarUri(result.uri);
      if (!result.cloudSynced) Alert.alert('Photo saved on this device', `${result.cloudMessage ?? ''}\n\nFor cloud photos, apply the new MedExam storage migration in Supabase.`);
    } catch (error) {
      Alert.alert('Could not save photo', error instanceof Error ? error.message : 'Choose a different image and try again.');
    } finally { setProfileBusy(false); }
  }

  async function pickAvatarFromLibrary() {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.8 });
      if (result.canceled) return;
      const asset = result.assets[0];
      if (!asset?.uri) throw new Error('No photo was selected.');
      if (asset.fileSize && asset.fileSize > 15 * 1024 * 1024) throw new Error('This image is over 15 MB. Choose a smaller photo.');
      await persistAvatar(asset.uri, asset.mimeType, asset.fileName);
    } catch (error) {
      Alert.alert('Could not open photo library', error instanceof Error ? error.message : 'Please try again.');
    }
  }

  async function pickAvatarFromFiles() {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: 'image/*', copyToCacheDirectory: true, multiple: false });
      if (result.canceled) return;
      const asset = result.assets[0];
      if (!asset) throw new Error('No photo was selected.');
      if (asset.size && asset.size > 15 * 1024 * 1024) throw new Error('This image is over 15 MB. Choose a smaller photo.');
      if (!asset.mimeType?.startsWith('image/') && !/\.(png|jpe?g|webp|heic)$/i.test(asset.name)) throw new Error('Choose an image file such as JPG, PNG or HEIC.');
      await persistAvatar(asset.uri, asset.mimeType, asset.name);
    } catch (error) {
      Alert.alert('Could not open image file', error instanceof Error ? error.message : 'Choose an image from Files and try again.');
    }
  }

  function showAvatarOptions() {
    Alert.alert('Profile picture', 'Choose a photo source.', [
      { text: 'Photo library', onPress: () => { void pickAvatarFromLibrary(); } },
      { text: 'Browse Files', onPress: () => { void pickAvatarFromFiles(); } },
      ...(avatarUri ? [{ text: 'Remove photo', style: 'destructive' as const, onPress: () => {
        Alert.alert('Remove profile picture?', 'Your initials will be shown instead.', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Remove', style: 'destructive', onPress: () => {
            if (!session?.user.id) return;
            setProfileBusy(true);
            void removeProfileAvatar(session.user.id, session.user.user_metadata.medexam_avatar_path).then((result) => {
              setAvatarUri(null);
              if (!result.cloudSynced) Alert.alert('Photo removed from this device', 'MedExam could not remove the cloud copy. Try again after checking your connection.');
            }).catch(() => Alert.alert('Could not remove photo', 'Please try again.')).finally(() => setProfileBusy(false));
          } },
        ]);
      } }] : []),
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  function signOut() {
    const auth = getSupabaseAuthClient();
    if (!auth) return;
    Alert.alert('Sign out of MedExam?', 'Your cloud copy stays in your account. Study data currently saved on this device will remain here.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => {
        setProfileBusy(true);
        void auth.signOut().then(({ error }) => { if (error) throw error; }).catch((error) => {
          Alert.alert('Could not sign out', error instanceof Error ? error.message : 'Please try again.');
        }).finally(() => setProfileBusy(false));
      } },
    ]);
  }

  return <SafeAreaView style={styles.screen}>
    <PullToRefreshScrollView contentContainerStyle={styles.content} onRefresh={async () => { if (session?.user.id) setAvatarUri(await getProfileAvatar(session.user.id, session.user.user_metadata.medexam_avatar_path)); }}>
      <View style={styles.header}>
        <View><Text style={styles.eyebrow}>MEDEXAM</Text><Text style={styles.title}>{tx('Profile')}</Text></View>
        <Pressable accessibilityRole="button" accessibilityLabel="Open Settings" onPress={() => router.push('/settings')} style={styles.settingsButton}>
          <Text style={styles.settingsGear}>⚙︎</Text><Text style={styles.settingsButtonText}>{tx('Settings')}</Text>
        </Pressable>
      </View>
      <Text style={styles.subtitle}>{tx('Your account and study preferences.')}</Text>

      <View style={styles.accountCard}>
        <Pressable accessibilityRole="button" accessibilityLabel="Change profile picture" disabled={profileBusy} onPress={showAvatarOptions} style={styles.avatar}>
          {avatarUri ? <Image source={{ uri: avatarUri }} contentFit="cover" style={styles.avatarImage} /> : <Text style={styles.avatarText}>{(fullName.trim() || session?.user.email || 'M').slice(0, 1).toUpperCase()}</Text>}
          <View pointerEvents="none" style={styles.avatarEdit}><Text style={styles.avatarEditText}>Edit</Text></View>
        </Pressable>
        <View style={styles.accountDetails}>
          <Text style={styles.accountName}>{fullName.trim() || tx('MedExam account')}</Text>
          <Text style={styles.accountEmail}>{session?.user.email ?? tx('Signed in')}</Text>
          {(studyProgram || institution || studyYear) ? <Text style={styles.profileMeta}>{[studyProgram, institution, studyYear].filter(Boolean).join(' · ')}</Text> : null}
          <Pressable accessibilityRole="button" disabled={profileBusy} onPress={openProfileEditor} style={styles.editName}><Text style={styles.linkText}>{tx('Edit profile')}</Text></Pressable>
        </View>
      </View>

      <View style={styles.groupCard}>
        <Text style={styles.groupTitle}>{tx('Study setup')}</Text>
        <Text style={styles.groupDescription}>{tx('Tune your routine, reminders and AI suggestions on their own settings pages.')}</Text>
        {[
          ['Study preferences', 'Days, goals, session length and methods', '/settings/study'],
          ['Notifications', 'Study, exam and review reminders', '/settings/notifications'],
          ['AI preferences', 'Quiz and flashcard defaults', '/settings/ai'],
        ].map(([title, description, path]) => <Pressable key={path} accessibilityRole="button" style={styles.profileSettingRow} onPress={() => router.push(path as never)}><View style={{ flex: 1 }}><Text style={styles.actionTitle}>{tx(title)}</Text><Text style={styles.copy}>{tx(description)}</Text></View><Text style={styles.arrow}>›</Text></Pressable>)}
      </View>
      <View style={styles.profileNote}><Text style={styles.noteTitle}>{tx('Data, privacy and app settings')}</Text><Text style={styles.copy}>{tx('Manage backup, sync, appearance, language, privacy and support.')}</Text><Pressable accessibilityRole="button" onPress={() => router.push('/settings')} style={styles.linkButton}><Text style={styles.linkText}>{tx('Open Settings')}</Text><Text style={styles.arrow}>›</Text></Pressable></View>

      <Pressable accessibilityRole="button" style={[styles.signOut, profileBusy && styles.disabled]} disabled={profileBusy || !session} onPress={signOut}><View pointerEvents="none" style={styles.signOutGloss} /><Text style={styles.signOutText}>{profileBusy ? tx('Please wait…') : tx('Sign out')}</Text></Pressable>
      {profileBusy && <ActivityIndicator color={appColor('#327E9D', 'text')} style={{ marginTop: 12 }} />}
    </PullToRefreshScrollView>

    <Modal visible={profileVisible} transparent animationType="fade" onRequestClose={() => setProfileVisible(false)}>
      <KeyboardAvoidingView style={styles.modalKeyboard} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}>
        <View style={styles.profileScrim}>
          <ScrollView style={styles.profileModalScroll} contentContainerStyle={styles.profileModalContainer} keyboardShouldPersistTaps="handled" keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'} automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}>
            <View style={[styles.modal, styles.profileModal]}>
              <Text style={styles.modalTitle}>{tx('Edit profile')}</Text>
              <Text style={styles.copy}>{tx('Update your account details and how your study profile appears.')}</Text>
              <View style={styles.photoEditor}>
                <Pressable accessibilityRole="button" accessibilityLabel="Choose profile picture" disabled={profileBusy} onPress={showAvatarOptions} style={[styles.avatar, styles.photoEditorAvatar]}>
                  {avatarUri ? <Image source={{ uri: avatarUri }} contentFit="cover" style={styles.avatarImage} /> : <Text style={styles.avatarText}>{(fullName.trim() || 'M').slice(0, 1).toUpperCase()}</Text>}
                </Pressable>
                <View style={{ flex: 1 }}><Text style={styles.actionTitle}>{tx('Profile picture')}</Text><Text style={styles.copy}>{tx('Choose from your photo library or Files. MedExam syncs it privately to your account.')}</Text><Pressable accessibilityRole="button" disabled={profileBusy} onPress={showAvatarOptions} style={styles.photoButton}><Text style={styles.linkText}>{profileBusy ? tx('Please wait…') : tx('Change photo')}</Text></Pressable></View>
              </View>
              <View style={styles.passwordField}><Text style={styles.accountLabel}>{tx('Name')}</Text><TextInput value={fullName} onChangeText={setFullName} style={styles.passwordInput} placeholder={tx('Your name')} autoCapitalize="words" autoComplete="name" textContentType="name" returnKeyType="next" /></View>
              <View style={styles.passwordField}><Text style={styles.accountLabel}>{tx('Study program')}</Text><TextInput value={studyProgram} onChangeText={setStudyProgram} style={styles.passwordInput} placeholder={tx('e.g. Medicine')} autoCapitalize="words" returnKeyType="next" /></View>
              <View style={styles.passwordField}><Text style={styles.accountLabel}>{tx('University or institution')}</Text><TextInput value={institution} onChangeText={setInstitution} style={styles.passwordInput} placeholder={tx('School or university')} autoCapitalize="words" returnKeyType="next" /></View>
              <View style={styles.passwordField}><Text style={styles.accountLabel}>{tx('Study year')}</Text><TextInput value={studyYear} onChangeText={setStudyYear} style={styles.passwordInput} placeholder={tx('e.g. Year 2')} autoCapitalize="sentences" returnKeyType="done" /></View>
              <View style={styles.buttons}><Pressable onPress={() => setProfileVisible(false)} style={styles.cancel}><Text style={styles.cancelText}>{tx('Cancel')}</Text></Pressable><Pressable disabled={profileBusy} onPress={() => { void saveProfileDetails(); }} style={[styles.restore, profileBusy && styles.disabled]}><Text style={styles.restoreText}>{profileBusy ? tx('Please wait…') : tx('Save profile')}</Text></Pressable></View>
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: appColor('#F5FAFC', 'background') }, content: { padding: 20, paddingBottom: 28 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
  eyebrow: { color: appColor('#448EA8', 'text'), fontSize: 11, fontWeight: '800', letterSpacing: 1.5 },
  title: { color: appColor('#17324D', 'text'), fontSize: 32, fontWeight: '800', marginTop: 4 },
  subtitle: { color: appColor('#718493', 'text'), fontSize: 14, lineHeight: 20, marginTop: 5, marginBottom: 18 },
  settingsButton: { minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 13, borderRadius: 14, borderWidth: 1, borderColor: appColor('#D9E8EE', 'border'), backgroundColor: appColor('#FFFFFF', 'background') },
  settingsGear: { color: appColor('#327E9D', 'text'), fontSize: 16 }, settingsButtonText: { color: appColor('#315267', 'text'), fontSize: 13, fontWeight: '700' },
  accountCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: appColor('#FFFFFF', 'background'), borderRadius: 18, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: appColor('#E7F0F4', 'border') },
  avatar: { width: 66, height: 66, borderRadius: 33, overflow: 'hidden', backgroundColor: appColor('#DDF1F5', 'background'), alignItems: 'center', justifyContent: 'center', marginRight: 14 },
  avatarImage: { width: '100%', height: '100%' }, avatarText: { color: appColor('#0F7181', 'text'), fontSize: 24, fontWeight: '800' },
  avatarEdit: { position: 'absolute', bottom: 0, left: 0, right: 0, alignItems: 'center', backgroundColor: appColor('#17324D99', 'background'), paddingVertical: 3 }, avatarEditText: { color: appColor('#FFFFFF', 'text'), fontSize: 9, fontWeight: '800' },
  accountDetails: { flex: 1 }, accountName: { color: appColor('#17324D', 'text'), fontSize: 16, fontWeight: '800' }, accountEmail: { color: appColor('#718493', 'text'), fontSize: 12, marginTop: 4 }, profileMeta: { color: appColor('#577082', 'text'), fontSize: 12, lineHeight: 17, marginTop: 3 },
  editName: { alignSelf: 'flex-start', paddingTop: 7 }, linkText: { color: appColor('#327E9D', 'text'), fontWeight: '700', fontSize: 13 },
  groupCard: { backgroundColor: appColor('#FFFFFF', 'background'), borderRadius: 18, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: appColor('#E7F0F4', 'border') }, groupTitle: { color: appColor('#17324D', 'text'), fontSize: 16, fontWeight: '800' },
  groupDescription: { color: appColor('#718493', 'text'), fontSize: 12, lineHeight: 18, marginTop: 5, marginBottom: 11 }, profileSettingRow: { minHeight: 56, flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#EDF3F6' },
  actionTitle: { color: appColor('#17324D', 'text'), fontSize: 14, fontWeight: '700' }, copy: { color: appColor('#718493', 'text'), fontSize: 12, lineHeight: 18, marginTop: 4 }, accountLabel: { color: appColor('#315267', 'text'), fontSize: 12, fontWeight: '700', marginBottom: 5 },
  profileNote: { backgroundColor: appColor('#E7F4F8', 'background'), borderRadius: 16, padding: 15, marginBottom: 16 }, noteTitle: { color: appColor('#17324D', 'text'), fontSize: 13, fontWeight: '800' }, linkButton: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', marginTop: 9 }, arrow: { color: appColor('#327E9D', 'text'), fontSize: 19, marginLeft: 5 },
  disabled: { opacity: 0.55 }, signOut: { minHeight: 46, paddingHorizontal: 16, borderRadius: 14, backgroundColor: appColor('#D93E4E', 'background'), borderColor: appColor('#B92537', 'border'), borderWidth: 1, borderBottomWidth: 3, shadowColor: '#A91E30', shadowOpacity: 0.2, shadowRadius: 6, shadowOffset: { width: 0, height: 3 }, elevation: 3, overflow: 'hidden', position: 'relative', alignItems: 'center', justifyContent: 'center' }, signOutGloss: { position: 'absolute', left: 0, right: 0, top: 0, height: 14, backgroundColor: appColor('#FFFFFF24', 'background'), borderBottomWidth: 1, borderBottomColor: '#FFFFFF30' }, signOutText: { color: appColor('#FFFFFF', 'text'), fontSize: 14, fontWeight: '800' },
  modalKeyboard: { flex: 1 }, profileScrim: { flex: 1, justifyContent: 'center', paddingHorizontal: 18, paddingVertical: 24, backgroundColor: appColor('#10283B88', 'background') }, profileModalScroll: { flexGrow: 0, maxHeight: '88%' }, profileModalContainer: { flexGrow: 1, justifyContent: 'center' }, modal: { backgroundColor: appColor('#F7FBFE', 'background'), borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 22, paddingBottom: 30 }, profileModal: { borderRadius: 24, padding: 19, paddingBottom: 22 }, modalTitle: { color: appColor('#17324D', 'text'), fontSize: 21, fontWeight: '800', marginBottom: 3 },
  photoEditor: { flexDirection: 'row', alignItems: 'center', marginTop: 15, padding: 11, borderRadius: 15, backgroundColor: appColor('#FFFFFF', 'background') }, photoEditorAvatar: { width: 58, height: 58, marginRight: 12 }, photoButton: { alignSelf: 'flex-start', paddingTop: 7 }, passwordField: { marginTop: 12 }, passwordInput: { minHeight: 44, paddingHorizontal: 12, borderRadius: 11, backgroundColor: appColor('#FFFFFF', 'background'), borderWidth: 1, borderColor: appColor('#D8E6EC', 'border'), color: appColor('#17324D', 'text') },
  buttons: { flexDirection: 'row', gap: 10, marginTop: 15 }, cancel: { flex: 1, minHeight: 44, padding: 12, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: appColor('#E6EEF2', 'background') }, cancelText: { color: appColor('#315267', 'text'), fontWeight: '700' }, restore: { flex: 1, minHeight: 44, padding: 12, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: appColor('#327E9D', 'background') }, restoreText: { color: appColor('#FFFFFF', 'text'), fontWeight: '700' },
});
