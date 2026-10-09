import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory, File, Paths } from 'expo-file-system';
import { getSupabaseClient } from './supabase';

const AVATAR_DIRECTORY = new Directory(Paths.document, 'profile-avatars');
const STORAGE_PREFIX = 'medexam_profile_avatar:';
const AVATAR_BUCKET = 'medexam-profile-images';
const AVATAR_METADATA_KEY = 'medexam_avatar_path';

function storageKey(userId: string) {
  return `${STORAGE_PREFIX}${userId}`;
}

function safeFilePart(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, '_');
}

function fileExtension(mimeType?: string, fileName?: string | null) {
  const mime = mimeType?.toLowerCase() ?? '';
  if (mime.includes('png') || fileName?.toLowerCase().endsWith('.png')) return 'png';
  if (mime.includes('webp') || fileName?.toLowerCase().endsWith('.webp')) return 'webp';
  if (mime.includes('heic') || fileName?.toLowerCase().endsWith('.heic')) return 'heic';
  return 'jpg';
}

export async function getProfileAvatar(userId: string, cloudPath?: unknown): Promise<string | null> {
  const uri = await AsyncStorage.getItem(storageKey(userId));
  let localUri: string | null = null;
  if (uri) {
    const file = new File(uri);
    if (file.exists) localUri = file.uri;
    else await AsyncStorage.removeItem(storageKey(userId));
  }
  const safePath = typeof cloudPath === 'string' && cloudPath.startsWith(`${userId}/`) ? cloudPath : null;
  const client = getSupabaseClient();
  if (!safePath || !client) return localUri;
  try {
    const { data, error } = await client.storage.from(AVATAR_BUCKET).createSignedUrl(safePath, 60 * 60 * 24);
    if (error) throw error;
    return data.signedUrl;
  } catch {
    return localUri;
  }
}

export async function saveProfileAvatar(userId: string, sourceUri: string, mimeType?: string, fileName?: string | null) {
  if (!AVATAR_DIRECTORY.exists) AVATAR_DIRECTORY.create({ intermediates: true, idempotent: true });

  const extension = fileExtension(mimeType, fileName);
  const destination = new File(AVATAR_DIRECTORY, `${safeFilePart(userId)}-${Date.now()}.${extension}`);
  await new File(sourceUri).copy(destination);

  const key = storageKey(userId);
  const previousUri = await AsyncStorage.getItem(key);
  try {
    await AsyncStorage.setItem(key, destination.uri);
  } catch (error) {
    if (destination.exists) destination.delete();
    throw error;
  }

  if (previousUri && previousUri !== destination.uri) {
    const previous = new File(previousUri);
    if (previous.exists) previous.delete();
  }

  let cloudSynced = false;
  let cloudMessage: string | null = null;
  const client = getSupabaseClient();
  if (client) {
    try {
      const { data: { session }, error: sessionError } = await client.auth.getSession();
      if (sessionError) throw sessionError;
      if (session?.user.id !== userId) throw new Error('Sign in to the same Medora account before syncing the profile picture.');
      const path = `${userId}/avatar-${Date.now()}.${extension}`;
      const fileBytes = await fetch(destination.uri).then((response) => {
        if (!response.ok) throw new Error('The selected image could not be read for cloud sync.');
        return response.arrayBuffer();
      });
      const { error: uploadError } = await client.storage.from(AVATAR_BUCKET).upload(path, fileBytes, { upsert: true, contentType: mimeType || `image/${extension === 'jpg' ? 'jpeg' : extension}`, cacheControl: '3600' });
      if (uploadError) throw uploadError;
      const { error: metadataError } = await client.auth.updateUser({ data: { ...session.user.user_metadata, [AVATAR_METADATA_KEY]: path } });
      if (metadataError) throw metadataError;
      cloudSynced = true;
      const oldPath = session.user.user_metadata[AVATAR_METADATA_KEY];
      if (typeof oldPath === 'string' && oldPath !== path && oldPath.startsWith(`${userId}/`)) {
        await client.storage.from(AVATAR_BUCKET).remove([oldPath]).catch(() => undefined);
      }
    } catch (error) {
      cloudMessage = error instanceof Error ? error.message : 'The photo was saved on this device, but cloud sync did not finish.';
    }
  } else {
    cloudMessage = 'The photo is saved on this device. Sign in to sync it to other devices.';
  }
  return { uri: destination.uri, cloudSynced, cloudMessage };
}

export async function removeProfileAvatar(userId: string, cloudPath?: unknown) {
  const key = storageKey(userId);
  const previousUri = await AsyncStorage.getItem(key);
  await AsyncStorage.removeItem(key);
  if (previousUri) {
    const previous = new File(previousUri);
    if (previous.exists) previous.delete();
  }
  const safePath = typeof cloudPath === 'string' && cloudPath.startsWith(`${userId}/`) ? cloudPath : null;
  const client = getSupabaseClient();
  let cloudSynced = !safePath;
  if (safePath && client) {
    try {
      const { data: { session }, error: sessionError } = await client.auth.getSession();
      if (sessionError) throw sessionError;
      if (session?.user.id !== userId) throw new Error('Sign in to the account that owns this profile picture.');
      const { error: metadataError } = await client.auth.updateUser({ data: { ...session.user.user_metadata, [AVATAR_METADATA_KEY]: null } });
      if (metadataError) throw metadataError;
      const { error: removeError } = await client.storage.from(AVATAR_BUCKET).remove([safePath]);
      if (removeError) throw removeError;
      cloudSynced = true;
    } catch {
      cloudSynced = false;
    }
  }
  return { cloudSynced };
}
