import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';
import { CSRF_COOKIE, secretsMatch } from './auth.constants.js';

@Injectable()
export class CsrfGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    if (
      request.method === 'GET' ||
      request.method === 'HEAD' ||
      request.method === 'OPTIONS'
    ) {
      return true;
    }

    const cookies = request.cookies as Record<string, unknown> | undefined;
    const cookie = cookies?.[CSRF_COOKIE];
    const header = request.header('x-csrf-token');
    if (typeof cookie !== 'string' || !header || !secretsMatch(cookie, header)) {
      throw new ForbiddenException('Missing or invalid CSRF token');
    }
    return true;
  }
}
