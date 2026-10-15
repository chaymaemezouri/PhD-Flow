import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../app.module.js';
import { configureApp } from '../../common/configure-app.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { EmailService } from '../auth/email.service.js';

const pdf = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF');

describe('review assignments', () => {
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
      where: { slug: { startsWith: `reviews-${stamp}` } },
    });
    await prisma.user.deleteMany({ where: { email: { endsWith: '@review.test' } } });
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

  it('blocks conflicts, hides reviewers from authors, and hides authors from double-blind reviewers', async () => {
    const chair = await account(`chair-${stamp}@review.test`, 'Grace');
    const author = await account(`author-${stamp}@review.test`, 'Mary');
    const reviewer = await account(`reviewer-${stamp}@review.test`, 'Niels');
    const created = await chair.agent
      .post('/api/v1/conferences')
      .set('x-csrf-token', chair.csrf)
      .send({ name: 'Review Colloquium', shortName: `reviews-${stamp}` });
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
    await join(author, `author-${stamp}@review.test`, 'AUTHOR');
    await join(reviewer, `reviewer-${stamp}@review.test`, 'REVIEWER');

    const draft = await author.agent
      .post(`/api/v1/conferences/${conferenceId}/papers`)
      .set('x-csrf-token', author.csrf)
      .send({
        title: 'Tides and harbours',
        abstract: 'This abstract is long enough to submit.',
      });
    const paperId = draft.body.id as string;
    await author.agent
      .post(`/api/v1/papers/${paperId}/manuscript`)
      .set('x-csrf-token', author.csrf)
      .attach('manuscript', pdf, {
        filename: 'mary-tides.pdf',
        contentType: 'application/pdf',
      });
    const submitted = await author.agent
      .post(`/api/v1/papers/${paperId}/submit`)
      .set('x-csrf-token', author.csrf)
      .send({});
    expect(submitted.status).toBe(201);

    const reviewerUser = await prisma.user.findUniqueOrThrow({
      where: { email: `reviewer-${stamp}@review.test` },
    });
    await chair.agent
      .post(`/api/v1/conferences/${conferenceId}/conflicts`)
      .set('x-csrf-token', chair.csrf)
      .send({ userId: reviewerUser.id, paperId, reason: 'Same laboratory' });
    const blocked = await chair.agent
      .post(`/api/v1/papers/${paperId}/assignments`)
      .set('x-csrf-token', chair.csrf)
      .send({ reviewerId: reviewerUser.id });
    expect(blocked.status).toBe(409);

    await prisma.conflictDeclaration.deleteMany({ where: { paperId } });
    const invited = await chair.agent
      .post(`/api/v1/papers/${paperId}/assignments`)
      .set('x-csrf-token', chair.csrf)
      .send({ reviewerId: reviewerUser.id });
    expect(invited.status).toBe(201);
    const duplicate = await chair.agent
      .post(`/api/v1/papers/${paperId}/assignments`)
      .set('x-csrf-token', chair.csrf)
      .send({ reviewerId: reviewerUser.id });
    expect(duplicate.status).toBe(409);

    const before = await reviewer.agent.get(`/api/v1/papers/${paperId}`);
    expect(before.status).toBe(404);

    const mine = await reviewer.agent.get('/api/v1/reviews/mine');
    expect(mine.body[0].status).toBe('INVITED');
    const accepted = await reviewer.agent
      .post(`/api/v1/assignments/${mine.body[0].id}/accept`)
      .set('x-csrf-token', reviewer.csrf)
      .send({});
    expect(accepted.status).toBe(204);

    const seen = await reviewer.agent.get(`/api/v1/papers/${paperId}`);
    expect(seen.status).toBe(200);
    expect(seen.body.authors).toEqual([]);
    expect(seen.body.manuscript.originalName).toBe('manuscript.pdf');

    const authorView = await author.agent.get(`/api/v1/papers/${paperId}/assignments`);
    expect(authorView.body[0].reviewerId).toBeNull();
    const chairView = await chair.agent.get(`/api/v1/papers/${paperId}/assignments`);
    expect(chairView.body[0].reviewerId).toBe(reviewerUser.id);

    const directory = await chair.agent.get(
      `/api/v1/conferences/${conferenceId}/reviewers`,
    );
    expect(
      directory.body.some((item: { userId: string }) => item.userId === reviewerUser.id),
    ).toBe(true);
  });
});
