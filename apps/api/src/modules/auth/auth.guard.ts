import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { hashSecret, SESSION_COOKIE } from './auth.constants.js';
import type { AuthenticatedUser } from './auth.types.js';
import { PrismaService } from '../../prisma/prisma.service.js';

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const cookies = request.cookies as Record<string, unknown> | undefined;
    const raw = cookies?.[SESSION_COOKIE];
    if (typeof raw !== 'string' || raw.length < 20) {
      throw new UnauthorizedException('Sign in required');
    }

    const session = await this.prisma.session.findUnique({
      where: { tokenHash: hashSecret(raw) },
      include: { user: { include: { profile: true } } },
    });
    if (
      !session ||
      session.revokedAt ||
      session.expiresAt.getTime() <= Date.now() ||
      !session.user.profile
    ) {
      throw new UnauthorizedException('Sign in required');
    }

    request.user = {
      id: session.user.id,
      email: session.user.email,
      platformRole: session.user.platformRole,
      emailVerified: session.user.emailVerifiedAt !== null,
      mfaEnabled: session.user.mfaEnabled,
      profile: session.user.profile,
      sessionId: session.id,
    };
    return true;
  }
}
