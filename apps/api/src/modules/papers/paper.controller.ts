import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Req,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags } from '@nestjs/swagger';
import {
  cancelPaperSchema,
  createPaperSchema,
  replaceAuthorsSchema,
  scopeDecisionSchema,
  updatePaperSchema,
  withdrawPaperSchema,
} from '@scholarflow/validation';
import type { Response } from 'express';
import type { z } from 'zod';
import { PaperFileKind } from '../../generated/prisma/client.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { AuthGuard, type AuthenticatedRequest } from '../auth/auth.guard.js';
import { CsrfGuard } from '../auth/csrf.guard.js';
import { PaperService } from './paper.service.js';

@ApiTags('papers')
@Controller()
@UseGuards(CsrfGuard, AuthGuard)
export class PaperController {
  constructor(private readonly papers: PaperService) {}

  @Get('papers')
  mine(@Req() request: AuthenticatedRequest) {
    return this.papers.listMine(request.user!);
  }

  @Get('conferences/:id/papers')
  list(@Req() request: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.papers.list(request.user!, id);
  }

  @Post('conferences/:id/papers')
  create(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(createPaperSchema))
    body: z.infer<typeof createPaperSchema>,
  ) {
    return this.papers.create(request.user!, id, body);
  }

  @Get('papers/:id')
  one(@Req() request: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.papers.getOne(request.user!, id);
  }

  @Patch('papers/:id')
  update(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updatePaperSchema))
    body: z.infer<typeof updatePaperSchema>,
  ) {
    return this.papers.update(request.user!, id, body);
  }

  @Put('papers/:id/authors')
  authors(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(replaceAuthorsSchema))
    body: z.infer<typeof replaceAuthorsSchema>,
  ) {
    return this.papers.replaceAuthors(request.user!, id, body);
  }

  @Post('papers/:id/manuscript')
  @UseInterceptors(
    FileInterceptor('manuscript', { limits: { fileSize: 20 * 1024 * 1024 } }),
  )
  upload(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    if (!file) {
      return this.papers.storeManuscript(request.user!, id, {
        originalname: '',
        mimetype: '',
        size: 0,
        buffer: Buffer.alloc(0),
      });
    }
    return this.papers.storeManuscript(request.user!, id, file);
  }

  @Get('papers/:id/manuscript')
  async download(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const file = await this.papers.download(request.user!, id);
    response.setHeader('Content-Type', file.contentType || 'application/pdf');
    response.setHeader(
      'Content-Disposition',
      `inline; filename="${file.name.replace(/"/g, '')}"`,
    );
    return new StreamableFile(file.bytes);
  }

  @Get('papers/:id/files/:kind')
  async downloadKind(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('kind') kind: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const normalized = kind.toUpperCase().replace(/-/g, '_');
    const matched = Object.values(PaperFileKind).find((value) => value === normalized);
    if (!matched) {
      throw new BadRequestException('Unknown file kind');
    }
    const file = await this.papers.downloadByKind(request.user!, id, matched);
    response.setHeader('Content-Type', file.contentType || 'application/octet-stream');
    response.setHeader(
      'Content-Disposition',
      `inline; filename="${file.name.replace(/"/g, '')}"`,
    );
    return new StreamableFile(file.bytes);
  }

  @Post('papers/:id/submit')
  submit(@Req() request: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.papers.submit(request.user!, id);
  }

  @Post('papers/:id/scope')
  scope(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(scopeDecisionSchema))
    body: z.infer<typeof scopeDecisionSchema>,
  ) {
    return this.papers.decideScope(
      request.user!,
      id,
      body.accept,
      body.reason ?? '',
    );
  }

  @Post('papers/:id/withdraw')
  withdraw(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(withdrawPaperSchema))
    body: z.infer<typeof withdrawPaperSchema>,
  ) {
    return this.papers.withdraw(request.user!, id, body);
  }

  @Post('papers/:id/cancel')
  cancel(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(cancelPaperSchema))
    body: z.infer<typeof cancelPaperSchema>,
  ) {
    return this.papers.cancel(request.user!, id, body);
  }
}
