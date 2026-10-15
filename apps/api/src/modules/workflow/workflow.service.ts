import { createHash, randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  decisionSchema,
  presentationSchema,
  roomSchema,
  sessionSchema,
  similaritySchema,
} from '@scholarflow/validation';
import type { z } from 'zod';
import {
  ConferenceRole,
  CopyrightStatus,
  DecisionOutcome,
  DecisionStatus,
  MembershipStatus,
  PaperFileKind,
  PaperStatus,
  PaymentStatus,
  PlatformRole,
  RegistrationStatus,
} from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { EmailService } from '../auth/email.service.js';
import { ObjectStorage } from '../papers/object-storage.js';

const CHAIRS = new Set<ConferenceRole>([ConferenceRole.CHAIR, ConferenceRole.ADMINISTRATOR]);
const ACCEPTED = new Set<DecisionOutcome>([
  DecisionOutcome.ACCEPTED,
  DecisionOutcome.CONDITIONALLY_ACCEPTED,
]);

type DecisionInput = z.infer<typeof decisionSchema>;
type SimilarityInput = z.infer<typeof similaritySchema>;
type RoomInput = z.infer<typeof roomSchema>;
type SessionInput = z.infer<typeof sessionSchema>;
type PresentationInput = z.infer<typeof presentationSchema>;

interface Upload {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

@Injectable()
export class WorkflowService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: ObjectStorage,
    private readonly email: EmailService,
  ) {}

  async search(actor: AuthenticatedUser, query: string) {
    const needle = query.trim();
    if (needle.length < 2) {
      return { papers: [], conferences: [], reviews: [] };
    }
    const [papers, conferences, reviews] = await Promise.all([
      this.prisma.paper.findMany({
        where: {
          OR: [{ createdById: actor.id }, { authors: { some: { email: actor.email } } }],
          title: { contains: needle, mode: 'insensitive' },
        },
        take: 8,
        select: { id: true, title: true, publicId: true, status: true },
      }),
      this.prisma.conference.findMany({
        where: {
          name: { contains: needle, mode: 'insensitive' },
          OR: [
            { status: 'PUBLISHED', visibility: 'PUBLIC' },
            { memberships: { some: { userId: actor.id, status: MembershipStatus.ACTIVE } } },
          ],
        },
        take: 8,
        select: { id: true, name: true, slug: true },
      }),
      this.prisma.reviewAssignment.findMany({
        where: {
          reviewerId: actor.id,
          paper: { title: { contains: needle, mode: 'insensitive' } },
        },
        take: 8,
        include: { paper: { select: { title: true, publicId: true } } },
      }),
    ]);
    return {
      papers,
      conferences,
      reviews: reviews.map((row) => ({
        id: row.id,
        title: row.paper.title,
        publicId: row.paper.publicId,
        status: row.status,
      })),
    };
  }

  async followUp(actor: AuthenticatedUser, paperId: string) {
    const paper = await this.loadPaper(paperId);
    this.assertReader(actor, paper);
    const published = paper.decision?.status === DecisionStatus.PUBLISHED ? paper.decision : null;
    const chair = this.isChair(actor, paper.conference.memberships);
    return {
      paperId: paper.id,
      conferenceId: paper.conferenceId,
      canManage: chair,
      title: paper.title,
      publicId: paper.publicId,
      status: paper.status,
      decision: chair ? paper.decision : published,
      similarity: paper.similarity
        ? {
            percentage: paper.similarity.percentage,
            satisfied: paper.similarity.percentage < 20 && paper.similarity.verifiedAt !== null,
            verified: paper.similarity.verifiedAt !== null,
            note: paper.similarity.note,
          }
        : null,
      copyright: paper.copyright?.status ?? null,
      doi: paper.doi,
      versions: [...paper.files]
        .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime())
        .map((file) => ({
          id: file.id,
          kind: file.kind,
          createdAt: file.createdAt.toISOString(),
        })),
      checklist: this.checklist(paper),
    };
  }

  async saveDecision(actor: AuthenticatedUser, paperId: string, input: DecisionInput) {
    const paper = await this.loadPaper(paperId);
    this.assertChair(actor, paper.conference.memberships);
    if (paper.status !== PaperStatus.SUBMITTED) {
      throw new ForbiddenException('Only a submitted paper can receive a decision');
    }
    const decision = await this.prisma.decision.upsert({
      where: { paperId },
      create: {
        paperId,
        outcome: input.outcome,
        letter: input.letter,
        status: input.publish ? DecisionStatus.PUBLISHED : DecisionStatus.DRAFT,
        publishedAt: input.publish ? new Date() : null,
        decidedById: actor.id,
      },
      update: {
        outcome: input.outcome,
        letter: input.letter,
        status: input.publish ? DecisionStatus.PUBLISHED : DecisionStatus.DRAFT,
        publishedAt: input.publish ? new Date() : null,
        decidedById: actor.id,
      },
    });
    if (input.publish) {
      await this.notifyAuthors(paper, 'Decision on your paper', input.letter);
    }
    return decision;
  }

  async storeFile(
    actor: AuthenticatedUser,
    paperId: string,
    kind: 'REVISION' | 'CAMERA_READY' | 'EDITABLE' | 'COPYRIGHT' | 'SIMILARITY',
    file: Upload,
  ) {
    const paper = await this.loadPaper(paperId);
    this.assertAuthor(actor, paper);
    if (paper.status === PaperStatus.WITHDRAWN) {
      throw new ForbiddenException('A withdrawn paper cannot receive a new file');
    }
    const outcome = paper.decision?.status === DecisionStatus.PUBLISHED ? paper.decision.outcome : null;
    if (kind === 'REVISION' && outcome !== DecisionOutcome.REVISION_REQUIRED) {
      throw new ForbiddenException('A revision file is allowed after a revision decision');
    }
    if (
      (kind === 'CAMERA_READY' || kind === 'EDITABLE' || kind === 'COPYRIGHT' || kind === 'SIMILARITY') &&
      (!outcome || !ACCEPTED.has(outcome))
    ) {
      throw new ForbiddenException('This file is allowed after acceptance');
    }
    if (!file?.buffer) {
      throw new BadRequestException('Upload a PDF of at most 20 MB');
    }
    this.assertPdf(file);
    const key = `conferences/${paper.conferenceId}/papers/${paper.id}/${kind.toLowerCase()}-${randomUUID()}.pdf`;
    await this.storage.put(key, file.buffer, 'application/pdf');
    await this.prisma.paperFile.create({
      data: {
        paperId,
        kind: PaperFileKind[kind],
        storageKey: key,
        originalName: 'document.pdf',
        contentType: 'application/pdf',
        sizeBytes: file.size,
        sha256: createHash('sha256').update(file.buffer).digest('hex'),
        uploadedById: actor.id,
      },
    });
    if (kind === 'COPYRIGHT') {
      await this.prisma.copyrightRecord.upsert({
        where: { paperId },
        create: { paperId, status: CopyrightStatus.PENDING },
        update: { status: CopyrightStatus.PENDING },
      });
    }
  }

  async saveSimilarity(actor: AuthenticatedUser, paperId: string, input: SimilarityInput) {
    const paper = await this.loadPaper(paperId);
    this.assertAuthor(actor, paper);
    const outcome = paper.decision?.status === DecisionStatus.PUBLISHED ? paper.decision.outcome : null;
    if (!outcome || !ACCEPTED.has(outcome)) {
      throw new ForbiddenException('A similarity report follows acceptance');
    }
    return this.prisma.similarityReport.upsert({
      where: { paperId },
      create: { paperId, percentage: input.percentage, note: input.note, verifiedAt: null },
      update: { percentage: input.percentage, note: input.note, verifiedAt: null },
    });
  }

  async validateTemplate(actor: AuthenticatedUser, paperId: string) {
    const paper = await this.loadPaper(paperId);
    this.assertChair(actor, paper.conference.memberships);
    return this.prisma.paper.update({
      where: { id: paperId },
      data: { templateValidatedAt: new Date() },
      select: { id: true, templateValidatedAt: true },
    });
  }

  async verifySimilarity(actor: AuthenticatedUser, paperId: string) {
    const paper = await this.loadPaper(paperId);
    this.assertChair(actor, paper.conference.memberships);
    if (!paper.similarity) {
      throw new NotFoundException('Similarity report not found');
    }
    if (paper.similarity.percentage >= 20) {
      throw new ForbiddenException('20 percent is not under the threshold');
    }
    const reportFile = paper.files.some((file) => file.kind === PaperFileKind.SIMILARITY);
    if (!reportFile) {
      throw new ForbiddenException('Upload the similarity report before verification');
    }
    return this.prisma.similarityReport.update({
      where: { paperId },
      data: { verifiedAt: new Date() },
    });
  }

  async copyrightTemplate(actor: AuthenticatedUser, conferenceId: string) {
    const conference = await this.prisma.conference.findUnique({
      where: { id: conferenceId },
      include: { memberships: true, templates: true },
    });
    if (!conference) {
      throw new NotFoundException('Conference not found');
    }
    const member = conference.memberships.some(
      (item) => item.userId === actor.id && item.status === MembershipStatus.ACTIVE,
    );
    if (!member && actor.platformRole !== PlatformRole.SYSTEM_ADMIN) {
      throw new NotFoundException('Conference not found');
    }
    const template = conference.templates.find((item) => item.kind === 'COPYRIGHT');
    return {
      subject: template?.subject ?? 'Copyright transfer',
      body:
        template?.body ??
        'I transfer the publication rights for the accepted paper to the conference and confirm the work is original.',
    };
  }

  async validateCopyright(actor: AuthenticatedUser, paperId: string, accept: boolean) {
    const paper = await this.loadPaper(paperId);
    this.assertChair(actor, paper.conference.memberships);
    if (!paper.copyright) {
      throw new NotFoundException('Copyright file not found');
    }
    return this.prisma.copyrightRecord.update({
      where: { paperId },
      data: { status: accept ? CopyrightStatus.VALIDATED : CopyrightStatus.REJECTED },
    });
  }

  async register(actor: AuthenticatedUser, conferenceId: string) {
    const conference = await this.prisma.conference.findUnique({ where: { id: conferenceId } });
    if (!conference || conference.status !== 'PUBLISHED') {
      throw new NotFoundException('Conference not found');
    }
    return this.prisma.registration.upsert({
      where: { conferenceId_userId: { conferenceId, userId: actor.id } },
      create: {
        conferenceId,
        userId: actor.id,
        paymentStatus: conference.paymentsEnabled ? PaymentStatus.PENDING : PaymentStatus.NOT_REQUIRED,
      },
      update: {},
    });
  }

  async verifyRegistration(actor: AuthenticatedUser, conferenceId: string, userId: string) {
    const conference = await this.loadConference(conferenceId);
    this.assertChair(actor, conference.memberships);
    const row = await this.prisma.registration.findUnique({
      where: { conferenceId_userId: { conferenceId, userId } },
    });
    if (!row) {
      throw new NotFoundException('Registration not found');
    }
    if (row.paymentStatus === PaymentStatus.PENDING) {
      throw new ForbiddenException('The registration fee is still unpaid');
    }
    return this.prisma.registration.update({
      where: { id: row.id },
      data: { status: RegistrationStatus.VERIFIED },
    });
  }

  async pay(actor: AuthenticatedUser, conferenceId: string) {
    const conference = await this.loadConference(conferenceId);
    const row = await this.prisma.registration.findUnique({
      where: { conferenceId_userId: { conferenceId, userId: actor.id } },
    });
    if (!row) {
      throw new NotFoundException('Register before paying');
    }
    if (!conference.paymentsEnabled && row.paymentStatus !== PaymentStatus.PENDING) {
      throw new ForbiddenException('Payment is not required');
    }
    return this.prisma.registration.update({
      where: { id: row.id },
      data: { paymentStatus: PaymentStatus.VERIFIED, status: RegistrationStatus.VERIFIED },
    });
  }

  async addRoom(actor: AuthenticatedUser, conferenceId: string, input: RoomInput) {
    const conference = await this.loadConference(conferenceId);
    this.assertChair(actor, conference.memberships);
    return this.prisma.room.create({ data: { conferenceId, name: input.name, capacity: input.capacity } });
  }

  async program(actor: AuthenticatedUser, conferenceId: string) {
    const conference = await this.loadConference(conferenceId);
    const member = conference.memberships.some(
      (item) => item.userId === actor.id && item.status === MembershipStatus.ACTIVE,
    );
    if (!member && actor.platformRole !== PlatformRole.SYSTEM_ADMIN) {
      throw new NotFoundException('Conference not found');
    }
    const [sessions, rooms] = await Promise.all([
      this.prisma.programSession.findMany({
        where: { conferenceId },
        include: { room: true, presentations: { include: { paper: { select: { title: true, publicId: true } } } } },
        orderBy: { startsAt: 'asc' },
      }),
      this.prisma.room.findMany({ where: { conferenceId }, orderBy: { name: 'asc' } }),
    ]);
    return { sessions, rooms };
  }

  async publishDoi(actor: AuthenticatedUser, paperId: string) {
    const paper = await this.loadPaper(paperId);
    this.assertChair(actor, paper.conference.memberships);
    if (!this.checklist(paper).ready) {
      throw new ForbiddenException('The paper is not ready to publish');
    }
    if (paper.doi) {
      return { doi: paper.doi };
    }
    const slug = (paper.publicId ?? paper.id).toLowerCase();
    const doi = `10.5555/scholarflow.${slug}`;
    await this.prisma.paper.update({ where: { id: paper.id }, data: { doi } });
    return { doi };
  }

  async addSession(actor: AuthenticatedUser, conferenceId: string, input: SessionInput) {
    const conference = await this.loadConference(conferenceId);
    this.assertChair(actor, conference.memberships);
    if (input.endsAt <= input.startsAt) {
      throw new BadRequestException('The session ends before it starts');
    }
    return this.prisma.programSession.create({
      data: {
        conferenceId,
        roomId: input.roomId,
        title: input.title,
        startsAt: new Date(input.startsAt),
        endsAt: new Date(input.endsAt),
      },
    });
  }

  async assignPresentation(
    actor: AuthenticatedUser,
    sessionId: string,
    input: PresentationInput,
  ) {
    const session = await this.prisma.programSession.findUnique({
      where: { id: sessionId },
      include: { conference: { include: { memberships: true } } },
    });
    if (!session) {
      throw new NotFoundException('Session not found');
    }
    this.assertChair(actor, session.conference.memberships);
    const paper = await this.loadPaper(input.paperId);
    if (paper.conferenceId !== session.conferenceId) {
      throw new ForbiddenException('The paper belongs to another conference');
    }
    const outcome = paper.decision?.status === DecisionStatus.PUBLISHED ? paper.decision.outcome : null;
    if (!outcome || !ACCEPTED.has(outcome)) {
      throw new ForbiddenException('Only an accepted paper can be scheduled');
    }
    return this.prisma.presentation.upsert({
      where: { paperId: input.paperId },
      create: { sessionId, paperId: input.paperId },
      update: { sessionId },
    });
  }

  async assessPresentation(
    actor: AuthenticatedUser,
    presentationId: string,
    input: { score: number; comment: string },
  ) {
    const row = await this.prisma.presentation.findUnique({
      where: { id: presentationId },
      include: { session: { include: { conference: { include: { memberships: true } } } } },
    });
    if (!row) {
      throw new NotFoundException('Presentation not found');
    }
    this.assertChair(actor, row.session.conference.memberships);
    return this.prisma.presentation.update({
      where: { id: presentationId },
      data: { score: input.score, comment: input.comment },
    });
  }

  async statistics(actor: AuthenticatedUser, conferenceId: string) {
    const conference = await this.loadConference(conferenceId);
    this.assertChair(actor, conference.memberships);
    const papers = await this.prisma.paper.groupBy({
      by: ['status'],
      where: { conferenceId },
      _count: { _all: true },
    });
    const forms = await this.prisma.reviewForm.findMany({
      where: { assignment: { paper: { conferenceId } } },
      select: { score: true, submittedAt: true, assignment: { select: { createdAt: true } } },
    });
    const averageScore =
      forms.length === 0
        ? null
        : Math.round((forms.reduce((sum, form) => sum + form.score, 0) / forms.length) * 10) / 10;
    const openReviews = await this.prisma.reviewAssignment.count({
      where: {
        paper: { conferenceId },
        status: { in: ['INVITED', 'ACCEPTED', 'IN_PROGRESS', 'OVERDUE'] },
      },
    });
    const overdueReviews = await this.prisma.reviewAssignment.count({
      where: { paper: { conferenceId }, status: 'OVERDUE' },
    });
    const late = forms.filter(
      (form) => form.submittedAt.getTime() - form.assignment.createdAt.getTime() > 14 * 24 * 60 * 60 * 1000,
    ).length;
    return {
      papersByStatus: Object.fromEntries(papers.map((row) => [row.status, row._count._all])),
      averageScore,
      openReviews,
      overdueReviews,
      lateReviews: late,
    };
  }

  async remind(actor: AuthenticatedUser, conferenceId: string) {
    const conference = await this.loadConference(conferenceId);
    this.assertChair(actor, conference.memberships);
    const open = await this.prisma.reviewAssignment.findMany({
      where: {
        paper: { conferenceId },
        status: { in: ['ACCEPTED', 'IN_PROGRESS', 'OVERDUE'] },
        form: null,
      },
      include: { reviewer: true, paper: true },
    });
    for (const row of open) {
      const outboxId = await this.email.enqueue(row.reviewer.email, 'review.reminder');
      await this.email.deliver(outboxId, {
        to: row.reviewer.email,
        subject: `Review reminder: ${row.paper.publicId ?? row.paper.title}`,
        text: 'Your review is still open. Sign in to ScholarFlow to send the score and comments.',
      });
    }
    return { sent: open.length };
  }

  async exportMetadata(actor: AuthenticatedUser, conferenceId: string) {
    const conference = await this.loadConference(conferenceId);
    this.assertChair(actor, conference.memberships);
    const papers = await this.prisma.paper.findMany({
      where: { conferenceId, status: PaperStatus.SUBMITTED },
      include: { authors: true, decision: true, similarity: true, copyright: true, files: true },
    });
    const header = 'publicId,title,outcome,similarity,copyright,ready';
    const lines = papers.map((paper) => {
      const ready = this.checklist(paper).ready;
      return [
        paper.publicId ?? '',
        `"${paper.title.replace(/"/g, '""')}"`,
        paper.decision?.status === DecisionStatus.PUBLISHED ? paper.decision.outcome : '',
        paper.similarity?.percentage ?? '',
        paper.copyright?.status ?? '',
        ready ? 'yes' : 'no',
      ].join(',');
    });
    return `${header}\n${lines.join('\n')}\n`;
  }

  private checklist(paper: {
    status: PaperStatus;
    decision: { status: DecisionStatus; outcome: DecisionOutcome } | null;
    similarity: { percentage: number; verifiedAt: Date | null } | null;
    copyright: { status: CopyrightStatus } | null;
    files: { kind: PaperFileKind }[];
  }) {
    const published = paper.decision?.status === DecisionStatus.PUBLISHED;
    const accepted = published && paper.decision ? ACCEPTED.has(paper.decision.outcome) : false;
    const cameraReady = paper.files.some((file) => file.kind === PaperFileKind.CAMERA_READY);
    const similarityOk =
      paper.similarity !== null &&
      paper.similarity.percentage < 20 &&
      paper.similarity.verifiedAt !== null;
    const copyrightOk = paper.copyright?.status === CopyrightStatus.VALIDATED;
    return {
      accepted,
      cameraReady,
      similarityOk,
      copyrightOk,
      ready: paper.status !== PaperStatus.WITHDRAWN && accepted && cameraReady && similarityOk && copyrightOk,
    };
  }

  private async notifyAuthors(
    paper: { authors: { email: string; corresponding: boolean }[]; title: string },
    subject: string,
    letter: string,
  ) {
    const recipients = paper.authors.filter((item) => item.corresponding);
    for (const author of recipients) {
      const outboxId = await this.email.enqueue(author.email, 'decision.letter');
      await this.email.deliver(outboxId, {
        to: author.email,
        subject: `${subject}: ${paper.title}`,
        text: letter,
      });
    }
  }

  private assertPdf(file: Upload) {
    const pdf = file.buffer.subarray(0, 5).toString('utf8') === '%PDF-';
    if (!pdf || file.size > 20 * 1024 * 1024) {
      throw new BadRequestException('Upload a PDF of at most 20 MB');
    }
  }

  private async loadPaper(id: string) {
    const paper = await this.prisma.paper.findUnique({
      where: { id },
      include: {
        authors: true,
        files: true,
        decision: true,
        similarity: true,
        copyright: true,
        conference: { include: { memberships: true } },
      },
    });
    if (!paper) {
      throw new NotFoundException('Paper not found');
    }
    return paper;
  }

  private async loadConference(id: string) {
    const conference = await this.prisma.conference.findUnique({
      where: { id },
      include: { memberships: true },
    });
    if (!conference) {
      throw new NotFoundException('Conference not found');
    }
    return conference;
  }

  private isChair(
    actor: AuthenticatedUser,
    memberships: { userId: string; role: ConferenceRole; status: MembershipStatus }[],
  ) {
    return (
      actor.platformRole === PlatformRole.SYSTEM_ADMIN ||
      memberships.some(
        (item) =>
          item.userId === actor.id &&
          item.status === MembershipStatus.ACTIVE &&
          CHAIRS.has(item.role),
      )
    );
  }

  private assertChair(
    actor: AuthenticatedUser,
    memberships: { userId: string; role: ConferenceRole; status: MembershipStatus }[],
  ) {
    if (!this.isChair(actor, memberships)) {
      throw new NotFoundException('Conference not found');
    }
  }

  private assertAuthor(
    actor: AuthenticatedUser,
    paper: { createdById: string; authors: { email: string }[] },
  ) {
    const author =
      paper.createdById === actor.id ||
      paper.authors.some((item) => item.email === actor.email.toLowerCase());
    if (!author) {
      throw new NotFoundException('Paper not found');
    }
  }

  private assertReader(
    actor: AuthenticatedUser,
    paper: {
      createdById: string;
      authors: { email: string }[];
      conference: { memberships: { userId: string; role: ConferenceRole; status: MembershipStatus }[] };
    },
  ) {
    if (this.isChair(actor, paper.conference.memberships)) {
      return;
    }
    this.assertAuthor(actor, paper);
  }
}
