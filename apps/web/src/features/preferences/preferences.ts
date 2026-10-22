import { interfacePreferencesSchema } from '@scholarflow/validation';
import type {
  InterfaceLanguage,
  InterfacePreferences,
  InterfaceTheme,
} from '@scholarflow/types';

export const PREFERENCES_KEY = 'scholarflow.preferences';

export const defaultPreferences: InterfacePreferences = {
  theme: 'light',
  language: 'en',
};

export function readPreferences(): InterfacePreferences {
  try {
    const raw = localStorage.getItem(PREFERENCES_KEY);
    if (!raw) {
      return defaultPreferences;
    }
    const parsed = interfacePreferencesSchema.safeParse(JSON.parse(raw) as unknown);
    return parsed.success ? parsed.data : defaultPreferences;
  } catch {
    return defaultPreferences;
  }
}

export function writePreferences(preferences: InterfacePreferences): void {
  localStorage.setItem(PREFERENCES_KEY, JSON.stringify(preferences));
}

export function resolveDark(theme: InterfaceTheme): boolean {
  if (theme === 'dark') {
    return true;
  }
  if (theme === 'light') {
    return false;
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function applyTheme(theme: InterfaceTheme): void {
  document.documentElement.classList.toggle('dark', resolveDark(theme));
}

export function applyLanguage(language: InterfaceLanguage): void {
  document.documentElement.lang = language;
}
