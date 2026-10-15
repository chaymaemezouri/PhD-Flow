import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { HealthResponse } from '@scholarflow/types';
import type { Response } from 'express';
import { HealthService } from './health.service.js';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @ApiOperation({ summary: 'Report API and database availability' })
  @ApiOkResponse({ description: 'The API process is running. Database may be down.' })
  async getHealth(
    @Res({ passthrough: true }) response: Response,
  ): Promise<HealthResponse> {
    const result = await this.healthService.check();
    if (result.status !== 'ok') {
      response.status(HttpStatus.SERVICE_UNAVAILABLE);
    }
    return result;
  }
}
