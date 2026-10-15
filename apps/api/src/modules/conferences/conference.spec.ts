import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../app.module.js';
import { configureApp } from '../../common/configure-app.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { EmailService } from '../auth/email.service.js';

describe('conferences', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let email: EmailService;
  const stamp = Date.now();
  const chairAddress = `chair-${stamp}@conference.test`;
  const authorAddress = `author-${stamp}@conference.test`;
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
    await prisma.conference.deleteMany({
      where: { slug: { startsWith: `phase2-${stamp}` } },
    });
    await prisma.user.deleteMany({ where: { email: { endsWith: '@conference.test' } } });
    await app.close();
  });

  async function account(address: string, firstName: string) {
    const agent = request.agent(app.getHttpServer());
    const csrfResponse = await agent.get('/api/v1/auth/csrf');
    const csrf = csrfResponse.body.csrfToken as string;
    await agent
      .post('/api/v1/auth/register')
      .set('x-csrf-token', csrf)
      .send({ email: address, password, firstName, lastName: 'Tester' });
    const message = email.sent.at(-1);
    const token = decodeURIComponent(message?.text.match(/token=([^&\s]+)/)?.[1] ?? '');
    await agent
      .post('/api/v1/auth/verify-email')
      .set('x-csrf-token', csrf)
      .send({ token });
    await agent
      .post('/api/v1/auth/login')
      .set('x-csrf-token', csrf)
      .send({ email: address, password });
    return { agent, csrf };
  }

  it('hides drafts, publishes a public directory entry, and isolates members', async () => {
    const chair = await account(chairAddress, 'Grace');
    const created = await chair.agent
      .post('/api/v1/conferences')
      .set('x-csrf-token', chair.csrf)
      .send({
        name: 'Phase Two Colloquium',
        shortName: `phase2-${stamp}`,
        description: 'Private until published',
        city: 'Lyon',
        country: 'France',
      });
    expect(created.status).toBe(201);
    expect(created.body.myMembership.role).toBe('CHAIR');
    expect(created.body.status).toBe('DRAFT');
    const conferenceId = created.body.id as string;

    const hidden = await request(app.getHttpServer()).get(
      `/api/v1/directory/${created.body.slug}`,
    );
    expect(hidden.status).toBe(404);

    const outsider = await account(authorAddress, 'Alan');
    const missing = await outsider.agent.get(`/api/v1/conferences/${conferenceId}`);
    expect(missing.status).toBe(404);

    const published = await chair.agent
      .patch(`/api/v1/conferences/${conferenceId}`)
      .set('x-csrf-token', chair.csrf)
      .send({ status: 'PUBLISHED', visibility: 'PUBLIC' });
    expect(published.status).toBe(200);
    expect(published.body.description).toBe('Private until published');

    const listed = await request(app.getHttpServer()).get('/api/v1/directory');
    expect(listed.status).toBe(200);
    expect(
      listed.body.some((item: { slug: string }) => item.slug === created.body.slug),
    ).toBe(true);
    const publicRow = listed.body.find(
      (item: { slug: string }) => item.slug === created.body.slug,
    );
    expect(publicRow.members).toBeUndefined();

    const blocked = await outsider.agent
      .post(`/api/v1/conferences/${conferenceId}/tracks`)
      .set('x-csrf-token', outsider.csrf)
      .send({ name: 'Systems', code: 'SYS' });
    expect(blocked.status).toBe(403);

    const track = await chair.agent
      .post(`/api/v1/conferences/${conferenceId}/tracks`)
      .set('x-csrf-token', chair.csrf)
      .send({ name: 'Systems', code: 'sys' });
    expect(track.status).toBe(201);
    expect(track.body.code).toBe('SYS');

    const deadline = await chair.agent
      .post(`/api/v1/conferences/${conferenceId}/deadlines`)
      .set('x-csrf-token', chair.csrf)
      .send({
        kind: 'SUBMISSION',
        dueAt: '2027-03-01T23:59:00.000Z',
        trackId: track.body.id,
      });
    expect(deadline.status).toBe(201);

    const template = await chair.agent
      .post(`/api/v1/conferences/${conferenceId}/templates`)
      .set('x-csrf-token', chair.csrf)
      .send({
        kind: 'DECISION_LETTER',
        language: 'en',
        subject: 'Decision',
        body: 'The committee has recorded a decision.',
      });
    expect(template.status).toBe(201);

    const invited = await chair.agent
      .post(`/api/v1/conferences/${conferenceId}/invitations`)
      .set('x-csrf-token', chair.csrf)
      .send({ email: authorAddress, role: 'AUTHOR' });
    expect(invited.status).toBe(202);
    const inviteToken = decodeURIComponent(
      email.sent.at(-1)?.text.match(/token=([^&\s]+)/)?.[1] ?? '',
    );

    const before = await outsider.agent.get(`/api/v1/conferences/${conferenceId}`);
    expect(before.status).toBe(200);
    expect(before.body.members).toEqual([]);
    expect(before.body.templates).toEqual([]);

    const accepted = await outsider.agent
      .post('/api/v1/invitations/accept')
      .set('x-csrf-token', outsider.csrf)
      .send({ token: inviteToken });
    expect(accepted.status).toBe(204);

    const after = await outsider.agent.get(`/api/v1/conferences/${conferenceId}`);
    expect(after.body.myMembership.role).toBe('AUTHOR');
    expect(after.body.members).toEqual([]);
    expect(after.body.deadlines).toHaveLength(1);

    const reused = await outsider.agent
      .post('/api/v1/invitations/accept')
      .set('x-csrf-token', outsider.csrf)
      .send({ token: inviteToken });
    expect(reused.status).toBe(404);
  });
});
