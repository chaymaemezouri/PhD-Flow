import { beforeEach, describe, expect, it } from 'vitest';
import { defaultPreferences, readPreferences, writePreferences } from './preferences';

describe('interface preferences', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns defaults when nothing is stored', () => {
    expect(readPreferences()).toEqual(defaultPreferences);
  });

  it('round-trips a saved choice', () => {
    writePreferences({ theme: 'dark', language: 'fr' });
    expect(readPreferences()).toEqual({ theme: 'dark', language: 'fr' });
  });

  it('ignores a stored value outside the schema', () => {
    localStorage.setItem(
      'scholarflow.preferences',
      JSON.stringify({ theme: 'sepia', language: 'en' }),
    );
    expect(readPreferences()).toEqual(defaultPreferences);
  });
});
