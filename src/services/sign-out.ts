import { Alert } from 'react-native';

import { getSupabaseAuthClient } from './cloud-sync';
import { tr } from './localization';
import type { AppLanguage } from './storage';

/**
 * Asks for confirmation, then signs out. The auth provider reacts to the
 * sign-out and shows the sign-in screen, so callers do not navigate.
 */
export function confirmSignOut(language: AppLanguage, onBusyChange?: (busy: boolean) => void) {
  const auth = getSupabaseAuthClient();
  if (!auth) return;
  const tx = (text: string) => tr(text, language);
  Alert.alert(tx('Sign out of Medora?'), tx('Your study data stays saved on this device and in your account.'), [
    { text: tx('Cancel'), style: 'cancel' },
    {
      text: tx('Sign out'),
      style: 'destructive',
      onPress: () => {
        onBusyChange?.(true);
        void auth.signOut()
          .then(({ error }) => { if (error) throw error; })
          .catch((error: unknown) => {
            console.warn('Could not sign out:', error);
            Alert.alert(tx('Could not sign out'), tx('Please try again.'));
          })
          .finally(() => onBusyChange?.(false));
      },
    },
  ]);
}
