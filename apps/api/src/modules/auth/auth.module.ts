import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthController } from './auth.controller.js';
import { AuthGuard } from './auth.guard.js';
import { AuthService } from './auth.service.js';
import { CsrfGuard } from './csrf.guard.js';
import { ObjectStorage } from '../papers/object-storage.js';
import { EmailService } from './email.service.js';
import { PasswordService } from './password.service.js';
import { SystemAdminGuard } from './system-admin.guard.js';
import { SystemController } from '../system/system.controller.js';

@Module({
  controllers: [AuthController, SystemController],
  providers: [
    AuthService,
    PasswordService,
    EmailService,
    ObjectStorage,
    AuthGuard,
    SystemAdminGuard,
    { provide: APP_GUARD, useClass: CsrfGuard },
  ],
  exports: [AuthGuard, SystemAdminGuard, EmailService],
})
export class AuthModule {}
