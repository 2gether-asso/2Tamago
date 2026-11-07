import { StandardSchemaValidationPipe, type INestApplication } from '@nestjs/common';

/** Settings shared by `main.ts` and the e2e tests. */
export function setupApp(app: INestApplication): INestApplication {
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new StandardSchemaValidationPipe());
  app.enableShutdownHooks();
  return app;
}
