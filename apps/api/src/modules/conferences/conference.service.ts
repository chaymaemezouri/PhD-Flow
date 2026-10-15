import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  createConferenceSchema,
  deadlineSchema,
  inviteMemberSchema,
  templateSchema,
  trackSchema,
  updateConferenceSchema,
} from '@scholarflow/validation';
import type { z } from 'zod';
import {
  ConferenceRole,
  MembershipStatus,
  PlatformRole,
  Prisma,
} from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { hashSecret, newSecret } from '../auth/auth.constants.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { EmailService } from '../auth/email.service.js';

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MANAGERS = new Set<ConferenceRole>([
  ConferenceRole.CHAIR,
  ConferenceRole.ADMINISTRATOR,
]);
const MEMBER_READERS = new Set<ConferenceRole>([
  ConferenceRole.CHAIR,
  ConferenceRole.ADMINISTRATOR,
  ConferenceRole.COMMITTEE,
]);

type CreateInput = z.infer<typeof createConferenceSchema>;
type UpdateInput = z.infer<typeof updateConferenceSchema>;
type TrackInput = z.infer<typeof trackSchema>;
type DeadlineInput = z.infer<typeof deadlineSchema>;
type TemplateInput = z.infer<typeof templateSchema>;
type InviteInput = z.infer<typeof inviteMemberSchema>;

const conferenceInclude = {
  tracks: { orderBy: { sortOrder: 'asc' as const } },
  deadlines: { orderBy: { dueAt: 'asc' as const } },
  templates: true,
  memberships: {
    include: { user: { include: { profile: true } } },
    orderBy: { createdAt: 'asc' as const },
  },
  invitations: { orderBy: { createdAt: 'desc' as const } },
  registrations: { include: { user: { include: { profile: true } } } },
} satisfies Prisma.ConferenceInclude;

type ConferenceRecord = Prisma.ConferenceGetPayload<{
  include: typeof conferenceInclude;
}>;

@Injectable()
export class ConferenceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
    private readonly config: ConfigService,
  ) {}

  async listPublic() {
    const rows = await this.prisma.conference.findMany({
      where: { status: 'PUBLISHED', visibility: 'PUBLIC' },
      include: conferenceInclude,
      orderBy: { startsOn: 'asc' },
    });
    return rows.map((row) => this.toPublic(row));
  }

  async getPublic(slug: string) {
    const row = await this.prisma.conference.findFirst({
      where: { slug, status: 'PUBLISHED', visibility: 'PUBLIC' },
      include: conferenceInclude,
    });
    if (!row) {
      throw new NotFoundException('Conference not found');
    }
    return this.toPublic(row);
  }

  async listMine(actor: AuthenticatedUser) {
    const rows = await this.prisma.membership.findMany({
      where: {
        userId: actor.id,
        status: { in: [MembershipStatus.ACTIVE, MembershipStatus.INVITED] },
      },
      include: { conference: true },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((row) => ({
      id: row.conference.id,
      slug: row.conference.slug,
      name: row.conference.name,
      shortName: row.conference.shortName,
      status: row.conference.status,
      visibility: row.conference.visibility,
      city: row.conference.city,
      country: row.conference.country,
      startsOn: day(row.conference.startsOn),
      endsOn: day(row.conference.endsOn),
      role: row.role,
      membershipStatus: row.status,
    }));
  }

  async create(actor: AuthenticatedUser, input: CreateInput) {
    const slug = await this.uniqueSlug(input.shortName);
    const created = await this.prisma.$transaction(async (tx) => {
      const conference = await tx.conference.create({
        data: {
          name: input.name,
          shortName: input.shortName,
          description: input.description,
          website: blank(input.website),
          city: blank(input.city),
          country: blank(input.country),
          startsOn: input.startsOn ? parseDay(input.startsOn) : null,
          endsOn: input.endsOn ? parseDay(input.endsOn) : null,
          timezone: input.timezone,
          visibility: input.visibility,
          reviewMode: input.reviewMode,
          paymentsEnabled: input.paymentsEnabled,
          slug,
          createdById: actor.id,
          memberships: {
            create: {
              userId: actor.id,
              role: ConferenceRole.CHAIR,
              status: MembershipStatus.ACTIVE,
            },
          },
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: 'conference.create',
          resourceType: 'conference',
          resourceId: conference.id,
          metadata: { slug },
        },
      });
      return conference;
    });
    return this.getOne(actor, created.id);
  }

  async getOne(actor: AuthenticatedUser, id: string) {
    const row = await this.load(id);
    this.assertReadable(actor, row);
    return this.toDetail(actor, row);
  }

  async update(actor: AuthenticatedUser, id: string, input: UpdateInput) {
    const row = await this.load(id);
    this.assertManager(actor, row);
    await this.prisma.$transaction(async (tx) => {
      await tx.conference.update({
        where: { id },
        data: this.writable(input),
      });
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: 'conference.update',
          resourceType: 'conference',
          resourceId: id,
          metadata: {},
        },
      });
    });
    return this.getOne(actor, id);
  }

  async addTrack(actor: AuthenticatedUser, conferenceId: string, input: TrackInput) {
    const row = await this.load(conferenceId);
    this.assertManager(actor, row);
    try {
      const track = await this.prisma.track.create({
        data: {
          conferenceId,
          name: input.name,
          code: input.code.toUpperCase(),
          description: input.description,
          sortOrder: row.tracks.length,
        },
      });
      return {
        id: track.id,
        name: track.name,
        code: track.code,
        description: track.description,
      };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('A track with this code already exists');
      }
      throw error;
    }
  }

  async removeTrack(actor: AuthenticatedUser, conferenceId: string, trackId: string) {
    const row = await this.load(conferenceId);
    this.assertManager(actor, row);
    const track = row.tracks.find((item) => item.id === trackId);
    if (!track) {
      throw new NotFoundException('Track not found');
    }
    await this.prisma.track.delete({ where: { id: trackId } });
  }

  async addDeadline(
    actor: AuthenticatedUser,
    conferenceId: string,
    input: DeadlineInput,
  ) {
    const row = await this.load(conferenceId);
    this.assertManager(actor, row);
    if (input.trackId && !row.tracks.some((track) => track.id === input.trackId)) {
      throw new NotFoundException('Track not found');
    }
    const deadline = await this.prisma.deadline.create({
      data: {
        conferenceId,
        trackId: input.trackId,
        kind: input.kind,
        label: input.label,
        dueAt: new Date(input.dueAt),
      },
    });
    return {
      id: deadline.id,
      kind: deadline.kind,
      label: deadline.label,
      dueAt: deadline.dueAt.toISOString(),
      trackId: deadline.trackId,
    };
  }

  async removeDeadline(
    actor: AuthenticatedUser,
    conferenceId: string,
    deadlineId: string,
  ) {
    const row = await this.load(conferenceId);
    this.assertManager(actor, row);
    const deadline = row.deadlines.find((item) => item.id === deadlineId);
    if (!deadline) {
      throw new NotFoundException('Deadline not found');
    }
    await this.prisma.deadline.delete({ where: { id: deadlineId } });
  }

  async saveTemplate(
    actor: AuthenticatedUser,
    conferenceId: string,
    input: TemplateInput,
  ) {
    const row = await this.load(conferenceId);
    this.assertManager(actor, row);
    const template = await this.prisma.conferenceTemplate.upsert({
      where: {
        conferenceId_kind_language: {
          conferenceId,
          kind: input.kind,
          language: input.language,
        },
      },
      create: {
        conferenceId,
        kind: input.kind,
        language: input.language,
        subject: input.subject,
        body: input.body,
      },
      update: { subject: input.subject, body: input.body },
    });
    return {
      id: template.id,
      kind: template.kind,
      language: template.language,
      subject: template.subject,
      body: template.body,
    };
  }

  async joinPublic(actor: AuthenticatedUser, conferenceId: string) {
    const row = await this.prisma.conference.findUnique({
      where: { id: conferenceId },
      include: { memberships: true },
    });
    if (!row || row.status !== 'PUBLISHED' || row.visibility !== 'PUBLIC') {
      throw new NotFoundException('Conference not found');
    }
    const existing = row.memberships.find((item) => item.userId === actor.id);
    if (existing?.status === MembershipStatus.ACTIVE) {
      throw new ConflictException('You are already a member of this conference');
    }
    const membership = existing
      ? await this.prisma.membership.update({
          where: { id: existing.id },
          data: { status: MembershipStatus.ACTIVE },
        })
      : await this.prisma.membership.create({
          data: {
            conferenceId,
            userId: actor.id,
            role: ConferenceRole.AUTHOR,
            status: MembershipStatus.ACTIVE,
          },
        });
    return {
      id: row.id,
      name: row.name,
      role: membership.role,
      membershipStatus: membership.status,
    };
  }

  async invite(actor: AuthenticatedUser, conferenceId: string, input: InviteInput) {
    const row = await this.load(conferenceId);
    this.assertManager(actor, row);
    const email = input.email.toLowerCase();
    if (email === actor.email.toLowerCase()) {
      throw new ConflictException('You are already a member of this conference');
    }
    const existingUser = await this.prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      const membership = row.memberships.find((item) => item.userId === existingUser.id);
      if (membership && membership.status === MembershipStatus.ACTIVE) {
        throw new ConflictException('That person is already a member');
      }
    }

    const token = newSecret();
    await this.prisma.$transaction(async (tx) => {
      await tx.conferenceInvitation.updateMany({
        where: { conferenceId, email, acceptedAt: null, declinedAt: null },
        data: { declinedAt: new Date() },
      });
      await tx.conferenceInvitation.create({
        data: {
          conferenceId,
          email,
          role: input.role,
          tokenHash: hashSecret(token),
          expiresAt: new Date(Date.now() + INVITE_TTL_MS),
          invitedById: actor.id,
        },
      });
      if (existingUser) {
        await tx.membership.upsert({
          where: { conferenceId_userId: { conferenceId, userId: existingUser.id } },
          create: {
            conferenceId,
            userId: existingUser.id,
            role: input.role,
            status: MembershipStatus.INVITED,
          },
          update: { role: input.role, status: MembershipStatus.INVITED },
        });
      }
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: 'conference.invite',
          resourceType: 'conference',
          resourceId: conferenceId,
          metadata: { email, role: input.role },
        },
      });
    });

    const link = `${this.config.getOrThrow<string>('APP_PUBLIC_URL')}/invitations/accept?token=${encodeURIComponent(token)}`;
    const outboxId = await this.email.enqueue(email, 'conference.invitation');
    await this.email.deliver(outboxId, {
      to: email,
      subject: `Invitation to ${row.name}`,
      text: `You have been invited to ${row.name} as ${input.role}. Open this link to respond: ${link}`,
    });
    return { sent: true };
  }

  async respond(actor: AuthenticatedUser, token: string, accept: boolean) {
    const invitation = await this.prisma.conferenceInvitation.findUnique({
      where: { tokenHash: hashSecret(token) },
    });
    if (
      !invitation ||
      invitation.acceptedAt ||
      invitation.declinedAt ||
      invitation.expiresAt.getTime() <= Date.now()
    ) {
      throw new NotFoundException('Invitation not found');
    }
    if (invitation.email !== actor.email.toLowerCase()) {
      throw new ForbiddenException(
        'This invitation was sent to a different email address',
      );
    }
    await this.applyInvitation(actor, invitation, accept);
  }

  async respondMine(actor: AuthenticatedUser, conferenceId: string, accept: boolean) {
    const invitation = await this.prisma.conferenceInvitation.findFirst({
      where: {
        conferenceId,
        email: actor.email.toLowerCase(),
        acceptedAt: null,
        declinedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (!invitation) {
      throw new NotFoundException('Invitation not found');
    }
    await this.applyInvitation(actor, invitation, accept);
  }

  private async applyInvitation(
    actor: AuthenticatedUser,
    invitation: { id: string; conferenceId: string; role: ConferenceRole },
    accept: boolean,
  ) {
    await this.prisma.$transaction(async (tx) => {
      if (accept) {
        await tx.membership.upsert({
          where: {
            conferenceId_userId: {
              conferenceId: invitation.conferenceId,
              userId: actor.id,
            },
          },
          create: {
            conferenceId: invitation.conferenceId,
            userId: actor.id,
            role: invitation.role,
            status: MembershipStatus.ACTIVE,
          },
          update: { role: invitation.role, status: MembershipStatus.ACTIVE },
        });
        await tx.conferenceInvitation.update({
          where: { id: invitation.id },
          data: { acceptedAt: new Date() },
        });
      } else {
        await tx.membership.updateMany({
          where: { conferenceId: invitation.conferenceId, userId: actor.id },
          data: { status: MembershipStatus.DECLINED },
        });
        await tx.conferenceInvitation.update({
          where: { id: invitation.id },
          data: { declinedAt: new Date() },
        });
      }
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: accept
            ? 'conference.invitation_accepted'
            : 'conference.invitation_declined',
          resourceType: 'conference',
          resourceId: invitation.conferenceId,
          metadata: {},
        },
      });
    });
  }

  async removeMember(
    actor: AuthenticatedUser,
    conferenceId: string,
    membershipId: string,
  ) {
    const row = await this.load(conferenceId);
    this.assertManager(actor, row);
    const membership = row.memberships.find((item) => item.id === membershipId);
    if (!membership) {
      throw new NotFoundException('Membership not found');
    }
    if (membership.role === ConferenceRole.CHAIR) {
      throw new ForbiddenException('The chair membership cannot be removed');
    }
    await this.prisma.membership.update({
      where: { id: membershipId },
      data: { status: MembershipStatus.REMOVED },
    });
  }

  private async load(id: string): Promise<ConferenceRecord> {
    const row = await this.prisma.conference.findUnique({
      where: { id },
      include: conferenceInclude,
    });
    if (!row) {
      throw new NotFoundException('Conference not found');
    }
    return row;
  }

  private membershipOf(actor: AuthenticatedUser, row: ConferenceRecord) {
    return row.memberships.find((item) => item.userId === actor.id) ?? null;
  }

  private assertReadable(actor: AuthenticatedUser, row: ConferenceRecord): void {
    if (actor.platformRole === PlatformRole.SYSTEM_ADMIN) {
      return;
    }
    const membership = this.membershipOf(actor, row);
    if (
      membership &&
      (membership.status === MembershipStatus.ACTIVE ||
        membership.status === MembershipStatus.INVITED)
    ) {
      return;
    }
    throw new NotFoundException('Conference not found');
  }

  private assertManager(actor: AuthenticatedUser, row: ConferenceRecord): void {
    if (actor.platformRole === PlatformRole.SYSTEM_ADMIN) {
      return;
    }
    const membership = this.membershipOf(actor, row);
    if (
      membership &&
      membership.status === MembershipStatus.ACTIVE &&
      MANAGERS.has(membership.role)
    ) {
      return;
    }
    throw new ForbiddenException('You cannot change this conference');
  }

  private toPublic(row: ConferenceRecord) {
    return {
      id: row.id,
      slug: row.slug,
      name: row.name,
      shortName: row.shortName,
      description: row.description,
      website: row.website,
      city: row.city,
      country: row.country,
      startsOn: day(row.startsOn),
      endsOn: day(row.endsOn),
      timezone: row.timezone,
      reviewMode: row.reviewMode,
      tracks: row.tracks.map((track) => ({
        id: track.id,
        name: track.name,
        code: track.code,
        description: track.description,
      })),
      deadlines: row.deadlines.map((deadline) => ({
        id: deadline.id,
        kind: deadline.kind,
        label: deadline.label,
        dueAt: deadline.dueAt.toISOString(),
        trackId: deadline.trackId,
      })),
    };
  }

  private toDetail(actor: AuthenticatedUser, row: ConferenceRecord) {
    const membership = this.membershipOf(actor, row);
    const isAdmin = actor.platformRole === PlatformRole.SYSTEM_ADMIN;
    const canManage =
      isAdmin ||
      (membership?.status === MembershipStatus.ACTIVE && MANAGERS.has(membership.role));
    const canViewMembers =
      canManage ||
      (membership?.status === MembershipStatus.ACTIVE &&
        MEMBER_READERS.has(membership.role));
    return {
      ...this.toPublic(row),
      status: row.status,
      visibility: row.visibility,
      paymentsEnabled: row.paymentsEnabled,
      canManage,
      canViewMembers,
      myMembership: membership
        ? { id: membership.id, role: membership.role, status: membership.status }
        : null,
      myRegistration: (() => {
        const registration = row.registrations.find((item) => item.userId === actor.id);
        return registration
          ? { status: registration.status, paymentStatus: registration.paymentStatus }
          : null;
      })(),
      registrations: canManage
        ? row.registrations.map((item) => ({
            userId: item.userId,
            email: item.user.email,
            firstName: item.user.profile?.firstName ?? '',
            lastName: item.user.profile?.lastName ?? '',
            status: item.status,
            paymentStatus: item.paymentStatus,
          }))
        : [],
      templates: canManage
        ? row.templates.map((template) => ({
            id: template.id,
            kind: template.kind,
            language: template.language,
            subject: template.subject,
            body: template.body,
          }))
        : [],
      members: canViewMembers
        ? row.memberships
            .filter((item) => item.status !== MembershipStatus.REMOVED)
            .map((item) => ({
              id: item.id,
              email: item.user.email,
              role: item.role,
              status: item.status,
              firstName: item.user.profile?.firstName ?? '',
              lastName: item.user.profile?.lastName ?? '',
            }))
        : [],
      invitations: canManage
        ? row.invitations
            .filter((item) => !item.acceptedAt && !item.declinedAt)
            .map((item) => ({
              id: item.id,
              email: item.email,
              role: item.role,
              expiresAt: item.expiresAt.toISOString(),
            }))
        : [],
    };
  }

  private writable(input: UpdateInput) {
    return {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.shortName !== undefined ? { shortName: input.shortName } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.website !== undefined ? { website: blank(input.website) } : {}),
      ...(input.city !== undefined ? { city: blank(input.city) } : {}),
      ...(input.country !== undefined ? { country: blank(input.country) } : {}),
      ...(input.startsOn !== undefined
        ? { startsOn: input.startsOn ? parseDay(input.startsOn) : null }
        : {}),
      ...(input.endsOn !== undefined
        ? { endsOn: input.endsOn ? parseDay(input.endsOn) : null }
        : {}),
      ...(input.timezone !== undefined ? { timezone: input.timezone } : {}),
      ...(input.visibility !== undefined ? { visibility: input.visibility } : {}),
      ...(input.reviewMode !== undefined ? { reviewMode: input.reviewMode } : {}),
      ...(input.paymentsEnabled !== undefined
        ? { paymentsEnabled: input.paymentsEnabled }
        : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
    };
  }

  private async uniqueSlug(shortName: string): Promise<string> {
    const base = slugify(shortName);
    let candidate = base;
    let suffix = 2;
    while (await this.prisma.conference.findUnique({ where: { slug: candidate } })) {
      candidate = `${base}-${suffix}`;
      suffix += 1;
    }
    return candidate;
  }
}

function slugify(value: string): string {
  const base = value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return base.length >= 2 ? base : 'conference';
}

function blank(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function parseDay(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function day(value: Date | null): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}
