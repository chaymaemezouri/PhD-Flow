import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { InterfacePreferences } from '@scholarflow/types';
import i18n from '@/lib/i18n';
import {
  applyLanguage,
  applyTheme,
  readPreferences,
  writePreferences,
} from './preferences';

interface PreferencesContextValue {
  preferences: InterfacePreferences;
  savePreferences: (preferences: InterfacePreferences) => void;
}

const PreferencesContext = createContext<PreferencesContextValue | null>(null);

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferences] = useState<InterfacePreferences>(() =>
    readPreferences(),
  );

  useEffect(() => {
    applyTheme(preferences.theme);
    applyLanguage(preferences.language);
    void i18n.changeLanguage(preferences.language);
  }, [preferences]);

  useEffect(() => {
    if (preferences.theme !== 'system') {
      return;
    }
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyTheme('system');
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [preferences.theme]);

  const value = useMemo<PreferencesContextValue>(
    () => ({
      preferences,
      savePreferences: (next) => {
        writePreferences(next);
        setPreferences(next);
      },
    }),
    [preferences],
  );

  return (
    <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>
  );
}

export function usePreferences(): PreferencesContextValue {
  const value = useContext(PreferencesContext);
  if (!value) {
    throw new Error('usePreferences must be used within PreferencesProvider');
  }
  return value;
}
