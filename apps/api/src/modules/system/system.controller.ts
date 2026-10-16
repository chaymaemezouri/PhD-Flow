import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  assignConferenceChairSchema,
  createAdminSchema,
  resetAdminPasswordSchema,
  setConferenceStatusSchema,
} from '@scholarflow/validation';
import type { z } from 'zod';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { AuthGuard, type AuthenticatedRequest } from '../auth/auth.guard.js';
import { AuthService } from '../auth/auth.service.js';
import { CsrfGuard } from '../auth/csrf.guard.js';
import { SystemAdminGuard } from '../auth/system-admin.guard.js';
import { SystemService } from './system.service.js';

@ApiTags('system')
@Controller('system')
@UseGuards(CsrfGuard, AuthGuard, SystemAdminGuard)
export class SystemController {
  constructor(
    private readonly system: SystemService,
    private readonly auth: AuthService,
  ) {}

  @Get('status')
  @ApiOperation({ summary: 'Platform status for system administrators' })
  status() {
    return this.system.status();
  }

  @Get('admins')
  @ApiOperation({ summary: 'Conference admins created or already in place' })
  admins() {
    return this.auth.listAdmins();
  }

  @Get('users')
  @ApiOperation({ summary: 'Platform accounts for the superadmin' })
  users() {
    return this.system.users();
  }

  @Get('conferences')
  @ApiOperation({ summary: 'Conferences with the password kept for the superadmin' })
  conferences() {
    return this.system.conferences();
  }

  @Get('audit')
  @ApiOperation({ summary: 'Recent audit log entries' })
  audit() {
    return this.system.audit();
  }

  @Get('sessions')
  @ApiOperation({ summary: 'Active sessions on the platform' })
  sessions() {
    return this.system.sessions();
  }

  @Post('admins')
  @ApiOperation({ summary: 'Create an admin login' })
  async createAdmin(
    @Req() request: AuthenticatedRequest,
    @Body(new ZodValidationPipe(createAdminSchema))
    body: z.infer<typeof createAdminSchema>,
  ) {
    const created = await this.auth.createAdmin(body);
    await this.system.writeAudit(request.user!.id, 'admin.create', 'user', created.id, {
      email: created.email,
    });
    return created;
  }

  @Post('admins/:id/password')
  @ApiOperation({ summary: 'Reset an admin sign-in password' })
  resetAdminPassword(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(resetAdminPasswordSchema))
    body: z.infer<typeof resetAdminPasswordSchema>,
  ) {
    return this.system.resetAdminPassword(request.user!, id, body);
  }

  @Post('conferences/:id/chair')
  @ApiOperation({ summary: 'Assign or change the conference admin' })
  assignChair(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(assignConferenceChairSchema))
    body: z.infer<typeof assignConferenceChairSchema>,
  ) {
    return this.system.assignChair(request.user!, id, body);
  }

  @Post('conferences/:id/status')
  @ApiOperation({ summary: 'Change conference publication status' })
  setStatus(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(setConferenceStatusSchema))
    body: z.infer<typeof setConferenceStatusSchema>,
  ) {
    return this.system.setConferenceStatus(request.user!, id, body);
  }

  @Post('conferences/:id/clone')
  @ApiOperation({ summary: 'Clone a conference as a draft' })
  cloneConference(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.system.cloneConference(request.user!, id);
  }

  @Delete('conferences/:id')
  @ApiOperation({ summary: 'Delete a draft conference' })
  deleteConference(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.system.deleteConference(request.user!, id);
  }

  @Post('sessions/:id/revoke')
  @ApiOperation({ summary: 'Revoke one active session' })
  revokeSession(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.system.revokeSession(request.user!, id);
  }

  @Post('users/:id/sessions/revoke')
  @ApiOperation({ summary: 'Revoke every active session for a user' })
  revokeUserSessions(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.system.revokeUserSessions(request.user!, id);
  }

  @Post('users/:id/verify-email')
  @ApiOperation({ summary: 'Mark a user email as verified' })
  verifyUserEmail(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.system.verifyUserEmail(request.user!, id);
  }

  @Post('users/:id/disable')
  @ApiOperation({ summary: 'Disable a user account' })
  disableUser(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.system.setUserDisabled(request.user!, id, true);
  }

  @Post('users/:id/enable')
  @ApiOperation({ summary: 'Enable a user account' })
  enableUser(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.system.setUserDisabled(request.user!, id, false);
  }

  @Delete('users/:id')
  @ApiOperation({ summary: 'Delete a user without papers' })
  deleteUser(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.system.deleteUser(request.user!, id);
  }
}
