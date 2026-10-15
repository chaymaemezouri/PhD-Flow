import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { PlatformRole } from '../../generated/prisma/client.js';
import type { AuthenticatedRequest } from './auth.guard.js';

@Injectable()
export class SystemAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (request.user?.platformRole !== PlatformRole.SYSTEM_ADMIN) {
      throw new ForbiddenException('Platform administrator access is required');
    }
    return true;
  }
}
