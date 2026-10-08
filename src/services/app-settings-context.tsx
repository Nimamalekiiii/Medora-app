import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Appearance } from 'react-native';
import { DEFAULT_APP_PREFERENCES, getAppPreferences, saveAppPreferences, type AppAppearance, type AppLanguage, type AppPreferences } from './storage';
import { subscribeToLocalDataChanges } from './cloud-sync-state';

type AppSettingsContextValue = {
  preferences: AppPreferences;
  ready: boolean;
  setAppearance: (appearance: AppAppearance) => Promise<void>;
  setLanguage: (language: AppLanguage) => Promise<void>;
};
const AppSettingsContext = createContext<AppSettingsContextValue | null>(null);

export function AppSettingsProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferences] = useState(DEFAULT_APP_PREFERENCES);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let active = true;
    const refresh = () => getAppPreferences().then((value) => {
      if (!active) return;
      Appearance.setColorScheme(value.appearance === 'system' ? 'unspecified' : value.appearance);
      setPreferences(value);
    });
    const unsubscribe = subscribeToLocalDataChanges(() => { void refresh(); });
    void refresh().finally(() => { if (active) setReady(true); });
    return () => { active = false; unsubscribe(); };
  }, []);

  useEffect(() => {
    Appearance.setColorScheme(preferences.appearance === 'system' ? 'unspecified' : preferences.appearance);
  }, [preferences.appearance]);

  const setAppearance = useCallback(async (appearance: AppAppearance) => {
    const next = { appearance };
    await saveAppPreferences(next);
    setPreferences((current) => ({ ...current, ...next }));
  }, []);
  const setLanguage = useCallback(async (language: AppLanguage) => {
    const next = { language };
    await saveAppPreferences(next);
    setPreferences((current) => ({ ...current, ...next }));
  }, []);
  const value = useMemo(() => ({ preferences, ready, setAppearance, setLanguage }), [preferences, ready, setAppearance, setLanguage]);
  return <AppSettingsContext.Provider value={value}>{children}</AppSettingsContext.Provider>;
}

export function useAppSettings() {
  const value = useContext(AppSettingsContext);
  if (!value) throw new Error('useAppSettings must be used inside AppSettingsProvider.');
  return value;
}
