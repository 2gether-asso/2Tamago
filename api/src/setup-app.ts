import { StandardSchemaValidationPipe, type INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { clientIpMiddleware } from './common/client-ip.js';
import { AppConfig } from './config/app-config.js';

/** Settings shared by `main.ts` and the e2e tests. */
export function setupApp(app: INestApplication): INestApplication {
  const { trustProxy, clientIpHeader } = app.get(AppConfig).network;
  // Which proxies we believe about X-Forwarded-For, and optionally a header from a trusted edge.
  (app as NestExpressApplication).set('trust proxy', trustProxy);
  app.use(clientIpMiddleware(clientIpHeader));
  app.setGlobalPrefix('api');
  // The web app may be served from another origin (GitHub Pages): allow it.
  app.enableCors({ origin: app.get(AppConfig).webOrigin });
  app.useGlobalPipes(new StandardSchemaValidationPipe());
  app.enableShutdownHooks();
  return app;
}
