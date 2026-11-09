import { Module } from '@nestjs/common';
import { PushController } from './push.controller.js';
import { PushNotifier } from './push-notifier.service.js';
import { PushSender, WebPushSender } from './push-sender.js';
import { PushService } from './push.service.js';

@Module({
  controllers: [PushController],
  providers: [{ provide: PushSender, useClass: WebPushSender }, PushService, PushNotifier],
  exports: [PushService],
})
export class PushModule {}
