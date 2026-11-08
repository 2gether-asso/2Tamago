import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { gameHours, withRules } from '@2tamago/core';
import type { WalkResponse } from '@2tamago/core/contracts';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AnnouncementSender } from '../src/announcements/announcement-sender.js';
import { AppModule } from '../src/app.module.js';
import { Clock } from '../src/common/clock.js';
import { AppConfig } from '../src/config/app-config.js';
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
class FakeSender extends AnnouncementSender {
  enabled = true;
  messages: string[] = [];
  override async send(text: string) {
    this.messages.push(text);
  }
}

const rules = withRules();
const hours = (h: number) => gameHours(rules, h);

describe('Discord announcements (e2e)', () => {
  let app: INestApplication<App>;
  let clock: FakeClock;
  let sender: FakeSender;

  beforeEach(async () => {
    clock = new FakeClock();
    sender = new FakeSender();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AppConfig)
      .useValue(new AppConfig({ DATABASE_URL: 'memory://', AUTH_DEV_LOGIN: 'true' }))
      .overrideProvider(Clock)
      .useValue(clock)
      .overrideProvider(AnnouncementSender)
      .useValue(sender)
      .compile();
    app = setupApp(moduleRef.createNestApplication());
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  async function signIn(name: string) {
    const agent = request.agent(app.getHttpServer());
    await agent.post('/api/auth/dev-login').send({ name }).expect(200);
    return agent;
  }
  const say = (fragment: string) => sender.messages.filter((m) => m.includes(fragment));

  it('welcomes a player once, at their first sign-in', async () => {
    await signIn('Ada');
    await signIn('Ada');
    await signIn('Bob');
    expect(say('vient de rejoindre')).toEqual([
      '👋 **Ada** vient de rejoindre 2Tamago ! Bienvenue !',
      '👋 **Bob** vient de rejoindre 2Tamago ! Bienvenue !',
    ]);
  });

  it('announces a hatching and growth once each, when they are saved', async () => {
    const ada = await signIn('Ada');
    await ada.post('/api/pet').send({ name: 'Pompon', species: 'mochi', color: 10 }).expect(201);
    expect(say('éclore')).toHaveLength(0); // still an egg

    clock.advance(hours(0.5));
    await ada.get('/api/me').expect(200);
    await ada.get('/api/me').expect(200); // reading again must not repeat it
    expect(say('vient d’éclore')).toEqual([
      '🥚 **Pompon**, le compagnon de **Ada**, vient d’éclore ! (Mochi)',
    ]);

    clock.advance(hours(13));
    await ada.get('/api/me').expect(200);
    expect(say('a grandi')).toHaveLength(1);
    expect(say('a grandi')[0]).toContain('enfant');
  });

  it('only announces the first walk two players share', async () => {
    const alice = await signIn('Alice');
    const bob = await signIn('Bob');
    for (const [agent, name] of [
      [alice, 'Pompon'],
      [bob, 'Caillou'],
    ] as const) {
      await agent.post('/api/pet').send({ name, species: 'mochi', color: 42 }).expect(201);
    }
    // Grow them to the child stage (walks are not for babies).
    for (let i = 0; i < 8; i++) {
      clock.advance(hours(2));
      for (const agent of [alice, bob]) {
        await agent.post('/api/pet/actions').send({ type: 'wake' });
        await agent.post('/api/pet/actions').send({ type: 'feed' });
        await agent.post('/api/pet/actions').send({ type: 'clean' });
      }
    }

    // A good night's sleep, so that they have the energy to go out.
    for (const agent of [alice, bob]) await agent.post('/api/pet/actions').send({ type: 'sleep' });
    clock.advance(hours(9));

    const walkTogether = async () => {
      for (const agent of [alice, bob]) {
        await agent.post('/api/pet/actions').send({ type: 'feed' });
        await agent.post('/api/pet/walk').expect(200);
      }
      clock.advance(hours(rules.outingHours));
      const returns = [];
      for (const agent of [alice, bob]) {
        returns.push((await agent.post('/api/pet/walk/return').expect(200)).body as WalkResponse);
      }
      return returns.flatMap((r) => r.encounters);
    };

    expect(await walkTogether()).toHaveLength(2); // each met the other
    expect(say('🤝')).toHaveLength(1);
    expect(say('🤝')[0]).toMatch(/Pompon.*Caillou|Caillou.*Pompon/);

    // They are out together again: they met already, the channel hears nothing new.
    clock.advance(hours(2));
    expect(await walkTogether()).toHaveLength(2);
    expect(say('🤝')).toHaveLength(1);
  });

  it('stays silent, and the game works, when no channel is configured', async () => {
    sender.enabled = false;
    const ada = await signIn('Ada');
    await ada.post('/api/pet').send({ name: 'Pompon', species: 'mochi', color: 10 }).expect(201);
    clock.advance(hours(0.5));
    await ada.get('/api/me').expect(200);
    expect(sender.messages).toEqual([]);
  });
});
