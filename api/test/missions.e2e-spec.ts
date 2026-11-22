import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { gameHours, MISSION_REWARD, withRules } from '@2tamago/core';
import type {
  ActionResponse,
  DailyMissionsDto,
  MeResponse,
  MissionsClaimResponse,
} from '@2tamago/core/contracts';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { vi } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { Clock } from '../src/common/clock.js';
import { AppConfig } from '../src/config/app-config.js';
import { setupApp } from '../src/setup-app.js';

// The day's missions depend on the (random) player id: pin them.
vi.mock('@2tamago/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@2tamago/core')>()),
  pickMissions: () => ['play_games', 'cuddles', 'sweet_treat'],
}));

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

describe('Daily missions (e2e)', () => {
  let app: INestApplication<App>;
  let clock: FakeClock;

  beforeEach(async () => {
    clock = new FakeClock();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AppConfig)
      .useValue(new AppConfig({ DATABASE_URL: 'memory://', AUTH_DEV_LOGIN: 'true' }))
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
  const act = async (agent: Agent, action: object): Promise<ActionResponse> =>
    (await agent.post('/api/pet/actions').send(action).expect(201)).body;

  it('counts what the player does, pays each mission, then opens the present once', async () => {
    const alice = await signIn('Alice');
    await alice.post('/api/pet').send({ name: 'Pompon', species: 'mochi', color: 1 }).expect(201);
    clock.advance(gameHours(rules, 0.2));

    let missions: DailyMissionsDto = (await alice.get('/api/missions').expect(200)).body;
    expect(missions.missions.map((m) => m.id)).toEqual(['play_games', 'cuddles', 'sweet_treat']);
    expect(missions.allDone).toBe(false);
    await alice.post('/api/missions/claim').expect(409);

    await act(alice, { type: 'play', score: 2 });
    const played = await act(alice, { type: 'play', score: 2 });
    expect(played.notices).toContainEqual({ code: 'mission_done', mission: 'play_games' });

    for (let i = 0; i < 5; i++) {
      clock.advance(rules.caressCooldownSeconds * 1000);
      await act(alice, { type: 'caress' });
    }
    // A caress on cooldown does not count.
    await act(alice, { type: 'caress' });
    await alice.post('/api/shop/buy').send({ item: 'cookie', quantity: 1 }).expect(200);
    await act(alice, { type: 'treat', item: 'cookie' });

    missions = (await alice.get('/api/missions').expect(200)).body;
    expect(missions.missions.map((m) => m.progress)).toEqual([2, 5, 1]);
    expect(missions.allDone).toBe(true);

    const before: MeResponse = (await alice.get('/api/me').expect(200)).body;
    const opened: MissionsClaimResponse = (await alice.post('/api/missions/claim').expect(200))
      .body;
    expect(MISSION_REWARD.presents).toContain(opened.item);
    expect(opened.coins).toBe(before.player.coins + MISSION_REWARD.bonusCoins);
    expect(opened.missions.claimed).toBe(true);
    const after: MeResponse = (await alice.get('/api/me').expect(200)).body;
    expect(after.inventory[opened.item]).toBeGreaterThanOrEqual(1);
    const again = await alice.post('/api/missions/claim').expect(409);
    expect(again.body.code).toBe('already_opened');
  });
});
