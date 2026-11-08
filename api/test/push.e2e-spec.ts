import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { gameHours, withRules } from '@2tamago/core';
import type { PushPayload } from '@2tamago/core/contracts';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { Clock } from '../src/common/clock.js';
import { AppConfig } from '../src/config/app-config.js';
import { PushNotifier } from '../src/push/push-notifier.service.js';
import { PushSender, type PushResult, type PushTarget } from '../src/push/push-sender.js';
import { setupApp } from '../src/setup-app.js';

class FakeClock extends Clock {
  time = Date.UTC(2026, 10, 7, 9);
  override now() {
    return this.time;
  }
  advance(ms: number) {
    this.time += ms;
  }
}

class FakeSender extends PushSender {
  enabled = true;
  sent: { endpoint: string; payload: PushPayload }[] = [];
  /** Endpoints the "push service" reports as expired. */
  gone = new Set<string>();
  override async send(target: PushTarget, payload: PushPayload): Promise<PushResult> {
    if (this.gone.has(target.endpoint)) return 'gone';
    this.sent.push({ endpoint: target.endpoint, payload });
    return 'sent';
  }
}

const rules = withRules();
const hours = (h: number) => gameHours(rules, h);

const subscription = (name: string, locale: 'fr' | 'en' = 'fr') => ({
  endpoint: `https://push.example.test/${name}`,
  keys: { p256dh: 'p256dh-key', auth: 'auth-secret' },
  locale,
});

describe('Web Push notifications (e2e)', () => {
  let app: INestApplication<App>;
  let clock: FakeClock;
  let sender: FakeSender;
  let notifier: PushNotifier;

  async function start(env: Record<string, string> = {}) {
    clock = new FakeClock();
    sender = new FakeSender();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AppConfig)
      .useValue(new AppConfig({ DATABASE_URL: 'memory://', AUTH_DEV_LOGIN: 'true', ...env }))
      .overrideProvider(Clock)
      .useValue(clock)
      .overrideProvider(PushSender)
      .useValue(sender)
      .compile();
    app = setupApp(moduleRef.createNestApplication());
    await app.init();
    notifier = app.get(PushNotifier);
  }
  const VAPID = { VAPID_PUBLIC_KEY: 'public-key', VAPID_PRIVATE_KEY: 'private-key' };

  afterEach(async () => {
    await app.close();
  });

  async function signIn(name: string) {
    const agent = request.agent(app.getHttpServer());
    const { body } = await agent.post('/api/auth/dev-login').send({ name }).expect(200);
    agent.set('Authorization', `Bearer ${body.access_token}`);
    return agent;
  }
  const adopt = (agent: ReturnType<typeof request.agent>, name: string) =>
    agent.post('/api/pet').send({ name, species: 'mochi', color: 42 }).expect(201);

  it('pushes a hunger alert once, in the language of the browser', async () => {
    await start(VAPID);
    const alice = await signIn('Alice');
    const bob = await signIn('Bob');
    await adopt(alice, 'Pompon');
    await adopt(bob, 'Caillou');
    await alice.put('/api/push/subscription').send(subscription('alice', 'en')).expect(204);

    // An egg, then a hatched and fed baby: nothing to say.
    await notifier.check();
    clock.advance(hours(0.5));
    await notifier.check();
    expect(sender.sent).toEqual([]);

    // Hours later it is hungry: Alice (subscribed) hears about it, Bob (not) does not. (The
    // temperament is random and changes how fast the pet tires: go step by step, waking it.)
    for (let step = 0; step < 12 && sender.sent.length === 0; step++) {
      clock.advance(hours(0.5));
      await alice.post('/api/pet/actions').send({ type: 'wake' });
      await notifier.check();
    }
    expect(sender.sent).toEqual([
      {
        endpoint: 'https://push.example.test/alice',
        payload: { kind: 'hungry', petName: 'Pompon', locale: 'en' },
      },
    ]);

    // Still hungry at the next checks: not repeated.
    clock.advance(hours(0.2));
    await notifier.check();
    await notifier.check();
    expect(sender.sent).toHaveLength(1);

    // Fed: the alert is over, so the next hunger is a new alert. (The temperament is random and
    // changes how fast the pet tires: go step by step, waking it, until it is hungry again.)
    await alice.post('/api/pet/actions').send({ type: 'feed' }).expect(201);
    await notifier.check();
    const hungry = () => sender.sent.filter((message) => message.payload.kind === 'hungry').length;
    expect(hungry()).toBe(1);
    for (let step = 0; step < 12 && hungry() < 2; step++) {
      clock.advance(hours(0.5));
      await alice.post('/api/pet/actions').send({ type: 'wake' });
      await notifier.check();
    }
    expect(hungry()).toBe(2);
    await notifier.check();
    expect(hungry()).toBe(2);
  });

  it('sends to every browser of a player, and forgets the ones that are gone', async () => {
    await start(VAPID);
    const alice = await signIn('Alice');
    await adopt(alice, 'Pompon');
    await alice.put('/api/push/subscription').send(subscription('phone', 'fr')).expect(204);
    await alice.put('/api/push/subscription').send(subscription('laptop', 'en')).expect(204);
    // Subscribing again from the same browser updates it instead of adding another.
    await alice.put('/api/push/subscription').send(subscription('laptop', 'fr')).expect(204);

    const first = (await alice.post('/api/push/test').expect(200)).body;
    expect(first).toEqual({ sent: 2 });
    expect(sender.sent.map((message) => [message.endpoint, message.payload])).toEqual([
      ['https://push.example.test/phone', { kind: 'test', petName: 'Pompon', locale: 'fr' }],
      ['https://push.example.test/laptop', { kind: 'test', petName: 'Pompon', locale: 'fr' }],
    ]);

    sender.gone.add('https://push.example.test/phone');
    expect((await alice.post('/api/push/test').expect(200)).body).toEqual({ sent: 1 });
    sender.gone.clear();
    expect((await alice.post('/api/push/test').expect(200)).body).toEqual({ sent: 1 });
  });

  it('stops after the player unsubscribes, and only for their own browser', async () => {
    await start(VAPID);
    const alice = await signIn('Alice');
    const bob = await signIn('Bob');
    await adopt(alice, 'Pompon');
    await alice.put('/api/push/subscription').send(subscription('alice')).expect(204);

    // Bob cannot remove Alice's browser.
    await bob
      .delete('/api/push/subscription')
      .send({ endpoint: subscription('alice').endpoint })
      .expect(204);
    expect((await alice.post('/api/push/test').expect(200)).body).toEqual({ sent: 1 });

    await alice
      .delete('/api/push/subscription')
      .send({ endpoint: subscription('alice').endpoint })
      .expect(204);
    expect((await alice.post('/api/push/test').expect(200)).body).toEqual({ sent: 0 });
    clock.advance(hours(9));
    await notifier.check();
    expect(sender.sent.map((message) => message.payload.kind)).toEqual(['test']);
  });

  it('refuses bad subscriptions, anonymous callers and servers without VAPID keys', async () => {
    await start(VAPID);
    const alice = await signIn('Alice');
    await alice.put('/api/push/subscription').send({ endpoint: 'nope' }).expect(400);
    await alice
      .put('/api/push/subscription')
      .send({ ...subscription('x'), locale: 'de' })
      .expect(400);
    await request(app.getHttpServer())
      .put('/api/push/subscription')
      .send(subscription('x'))
      .expect(401);
    await app.close();

    await start();
    const bob = await signIn('Bob');
    const refused = await bob.put('/api/push/subscription').send(subscription('bob')).expect(409);
    expect(refused.body.code).toBe('push_disabled');
    expect((await bob.post('/api/push/test').expect(409)).body.code).toBe('push_disabled');
  });

  it('shares the public key with the web app', async () => {
    await start(VAPID);
    const { body } = await request(app.getHttpServer()).get('/api/config').expect(200);
    expect(body.pushPublicKey).toBe('public-key');
  });
});
