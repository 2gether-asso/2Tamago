import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { MeResponse, PlayerProfile, VisitResponse } from '@2tamago/core/contracts';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { AppConfig } from '../src/config/app-config.js';
import { setupApp } from '../src/setup-app.js';

type Agent = ReturnType<typeof request.agent>;
const EMPTY = { wall: null, floor: null, props: [] };

describe('Room (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AppConfig)
      .useValue(
        new AppConfig({
          DATABASE_URL: 'memory://',
          AUTH_DEV_LOGIN: 'true',
          ADMIN_DISCORD_IDS: 'dev:root',
        }),
      )
      .compile();
    app = setupApp(moduleRef.createNestApplication());
    await app.init();
    const root = request.agent(app.getHttpServer());
    const { body } = await root.post('/api/auth/dev-login').send({ name: 'Root' }).expect(200);
    root.set('Authorization', `Bearer ${body.access_token}`);
    await root
      .post('/api/admin/codes')
      .send({ code: 'DECOR-FUNDS', coins: 1000, maxUses: 20 })
      .expect(201);
  });
  afterEach(async () => {
    await app.close();
  });

  /** A player with plenty of coins: the decoration costs more than the starting purse. */
  async function signIn(name: string, fund = true): Promise<Agent> {
    const agent = request.agent(app.getHttpServer());
    const { body } = await agent.post('/api/auth/dev-login').send({ name }).expect(200);
    agent.set('Authorization', `Bearer ${body.access_token}`);
    if (fund) await agent.post('/api/codes/redeem').send({ code: 'DECOR-FUNDS' }).expect(200);
    return agent;
  }
  const me = async (agent: Agent): Promise<MeResponse> =>
    (await agent.get('/api/me').expect(200)).body;
  const buy = (agent: Agent, item: string) =>
    agent.post('/api/shop/buy').send({ item, quantity: 1 }).expect(200);
  const setRoom = (agent: Agent, room: object) => agent.put('/api/room').send(room);

  it('starts empty, sells decoration, and shows what the player sets', async () => {
    const alice = await signIn('Alice');
    expect((await me(alice)).room).toEqual(EMPTY);
    await buy(alice, 'floor_wood');
    await buy(alice, 'plant');
    const room = { wall: null, floor: 'floor_wood', props: ['plant'] };
    expect((await setRoom(alice, room).expect(200)).body).toEqual(room);
    expect((await me(alice)).room).toEqual(room);
    // A new sign-in sees it too: it is stored.
    expect((await me(await signIn('Alice', false))).room).toEqual(room);
  });

  it('refuses what is not owned, misplaced or too many', async () => {
    const alice = await signIn('Alice');
    await buy(alice, 'plant');
    await buy(alice, 'floor_wood');

    const unowned = await setRoom(alice, { ...EMPTY, wall: 'wall_sea' }).expect(409);
    expect(unowned.body.code).toBe('room_not_owned');
    const misplaced = await setRoom(alice, { ...EMPTY, wall: 'floor_wood' }).expect(409);
    expect(misplaced.body.code).toBe('room_invalid');
    const twice = await setRoom(alice, { ...EMPTY, props: ['plant', 'plant'] }).expect(409);
    expect(twice.body.code).toBe('room_invalid');
    // Not decoration at all, or too many props: refused before the rules.
    await setRoom(alice, { ...EMPTY, props: ['cookie'] }).expect(400);
    await setRoom(alice, { ...EMPTY, props: ['plant', 'lamp', 'cushion', 'fishbowl'] }).expect(400);
    await setRoom(alice, { floor: null }).expect(400);
    expect((await me(alice)).room).toEqual(EMPTY);
  });

  it('is shown to visitors and on the profile, without what was traded away', async () => {
    const alice = await signIn('Alice');
    const bob = await signIn('Bob');
    await alice.post('/api/pet').send({ name: 'Pompon', species: 'mochi', color: 42 }).expect(201);
    await buy(alice, 'lamp');
    await buy(alice, 'wall_stars');
    const room = { wall: 'wall_stars', floor: null, props: ['lamp'] };
    await setRoom(alice, room).expect(200);

    const { player, pet } = await me(alice);
    const visit: VisitResponse = (await bob.get(`/api/village/${pet!.id}`).expect(200)).body;
    expect(visit.room).toEqual(room);
    const profile = (): Promise<PlayerProfile> =>
      bob.get(`/api/players/${player.id}`).then((r) => r.body);
    expect((await profile()).room).toEqual(room);

    // Giving the lamp away takes it out of the room.
    const bobId = (await me(bob)).player.id;
    await alice
      .post('/api/trades')
      .send({ targetId: bobId, offer: { lamp: 1 }, request: {} })
      .expect(201);
    const trade = (await bob.get('/api/trades').expect(200)).body.incoming[0];
    await bob.post(`/api/trades/${trade.id}/accept`).expect(200);
    const after = { wall: 'wall_stars', floor: null, props: [] };
    expect((await me(alice)).room).toEqual(after);
    expect((await bob.get(`/api/village/${pet!.id}`).expect(200)).body.room).toEqual(after);
    // Bob owns the lamp now but his own room is still empty until he places it.
    expect((await me(bob)).room).toEqual(EMPTY);
  });

  it('keeps decoration once: a second one is not given by a trade', async () => {
    const alice = await signIn('Alice');
    const bob = await signIn('Bob');
    const bobId = (await me(bob)).player.id;
    await buy(alice, 'plant');
    await buy(bob, 'plant');
    const refused = await alice
      .post('/api/trades')
      .send({ targetId: bobId, offer: { plant: 1 }, request: {} })
      .expect(409);
    expect(refused.body.code).toBe('trade_invalid');
    await alice
      .post('/api/trades')
      .send({ targetId: bobId, offer: { plant: 2 }, request: {} })
      .expect(400);
  });

  it('needs a session', async () => {
    await request(app.getHttpServer()).put('/api/room').send(EMPTY).expect(401);
  });
});
