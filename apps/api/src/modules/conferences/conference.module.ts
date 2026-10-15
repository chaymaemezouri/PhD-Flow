import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { ConferenceController } from './conference.controller.js';
import { ConferenceService } from './conference.service.js';

@Module({
  imports: [AuthModule],
  controllers: [ConferenceController],
  providers: [ConferenceService],
})
export class ConferenceModule {}
