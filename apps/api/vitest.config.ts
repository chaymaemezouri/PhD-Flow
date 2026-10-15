import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';
import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

loadEnv({ path: resolve(import.meta.dirname, '../../.env') });
process.env.DATABASE_URL ??=
  'postgresql://scholarflow:scholarflow@127.0.0.1:5432/scholarflow?schema=public';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    env: {
      NODE_ENV: 'test',
      PORT: '3000',
      CORS_ORIGINS: 'http://localhost:5173',
      LOG_LEVEL: 'silent',
    },
  },
  plugins: [
    swc.vite({
      module: { type: 'es6' },
      jsc: {
        target: 'es2023',
        parser: {
          syntax: 'typescript',
          decorators: true,
        },
        transform: {
          legacyDecorator: true,
          decoratorMetadata: true,
        },
      },
    }),
  ],
});
