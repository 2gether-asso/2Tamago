import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { gameHours, withRules } from '@2tamago/core';
import type {
  ActionResponse,
  ActivityDto,
  MeResponse,
  PlayerProfile,
  VillagePet,
  WalkResponse,
} from '@2tamago/core/contracts';
import pg from 'pg';
import request from 'supertest';
import type { App } from 'supertest/types.js';
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

/** In-memory PGlite by default; set TEST_DATABASE_URL to run against a real PostgreSQL. */
const databaseUrl = process.env.TEST_DATABASE_URL || 'memory://';
const isPostgres = databaseUrl.startsWith('postgres');

const rules = withRules();
const hours = (h: number) => gameHours(rules, h);

describe('2Tamago API (e2e)', () => {
  let app: INestApplication<App>;
  let clock: FakeClock;

  beforeEach(async () => {
    clock = new FakeClock();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AppConfig)
      .useValue(
        new AppConfig({
          DATABASE_URL: databaseUrl,
          AUTH_DEV_LOGIN: 'true',
          ADMIN_DISCORD_IDS: 'dev:root',
        }),
      )
      .overrideProvider(Clock)
      .useValue(clock)
      .compile();
    app = setupApp(moduleRef.createNestApplication());
    await app.init();
    if (isPostgres) await resetDatabase();
  });

  /** A real database is shared between tests: empty it (migrations are applied by `app.init()`). */
  async function resetDatabase() {
    const client = new pg.Client({ connectionString: databaseUrl });
    await client.connect();
    try {
      await client.query('TRUNCATE players RESTART IDENTITY CASCADE');
    } finally {
      await client.end();
    }
  }

  afterEach(async () => {
    await app.close();
  });

  /** Signs in and returns an agent that keeps the session cookie. */
  async function signIn(name: string) {
    const agent = request.agent(app.getHttpServer());
    await agent.post('/api/auth/dev-login').send({ name }).expect(200);
    return agent;
  }

  async function adopt(agent: ReturnType<typeof request.agent>, name: string) {
    await agent.post('/api/pet').send({ name, species: 'mochi', color: 42 }).expect(201);
  }

  it('rejects anonymous requests and serves public routes', async () => {
    await request(app.getHttpServer()).get('/api/me').expect(401);
    await request(app.getHttpServer()).get('/api/health').expect(200);
    const rulesResponse = await request(app.getHttpServer()).get('/api/game/rules').expect(200);
    expect(rulesResponse.body.stepMinutes).toBe(rules.stepMinutes);
  });

  it('tells the web app what it cannot know at build time', async () => {
    const { body } = await request(app.getHttpServer()).get('/api/config').expect(200);
    expect(body).toEqual({ sentryDsn: null, feedbackEnabled: false });
  });

  it('runs the life of a pet', async () => {
    const alice = await signIn('Alice');
    let me: MeResponse = (await alice.get('/api/me').expect(200)).body;
    expect(me.pet).toBeNull();
    expect(me.player.coins).toBe(70); // 50 at sign-up + daily bonus

    await adopt(alice, 'Pompon');
    await alice.post('/api/pet').send({ name: 'Bis', species: 'pyon', color: 0 }).expect(409);
    await alice.post('/api/pet').send({ name: '', species: 'pyon', color: 0 }).expect(400);

    clock.advance(hours(3));
    me = (await alice.get('/api/me').expect(200)).body;
    expect(me.pet?.state.stage).toBe('baby');

    const fed: ActionResponse = (
      await alice.post('/api/pet/actions').send({ type: 'feed' }).expect(201)
    ).body;
    expect(fed.pet.state.stats.satiety).toBeGreaterThan(me.pet!.state.stats.satiety);

    const played: ActionResponse = (
      await alice.post('/api/pet/actions').send({ type: 'play', score: 3 }).expect(201)
    ).body;
    expect(played.coins).toBe(72);

    // Buy a treat and give it.
    const bought = await alice.post('/api/shop/buy').send({ item: 'cookie' }).expect(200);
    expect(bought.body.inventory).toEqual({ cookie: 1 });
    await alice.post('/api/pet/actions').send({ type: 'treat', item: 'cookie' }).expect(201);
    const noMore = await alice
      .post('/api/pet/actions')
      .send({ type: 'treat', item: 'cookie' })
      .expect(409);
    expect(noMore.body.code).toBe('missing_item');

    // The hatching made it to the activity feed.
    const feed: ActivityDto[] = (await alice.get('/api/activity').expect(200)).body;
    expect(feed.map((entry) => entry.data.event)).toContain('hatched');
  });

  it('derives the night clock from the game time zone and lets a player switch the lights off', async () => {
    const rulesNow = (await request(app.getHttpServer()).get('/api/game/rules').expect(200)).body;
    // 2026-11-07: Paris is on UTC+1.
    expect(rulesNow.night.clockOffsetHours).toBe(1);

    const alice = await signIn('Alice');
    await adopt(alice, 'Lune');
    clock.advance(hours(0.5)); // hatched, 09:30 UTC = 10:30 local: broad daylight
    await alice.post('/api/pet/actions').send({ type: 'lights', on: false }).expect(409);

    clock.time = Date.UTC(2026, 10, 7, 21, 30); // 22:30 local
    await alice.post('/api/pet/actions').send({ type: 'lights', on: false }).expect(201);
    clock.advance(10 * 60_000);
    const me: MeResponse = (await alice.get('/api/me').expect(200)).body;
    expect(me.pet?.state.lightsOff).toBe(true);
    expect(me.pet?.state.asleep).toBe(true);
  });

  it('shows a player profile with their stats and living companion', async () => {
    const alice = await signIn('Alice');
    const bob = await signIn('Bob');
    await adopt(alice, 'Pompon');
    await adopt(bob, 'Mochi');
    clock.advance(hours(0.5)); // both hatched

    const aliceMe: MeResponse = (await alice.get('/api/me').expect(200)).body;
    const bobMe: MeResponse = (await bob.get('/api/me').expect(200)).body;
    const alicePet = aliceMe.pet!.id;
    await bob.post(`/api/village/${alicePet}/caress`).expect(200);
    await bob.post(`/api/village/${alicePet}/gift`).send({ item: 'cookie' }).expect(409); // no cookie

    // Bob looks at Alice's profile.
    const profile: PlayerProfile = (await bob.get(`/api/players/${aliceMe.player.id}`).expect(200))
      .body;
    expect(profile.player).toMatchObject({ displayName: 'Alice', isYou: false });
    expect(profile.pet?.state.name).toBe('Pompon');
    expect(profile.stats).toMatchObject({
      companions: 1,
      retired: 0,
      departed: 0,
      caressesReceived: 1,
      caressesGiven: 0,
      walks: 0,
    });

    // Alice sees herself, and Bob's caress counted on his side.
    const own: PlayerProfile = (await alice.get(`/api/players/${aliceMe.player.id}`).expect(200))
      .body;
    expect(own.player.isYou).toBe(true);
    const bobs: PlayerProfile = (await alice.get(`/api/players/${bobMe.player.id}`).expect(200))
      .body;
    expect(bobs.stats.caressesGiven).toBe(1);
  });

  it('refuses unknown players and bad ids, and anonymous visitors', async () => {
    const alice = await signIn('Alice');
    const { body } = await alice
      .get('/api/players/00000000-0000-4000-8000-000000000000')
      .expect(404);
    expect(body.code).toBe('no_player');
    await alice.get('/api/players/not-a-uuid').expect(400);
    await request(app.getHttpServer())
      .get('/api/players/00000000-0000-4000-8000-000000000000')
      .expect(401);
  });

  it('keeps traits secret while the pet is an egg, then reveals them', async () => {
    const alice = await signIn('Alice');
    const bob = await signIn('Bob');
    await adopt(alice, 'Pompon');

    let me: MeResponse = (await alice.get('/api/me').expect(200)).body;
    expect(me.pet?.state.stage).toBe('egg');
    expect(me.pet?.state.traits).toBeUndefined();
    let village: VillagePet[] = (await bob.get('/api/village').expect(200)).body;
    expect(village[0]?.traits).toBeNull();

    clock.advance(hours(0.5));
    me = (await alice.get('/api/me').expect(200)).body;
    expect(me.pet?.state.stage).toBe('baby');
    expect(me.pet?.state.traits?.temperament).toBeTruthy();
    village = (await bob.get('/api/village').expect(200)).body;
    expect(village[0]?.traits).toEqual(me.pet?.state.traits);
  });

  it('lets a neglected pet leave, then adopt a new egg', async () => {
    const bob = await signIn('Bob');
    await adopt(bob, 'Caillou');
    clock.advance(hours(24 * 6));
    const me: MeResponse = (await bob.get('/api/me').expect(200)).body;
    expect(me.pet?.state.status).toBe('gone');
    expect(me.pet?.mood).toBe('gone');

    await adopt(bob, 'Caillou II');
    const album = (await bob.get('/api/album').expect(200)).body;
    expect(album).toHaveLength(1);
    expect(album[0].name).toBe('Caillou');
  });

  it('connects players: village, caresses, gifts and walks', async () => {
    const alice = await signIn('Alice');
    const bob = await signIn('Bob');
    await adopt(alice, 'Pompon');
    await adopt(bob, 'Caillou');

    // Grow them to the child stage, taking care of them now and then.
    for (let i = 0; i < 8; i++) {
      clock.advance(hours(2));
      for (const agent of [alice, bob]) {
        await agent.post('/api/pet/actions').send({ type: 'wake' });
        await agent.post('/api/pet/actions').send({ type: 'feed' });
        await agent.post('/api/pet/actions').send({ type: 'clean' });
      }
    }

    const village: VillagePet[] = (await alice.get('/api/village').expect(200)).body;
    expect(village.map((pet) => pet.name)).toEqual(['Caillou']);
    const bobPetId = village[0]!.petId;

    await alice.get(`/api/village/${bobPetId}`).expect(200);
    await alice.post(`/api/village/${bobPetId}/caress`).expect(200);
    const twice = await alice.post(`/api/village/${bobPetId}/caress`).expect(409);
    expect(twice.body.code).toBe('already_caressed');

    await alice.post('/api/shop/buy').send({ item: 'strawberry' }).expect(200);
    await alice.post(`/api/village/${bobPetId}/gift`).send({ item: 'strawberry' }).expect(200);

    const bobFeed: ActivityDto[] = (await bob.get('/api/activity').expect(200)).body;
    expect(bobFeed.map((entry) => entry.kind)).toEqual(
      expect.arrayContaining(['visit_caress', 'visit_gift']),
    );

    // A good night's sleep, then both go for a walk at the same time: they meet.
    for (const agent of [alice, bob]) await agent.post('/api/pet/actions').send({ type: 'sleep' });
    clock.advance(hours(9));
    for (const agent of [alice, bob]) {
      await agent.post('/api/pet/actions').send({ type: 'feed' });
      await agent.post('/api/pet/walk').expect(200);
    }
    await alice.post('/api/pet/walk/return').expect(409);
    clock.advance(hours(rules.outingHours));
    const walk: WalkResponse = (await alice.post('/api/pet/walk/return').expect(200)).body;
    expect(walk.encounters.map((e) => e.name)).toEqual(['Caillou']);
    expect(walk.found.coins).toBeGreaterThan(0);

    const bobWalk: WalkResponse = (await bob.post('/api/pet/walk/return').expect(200)).body;
    expect(bobWalk.encounters.map((e) => e.name)).toEqual(['Pompon']);
  });

  it('lets an admin tune the game rules without a restart', async () => {
    const alice = await signIn('Alice');
    const root = await signIn('Root');
    await alice.get('/api/admin/rules').expect(403);
    await alice
      .put('/api/admin/rules')
      .send({ stageHours: { baby: 1 } })
      .expect(403);

    const initial = (await root.get('/api/admin/rules').expect(200)).body;
    expect(initial.overrides).toEqual({});
    expect(initial.effective.stageHours.baby).toBe(rules.stageHours.baby);

    // Fixed or unknown rules, and nonsensical values, are refused.
    await root.put('/api/admin/rules').send({ timeScale: 60 }).expect(400);
    await root.put('/api/admin/rules').send({ poopIntervalHours: 0 }).expect(400);

    const saved = (
      await root
        .put('/api/admin/rules')
        .send({ stageHours: { baby: 1 }, caressCooldownSeconds: 3 })
        .expect(200)
    ).body;
    expect(saved.effective.stageHours).toEqual({ ...rules.stageHours, baby: 1 });
    expect(saved.base.stageHours.baby).toBe(rules.stageHours.baby);

    // Everyone gets the new rules right away.
    const served = (await alice.get('/api/game/rules').expect(200)).body;
    expect(served.stageHours.baby).toBe(1);
    expect(served.caressCooldownSeconds).toBe(3);

    // And an empty object goes back to the defaults.
    await root.put('/api/admin/rules').send({}).expect(200);
    const reset = (await alice.get('/api/game/rules').expect(200)).body;
    expect(reset.stageHours.baby).toBe(rules.stageHours.baby);
  });
});
