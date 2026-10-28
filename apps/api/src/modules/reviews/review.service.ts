import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  assignReviewerSchema,
  conflictSchema,
  declineAssignmentSchema,
  reviewFormSchema,
} from '@scholarflow/validation';
import type { z } from 'zod';
import {
  AssignmentStatus,
  ConferenceRole,
  DecisionOutcome,
  DecisionStatus,
  MembershipStatus,
  PaperFileKind,
  PaperStatus,
  PlatformRole,
  RemarkStatus,
  ReviewMode,
} from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { hashSecret, newSecret } from '../auth/auth.constants.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { EmailService } from '../auth/email.service.js';
import {
  assertSubadminStage,
  type SubadminStage,
} from '../conferences/subadmin-stages.js';

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MANAGERS = new Set<ConferenceRole>([
  ConferenceRole.CHAIR,
  ConferenceRole.ADMINISTRATOR,
  ConferenceRole.COMMITTEE,
]);
const REVIEWERS = new Set<ConferenceRole>([
  ConferenceRole.REVIEWER,
  ConferenceRole.COMMITTEE,
]);
const ACTIVE = new Set<AssignmentStatus>([
  AssignmentStatus.INVITED,
  AssignmentStatus.ACCEPTED,
  AssignmentStatus.IN_PROGRESS,
  AssignmentStatus.OVERDUE,
]);

type AssignInput = z.infer<typeof assignReviewerSchema>;
type ConflictInput = z.infer<typeof conflictSchema>;
type DeclineInput = z.infer<typeof declineAssignmentSchema>;
type ReviewInput = z.infer<typeof reviewFormSchema>;

@Injectable()
export class ReviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
    private readonly config: ConfigService,
  ) {}

  async directory(actor: AuthenticatedUser, conferenceId: string) {
    const conference = await this.loadConference(conferenceId);
    await this.assertManager(actor, conference.memberships, conferenceId, 'assignments');
    const members = conference.memberships.filter(
      (item) => item.status === MembershipStatus.ACTIVE && REVIEWERS.has(item.role),
    );
    return members.map((item) => ({
      userId: item.userId,
      email: item.user.email,
      role: item.role,
      firstName: item.user.profile?.firstName ?? '',
      lastName: item.user.profile?.lastName ?? '',
      institution: item.user.profile?.institution ?? null,
      disciplines: item.user.profile?.disciplines ?? [],
      interests: item.user.profile?.interests ?? null,
      loginPassword: item.user.issuedPassword,
    }));
  }

  async chairs(actor: AuthenticatedUser, conferenceId: string) {
    const conference = await this.loadConference(conferenceId);
    await this.assertManager(actor, conference.memberships, conferenceId, 'program');
    const roles = new Set<ConferenceRole>([
      ConferenceRole.REVIEWER,
      ConferenceRole.COMMITTEE,
      ConferenceRole.CHAIR,
      ConferenceRole.ADMINISTRATOR,
    ]);
    return conference.memberships
      .filter((item) => item.status === MembershipStatus.ACTIVE && roles.has(item.role))
      .map((item) => ({
        userId: item.userId,
        firstName: item.user.profile?.firstName ?? '',
        lastName: item.user.profile?.lastName ?? '',
        email: item.user.email,
        academicTitle: item.user.profile?.academicTitle ?? '',
        loginPassword: item.user.issuedPassword,
      }));
  }

  async declareConflict(
    actor: AuthenticatedUser,
    conferenceId: string,
    input: ConflictInput,
  ) {
    const conference = await this.loadConference(conferenceId);
    await this.assertManager(actor, conference.memberships, conferenceId, 'assignments');
    if (input.paperId) {
      const paper = conference.papers.find((item) => item.id === input.paperId);
      if (!paper) {
        throw new NotFoundException('Paper not found');
      }
    }
    const row = await this.prisma.conflictDeclaration.create({
      data: {
        conferenceId,
        userId: input.userId,
        paperId: input.paperId,
        authorEmail: input.authorEmail?.toLowerCase() ?? null,
        reason: input.reason,
        declaredById: actor.id,
      },
    });
    return { id: row.id };
  }

  async listConflicts(actor: AuthenticatedUser, conferenceId: string) {
    const conference = await this.loadConference(conferenceId);
    await this.assertManager(actor, conference.memberships, conferenceId, 'assignments');
    const rows = await this.prisma.conflictDeclaration.findMany({
      where: { conferenceId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((row) => ({
      id: row.id,
      userId: row.userId,
      paperId: row.paperId,
      authorEmail: row.authorEmail,
      reason: row.reason,
    }));
  }

  async invite(actor: AuthenticatedUser, paperId: string, input: AssignInput) {
    const paper = await this.prisma.paper.findUnique({
      where: { id: paperId },
      include: {
        authors: true,
        conference: {
          include: { memberships: { include: { user: true } }, deadlines: true },
        },
        assignments: true,
      },
    });
    if (!paper || paper.status !== PaperStatus.SUBMITTED) {
      throw new NotFoundException('Paper not found');
    }
    if (paper.scopeStatus !== 'ACCEPTED') {
      throw new ForbiddenException(
        'Accept the paper for presentation before assigning reviewers',
      );
    }
    await this.assertManager(
      actor,
      paper.conference.memberships,
      paper.conferenceId,
      'assignments',
    );
    const reviewer = paper.conference.memberships.find(
      (item) => item.userId === input.reviewerId,
    );
    if (
      !reviewer ||
      reviewer.status !== MembershipStatus.ACTIVE ||
      !REVIEWERS.has(reviewer.role)
    ) {
      throw new ForbiddenException('That person is not a reviewer for this conference');
    }
    if (await this.hasConflict(paper, input.reviewerId, reviewer.user.email)) {
      throw new ConflictException('A conflict of interest blocks this assignment');
    }
    await this.markOverdue(paper.conference.deadlines, paper.assignments);
    const active = paper.assignments.find(
      (item) => item.reviewerId === input.reviewerId && ACTIVE.has(item.status),
    );
    if (active) {
      throw new ConflictException(
        'This reviewer already has an active assignment for the paper',
      );
    }

    const token = newSecret();
    const assignment = await this.prisma.reviewAssignment.create({
      data: {
        paperId,
        reviewerId: input.reviewerId,
        tokenHash: hashSecret(token),
        expiresAt: new Date(Date.now() + INVITE_TTL_MS),
        invitedById: actor.id,
      },
    });
    const link = `${this.config.getOrThrow<string>('APP_PUBLIC_URL')}/workspace/reviews?token=${encodeURIComponent(token)}`;
    const outboxId = await this.email.enqueue(reviewer.user.email, 'review.invitation');
    await this.email.deliver(outboxId, {
      to: reviewer.user.email,
      subject: `Review invitation for ${paper.publicId ?? paper.title}`,
      text: `You are invited to review a submission. Open this link to respond: ${link}`,
    });
    const created = await this.prisma.reviewAssignment.findUniqueOrThrow({
      where: { id: assignment.id },
      include: {
        paper: { include: { conference: true } },
        reviewer: { include: { profile: true } },
      },
    });
    return this.present(created, true);
  }

  async mine(actor: AuthenticatedUser) {
    const rows = await this.prisma.reviewAssignment.findMany({
      where: { reviewerId: actor.id },
      include: {
        paper: { include: { conference: { include: { deadlines: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    });
    for (const row of rows) {
      await this.expireInvitation(row);
      await this.markOverdue(row.paper.conference.deadlines, [row]);
    }
    const fresh = await this.prisma.reviewAssignment.findMany({
      where: { reviewerId: actor.id },
      include: {
        paper: {
          include: {
            conference: true,
            decision: true,
            files: {
              where: { kind: PaperFileKind.REVISION },
              select: {
                kind: true,
                originalName: true,
                contentType: true,
                sizeBytes: true,
              },
              orderBy: { createdAt: 'desc' },
              take: 1,
            },
          },
        },
        form: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    return fresh.map((row) => this.present(row, false));
  }

  async forPaper(actor: AuthenticatedUser, paperId: string) {
    const paper = await this.prisma.paper.findUnique({
      where: { id: paperId },
      include: {
        conference: { include: { memberships: true } },
        authors: true,
        assignments: { include: { reviewer: { include: { profile: true } } } },
      },
    });
    if (!paper) {
      throw new NotFoundException('Paper not found');
    }
    const manager = this.isManager(actor, paper.conference.memberships);
    const author =
      paper.createdById === actor.id ||
      paper.authors.some((item) => item.email === actor.email.toLowerCase());
    if (!manager && !author && actor.platformRole !== PlatformRole.SYSTEM_ADMIN) {
      throw new NotFoundException('Paper not found');
    }
    const reveal = manager || paper.conference.reviewMode === ReviewMode.OPEN;
    return paper.assignments.map((row) =>
      this.present(
        {
          ...row,
          paper: {
            title: paper.title,
            publicId: paper.publicId,
            conferenceId: paper.conferenceId,
          },
        },
        reveal,
      ),
    );
  }

  async respond(actor: AuthenticatedUser, token: string, accept: boolean, reason = '') {
    const row = await this.prisma.reviewAssignment.findUnique({
      where: { tokenHash: hashSecret(token) },
    });
    if (!row || row.reviewerId !== actor.id) {
      throw new NotFoundException('Invitation not found');
    }
    await this.applyResponse(row.id, row.status, row.expiresAt, accept, reason);
  }

  async respondById(
    actor: AuthenticatedUser,
    id: string,
    accept: boolean,
    input?: DeclineInput,
  ) {
    const row = await this.prisma.reviewAssignment.findUnique({ where: { id } });
    if (!row || row.reviewerId !== actor.id) {
      throw new NotFoundException('Invitation not found');
    }
    await this.applyResponse(
      row.id,
      row.status,
      row.expiresAt,
      accept,
      input?.reason ?? '',
    );
  }

  async submitReview(actor: AuthenticatedUser, id: string, input: ReviewInput) {
    const row = await this.prisma.reviewAssignment.findUnique({
      where: { id },
      include: {
        paper: {
          include: {
            authors: true,
            decision: true,
          },
        },
      },
    });
    if (!row || row.reviewerId !== actor.id) {
      throw new NotFoundException('Assignment not found');
    }
    const open = new Set<AssignmentStatus>([
      AssignmentStatus.ACCEPTED,
      AssignmentStatus.IN_PROGRESS,
      AssignmentStatus.OVERDUE,
    ]);
    if (!open.has(row.status)) {
      throw new ForbiddenException('Accept the invitation before sending a review');
    }
    const outcome = this.outcomeFromAdvice(input.recommendation);
    const existing = row.paper.decision;
    const revisionRound =
      existing?.status === DecisionStatus.PUBLISHED &&
      (existing.outcome === DecisionOutcome.CONDITIONALLY_ACCEPTED ||
        existing.outcome === DecisionOutcome.REVISION_REQUIRED);
    await this.prisma.$transaction(async (tx) => {
      await tx.reviewForm.upsert({
        where: { assignmentId: id },
        create: { assignmentId: id, ...input },
        update: input,
      });
      await tx.reviewAssignment.update({
        where: { id },
        data: { status: AssignmentStatus.COMPLETED },
      });
      if (!existing) {
        await tx.decision.create({
          data: {
            paperId: row.paperId,
            outcome,
            letter: input.commentsToAuthor,
            status: DecisionStatus.PUBLISHED,
            publishedAt: new Date(),
            decidedById: actor.id,
          },
        });
      } else if (revisionRound) {
        // After author resubmits, reviewer can accept or ask for more mods.
        await tx.decision.update({
          where: { paperId: row.paperId },
          data: {
            outcome,
            letter: input.commentsToAuthor,
            status: DecisionStatus.PUBLISHED,
            publishedAt: new Date(),
            decidedById: actor.id,
          },
        });
      }
    });
    if (
      revisionRound &&
      (outcome === DecisionOutcome.CONDITIONALLY_ACCEPTED ||
        outcome === DecisionOutcome.REVISION_REQUIRED)
    ) {
      await this.seedMoreRemarks(row.paperId, input.commentsToAuthor);
    }
    const recipients = row.paper.authors.filter((item) => item.corresponding);
    for (const author of recipients) {
      const outboxId = await this.email.enqueue(author.email, 'review.response');
      await this.email.deliver(outboxId, {
        to: author.email,
        subject: revisionRound
          ? `Revision review on ${row.paper.publicId ?? row.paper.title}`
          : `Review on ${row.paper.publicId ?? row.paper.title}`,
        text: input.commentsToAuthor,
      });
    }
  }

  private async seedMoreRemarks(paperId: string, letter: string) {
    const latest = await this.prisma.revisionRemark.findFirst({
      where: { paperId },
      orderBy: { round: 'desc' },
      select: { round: true },
    });
    const text = letter.trim() || 'Address the remaining reviewer comments.';
    await this.prisma.revisionRemark.create({
      data: {
        paperId,
        text,
        round: (latest?.round ?? 0) + 1,
        sortOrder: 0,
        status: RemarkStatus.OPEN,
      },
    });
  }

  private outcomeFromAdvice(
    recommendation: ReviewInput['recommendation'],
  ): DecisionOutcome {
    if (recommendation === 'ACCEPT') {
      return DecisionOutcome.ACCEPTED;
    }
    if (recommendation === 'WEAK_ACCEPT') {
      return DecisionOutcome.CONDITIONALLY_ACCEPTED;
    }
    if (recommendation === 'REJECT') {
      return DecisionOutcome.REJECTED;
    }
    return DecisionOutcome.REVISION_REQUIRED;
  }

  async cancel(actor: AuthenticatedUser, id: string) {
    const row = await this.prisma.reviewAssignment.findUnique({
      where: { id },
      include: { paper: { include: { conference: { include: { memberships: true } } } } },
    });
    if (!row) {
      throw new NotFoundException('Assignment not found');
    }
    await this.assertManager(
      actor,
      row.paper.conference.memberships,
      row.paper.conferenceId,
      'assignments',
    );
    if (
      row.status === AssignmentStatus.DECLINED ||
      row.status === AssignmentStatus.CANCELLED ||
      row.status === AssignmentStatus.COMPLETED
    ) {
      throw new ForbiddenException('This assignment can no longer be cancelled');
    }
    await this.prisma.reviewAssignment.update({
      where: { id },
      data: { status: AssignmentStatus.CANCELLED, respondedAt: new Date() },
    });
  }

  private async applyResponse(
    id: string,
    status: AssignmentStatus,
    expiresAt: Date,
    accept: boolean,
    reason: string,
  ) {
    if (status !== AssignmentStatus.INVITED) {
      throw new ForbiddenException('This invitation has already been answered');
    }
    if (expiresAt.getTime() <= Date.now()) {
      await this.prisma.reviewAssignment.update({
        where: { id },
        data: { status: AssignmentStatus.CANCELLED, respondedAt: new Date() },
      });
      throw new ForbiddenException('This invitation has expired');
    }
    await this.prisma.reviewAssignment.update({
      where: { id },
      data: {
        status: accept ? AssignmentStatus.ACCEPTED : AssignmentStatus.DECLINED,
        respondedAt: new Date(),
      },
    });
    if (!accept && reason) {
      await this.prisma.auditLog.create({
        data: {
          action: 'review.declined',
          resourceType: 'review_assignment',
          resourceId: id,
          metadata: { reason },
        },
      });
    }
  }

  private async hasConflict(
    paper: {
      id: string;
      conferenceId: string;
      createdById: string;
      authors: { email: string }[];
    },
    reviewerId: string,
    reviewerEmail: string,
  ): Promise<boolean> {
    if (reviewerId === paper.createdById) {
      return true;
    }
    if (paper.authors.some((author) => author.email === reviewerEmail.toLowerCase())) {
      return true;
    }
    const declared = await this.prisma.conflictDeclaration.findFirst({
      where: {
        conferenceId: paper.conferenceId,
        userId: reviewerId,
        OR: [
          { paperId: paper.id },
          { authorEmail: { in: paper.authors.map((author) => author.email) } },
        ],
      },
    });
    return declared !== null;
  }

  private async expireInvitation(row: {
    id: string;
    status: AssignmentStatus;
    expiresAt: Date;
  }) {
    if (
      row.status === AssignmentStatus.INVITED &&
      row.expiresAt.getTime() <= Date.now()
    ) {
      await this.prisma.reviewAssignment.update({
        where: { id: row.id },
        data: { status: AssignmentStatus.CANCELLED, respondedAt: new Date() },
      });
    }
  }

  private async markOverdue(
    deadlines: { kind: string; dueAt: Date; trackId: string | null }[],
    assignments: { id: string; status: AssignmentStatus }[],
  ) {
    const reviewDeadline = deadlines.find(
      (item) => item.kind === 'REVIEW' && item.trackId === null,
    );
    if (!reviewDeadline || reviewDeadline.dueAt.getTime() > Date.now()) {
      return;
    }
    const ids = assignments
      .filter(
        (item) =>
          item.status === AssignmentStatus.ACCEPTED ||
          item.status === AssignmentStatus.IN_PROGRESS ||
          item.status === AssignmentStatus.INVITED,
      )
      .map((item) => item.id);
    if (ids.length === 0) {
      return;
    }
    await this.prisma.reviewAssignment.updateMany({
      where: { id: { in: ids } },
      data: { status: AssignmentStatus.OVERDUE },
    });
  }

  private present(
    row: {
      id: string;
      paperId: string;
      reviewerId: string;
      status: AssignmentStatus;
      expiresAt: Date;
      paper: {
        title: string;
        publicId: string | null;
        conferenceId: string;
        conference?: { name: string } | null;
        decision?: {
          status: DecisionStatus;
          outcome: DecisionOutcome;
        } | null;
        files?: {
          kind: string;
          originalName: string;
          contentType: string | null;
          sizeBytes: number;
        }[];
      };
      reviewer?: {
        email: string;
        profile: { firstName: string; lastName: string } | null;
      };
      form?: {
        score: number;
        recommendation: string;
        commentsToAuthor: string;
      } | null;
    },
    revealReviewer: boolean,
  ) {
    const decision =
      row.paper.decision?.status === DecisionStatus.PUBLISHED
        ? row.paper.decision.outcome
        : null;
    const revisionFile = row.paper.files?.[0] ?? null;
    const needsRevision =
      decision === DecisionOutcome.CONDITIONALLY_ACCEPTED ||
      decision === DecisionOutcome.REVISION_REQUIRED;
    const openForReview =
      row.status === AssignmentStatus.ACCEPTED ||
      row.status === AssignmentStatus.IN_PROGRESS ||
      row.status === AssignmentStatus.OVERDUE;
    return {
      id: row.id,
      paperId: row.paperId,
      conferenceId: row.paper.conferenceId,
      conferenceName: row.paper.conference?.name ?? null,
      paperTitle: row.paper.title,
      publicId: row.paper.publicId,
      status: row.status,
      expiresAt: row.expiresAt.toISOString(),
      reviewerId: revealReviewer ? row.reviewerId : null,
      reviewerName:
        revealReviewer && row.reviewer?.profile
          ? `${row.reviewer.profile.firstName} ${row.reviewer.profile.lastName}`
          : null,
      score: row.form?.score ?? null,
      recommendation: row.form?.recommendation ?? null,
      commentsToAuthor: row.form?.commentsToAuthor ?? null,
      decisionOutcome: decision,
      hasRevision: Boolean(revisionFile),
      revisionFile: revisionFile
        ? {
            kind: revisionFile.kind,
            originalName: revisionFile.originalName,
            contentType: revisionFile.contentType,
            sizeBytes: revisionFile.sizeBytes,
          }
        : null,
      awaitingAuthorRevision: needsRevision && !revisionFile,
      needsRereview: needsRevision && Boolean(revisionFile) && openForReview,
    };
  }

  private async loadConference(id: string) {
    const conference = await this.prisma.conference.findUnique({
      where: { id },
      include: {
        memberships: { include: { user: { include: { profile: true } } } },
        papers: { select: { id: true } },
      },
    });
    if (!conference) {
      throw new NotFoundException('Conference not found');
    }
    return conference;
  }

  private isManager(
    actor: AuthenticatedUser,
    memberships: { userId: string; role: ConferenceRole; status: MembershipStatus }[],
  ): boolean {
    if (actor.platformRole === PlatformRole.SYSTEM_ADMIN) {
      return true;
    }
    const membership = memberships.find((item) => item.userId === actor.id);
    return (
      membership?.status === MembershipStatus.ACTIVE && MANAGERS.has(membership.role)
    );
  }

  private async assertManager(
    actor: AuthenticatedUser,
    memberships: { userId: string; role: ConferenceRole; status: MembershipStatus }[],
    conferenceId: string,
    stage: SubadminStage,
  ) {
    if (!this.isManager(actor, memberships)) {
      throw new ForbiddenException('You cannot manage reviews for this conference');
    }
    await assertSubadminStage(this.prisma, actor, memberships, conferenceId, stage);
  }
}
