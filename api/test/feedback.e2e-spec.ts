import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { AppConfig } from '../src/config/app-config.js';
import type { FeedbackReport } from '../src/feedback/feedback-report.js';
import { FeedbackReporter } from '../src/feedback/feedback-reporter.js';
import { setupApp } from '../src/setup-app.js';

class FakeReporter extends FeedbackReporter {
  reports: FeedbackReport[] = [];
  override async report(report: FeedbackReport) {
    this.reports.push(report);
  }
}

async function createApp(env: Record<string, string>, reporter: FakeReporter) {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(AppConfig)
    .useValue(new AppConfig({ DATABASE_URL: 'memory://', AUTH_DEV_LOGIN: 'true', ...env }))
    .overrideProvider(FeedbackReporter)
    .useValue(reporter)
    .compile();
  const app = setupApp(moduleRef.createNestApplication());
  await app.init();
  return app as INestApplication<App>;
}

describe('Feedback (e2e)', () => {
  let app: INestApplication<App>;
  let reporter: FakeReporter;

  afterEach(async () => {
    await app.close();
  });

  async function signIn(name: string) {
    const agent = request.agent(app.getHttpServer());
    await agent.post('/api/auth/dev-login').send({ name }).expect(200);
    return agent;
  }

  describe('with a SENTRY_DSN', () => {
    beforeEach(async () => {
      reporter = new FakeReporter();
      app = await createApp({ SENTRY_DSN: 'https://key@glitchtip.example/1' }, reporter);
    });

    it('reports a bug as an error with the player and the page', async () => {
      const alice = await signIn('Alice');
      await alice
        .post('/api/feedback')
        .send({ type: 'bug', message: 'Le village ne charge plus', page: '/village' })
        .expect(204);
      expect(reporter.reports).toHaveLength(1);
      expect(reporter.reports[0]).toMatchObject({
        message: '[Bug] Le village ne charge plus',
        level: 'error',
        tags: { kind: 'feedback', feedback_type: 'bug', page: '/village' },
        user: { username: 'Alice' },
      });
    });

    it('reports an idea as information', async () => {
      const alice = await signIn('Alice');
      await alice
        .post('/api/feedback')
        .send({ type: 'idea', message: 'Ajouter des dinos !' })
        .expect(204);
      expect(reporter.reports[0]?.level).toBe('info');
    });

    it('refuses empty, too short or unknown feedback, and anonymous senders', async () => {
      const alice = await signIn('Alice');
      await alice.post('/api/feedback').send({ type: 'bug', message: 'court' }).expect(400);
      await alice
        .post('/api/feedback')
        .send({ type: 'rant', message: 'Un message correct' })
        .expect(400);
      await request(app.getHttpServer())
        .post('/api/feedback')
        .send({ type: 'bug', message: 'Un message correct' })
        .expect(401);
      expect(reporter.reports).toHaveLength(0);
    });

    it('limits how often a client can send feedback', async () => {
      const alice = await signIn('Alice');
      const send = () =>
        alice.post('/api/feedback').send({ type: 'idea', message: 'Un message correct' });
      for (let i = 0; i < 5; i++) await send().expect(204);
      await send().expect(429);
    });

    it('announces that feedback is available', async () => {
      const { body } = await request(app.getHttpServer()).get('/api/config').expect(200);
      expect(body.feedbackEnabled).toBe(true);
    });
  });

  describe('without a SENTRY_DSN', () => {
    beforeEach(async () => {
      reporter = new FakeReporter();
      app = await createApp({}, reporter);
    });

    it('answers 503 with a code instead of silently dropping the message', async () => {
      const alice = await signIn('Alice');
      const { body } = await alice
        .post('/api/feedback')
        .send({ type: 'bug', message: 'Un message correct' })
        .expect(503);
      expect(body.code).toBe('feedback_disabled');
      expect(reporter.reports).toHaveLength(0);
    });
  });
});
