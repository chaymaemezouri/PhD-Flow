import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { ObjectStorage } from './object-storage.js';
import { PaperController } from './paper.controller.js';
import { PaperService } from './paper.service.js';

@Module({
  imports: [AuthModule],
  controllers: [PaperController],
  providers: [PaperService, ObjectStorage],
})
export class PaperModule {}
