import { StandardSchemaValidationPipe, type INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppConfig } from './config/app-config.js';

/** Settings shared by `main.ts` and the e2e tests. */
export function setupApp(app: INestApplication): INestApplication {
  // Behind the reverse proxy: trust X-Forwarded-* for the client IP (rate limits, session checks).
  (app as NestExpressApplication).set('trust proxy', 1);
  app.setGlobalPrefix('api');
  // The web app may be served from another origin (GitHub Pages): allow it.
  app.enableCors({ origin: app.get(AppConfig).webOrigin });
  app.useGlobalPipes(new StandardSchemaValidationPipe());
  app.enableShutdownHooks();
  return app;
}
