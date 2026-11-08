import { StandardSchemaValidationPipe, type INestApplication } from '@nestjs/common';
import { AppConfig } from './config/app-config.js';

/** Settings shared by `main.ts` and the e2e tests. */
export function setupApp(app: INestApplication): INestApplication {
  app.setGlobalPrefix('api');
  // The web app may be served from another origin (GitHub Pages): allow it, with its session cookie.
  app.enableCors({ origin: app.get(AppConfig).webOrigin, credentials: true });
  app.useGlobalPipes(new StandardSchemaValidationPipe());
  app.enableShutdownHooks();
  return app;
}
