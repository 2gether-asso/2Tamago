import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { gameHours, WALK_ZONES, WEATHER_EFFECTS, weatherAt, withRules } from '@2tamago/core';
import type {
  ActionResponse,
  EventsOverview,
  GameEventDto,
  MeResponse,
  WalkResponse,
} from '@2tamago/core/contracts';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { vi } from 'vitest';
import { AnnouncementSender } from '../src/announcements/announcement-sender.js';
import { AppModule } from '../src/app.module.js';
import { Clock } from '../src/common/clock.js';
import { AppConfig } from '../src/config/app-config.js';
import { DAILY_BONUS } from '../src/players/players.service.js';
import { setupApp } from '../src/setup-app.js';
import { CARESS_REWARD } from '../src/social/village.service.js';

class FakeClock extends Clock {
  time = Date.UTC(2026, 10, 9, 9);
  override now() {
    return this.time;
  }
  advance(ms: number) {
    this.time += ms;
  }
}
class FakeAnnouncer extends AnnouncementSender {
  enabled = true;
  messages: string[] = [];
  override async send(text: string) {
    this.messages.push(text);
  }
}

type Agent = ReturnType<typeof request.agent>;
const rules = withRules();
const hours = (h: number) => gameHours(rules, h);
const DAY = 86_400_000;

describe('Events (e2e)', () => {
  let app: INestApplication<App>;
  let clock: FakeClock;
  let announcer: FakeAnnouncer;

  beforeEach(async () => {
    clock = new FakeClock();
    announcer = new FakeAnnouncer();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AppConfig)
      .useValue(
        new AppConfig({
          DATABASE_URL: 'memory://',
          AUTH_DEV_LOGIN: 'true',
          ADMIN_DISCORD_IDS: 'dev:root',
        }),
      )
      .overrideProvider(Clock)
      .useValue(clock)
      .overrideProvider(AnnouncementSender)
      .useValue(announcer)
      .compile();
    app = setupApp(moduleRef.createNestApplication());
    await app.init();
  });
  afterEach(async () => {
    vi.restoreAllMocks();
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
  const overview = async (agent: Agent): Promise<EventsOverview> =>
    (await agent.get('/api/events').expect(200)).body;
  /** An event that starts `from` ms from now and lasts `length` ms. */
  const schedule = (admin: Agent, kind: string, percent: number, from = 0, length = DAY) =>
    admin
      .post('/api/admin/events')
      .send({ kind, percent, startsAt: clock.time + from, endsAt: clock.time + from + length });

  it('is for admins to schedule, and within sensible limits', async () => {
    const root = await signIn('Root');
    const alice = await signIn('Alice');
    await schedule(alice, 'walk_coins', 50).expect(403);
    await alice.get('/api/admin/events').expect(403);
    await request(app.getHttpServer()).get('/api/events').expect(401);

    await schedule(root, 'walk_coins', 0).expect(400); // no effect
    await schedule(root, 'walk_coins', 301).expect(400); // too generous
    await schedule(root, 'shop_discount', 91).expect(400); // nearly free
    await schedule(root, 'nothing', 10).expect(400);
    await schedule(root, 'walk_coins', 10, 0, 0).expect(400); // ends when it starts
    await schedule(root, 'walk_coins', 10, 0, 15 * DAY).expect(400); // too long
    await schedule(root, 'shop_discount', 90).expect(201);
    expect(await root.get('/api/admin/events').expect(200)).toHaveProperty('body.length', 1);
  });

  it('shows what is on and what is coming, not what is over or called off', async () => {
    const root = await signIn('Root');
    const alice = await signIn('Alice');
    const now: GameEventDto = (await schedule(root, 'walk_coins', 50).expect(201)).body;
    const soon: GameEventDto = (await schedule(root, 'daily_bonus', 100, 2 * DAY).expect(201)).body;
    await schedule(root, 'caress_reward', 100, 30 * DAY).expect(201); // too far to be announced
    const called: GameEventDto = (await schedule(root, 'shop_discount', 20).expect(201)).body;
    await root.delete(`/api/admin/events/${called.id}`).expect(204);
    await root.delete(`/api/admin/events/${called.id}`).expect(404);

    let seen = await overview(alice);
    expect(seen.active.map((e) => e.id)).toEqual([now.id]);
    expect(seen.upcoming.map((e) => e.id)).toEqual([soon.id]);

    clock.advance(2 * DAY + 1);
    seen = await overview(alice);
    expect(seen.active.map((e) => e.id)).toEqual([soon.id]); // the first is over
    expect(seen.upcoming).toEqual([]);
    expect(
      ((await root.get('/api/admin/events').expect(200)).body as GameEventDto[]).some(
        (e) => e.cancelled,
      ),
    ).toBe(true);
  });

  it('announces a new event in the community channel, in each reader’s own time', async () => {
    const root = await signIn('Root');
    await schedule(root, 'shop_discount', 25, 3_600_000, 2 * DAY).expect(201);
    const [message] = announcer.messages.filter((m) => m.includes('Événement'));
    expect(message).toContain('boutique : −25 %');
    const start = Math.floor((clock.time + 3_600_000) / 1000);
    expect(message).toContain(`<t:${start}:f>`);
    expect(message).toContain(`<t:${start + 2 * 86_400}:f>`);
  });

  it('lowers the prices of the shop while it lasts: the best discount counts', async () => {
    const root = await signIn('Root');
    const alice = await signIn('Alice');
    const coins = async () => (await me(alice)).player.coins;
    const buy = (quantity: number) =>
      alice.post('/api/shop/buy').send({ item: 'cookie', quantity }).expect(200);

    const start = await coins();
    await buy(1); // 8
    expect(await coins()).toBe(start - 8);

    await schedule(root, 'shop_discount', 25).expect(201);
    const half = (await schedule(root, 'shop_discount', 50).expect(201)).body as GameEventDto;
    const before = await coins();
    await buy(3); // 4 each, not added up with the 25 %
    expect(await coins()).toBe(before - 12);

    await root.delete(`/api/admin/events/${half.id}`).expect(204);
    const mid = await coins();
    await buy(1); // only 25 % off now: 6
    expect(await coins()).toBe(mid - 6);

    clock.advance(DAY + 1);
    const end = await coins();
    await buy(1);
    expect(await coins()).toBe(end - 8);
  });

  it('raises the daily bonus, the caress reward and the coins found on walks', async () => {
    const root = await signIn('Root');
    await schedule(root, 'daily_bonus', 50).expect(201);
    await schedule(root, 'caress_reward', 100).expect(201);
    await schedule(root, 'walk_coins', 100).expect(201);

    // The bonus of a first sign-in is +50 %.
    const alice = await signIn('Alice');
    const first = await me(alice);
    expect(first.player.coins).toBe(50 + Math.round(DAILY_BONUS * 1.5));
    const bob = await signIn('Bob');
    await bob.get('/api/me').expect(200);

    await alice.post('/api/pet').send({ name: 'Pompon', species: 'mochi', color: 42 }).expect(201);
    await bob.post('/api/pet').send({ name: 'Caillou', species: 'mochi', color: 42 }).expect(201);
    clock.advance(hours(0.5));

    // A visit's caress pays double.
    const petId = (await me(alice)).pet!.id;
    const before = (await me(bob)).player.coins;
    const caress: ActionResponse = (await bob.post(`/api/village/${petId}/caress`).expect(200))
      .body;
    expect(caress.coins).toBe(before + CARESS_REWARD * 2);
    expect(caress.notices).toContainEqual({ code: 'coins_earned', count: CARESS_REWARD * 2 });

    // A walk's coins too: make Bob's companion a child, and fix the dice (the lowest coin roll: 5; they also give an item).
    await root
      .put('/api/admin/rules')
      .send({ stageHours: { baby: 1, child: 1000 } })
      .expect(200);
    clock.advance(hours(1.7));
    await bob.post('/api/pet/actions').send({ type: 'feed' });
    const setOff = clock.time;
    await bob.post('/api/pet/walk').send({}).expect(200);
    clock.advance(hours(rules.outingHours));
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const walk: WalkResponse = (await bob.post('/api/pet/walk/return').expect(200)).body;
    // The lowest coin roll, with the weather of the day, then doubled by the event.
    const weather = WEATHER_EFFECTS[weatherAt(rules, setOff, 'meadow')];
    const lowest = Math.round((WALK_ZONES.meadow.coins.min * (100 + weather.coinsPercent)) / 100);
    expect(walk.found.coins).toBe(lowest * 2);
  });
});
