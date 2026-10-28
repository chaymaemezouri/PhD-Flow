import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
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
import type { Response } from 'express';
import { ApiTags } from '@nestjs/swagger';
import {
  conferenceAccessSchema,
  conferencePasswordSchema,
  createAdminSchema,
  createConferenceSchema,
  createSubAdminSchema,
  createTeamMemberSchema,
  updateSubAdminStagesSchema,
  deadlineSchema,
  invitationResponseSchema,
  inviteMemberSchema,
  templateSchema,
  tokenSchema,
  trackSchema,
  updateConferenceSchema,
} from '@scholarflow/validation';
import type { z } from 'zod';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { AuthGuard, type AuthenticatedRequest } from '../auth/auth.guard.js';
import { CsrfGuard } from '../auth/csrf.guard.js';
import { ConferenceService } from './conference.service.js';

@ApiTags('conferences')
@Controller()
@UseGuards(CsrfGuard)
export class ConferenceController {
  constructor(private readonly conferences: ConferenceService) {}

  @Get('directory')
  directory() {
    return this.conferences.listPublic();
  }

  @Get('directory/:slug')
  publicConference(@Param('slug') slug: string) {
    return this.conferences.getPublic(slug);
  }

  @Get('conferences')
  @UseGuards(AuthGuard)
  mine(@Req() request: AuthenticatedRequest) {
    return this.conferences.listMine(request.user!);
  }

  @Get('conferences/assigned')
  @UseGuards(AuthGuard)
  assigned(@Req() request: AuthenticatedRequest) {
    return this.conferences.listAssigned(request.user!);
  }

  @Post('conferences/:id/join')
  @HttpCode(200)
  @UseGuards(AuthGuard)
  join(@Req() request: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.conferences.joinPublic(request.user!, id);
  }

  @Post('conferences')
  @UseGuards(AuthGuard)
  create(
    @Req() request: AuthenticatedRequest,
    @Body(new ZodValidationPipe(createConferenceSchema))
    body: z.infer<typeof createConferenceSchema>,
  ) {
    return this.conferences.create(request.user!, body);
  }

  @Post('conferences/:id/access')
  @HttpCode(200)
  @UseGuards(AuthGuard)
  access(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(conferenceAccessSchema))
    body: z.infer<typeof conferenceAccessSchema>,
  ) {
    return this.conferences.openAccess(request.user!, id, body.password);
  }

  @Post('conferences/:id/access-password')
  @UseGuards(AuthGuard)
  setAccessPassword(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(conferencePasswordSchema))
    body: z.infer<typeof conferencePasswordSchema>,
  ) {
    return this.conferences.setAccessPassword(request.user!, id, body.password);
  }

  @Post('conferences/:id/sub-admins')
  @UseGuards(AuthGuard)
  createSubAdmin(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(createSubAdminSchema))
    body: z.infer<typeof createSubAdminSchema>,
  ) {
    return this.conferences.createSubAdmin(request.user!, id, body);
  }

  @Patch('conferences/:id/sub-admins/:userId/stages')
  @UseGuards(AuthGuard)
  setSubAdminStages(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body(new ZodValidationPipe(updateSubAdminStagesSchema))
    body: z.infer<typeof updateSubAdminStagesSchema>,
  ) {
    return this.conferences.setSubAdminStages(request.user!, id, userId, body.stages);
  }

  @Post('conferences/:id/team')
  @UseGuards(AuthGuard)
  createTeamMember(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(createTeamMemberSchema))
    body: z.infer<typeof createTeamMemberSchema>,
  ) {
    return this.conferences.createTeamMember(request.user!, id, body);
  }

  @Post('conferences/:id/session-chairs')
  @UseGuards(AuthGuard)
  createSessionChair(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(createAdminSchema))
    body: z.infer<typeof createAdminSchema>,
  ) {
    return this.conferences.createSessionChair(request.user!, id, body);
  }

  @Get('conferences/:id')
  @UseGuards(AuthGuard)
  one(@Req() request: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.conferences.getOne(request.user!, id);
  }

  @Patch('conferences/:id')
  @UseGuards(AuthGuard)
  update(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateConferenceSchema))
    body: z.infer<typeof updateConferenceSchema>,
  ) {
    return this.conferences.update(request.user!, id, body);
  }

  @Post('conferences/:id/tracks')
  @UseGuards(AuthGuard)
  addTrack(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(trackSchema)) body: z.infer<typeof trackSchema>,
  ) {
    return this.conferences.addTrack(request.user!, id, body);
  }

  @Delete('conferences/:id/tracks/:trackId')
  @HttpCode(204)
  @UseGuards(AuthGuard)
  async removeTrack(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('trackId', ParseUUIDPipe) trackId: string,
  ) {
    await this.conferences.removeTrack(request.user!, id, trackId);
  }

  @Post('conferences/:id/deadlines')
  @UseGuards(AuthGuard)
  addDeadline(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(deadlineSchema)) body: z.infer<typeof deadlineSchema>,
  ) {
    return this.conferences.addDeadline(request.user!, id, body);
  }

  @Delete('conferences/:id/deadlines/:deadlineId')
  @HttpCode(204)
  @UseGuards(AuthGuard)
  async removeDeadline(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('deadlineId', ParseUUIDPipe) deadlineId: string,
  ) {
    await this.conferences.removeDeadline(request.user!, id, deadlineId);
  }

  @Post('conferences/:id/templates')
  @UseGuards(AuthGuard)
  saveTemplate(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(templateSchema)) body: z.infer<typeof templateSchema>,
  ) {
    return this.conferences.saveTemplate(request.user!, id, body);
  }

  @Post('conferences/:id/invitations')
  @HttpCode(202)
  @UseGuards(AuthGuard)
  invite(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(inviteMemberSchema))
    body: z.infer<typeof inviteMemberSchema>,
  ) {
    return this.conferences.invite(request.user!, id, body);
  }
  @Post('conferences/:id/templates/file')
  @UseGuards(AuthGuard)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  saveTemplateFile(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    if (!file) {
      throw new BadRequestException('Upload a PDF or Word file (max 10 MB)');
    }
    const kind = String(request.body?.kind ?? 'NOTIFICATION');
    const language = String(request.body?.language ?? 'en');
    const subject = String(request.body?.subject ?? '');
    return this.conferences.saveTemplateFile(
      request.user!,
      id,
      {
        kind: kind as z.infer<typeof templateSchema>['kind'],
        language: language as z.infer<typeof templateSchema>['language'],
        subject,
      },
      file,
    );
  }

  @Get('conferences/:id/templates/:templateId/file')
  @UseGuards(AuthGuard)
  async downloadTemplateFile(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('templateId', ParseUUIDPipe) templateId: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const file = await this.conferences.downloadTemplateFile(
      request.user!,
      id,
      templateId,
    );
    response.setHeader('Content-Type', file.contentType);
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${file.name.replace(/"/g, '')}"`,
    );
    return new StreamableFile(file.bytes);
  }


  @Post('conferences/:id/invitation/respond')
  @HttpCode(204)
  @UseGuards(AuthGuard)
  async respondMine(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(invitationResponseSchema))
    body: z.infer<typeof invitationResponseSchema>,
  ) {
    await this.conferences.respondMine(request.user!, id, body.accept);
  }

  @Post('conferences/:id/members/:membershipId/remove')
  @HttpCode(204)
  @UseGuards(AuthGuard)
  async removeMember(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('membershipId', ParseUUIDPipe) membershipId: string,
  ) {
    await this.conferences.removeMember(request.user!, id, membershipId);
  }

  @Post('invitations/accept')
  @HttpCode(204)
  @UseGuards(AuthGuard)
  async accept(
    @Req() request: AuthenticatedRequest,
    @Body(new ZodValidationPipe(tokenSchema)) body: z.infer<typeof tokenSchema>,
  ) {
    await this.conferences.respond(request.user!, body.token, true);
  }

  @Post('invitations/decline')
  @HttpCode(204)
  @UseGuards(AuthGuard)
  async decline(
    @Req() request: AuthenticatedRequest,
    @Body(new ZodValidationPipe(tokenSchema)) body: z.infer<typeof tokenSchema>,
  ) {
    await this.conferences.respond(request.user!, body.token, false);
  }
}
