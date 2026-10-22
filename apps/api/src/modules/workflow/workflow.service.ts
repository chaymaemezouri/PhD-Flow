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
  AssignmentStatus,
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
  CameraReadyStatus,
  CopyrightStageStatus,
  PresentationModality,
  RemarkStatus,
  SimilarityStatus,
  SlidesStatus,
} from '../../generated/prisma/client.js';
import { certificatePdf } from './certificate-pdf.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { EmailService } from '../auth/email.service.js';
import { ObjectStorage } from '../papers/object-storage.js';

/** Conference ops on papers: admin, under-admin, and programme committee. */
const CHAIRS = new Set<ConferenceRole>([
  ConferenceRole.CHAIR,
  ConferenceRole.ADMINISTRATOR,
  ConferenceRole.COMMITTEE,
]);
/** Final acceptance only — unlocks registration and later stages. */
const ACCEPTED = new Set<DecisionOutcome>([DecisionOutcome.ACCEPTED]);
const NEEDS_REVISION = new Set<DecisionOutcome>([
  DecisionOutcome.CONDITIONALLY_ACCEPTED,
  DecisionOutcome.REVISION_REQUIRED,
]);

type DecisionInput = z.infer<typeof decisionSchema>;
type RemarkStatusInput = 'OPEN' | 'ADDRESSED' | 'VALIDATED';
type SlidesDecisionInput = { outcome: 'VALIDATED' | 'NEEDS_MODS'; note: string };
type CameraReadyDecisionInput = { outcome: 'VALIDATED' | 'NEEDS_MODS'; note: string };
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
            {
              memberships: {
                some: { userId: actor.id, status: MembershipStatus.ACTIVE },
              },
            },
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
    const published =
      paper.decision?.status === DecisionStatus.PUBLISHED ? paper.decision : null;
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
            satisfied:
              paper.similarity.percentage < 20 && paper.similarity.verifiedAt !== null,
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
    const reviews = await this.prisma.reviewForm.count({
      where: { assignment: { paperId } },
    });
    if (reviews < 1) {
      throw new ForbiddenException('Wait for a review before the decision');
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
    if (input.publish && NEEDS_REVISION.has(input.outcome)) {
      await this.seedRevisionRemarks(paperId, input.letter);
    }
    if (input.publish) {
      await this.notifyAuthors(paper, 'Decision on your paper', input.letter);
    }
    return decision;
  }

  async updateRemark(
    actor: AuthenticatedUser,
    paperId: string,
    remarkId: string,
    status: RemarkStatusInput,
  ) {
    const paper = await this.loadPaper(paperId);
    const remark = await this.prisma.revisionRemark.findFirst({
      where: { id: remarkId, paperId },
    });
    if (!remark) {
      throw new NotFoundException('Remark not found');
    }
    const chair = this.isChair(actor, paper.conference.memberships);
    const author =
      paper.createdById === actor.id ||
      paper.authors.some((item) => item.email === actor.email.toLowerCase());
    if (status === 'VALIDATED' || (status === 'OPEN' && remark.status === RemarkStatus.VALIDATED)) {
      if (!chair) {
        throw new ForbiddenException('Only the committee can validate remarks');
      }
    } else if (status === 'ADDRESSED' || status === 'OPEN') {
      if (!author && !chair) {
        throw new ForbiddenException('Only the author can mark a remark as addressed');
      }
    } else {
      throw new BadRequestException('Unsupported remark status');
    }
    const outcome =
      paper.decision?.status === DecisionStatus.PUBLISHED ? paper.decision.outcome : null;
    if (!outcome || !NEEDS_REVISION.has(outcome)) {
      throw new ForbiddenException('Remarks can only change while a revision is open');
    }
    const updated = await this.prisma.revisionRemark.update({
      where: { id: remarkId },
      data: {
        status: RemarkStatus[status],
        addressedAt:
          status === 'ADDRESSED'
            ? new Date()
            : status === 'OPEN'
              ? null
              : remark.addressedAt,
        validatedAt: status === 'VALIDATED' ? new Date() : null,
        validatedById: status === 'VALIDATED' ? actor.id : null,
      },
    });
    if (status === 'VALIDATED') {
      await this.maybeAcceptAfterRemarks(paperId, actor.id);
    }
    return updated;
  }

  async storeFile(
    actor: AuthenticatedUser,
    paperId: string,
    kind:
      | 'REVISION'
      | 'CAMERA_READY'
      | 'EDITABLE'
      | 'COPYRIGHT'
      | 'SIMILARITY'
      | 'SLIDES'
      | 'PAYMENT_PROOF',
    file: Upload,
  ) {
    const paper = await this.loadPaper(paperId);
    this.assertAuthor(actor, paper);
    if (paper.status === PaperStatus.WITHDRAWN) {
      throw new ForbiddenException('A withdrawn paper cannot receive a new file');
    }
    const outcome =
      paper.decision?.status === DecisionStatus.PUBLISHED ? paper.decision.outcome : null;
    if (kind === 'REVISION' && (!outcome || !NEEDS_REVISION.has(outcome))) {
      throw new ForbiddenException(
        'A revision file is allowed after a revision decision',
      );
    }
    if (kind === 'SLIDES') {
      if (paper.slidesStatus === SlidesStatus.LOCKED) {
        await this.ensurePresentationOpen(paper);
        paper.slidesStatus = SlidesStatus.OPEN;
      }
      const slidesOk =
        paper.slidesStatus === SlidesStatus.OPEN ||
        paper.slidesStatus === SlidesStatus.DEPOSITED ||
        paper.slidesStatus === SlidesStatus.NEEDS_MODS ||
        paper.slidesStatus === SlidesStatus.WILL_DEPOSIT;
      if (!slidesOk) {
        throw new ForbiddenException(
          'Slides can be uploaded when presentation is open',
        );
      }
    } else if (kind === 'CAMERA_READY' || kind === 'EDITABLE') {
      if (paper.cameraReadyStatus === CameraReadyStatus.LOCKED) {
        await this.ensureCameraReadyOpen(paper);
        paper.cameraReadyStatus = CameraReadyStatus.OPEN;
      }
      const cameraOk =
        paper.cameraReadyStatus === CameraReadyStatus.OPEN ||
        paper.cameraReadyStatus === CameraReadyStatus.DEPOSITED ||
        paper.cameraReadyStatus === CameraReadyStatus.NEEDS_MODS ||
        paper.cameraReadyStatus === CameraReadyStatus.WILL_DEPOSIT;
      if (!cameraOk) {
        throw new ForbiddenException(
          'Camera-ready files can be uploaded when the stage is open',
        );
      }
    } else if (kind === 'SIMILARITY') {
      if (paper.similarityStatus === SimilarityStatus.LOCKED) {
        await this.ensureSimilarityOpen(paper);
        paper.similarityStatus = SimilarityStatus.OPEN;
      }
      const similarityOk =
        paper.similarityStatus === SimilarityStatus.OPEN ||
        paper.similarityStatus === SimilarityStatus.DEPOSITED;
      if (!similarityOk) {
        throw new ForbiddenException(
          'Similarity report can be uploaded when the stage is open',
        );
      }
    } else if (kind === 'COPYRIGHT') {
      if (paper.copyrightStageStatus === CopyrightStageStatus.LOCKED) {
        await this.ensureCopyrightOpen(paper);
        paper.copyrightStageStatus = CopyrightStageStatus.OPEN;
      }
      const copyrightOk =
        paper.copyrightStageStatus === CopyrightStageStatus.OPEN ||
        paper.copyrightStageStatus === CopyrightStageStatus.DEPOSITED;
      if (!copyrightOk) {
        throw new ForbiddenException(
          'Copyright form can be uploaded when the stage is open',
        );
      }
    } else if (kind !== 'REVISION' && (!outcome || !ACCEPTED.has(outcome))) {
      throw new ForbiddenException('This file is allowed after acceptance');
    }
    this.assertUpload(kind, file);
    const extension = fileExtension(file.originalname, kind);
    const key = `conferences/${paper.conferenceId}/papers/${paper.id}/${kind.toLowerCase()}-${randomUUID()}${extension}`;
    await this.storage.put(key, file.buffer, file.mimetype || 'application/octet-stream');
    await this.prisma.paperFile.create({
      data: {
        paperId,
        kind: PaperFileKind[kind],
        storageKey: key,
        originalName: safeUploadName(file.originalname),
        contentType: file.mimetype || 'application/octet-stream',
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
      if (paper.copyrightStageStatus !== CopyrightStageStatus.VALIDATED) {
        await this.prisma.paper.update({
          where: { id: paperId },
          data: { copyrightStageStatus: CopyrightStageStatus.DEPOSITED },
        });
      }
    }
    if (kind === 'PAYMENT_PROOF') {
      await this.prisma.registration.upsert({
        where: {
          conferenceId_userId: {
            conferenceId: paper.conferenceId,
            userId: paper.createdById,
          },
        },
        create: {
          conferenceId: paper.conferenceId,
          userId: paper.createdById,
          status: RegistrationStatus.REQUESTED,
          paymentStatus: PaymentStatus.PENDING,
        },
        update: {
          paymentStatus: PaymentStatus.PENDING,
        },
      });
    }
    if (kind === 'SLIDES') {
      const next =
        paper.slidesStatus === SlidesStatus.NEEDS_MODS
          ? SlidesStatus.WILL_DEPOSIT
          : SlidesStatus.DEPOSITED;
      await this.prisma.paper.update({
        where: { id: paperId },
        data: { slidesStatus: next },
      });
    }
    if (kind === 'CAMERA_READY' || kind === 'EDITABLE') {
      await this.refreshCameraReadyAfterUpload(paperId, paper.cameraReadyStatus);
    }
    if (kind === 'SIMILARITY') {
      await this.refreshSimilarityAfterDeposit(paperId);
    }
    if (kind === 'REVISION') {
      await this.prisma.reviewAssignment.updateMany({
        where: { paperId, status: AssignmentStatus.COMPLETED },
        data: { status: AssignmentStatus.IN_PROGRESS },
      });
    }
  }

  async decideSlides(
    actor: AuthenticatedUser,
    paperId: string,
    input: SlidesDecisionInput,
  ) {
    const paper = await this.loadPaper(paperId);
    this.assertChair(actor, paper.conference.memberships);
    if (
      paper.slidesStatus !== SlidesStatus.DEPOSITED &&
      paper.slidesStatus !== SlidesStatus.WILL_DEPOSIT &&
      paper.slidesStatus !== SlidesStatus.NEEDS_MODS
    ) {
      throw new ForbiddenException('Wait for the author to deposit the slides');
    }
    if (!paper.files.some((file) => file.kind === PaperFileKind.SLIDES)) {
      throw new BadRequestException('No slides file found');
    }
    if (input.outcome === 'VALIDATED') {
      const updated = await this.prisma.paper.update({
        where: { id: paperId },
        data: {
          slidesStatus: SlidesStatus.VALIDATED,
          sessionComment: input.note || paper.sessionComment,
          cameraReadyStatus:
            paper.cameraReadyStatus === CameraReadyStatus.LOCKED
              ? CameraReadyStatus.OPEN
              : paper.cameraReadyStatus,
        },
      });
      return updated;
    }
    await this.seedPresentationRemarks(paperId, input.note);
    return this.prisma.paper.update({
      where: { id: paperId },
      data: {
        slidesStatus: SlidesStatus.NEEDS_MODS,
        sessionComment: input.note || paper.sessionComment,
      },
    });
  }

  async decideCameraReady(
    actor: AuthenticatedUser,
    paperId: string,
    input: CameraReadyDecisionInput,
  ) {
    const paper = await this.loadPaper(paperId);
    this.assertChair(actor, paper.conference.memberships);
    if (
      paper.cameraReadyStatus !== CameraReadyStatus.DEPOSITED &&
      paper.cameraReadyStatus !== CameraReadyStatus.WILL_DEPOSIT &&
      paper.cameraReadyStatus !== CameraReadyStatus.NEEDS_MODS
    ) {
      throw new ForbiddenException('Wait for the author to deposit the final version');
    }
    const hasPdf = paper.files.some((file) => file.kind === PaperFileKind.CAMERA_READY);
    const hasEditable = paper.files.some((file) => file.kind === PaperFileKind.EDITABLE);
    if (!hasPdf || !hasEditable) {
      throw new BadRequestException('Both PDF and editable/ZIP files are required');
    }
    if (input.outcome === 'VALIDATED') {
      return this.prisma.paper.update({
        where: { id: paperId },
        data: {
          cameraReadyStatus: CameraReadyStatus.VALIDATED,
          similarityStatus:
            paper.similarityStatus === SimilarityStatus.LOCKED
              ? SimilarityStatus.OPEN
              : paper.similarityStatus,
        },
      });
    }
    await this.seedCameraReadyRemarks(paperId, input.note);
    return this.prisma.paper.update({
      where: { id: paperId },
      data: { cameraReadyStatus: CameraReadyStatus.NEEDS_MODS },
    });
  }

  async updateCameraReadyRemark(
    actor: AuthenticatedUser,
    paperId: string,
    remarkId: string,
    status: RemarkStatusInput,
  ) {
    const paper = await this.loadPaper(paperId);
    const remark = await this.prisma.cameraReadyRemark.findFirst({
      where: { id: remarkId, paperId },
    });
    if (!remark) {
      throw new NotFoundException('Remark not found');
    }
    const chair = this.isChair(actor, paper.conference.memberships);
    const author =
      paper.createdById === actor.id ||
      paper.authors.some((item) => item.email === actor.email.toLowerCase());
    if (
      status === 'VALIDATED' ||
      (status === 'OPEN' && remark.status === RemarkStatus.VALIDATED)
    ) {
      if (!chair) {
        throw new ForbiddenException('Only the committee can validate remarks');
      }
    } else if (status === 'ADDRESSED' || status === 'OPEN') {
      if (!author && !chair) {
        throw new ForbiddenException('Only the author can mark a remark as addressed');
      }
    } else {
      throw new BadRequestException('Unsupported remark status');
    }
    if (
      paper.cameraReadyStatus !== CameraReadyStatus.NEEDS_MODS &&
      paper.cameraReadyStatus !== CameraReadyStatus.WILL_DEPOSIT
    ) {
      throw new ForbiddenException('Remarks can only change while modifications are open');
    }
    const updated = await this.prisma.cameraReadyRemark.update({
      where: { id: remarkId },
      data: {
        status: RemarkStatus[status],
        addressedAt:
          status === 'ADDRESSED'
            ? new Date()
            : status === 'OPEN'
              ? null
              : remark.addressedAt,
        validatedAt: status === 'VALIDATED' ? new Date() : null,
        validatedById: status === 'VALIDATED' ? actor.id : null,
      },
    });
    if (status === 'VALIDATED') {
      await this.maybeValidateCameraReadyAfterRemarks(paperId);
    }
    return updated;
  }

  async updatePresentationRemark(
    actor: AuthenticatedUser,
    paperId: string,
    remarkId: string,
    status: RemarkStatusInput,
  ) {
    const paper = await this.loadPaper(paperId);
    const remark = await this.prisma.presentationRemark.findFirst({
      where: { id: remarkId, paperId },
    });
    if (!remark) {
      throw new NotFoundException('Remark not found');
    }
    const chair = this.isChair(actor, paper.conference.memberships);
    const author =
      paper.createdById === actor.id ||
      paper.authors.some((item) => item.email === actor.email.toLowerCase());
    if (
      status === 'VALIDATED' ||
      (status === 'OPEN' && remark.status === RemarkStatus.VALIDATED)
    ) {
      if (!chair) {
        throw new ForbiddenException('Only the committee can validate remarks');
      }
    } else if (status === 'ADDRESSED' || status === 'OPEN') {
      if (!author && !chair) {
        throw new ForbiddenException('Only the author can mark a remark as addressed');
      }
    } else {
      throw new BadRequestException('Unsupported remark status');
    }
    if (
      paper.slidesStatus !== SlidesStatus.NEEDS_MODS &&
      paper.slidesStatus !== SlidesStatus.WILL_DEPOSIT
    ) {
      throw new ForbiddenException('Remarks can only change while modifications are open');
    }
    const updated = await this.prisma.presentationRemark.update({
      where: { id: remarkId },
      data: {
        status: RemarkStatus[status],
        addressedAt:
          status === 'ADDRESSED'
            ? new Date()
            : status === 'OPEN'
              ? null
              : remark.addressedAt,
        validatedAt: status === 'VALIDATED' ? new Date() : null,
        validatedById: status === 'VALIDATED' ? actor.id : null,
      },
    });
    if (status === 'VALIDATED') {
      await this.maybeValidateSlidesAfterRemarks(paperId, actor.id);
    }
    return updated;
  }

  async assignSessionChair(actor: AuthenticatedUser, paperId: string, userId: string) {
    const paper = await this.loadPaper(paperId);
    this.assertChair(actor, paper.conference.memberships);
    const roles = new Set<ConferenceRole>([
      ConferenceRole.REVIEWER,
      ConferenceRole.COMMITTEE,
      ConferenceRole.CHAIR,
      ConferenceRole.ADMINISTRATOR,
    ]);
    const member = paper.conference.memberships.find((item) => item.userId === userId);
    if (
      !member ||
      member.status !== MembershipStatus.ACTIVE ||
      !roles.has(member.role) ||
      userId === paper.createdById
    ) {
      throw new ForbiddenException('Choose a session chair for this conference');
    }
    if (paper.sessionChairIds.includes(userId)) {
      return { sessionChairIds: paper.sessionChairIds };
    }
    const sessionChairIds = [...paper.sessionChairIds, userId];
    await this.prisma.paper.update({ where: { id: paperId }, data: { sessionChairIds } });
    return { sessionChairIds };
  }

  async markPresented(actor: AuthenticatedUser, paperId: string, comment: string) {
    const paper = await this.loadPaper(paperId);
    const sessionChair = paper.sessionChairIds.includes(actor.id);
    if (!sessionChair) {
      this.assertChair(actor, paper.conference.memberships);
    }
    const slides = paper.files.some((file) => file.kind === PaperFileKind.SLIDES);
    if (!slides) {
      throw new ForbiddenException(
        'Upload the slides before marking the paper presented',
      );
    }
    const now = paper.presentedAt ?? new Date();
    await this.prisma.$transaction([
      this.prisma.paper.update({
        where: { id: paperId },
        data: { presentedAt: now, sessionComment: comment },
      }),
      this.prisma.presentation.updateMany({
        where: { paperId },
        data: {
          presentedAt: now,
          comment: comment || undefined,
        },
      }),
    ]);
    return { presentedAt: now.toISOString(), sessionComment: comment };
  }

  async sendPaymentNotice(actor: AuthenticatedUser, paperId: string) {
    const paper = await this.loadPaper(paperId);
    this.assertAuthor(actor, paper);
    if (!paper.files.some((file) => file.kind === PaperFileKind.PAYMENT_PROOF)) {
      throw new BadRequestException('Upload the payment receipt first');
    }
    return this.prisma.registration.upsert({
      where: {
        conferenceId_userId: { conferenceId: paper.conferenceId, userId: actor.id },
      },
      create: {
        conferenceId: paper.conferenceId,
        userId: actor.id,
        status: RegistrationStatus.REQUESTED,
        paymentStatus: PaymentStatus.PENDING,
      },
      update: {
        status: RegistrationStatus.REQUESTED,
        paymentStatus: PaymentStatus.PENDING,
      },
    });
  }

  async verifyPayment(actor: AuthenticatedUser, paperId: string) {
    const paper = await this.loadPaper(paperId);
    this.assertChair(actor, paper.conference.memberships);
    if (!paper.files.some((file) => file.kind === PaperFileKind.PAYMENT_PROOF)) {
      throw new NotFoundException('Payment receipt not found');
    }
    const registration = await this.prisma.registration.upsert({
      where: {
        conferenceId_userId: {
          conferenceId: paper.conferenceId,
          userId: paper.createdById,
        },
      },
      create: {
        conferenceId: paper.conferenceId,
        userId: paper.createdById,
        status: RegistrationStatus.VERIFIED,
        paymentStatus: PaymentStatus.VERIFIED,
      },
      update: {
        status: RegistrationStatus.VERIFIED,
        paymentStatus: PaymentStatus.VERIFIED,
      },
    });
    await this.openPresentation(paper.conferenceId, paper.createdById);
    return registration;
  }

  async document(
    actor: AuthenticatedUser,
    paperId: string,
    kind: 'certificate' | 'receipt' | 'attestation',
  ) {
    const paper = await this.loadPaper(paperId);
    const manager = this.isChair(actor, paper.conference.memberships);
    const author =
      paper.createdById === actor.id ||
      paper.authors.some((item) => item.email === actor.email.toLowerCase());
    if (!manager && !author) {
      throw new NotFoundException('Paper not found');
    }
    const registration = await this.prisma.registration.findUnique({
      where: {
        conferenceId_userId: {
          conferenceId: paper.conferenceId,
          userId: paper.createdById,
        },
      },
    });
    const registered =
      registration?.status === RegistrationStatus.VERIFIED ||
      registration?.paymentStatus === PaymentStatus.VERIFIED;
    if ((kind === 'certificate' || kind === 'receipt') && !registered) {
      throw new ForbiddenException('The registration is not validated yet');
    }
    if (kind === 'attestation' && !paper.doi) {
      throw new ForbiddenException('The final attestation follows publication');
    }
    const title =
      kind === 'certificate'
        ? 'Certificate of acceptance'
        : kind === 'receipt'
          ? 'Payment receipt'
          : 'Attestation of acceptance for publication';
    const lines = [
      paper.conferenceId,
      paper.publicId ?? paper.id,
      paper.title,
      kind === 'attestation' ? (paper.doi ?? '') : registered ? 'Registered' : '',
    ];
    return {
      name: `${paper.publicId ?? 'paper'}-${kind}.pdf`,
      bytes: certificatePdf(title, lines.filter(Boolean)),
    };
  }

  async saveSimilarity(
    actor: AuthenticatedUser,
    paperId: string,
    input: SimilarityInput,
  ) {
    const paper = await this.loadPaper(paperId);
    this.assertAuthor(actor, paper);
    if (paper.similarityStatus === SimilarityStatus.LOCKED) {
      await this.ensureSimilarityOpen(paper);
      paper.similarityStatus = SimilarityStatus.OPEN;
    }
    if (
      paper.similarityStatus !== SimilarityStatus.OPEN &&
      paper.similarityStatus !== SimilarityStatus.DEPOSITED
    ) {
      throw new ForbiddenException('Similarity can be submitted when the stage is open');
    }
    if (input.percentage >= 20) {
      throw new BadRequestException('Similarity must be strictly under 20 percent');
    }
    const report = await this.prisma.similarityReport.upsert({
      where: { paperId },
      create: {
        paperId,
        percentage: input.percentage,
        note: input.note,
        verifiedAt: null,
      },
      update: { percentage: input.percentage, note: input.note, verifiedAt: null },
    });
    await this.refreshSimilarityAfterDeposit(paperId);
    return report;
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
    if (
      paper.similarityStatus !== SimilarityStatus.DEPOSITED &&
      paper.similarityStatus !== SimilarityStatus.OPEN
    ) {
      throw new ForbiddenException('Wait for the author to deposit the similarity report');
    }
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
    const [report] = await this.prisma.$transaction([
      this.prisma.similarityReport.update({
        where: { paperId },
        data: { verifiedAt: new Date() },
      }),
      this.prisma.paper.update({
        where: { id: paperId },
        data: {
          similarityStatus: SimilarityStatus.VALIDATED,
          copyrightStageStatus:
            paper.copyrightStageStatus === CopyrightStageStatus.LOCKED
              ? CopyrightStageStatus.OPEN
              : paper.copyrightStageStatus,
        },
      }),
    ]);
    return report;
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
    if (
      accept &&
      paper.copyrightStageStatus !== CopyrightStageStatus.DEPOSITED &&
      paper.copyrightStageStatus !== CopyrightStageStatus.OPEN
    ) {
      throw new ForbiddenException('Wait for the author to deposit the copyright form');
    }
    const hasFile = paper.files.some((file) => file.kind === PaperFileKind.COPYRIGHT);
    if (accept && !hasFile) {
      throw new ForbiddenException('Upload the copyright form before validation');
    }
    const [record] = await this.prisma.$transaction([
      this.prisma.copyrightRecord.update({
        where: { paperId },
        data: { status: accept ? CopyrightStatus.VALIDATED : CopyrightStatus.REJECTED },
      }),
      this.prisma.paper.update({
        where: { id: paperId },
        data: {
          copyrightStageStatus: accept
            ? CopyrightStageStatus.VALIDATED
            : CopyrightStageStatus.OPEN,
        },
      }),
    ]);
    return record;
  }

  async register(actor: AuthenticatedUser, conferenceId: string) {
    const conference = await this.prisma.conference.findUnique({
      where: { id: conferenceId },
    });
    if (!conference || conference.status !== 'PUBLISHED') {
      throw new NotFoundException('Conference not found');
    }
    return this.prisma.registration.upsert({
      where: { conferenceId_userId: { conferenceId, userId: actor.id } },
      create: {
        conferenceId,
        userId: actor.id,
        paymentStatus: conference.paymentsEnabled
          ? PaymentStatus.PENDING
          : PaymentStatus.NOT_REQUIRED,
      },
      update: {},
    });
  }

  async verifyRegistration(
    actor: AuthenticatedUser,
    conferenceId: string,
    userId: string,
  ) {
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
    const updated = await this.prisma.registration.update({
      where: { id: row.id },
      data: { status: RegistrationStatus.VERIFIED },
    });
    await this.openPresentation(conferenceId, userId);
    return updated;
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
    const updated = await this.prisma.registration.update({
      where: { id: row.id },
      data: {
        paymentStatus: PaymentStatus.VERIFIED,
        status: RegistrationStatus.VERIFIED,
      },
    });
    await this.openPresentation(conferenceId, actor.id);
    return updated;
  }

  async addRoom(actor: AuthenticatedUser, conferenceId: string, input: RoomInput) {
    const conference = await this.loadConference(conferenceId);
    this.assertChair(actor, conference.memberships);
    return this.prisma.room.create({
      data: { conferenceId, name: input.name, capacity: input.capacity },
    });
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
        include: {
          room: true,
          presentations: {
            include: {
              paper: {
                select: {
                  id: true,
                  title: true,
                  publicId: true,
                  presentedAt: true,
                  sessionComment: true,
                  sessionChairIds: true,
                },
              },
            },
          },
        },
        orderBy: { startsAt: 'asc' },
      }),
      this.prisma.room.findMany({ where: { conferenceId }, orderBy: { name: 'asc' } }),
    ]);
    const chairIds = [
      ...new Set(
        sessions.flatMap((session) =>
          session.presentations.flatMap((item) => item.paper.sessionChairIds),
        ),
      ),
    ];
    const chairs =
      chairIds.length === 0
        ? []
        : await this.prisma.user.findMany({
            where: { id: { in: chairIds } },
            include: { profile: true },
          });
    const chairName = new Map(
      chairs.map((user) => [
        user.id,
        `${user.profile?.firstName ?? ''} ${user.profile?.lastName ?? ''}`.trim() ||
          user.email,
      ]),
    );
    return {
      sessions: sessions.map((session) => ({
        id: session.id,
        title: session.title,
        startsAt: session.startsAt,
        endsAt: session.endsAt,
        room: session.room,
        presentations: session.presentations.map((item) => ({
          id: item.id,
          modality: item.modality,
          score: item.score,
          comment: item.comment,
          presentedAt: item.presentedAt ?? item.paper.presentedAt,
          paper: {
            id: item.paper.id,
            title: item.paper.title,
            publicId: item.paper.publicId,
            sessionComment: item.paper.sessionComment,
            sessionChairs: item.paper.sessionChairIds.map((id) => ({
              userId: id,
              name: chairName.get(id) ?? id,
              mine: id === actor.id,
            })),
          },
        })),
      })),
      rooms,
    };
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
    const outcome =
      paper.decision?.status === DecisionStatus.PUBLISHED ? paper.decision.outcome : null;
    if (!outcome || !ACCEPTED.has(outcome)) {
      throw new ForbiddenException('Only an accepted paper can be scheduled');
    }
    const modality =
      input.modality === 'ONLINE'
        ? PresentationModality.ONLINE
        : PresentationModality.IN_PERSON;
    return this.prisma.presentation.upsert({
      where: { paperId: input.paperId },
      create: { sessionId, paperId: input.paperId, modality },
      update: { sessionId, modality },
    });
  }

  async assessPresentation(
    actor: AuthenticatedUser,
    presentationId: string,
    input: { score?: number; comment: string; presented?: boolean },
  ) {
    const row = await this.prisma.presentation.findUnique({
      where: { id: presentationId },
      include: {
        paper: true,
        session: { include: { conference: { include: { memberships: true } } } },
      },
    });
    if (!row) {
      throw new NotFoundException('Presentation not found');
    }
    const sessionChair = row.paper.sessionChairIds.includes(actor.id);
    if (!sessionChair) {
      this.assertChair(actor, row.session.conference.memberships);
    }
    const markPresented = input.presented !== false;
    const now = row.presentedAt ?? row.paper.presentedAt ?? new Date();
    const [presentation] = await this.prisma.$transaction([
      this.prisma.presentation.update({
        where: { id: presentationId },
        data: {
          score: input.score ?? row.score,
          comment: input.comment,
          presentedAt: markPresented ? now : row.presentedAt,
        },
      }),
      ...(markPresented
        ? [
            this.prisma.paper.update({
              where: { id: row.paperId },
              data: {
                presentedAt: row.paper.presentedAt ?? now,
                sessionComment: input.comment || row.paper.sessionComment,
              },
            }),
          ]
        : []),
    ]);
    return presentation;
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
      select: {
        score: true,
        submittedAt: true,
        assignment: { select: { createdAt: true } },
      },
    });
    const averageScore =
      forms.length === 0
        ? null
        : Math.round(
            (forms.reduce((sum, form) => sum + form.score, 0) / forms.length) * 10,
          ) / 10;
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
      (form) =>
        form.submittedAt.getTime() - form.assignment.createdAt.getTime() >
        14 * 24 * 60 * 60 * 1000,
    ).length;
    return {
      papersByStatus: Object.fromEntries(
        papers.map((row) => [row.status, row._count._all]),
      ),
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
      include: {
        authors: true,
        decision: true,
        similarity: true,
        copyright: true,
        files: true,
      },
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
    presentedAt?: Date | null;
    presentation?: { id: string } | null;
    cameraReadyStatus?: CameraReadyStatus;
    similarityStatus?: SimilarityStatus;
    copyrightStageStatus?: CopyrightStageStatus;
    slidesStatus?: SlidesStatus;
  }) {
    const published = paper.decision?.status === DecisionStatus.PUBLISHED;
    const accepted =
      published && paper.decision ? ACCEPTED.has(paper.decision.outcome) : false;
    const cameraReady =
      paper.cameraReadyStatus === CameraReadyStatus.VALIDATED ||
      paper.files.some((file) => file.kind === PaperFileKind.CAMERA_READY);
    const similarityOk =
      paper.similarityStatus === SimilarityStatus.VALIDATED ||
      (paper.similarity !== null &&
        paper.similarity.percentage < 20 &&
        paper.similarity.verifiedAt !== null);
    const copyrightOk =
      paper.copyrightStageStatus === CopyrightStageStatus.VALIDATED ||
      paper.copyright?.status === CopyrightStatus.VALIDATED;
    const presented =
      paper.slidesStatus === SlidesStatus.VALIDATED ||
      Boolean(paper.presentedAt) ||
      Boolean(paper.presentation);
    return {
      accepted,
      cameraReady,
      similarityOk,
      copyrightOk,
      presented,
      ready:
        paper.status !== PaperStatus.WITHDRAWN &&
        accepted &&
        paper.cameraReadyStatus === CameraReadyStatus.VALIDATED &&
        paper.similarityStatus === SimilarityStatus.VALIDATED &&
        paper.copyrightStageStatus === CopyrightStageStatus.VALIDATED &&
        presented,
    };
  }

  private async openPresentation(conferenceId: string, userId: string) {
    await this.prisma.paper.updateMany({
      where: {
        conferenceId,
        createdById: userId,
        slidesStatus: SlidesStatus.LOCKED,
        decision: {
          status: DecisionStatus.PUBLISHED,
          outcome: DecisionOutcome.ACCEPTED,
        },
      },
      data: { slidesStatus: SlidesStatus.OPEN },
    });
  }

  private async ensurePresentationOpen(paper: {
    id: string;
    conferenceId: string;
    createdById: string;
    slidesStatus: SlidesStatus;
    decision: { status: DecisionStatus; outcome: DecisionOutcome } | null;
  }) {
    if (paper.slidesStatus !== SlidesStatus.LOCKED) {
      return;
    }
    if (
      paper.decision?.status !== DecisionStatus.PUBLISHED ||
      paper.decision.outcome !== DecisionOutcome.ACCEPTED
    ) {
      throw new ForbiddenException('Slides can be uploaded when presentation is open');
    }
    const registration = await this.prisma.registration.findUnique({
      where: {
        conferenceId_userId: {
          conferenceId: paper.conferenceId,
          userId: paper.createdById,
        },
      },
    });
    const ready =
      registration?.status === RegistrationStatus.VERIFIED ||
      registration?.paymentStatus === PaymentStatus.VERIFIED;
    if (!ready) {
      throw new ForbiddenException('Complete registration and payment first');
    }
    await this.prisma.paper.update({
      where: { id: paper.id },
      data: { slidesStatus: SlidesStatus.OPEN },
    });
  }

  private async seedPresentationRemarks(paperId: string, note: string) {
    const latest = await this.prisma.presentationRemark.findFirst({
      where: { paperId },
      orderBy: { round: 'desc' },
      select: { round: true },
    });
    const texts = splitRemarkTexts(note);
    if (texts.length === 0) {
      texts.push(note.trim() || 'Update the presentation according to the admin comments.');
    }
    const round = (latest?.round ?? 0) + 1;
    await this.prisma.presentationRemark.createMany({
      data: texts.map((text, index) => ({
        paperId,
        text,
        round,
        sortOrder: index,
        status: RemarkStatus.OPEN,
      })),
    });
  }

  private async maybeValidateSlidesAfterRemarks(paperId: string, actorId: string) {
    const latest = await this.prisma.presentationRemark.findFirst({
      where: { paperId },
      orderBy: { round: 'desc' },
      select: { round: true },
    });
    if (!latest) {
      return;
    }
    const open = await this.prisma.presentationRemark.count({
      where: {
        paperId,
        round: latest.round,
        status: { not: RemarkStatus.VALIDATED },
      },
    });
    if (open > 0) {
      return;
    }
    const paper = await this.prisma.paper.findUnique({ where: { id: paperId } });
    if (!paper || paper.slidesStatus === SlidesStatus.VALIDATED) {
      return;
    }
    if (
      paper.slidesStatus !== SlidesStatus.WILL_DEPOSIT &&
      paper.slidesStatus !== SlidesStatus.DEPOSITED
    ) {
      return;
    }
    await this.prisma.paper.update({
      where: { id: paperId },
      data: {
        slidesStatus: SlidesStatus.VALIDATED,
        cameraReadyStatus:
          paper.cameraReadyStatus === CameraReadyStatus.LOCKED
            ? CameraReadyStatus.OPEN
            : paper.cameraReadyStatus,
      },
    });
    void actorId;
  }

  private async ensureCameraReadyOpen(paper: {
    id: string;
    slidesStatus: SlidesStatus;
    cameraReadyStatus: CameraReadyStatus;
    presentedAt: Date | null;
  }) {
    if (paper.cameraReadyStatus !== CameraReadyStatus.LOCKED) {
      return;
    }
    const slidesDone =
      paper.slidesStatus === SlidesStatus.VALIDATED || paper.presentedAt !== null;
    if (!slidesDone) {
      throw new ForbiddenException(
        'Camera-ready opens after the presentation is validated',
      );
    }
    await this.prisma.paper.update({
      where: { id: paper.id },
      data: { cameraReadyStatus: CameraReadyStatus.OPEN },
    });
  }

  private async refreshCameraReadyAfterUpload(
    paperId: string,
    previous: CameraReadyStatus,
  ) {
    const files = await this.prisma.paperFile.findMany({
      where: { paperId },
      select: { kind: true },
      distinct: ['kind'],
    });
    const hasPdf = files.some((file) => file.kind === PaperFileKind.CAMERA_READY);
    const hasEditable = files.some((file) => file.kind === PaperFileKind.EDITABLE);
    if (!hasPdf || !hasEditable) {
      return;
    }
    const next =
      previous === CameraReadyStatus.NEEDS_MODS
        ? CameraReadyStatus.WILL_DEPOSIT
        : CameraReadyStatus.DEPOSITED;
    if (
      previous === next ||
      previous === CameraReadyStatus.VALIDATED ||
      previous === CameraReadyStatus.LOCKED
    ) {
      return;
    }
    await this.prisma.paper.update({
      where: { id: paperId },
      data: { cameraReadyStatus: next },
    });
  }

  private async seedCameraReadyRemarks(paperId: string, note: string) {
    const latest = await this.prisma.cameraReadyRemark.findFirst({
      where: { paperId },
      orderBy: { round: 'desc' },
      select: { round: true },
    });
    const texts = splitRemarkTexts(note);
    if (texts.length === 0) {
      texts.push(
        note.trim() || 'Update the camera-ready files according to the admin comments.',
      );
    }
    const round = (latest?.round ?? 0) + 1;
    await this.prisma.cameraReadyRemark.createMany({
      data: texts.map((text, index) => ({
        paperId,
        text,
        round,
        sortOrder: index,
        status: RemarkStatus.OPEN,
      })),
    });
  }

  private async maybeValidateCameraReadyAfterRemarks(paperId: string) {
    const latest = await this.prisma.cameraReadyRemark.findFirst({
      where: { paperId },
      orderBy: { round: 'desc' },
      select: { round: true },
    });
    if (!latest) {
      return;
    }
    const open = await this.prisma.cameraReadyRemark.count({
      where: {
        paperId,
        round: latest.round,
        status: { not: RemarkStatus.VALIDATED },
      },
    });
    if (open > 0) {
      return;
    }
    const paper = await this.prisma.paper.findUnique({ where: { id: paperId } });
    if (!paper || paper.cameraReadyStatus === CameraReadyStatus.VALIDATED) {
      return;
    }
    if (
      paper.cameraReadyStatus !== CameraReadyStatus.WILL_DEPOSIT &&
      paper.cameraReadyStatus !== CameraReadyStatus.DEPOSITED
    ) {
      return;
    }
    await this.prisma.paper.update({
      where: { id: paperId },
      data: {
        cameraReadyStatus: CameraReadyStatus.VALIDATED,
        similarityStatus:
          paper.similarityStatus === SimilarityStatus.LOCKED
            ? SimilarityStatus.OPEN
            : paper.similarityStatus,
      },
    });
  }

  private async ensureSimilarityOpen(paper: {
    id: string;
    cameraReadyStatus: CameraReadyStatus;
    similarityStatus: SimilarityStatus;
  }) {
    if (paper.similarityStatus !== SimilarityStatus.LOCKED) {
      return;
    }
    if (paper.cameraReadyStatus !== CameraReadyStatus.VALIDATED) {
      throw new ForbiddenException(
        'Similarity opens after the camera-ready version is validated',
      );
    }
    await this.prisma.paper.update({
      where: { id: paper.id },
      data: { similarityStatus: SimilarityStatus.OPEN },
    });
  }

  private async ensureCopyrightOpen(paper: {
    id: string;
    similarityStatus: SimilarityStatus;
    copyrightStageStatus: CopyrightStageStatus;
  }) {
    if (paper.copyrightStageStatus !== CopyrightStageStatus.LOCKED) {
      return;
    }
    if (paper.similarityStatus !== SimilarityStatus.VALIDATED) {
      throw new ForbiddenException(
        'Copyright opens after the similarity check is validated',
      );
    }
    await this.prisma.paper.update({
      where: { id: paper.id },
      data: { copyrightStageStatus: CopyrightStageStatus.OPEN },
    });
  }

  private async refreshSimilarityAfterDeposit(paperId: string) {
    const [paper, report, files] = await Promise.all([
      this.prisma.paper.findUnique({ where: { id: paperId } }),
      this.prisma.similarityReport.findUnique({ where: { paperId } }),
      this.prisma.paperFile.findMany({
        where: { paperId, kind: PaperFileKind.SIMILARITY },
        take: 1,
      }),
    ]);
    if (!paper || paper.similarityStatus === SimilarityStatus.VALIDATED) {
      return;
    }
    if (
      paper.similarityStatus !== SimilarityStatus.OPEN &&
      paper.similarityStatus !== SimilarityStatus.DEPOSITED
    ) {
      return;
    }
    const ready =
      files.length > 0 && report !== null && report.percentage < 20;
    if (!ready) {
      if (paper.similarityStatus === SimilarityStatus.DEPOSITED) {
        await this.prisma.paper.update({
          where: { id: paperId },
          data: { similarityStatus: SimilarityStatus.OPEN },
        });
      }
      return;
    }
    if (paper.similarityStatus !== SimilarityStatus.DEPOSITED) {
      await this.prisma.paper.update({
        where: { id: paperId },
        data: { similarityStatus: SimilarityStatus.DEPOSITED },
      });
    }
  }

  private async seedRevisionRemarks(paperId: string, letter: string) {
    const [forms, latest] = await Promise.all([
      this.prisma.reviewForm.findMany({
        where: { assignment: { paperId } },
        select: { commentsToAuthor: true },
      }),
      this.prisma.revisionRemark.findFirst({
        where: { paperId },
        orderBy: { round: 'desc' },
        select: { round: true },
      }),
    ]);
    const texts = splitRemarkTexts(
      letter,
      ...forms.map((form) => form.commentsToAuthor),
    );
    if (texts.length === 0) {
      texts.push(
        letter.trim() || 'Address the reviewer comments in a new version.',
      );
    }
    const round = (latest?.round ?? 0) + 1;
    await this.prisma.revisionRemark.createMany({
      data: texts.map((text, index) => ({
        paperId,
        text,
        round,
        sortOrder: index,
        status: RemarkStatus.OPEN,
      })),
    });
  }

  private async maybeAcceptAfterRemarks(paperId: string, actorId: string) {
    const latest = await this.prisma.revisionRemark.findFirst({
      where: { paperId },
      orderBy: { round: 'desc' },
      select: { round: true },
    });
    if (!latest) {
      return;
    }
    const open = await this.prisma.revisionRemark.count({
      where: {
        paperId,
        round: latest.round,
        status: { not: RemarkStatus.VALIDATED },
      },
    });
    if (open > 0) {
      return;
    }
    await this.prisma.decision.update({
      where: { paperId },
      data: {
        outcome: DecisionOutcome.ACCEPTED,
        status: DecisionStatus.PUBLISHED,
        publishedAt: new Date(),
        decidedById: actorId,
      },
    });
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

  private assertUpload(
    kind:
      | 'REVISION'
      | 'CAMERA_READY'
      | 'EDITABLE'
      | 'COPYRIGHT'
      | 'SIMILARITY'
      | 'SLIDES'
      | 'PAYMENT_PROOF',
    file: Upload,
  ) {
    if (!file?.buffer || file.size > 20 * 1024 * 1024) {
      throw new BadRequestException('Upload a file of at most 20 MB');
    }
    const name = file.originalname.toLowerCase();
    const allowed: Record<string, string[]> = {
      EDITABLE: ['.pdf', '.doc', '.docx', '.tex', '.zip'],
      SLIDES: ['.pdf', '.ppt', '.pptx'],
      PAYMENT_PROOF: ['.pdf', '.png', '.jpg', '.jpeg'],
    };
    const extensions = allowed[kind];
    if (!extensions) {
      this.assertPdf(file);
      return;
    }
    if (!extensions.some((extension) => name.endsWith(extension))) {
      throw new BadRequestException('This file type is not allowed for this step');
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
        presentation: { select: { id: true } },
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
      conference: {
        memberships: { userId: string; role: ConferenceRole; status: MembershipStatus }[];
      };
    },
  ) {
    if (this.isChair(actor, paper.conference.memberships)) {
      return;
    }
    this.assertAuthor(actor, paper);
  }
}

function fileExtension(name: string, kind: string): string {
  const match = name.toLowerCase().match(/\.[a-z0-9]+$/);
  if (
    match &&
    kind !== 'CAMERA_READY' &&
    kind !== 'COPYRIGHT' &&
    kind !== 'SIMILARITY' &&
    kind !== 'REVISION'
  ) {
    return match[0];
  }
  return '.pdf';
}

function safeUploadName(value: string): string {
  const base = value.split(/[/\\]/).pop() ?? 'document';
  const cleaned = base.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 180);
  return cleaned.length > 0 ? cleaned : 'document';
}

function splitRemarkTexts(...blocks: string[]): string[] {
  const items: string[] = [];
  for (const block of blocks) {
    const raw = block.trim();
    if (!raw) {
      continue;
    }
    const lines = raw
      .split(/\r?\n|(?:^|\s)[•·\-–—*]\s+|(?:^|\s)\d+[).]\s+/)
      .map((line) => line.replace(/^[\d).:\s•·\-–—*]+/, '').trim())
      .filter((line) => line.length >= 8);
    if (lines.length > 1) {
      items.push(...lines);
    } else {
      items.push(raw);
    }
  }
  return [...new Set(items)].slice(0, 40);
}
