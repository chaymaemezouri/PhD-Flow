import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../auth/auth.guard.js';
import { CsrfGuard } from '../auth/csrf.guard.js';
import { SystemAdminGuard } from '../auth/system-admin.guard.js';
import { PrismaService } from '../../prisma/prisma.service.js';

@ApiTags('system')
@Controller('system')
@UseGuards(CsrfGuard, AuthGuard, SystemAdminGuard)
export class SystemController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('status')
  @ApiOperation({ summary: 'Platform status for system administrators' })
  async status(): Promise<{ accounts: number }> {
    const accounts = await this.prisma.user.count();
    return { accounts };
  }
}
