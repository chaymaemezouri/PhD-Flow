import { createHash, randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  createPaperSchema,
  replaceAuthorsSchema,
  updatePaperSchema,
  withdrawPaperSchema,
} from '@scholarflow/validation';
import type { z } from 'zod';
import {
  ConferenceRole,
  ConferenceStatus,
  MembershipStatus,
  PaperFileKind,
  AssignmentStatus,
  PaperStatus,
  PlatformRole,
  Prisma,
  ReviewMode,
} from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { ObjectStorage } from './object-storage.js';
import { paperSteps } from './pipeline.js';

const MAX_PDF_BYTES = 20 * 1024 * 1024;
const SUBMITTERS = new Set<ConferenceRole>([
  ConferenceRole.AUTHOR,
  ConferenceRole.CHAIR,
  ConferenceRole.ADMINISTRATOR,
  ConferenceRole.COMMITTEE,
]);
const READERS = new Set<ConferenceRole>([
  ConferenceRole.CHAIR,
  ConferenceRole.ADMINISTRATOR,
  ConferenceRole.COMMITTEE,
]);

type CreateInput = z.infer<typeof createPaperSchema>;
type UpdateInput = z.infer<typeof updatePaperSchema>;
type AuthorsInput = z.infer<typeof replaceAuthorsSchema>;
type WithdrawInput = z.infer<typeof withdrawPaperSchema>;

const paperInclude = {
  authors: { orderBy: { position: 'asc' as const } },
  files: {
    where: { kind: PaperFileKind.MANUSCRIPT },
    orderBy: { createdAt: 'desc' as const },
  },
  conference: {
    include: {
      deadlines: true,
      memberships: true,
    },
  },
} satisfies Prisma.PaperInclude;

type PaperRecord = Prisma.PaperGetPayload<{ include: typeof paperInclude }>;

@Injectable()
export class PaperService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: ObjectStorage,
  ) {}

  async create(actor: AuthenticatedUser, conferenceId: string, input: CreateInput) {
    const conference = await this.prisma.conference.findUnique({
      where: { id: conferenceId },
      include: { memberships: true, tracks: true },
    });
    if (!conference || conference.status === ConferenceStatus.ARCHIVED) {
      throw new NotFoundException('Conference not found');
    }
    this.assertSubmitter(actor, conference.memberships);
    if (input.trackId && !conference.tracks.some((track) => track.id === input.trackId)) {
      throw new NotFoundException('Track not found');
    }
    const authors = input.authors.length > 0 ? input.authors : [this.selfAuthor(actor)];
    const paper = await this.prisma.paper.create({
      data: {
        conferenceId,
        trackId: input.trackId,
        title: input.title,
        abstract: input.abstract,
        keywords: input.keywords,
        createdById: actor.id,
        authors: {
          create: authors.map((author, index) => ({
            position: index + 1,
            firstName: author.firstName,
            lastName: author.lastName,
            email: author.email.toLowerCase(),
            affiliation: author.affiliation,
            corresponding: author.corresponding || authors.length === 1,
          })),
        },
        events: {
          create: { toStatus: PaperStatus.DRAFT, actorId: actor.id, reason: '' },
        },
      },
    });
    return this.getOne(actor, paper.id);
  }

  async listMine(actor: AuthenticatedUser) {
    const rows = await this.prisma.paper.findMany({
      where: {
        OR: [
          { createdById: actor.id },
          {
            conference: {
              memberships: {
                some: {
                  userId: actor.id,
                  status: MembershipStatus.ACTIVE,
                  role: { in: [...READERS] },
                },
              },
            },
          },
          {
            assignments: {
              some: {
                reviewerId: actor.id,
                status: {
                  in: [
                    AssignmentStatus.ACCEPTED,
                    AssignmentStatus.IN_PROGRESS,
                    AssignmentStatus.OVERDUE,
                    AssignmentStatus.COMPLETED,
                  ],
                },
              },
            },
          },
        ],
      },
      include: paperInclude,
      orderBy: { updatedAt: 'desc' },
    });
    const visible = [];
    for (const row of rows) {
      if (await this.canRead(actor, row)) {
        visible.push(await this.toView(row, actor));
      }
    }
    return this.withSteps(visible);
  }

  async list(actor: AuthenticatedUser, conferenceId: string) {
    const conference = await this.prisma.conference.findUnique({
      where: { id: conferenceId },
      include: { memberships: true },
    });
    if (!conference) {
      throw new NotFoundException('Conference not found');
    }
    const membership = conference.memberships.find((item) => item.userId === actor.id);
    const manager =
      actor.platformRole === PlatformRole.SYSTEM_ADMIN ||
      (membership?.status === MembershipStatus.ACTIVE && READERS.has(membership.role));
    const mine =
      membership?.status === MembershipStatus.ACTIVE && SUBMITTERS.has(membership.role);
    if (!manager && !mine) {
      throw new NotFoundException('Conference not found');
    }
    const rows = await this.prisma.paper.findMany({
      where: { conferenceId, ...(manager ? {} : { createdById: actor.id }) },
      include: paperInclude,
      orderBy: { createdAt: 'desc' },
    });
    const visible = [];
    for (const row of rows) {
      if (await this.canRead(actor, row)) {
        visible.push(await this.toView(row, actor));
      }
    }
    return this.withSteps(visible);
  }

  async getOne(actor: AuthenticatedUser, id: string) {
    const row = await this.load(id);
    await this.assertReadable(actor, row);
    const [view] = await this.withSteps([await this.toView(row, actor)]);
    return view;
  }

  async update(actor: AuthenticatedUser, id: string, input: UpdateInput) {
    const row = await this.load(id);
    await this.assertEditable(actor, row);
    if (input.trackId && input.trackId !== row.trackId) {
      const track = await this.prisma.track.findFirst({
        where: { id: input.trackId, conferenceId: row.conferenceId },
      });
      if (!track) {
        throw new NotFoundException('Track not found');
      }
    }
    await this.prisma.paper.update({
      where: { id },
      data: {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.abstract !== undefined ? { abstract: input.abstract } : {}),
        ...(input.keywords !== undefined ? { keywords: input.keywords } : {}),
        ...(input.trackId !== undefined ? { trackId: input.trackId } : {}),
      },
    });
    return this.getOne(actor, id);
  }

  async replaceAuthors(actor: AuthenticatedUser, id: string, input: AuthorsInput) {
    const row = await this.load(id);
    await this.assertEditable(actor, row);
    if (!input.authors.some((author) => author.corresponding)) {
      throw new BadRequestException('Mark one author as the corresponding author');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.paperAuthor.deleteMany({ where: { paperId: id } });
      await tx.paperAuthor.createMany({
        data: input.authors.map((author, index) => ({
          paperId: id,
          position: index + 1,
          firstName: author.firstName,
          lastName: author.lastName,
          email: author.email.toLowerCase(),
          affiliation: author.affiliation,
          corresponding: author.corresponding,
        })),
      });
    });
    return this.getOne(actor, id);
  }

  async storeManuscript(
    actor: AuthenticatedUser,
    id: string,
    file: { originalname: string; mimetype: string; size: number; buffer: Buffer },
  ) {
    const row = await this.load(id);
    await this.assertEditable(actor, row);
    if (!file?.buffer || file.size <= 0) {
      throw new BadRequestException('Choose a PDF manuscript');
    }
    if (file.size > MAX_PDF_BYTES || file.buffer.length > MAX_PDF_BYTES) {
      throw new BadRequestException('The manuscript must be 20 MB or smaller');
    }
    if (
      file.mimetype !== 'application/pdf' ||
      !file.buffer.subarray(0, 5).equals(Buffer.from('%PDF-'))
    ) {
      throw new BadRequestException('The manuscript must be a PDF');
    }
    const key = `conferences/${row.conferenceId}/papers/${row.id}/${randomUUID()}.pdf`;
    await this.storage.put(key, file.buffer, 'application/pdf');
    const previous = row.files[0];
    await this.prisma.paperFile.create({
      data: {
        paperId: id,
        kind: PaperFileKind.MANUSCRIPT,
        storageKey: key,
        originalName: safeName(file.originalname),
        contentType: 'application/pdf',
        sizeBytes: file.buffer.length,
        sha256: createHash('sha256').update(file.buffer).digest('hex'),
        uploadedById: actor.id,
      },
    });
    if (previous) {
      await this.prisma.paperFile.delete({ where: { id: previous.id } });
      await this.storage.remove(previous.storageKey).catch(() => undefined);
    }
    return this.getOne(actor, id);
  }

  async download(actor: AuthenticatedUser, id: string) {
    const row = await this.load(id);
    await this.assertReadable(actor, row);
    const file = row.files[0];
    if (!file) {
      throw new NotFoundException('Manuscript not found');
    }
    const bytes = await this.storage.get(file.storageKey);
    const hideName =
      row.conference.reviewMode === ReviewMode.DOUBLE_BLIND &&
      !this.isManager(actor, row) &&
      row.createdById !== actor.id;
    return { name: hideName ? 'manuscript.pdf' : file.originalName, bytes };
  }

  async submit(actor: AuthenticatedUser, id: string) {
    const row = await this.load(id);
    await this.assertEditable(actor, row);
    if (row.abstract.trim().length < 20) {
      throw new BadRequestException(
        'Add an abstract of at least 20 characters before submitting',
      );
    }
    if (row.authors.length === 0 || !row.authors.some((author) => author.corresponding)) {
      throw new BadRequestException('Add a corresponding author before submitting');
    }
    if (row.files.length === 0) {
      throw new BadRequestException('Upload the PDF manuscript before submitting');
    }
    this.assertDeadlineOpen(row);
    await this.prisma.$transaction(async (tx) => {
      const counter = await tx.conference.update({
        where: { id: row.conferenceId },
        data: { nextPaperNumber: { increment: 1 } },
        select: { nextPaperNumber: true, slug: true, startsOn: true },
      });
      const year = counter.startsOn?.getUTCFullYear() ?? new Date().getUTCFullYear();
      const publicId = `${counter.slug.toUpperCase()}-${year}-${String(counter.nextPaperNumber).padStart(4, '0')}`;
      await tx.paper.update({
        where: { id },
        data: {
          status: PaperStatus.SUBMITTED,
          submittedAt: new Date(),
          publicId,
        },
      });
      await tx.paperStatusEvent.create({
        data: {
          paperId: id,
          fromStatus: PaperStatus.DRAFT,
          toStatus: PaperStatus.SUBMITTED,
          actorId: actor.id,
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: 'paper.submit',
          resourceType: 'paper',
          resourceId: id,
          metadata: { publicId },
        },
      });
    });
    return this.getOne(actor, id);
  }

  async withdraw(actor: AuthenticatedUser, id: string, input: WithdrawInput) {
    const row = await this.load(id);
    await this.assertReadable(actor, row);
    const manager = this.isManager(actor, row);
    if (row.createdById !== actor.id && !manager) {
      throw new ForbiddenException('You cannot withdraw this paper');
    }
    if (row.status !== PaperStatus.SUBMITTED) {
      throw new ForbiddenException('Only a submitted paper can be withdrawn');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.paper.update({
        where: { id },
        data: { status: PaperStatus.WITHDRAWN, withdrawnAt: new Date() },
      });
      await tx.paperStatusEvent.create({
        data: {
          paperId: id,
          fromStatus: PaperStatus.SUBMITTED,
          toStatus: PaperStatus.WITHDRAWN,
          actorId: actor.id,
          reason: input.reason,
        },
      });
    });
    return this.getOne(actor, id);
  }

  private async load(id: string): Promise<PaperRecord> {
    const row = await this.prisma.paper.findUnique({
      where: { id },
      include: paperInclude,
    });
    if (!row) {
      throw new NotFoundException('Paper not found');
    }
    return row;
  }

  private assertSubmitter(
    actor: AuthenticatedUser,
    memberships: { userId: string; role: ConferenceRole; status: MembershipStatus }[],
  ) {
    if (actor.platformRole === PlatformRole.SYSTEM_ADMIN) {
      return;
    }
    const membership = memberships.find((item) => item.userId === actor.id);
    if (
      !membership ||
      membership.status !== MembershipStatus.ACTIVE ||
      !SUBMITTERS.has(membership.role)
    ) {
      throw new ForbiddenException('You cannot submit to this conference');
    }
  }

  private async canRead(actor: AuthenticatedUser, row: PaperRecord): Promise<boolean> {
    if (actor.platformRole === PlatformRole.SYSTEM_ADMIN || this.isManager(actor, row)) {
      return true;
    }
    const membership = row.conference.memberships.find(
      (item) => item.userId === actor.id,
    );
    if (
      row.createdById === actor.id &&
      membership?.status === MembershipStatus.ACTIVE &&
      SUBMITTERS.has(membership.role)
    ) {
      return true;
    }
    const assignment = await this.prisma.reviewAssignment.findFirst({
      where: {
        paperId: row.id,
        reviewerId: actor.id,
        status: {
          in: [
            AssignmentStatus.ACCEPTED,
            AssignmentStatus.IN_PROGRESS,
            AssignmentStatus.OVERDUE,
            AssignmentStatus.COMPLETED,
          ],
        },
      },
    });
    return assignment !== null;
  }

  private async assertReadable(actor: AuthenticatedUser, row: PaperRecord) {
    if (!(await this.canRead(actor, row))) {
      throw new NotFoundException('Paper not found');
    }
  }

  private async assertEditable(actor: AuthenticatedUser, row: PaperRecord) {
    await this.assertReadable(actor, row);
    if (row.status !== PaperStatus.DRAFT) {
      throw new ForbiddenException('This paper can no longer be edited');
    }
    if (row.createdById !== actor.id && !this.isManager(actor, row)) {
      throw new ForbiddenException('You cannot edit this paper');
    }
  }

  private isManager(actor: AuthenticatedUser, row: PaperRecord): boolean {
    if (actor.platformRole === PlatformRole.SYSTEM_ADMIN) {
      return true;
    }
    const membership = row.conference.memberships.find(
      (item) => item.userId === actor.id,
    );
    return membership?.status === MembershipStatus.ACTIVE && READERS.has(membership.role);
  }

  private assertDeadlineOpen(row: PaperRecord) {
    const submission = row.conference.deadlines.filter(
      (item) => item.kind === 'SUBMISSION',
    );
    const trackSpecific = row.trackId
      ? submission.filter((item) => item.trackId === row.trackId)
      : [];
    const applicable =
      trackSpecific.length > 0
        ? trackSpecific
        : submission.filter((item) => item.trackId === null);
    if (applicable.some((item) => item.dueAt.getTime() <= Date.now())) {
      throw new ForbiddenException('The submission deadline has passed');
    }
  }

  private selfAuthor(actor: AuthenticatedUser) {
    return {
      firstName: actor.profile.firstName,
      lastName: actor.profile.lastName,
      email: actor.email,
      affiliation: actor.profile.institution ?? '',
      corresponding: true,
    };
  }

  private async withSteps<T extends { id: string }>(papers: T[]) {
    if (papers.length === 0) {
      return [];
    }
    const rows = await this.prisma.paper.findMany({
      where: { id: { in: papers.map((paper) => paper.id) } },
      select: {
        id: true,
        status: true,
        trackId: true,
        createdById: true,
        conferenceId: true,
        templateValidatedAt: true,
        decision: { select: { status: true, outcome: true } },
        similarity: { select: { percentage: true, verifiedAt: true } },
        copyright: { select: { status: true } },
        presentation: { select: { id: true } },
        files: { select: { kind: true } },
      },
    });
    const registrations = await this.prisma.registration.findMany({
      where: {
        OR: rows.map((row) => ({ conferenceId: row.conferenceId, userId: row.createdById })),
      },
      select: { conferenceId: true, userId: true, status: true },
    });
    const byId = new Map(rows.map((row) => [row.id, row]));
    return papers.map((paper) => {
      const row = byId.get(paper.id);
      return {
        ...paper,
        steps: row ? paperSteps(row, registrations) : [],
      };
    });
  }

  private async toView(row: PaperRecord, actor: AuthenticatedUser) {
    const file = row.files[0];
    const hideAuthors =
      row.conference.reviewMode === ReviewMode.DOUBLE_BLIND &&
      !this.isManager(actor, row) &&
      row.createdById !== actor.id;
    return {
      id: row.id,
      conferenceId: row.conferenceId,
      trackId: row.trackId,
      publicId: row.publicId,
      title: row.title,
      abstract: row.abstract,
      keywords: row.keywords,
      status: row.status,
      submittedAt: row.submittedAt?.toISOString() ?? null,
      withdrawnAt: row.withdrawnAt?.toISOString() ?? null,
      createdById: hideAuthors ? null : row.createdById,
      authors: hideAuthors
        ? []
        : row.authors.map((author) => ({
            id: author.id,
            position: author.position,
            firstName: author.firstName,
            lastName: author.lastName,
            email: author.email,
            affiliation: author.affiliation,
            corresponding: author.corresponding,
          })),
      manuscript: file
        ? {
            id: file.id,
            originalName: hideAuthors ? 'manuscript.pdf' : file.originalName,
            sizeBytes: file.sizeBytes,
            sha256: file.sha256,
          }
        : null,
    };
  }
}

function safeName(value: string): string {
  const base = value.split(/[/\\]/).pop() ?? 'manuscript.pdf';
  const cleaned = base.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 180);
  return cleaned.length > 0 ? cleaned : 'manuscript.pdf';
}
