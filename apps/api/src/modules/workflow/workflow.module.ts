import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { ObjectStorage } from '../papers/object-storage.js';
import { WorkflowController } from './workflow.controller.js';
import { WorkflowService } from './workflow.service.js';

@Module({
  imports: [AuthModule],
  controllers: [WorkflowController],
  providers: [WorkflowService, ObjectStorage],
})
export class WorkflowModule {}
