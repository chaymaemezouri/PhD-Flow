import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  assignConferenceChairSchema,
  resetAdminPasswordSchema,
  setConferenceStatusSchema,
} from '@scholarflow/validation';
import type { z } from 'zod';
import {
  ConferenceRole,
  ConferenceStatus,
  MembershipStatus,
  PlatformRole,
  Prisma,
} from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { PasswordService } from '../auth/password.service.js';

type ResetPasswordInput = z.infer<typeof resetAdminPasswordSchema>;
type AssignChairInput = z.infer<typeof assignConferenceChairSchema>;
type SetStatusInput = z.infer<typeof setConferenceStatusSchema>;

@Injectable()
export class SystemService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
  ) {}

  async status() {
    const [
      accounts,
      conferences,
      papers,
      reviews,
      admins,
      published,
      drafts,
      archived,
      verified,
      submitted,
      activeSessions,
    ] = await Promise.all([
      this.prisma.user.count({
        where: { platformRole: { not: PlatformRole.SYSTEM_ADMIN } },
      }),
      this.prisma.conference.count(),
      this.prisma.paper.count(),
      this.prisma.reviewAssignment.count(),
      this.prisma.user.count({
        where: {
          platformRole: PlatformRole.RESEARCHER,
          OR: [
            {
              memberships: {
                some: { role: ConferenceRole.CHAIR, status: MembershipStatus.ACTIVE },
              },
            },
            { profile: { is: { academicTitle: 'Admin' } } },
          ],
        },
      }),
      this.prisma.conference.count({ where: { status: ConferenceStatus.PUBLISHED } }),
      this.prisma.conference.count({ where: { status: ConferenceStatus.DRAFT } }),
      this.prisma.conference.count({ where: { status: ConferenceStatus.ARCHIVED } }),
      this.prisma.user.count({ where: { emailVerifiedAt: { not: null } } }),
      this.prisma.paper.count({ where: { status: 'SUBMITTED' } }),
      this.prisma.session.count({
        where: { revokedAt: null, expiresAt: { gt: new Date() } },
      }),
    ]);
    return {
      accounts,
      conferences,
      papers,
      reviews,
      admins,
      published,
      drafts,
      archived,
      verified,
      submitted,
      activeSessions,
    };
  }

  async conferences() {
    const rows = await this.prisma.conference.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        memberships: {
          where: { role: ConferenceRole.CHAIR, status: MembershipStatus.ACTIVE },
          include: { user: { include: { profile: true } } },
        },
        _count: { select: { papers: true, memberships: true } },
      },
    });
    return rows.map((row) => {
      const chair = row.memberships[0];
      return {
        id: row.id,
        name: row.name,
        shortName: row.shortName,
        city: row.city,
        country: row.country,
        status: row.status,
        visibility: row.visibility,
        startsOn: row.startsOn?.toISOString().slice(0, 10) ?? null,
        endsOn: row.endsOn?.toISOString().slice(0, 10) ?? null,
        accessPassword: row.accessPasswordNote,
        paperCount: row._count.papers,
        memberCount: row._count.memberships,
        chair: chair
          ? {
              id: chair.user.id,
              email: chair.user.email,
              firstName: chair.user.profile?.firstName ?? '',
              lastName: chair.user.profile?.lastName ?? '',
            }
          : null,
      };
    });
  }

  async users() {
    const rows = await this.prisma.user.findMany({
      where: { platformRole: { not: PlatformRole.SYSTEM_ADMIN } },
      include: {
        profile: true,
        memberships: {
          where: { status: MembershipStatus.ACTIVE },
          include: { conference: { select: { id: true, name: true, shortName: true } } },
          orderBy: { createdAt: 'desc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((row) => {
      const roles = [...new Set(row.memberships.map((item) => item.role))];
      const isAdmin =
        row.profile?.academicTitle === 'Admin' || roles.includes(ConferenceRole.CHAIR);
      return {
        id: row.id,
        email: row.email,
        firstName: row.profile?.firstName ?? '',
        lastName: row.profile?.lastName ?? '',
        academicTitle: row.profile?.academicTitle ?? '',
        emailVerified: row.emailVerifiedAt !== null,
        disabled: row.disabledAt !== null,
        kind: isAdmin
          ? 'ADMIN'
          : roles.includes(ConferenceRole.REVIEWER)
            ? 'REVIEWER'
            : 'RESEARCHER',
        memberships: row.memberships.map((item) => ({
          conferenceId: item.conference.id,
          conferenceName: item.conference.name,
          shortName: item.conference.shortName,
          role: item.role,
        })),
        createdAt: row.createdAt.toISOString(),
      };
    });
  }

  async audit(limit = 80) {
    const rows = await this.prisma.auditLog.findMany({
      take: Math.min(Math.max(limit, 1), 200),
      orderBy: { createdAt: 'desc' },
      include: { actor: { include: { profile: true } } },
    });
    return rows.map((row) => ({
      id: row.id,
      action: row.action,
      resourceType: row.resourceType,
      resourceId: row.resourceId,
      metadata: row.metadata,
      createdAt: row.createdAt.toISOString(),
      actor: row.actor
        ? {
            id: row.actor.id,
            email: row.actor.email,
            name: `${row.actor.profile?.firstName ?? ''} ${row.actor.profile?.lastName ?? ''}`.trim(),
          }
        : null,
    }));
  }

  async sessions() {
    const rows = await this.prisma.session.findMany({
      where: { revokedAt: null, expiresAt: { gt: new Date() } },
      include: { user: { include: { profile: true } } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return rows.map((row) => ({
      id: row.id,
      userId: row.userId,
      email: row.user.email,
      name: `${row.user.profile?.firstName ?? ''} ${row.user.profile?.lastName ?? ''}`.trim(),
      createdAt: row.createdAt.toISOString(),
      expiresAt: row.expiresAt.toISOString(),
      unlockedConferenceId: row.unlockedConferenceId,
    }));
  }

  async revokeSession(actor: AuthenticatedUser, sessionId: string) {
    const row = await this.prisma.session.findUnique({ where: { id: sessionId } });
    if (!row || row.revokedAt) {
      throw new NotFoundException('Session not found');
    }
    await this.prisma.session.update({
      where: { id: sessionId },
      data: { revokedAt: new Date() },
    });
    await this.writeAudit(actor.id, 'session.revoke', 'session', sessionId, {
      userId: row.userId,
    });
    return { id: sessionId };
  }

  async revokeUserSessions(actor: AuthenticatedUser, userId: string) {
    await this.assertManagedUser(userId);
    const result = await this.prisma.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await this.writeAudit(actor.id, 'session.revoke_user', 'user', userId, {
      count: result.count,
    });
    return { userId, count: result.count };
  }

  async verifyUserEmail(actor: AuthenticatedUser, userId: string) {
    await this.assertManagedUser(userId);
    await this.prisma.user.update({
      where: { id: userId },
      data: { emailVerifiedAt: new Date() },
    });
    await this.writeAudit(actor.id, 'user.verify_email', 'user', userId, {});
    return { id: userId, emailVerified: true };
  }

  async setUserDisabled(actor: AuthenticatedUser, userId: string, disabled: boolean) {
    await this.assertManagedUser(userId);
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: { disabledAt: disabled ? new Date() : null },
      });
      if (disabled) {
        await tx.session.updateMany({
          where: { userId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }
    });
    await this.writeAudit(
      actor.id,
      disabled ? 'user.disable' : 'user.enable',
      'user',
      userId,
      {},
    );
    return { id: userId, disabled };
  }

  async deleteUser(actor: AuthenticatedUser, userId: string) {
    await this.assertManagedUser(userId);
    const papers = await this.prisma.paper.count({ where: { createdById: userId } });
    if (papers > 0) {
      throw new ForbiddenException('Disable this account instead. It still owns papers.');
    }
    await this.prisma.user.delete({ where: { id: userId } });
    await this.writeAudit(actor.id, 'user.delete', 'user', userId, {});
    return { id: userId };
  }

  async resetAdminPassword(
    actor: AuthenticatedUser,
    userId: string,
    input: ResetPasswordInput,
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        profile: true,
        memberships: {
          where: { role: ConferenceRole.CHAIR, status: MembershipStatus.ACTIVE },
        },
      },
    });
    if (
      !user ||
      user.platformRole === PlatformRole.SYSTEM_ADMIN ||
      (user.profile?.academicTitle !== 'Admin' && user.memberships.length === 0)
    ) {
      throw new NotFoundException('Admin account not found');
    }
    const passwordHash = await this.passwords.hash(input.password);
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash, issuedPassword: input.password },
    });
    await this.writeAudit(actor.id, 'admin.reset_password', 'user', userId, {
      email: user.email,
    });
    return {
      id: user.id,
      email: user.email,
      loginPassword: input.password,
    };
  }

  async assignChair(
    actor: AuthenticatedUser,
    conferenceId: string,
    input: AssignChairInput,
  ) {
    const conference = await this.prisma.conference.findUnique({
      where: { id: conferenceId },
      include: { memberships: true },
    });
    if (!conference) {
      throw new NotFoundException('Conference not found');
    }
    const chair = await this.prisma.user.findUnique({ where: { id: input.chairUserId } });
    if (
      !chair ||
      !chair.emailVerifiedAt ||
      chair.platformRole === PlatformRole.SYSTEM_ADMIN
    ) {
      throw new NotFoundException('Choose an admin account');
    }
    const previous = conference.memberships.filter(
      (item) =>
        item.role === ConferenceRole.CHAIR && item.status === MembershipStatus.ACTIVE,
    );
    await this.prisma.$transaction(async (tx) => {
      for (const item of previous) {
        if (item.userId === input.chairUserId) {
          continue;
        }
        await tx.membership.update({
          where: { id: item.id },
          data: { role: ConferenceRole.ADMINISTRATOR },
        });
      }
      await tx.membership.upsert({
        where: {
          conferenceId_userId: { conferenceId, userId: input.chairUserId },
        },
        create: {
          conferenceId,
          userId: input.chairUserId,
          role: ConferenceRole.CHAIR,
          status: MembershipStatus.ACTIVE,
        },
        update: {
          role: ConferenceRole.CHAIR,
          status: MembershipStatus.ACTIVE,
        },
      });
    });
    await this.writeAudit(
      actor.id,
      'conference.assign_chair',
      'conference',
      conferenceId,
      {
        chairUserId: input.chairUserId,
      },
    );
    return this.conferences().then((rows) =>
      rows.find((item) => item.id === conferenceId),
    );
  }

  async setConferenceStatus(
    actor: AuthenticatedUser,
    conferenceId: string,
    input: SetStatusInput,
  ) {
    const conference = await this.prisma.conference.findUnique({
      where: { id: conferenceId },
    });
    if (!conference) {
      throw new NotFoundException('Conference not found');
    }
    if (input.status === ConferenceStatus.PUBLISHED && !conference.accessPasswordHash) {
      throw new ForbiddenException('Set the conference password before publishing');
    }
    await this.prisma.conference.update({
      where: { id: conferenceId },
      data: { status: input.status },
    });
    await this.writeAudit(actor.id, 'conference.set_status', 'conference', conferenceId, {
      status: input.status,
    });
    return this.conferences().then((rows) =>
      rows.find((item) => item.id === conferenceId),
    );
  }

  async deleteConference(actor: AuthenticatedUser, conferenceId: string) {
    const conference = await this.prisma.conference.findUnique({
      where: { id: conferenceId },
      include: { _count: { select: { papers: true } } },
    });
    if (!conference) {
      throw new NotFoundException('Conference not found');
    }
    if (conference.status !== ConferenceStatus.DRAFT) {
      throw new ForbiddenException('Only a draft conference can be deleted');
    }
    if (conference._count.papers > 0) {
      throw new ForbiddenException('Remove the papers before deleting this draft');
    }
    await this.prisma.conference.delete({ where: { id: conferenceId } });
    await this.writeAudit(actor.id, 'conference.delete', 'conference', conferenceId, {
      name: conference.name,
    });
    return { id: conferenceId };
  }

  async cloneConference(actor: AuthenticatedUser, conferenceId: string) {
    const source = await this.prisma.conference.findUnique({
      where: { id: conferenceId },
      include: {
        tracks: true,
        deadlines: true,
        templates: true,
        memberships: {
          where: { role: ConferenceRole.CHAIR, status: MembershipStatus.ACTIVE },
        },
      },
    });
    if (!source) {
      throw new NotFoundException('Conference not found');
    }
    const shortName = `${source.shortName}-copy`.slice(0, 40);
    const slug = await this.uniqueSlug(shortName);
    const chairId = source.memberships[0]?.userId ?? actor.id;
    const created = await this.prisma.$transaction(async (tx) => {
      const conference = await tx.conference.create({
        data: {
          name: `${source.name} (copie)`,
          shortName,
          description: source.description,
          website: source.website,
          city: source.city,
          country: source.country,
          startsOn: source.startsOn,
          endsOn: source.endsOn,
          timezone: source.timezone,
          visibility: source.visibility,
          reviewMode: source.reviewMode,
          paymentsEnabled: source.paymentsEnabled,
          status: ConferenceStatus.DRAFT,
          slug,
          createdById: actor.id,
          memberships: {
            create: {
              userId: chairId,
              role: ConferenceRole.CHAIR,
              status: MembershipStatus.ACTIVE,
            },
          },
          tracks: {
            create: source.tracks.map((track) => ({
              name: track.name,
              code: track.code,
              description: track.description,
              sortOrder: track.sortOrder,
            })),
          },
          templates: {
            create: source.templates.map((item) => ({
              kind: item.kind,
              language: item.language,
              subject: item.subject,
              body: item.body,
            })),
          },
        },
        include: { tracks: true },
      });
      const trackMap = new Map(
        source.tracks.map((track, index) => [track.id, conference.tracks[index]?.id]),
      );
      if (source.deadlines.length > 0) {
        await tx.deadline.createMany({
          data: source.deadlines.map((item) => ({
            conferenceId: conference.id,
            trackId: item.trackId ? (trackMap.get(item.trackId) ?? null) : null,
            kind: item.kind,
            dueAt: item.dueAt,
            label: item.label,
          })),
        });
      }
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: 'conference.clone',
          resourceType: 'conference',
          resourceId: conference.id,
          metadata: { sourceId: source.id },
        },
      });
      return conference;
    });
    return this.conferences().then((rows) => rows.find((item) => item.id === created.id));
  }

  async writeAudit(
    actorId: string | null,
    action: string,
    resourceType: string,
    resourceId: string | null,
    metadata: Prisma.InputJsonValue,
  ) {
    await this.prisma.auditLog.create({
      data: {
        actorId,
        action,
        resourceType,
        resourceId,
        metadata,
      },
    });
  }

  private async assertManagedUser(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.platformRole === PlatformRole.SYSTEM_ADMIN) {
      throw new NotFoundException('Account not found');
    }
  }

  private async uniqueSlug(shortName: string): Promise<string> {
    const base = shortName
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40);
    const root = base.length >= 2 ? base : 'conference';
    let candidate = root;
    let suffix = 2;
    while (await this.prisma.conference.findUnique({ where: { slug: candidate } })) {
      candidate = `${root}-${suffix}`;
      suffix += 1;
    }
    return candidate;
  }
}
