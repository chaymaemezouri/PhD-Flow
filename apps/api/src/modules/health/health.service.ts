import { Injectable } from '@nestjs/common';
import type { HealthResponse } from '@scholarflow/types';
import { APP_NAME, APP_VERSION } from '../../config/constants.js';
import { PrismaService } from '../../prisma/prisma.service.js';

@Injectable()
export class HealthService {
  constructor(private readonly prisma: PrismaService) {}

  async check(): Promise<HealthResponse> {
    const database = await this.readDatabase();
    return {
      status: database === 'up' ? 'ok' : 'degraded',
      service: APP_NAME,
      version: APP_VERSION,
      timestamp: new Date().toISOString(),
      checks: {
        api: 'up',
        database,
      },
    };
  }

  private async readDatabase(): Promise<'up' | 'down'> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return 'up';
    } catch {
      return 'down';
    }
  }
}
