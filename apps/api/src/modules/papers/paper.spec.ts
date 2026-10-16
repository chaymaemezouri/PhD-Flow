import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../app.module.js';
import { configureApp } from '../../common/configure-app.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { EmailService } from '../auth/email.service.js';

const pdf = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF');

describe('papers', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let email: EmailService;
  const stamp = Date.now();
  const authorAddress = `author-${stamp}@paper.test`;
  const reviewerAddress = `reviewer-${stamp}@paper.test`;
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
      where: { slug: { startsWith: `papers-${stamp}` } },
    });
    await prisma.user.deleteMany({ where: { email: { endsWith: '@paper.test' } } });
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
    const token = decodeURIComponent(
      email.sent.at(-1)?.text.match(/token=([^&\s]+)/)?.[1] ?? '',
    );
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

  it('assigns a stable public id on submit and hides the file from other roles', async () => {
    const author = await account(authorAddress, 'Mary');
    await prisma.user.update({ where: { email: authorAddress }, data: { platformRole: 'SYSTEM_ADMIN' } });
    const created = await author.agent
      .post('/api/v1/conferences')
      .set('x-csrf-token', author.csrf)
      .send({ name: 'Paper Colloquium', shortName: `papers-${stamp}` });
    expect(created.status).toBe(201);
    const conferenceId = created.body.id as string;

    const reviewer = await account(reviewerAddress, 'Niels');
    await author.agent
      .post(`/api/v1/conferences/${conferenceId}/invitations`)
      .set('x-csrf-token', author.csrf)
      .send({ email: reviewerAddress, role: 'REVIEWER' });
    const invite = decodeURIComponent(
      email.sent.at(-1)?.text.match(/token=([^&\s]+)/)?.[1] ?? '',
    );
    await reviewer.agent
      .post('/api/v1/invitations/accept')
      .set('x-csrf-token', reviewer.csrf)
      .send({ token: invite });

    await prisma.user.update({
      where: { email: authorAddress },
      data: { platformRole: 'RESEARCHER' },
    });
    const authorUser = await prisma.user.findUniqueOrThrow({ where: { email: authorAddress } });
    await prisma.membership.update({
      where: {
        conferenceId_userId: { conferenceId, userId: authorUser.id },
      },
      data: { role: 'AUTHOR' },
    });

    const draft = await author.agent
      .post(`/api/v1/conferences/${conferenceId}/papers`)
      .set('x-csrf-token', author.csrf)
      .send({
        title: 'A note on tides',
        abstract: 'This abstract is long enough to submit.',
        authors: [
          {
            firstName: 'Mary',
            lastName: 'Tester',
            email: authorAddress,
            affiliation: 'Lab',
            corresponding: true,
          },
        ],
      });
    expect(draft.status).toBe(201);
    expect(draft.body.publicId).toBeNull();
    expect(draft.body.status).toBe('DRAFT');
    const paperId = draft.body.id as string;

    const rejected = await author.agent
      .post(`/api/v1/papers/${paperId}/manuscript`)
      .set('x-csrf-token', author.csrf)
      .attach('manuscript', Buffer.from('hello'), {
        filename: 'notes.pdf',
        contentType: 'application/pdf',
      });
    expect(rejected.status).toBe(400);

    const uploaded = await author.agent
      .post(`/api/v1/papers/${paperId}/manuscript`)
      .set('x-csrf-token', author.csrf)
      .attach('manuscript', pdf, {
        filename: 'tides.pdf',
        contentType: 'application/pdf',
      });
    expect(uploaded.status).toBe(201);
    expect(uploaded.body.manuscript.originalName).toBe('tides.pdf');
    expect(uploaded.body.manuscript.storageKey).toBeUndefined();

    const submitted = await author.agent
      .post(`/api/v1/papers/${paperId}/submit`)
      .set('x-csrf-token', author.csrf)
      .send({});
    expect(submitted.status).toBe(201);
    expect(submitted.body.publicId).toMatch(
      new RegExp(`PAPERS-${stamp}-\\d{4}-0001`, 'i'),
    );
    expect(submitted.body.status).toBe('SUBMITTED');

    const frozen = await author.agent
      .patch(`/api/v1/papers/${paperId}`)
      .set('x-csrf-token', author.csrf)
      .send({ title: 'Changed after submit' });
    expect(frozen.status).toBe(403);

    const hidden = await reviewer.agent.get(`/api/v1/papers/${paperId}`);
    expect(hidden.status).toBe(404);
    const hiddenFile = await reviewer.agent.get(`/api/v1/papers/${paperId}/manuscript`);
    expect(hiddenFile.status).toBe(404);

    const download = await author.agent.get(`/api/v1/papers/${paperId}/manuscript`);
    expect(download.status).toBe(200);
    expect(download.headers['content-type']).toContain('application/pdf');
    expect(download.body.toString('utf8')).toContain('%PDF-');

    const withdrawn = await author.agent
      .post(`/api/v1/papers/${paperId}/withdraw`)
      .set('x-csrf-token', author.csrf)
      .send({ reason: 'Submitted to the wrong track' });
    expect(withdrawn.status).toBe(201);
    expect(withdrawn.body.status).toBe('WITHDRAWN');
    expect(withdrawn.body.publicId).toBe(submitted.body.publicId);

    const again = await author.agent
      .post(`/api/v1/papers/${paperId}/submit`)
      .set('x-csrf-token', author.csrf)
      .send({});
    expect(again.status).toBe(403);
  });

  it('refuses submission after the deadline', async () => {
    const lateAddress = `late-${stamp}@paper.test`;
    const author = await account(lateAddress, 'Late');
    await prisma.user.update({
      where: { email: lateAddress },
      data: { platformRole: 'SYSTEM_ADMIN' },
    });
    const created = await author.agent
      .post('/api/v1/conferences')
      .set('x-csrf-token', author.csrf)
      .send({ name: 'Closed Colloquium', shortName: `papers-${stamp}-late` });
    expect(created.status).toBe(201);
    const conferenceId = created.body.id as string;
    await author.agent
      .post(`/api/v1/conferences/${conferenceId}/deadlines`)
      .set('x-csrf-token', author.csrf)
      .send({ kind: 'SUBMISSION', dueAt: '2020-01-01T00:00:00.000Z', trackId: null });
    await prisma.user.update({
      where: { email: lateAddress },
      data: { platformRole: 'RESEARCHER' },
    });
    const lateUser = await prisma.user.findUniqueOrThrow({ where: { email: lateAddress } });
    await prisma.membership.update({
      where: {
        conferenceId_userId: { conferenceId, userId: lateUser.id },
      },
      data: { role: 'AUTHOR' },
    });
    const draft = await author.agent
      .post(`/api/v1/conferences/${conferenceId}/papers`)
      .set('x-csrf-token', author.csrf)
      .send({
        title: 'Too late',
        abstract: 'This abstract is long enough to submit.',
      });
    expect(draft.status).toBe(201);
    const paperId = draft.body.id as string;
    await author.agent
      .post(`/api/v1/papers/${paperId}/manuscript`)
      .set('x-csrf-token', author.csrf)
      .attach('manuscript', pdf, {
        filename: 'late.pdf',
        contentType: 'application/pdf',
      });
    const submitted = await author.agent
      .post(`/api/v1/papers/${paperId}/submit`)
      .set('x-csrf-token', author.csrf)
      .send({});
    expect(submitted.status).toBe(403);
  });
});
