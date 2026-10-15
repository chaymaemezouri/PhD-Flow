import { randomUUID } from 'node:crypto';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { RedisThrottlerStorage } from './common/redis-throttler.storage.js';
import { validateEnv } from './config/env.schema.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { ConferenceModule } from './modules/conferences/conference.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { PaperModule } from './modules/papers/paper.module.js';
import { ReviewModule } from './modules/reviews/review.module.js';
import { WorkflowModule } from './modules/workflow/workflow.module.js';
import { PrismaModule } from './prisma/prisma.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath: ['.env', '../../.env'],
      ignoreEnvFile: process.env.NODE_ENV === 'test',
      validate: validateEnv,
    }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        pinoHttp: {
          level: config.getOrThrow<string>('LOG_LEVEL'),
          genReqId: (request, response) => {
            const header = request.headers['x-request-id'];
            const requestId =
              typeof header === 'string' && header.trim().length > 0
                ? header
                : randomUUID();
            response.setHeader('x-request-id', requestId);
            return requestId;
          },
          redact: ['req.headers.authorization', 'req.headers.cookie'],
          transport:
            config.getOrThrow<string>('NODE_ENV') === 'development'
              ? { target: 'pino-pretty', options: { singleLine: true } }
              : undefined,
        },
      }),
    }),
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        throttlers: [{ ttl: 60_000, limit: 120 }],
        errorMessage: 'Too many requests',
        storage: new RedisThrottlerStorage(
          config.get<string>('REDIS_URL'),
          config.get<string>('NODE_ENV') !== 'test',
        ),
      }),
    }),
    PrismaModule,
    AuthModule,
    ConferenceModule,
    PaperModule,
    ReviewModule,
    WorkflowModule,
    HealthModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
