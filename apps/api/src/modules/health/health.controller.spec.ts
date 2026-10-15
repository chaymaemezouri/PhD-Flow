import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../../app.module.js';
import { configureApp } from '../../common/configure-app.js';
import { PrismaService } from '../../prisma/prisma.service.js';

describe('GET /api/v1/health', () => {
  let app: INestApplication | undefined;

  afterEach(async () => {
    if (app) {
      await app.close();
      app = undefined;
    }
  });

  async function boot(database: 'up' | 'down'): Promise<INestApplication> {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue({
        $queryRaw:
          database === 'up'
            ? vi.fn().mockResolvedValue([{ ok: 1 }])
            : vi.fn().mockRejectedValue(new Error('down')),
        $disconnect: vi.fn(),
        onModuleDestroy: vi.fn(),
      })
      .compile();

    const nestApp = moduleRef.createNestApplication();
    configureApp(nestApp);
    await nestApp.init();
    app = nestApp;
    return nestApp;
  }

  it('returns 200 when the database is reachable', async () => {
    const nestApp = await boot('up');
    const response = await request(nestApp.getHttpServer()).get('/api/v1/health');
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      status: 'ok',
      service: 'scholarflow-api',
      checks: { api: 'up', database: 'up' },
    });
    expect(response.headers['x-request-id']).toEqual(expect.any(String));
  });

  it('returns 503 when the database is unreachable', async () => {
    const nestApp = await boot('down');
    const response = await request(nestApp.getHttpServer()).get('/api/v1/health');
    expect(response.status).toBe(503);
    expect(response.body.status).toBe('degraded');
    expect(response.body.checks.database).toBe('down');
  });

  it('hides internal details for unexpected failures', async () => {
    const nestApp = await boot('up');
    const response = await request(nestApp.getHttpServer()).get('/api/v1/missing');
    expect(response.status).toBe(404);
    expect(response.body.statusCode).toBe(404);
    expect(response.body.requestId).toEqual(expect.any(String));
    expect(response.body.stack).toBeUndefined();
  });
});
