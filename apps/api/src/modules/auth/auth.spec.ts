import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../app.module.js';
import { configureApp } from '../../common/configure-app.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { EmailService } from './email.service.js';

describe('account authentication', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let email: EmailService;
  const address = `person-${Date.now()}@example.test`;
  const password = 'correct-horse-12';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    email = app.get(EmailService);
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { endsWith: '@example.test' } } });
    await app.close();
  });

  async function csrf(agent: ReturnType<typeof request.agent>): Promise<string> {
    const response = await agent.get('/api/v1/auth/csrf');
    expect(response.status).toBe(200);
    return response.body.csrfToken as string;
  }

  function tokenFromLastEmail(): string {
    const message = email.sent.at(-1);
    if (!message) {
      throw new Error('No email was recorded');
    }
    const match = message.text.match(/token=([^&\s]+)/);
    if (!match?.[1]) {
      throw new Error('Email did not contain a token');
    }
    return decodeURIComponent(match[1]);
  }

  it('rejects registration without a CSRF token', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: address,
        password,
        firstName: 'Ada',
        lastName: 'Lovelace',
      });
    expect(response.status).toBe(403);
  });

  it('verifies email, signs in, and keeps the password hash private', async () => {
    const agent = request.agent(app.getHttpServer());
    const token = await csrf(agent);
    const registered = await agent
      .post('/api/v1/auth/register')
      .set('x-csrf-token', token)
      .send({ email: address, password, firstName: 'Ada', lastName: 'Lovelace' });
    expect(registered.status).toBe(201);
    expect(registered.body.passwordHash).toBeUndefined();
    expect(registered.body.emailVerified).toBe(false);

    const tooEarly = await agent
      .post('/api/v1/auth/login')
      .set('x-csrf-token', token)
      .send({ email: address, password });
    expect(tooEarly.status).toBe(403);

    const verified = await agent
      .post('/api/v1/auth/verify-email')
      .set('x-csrf-token', token)
      .send({ token: tokenFromLastEmail() });
    expect(verified.status).toBe(204);

    const signedIn = await agent
      .post('/api/v1/auth/login')
      .set('x-csrf-token', token)
      .send({ email: address, password });
    expect(signedIn.status).toBe(200);
    expect(signedIn.body.user.email).toBe(address);

    const me = await agent.get('/api/v1/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.profile.firstName).toBe('Ada');

    const stranger = await request(app.getHttpServer()).get('/api/v1/auth/me');
    expect(stranger.status).toBe(401);

    const forbidden = await agent.get('/api/v1/system/status');
    expect(forbidden.status).toBe(403);
  });

  it('uses a reset link only once', async () => {
    const agent = request.agent(app.getHttpServer());
    const token = await csrf(agent);
    const requested = await agent
      .post('/api/v1/auth/forgot-password')
      .set('x-csrf-token', token)
      .send({ email: address });
    expect(requested.status).toBe(202);
    const resetToken = tokenFromLastEmail();
    const reset = await agent
      .post('/api/v1/auth/reset-password')
      .set('x-csrf-token', token)
      .send({ token: resetToken, newPassword: 'new-password-12' });
    expect(reset.status).toBe(204);
    const again = await agent
      .post('/api/v1/auth/reset-password')
      .set('x-csrf-token', token)
      .send({ token: resetToken, newPassword: 'another-password-12' });
    expect(again.status).toBe(400);

    const oldPassword = await agent
      .post('/api/v1/auth/login')
      .set('x-csrf-token', token)
      .send({ email: address, password });
    expect(oldPassword.status).toBe(401);
  });
});
