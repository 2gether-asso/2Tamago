import { Global, Module } from '@nestjs/common';
import { AppConfig } from './app-config.js';
import { ClientConfigController } from './client-config.controller.js';
import { Clock } from '../common/clock.js';

@Global()
@Module({
  controllers: [ClientConfigController],
  providers: [{ provide: AppConfig, useFactory: () => new AppConfig() }, Clock],
  exports: [AppConfig, Clock],
})
export class ConfigModule {}
