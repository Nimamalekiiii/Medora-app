import { BackLink } from '@/components/back-link';
import { cardShadow } from '@/components/gloss';
import { LocalizedText as Text } from '@/components/localized-text';
import { StudyIcon } from '@/components/study-icon';
import { appColor } from '@/constants/adaptive-color';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { Alert, ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Share, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { createStudyDataBackup, inspectStudyDataBackup, restorePreviousStudyDataBackup, restoreStudyDataBackup, type StudyDataBackupSummary } from '../../services/storage';
import PullToRefreshScrollView from '../../components/pull-to-refresh-scroll-view';
import { useAuth } from '../../services/auth-context';
import { useAppSettings } from '../../services/app-settings-context';
import { tr } from '../../services/localization';
import {
  getCloudSyncSummary,
  getCurrentSession,
  getSupabaseAuthClient,
  disconnectCloudAccount,
  restorePreviousCloudBackup,
  subscribeToCloudSyncStatus,
  syncStudyData,
} from '../../services/cloud-sync';
import { isSupabaseConfigured } from '../../services/supabase';

type CloudSummary = {
  signedIn: boolean;
  email: string | null;
  dirty: boolean;
  syncedAt: string | null;
  accountMismatch?: boolean;
  hasCloudRecovery?: boolean;
  needsInitialChoice?: boolean;
};

export default function SettingsScreen() {
  const router = useRouter();
  const { preferences } = useAppSettings();
  const tx = (text: string) => tr(text, preferences.language);
  const { session } = useAuth();
  const [restoreVisible, setRestoreVisible] = useState(false);
  const [backupText, setBackupText] = useState('');
  const [backupSummary, setBackupSummary] = useState<StudyDataBackupSummary | null>(null);
  const [backupFileName, setBackupFileName] = useState('');
  const [manualRestoreVisible, setManualRestoreVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [emailVisible, setEmailVisible] = useState(false);
  const [emailDraft, setEmailDraft] = useState(String(session?.user.email ?? ''));
  const [accountSummary, setAccountSummary] = useState<CloudSummary>({ signedIn: false, email: null, dirty: false, syncedAt: null });
  const [backupOptionsExpanded, setBackupOptionsExpanded] = useState(false);
  const [cloudOptionsExpanded, setCloudOptionsExpanded] = useState(false);
  const [changePasswordVisible, setChangePasswordVisible] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [showPasswords, setShowPasswords] = useState(false);
  const cloudConfigured = isSupabaseConfigured();

  const refreshCloudState = useCallback(async () => {
    const summary = await getCloudSyncSummary();
    const currentSession = getCurrentSession();
    setAccountSummary({ ...summary, signedIn: Boolean(currentSession), email: currentSession?.user.email ?? null });
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeToCloudSyncStatus(() => { void refreshCloudState(); });
    void refreshCloudState();
    return unsubscribe;
  }, [refreshCloudState]);

  async function exportBackup() {
    setBusy(true);
    try {
      const backup = await createStudyDataBackup();
      if (Platform.OS === 'web') {
        await Share.share({ title: 'Medora study backup', message: JSON.stringify(backup) });
        return;
      }
      if (!await Sharing.isAvailableAsync()) throw new Error('File sharing is unavailable on this device.');
      const filename = `Medora-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
      const file = new File(Paths.cache, filename);
      file.create({ intermediates: true, overwrite: true });
      file.write(JSON.stringify(backup, null, 2));
      await Sharing.shareAsync(file.uri, { mimeType: 'application/json', dialogTitle: 'Save or share your Medora backup', UTI: 'public.json' });
    } catch {
      Alert.alert(tx('Backup failed'), tx('Medora could not prepare the backup. Your saved study data was not changed.'));
    } finally { setBusy(false); }
  }

  async function pickBackupFile() {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/json', 'text/plain'],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      if (!asset) throw new Error('No backup file was selected.');
      if (asset.size && asset.size > 15 * 1024 * 1024) throw new Error('This backup is over 15 MB. Choose a smaller Medora backup.');
      const contents = await new File(asset.uri).text();
      const summary = inspectStudyDataBackup(contents);
      setBackupText(contents);
      setBackupSummary(summary);
      setBackupFileName(asset.name);
      setManualRestoreVisible(false);
      setRestoreVisible(true);
    } catch (error) {
      Alert.alert(tx('Could not open this backup'), error instanceof Error ? tx(error.message) : tx('Choose a valid Medora JSON backup file.'));
    }
  }

  function handleBackupTextChange(value: string) {
    setBackupText(value);
    setBackupFileName('');
    try { setBackupSummary(inspectStudyDataBackup(value)); }
    catch { setBackupSummary(null); }
  }

  function closeRestoreModal() {
    setRestoreVisible(false);
    setManualRestoreVisible(false);
    setBackupText('');
    setBackupSummary(null);
    setBackupFileName('');
  }

  async function restoreBackup() {
    setBusy(true);
    try {
      await restoreStudyDataBackup(backupText);
      closeRestoreModal();
      await refreshCloudState();
      Alert.alert(tx('Backup restored'), tx('Your study data has been restored. Medora saved what was on this device first, so you can undo this restore from Settings → Recovery options.'));
    } catch (error) {
      Alert.alert(tx('Could not restore backup'), error instanceof Error ? tx(error.message) : tx('Check that this is a Medora backup.'));
    } finally { setBusy(false); }
  }

  function confirmRestoreBackup() {
    if (!backupSummary) return;
    const details = `${backupSummary.subjectCount} subjects · ${backupSummary.topicCount} topics · ${backupSummary.flashcardCount} flashcards · ${backupSummary.studySessionCount} study sessions · ${backupSummary.quizResultCount} quiz results`;
    Alert.alert(tx('Restore this backup?'), `${details}\n\nThis replaces the study data on this device. Medora first saves a recovery copy of what is here now, which you can restore from Settings → Recovery options.`, [
      { text: tx('Cancel'), style: 'cancel' },
      { text: tx('Restore backup'), style: 'destructive', onPress: () => { void restoreBackup(); } },
    ]);
  }

  async function undoLastChange() {
    setBusy(true);
    try {
      const restored = await restorePreviousStudyDataBackup();
      Alert.alert(restored ? tx('Previous data restored') : tx('No recovery copy'), restored ? tx('The data saved before the last restore or deletion is back.') : tx('There is no recovery copy on this device yet.'));
    } catch {
      Alert.alert(tx('Could not restore'), tx('The recovery copy could not be read.'));
    } finally { setBusy(false); }
  }

  async function saveAccountEmail() {
    const auth = getSupabaseAuthClient();
    const nextEmail = emailDraft.trim().toLowerCase();
    if (!auth) return Alert.alert(tx('Sign in required'), tx('Please sign in again and retry.'));
    if (!/^\S+@\S+\.\S+$/.test(nextEmail)) return Alert.alert(tx('Check the email'), tx('Enter a valid email address.'));
    if (nextEmail === session?.user.email?.toLowerCase()) return setEmailVisible(false);
    setBusy(true);
    try {
      const { error } = await auth.updateUser({ email: nextEmail });
      if (error) throw error;
      setEmailVisible(false);
      Alert.alert(tx('Confirm your new email'), tx('You may get a confirmation link before this becomes the sign-in email. Your current address stays active until the change is confirmed.'));
    } catch (error) {
      Alert.alert(tx('Could not update email'), error instanceof Error ? tx(error.message) : tx('Check your connection and try again.'));
    } finally { setBusy(false); }
  }

  async function changeAccountPassword() {
    const auth = getSupabaseAuthClient();
    const email = session?.user.email;
    if (!auth || !email) return Alert.alert(tx('Sign in required'), tx('Please sign in again and retry.'));
    if (!currentPassword) return Alert.alert(tx('Enter your current password'), tx('We need it to confirm this account belongs to you.'));
    if (newPassword.length < 8) return Alert.alert(tx('Password is too short'), tx('Use at least 8 characters.'));
    if (newPassword !== confirmNewPassword) return Alert.alert(tx('Passwords do not match'), tx('Enter the new password the same way in both fields.'));

    setBusy(true);
    try {
      const { error: signInError } = await auth.signInWithPassword({ email, password: currentPassword });
      if (signInError) throw new Error('The current password is incorrect.');
      const { error } = await auth.updateUser({ password: newPassword });
      if (error) throw error;
      setChangePasswordVisible(false);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
      Alert.alert(tx('Password changed'), tx('Your Medora sign-in password has been updated.'));
    } catch (error) {
      Alert.alert(tx('Could not change password'), error instanceof Error ? tx(error.message) : tx('Check your connection and try again.'));
    } finally { setBusy(false); }
  }

  function switchCloudAccount() {
    Alert.alert(tx('Switch account?'), tx('This device will disconnect from the current account, but its cloud copy will remain there. Local study data stays on this device. When you sign in to another account, Medora will ask which copy to keep before syncing.'), [
      { text: tx('Cancel'), style: 'cancel' },
      { text: tx('Disconnect and sign out'), style: 'destructive', onPress: () => {
        setBusy(true);
        void disconnectCloudAccount().then(refreshCloudState).catch((error) => {
          Alert.alert(tx('Could not switch account'), error instanceof Error ? tx(error.message) : tx('Please try again.'));
        }).finally(() => setBusy(false));
      } },
    ]);
  }

  async function syncCloud(mode: 'auto' | 'push' | 'pull' = 'auto') {
    setBusy(true);
    try {
      const result = await syncStudyData(mode);
      if (result === 'local-only') {
        Alert.alert(tx('Study data found on this device'), tx('This account has no cloud copy yet. Do you want to upload the study data already on this device to this account?'), [
          { text: tx('Cancel'), style: 'cancel' },
          { text: tx('Upload this device'), onPress: () => { void syncCloud('push'); } },
        ]);
      } else if (result === 'conflict') {
        Alert.alert(tx('Choose which copy to keep'), tx('There is study data on both this device and in your account, or another device has changed the cloud copy. Nothing was overwritten.'), [
          { text: tx('Cancel'), style: 'cancel' },
          { text: tx('Restore cloud copy'), onPress: () => { void syncCloud('pull'); } },
          { text: tx('Replace cloud copy'), style: 'destructive', onPress: () => { void syncCloud('push'); } },
        ]);
      } else if (result === 'no-cloud-backup') {
        Alert.alert(tx('No cloud copy yet'), tx('Sync this device first to create the cloud backup.'));
      } else if (result === 'not-configured') {
        Alert.alert(tx('Cloud backup is not configured'), tx('Cloud backup is not available in this version of the app.'));
      } else if (result === 'downloaded') {
        Alert.alert(tx('Cloud copy restored'), tx('The cloud study data is now on this device. A recovery copy of the previous local data was saved.'));
      } else if (result === 'synced') {
        Alert.alert(tx('Cloud backup updated'), tx('Your study data has been saved to your account.'));
      } else if (result === 'up-to-date') {
        Alert.alert(tx('Everything is up to date'), tx('Your local and cloud study data match.'));
      }
      await refreshCloudState();
    } catch (error) {
      Alert.alert(tx('Cloud sync failed'), error instanceof Error ? tx(error.message) : tx('Your local data is still saved on this device. Try again when you are online.'));
    } finally { setBusy(false); }
  }

  async function undoCloudReplacement() {
    setBusy(true);
    try {
      const result = await restorePreviousCloudBackup();
      Alert.alert(result === 'synced' ? tx('Previous cloud copy restored') : tx('No previous cloud copy'), result === 'synced' ? tx('The version from before the last replacement is back in your account. The version it replaced can now be restored from Settings too.') : tx('There is no saved cloud recovery copy for this account.'));
      await refreshCloudState();
    } catch (error) {
      Alert.alert(tx('Could not restore cloud copy'), error instanceof Error ? tx(error.message) : tx('Please try again.'));
    } finally { setBusy(false); }
  }

  return <SafeAreaView style={styles.screen}>
    <PullToRefreshScrollView contentContainerStyle={styles.content} onRefresh={refreshCloudState}>
      <View style={styles.settingsHeader}>
        <BackLink label="Back" />
        <Text style={styles.title}>Data & account</Text>
        <Text style={styles.subtitle}>Backups, cloud sync and account access.</Text>
      </View>
      <View style={styles.groupCard}>
        <Text style={styles.groupTitle}>Study data & backups</Text>
        <Text style={styles.groupDescription}>Subjects, topics, flashcards, notes and study activity are saved on this device as you work. These tools make a portable copy or recover an earlier one.</Text>
        <View style={styles.backupInfo}><Text style={styles.backupInfoTitle}>What is included?</Text><Text style={styles.copy}>Study content and progress such as subjects, topics, flashcards, quizzes and study sessions. Sign-in details and passwords are never included.</Text></View>
        <Pressable accessibilityRole="button" style={styles.action} disabled={busy} onPress={exportBackup}><View style={styles.iconSlot}><StudyIcon name="upload" size={20} /></View><View style={{ flex: 1 }}><Text style={styles.actionTitle}>Export backup</Text><Text style={styles.copy}>Create a separate copy to keep in Files or share securely</Text></View><StudyIcon name="chevron" size={13} color={appColor('#9AADB8', 'text')} /></Pressable>
        <Pressable accessibilityRole="button" style={styles.action} disabled={busy} onPress={() => { void pickBackupFile(); }}><View style={styles.iconSlot}><StudyIcon name="download" size={20} /></View><View style={{ flex: 1 }}><Text style={styles.actionTitle}>Restore a backup</Text><Text style={styles.copy}>Choose a backup file, check what is inside, then confirm</Text></View><StudyIcon name="chevron" size={13} color={appColor('#9AADB8', 'text')} /></Pressable>
        <Pressable accessibilityRole="button" style={[styles.disclosure, backupOptionsExpanded && styles.disclosureOpen]} onPress={() => setBackupOptionsExpanded((value) => !value)}>
          <Text style={styles.disclosureText}>Recovery options</Text><Text style={styles.disclosureChevron}>{backupOptionsExpanded ? '−' : '+'}</Text>
        </Pressable>
        {backupOptionsExpanded && <Pressable accessibilityRole="button" style={styles.action} disabled={busy} onPress={undoLastChange}><View style={styles.iconSlot}><StudyIcon name="undo" size={20} /></View><View style={{ flex: 1 }}><Text style={styles.actionTitle}>Undo last restore or deletion</Text><Text style={styles.copy}>Bring back the recovery copy saved beforehand</Text></View><StudyIcon name="chevron" size={13} color={appColor('#9AADB8', 'text')} /></Pressable>}
      </View>

      <View style={styles.groupCard}>
        <Text style={styles.groupTitle}>Cloud sync</Text>
        <Text style={styles.groupDescription}>A private online copy linked to the signed-in account. Use Sync now to save pending changes or bring the same study data to another device. Local study data stays available on this device too.</Text>
        {!cloudConfigured ? <View style={styles.info}><View style={styles.iconSlot}><StudyIcon name="cloud" size={22} /></View><View style={{ flex: 1 }}><Text style={styles.infoTitle}>Cloud backup is not available</Text><Text style={styles.copy}>This version of the app keeps your study data on this device only.</Text></View></View> : accountSummary.signedIn ? <>
          <View style={styles.info}><View style={styles.iconSlot}><StudyIcon name="cloud" size={22} /></View><View style={{ flex: 1 }}><Text style={styles.infoTitle}>{accountSummary.email || session?.user.email || 'Signed in'}</Text><Text style={styles.copy}>{accountSummary.accountMismatch ? 'This device is linked to another account. Sync is paused to protect both accounts’ study data.' : accountSummary.needsInitialChoice ? 'Choose which copy to keep before syncing; nothing has been overwritten.' : accountSummary.dirty ? 'New changes are waiting to sync.' : accountSummary.syncedAt ? `Last synced ${new Date(accountSummary.syncedAt).toLocaleString()}.` : 'Your first sync will create or restore a cloud copy.'}</Text></View></View>
          <Pressable accessibilityRole="button" style={styles.action} disabled={busy || accountSummary.accountMismatch} onPress={() => { void syncCloud('auto'); }}><View style={styles.iconSlot}><StudyIcon name="review" size={20} /></View><View style={{ flex: 1 }}><Text style={styles.actionTitle}>{accountSummary.needsInitialChoice ? 'Review sync choices' : accountSummary.dirty ? 'Sync pending changes' : 'Sync now'}</Text><Text style={styles.copy}>Save safely or resolve a conflict</Text></View><StudyIcon name="chevron" size={13} color={appColor('#9AADB8', 'text')} /></Pressable>
          <Pressable accessibilityRole="button" style={[styles.disclosure, cloudOptionsExpanded && styles.disclosureOpen]} onPress={() => setCloudOptionsExpanded((value) => !value)}>
            <Text style={styles.disclosureText}>More sync options</Text><Text style={styles.disclosureChevron}>{cloudOptionsExpanded ? '−' : '+'}</Text>
          </Pressable>
          {cloudOptionsExpanded && <>
            <Pressable accessibilityRole="button" style={styles.action} disabled={busy || accountSummary.accountMismatch} onPress={() => Alert.alert(tx('Restore cloud copy?'), tx('The cloud copy will replace the study data on this device. A recovery copy will be saved first.'), [{ text: tx('Cancel'), style: 'cancel' }, { text: tx('Restore cloud'), style: 'destructive', onPress: () => { void syncCloud('pull'); } }])}><View style={styles.iconSlot}><StudyIcon name="download" size={20} /></View><View style={{ flex: 1 }}><Text style={styles.actionTitle}>Restore cloud copy</Text><Text style={styles.copy}>Replace local data after creating a recovery copy</Text></View><StudyIcon name="chevron" size={13} color={appColor('#9AADB8', 'text')} /></Pressable>
            <Pressable accessibilityRole="button" style={styles.action} disabled={busy || accountSummary.accountMismatch} onPress={() => Alert.alert(tx('Replace cloud copy?'), tx('This replaces the existing cloud backup with the data on this device. Continue only if this is the copy you want to keep.'), [{ text: tx('Cancel'), style: 'cancel' }, { text: tx('Replace cloud'), style: 'destructive', onPress: () => { void syncCloud('push'); } }])}><View style={styles.iconSlot}><StudyIcon name="upload" size={20} /></View><View style={{ flex: 1 }}><Text style={styles.actionTitle}>Replace cloud with this device</Text><Text style={styles.copy}>Use this device as the copy to keep</Text></View><StudyIcon name="chevron" size={13} color={appColor('#9AADB8', 'text')} /></Pressable>
            {accountSummary.hasCloudRecovery && !accountSummary.accountMismatch && <Pressable accessibilityRole="button" style={styles.action} disabled={busy} onPress={() => Alert.alert(tx('Restore the previous cloud copy?'), tx('The current cloud version will be saved as the recovery copy.'), [{ text: tx('Cancel'), style: 'cancel' }, { text: tx('Restore previous'), style: 'destructive', onPress: () => { void undoCloudReplacement(); } }])}><View style={styles.iconSlot}><StudyIcon name="undo" size={20} /></View><View style={{ flex: 1 }}><Text style={styles.actionTitle}>Undo last cloud replacement</Text><Text style={styles.copy}>Restore the cloud version saved before replacing it</Text></View><StudyIcon name="chevron" size={13} color={appColor('#9AADB8', 'text')} /></Pressable>}
            <Pressable accessibilityRole="button" style={styles.action} disabled={busy} onPress={switchCloudAccount}><View style={styles.iconSlot}><StudyIcon name="swap" size={20} /></View><View style={{ flex: 1 }}><Text style={styles.actionTitle}>Switch account</Text><Text style={styles.copy}>Link this device to a different cloud account</Text></View><StudyIcon name="chevron" size={13} color={appColor('#9AADB8', 'text')} /></Pressable>
          </>}
        </> : <View style={styles.info}><View style={styles.iconSlot}><StudyIcon name="cloud" size={22} /></View><View style={{ flex: 1 }}><Text style={styles.infoTitle}>No account signed in</Text><Text style={styles.copy}>Sign in from the welcome screen to sync your study data.</Text></View></View>}
      </View>

      <View style={styles.groupCard}>
        <Text style={styles.groupTitle}>Account security</Text>
        <Text style={styles.groupDescription}>Manage access to your Medora account. Changing your email may require confirming the new address.</Text>
        <Pressable accessibilityRole="button" style={styles.action} disabled={busy || !session} onPress={() => { setEmailDraft(String(session?.user.email ?? '')); setEmailVisible(true); }}><View style={styles.iconSlot}><StudyIcon name="mail" size={20} /></View><View style={{ flex: 1 }}><Text style={styles.actionTitle}>Change email address</Text><Text style={styles.copy}>{session?.user.email ?? 'No signed-in email'}</Text></View><StudyIcon name="chevron" size={13} color={appColor('#9AADB8', 'text')} /></Pressable>
        <Pressable accessibilityRole="button" style={styles.action} disabled={busy || !session} onPress={() => setChangePasswordVisible(true)}><View style={styles.iconSlot}><StudyIcon name="key" size={20} /></View><View style={{ flex: 1 }}><Text style={styles.actionTitle}>Change password</Text><Text style={styles.copy}>Update the password used to sign in</Text></View><StudyIcon name="chevron" size={13} color={appColor('#9AADB8', 'text')} /></Pressable>
      </View>
      {busy && <ActivityIndicator color={appColor('#327E9D', 'text')} style={{ marginTop: 16 }} />}
    </PullToRefreshScrollView>
    <Modal visible={restoreVisible} transparent animationType="slide" onRequestClose={closeRestoreModal}>
      <KeyboardAvoidingView style={styles.modalKeyboard} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}>
      <View style={styles.scrim}>
        <ScrollView
          style={styles.restoreModalScroll}
          contentContainerStyle={styles.restoreModalContent}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
        >
        <View style={styles.modal}>
        <Text style={styles.modalTitle}>Restore a backup</Text>
        <Text style={styles.copy}>Select a Medora JSON backup. We will check it and show a preview before replacing anything.</Text>
        {!manualRestoreVisible && <Pressable accessibilityRole="button" onPress={() => { void pickBackupFile(); }} style={[styles.action, { marginTop: 14 }]}><View style={styles.iconSlot}><StudyIcon name="plus" size={20} /></View><View style={{ flex: 1 }}><Text style={styles.actionTitle}>{backupFileName || 'Choose backup file'}</Text><Text style={styles.copy}>Select a .json file from Files</Text></View><StudyIcon name="chevron" size={13} color={appColor('#9AADB8', 'text')} /></Pressable>}
        {backupSummary && <View style={styles.backupPreview}><Text style={styles.backupInfoTitle}>Backup preview</Text>{backupFileName ? <Text style={styles.copy}>File: {backupFileName}</Text> : null}<Text style={styles.copy}>{backupSummary.subjectCount} subjects · {backupSummary.topicCount} topics · {backupSummary.flashcardCount} flashcards</Text><Text style={styles.copy}>{backupSummary.studySessionCount} study sessions · {backupSummary.quizResultCount} quiz results</Text>{backupSummary.exportedAt && !Number.isNaN(Date.parse(backupSummary.exportedAt)) ? <Text style={styles.copy}>Created {new Date(backupSummary.exportedAt).toLocaleString()}</Text> : null}<Text style={styles.copy}>Your current study data is saved as a recovery copy before this restore.</Text></View>}
        {manualRestoreVisible && <TextInput value={backupText} onChangeText={handleBackupTextChange} multiline textAlignVertical="top" autoCapitalize="none" autoCorrect={false} style={styles.input} placeholder="Paste backup JSON here" />}
        <Pressable accessibilityRole="button" onPress={() => { setManualRestoreVisible((value) => !value); setBackupText(''); setBackupSummary(null); setBackupFileName(''); }} style={styles.manualPaste}><Text style={styles.linkText}>{manualRestoreVisible ? 'Choose a file instead' : 'Paste backup JSON instead'}</Text></Pressable>
        <View style={styles.buttons}><Pressable onPress={closeRestoreModal} style={styles.cancel}><Text style={styles.cancelText}>Cancel</Text></Pressable><Pressable disabled={busy || !backupSummary} onPress={confirmRestoreBackup} style={[styles.restore, (!backupSummary || busy) && styles.disabled]}><Text style={styles.restoreText}>{busy ? 'Restoring…' : 'Restore backup'}</Text></Pressable></View>
        </View>
        </ScrollView>
      </View>
      </KeyboardAvoidingView>
    </Modal>
    <Modal visible={emailVisible} transparent animationType="slide" onRequestClose={() => setEmailVisible(false)}>
      <KeyboardAvoidingView style={styles.modalKeyboard} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}>
        <View style={styles.scrim}>
          <ScrollView contentContainerStyle={styles.passwordModalScroll} keyboardShouldPersistTaps="handled" keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'} automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}>
            <View style={styles.modal}>
              <Text style={styles.modalTitle}>Change email address</Text>
              <Text style={styles.copy}>This email is used to sign in and receive account messages. You may be asked to confirm the new address before it takes effect.</Text>
              <View style={styles.passwordField}><Text style={styles.accountLabel}>New email</Text><TextInput value={emailDraft} onChangeText={setEmailDraft} style={styles.passwordInput} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} autoComplete="email" textContentType="emailAddress" returnKeyType="done" /></View>
              <View style={styles.buttons}><Pressable onPress={() => setEmailVisible(false)} style={styles.cancel}><Text style={styles.cancelText}>Cancel</Text></Pressable><Pressable disabled={busy} onPress={() => { void saveAccountEmail(); }} style={[styles.restore, busy && styles.disabled]}><Text style={styles.restoreText}>{busy ? 'Saving…' : 'Update email'}</Text></Pressable></View>
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
    <Modal visible={changePasswordVisible} transparent animationType="slide" onRequestClose={() => setChangePasswordVisible(false)}>
      <KeyboardAvoidingView style={styles.modalKeyboard} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}>
        <View style={styles.scrim}>
          <ScrollView contentContainerStyle={styles.passwordModalScroll} keyboardShouldPersistTaps="handled" keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}>
            <View style={styles.modal}>
              <Text style={styles.modalTitle}>Change password</Text>
              <Text style={styles.copy}>Confirm your current password, then choose a new one with at least 8 characters.</Text>
              {[
                { label: 'Current password', value: currentPassword, set: setCurrentPassword, contentType: 'password' as const },
                { label: 'New password', value: newPassword, set: setNewPassword, contentType: 'newPassword' as const },
                { label: 'Confirm new password', value: confirmNewPassword, set: setConfirmNewPassword, contentType: 'newPassword' as const },
              ].map((field) => <View key={field.label} style={styles.passwordField}>
                <Text style={styles.accountLabel}>{field.label}</Text>
                <TextInput value={field.value} onChangeText={field.set} style={styles.passwordInput} secureTextEntry={!showPasswords} autoCapitalize="none" autoCorrect={false} textContentType={field.contentType} autoComplete={field.label === 'Current password' ? 'current-password' : 'new-password'} returnKeyType="next" />
              </View>)}
              <Pressable accessibilityRole="button" onPress={() => setShowPasswords((value) => !value)} style={styles.showPasswordButton}><Text style={styles.linkText}>{showPasswords ? 'Hide passwords' : 'Show passwords'}</Text></Pressable>
              <View style={styles.buttons}>
                <Pressable onPress={() => setChangePasswordVisible(false)} style={styles.cancel}><Text style={styles.cancelText}>Cancel</Text></Pressable>
                <Pressable disabled={busy} onPress={() => { void changeAccountPassword(); }} style={[styles.restore, busy && styles.disabled]}><Text style={styles.restoreText}>{busy ? 'Saving…' : 'Save password'}</Text></Pressable>
              </View>
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: appColor('#F5FAFC', 'background') }, content: { padding: 20, paddingBottom: 40 },
  settingsHeader: { marginBottom: 4 }, backButton: { alignSelf: 'flex-start', paddingVertical: 8, paddingRight: 12 }, backButtonText: { color: appColor('#327E9D', 'text'), fontSize: 15, fontWeight: '700' },
  groupCard: { backgroundColor: appColor('#FFFFFF', 'background'), borderRadius: 22, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: appColor('#E7F0F4', 'border'), ...cardShadow },
  groupTitle: { color: appColor('#17324D', 'text'), fontSize: 17, fontWeight: '800' },
  groupDescription: { color: appColor('#718493', 'text'), fontSize: 12, lineHeight: 18, marginTop: 5, marginBottom: 12 },
  groupDivider: { height: 1, backgroundColor: appColor('#EDF3F6', 'background'), marginVertical: 14 },
  goalOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 11 },
  goalOption: { flexGrow: 1, flexBasis: '30%', minHeight: 42, borderRadius: 12, backgroundColor: appColor('#F4F8FA', 'background'), alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: appColor('#E4EDF1', 'border') },
  goalOptionSelected: { backgroundColor: appColor('#E1F3F7', 'background'), borderColor: appColor('#7CC1D0', 'border') },
  goalOptionText: { color: appColor('#577082', 'text'), fontSize: 12, fontWeight: '700' },
  goalOptionTextSelected: { color: appColor('#0F7181', 'text') },
  disabled: { opacity: 0.55 },
  disclosure: { minHeight: 42, marginTop: 2, paddingHorizontal: 12, borderRadius: 12, backgroundColor: appColor('#F5F9FA', 'background'), flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  disclosureOpen: { marginBottom: 10 },
  disclosureText: { color: appColor('#315267', 'text'), fontSize: 13, fontWeight: '700' },
  disclosureChevron: { color: appColor('#327E9D', 'text'), fontSize: 20, fontWeight: '600' },
  accountCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: appColor('#FFFFFF', 'background'), borderRadius: 18, padding: 16, marginBottom: 18, borderWidth: 1, borderColor: appColor('#E7F0F4', 'border') }, avatar: { width: 50, height: 50, borderRadius: 25, backgroundColor: appColor('#DDF1F5', 'background'), alignItems: 'center', justifyContent: 'center', marginRight: 13 }, avatarText: { color: appColor('#0F7181', 'text'), fontSize: 20, fontWeight: '800' }, accountDetails: { flex: 1 }, accountName: { color: appColor('#17324D', 'text'), fontSize: 16, fontWeight: '800' }, accountEmail: { color: appColor('#718493', 'text'), fontSize: 13, marginTop: 4 }, profileMeta: { color: appColor('#577082', 'text'), fontSize: 12, lineHeight: 17, marginTop: 4 }, accountLabel: { color: appColor('#315267', 'text'), fontWeight: '700', marginBottom: 5 }, nameInput: { backgroundColor: appColor('#F5FAFC', 'background'), color: appColor('#17324D', 'text'), paddingHorizontal: 11, minHeight: 42, borderRadius: 10, borderWidth: 1, borderColor: appColor('#D8E6EC', 'border') }, editName: { alignSelf: 'flex-start', paddingTop: 8 }, linkText: { color: appColor('#327E9D', 'text'), fontWeight: '700', fontSize: 13 },
  sectionTitle: { color: appColor('#17324D', 'text'), fontSize: 19, fontWeight: '800', marginTop: 18, marginBottom: 11 },
  eyebrow: { color: appColor('#448EA8', 'text'), fontSize: 11, fontWeight: '800', letterSpacing: 1.5, marginTop: 8 }, title: { color: appColor('#17324D', 'text'), fontSize: 34, fontWeight: '800', marginTop: 8 },
  subtitle: { color: appColor('#718493', 'text'), fontSize: 15, lineHeight: 22, marginTop: 7, marginBottom: 22 }, info: { flexDirection: 'row', backgroundColor: appColor('#E7F4F8', 'background'), borderRadius: 18, padding: 16, marginBottom: 18 }, infoIcon: { fontSize: 22, marginRight: 12 }, infoTitle: { color: appColor('#17324D', 'text'), fontSize: 15, fontWeight: '700' }, copy: { color: appColor('#718493', 'text'), fontSize: 13, lineHeight: 19, marginTop: 5 },
  iconSlot: { width: 38 },
  action: { flexDirection: 'row', alignItems: 'center', backgroundColor: appColor('#FFFFFF', 'background'), borderRadius: 16, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: appColor('#EDF3F6', 'border') }, actionIcon: { width: 38, color: appColor('#327E9D', 'text'), fontSize: 23, fontWeight: '700' }, actionTitle: { color: appColor('#17324D', 'text'), fontSize: 15, fontWeight: '700' }, arrow: { fontSize: 27, color: appColor('#83A3B1', 'text'), marginLeft: 8 },
  backupInfo: { backgroundColor: appColor('#F2F8FA', 'background'), borderRadius: 14, padding: 13, marginBottom: 12 }, backupInfoTitle: { color: appColor('#315267', 'text'), fontSize: 13, fontWeight: '800' }, backupPreview: { backgroundColor: appColor('#E7F4F8', 'background'), borderRadius: 14, padding: 14, marginTop: 14 },
  reminderCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: appColor('#F7FAFC', 'background'), borderRadius: 14, padding: 12, marginTop: 8, marginBottom: 10 }, reminderTimeCard: { backgroundColor: appColor('#F7FAFC', 'background'), borderRadius: 14, padding: 12, marginBottom: 4 }, reminderPresets: { flexDirection: 'row', gap: 8, marginTop: 7, marginBottom: 10 }, timePreset: { flex: 1, minHeight: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: appColor('#FFFFFF', 'background'), borderWidth: 1, borderColor: appColor('#E4EDF1', 'border') }, timePresetSelected: { backgroundColor: appColor('#E1F3F7', 'background'), borderColor: appColor('#7CC1D0', 'border') }, timePresetText: { color: appColor('#577082', 'text'), fontWeight: '700', fontSize: 12 }, timePresetTextSelected: { color: appColor('#0F7181', 'text') }, reminderTimeRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 }, reminderSave: { padding: 10 },
  signOut: { minHeight: 54, justifyContent: 'center', alignItems: 'center', backgroundColor: appColor('#D93E4E', 'background'), borderColor: appColor('#B92537', 'border'), borderWidth: 1, borderBottomWidth: 3, shadowColor: '#A91E30', shadowOpacity: 0.24, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 4, overflow: 'hidden', position: 'relative' }, signOutGloss: { position: 'absolute', left: 0, right: 0, top: 0, height: 20, backgroundColor: appColor('#FFFFFF24', 'background'), borderBottomWidth: 1, borderBottomColor: '#FFFFFF30' }, signOutIcon: { color: appColor('#FFFFFF', 'text'), fontSize: 18, position: 'absolute', left: 22 }, signOutText: { color: appColor('#FFFFFF', 'text'), fontSize: 15, fontWeight: '800' },
  modalKeyboard: { flex: 1 }, scrim: { flex: 1, justifyContent: 'flex-end', backgroundColor: appColor('#10283B88', 'background') }, restoreModalScroll: { flex: 1 }, restoreModalContent: { flexGrow: 1, justifyContent: 'flex-end' }, modal: { backgroundColor: appColor('#F7FBFE', 'background'), borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 22, paddingBottom: 34 }, modalTitle: { color: appColor('#17324D', 'text'), fontSize: 22, fontWeight: '800', marginBottom: 5 }, input: { height: 190, marginTop: 16, padding: 12, borderRadius: 12, backgroundColor: appColor('#FFFFFF', 'background'), color: appColor('#17324D', 'text'), fontSize: 13 }, buttons: { flexDirection: 'row', gap: 10, marginTop: 14 }, cancel: { flex: 1, padding: 14, alignItems: 'center', borderRadius: 12, backgroundColor: appColor('#E6EEF2', 'background') }, cancelText: { color: appColor('#315267', 'text'), fontWeight: '700' }, restore: { flex: 1, padding: 14, alignItems: 'center', borderRadius: 12, backgroundColor: appColor('#327E9D', 'background') }, restoreText: { color: appColor('#FFFFFF', 'text'), fontWeight: '700' },
  passwordModalScroll: { flexGrow: 1, justifyContent: 'flex-end' }, passwordField: { marginTop: 13 }, passwordInput: { minHeight: 46, paddingHorizontal: 12, borderRadius: 11, backgroundColor: appColor('#FFFFFF', 'background'), borderWidth: 1, borderColor: appColor('#D8E6EC', 'border'), color: appColor('#17324D', 'text') }, showPasswordButton: { alignSelf: 'flex-end', minHeight: 40, justifyContent: 'center', paddingHorizontal: 6 }, manualPaste: { alignSelf: 'center', padding: 10, marginTop: 4 },
});
