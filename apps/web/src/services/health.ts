import { healthResponseSchema } from '@scholarflow/validation';
import type { HealthResponse } from '@scholarflow/types';

export async function fetchHealth(): Promise<HealthResponse> {
  const base = import.meta.env.VITE_API_URL ?? '';
  const response = await fetch(`${base}/api/v1/health`);
  const body: unknown = await response.json();
  const parsed = healthResponseSchema.safeParse(body);
  if (!parsed.success) {
    throw new Error('Unexpected health response');
  }
  return parsed.data;
}
