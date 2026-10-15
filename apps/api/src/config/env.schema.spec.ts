import { describe, expect, it } from 'vitest';
import { envSchema } from './env.schema.js';

describe('envSchema', () => {
  it('applies local defaults', () => {
    const env = envSchema.parse({
      DATABASE_URL: 'postgresql://scholarflow:scholarflow@localhost:5432/scholarflow',
    });
    expect(env.PORT).toBe(3000);
    expect(env.NODE_ENV).toBe('development');
    expect(env.CORS_ORIGINS).toBe('http://localhost:5173');
  });

  it('rejects a missing database url', () => {
    expect(() => envSchema.parse({})).toThrow();
  });
});
