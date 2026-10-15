import { describe, expect, it, vi } from 'vitest';
import { HealthService } from './health.service.js';
import type { PrismaService } from '../../prisma/prisma.service.js';

function createPrisma(query: () => Promise<unknown>): PrismaService {
  return {
    $queryRaw: query,
  } as unknown as PrismaService;
}

describe('HealthService', () => {
  it('reports ok when the database answers', async () => {
    const service = new HealthService(createPrisma(async () => [{ '?column?': 1 }]));
    const result = await service.check();
    expect(result.status).toBe('ok');
    expect(result.checks.database).toBe('up');
    expect(result.service).toBe('scholarflow-api');
  });

  it('reports degraded when the database cannot be reached', async () => {
    const service = new HealthService(
      createPrisma(() => Promise.reject(new Error('connection refused'))),
    );
    const result = await service.check();
    expect(result.status).toBe('degraded');
    expect(result.checks.database).toBe('down');
  });

  it('does not throw when the database check fails', async () => {
    const query = vi.fn().mockRejectedValue(new Error('timeout'));
    const service = new HealthService(createPrisma(query));
    await expect(service.check()).resolves.toMatchObject({ status: 'degraded' });
  });
});
