import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { initErrorReporting } from './common/error-reporter.js';
import { AppModule } from './app.module.js';
import { AppConfig } from './config/app-config.js';
import { setupApp } from './setup-app.js';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get(AppConfig);
  initErrorReporting({ dsn: config.sentryDsn, environment: config.env });
  // Behind the reverse proxy: trust X-Forwarded-* for client IPs (rate limits).
  app.set('trust proxy', 1);
  setupApp(app);
  await app.listen(config.port);
}
await bootstrap();
