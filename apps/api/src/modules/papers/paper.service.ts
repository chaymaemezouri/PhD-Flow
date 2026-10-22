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
  cancelPaperSchema,
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
const SUBMITTERS = new Set<ConferenceRole>([ConferenceRole.AUTHOR]);
const ORGANIZERS = new Set<ConferenceRole>([
  ConferenceRole.CHAIR,
  ConferenceRole.ADMINISTRATOR,
  ConferenceRole.COMMITTEE,
  ConferenceRole.REVIEWER,
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
type CancelInput = z.infer<typeof cancelPaperSchema>;

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
  decision: { select: { outcome: true, status: true, letter: true } },
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
    await this.joinPublished(actor, conference);
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
        paperKind: input.paperKind,
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
      where:
        actor.platformRole === PlatformRole.SYSTEM_ADMIN
          ? {}
          : {
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
    return { ...view, dossier: await this.dossier(row, actor) };
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
        ...(input.paperKind !== undefined ? { paperKind: input.paperKind } : {}),
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
    return this.downloadByKind(actor, id, PaperFileKind.MANUSCRIPT);
  }

  async downloadByKind(actor: AuthenticatedUser, id: string, kind: PaperFileKind) {
    const row = await this.load(id);
    await this.assertReadable(actor, row);
    const file =
      kind === PaperFileKind.MANUSCRIPT
        ? row.files[0]
        : await this.prisma.paperFile.findFirst({
            where: { paperId: id, kind },
            orderBy: { createdAt: 'desc' },
          });
    if (!file) {
      throw new NotFoundException('File not found');
    }
    const bytes = await this.storage.get(file.storageKey);
    const hideName =
      row.conference.reviewMode === ReviewMode.DOUBLE_BLIND &&
      !this.isManager(actor, row) &&
      row.createdById !== actor.id;
    const fallback =
      kind === PaperFileKind.MANUSCRIPT
        ? 'manuscript.pdf'
        : `${kind.toLowerCase().replace(/_/g, '-')}.bin`;
    return {
      name: hideName ? fallback : file.originalName,
      bytes,
      contentType: file.contentType || 'application/octet-stream',
    };
  }

  async decideScope(
    actor: AuthenticatedUser,
    id: string,
    accept: boolean,
    reason = '',
  ) {
    const row = await this.load(id);
    if (!this.isManager(actor, row)) {
      throw new ForbiddenException('You cannot change this conference');
    }
    if (row.status !== 'SUBMITTED') {
      throw new ForbiddenException('Submit the paper before the scope check');
    }
    if (row.scopeStatus !== 'PENDING') {
      throw new ForbiddenException('The scope has already been decided');
    }
    const note = accept ? '' : reason.trim();
    if (!accept && note.length < 3) {
      throw new BadRequestException('A reason is required when the paper is not accepted');
    }
    await this.prisma.paper.update({
      where: { id },
      data: {
        scopeStatus: accept ? 'ACCEPTED' : 'REFUSED',
        scopeReason: note,
      },
    });
    return this.getOne(actor, id);
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
      const publicId = publicPaperId(
        counter.slug,
        counter.startsOn,
        counter.nextPaperNumber,
      );
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

  async cancel(actor: AuthenticatedUser, id: string, input: CancelInput) {
    const row = await this.load(id);
    await this.assertReadable(actor, row);
    const manager = this.isManager(actor, row);
    if (row.createdById !== actor.id && !manager) {
      throw new ForbiddenException('You cannot cancel this paper');
    }
    if (row.status !== PaperStatus.DRAFT) {
      throw new ForbiddenException('Only a draft paper can be cancelled');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.paper.update({
        where: { id },
        data: { status: PaperStatus.CANCELLED },
      });
      await tx.paperStatusEvent.create({
        data: {
          paperId: id,
          fromStatus: PaperStatus.DRAFT,
          toStatus: PaperStatus.CANCELLED,
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

  private async joinPublished(
    actor: AuthenticatedUser,
    conference: {
      id: string;
      status: ConferenceStatus;
      visibility: string;
      memberships: { userId: string; role: ConferenceRole; status: MembershipStatus }[];
    },
  ) {
    if (actor.platformRole === PlatformRole.SYSTEM_ADMIN) {
      return;
    }
    if (
      conference.status !== ConferenceStatus.PUBLISHED ||
      conference.visibility !== 'PUBLIC'
    ) {
      return;
    }
    const organizer = await this.prisma.membership.findFirst({
      where: {
        userId: actor.id,
        status: MembershipStatus.ACTIVE,
        role: { in: [...ORGANIZERS] },
      },
    });
    if (organizer) {
      return;
    }
    const current = conference.memberships.find((item) => item.userId === actor.id);
    if (current?.status === MembershipStatus.ACTIVE && SUBMITTERS.has(current.role)) {
      return;
    }
    if (
      current?.status === MembershipStatus.ACTIVE ||
      current?.status === MembershipStatus.INVITED
    ) {
      return;
    }
    const membership = await this.prisma.membership.upsert({
      where: {
        conferenceId_userId: { conferenceId: conference.id, userId: actor.id },
      },
      create: {
        conferenceId: conference.id,
        userId: actor.id,
        role: ConferenceRole.AUTHOR,
        status: MembershipStatus.ACTIVE,
      },
      update: {
        role: ConferenceRole.AUTHOR,
        status: MembershipStatus.ACTIVE,
      },
    });
    const next = conference.memberships.filter((item) => item.userId !== actor.id);
    next.push(membership);
    conference.memberships.splice(0, conference.memberships.length, ...next);
  }

  private assertSubmitter(
    actor: AuthenticatedUser,
    memberships: { userId: string; role: ConferenceRole; status: MembershipStatus }[],
  ) {
    if (actor.platformRole === PlatformRole.SYSTEM_ADMIN) {
      throw new ForbiddenException('You cannot submit to this conference');
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
    if ((row.sessionChairIds ?? []).includes(actor.id)) {
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
        decision: { select: { status: true, outcome: true, letter: true } },
        similarity: { select: { percentage: true, verifiedAt: true } },
        copyright: { select: { status: true } },
        presentation: { select: { id: true } },
        files: { select: { kind: true } },
        _count: { select: { assignments: true } },
      },
    });
    const registrations = await this.prisma.registration.findMany({
      where: {
        OR: rows.map((row) => ({
          conferenceId: row.conferenceId,
          userId: row.createdById,
        })),
      },
      select: { conferenceId: true, userId: true, status: true },
    });
    const byId = new Map(rows.map((row) => [row.id, row]));
    return papers.map((paper) => {
      const row = byId.get(paper.id);
      return {
        ...paper,
        assignmentCount: row?._count.assignments ?? 0,
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
      conferenceName: row.conference.name,
      trackId: row.trackId,
      publicId: row.publicId,
      title: row.title,
      abstract: row.abstract,
      keywords: row.keywords,
      status: row.status,
      paperKind: row.paperKind,
      scopeStatus: row.scopeStatus,
      doi: row.doi,
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
      decision: (() => {
        if (!row.decision) {
          return null;
        }
        const ownerOrManager =
          this.isManager(actor, row) || row.createdById === actor.id;
        const published = row.decision.status === 'PUBLISHED';
        // Full workflow visibility for every reader (reviewer, session chair, …):
        // published outcome/status; letter stays private to author/managers.
        if (!ownerOrManager && !published) {
          return null;
        }
        return {
          outcome: row.decision.outcome,
          status: row.decision.status,
          letter: ownerOrManager ? row.decision.letter : undefined,
        };
      })(),
      manuscript: file
        ? {
            id: file.id,
            originalName: hideAuthors ? 'manuscript.pdf' : file.originalName,
            sizeBytes: file.sizeBytes,
            contentType: file.contentType,
            sha256: file.sha256,
          }
        : null,
    };
  }

  private async dossier(row: PaperRecord, actor: AuthenticatedUser) {
    const manager = this.isManager(actor, row);
    const [
      files,
      similarity,
      copyright,
      presentation,
      registration,
      assignments,
      track,
      chairUsers,
      remarks,
      slidesRemarks,
      cameraReadyRemarks,
    ] = await Promise.all([
      this.prisma.paperFile.findMany({
        where: { paperId: row.id },
        select: {
          kind: true,
          originalName: true,
          contentType: true,
          sizeBytes: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.similarityReport.findUnique({ where: { paperId: row.id } }),
      this.prisma.copyrightRecord.findUnique({ where: { paperId: row.id } }),
      this.prisma.presentation.findFirst({
        where: { paperId: row.id },
        include: {
          session: {
            include: { room: true },
          },
        },
      }),
      this.prisma.registration.findUnique({
        where: {
          conferenceId_userId: {
            conferenceId: row.conferenceId,
            userId: row.createdById,
          },
        },
      }),
      this.prisma.reviewAssignment.findMany({
        where: { paperId: row.id },
        include: {
          reviewer: { include: { profile: true } },
          form: true,
        },
        orderBy: { createdAt: 'asc' },
      }),
      row.trackId
        ? this.prisma.track.findUnique({ where: { id: row.trackId } })
        : Promise.resolve(null),
      (row.sessionChairIds ?? []).length > 0
        ? this.prisma.user.findMany({
            where: { id: { in: row.sessionChairIds ?? [] } },
            include: { profile: true },
          })
        : Promise.resolve([]),
      this.prisma.revisionRemark.findMany({
        where: { paperId: row.id },
        orderBy: [{ round: 'desc' }, { sortOrder: 'asc' }],
      }),
      this.prisma.presentationRemark.findMany({
        where: { paperId: row.id },
        orderBy: [{ round: 'desc' }, { sortOrder: 'asc' }],
      }),
      this.prisma.cameraReadyRemark.findMany({
        where: { paperId: row.id },
        orderBy: [{ round: 'desc' }, { sortOrder: 'asc' }],
      }),
    ]);
    const currentRound = remarks[0]?.round ?? 0;
    const activeRemarks = remarks.filter((item) => item.round === currentRound);
    const slidesRound = slidesRemarks[0]?.round ?? 0;
    const activeSlidesRemarks = slidesRemarks.filter(
      (item) => item.round === slidesRound,
    );
    const cameraRound = cameraReadyRemarks[0]?.round ?? 0;
    const activeCameraRemarks = cameraReadyRemarks.filter(
      (item) => item.round === cameraRound,
    );
    return {
      paperKind: row.paperKind,
      scopeStatus: row.scopeStatus,
      scopeReason: row.scopeReason || null,
      conferenceName: row.conference.name,
      trackName: track ? `${track.code} · ${track.name}` : null,
      canManage: manager,
      isAuthor: row.createdById === actor.id,
      templateValidated: row.templateValidatedAt !== null,
      doi: row.doi,
      files: dedupeFiles(files).map((file) => ({
        kind: file.kind,
        originalName: file.originalName,
        contentType: file.contentType,
        sizeBytes: file.sizeBytes,
      })),
      similarity: similarity
        ? { percentage: similarity.percentage, verified: similarity.verifiedAt !== null }
        : null,
      copyrightStatus: copyright?.status ?? null,
      presented: row.presentedAt !== null || presentation?.presentedAt !== null,
      presentedAt:
        (presentation?.presentedAt ?? row.presentedAt)?.toISOString() ?? null,
      scheduled: presentation !== null,
      schedule: presentation
        ? {
            presentationId: presentation.id,
            sessionTitle: presentation.session.title,
            roomName: presentation.session.room.name,
            startsAt: presentation.session.startsAt.toISOString(),
            endsAt: presentation.session.endsAt.toISOString(),
            modality: presentation.modality,
            score: presentation.score,
            chairRemarks: presentation.comment || row.sessionComment || null,
          }
        : null,
      slidesStatus: row.slidesStatus,
      cameraReadyStatus: row.cameraReadyStatus,
      similarityStatus: row.similarityStatus,
      copyrightStageStatus: row.copyrightStageStatus,
      sessionComment: row.sessionComment,
      sessionChairs: chairUsers.map((user) => ({
        userId: user.id,
        name: `${user.profile?.firstName ?? ''} ${user.profile?.lastName ?? ''}`.trim(),
        mine: user.id === actor.id,
      })),
      slides: files.some((file) => file.kind === 'SLIDES'),
      paymentProof: files.some((file) => file.kind === 'PAYMENT_PROOF'),
      paymentsEnabled: row.conference.paymentsEnabled,
      registration: registration
        ? { status: registration.status, paymentStatus: registration.paymentStatus }
        : null,
      reviews: assignments.map((item) => ({
        id: item.id,
        status: item.status,
        dueAt: item.expiresAt.toISOString(),
        assignedAt: item.createdAt.toISOString(),
        reviewer:
          manager || item.reviewerId === actor.id
            ? `${item.reviewer.profile?.firstName ?? ''} ${item.reviewer.profile?.lastName ?? ''}`.trim()
            : '',
        recommendation: item.form?.recommendation ?? null,
        comments: item.form?.commentsToAuthor ?? '',
        mine: item.reviewerId === actor.id,
      })),
      remarks: activeRemarks.map((item) => ({
        id: item.id,
        text: item.text,
        status: item.status,
        round: item.round,
      })),
      remarksRound: currentRound || null,
      remarksDone:
        activeRemarks.length > 0 &&
        activeRemarks.every((item) => item.status === 'VALIDATED'),
      slidesRemarks: activeSlidesRemarks.map((item) => ({
        id: item.id,
        text: item.text,
        status: item.status,
        round: item.round,
      })),
      cameraReadyRemarks: activeCameraRemarks.map((item) => ({
        id: item.id,
        text: item.text,
        status: item.status,
        round: item.round,
      })),
    };
  }
}

function publicPaperId(slug: string, startsOn: Date | null, number: number): string {
  const year = startsOn?.getUTCFullYear() ?? new Date().getUTCFullYear();
  const code = slug.toUpperCase();
  const prefix = code.endsWith(`-${year}`) ? code : `${code}-${year}`;
  return `${prefix}-${String(number).padStart(4, '0')}`;
}

function safeName(value: string): string {
  const base = value.split(/[/\\]/).pop() ?? 'manuscript.pdf';
  const cleaned = base.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 180);
  return cleaned.length > 0 ? cleaned : 'manuscript.pdf';
}

function dedupeFiles<T extends { kind: string }>(files: T[]): T[] {
  const seen = new Set<string>();
  const unique: T[] = [];
  for (const file of files) {
    if (seen.has(file.kind)) {
      continue;
    }
    seen.add(file.kind);
    unique.push(file);
  }
  return unique;
}
