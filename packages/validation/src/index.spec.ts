import { describe, expect, it } from 'vitest';
import { healthResponseSchema, interfacePreferencesSchema } from './index.js';

describe('healthResponseSchema', () => {
  const valid = {
    status: 'degraded',
    service: 'scholarflow-api',
    version: '0.1.0',
    timestamp: '2026-10-10T12:00:00.000Z',
    checks: { api: 'up', database: 'down' },
  };

  it('accepts a degraded health payload', () => {
    expect(healthResponseSchema.parse(valid).checks.database).toBe('down');
  });

  it('rejects an unknown service name', () => {
    expect(() => healthResponseSchema.parse({ ...valid, service: 'other' })).toThrow();
  });
});

describe('interfacePreferencesSchema', () => {
  it('accepts the supported interface choices', () => {
    expect(
      interfacePreferencesSchema.parse({ theme: 'system', language: 'fr' }).language,
    ).toBe('fr');
  });
});
