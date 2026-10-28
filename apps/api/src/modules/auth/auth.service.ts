import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CurrentUser } from '@scholarflow/types';
import type {
  changePasswordSchema,
  loginSchema,
  profileSchema,
  registerSchema,
  resetPasswordSchema,
  createAdminSchema,
} from '@scholarflow/validation';
import { educationStepSchema } from '@scholarflow/validation';
import type { z } from 'zod';
import type { Prisma, Profile, User } from '../../generated/prisma/client.js';
import { PlatformRole as Role } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  hashSecret,
  newSecret,
  RESET_TTL_MS,
  SESSION_TTL_MS,
  VERIFY_TTL_MS,
} from './auth.constants.js';
import { ObjectStorage } from '../papers/object-storage.js';
import { EmailService } from './email.service.js';
import { verifyTotp, newTotpSecret, totpUri } from './totp.js';
import { PasswordService } from './password.service.js';

type RegisterInput = z.infer<typeof registerSchema>;
type AdminInput = z.infer<typeof createAdminSchema>;
type LoginInput = z.infer<typeof loginSchema>;
type ProfileInput = z.infer<typeof profileSchema>;
type ResetInput = z.infer<typeof resetPasswordSchema>;
type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

type UserWithProfile = User & { profile: Profile };

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly email: EmailService,
    private readonly storage: ObjectStorage,
    private readonly config: ConfigService,
  ) {}

  async register(input: RegisterInput): Promise<CurrentUser> {
    const email = input.email.trim().toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException('An account with this email already exists');
    }

    const passwordHash = await this.passwords.hash(input.password);
    // Email verification is deferred: accounts are usable immediately after register.
    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email,
          passwordHash,
          emailVerifiedAt: new Date(),
          profile: {
            create: {
              firstName: input.firstName.trim(),
              lastName: input.lastName.trim(),
            },
          },
        },
        include: { profile: true },
      });
      await this.audit(tx, created.id, 'auth.register', created.id, {});
      return created;
    });

    return this.toCurrentUser(this.requireProfile(user));
  }

  async login(input: LoginInput): Promise<{ user: CurrentUser; sessionToken: string }> {
    const email = input.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: { profile: true },
    });
    const matches = await this.passwords.verify(user?.passwordHash ?? '', input.password);
    if (!user || !user.profile || !matches) {
      await this.prisma.auditLog.create({
        data: {
          action: 'auth.login_failed',
          resourceType: 'user',
          metadata: { email },
        },
      });
      throw new UnauthorizedException('Invalid email or password');
    }
    if (user.disabledAt) {
      throw new ForbiddenException('This account is disabled');
    }
    if (user.mfaEnabled && !verifyTotp(user.mfaSecret ?? '', input.mfaCode ?? '')) {
      throw new UnauthorizedException('MFA code required');
    }

    const sessionToken = newSecret();
    const remembered = await this.prisma.membership.findFirst({
      where: {
        userId: user.id,
        status: 'ACTIVE',
        role: { in: ['CHAIR', 'ADMINISTRATOR'] },
        accessGrantedAt: { not: null },
        conference: { status: 'PUBLISHED' },
      },
      orderBy: { accessGrantedAt: 'desc' },
    });
    await this.prisma.$transaction(async (tx) => {
      await tx.session.create({
        data: {
          userId: user.id,
          tokenHash: hashSecret(sessionToken),
          expiresAt: new Date(Date.now() + SESSION_TTL_MS),
          unlockedConferenceId: remembered?.conferenceId ?? null,
        },
      });
      await this.audit(tx, user.id, 'auth.login', user.id, {});
    });
    return { user: this.toCurrentUser(this.requireProfile(user)), sessionToken };
  }

  async logout(rawSession: string | undefined): Promise<void> {
    if (!rawSession) {
      return;
    }
    const session = await this.prisma.session.findUnique({
      where: { tokenHash: hashSecret(rawSession) },
    });
    if (!session || session.revokedAt) {
      return;
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.session.update({
        where: { id: session.id },
        data: { revokedAt: new Date() },
      });
      await this.audit(tx, session.userId, 'auth.logout', session.userId, {});
    });
  }

  async verifyEmail(token: string): Promise<void> {
    const row = await this.findVerificationToken(token);
    await this.prisma.$transaction(async (tx) => {
      await tx.emailVerificationToken.update({
        where: { id: row.id },
        data: { usedAt: new Date() },
      });
      await tx.user.update({
        where: { id: row.userId },
        data: { emailVerifiedAt: row.user.emailVerifiedAt ?? new Date() },
      });
      await this.audit(tx, row.userId, 'auth.email_verified', row.userId, {});
    });
  }

  async resendVerification(emailInput: string): Promise<void> {
    const email = emailInput.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || user.emailVerifiedAt) {
      return;
    }
    const rawToken = newSecret();
    await this.prisma.$transaction(async (tx) => {
      await tx.emailVerificationToken.updateMany({
        where: { userId: user.id, usedAt: null },
        data: { usedAt: new Date() },
      });
      await tx.emailVerificationToken.create({
        data: {
          userId: user.id,
          tokenHash: hashSecret(rawToken),
          expiresAt: new Date(Date.now() + VERIFY_TTL_MS),
        },
      });
    });
    await this.sendTemplate(
      email,
      'email_verification',
      'Confirm your ScholarFlow account',
      [
        'Confirm your ScholarFlow account by opening this link:',
        this.link('/verify-email', rawToken),
        'The link expires in 24 hours.',
      ],
    );
  }

  async requestPasswordReset(emailInput: string): Promise<void> {
    const email = emailInput.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      return;
    }
    const rawToken = newSecret();
    await this.prisma.$transaction(async (tx) => {
      await tx.passwordResetToken.updateMany({
        where: { userId: user.id, usedAt: null },
        data: { usedAt: new Date() },
      });
      await tx.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash: hashSecret(rawToken),
          expiresAt: new Date(Date.now() + RESET_TTL_MS),
        },
      });
      await this.audit(tx, user.id, 'auth.password_reset_requested', user.id, {});
    });
    await this.sendTemplate(email, 'password_reset', 'Reset your ScholarFlow password', [
      'Reset your ScholarFlow password by opening this link:',
      this.link('/reset-password', rawToken),
      'The link expires in one hour and can be used once. If you did not ask for this, ignore this message.',
    ]);
  }

  async resetPassword(input: ResetInput): Promise<void> {
    const row = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash: hashSecret(input.token) },
    });
    if (!row || row.usedAt || row.expiresAt.getTime() <= Date.now()) {
      throw new BadRequestException('This reset link is invalid or has expired');
    }
    const passwordHash = await this.passwords.hash(input.newPassword);
    await this.prisma.$transaction(async (tx) => {
      await tx.passwordResetToken.update({
        where: { id: row.id },
        data: { usedAt: new Date() },
      });
      await tx.user.update({ where: { id: row.userId }, data: { passwordHash } });
      await tx.session.updateMany({
        where: { userId: row.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await this.audit(tx, row.userId, 'auth.password_reset', row.userId, {});
    });
  }

  async changePassword(
    userId: string,
    sessionId: string,
    input: ChangePasswordInput,
  ): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException('Sign in required');
    }
    const matches = await this.passwords.verify(user.passwordHash, input.currentPassword);
    if (!matches) {
      throw new UnauthorizedException('Current password is incorrect');
    }
    const passwordHash = await this.passwords.hash(input.newPassword);
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { passwordHash } });
      await tx.session.updateMany({
        where: { userId, revokedAt: null, id: { not: sessionId } },
        data: { revokedAt: new Date() },
      });
      await this.audit(tx, userId, 'auth.password_changed', userId, {});
    });
  }

  async beginMfa(userId: string, email: string) {
    const secret = newTotpSecret();
    await this.prisma.user.update({
      where: { id: userId },
      data: { mfaSecret: secret, mfaEnabled: false },
    });
    return { uri: totpUri(email, secret) };
  }

  async confirmMfa(userId: string, code: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user?.mfaSecret || !verifyTotp(user.mfaSecret, code)) {
      throw new UnauthorizedException('MFA code required');
    }
    await this.prisma.user.update({ where: { id: userId }, data: { mfaEnabled: true } });
  }

  async storePhoto(
    userId: string,
    file: { mimetype: string; size: number; buffer: Buffer } | undefined,
  ) {
    const allowed = file?.mimetype === 'image/jpeg' || file?.mimetype === 'image/png';
    if (!file?.buffer || !allowed || file.size > 2 * 1024 * 1024) {
      throw new BadRequestException('Upload a JPEG or PNG of at most 2 MB');
    }
    const key = `profiles/${userId}/photo`;
    await this.storage.put(key, file.buffer, file.mimetype);
    await this.prisma.profile.update({
      where: { userId },
      data: { photoPath: '/api/v1/auth/photo' },
    });
  }

  async readPhoto(userId: string) {
    const profile = await this.prisma.profile.findUnique({ where: { userId } });
    if (!profile?.photoPath) {
      throw new NotFoundException('Photo not found');
    }
    const bytes = await this.storage.get(`profiles/${userId}/photo`);
    return bytes;
  }

  async updateProfile(userId: string, input: ProfileInput): Promise<CurrentUser> {
    const user = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id: userId },
        data: {
          profile: {
            update: {
              firstName: input.firstName.trim(),
              lastName: input.lastName.trim(),
              academicTitle: emptyToNull(input.academicTitle),
              institution: emptyToNull(input.institution),
              laboratory: emptyToNull(input.laboratory),
              department: emptyToNull(input.department),
              country: emptyToNull(input.country),
              city: emptyToNull(input.city),
              disciplines: input.disciplines,
              interests: emptyToNull(input.interests),
              biography: emptyToNull(input.biography),
              education: input.education,
              orcid: emptyToNull(input.orcid),
              googleScholarUrl: emptyToNull(input.googleScholarUrl),
              website: emptyToNull(input.website),
              language: input.language,
            },
          },
        },
        include: { profile: true },
      });
      await this.audit(tx, userId, 'profile.update', userId, {});
      return updated;
    });
    return this.toCurrentUser(this.requireProfile(user));
  }

  private async findVerificationToken(token: string) {
    const row = await this.prisma.emailVerificationToken.findUnique({
      where: { tokenHash: hashSecret(token) },
      include: { user: true },
    });
    if (!row || row.usedAt || row.expiresAt.getTime() <= Date.now()) {
      throw new BadRequestException('This verification link is invalid or has expired');
    }
    return row;
  }

  private async sendTemplate(
    recipient: string,
    template: string,
    subject: string,
    lines: string[],
  ): Promise<void> {
    const outboxId = await this.email.enqueue(recipient, template);
    await this.email.deliver(outboxId, {
      to: recipient,
      subject,
      text: lines.join('\n\n'),
    });
  }

  private link(path: string, token: string): string {
    const base = this.config.getOrThrow<string>('APP_PUBLIC_URL').replace(/\/$/, '');
    return `${base}${path}?token=${encodeURIComponent(token)}`;
  }

  private async audit(
    tx: Prisma.TransactionClient,
    actorId: string,
    action: string,
    resourceId: string,
    metadata: Prisma.InputJsonObject,
  ): Promise<void> {
    await tx.auditLog.create({
      data: {
        actorId,
        action,
        resourceType: 'user',
        resourceId,
        metadata,
      },
    });
  }

  async messages(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return [];
    }
    const rows = await this.prisma.emailOutbox.findMany({
      where: { recipient: user.email },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        id: true,
        subject: true,
        body: true,
        status: true,
        template: true,
        createdAt: true,
      },
    });
    return rows.map((row) => ({
      id: row.id,
      subject: row.subject,
      body: row.body,
      status: row.status,
      template: row.template,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async createAdmin(input: AdminInput) {
    const email = input.email.trim().toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException('An account with this email already exists');
    }
    const passwordHash = await this.passwords.hash(input.password);
    const user = await this.prisma.user.create({
      data: {
        email,
        passwordHash,
        issuedPassword: input.password,
        platformRole: Role.RESEARCHER,
        emailVerifiedAt: new Date(),
        profile: {
          create: {
            firstName: input.firstName.trim(),
            lastName: input.lastName.trim(),
            academicTitle: 'Admin',
            language: 'fr',
          },
        },
      },
      include: { profile: true },
    });
    return {
      id: user.id,
      email: user.email,
      firstName: user.profile?.firstName ?? input.firstName,
      lastName: user.profile?.lastName ?? input.lastName,
      loginPassword: input.password,
      conferences: [] as { id: string; name: string }[],
    };
  }

  async listAdmins() {
    const rows = await this.prisma.user.findMany({
      where: {
        platformRole: Role.RESEARCHER,
        OR: [
          { memberships: { some: { role: 'CHAIR', status: 'ACTIVE' } } },
          { profile: { is: { academicTitle: 'Admin' } } },
        ],
      },
      include: {
        profile: true,
        memberships: {
          where: { role: 'CHAIR', status: 'ACTIVE' },
          include: { conference: { select: { id: true, name: true } } },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((row) => ({
      id: row.id,
      email: row.email,
      firstName: row.profile?.firstName ?? '',
      lastName: row.profile?.lastName ?? '',
      loginPassword: row.issuedPassword,
      conferences: row.memberships.map((item) => ({
        id: item.conference.id,
        name: item.conference.name,
      })),
    }));
  }

  private requireProfile(user: User & { profile: Profile | null }): UserWithProfile {
    if (!user.profile) {
      throw new UnauthorizedException('Sign in required');
    }
    return { ...user, profile: user.profile };
  }

  private toCurrentUser(user: UserWithProfile): CurrentUser {
    return {
      id: user.id,
      email: user.email,
      platformRole: user.platformRole,
      emailVerified: user.emailVerifiedAt !== null,
      mfaEnabled: user.mfaEnabled,
      unlockedConferenceId: null,
      profile: {
        firstName: user.profile.firstName,
        lastName: user.profile.lastName,
        academicTitle: user.profile.academicTitle,
        institution: user.profile.institution,
        laboratory: user.profile.laboratory,
        department: user.profile.department,
        country: user.profile.country,
        city: user.profile.city,
        disciplines: user.profile.disciplines,
        interests: user.profile.interests,
        biography: user.profile.biography,
        photoPath: user.profile.photoPath,
        education: readEducation(user.profile.education),
        orcid: user.profile.orcid,
        googleScholarUrl: user.profile.googleScholarUrl,
        website: user.profile.website,
        language: user.profile.language,
      },
    };
  }
}

function readEducation(value: Prisma.JsonValue) {
  const parsed = educationStepSchema.array().safeParse(value);
  return parsed.success ? parsed.data : [];
}

function emptyToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}
