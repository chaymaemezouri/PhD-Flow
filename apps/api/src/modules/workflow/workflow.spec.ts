import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../app.module.js';
import { configureApp } from '../../common/configure-app.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { EmailService } from '../auth/email.service.js';

const pdf = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF');

describe('publication workflow', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let email: EmailService;
  const stamp = Date.now();
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
      where: { slug: { startsWith: `workflow-${stamp}` } },
    });
    await prisma.user.deleteMany({ where: { email: { endsWith: '@workflow.test' } } });
    await prisma.emailOutbox.deleteMany({ where: { recipient: 'retry@workflow.test' } });
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

  it('publishes a decision, then requires a verified similarity report under 20 percent', async () => {
    const chair = await account(`chair-${stamp}@workflow.test`, 'Ada');
    const author = await account(`author-${stamp}@workflow.test`, 'Grace');
    const reviewer = await account(`reviewer-${stamp}@workflow.test`, 'Niels');
    await prisma.user.update({
      where: { email: `chair-${stamp}@workflow.test` },
      data: { platformRole: 'SYSTEM_ADMIN' },
    });
    const created = await chair.agent
      .post('/api/v1/conferences')
      .set('x-csrf-token', chair.csrf)
      .send({ name: 'Workflow Colloquium', shortName: `workflow-${stamp}` });
    await prisma.user.update({
      where: { email: `chair-${stamp}@workflow.test` },
      data: { platformRole: 'RESEARCHER' },
    });
    expect(created.status).toBe(201);
    const conferenceId = created.body.id as string;

    async function join(
      who: { agent: request.Agent; csrf: string },
      address: string,
      role: string,
    ) {
      await chair.agent
        .post(`/api/v1/conferences/${conferenceId}/invitations`)
        .set('x-csrf-token', chair.csrf)
        .send({ email: address, role });
      const token = decodeURIComponent(
        email.sent.at(-1)?.text.match(/token=([^&\s]+)/)?.[1] ?? '',
      );
      await who.agent
        .post('/api/v1/invitations/accept')
        .set('x-csrf-token', who.csrf)
        .send({ token });
    }
    await join(author, `author-${stamp}@workflow.test`, 'AUTHOR');
    await join(reviewer, `reviewer-${stamp}@workflow.test`, 'REVIEWER');

    const draft = await author.agent
      .post(`/api/v1/conferences/${conferenceId}/papers`)
      .set('x-csrf-token', author.csrf)
      .send({
        title: 'Harbour tides',
        abstract: 'This abstract is long enough to submit.',
      });
    const paperId = draft.body.id as string;
    await author.agent
      .post(`/api/v1/papers/${paperId}/manuscript`)
      .set('x-csrf-token', author.csrf)
      .attach('manuscript', pdf, {
        filename: 'tides.pdf',
        contentType: 'application/pdf',
      });
    const submitted = await author.agent
      .post(`/api/v1/papers/${paperId}/submit`)
      .set('x-csrf-token', author.csrf)
      .send({});
    expect(submitted.status).toBe(201);

    const scoped = await chair.agent
      .post(`/api/v1/papers/${paperId}/scope`)
      .set('x-csrf-token', chair.csrf)
      .send({ accept: true });
    expect(scoped.status).toBe(201);

    const reviewerUser = await prisma.user.findUniqueOrThrow({
      where: { email: `reviewer-${stamp}@workflow.test` },
    });
    const invited = await chair.agent
      .post(`/api/v1/papers/${paperId}/assignments`)
      .set('x-csrf-token', chair.csrf)
      .send({ reviewerId: reviewerUser.id });
    expect(invited.status).toBe(201);
    const mine = await reviewer.agent.get('/api/v1/reviews/mine');
    const assignmentId = mine.body[0].id as string;
    await reviewer.agent
      .post(`/api/v1/assignments/${assignmentId}/accept`)
      .set('x-csrf-token', reviewer.csrf)
      .send({});
    const reviewed = await reviewer.agent
      .post(`/api/v1/assignments/${assignmentId}/review`)
      .set('x-csrf-token', reviewer.csrf)
      .send({
        recommendation: 'ACCEPT',
        score: 8,
        confidence: 4,
        commentsToAuthor: 'The measurements are clear and complete.',
        commentsToCommittee: 'No conflict found.',
      });
    expect(reviewed.status).toBe(204);

    const stats = await chair.agent.get(`/api/v1/conferences/${conferenceId}/statistics`);
    expect(stats.status).toBe(200);
    expect(stats.body.averageScore).toBe(8);
    expect(stats.body.openReviews).toBe(0);
    const hiddenStats = await author.agent.get(
      `/api/v1/conferences/${conferenceId}/statistics`,
    );
    expect(hiddenStats.status).toBe(404);

    const blocked = await author.agent
      .post(`/api/v1/papers/${paperId}/decision`)
      .set('x-csrf-token', author.csrf)
      .send({
        outcome: 'ACCEPTED',
        letter: 'This letter is long enough to publish.',
        publish: true,
      });
    expect(blocked.status).toBe(404);

    const decision = await chair.agent
      .post(`/api/v1/papers/${paperId}/decision`)
      .set('x-csrf-token', chair.csrf)
      .send({
        outcome: 'ACCEPTED',
        letter: 'Please send the camera-ready file and the copyright form.',
        publish: true,
      });
    expect(decision.status).toBe(201);

    const follow = await author.agent.get(`/api/v1/papers/${paperId}/follow-up`);
    expect(follow.body.decision.outcome).toBe('ACCEPTED');
    expect(
      follow.body.versions.some((item: { kind: string }) => item.kind === 'MANUSCRIPT'),
    ).toBe(true);
    expect(follow.body.checklist.similarityOk).toBe(false);
    expect(follow.body.canManage).toBe(false);

    const template = await author.agent.get(
      `/api/v1/conferences/${conferenceId}/copyright-template`,
    );
    expect(template.status).toBe(200);
    expect(template.body.subject.length).toBeGreaterThan(0);

    // Similarity opens only after presentation + camera-ready are validated.
    const authorUser = await prisma.user.findUniqueOrThrow({
      where: { email: `author-${stamp}@workflow.test` },
    });
    await prisma.registration.upsert({
      where: {
        conferenceId_userId: {
          conferenceId,
          userId: authorUser.id,
        },
      },
      create: {
        conferenceId,
        userId: authorUser.id,
        status: 'VERIFIED',
        paymentStatus: 'NOT_REQUIRED',
      },
      update: {
        status: 'VERIFIED',
        paymentStatus: 'NOT_REQUIRED',
      },
    });
    await prisma.paper.update({
      where: { id: paperId },
      data: {
        slidesStatus: 'VALIDATED',
        cameraReadyStatus: 'VALIDATED',
        presentedAt: new Date(),
      },
    });

    const atThreshold = await author.agent
      .post(`/api/v1/papers/${paperId}/similarity`)
      .set('x-csrf-token', author.csrf)
      .send({ percentage: 20, note: '' });
    expect(atThreshold.status).toBe(400);

    await author.agent
      .post(`/api/v1/papers/${paperId}/similarity`)
      .set('x-csrf-token', author.csrf)
      .send({ percentage: 12.5, note: '' });
    const missingFile = await chair.agent
      .post(`/api/v1/papers/${paperId}/similarity/verify`)
      .set('x-csrf-token', chair.csrf)
      .send({});
    expect(missingFile.status).toBe(403);

    const uploaded = await author.agent
      .post(`/api/v1/papers/${paperId}/similarity-report`)
      .set('x-csrf-token', author.csrf)
      .attach('file', pdf, {
        filename: 'similarity.pdf',
        contentType: 'application/pdf',
      });
    expect(uploaded.status).toBe(201);
    const verified = await chair.agent
      .post(`/api/v1/papers/${paperId}/similarity/verify`)
      .set('x-csrf-token', chair.csrf)
      .send({});
    expect(verified.status).toBe(201);

    const ready = await author.agent.get(`/api/v1/papers/${paperId}/follow-up`);
    expect(ready.body.similarity.satisfied).toBe(true);
    expect(ready.body.similarity.verified).toBe(true);
    expect(ready.body.checklist.similarityOk).toBe(true);
    expect(ready.body.checklist.ready).toBe(false);
    expect(
      ready.body.versions.some((item: { kind: string }) => item.kind === 'SIMILARITY'),
    ).toBe(true);
  });

  it('redelivers a failed outbox message that still has a subject', async () => {
    const id = await email.enqueue('retry@workflow.test', 'decision.letter');
    await prisma.emailOutbox.update({
      where: { id },
      data: {
        status: 'FAILED',
        subject: 'Decision on your paper',
        body: 'The letter is ready to read.',
        attempts: 1,
      },
    });
    const count = await email.retryFailed();
    expect(count).toBeGreaterThanOrEqual(1);
    const row = await prisma.emailOutbox.findUniqueOrThrow({ where: { id } });
    expect(row.status).toBe('SENT');
    expect(email.sent.some((message) => message.to === 'retry@workflow.test')).toBe(true);
  });
});
