import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  assignReviewerSchema,
  conflictSchema,
  declineAssignmentSchema,
  reviewFormSchema,
  tokenSchema,
} from '@scholarflow/validation';
import type { z } from 'zod';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { AuthGuard, type AuthenticatedRequest } from '../auth/auth.guard.js';
import { CsrfGuard } from '../auth/csrf.guard.js';
import { ReviewService } from './review.service.js';

@ApiTags('reviews')
@Controller()
@UseGuards(CsrfGuard, AuthGuard)
export class ReviewController {
  constructor(private readonly reviews: ReviewService) {}

  @Get('reviews/mine')
  mine(@Req() request: AuthenticatedRequest) {
    return this.reviews.mine(request.user!);
  }

  @Get('conferences/:id/reviewers')
  directory(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.reviews.directory(request.user!, id);
  }

  @Get('conferences/:id/session-chairs')
  chairs(@Req() request: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.reviews.chairs(request.user!, id);
  }

  @Get('conferences/:id/conflicts')
  conflicts(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.reviews.listConflicts(request.user!, id);
  }

  @Post('conferences/:id/conflicts')
  declareConflict(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(conflictSchema)) body: z.infer<typeof conflictSchema>,
  ) {
    return this.reviews.declareConflict(request.user!, id, body);
  }

  @Get('papers/:id/assignments')
  forPaper(@Req() request: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.reviews.forPaper(request.user!, id);
  }

  @Post('papers/:id/assignments')
  invite(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(assignReviewerSchema))
    body: z.infer<typeof assignReviewerSchema>,
  ) {
    return this.reviews.invite(request.user!, id, body);
  }

  @Post('assignments/respond')
  @HttpCode(204)
  async respond(
    @Req() request: AuthenticatedRequest,
    @Body(new ZodValidationPipe(tokenSchema)) body: z.infer<typeof tokenSchema>,
  ) {
    await this.reviews.respond(request.user!, body.token, true);
  }

  @Post('assignments/:id/accept')
  @HttpCode(204)
  async accept(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.reviews.respondById(request.user!, id, true);
  }

  @Post('assignments/:id/decline')
  @HttpCode(204)
  async decline(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(declineAssignmentSchema))
    body: z.infer<typeof declineAssignmentSchema>,
  ) {
    await this.reviews.respondById(request.user!, id, false, body);
  }

  @Post('assignments/:id/review')
  @HttpCode(204)
  async review(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(reviewFormSchema)) body: z.infer<typeof reviewFormSchema>,
  ) {
    await this.reviews.submitReview(request.user!, id, body);
  }

  @Post('assignments/:id/cancel')
  @HttpCode(204)
  async cancel(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.reviews.cancel(request.user!, id);
  }
}
