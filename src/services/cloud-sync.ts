import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Session } from '@supabase/supabase-js';
import { AppState } from 'react-native';

import { notifyLocalDataChanged, subscribeToLocalDataChanges } from './cloud-sync-state';
import { forgetDeviceAccount, switchDeviceAccount } from './device-account';
import { getSupabaseClient } from './supabase';
import { reconcileExamReminders } from './study-reminder';
import {
  createStudyDataBackup,
  getAccountStorageKeys,
  getExamsBySubject,
  getSubjects,
  restoreStudyDataBackup,
  type StudyDataBackup,
} from './storage';

const DIRTY_KEY = 'medexam_cloud_dirty';
const OWNER_KEY = 'medexam_cloud_owner_user';
const LINK_REQUIRED_KEY = 'medexam_cloud_link_required';
const CLOUD_RECOVERY_KEY = 'medexam_cloud_recovery';
const TABLE = 'medexam_study_data';

type CloudRow = {
  user_id: string;
  data: StudyDataBackup;
  version: number;
  updated_at: string;
};

type SyncMeta = { initialized: boolean; lastSyncedVersion: number; syncedAt: string | null };
type SyncResult = 'synced' | 'downloaded' | 'up-to-date' | 'conflict' | 'local-only' | 'no-cloud-backup' | 'not-configured';
type SyncMode = 'auto' | 'push' | 'pull';

let currentSession: Session | null = null;
let initialized = false;
let localRevision = 0;
let syncing = false;
let needsInitialChoice = false;
let suppressedChanges = 0;
let debounce: ReturnType<typeof setTimeout> | undefined;
let ownerQueue: Promise<void> = Promise.resolve();

/** Everything on the device that belongs to one account: study data, its recovery copy and unsynced-change state. */
function accountKeys() {
  return [...getAccountStorageKeys(), DIRTY_KEY, 'medexam_ai_progress_review', 'medexam_active_focus_session'];
}

/**
 * Makes sure the study data on the device belongs to the account that is
 * signed in. When a different account signs in, the previous account's data
 * is put away and this account's data is brought out, so two people who
 * share a phone never see each other's subjects, notes or results.
 */
async function ensureDeviceOwner(userId: string) {
  const owner = await AsyncStorage.getItem(OWNER_KEY);
  if (owner === userId) return;
  if (!owner) {
    // First sign-in on this device. Data already here is handled by the sync's own choice step.
    await AsyncStorage.setItem(OWNER_KEY, userId);
    return;
  }
  suppressedChanges += 1;
  try {
    await switchDeviceAccount(AsyncStorage, owner, userId, accountKeys());
    await AsyncStorage.setItem(OWNER_KEY, userId);
    await AsyncStorage.removeItem(LINK_REQUIRED_KEY);
    needsInitialChoice = false;
    // Screens reload with the right account's data; this is not a change to upload.
    notifyLocalDataChanged();
    const [exams, subjects] = await Promise.all([getExamsBySubject(), getSubjects()]);
    void reconcileExamReminders(exams, subjects).catch((error) => console.warn('Exam reminders could not be refreshed:', error));
  } finally {
    suppressedChanges -= 1;
  }
}

/** Runs the owner check one at a time, so two sign-in events cannot both switch the data. */
function adoptSession(session: Session | null, delay = 500) {
  ownerQueue = ownerQueue
    .then(async () => { if (session) await ensureDeviceOwner(session.user.id); })
    .catch((error) => console.warn('Could not prepare this device for the signed-in account:', error))
    .then(() => {
      currentSession = session;
      announceStatusChange();
      if (session) scheduleAutoSync(delay);
    });
}

/** Removes an account's study data from this device, after the account itself has been deleted. */
export async function forgetAccountOnDevice(userId: string) {
  suppressedChanges += 1;
  try {
    await forgetDeviceAccount(AsyncStorage, userId, accountKeys());
    await AsyncStorage.multiRemove([OWNER_KEY, LINK_REQUIRED_KEY, CLOUD_RECOVERY_KEY, metaKey(userId)]);
    notifyLocalDataChanged();
    void reconcileExamReminders({}, []).catch((error) => console.warn('Exam reminders could not be cleared:', error));
  } finally {
    suppressedChanges -= 1;
  }
}
const statusListeners = new Set<() => void>();

function metaKey(userId: string) {
  return `medexam_cloud_sync_${userId}`;
}

async function readMeta(userId: string): Promise<SyncMeta> {
  try {
    const value = await AsyncStorage.getItem(metaKey(userId));
    if (value) {
      const parsed = JSON.parse(value) as Partial<SyncMeta>;
      return {
        initialized: parsed.initialized === true,
        lastSyncedVersion: Number(parsed.lastSyncedVersion) || 0,
        syncedAt: typeof parsed.syncedAt === 'string' ? parsed.syncedAt : null,
      };
    }
  } catch (error) {
    console.warn('Could not read cloud sync state:', error);
  }
  return { initialized: false, lastSyncedVersion: 0, syncedAt: null };
}

async function writeMeta(userId: string, meta: SyncMeta) {
  await AsyncStorage.setItem(metaKey(userId), JSON.stringify(meta));
  await AsyncStorage.setItem(OWNER_KEY, userId);
  await AsyncStorage.removeItem(LINK_REQUIRED_KEY);
}

function announceStatusChange() {
  for (const listener of statusListeners) listener();
}

export function subscribeToCloudSyncStatus(listener: () => void) {
  statusListeners.add(listener);
  return () => { statusListeners.delete(listener); };
}

export function initializeCloudSync() {
  if (initialized) return () => undefined;
  initialized = true;
  const client = getSupabaseClient();
  if (!client) return () => undefined;

  const changeUnsubscribe = subscribeToLocalDataChanges(() => {
    localRevision += 1;
    if (suppressedChanges > 0) return;
    void AsyncStorage.setItem(DIRTY_KEY, '1').then(announceStatusChange).catch((error) => {
      console.warn('Could not mark local study data as pending sync:', error);
    });
    if (currentSession) scheduleAutoSync();
  });

  const appStateSubscription = AppState.addEventListener('change', (state) => {
    if (state === 'active' && currentSession) scheduleAutoSync(400);
  });

  const { data: authListener } = client.auth.onAuthStateChange((_event, session) => {
    adoptSession(session);
  });

  void client.auth.getSession().then(({ data }) => {
    adoptSession(data.session);
  }).catch((error) => console.warn('Could not restore Supabase session:', error));

  return () => {
    changeUnsubscribe();
    appStateSubscription.remove();
    authListener.subscription.unsubscribe();
    initialized = false;
  };
}

function scheduleAutoSync(delay = 1400) {
  if (debounce) clearTimeout(debounce);
  debounce = setTimeout(() => {
    void autoSyncIfReady();
  }, delay);
}

async function autoSyncIfReady() {
  if (!currentSession || syncing) return;
  try {
    const result = await syncStudyData('auto');
    needsInitialChoice = result === 'conflict' || result === 'local-only';
    announceStatusChange();
  } catch (error) {
    console.warn('Cloud sync will retry when the app is used again:', error);
  }
}

async function getCloudRow(userId: string): Promise<CloudRow | null> {
  const client = getSupabaseClient();
  if (!client) return null;
  const { data, error } = await client
    .from(TABLE)
    .select('user_id,data,version,updated_at')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw new Error(`Could not read the cloud copy: ${error.message}`);
  return data as CloudRow | null;
}

async function localBackupHasContent(backup: StudyDataBackup) {
  // Preferences always have default values, so they must not make a fresh or
  // deliberately cleared study library look like it contains study material.
  const contentKeys = [
    'medexam_subjects', 'medexam_topics_by_subject', 'medexam_exams_by_subject',
    'medexam_study_plans_by_subject', 'medexam_study_activity', 'medexam_quiz_results',
    'medexam_flashcards', 'medexam_flashcard_reviews', 'medexam_active_recall_questions',
    'medexam_generated_quizzes_by_topic', 'medexam_topic_notes',
  ];
  return contentKeys.some((key) => {
    const value = backup.data[key];
    if (Array.isArray(value)) return value.length > 0;
    return typeof value === 'object' && value !== null && Object.keys(value).length > 0;
  });
}

async function uploadBackup(userId: string, backup: StudyDataBackup, current: CloudRow | null, force: boolean, revisionAtStart = localRevision) {
  const client = getSupabaseClient();
  if (!client) return 'not-configured' as const;
  const version = current ? Number(current.version) + 1 : 1;

  if (current && force) {
    await AsyncStorage.setItem(CLOUD_RECOVERY_KEY, JSON.stringify({
      userId,
      data: current.data,
      version: current.version,
      savedAt: new Date().toISOString(),
    }));
  }

  if (!current) {
    const { error } = await client.from(TABLE).insert({ user_id: userId, data: backup, version });
    if (error) {
      if (error.code === '23505') return 'conflict' as const;
      throw new Error(`Could not save the cloud copy: ${error.message}`);
    }
  } else {
    let query = client.from(TABLE).update({ data: backup, version, updated_at: new Date().toISOString() }).eq('user_id', userId);
    if (!force) query = query.eq('version', current.version);
    const { data, error } = await query.select('version').maybeSingle();
    if (error) throw new Error(`Could not save the cloud copy: ${error.message}`);
    if (!data) return 'conflict' as const;
  }

  await writeMeta(userId, { initialized: true, lastSyncedVersion: version, syncedAt: new Date().toISOString() });
  needsInitialChoice = false;
  if (revisionAtStart === localRevision) await AsyncStorage.setItem(DIRTY_KEY, '0');
  else await AsyncStorage.setItem(DIRTY_KEY, '1');
  announceStatusChange();
  if (revisionAtStart !== localRevision) scheduleAutoSync(300);
  return 'synced' as const;
}

async function downloadBackup(userId: string, row: CloudRow) {
  if (!row.data || row.data.app !== 'MedExam' || row.data.version !== 1 || typeof row.data.data !== 'object') {
    throw new Error('The cloud copy is incomplete or uses an unsupported format. Your local data was not changed.');
  }
  suppressedChanges += 1;
  try {
    await restoreStudyDataBackup(row.data);
  } finally {
    suppressedChanges -= 1;
  }
  await writeMeta(userId, { initialized: true, lastSyncedVersion: Number(row.version), syncedAt: new Date().toISOString() });
  needsInitialChoice = false;
  await AsyncStorage.setItem(DIRTY_KEY, '0');
  announceStatusChange();
  return 'downloaded' as const;
}

export async function syncStudyData(mode: SyncMode = 'auto'): Promise<SyncResult> {
  const client = getSupabaseClient();
  if (!client) return 'not-configured';
  const userId = currentSession?.user.id;
  if (!userId) throw new Error('Sign in to your account before syncing.');
  if (syncing) throw new Error('A cloud sync is already in progress. Please wait.');
  const owner = await AsyncStorage.getItem(OWNER_KEY);
  if (owner && owner !== userId) {
    throw new Error('This device is linked to a different account. Sign out and sign in again to switch accounts.');
  }
  if (mode === 'auto' && (await AsyncStorage.getItem(LINK_REQUIRED_KEY)) === '1') {
    needsInitialChoice = true;
    return 'conflict';
  }
  syncing = true;
  announceStatusChange();

  try {
    const revisionBeforeSnapshot = localRevision;
    const [row, firstSnapshot, meta, dirtyRaw] = await Promise.all([
      getCloudRow(userId), createStudyDataBackup(), readMeta(userId), AsyncStorage.getItem(DIRTY_KEY),
    ]);
    let localBackup = firstSnapshot;
    let snapshotRevision = revisionBeforeSnapshot;
    if (localRevision !== revisionBeforeSnapshot) {
      snapshotRevision = localRevision;
      localBackup = await createStudyDataBackup();
    }
    const dirty = dirtyRaw === '1';

    if (mode === 'pull') {
      if (!row) return 'no-cloud-backup';
      return await downloadBackup(userId, row);
    }
    if (mode === 'push') {
      return await uploadBackup(userId, localBackup, row, true, snapshotRevision);
    }

    if (!row) {
      // A new account should not silently inherit study material already on this device.
      // Fresh installs are empty and can create their first cloud backup automatically.
      if (!meta.initialized && await localBackupHasContent(localBackup)) {
        needsInitialChoice = true;
        return 'local-only';
      }
      return await uploadBackup(userId, localBackup, null, false, snapshotRevision);
    }
    if (!(await localBackupHasContent(localBackup))) {
      // An empty local state can be an intentional "delete study data" action.
      // Push it only when this device has synced this exact cloud version before;
      // otherwise prefer the cloud copy and avoid erasing another device's data.
      if (dirty && meta.initialized) {
        if (Number(row.version) !== meta.lastSyncedVersion) {
          needsInitialChoice = true;
          return 'conflict';
        }
        return await uploadBackup(userId, localBackup, row, false, snapshotRevision);
      }
      return await downloadBackup(userId, row);
    }
    if (!meta.initialized) {
      needsInitialChoice = true;
      return 'conflict';
    }
    if (dirty) {
      if (Number(row.version) !== meta.lastSyncedVersion) {
        needsInitialChoice = true;
        return 'conflict';
      }
      return await uploadBackup(userId, localBackup, row, false, snapshotRevision);
    }
    if (Number(row.version) !== meta.lastSyncedVersion) return await downloadBackup(userId, row);
    needsInitialChoice = false;
    return 'up-to-date';
  } finally {
    syncing = false;
    announceStatusChange();
  }
}

export async function getCloudSyncSummary() {
  const session = currentSession;
  if (!session) return { signedIn: false, email: null, dirty: false, syncedAt: null, accountMismatch: false, hasCloudRecovery: false, needsInitialChoice: false };
  const [meta, dirtyRaw] = await Promise.all([
    readMeta(session.user.id), AsyncStorage.getItem(DIRTY_KEY),
  ]);
  const owner = await AsyncStorage.getItem(OWNER_KEY);
  const recoveryRaw = await AsyncStorage.getItem(CLOUD_RECOVERY_KEY);
  let hasCloudRecovery = false;
  if (recoveryRaw) {
    try { hasCloudRecovery = JSON.parse(recoveryRaw)?.userId === session.user.id; } catch { hasCloudRecovery = false; }
  }
  return {
    signedIn: true,
    email: session.user.email ?? null,
    dirty: dirtyRaw === '1',
    syncedAt: meta.syncedAt,
    accountMismatch: Boolean(owner && owner !== session.user.id),
    hasCloudRecovery,
    needsInitialChoice,
  };
}

export async function restorePreviousCloudBackup(): Promise<SyncResult> {
  const userId = currentSession?.user.id;
  if (!userId) throw new Error('Sign in to the account that owns this recovery copy.');
  const raw = await AsyncStorage.getItem(CLOUD_RECOVERY_KEY);
  if (!raw) return 'no-cloud-backup';
  let previous: { userId?: string; data?: StudyDataBackup };
  try { previous = JSON.parse(raw); } catch { throw new Error('The previous cloud copy could not be read.'); }
  if (previous.userId !== userId || !previous.data) throw new Error('There is no previous cloud copy for this account.');
  const current = await getCloudRow(userId);
  return uploadBackup(userId, previous.data, current, true);
}

export function getCurrentSession() {
  return currentSession;
}

export function getSupabaseAuthClient() {
  return getSupabaseClient()?.auth ?? null;
}

export async function disconnectCloudAccount() {
  const auth = getSupabaseAuthClient();
  if (!auth || !currentSession) return;
  await AsyncStorage.setItem(LINK_REQUIRED_KEY, '1');
  const { error } = await auth.signOut();
  if (error) {
    await AsyncStorage.removeItem(LINK_REQUIRED_KEY);
    throw new Error(`Could not sign out: ${error.message}`);
  }
  await AsyncStorage.removeItem(OWNER_KEY);
}

// Storage operations call this after a successful local write.
export { notifyLocalDataChanged };
