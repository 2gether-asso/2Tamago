import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { characterSheet, gameHours, HEIRLOOM, HEIRLOOM_BONUS, withRules } from '@2tamago/core';
import type { ActionResponse, MeResponse } from '@2tamago/core/contracts';
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

const rules = withRules();
type Agent = ReturnType<typeof request.agent>;

describe('Heirloom egg (e2e)', () => {
  let app: INestApplication<App>;
  let clock: FakeClock;

  async function start(env: Record<string, string> = {}) {
    clock = new FakeClock();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AppConfig)
      .useValue(
        new AppConfig({
          DATABASE_URL: 'memory://',
          AUTH_DEV_LOGIN: 'true',
          // Nobody looks after the companions while the clock jumps: they stay unless a test says so.
          GAME_DEPARTURE: 'false',
          ...env,
        }),
      )
      .overrideProvider(Clock)
      .useValue(clock)
      .compile();
    app = setupApp(moduleRef.createNestApplication());
    await app.init();
  }
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
  const adopt = (agent: Agent, name: string) =>
    agent.post('/api/pet').send({ name, species: 'mochi', color: 42 });
  /** Grows the companion old (the clock jumps over its whole life). */
  async function grow(agent: Agent) {
    clock.advance(gameHours(rules, 400));
    const pet = (await me(agent)).pet!.state;
    expect(pet.stage).toBe('elder');
    return pet;
  }

  it('leaves an egg when a companion retires, and gives its bonus to the next one, once', async () => {
    await start();
    const alice = await signIn('Alice');
    await adopt(alice, 'Pompon').expect(201);
    expect((await me(alice)).heirloom).toBeNull();
    const elder = await grow(alice);
    expect(elder.form).not.toBeNull();
    const bonus = HEIRLOOM_BONUS[elder.form!];

    await alice.post('/api/pet/actions').send({ type: 'retire' }).expect(201);
    expect((await me(alice)).heirloom).toEqual({
      from: 'Pompon',
      species: 'mochi',
      form: elder.form,
      bonus,
    });

    // The next egg gets it, and the egg is not waiting any more.
    const bis = (await adopt(alice, 'Bis').expect(201)).body.state;
    expect((await me(alice)).heirloom).toBeNull();
    const plain = (await adopt(await signIn('Bob'), 'Bob').expect(201)).body.state;
    if (bonus === 'bond') {
      expect(bis.bond).toBe(HEIRLOOM.bond);
    } else if (bonus === 'tricks') {
      expect(Object.values(bis.tricks)).toEqual(Array(4).fill(HEIRLOOM.trickProgress));
    } else {
      expect(characterSheet(bis).stats.luck).toBeGreaterThan(characterSheet(plain).stats.luck);
    }
    // Nobody else got anything.
    expect(plain.bond).toBe(0);
    expect(Object.values(plain.tricks)).toEqual([0, 0, 0, 0]);
  });

  it('is replaced by the next retirement, and a refused adoption keeps it', async () => {
    await start();
    const alice = await signIn('Alice');
    await adopt(alice, 'Pompon').expect(201);
    await grow(alice);
    await alice.post('/api/pet/actions').send({ type: 'retire' }).expect(201);
    const waiting = (await me(alice)).heirloom;
    expect(waiting?.from).toBe('Pompon');

    // A refused adoption (not a species): nothing is adopted, the egg stays for later.
    await alice.post('/api/pet').send({ name: 'Bis', species: 'bogus', color: 42 }).expect(400);
    expect((await me(alice)).heirloom).toEqual(waiting);

    await adopt(alice, 'Bis').expect(201);
    await adopt(alice, 'Ter').expect(409); // one companion at a time, and nothing is lost to it
    expect((await me(alice)).heirloom).toBeNull();
    await grow(alice);
    await alice.post('/api/pet/actions').send({ type: 'retire' }).expect(201);
    expect((await me(alice)).heirloom?.from).toBe('Bis');
  });

  it('is left by a retirement only: a companion that departs hands nothing down', async () => {
    await start({ GAME_DEPARTURE: 'true' });
    const alice = await signIn('Alice');
    await adopt(alice, 'Pompon').expect(201);
    clock.advance(gameHours(rules, 400));
    expect((await me(alice)).pet!.state.status).toBe('gone');
    expect((await me(alice)).heirloom).toBeNull();
    const next = (await adopt(alice, 'Bis').expect(201)).body.state;
    expect(next.bond).toBe(0);
  });

  it('is refused to a companion that is not an elder yet', async () => {
    await start();
    const alice = await signIn('Alice');
    await adopt(alice, 'Pompon').expect(201);
    clock.advance(gameHours(rules, 6)); // hatched, a baby
    const refused: ActionResponse | { code: string } = (
      await alice.post('/api/pet/actions').send({ type: 'retire' }).expect(409)
    ).body;
    expect((refused as { code: string }).code).toBe('not_elder');
    expect((await me(alice)).heirloom).toBeNull();
  });
});
