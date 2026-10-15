import {
  Body,
  Controller,
  Get,
  HttpCode,
  Patch,
  Post,
  Req,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  changePasswordSchema,
  emailOnlySchema,
  loginSchema,
  mfaConfirmSchema,
  profileSchema,
  registerSchema,
  resetPasswordSchema,
  tokenSchema,
} from '@scholarflow/validation';
import type { Response } from 'express';
import type { z } from 'zod';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import {
  CSRF_COOKIE,
  newSecret,
  SESSION_COOKIE,
  SESSION_TTL_MS,
} from './auth.constants.js';
import { AuthGuard, type AuthenticatedRequest } from './auth.guard.js';
import { AuthService } from './auth.service.js';
import { CsrfGuard } from './csrf.guard.js';

@ApiTags('auth')
@Controller('auth')
@UseGuards(CsrfGuard)
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}

  @Get('csrf')
  @ApiOperation({ summary: 'Issue a CSRF token cookie' })
  csrf(@Res({ passthrough: true }) response: Response): { csrfToken: string } {
    const csrfToken = newSecret();
    response.cookie(CSRF_COOKIE, csrfToken, this.cookieBase(false));
    return { csrfToken };
  }

  @Post('register')
  @ApiOperation({ summary: 'Create an account and send a verification email' })
  register(
    @Body(new ZodValidationPipe(registerSchema)) body: z.infer<typeof registerSchema>,
  ) {
    return this.auth.register(body);
  }

  @Post('login')
  @HttpCode(200)
  @ApiOperation({ summary: 'Start a session' })
  async login(
    @Body(new ZodValidationPipe(loginSchema)) body: z.infer<typeof loginSchema>,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.auth.login(body);
    response.cookie(SESSION_COOKIE, result.sessionToken, {
      ...this.cookieBase(true),
      maxAge: SESSION_TTL_MS,
    });
    return { user: result.user };
  }

  @Post('logout')
  @HttpCode(204)
  @ApiOperation({ summary: 'Revoke the current session' })
  async logout(
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    const cookies = request.cookies as Record<string, unknown> | undefined;
    const raw = cookies?.[SESSION_COOKIE];
    await this.auth.logout(typeof raw === 'string' ? raw : undefined);
    response.clearCookie(SESSION_COOKIE, this.cookieBase(true));
  }

  @Post('verify-email')
  @HttpCode(204)
  @ApiOperation({ summary: 'Consume a one-time email verification token' })
  async verifyEmail(
    @Body(new ZodValidationPipe(tokenSchema)) body: z.infer<typeof tokenSchema>,
  ): Promise<void> {
    await this.auth.verifyEmail(body.token);
  }

  @Post('resend-verification')
  @HttpCode(202)
  @ApiOperation({
    summary: 'Send another verification email when the account is unverified',
  })
  async resend(
    @Body(new ZodValidationPipe(emailOnlySchema)) body: z.infer<typeof emailOnlySchema>,
  ): Promise<{ status: 'accepted' }> {
    await this.auth.resendVerification(body.email);
    return { status: 'accepted' };
  }

  @Post('forgot-password')
  @HttpCode(202)
  @ApiOperation({ summary: 'Send a password reset email when the account exists' })
  async forgot(
    @Body(new ZodValidationPipe(emailOnlySchema)) body: z.infer<typeof emailOnlySchema>,
  ): Promise<{ status: 'accepted' }> {
    await this.auth.requestPasswordReset(body.email);
    return { status: 'accepted' };
  }

  @Post('reset-password')
  @HttpCode(204)
  @ApiOperation({ summary: 'Set a new password with a one-time reset token' })
  async reset(
    @Body(new ZodValidationPipe(resetPasswordSchema))
    body: z.infer<typeof resetPasswordSchema>,
  ): Promise<void> {
    await this.auth.resetPassword(body);
  }

  @Get('messages')
  @UseGuards(AuthGuard)
  messages(@Req() request: AuthenticatedRequest) {
    return this.auth.messages(request.user!.id);
  }

  @Get('me')
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'Return the signed-in account' })
  me(@Req() request: AuthenticatedRequest) {
    return this.present(request);
  }

  @Post('change-password')
  @HttpCode(204)
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'Change the password for the signed-in account' })
  async changePassword(
    @Req() request: AuthenticatedRequest,
    @Body(new ZodValidationPipe(changePasswordSchema))
    body: z.infer<typeof changePasswordSchema>,
  ): Promise<void> {
    const user = request.user;
    if (!user) {
      return;
    }
    await this.auth.changePassword(user.id, user.sessionId, body);
  }

  @Post('mfa/start')
  @UseGuards(AuthGuard)
  beginMfa(@Req() request: AuthenticatedRequest) {
    const user = request.user!;
    return this.auth.beginMfa(user.id, user.email);
  }

  @Post('mfa/confirm')
  @UseGuards(AuthGuard)
  @HttpCode(204)
  async confirmMfa(
    @Req() request: AuthenticatedRequest,
    @Body(new ZodValidationPipe(mfaConfirmSchema)) body: z.infer<typeof mfaConfirmSchema>,
  ) {
    await this.auth.confirmMfa(request.user!.id, body.code);
  }

  @Post('photo')
  @UseGuards(AuthGuard)
  @UseInterceptors(FileInterceptor('photo', { limits: { fileSize: 2 * 1024 * 1024 } }))
  async photo(
    @Req() request: AuthenticatedRequest,
    @UploadedFile() file: Express.Multer.File,
  ) {
    await this.auth.storePhoto(request.user!.id, file);
    return { photoPath: '/api/v1/auth/photo' };
  }

  @Get('photo')
  @UseGuards(AuthGuard)
  async readPhoto(@Req() request: AuthenticatedRequest) {
    const bytes = await this.auth.readPhoto(request.user!.id);
    return new StreamableFile(bytes);
  }

  @Patch('profile')
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'Update the academic profile' })
  updateProfile(
    @Req() request: AuthenticatedRequest,
    @Body(new ZodValidationPipe(profileSchema)) body: z.infer<typeof profileSchema>,
  ) {
    const user = request.user;
    if (!user) {
      return null;
    }
    return this.auth.updateProfile(user.id, body);
  }

  private present(request: AuthenticatedRequest) {
    const user = request.user;
    if (!user) {
      return null;
    }
    return {
      id: user.id,
      email: user.email,
      platformRole: user.platformRole,
      emailVerified: user.emailVerified,
      mfaEnabled: user.mfaEnabled,
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
        education: Array.isArray(user.profile.education) ? user.profile.education : [],
        orcid: user.profile.orcid,
        googleScholarUrl: user.profile.googleScholarUrl,
        website: user.profile.website,
        language: user.profile.language,
      },
    };
  }

  private cookieBase(httpOnly: boolean): {
    httpOnly: boolean;
    secure: boolean;
    sameSite: 'lax';
    path: string;
  } {
    return {
      httpOnly,
      secure: this.config.getOrThrow<string>('NODE_ENV') === 'production',
      sameSite: 'lax',
      path: '/',
    };
  }
}
