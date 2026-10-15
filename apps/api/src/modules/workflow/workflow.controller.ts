import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags } from '@nestjs/swagger';
import {
  decisionSchema,
  presentationSchema,
  roomSchema,
  sessionSchema,
  assessmentSchema,
  similaritySchema,
} from '@scholarflow/validation';
import type { z } from 'zod';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { AuthGuard, type AuthenticatedRequest } from '../auth/auth.guard.js';
import { CsrfGuard } from '../auth/csrf.guard.js';
import { WorkflowService } from './workflow.service.js';

@ApiTags('workflow')
@Controller()
@UseGuards(CsrfGuard, AuthGuard)
export class WorkflowController {
  constructor(private readonly workflow: WorkflowService) {}

  @Get('search')
  search(@Req() request: AuthenticatedRequest, @Query('q') q = '') {
    return this.workflow.search(request.user!, q);
  }

  @Get('papers/:id/follow-up')
  followUp(@Req() request: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.workflow.followUp(request.user!, id);
  }

  @Post('papers/:id/decision')
  decision(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(decisionSchema)) body: z.infer<typeof decisionSchema>,
  ) {
    return this.workflow.saveDecision(request.user!, id, body);
  }

  @Post('papers/:id/revision')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 20 * 1024 * 1024 } }))
  revision(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.workflow.storeFile(request.user!, id, 'REVISION', file);
  }

  @Post('papers/:id/editable')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 20 * 1024 * 1024 } }))
  editable(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.workflow.storeFile(request.user!, id, 'EDITABLE', file);
  }

  @Post('papers/:id/camera-ready')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 20 * 1024 * 1024 } }))
  cameraReady(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.workflow.storeFile(request.user!, id, 'CAMERA_READY', file);
  }

  @Post('papers/:id/copyright')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 20 * 1024 * 1024 } }))
  copyright(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.workflow.storeFile(request.user!, id, 'COPYRIGHT', file);
  }

  @Post('papers/:id/similarity-report')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 20 * 1024 * 1024 } }))
  similarityReport(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.workflow.storeFile(request.user!, id, 'SIMILARITY', file);
  }

  @Post('papers/:id/template/validate')
  validateTemplate(@Req() request: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.workflow.validateTemplate(request.user!, id);
  }

  @Post('papers/:id/similarity/verify')
  verifySimilarity(@Req() request: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.workflow.verifySimilarity(request.user!, id);
  }

  @Get('conferences/:id/copyright-template')
  copyrightTemplate(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.workflow.copyrightTemplate(request.user!, id);
  }

  @Get('conferences/:id/statistics')
  statistics(@Req() request: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.workflow.statistics(request.user!, id);
  }

  @Post('presentations/:id/assessment')
  assess(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(assessmentSchema)) body: z.infer<typeof assessmentSchema>,
  ) {
    return this.workflow.assessPresentation(request.user!, id, body);
  }

  @Post('papers/:id/similarity')
  similarity(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(similaritySchema)) body: z.infer<typeof similaritySchema>,
  ) {
    return this.workflow.saveSimilarity(request.user!, id, body);
  }

  @Post('papers/:id/copyright/validate')
  validateCopyright(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.workflow.validateCopyright(request.user!, id, true);
  }

  @Post('conferences/:id/register')
  register(@Req() request: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.workflow.register(request.user!, id);
  }

  @Post('conferences/:id/registrations/:userId/verify')
  verify(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) userId: string,
  ) {
    return this.workflow.verifyRegistration(request.user!, id, userId);
  }

  @Get('conferences/:id/program')
  program(@Req() request: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.workflow.program(request.user!, id);
  }

  @Post('conferences/:id/rooms')
  room(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(roomSchema)) body: z.infer<typeof roomSchema>,
  ) {
    return this.workflow.addRoom(request.user!, id, body);
  }

  @Post('conferences/:id/sessions')
  session(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(sessionSchema)) body: z.infer<typeof sessionSchema>,
  ) {
    return this.workflow.addSession(request.user!, id, body);
  }

  @Post('sessions/:id/presentations')
  present(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(presentationSchema)) body: z.infer<typeof presentationSchema>,
  ) {
    return this.workflow.assignPresentation(request.user!, id, body);
  }

  @Post('conferences/:id/reminders')
  remind(@Req() request: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.workflow.remind(request.user!, id);
  }

  @Get('conferences/:id/export')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  export(@Req() request: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.workflow.exportMetadata(request.user!, id);
  }
}
