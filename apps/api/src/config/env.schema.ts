import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1),
  CORS_ORIGINS: z.string().min(1).default('http://localhost:5173'),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),
  ENABLE_API_DOCS: z.enum(['true', 'false']).default('false'),
  APP_PUBLIC_URL: z.string().url().default('http://localhost:5173'),
  SMTP_HOST: z.string().min(1).default('localhost'),
  SMTP_PORT: z.coerce.number().int().positive().default(1025),
  MAIL_FROM: z.string().min(3).default('ScholarFlow <noreply@localhost>'),
  MINIO_PORT: z.coerce.number().int().positive().default(9000),
  MINIO_ROOT_USER: z.string().min(1).default('scholarflow'),
  MINIO_ROOT_PASSWORD: z.string().min(1).default('scholarflow-dev-secret'),
  MINIO_BUCKET: z.string().min(1).default('scholarflow'),
  REDIS_URL: z.string().min(1).default('redis://localhost:6379'),
});

export type AppEnv = z.infer<typeof envSchema>;

export function validateEnv(input: Record<string, unknown>): AppEnv {
  return envSchema.parse(input);
}
