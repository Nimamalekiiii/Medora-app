import 'react-native-url-polyfill/auto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { AppState, Platform } from 'react-native';

import { createChunkedStore } from './chunked-store';

const supabaseUrl = (process.env.EXPO_PUBLIC_SUPABASE_URL || '').trim();
const supabasePublishableKey = (process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY || '').trim();

let client: SupabaseClient | null | undefined;

/** Same key supabase-js uses by default, set explicitly so the saved session can be read back. */
function getAuthStorageKey() {
  try {
    return `sb-${new URL(supabaseUrl).hostname.split('.')[0]}-auth-token`;
  } catch {
    return 'medexam-auth-token';
  }
}

const KEYCHAIN_OPTIONS: SecureStore.SecureStoreOptions = {
  // Readable after the phone has been unlocked once, so the sign-in can be
  // refreshed in the background, and never copied to another device.
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

/** The sign-in session, kept in the iOS Keychain / Android Keystore. */
const secureSession = createChunkedStore({
  get: (key) => SecureStore.getItemAsync(key, KEYCHAIN_OPTIONS),
  set: (key, value) => SecureStore.setItemAsync(key, value, KEYCHAIN_OPTIONS),
  remove: (key) => SecureStore.deleteItemAsync(key, KEYCHAIN_OPTIONS),
});

const webStorage = {
  getItem(key: string) {
    if (typeof window === 'undefined') return null;
    try { return window.localStorage.getItem(key); } catch { return null; }
  },
  setItem(key: string, value: string) {
    if (typeof window === 'undefined') return;
    try { window.localStorage.setItem(key, value); } catch { /* Browser storage can be disabled. */ }
  },
  removeItem(key: string) {
    if (typeof window === 'undefined') return;
    try { window.localStorage.removeItem(key); } catch { /* Browser storage can be disabled. */ }
  },
};

/**
 * Where supabase-js keeps the session. On a phone this is secure storage.
 * Sessions saved by earlier versions in AsyncStorage are moved across the
 * first time they are read. If secure storage is ever unavailable, the
 * session falls back to AsyncStorage so the student is not signed out.
 */
const authStorage = {
  async getItem(key: string) {
    if (Platform.OS === 'web') return webStorage.getItem(key);
    try {
      const secured = await secureSession.get(key);
      if (secured !== null) return secured;
    } catch (error) {
      console.warn('Secure storage could not be read; using standard storage:', error);
      return AsyncStorage.getItem(key);
    }

    const legacy = await AsyncStorage.getItem(key);
    if (legacy === null) return null;
    try {
      await secureSession.set(key, legacy);
      await AsyncStorage.removeItem(key);
    } catch (error) {
      console.warn('The sign-in could not be moved to secure storage yet:', error);
    }
    return legacy;
  },
  async setItem(key: string, value: string) {
    if (Platform.OS === 'web') { webStorage.setItem(key, value); return; }
    try {
      await secureSession.set(key, value);
      await AsyncStorage.removeItem(key);
    } catch (error) {
      console.warn('Secure storage could not be written; using standard storage:', error);
      await AsyncStorage.setItem(key, value);
    }
  },
  async removeItem(key: string) {
    if (Platform.OS === 'web') { webStorage.removeItem(key); return; }
    try {
      await secureSession.remove(key);
    } catch (error) {
      console.warn('Secure storage could not be cleared:', error);
    }
    await AsyncStorage.removeItem(key);
  },
};

export function isSupabaseConfigured() {
  return Boolean(supabaseUrl && supabasePublishableKey);
}

export function getSupabaseClient() {
  if (!isSupabaseConfigured()) return null;
  if (client !== undefined) return client;

  client = createClient(supabaseUrl, supabasePublishableKey, {
    auth: {
      storage: authStorage,
      storageKey: getAuthStorageKey(),
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  });

  if (Platform.OS !== 'web') {
    AppState.addEventListener('change', (state) => {
      if (state === 'active') client?.auth.startAutoRefresh();
      else client?.auth.stopAutoRefresh();
    });
  }

  return client;
}

/**
 * The session saved on this device, read without contacting Supabase.
 *
 * supabase-js reports no session when the access token has expired and the
 * refresh request fails (for example with no connection at launch), even
 * though the saved session is still valid. The app uses this to keep the user
 * signed in until the connection returns. A real sign-out removes the saved
 * session, so this returns null afterwards.
 */
export async function readSavedSession(): Promise<Session | null> {
  if (!isSupabaseConfigured()) return null;
  try {
    const raw = await authStorage.getItem(getAuthStorageKey());
    if (!raw) return null;
    const saved = JSON.parse(raw) as Partial<Session> | null;
    if (!saved || typeof saved.access_token !== 'string' || typeof saved.refresh_token !== 'string' || !saved.user?.id) return null;
    return saved as Session;
  } catch {
    return null;
  }
}
