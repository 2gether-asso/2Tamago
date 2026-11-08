import { Global, Module } from '@nestjs/common';
import { AnnouncementSender, WebhookSender } from './announcement-sender.js';
import { AnnouncementService } from './announcement.service.js';

@Global()
@Module({
  providers: [{ provide: AnnouncementSender, useClass: WebhookSender }, AnnouncementService],
  exports: [AnnouncementService],
})
export class AnnouncementsModule {}
