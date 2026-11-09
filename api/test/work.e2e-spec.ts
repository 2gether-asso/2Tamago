import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { gameHours, withRules, WORK } from '@2tamago/core';
import type { MeResponse, PetWorkResponse, WorkResponse } from '@2tamago/core/contracts';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { Clock } from '../src/common/clock.js';
import { AppConfig } from '../src/config/app-config.js';
import { setupApp } from '../src/setup-app.js';

class FakeClock extends Clock {
  time = Date.UTC(2026, 10, 9, 9);
  override now() {
    return this.time;
  }
  advance(ms: number) {
    this.time += ms;
  }
}
type Agent = ReturnType<typeof request.agent>;
const rules = withRules();
const HOUR = 3_600_000;

describe('Work (e2e)', () => {
  let app: INestApplication<App>;
  let clock: FakeClock;

  beforeEach(async () => {
    clock = new FakeClock();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AppConfig)
      .useValue(
        new AppConfig({
          DATABASE_URL: 'memory://',
          AUTH_DEV_LOGIN: 'true',
          ADMIN_DISCORD_IDS: 'dev:root',
          GAME_DEPARTURE: 'false',
        }),
      )
      .overrideProvider(Clock)
      .useValue(clock)
      .compile();
    app = setupApp(moduleRef.createNestApplication());
    await app.init();
  });
  afterEach(async () => {
    await app.close();
  });

  async function signIn(name: string): Promise<Agent> {
    const agent = request.agent(app.getHttpServer());
    const { body } = await agent.post('/api/auth/dev-login').send({ name }).expect(200);
    agent.set('Authorization', `Bearer ${body.access_token}`);
    return agent;
  }
  const me = async (agent: Agent): Promise<MeResponse> =>
    (await agent.get('/api/me').expect(200)).body;

  /** A player with a child (which can work), looked after by the test through long stages. */
  async function withChild(name: string): Promise<Agent> {
    const root = await signIn('Root');
    const agent = await signIn(name);
    await agent.post('/api/pet').send({ name: 'Pompon', species: 'mochi', color: 42 }).expect(201);
    await root
      .put('/api/admin/rules')
      .send({ stageHours: { baby: 1, child: 1000 }, awakeDecayPerHour: { happiness: 0 } })
      .expect(200);
    clock.advance(gameHours(rules, 1.7));
    return agent;
  }

  it('pays the player once per hour', async () => {
    const agent = await signIn('Alice');
    const before = (await me(agent)).player.coins;
    const first: WorkResponse = (
      await agent.post('/api/work/player').send({ score: 4 }).expect(200)
    ).body;
    expect(first.earned).toBe(4 * WORK.coinsPerPoint);
    expect(first.coins).toBe(before + first.earned);
    expect(first.status.playerAvailableAt).toBe(clock.time + HOUR);

    const refused = await agent.post('/api/work/player').send({ score: 5 }).expect(409);
    expect(refused.body).toMatchObject({ code: 'work_cooldown', availableAt: clock.time + HOUR });

    clock.advance(HOUR);
    await agent.post('/api/work/player').send({ score: 5 }).expect(200);
    await agent.post('/api/work/player').send({ score: 6 }).expect(400);
  });

  it('lets the companion work, tires it, and has its own cooldown', async () => {
    const agent = await withChild('Bob');
    const coins = (await me(agent)).player.coins;
    const energy = (await me(agent)).pet!.state.stats.energy;
    const worked: PetWorkResponse = (await agent.post('/api/work/pet').expect(200)).body;
    expect(worked.earned).toBeGreaterThanOrEqual(1);
    expect(worked.coins).toBe(coins + worked.earned);
    expect(worked.pet.state.stats.energy).toBeLessThan(energy);

    const refused = await agent.post('/api/work/pet').expect(409);
    expect(refused.body.code).toBe('work_cooldown');
    // The player's own job is independent of the companion's.
    await agent.post('/api/work/player').send({ score: 1 }).expect(200);
  });

  it('does not use the cooldown when the companion cannot work', async () => {
    const agent = await signIn('Carol');
    await agent.post('/api/work/pet').expect(404);
    await agent.post('/api/pet').send({ name: 'Pompon', species: 'mochi', color: 42 }).expect(201);
    // Still an egg.
    await agent.post('/api/work/pet').expect(409);
    const status = (await agent.get('/api/work').expect(200)).body;
    expect(status.petAvailableAt).toBe(0);
  });
});
