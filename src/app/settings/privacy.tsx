import { forgetLastAccount } from '@/services/last-account';
import { LocalizedText as Text } from '@/components/localized-text';
import { appColor } from '@/constants/adaptive-color';
import { useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { SettingsCard, SettingsNote, SettingsPage, SettingsRow } from '@/components/settings-shared';
import { useAppSettings } from '../../services/app-settings-context';
import { tr } from '../../services/localization';
import { deleteAllStudyContent } from '../../services/storage';
import { forgetAccountOnDevice, getSupabaseAuthClient } from '../../services/cloud-sync';
import { getSupabaseClient } from '../../services/supabase';
import { removeProfileAvatar } from '../../services/profile-avatar';

export default function PrivacySettings() {
  const { preferences } = useAppSettings();
  const [busy, setBusy] = useState(false);
  const [deleteAccountOpen, setDeleteAccountOpen] = useState(false);
  const [confirmation, setConfirmation] = useState('');

  function clearStudyData() {
    Alert.alert(tr('Delete study data?', preferences.language), tr('A recovery copy will be saved on this device first. This clears subjects, exams, topics, cards, quiz results and study history. The empty state will sync to the cloud when you are signed in.', preferences.language), [
      { text: 'Cancel', style: 'cancel' },
      { text: tr('Delete study data', preferences.language), style: 'destructive', onPress: () => {
        setBusy(true);
        void deleteAllStudyContent().then(() => Alert.alert(tr('Study data deleted', preferences.language), tr('Your recovery copy is available in Data & account → Recovery options.', preferences.language))).catch((error) => Alert.alert(tr('Could not delete study data', preferences.language), error instanceof Error ? error.message : 'Try again.')).finally(() => setBusy(false));
      } },
    ]);
  }

  async function deleteAccount() {
    if (confirmation !== 'DELETE') return Alert.alert('Confirmation required', 'Type DELETE exactly to continue.');
    const client = getSupabaseClient();
    const auth = getSupabaseAuthClient();
    if (!client || !auth) return Alert.alert('Sign in required', 'Sign in to the account you want to delete.');
    setBusy(true);
    try {
      const { data: { session }, error: sessionError } = await auth.getSession();
      if (sessionError) throw sessionError;
      if (!session?.user.id) throw new Error('Your session expired. Sign in again and retry.');
      const avatarResult = await removeProfileAvatar(session.user.id, session.user.user_metadata.medexam_avatar_path);
      if (!avatarResult.cloudSynced) throw new Error('The profile photo could not be removed from cloud storage. Check your connection and retry.');
      const { error } = await client.rpc('delete_my_medexam_account');
      if (error) throw error;
      await auth.signOut();
      await forgetLastAccount();
      await forgetAccountOnDevice(session.user.id);
      setDeleteAccountOpen(false);
      Alert.alert(tr('Account deleted', preferences.language), tr('The account, its cloud copy and the study data on this device were removed.', preferences.language));
      router.replace('/welcome');
    } catch (error) {
      console.warn('Could not delete the account:', error);
      Alert.alert(tr('Could not delete account', preferences.language), tr('Your account was not deleted. Check your connection and try again.', preferences.language));
    } finally { setBusy(false); }
  }

  return <>
    <SettingsPage title="Privacy & data" description="Understand what is stored and decide what to keep or remove.">
      <SettingsCard title="AI and privacy"><Text style={styles.copy}>{tr('AI study materials use the subject, topic and any notes you add only when you ask for questions or flashcards. A PDF you choose to import is sent to AI to be turned into notes. When you tap Review my progress, Medora sends calculated summaries of subject and topic activity, quiz and practice results, flashcard reviews, study-day trends, upcoming exam details, saved plans and study preferences so AI can suggest a next step. It does not send your study notes or account email for this progress review. Automatic study-plan recommendations have a separate setting. Do not include patient-identifiable or other sensitive information; check generated medical content against trusted course sources.', preferences.language)}</Text></SettingsCard>
      <SettingsCard title="Read more">
        <SettingsRow icon="shieldLock" title="Privacy" description="What we store, how we use it and your rights" onPress={() => router.push({ pathname: '/legal', params: { page: 'privacy' } })} />
        <SettingsRow icon="heartPulse" title="Health disclaimer" description="Medora is a study tool, not medical advice" onPress={() => router.push({ pathname: '/legal', params: { page: 'health' } })} />
        <SettingsRow icon="note" title="Terms of use" onPress={() => router.push({ pathname: '/legal', params: { page: 'terms' } })} />
      </SettingsCard>
      <SettingsCard title="Your data">
        <SettingsRow title="Open Data & account" description="Export, restore, cloud sync, and account details" onPress={() => router.push('/settings/data')} />
        <SettingsRow title="Delete study data" description="Keep your account, remove study content from this device and synced copy" onPress={clearStudyData} destructive />
        <SettingsRow title="Delete account" description="Permanently remove your Medora sign-in and cloud account" onPress={() => { setConfirmation(''); setDeleteAccountOpen(true); }} destructive />
      </SettingsCard>
      <SettingsNote>Your profile picture is private to your account. Backup and sync status is available under Data & account.</SettingsNote>
      {busy ? <ActivityIndicator color={appColor('#327E9D', 'text')} /> : null}
    </SettingsPage>
    <Modal visible={deleteAccountOpen} transparent animationType="fade" onRequestClose={() => setDeleteAccountOpen(false)}>
      <KeyboardAvoidingView style={styles.scrim} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}><View style={styles.modal}><Text style={styles.modalTitle}>{tr('Delete account permanently?', preferences.language)}</Text><Text style={styles.copy}>{tr('This removes your sign-in, your cloud study copy and the study data on this device. You will be signed out. This cannot be undone.', preferences.language)}</Text><Text style={styles.label}>Type DELETE to confirm</Text><TextInput autoCapitalize="characters" value={confirmation} onChangeText={setConfirmation} style={styles.input} editable={!busy} />
        <View style={styles.buttons}><Pressable disabled={busy} onPress={() => setDeleteAccountOpen(false)} style={styles.cancel}><Text style={styles.cancelText}>Cancel</Text></Pressable><Pressable disabled={busy || confirmation !== 'DELETE'} onPress={() => void deleteAccount()} style={[styles.delete, (busy || confirmation !== 'DELETE') && { opacity: 0.5 }]}><Text style={styles.deleteText}>{busy ? 'Deleting…' : tr('Delete account', preferences.language)}</Text></Pressable></View>
      </View></KeyboardAvoidingView>
    </Modal>
  </>;
}

const styles = StyleSheet.create({ copy: { color: appColor('#718493', 'text'), fontSize: 12, lineHeight: 19 }, scrim: { flex: 1, justifyContent: 'center', padding: 20, backgroundColor: appColor('#10283B88', 'background') }, modal: { backgroundColor: appColor('#F7FBFE', 'background'), borderRadius: 20, padding: 20 }, modalTitle: { color: appColor('#17324D', 'text'), fontSize: 18, fontWeight: '800', marginBottom: 8 }, label: { color: appColor('#315267', 'text'), fontSize: 12, fontWeight: '700', marginTop: 14, marginBottom: 6 }, input: { minHeight: 45, borderWidth: 1, borderColor: appColor('#D8E6EC', 'border'), borderRadius: 11, paddingHorizontal: 12, color: appColor('#17324D', 'text'), backgroundColor: appColor('#FFFFFF', 'background') }, buttons: { flexDirection: 'row', gap: 9, marginTop: 16 }, cancel: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 43, borderRadius: 11, backgroundColor: appColor('#E6EEF2', 'background') }, cancelText: { color: appColor('#315267', 'text'), fontWeight: '700' }, delete: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 43, borderRadius: 11, backgroundColor: appColor('#D93E4E', 'background') }, deleteText: { color: appColor('#FFFFFF', 'text'), fontWeight: '800' } });
