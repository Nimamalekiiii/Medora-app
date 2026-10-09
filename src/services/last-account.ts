import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Remembers who last signed in on this device, so that if they are ever
 * signed out the sign-in screen can greet them and only ask for the password.
 * Holds the email and first name only; never a password or session.
 */

const LAST_ACCOUNT_KEY = 'medexam_last_account';

export type LastAccount = { email: string; name: string };

export async function getLastAccount(): Promise<LastAccount | null> {
  try {
    const raw = await AsyncStorage.getItem(LAST_ACCOUNT_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as Partial<LastAccount> | null;
    if (!saved || typeof saved.email !== 'string' || !saved.email.includes('@')) return null;
    return { email: saved.email, name: typeof saved.name === 'string' ? saved.name : '' };
  } catch {
    return null;
  }
}

export async function rememberLastAccount(account: LastAccount): Promise<void> {
  try {
    await AsyncStorage.setItem(LAST_ACCOUNT_KEY, JSON.stringify({ email: account.email.trim().toLowerCase(), name: account.name.trim() }));
  } catch (error) {
    console.warn('Could not remember the last Medora account:', error);
  }
}

export async function forgetLastAccount(): Promise<void> {
  try {
    await AsyncStorage.removeItem(LAST_ACCOUNT_KEY);
  } catch (error) {
    console.warn('Could not forget the last Medora account:', error);
  }
}
