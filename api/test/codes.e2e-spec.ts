import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { GiftCodeDto, MeResponse, RedeemResponse } from '@2tamago/core/contracts';
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

describe('Gift codes (e2e)', () => {
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
  const redeem = (agent: Agent, code: string) => agent.post('/api/codes/redeem').send({ code });
  const create = (admin: Agent, body: object) => admin.post('/api/admin/codes').send(body);

  it('is for admins to make, and for everyone to use', async () => {
    const root = await signIn('Root');
    const alice = await signIn('Alice');
    await alice.get('/api/admin/codes').expect(403);
    await create(alice, { code: 'SNEAKY-1', coins: 10, maxUses: 1 }).expect(403);
    await request(app.getHttpServer()).post('/api/codes/redeem').send({ code: 'x' }).expect(401);

    // What a code may be.
    await create(root, { code: 'abc', coins: 10, maxUses: 5 }).expect(400); // too short
    await create(root, { code: 'WITH SPACE', coins: 10, maxUses: 5 }).expect(400);
    await create(root, { code: 'EMPTY-GIFT', maxUses: 5 }).expect(400); // gives nothing
    await create(root, {
      code: 'MANY-ITEMS',
      maxUses: 5,
      items: { cookie: 1, cake: 1, ribbon: 1, hat: 1, crown: 1 },
    }).expect(400);
    await create(root, { code: 'NOT-AN-ITEM', maxUses: 5, items: { gold: 1 } }).expect(400);
    await create(root, { code: 'NO-USES', coins: 10 }).expect(400);

    const made: GiftCodeDto = (
      await create(root, {
        code: 'welcome-2026',
        coins: 25,
        items: { cookie: 2 },
        maxUses: 5,
      }).expect(201)
    ).body;
    expect(made).toMatchObject({
      code: 'WELCOME-2026',
      coins: 25,
      items: { cookie: 2 },
      maxUses: 5,
      uses: 0,
      expiresAt: null,
      disabled: false,
    });
    // Case does not matter, for the admin or for the player.
    expect(
      (await create(root, { code: 'Welcome-2026', coins: 1, maxUses: 1 }).expect(409)).body.code,
    ).toBe('code_exists');

    const before = (await me(alice)).player.coins;
    const gift: RedeemResponse = (await redeem(alice, '  welcome-2026 ').expect(200)).body;
    expect(gift).toMatchObject({ coins: 25, items: { cookie: 2 }, balance: before + 25 });
    expect(gift.inventory).toEqual({ cookie: 2 });
    expect((await me(alice)).player.coins).toBe(before + 25);
    expect((await redeem(alice, 'WELCOME-2026').expect(409)).body.code).toBe(
      'code_already_redeemed',
    );
    expect((await redeem(alice, 'NOPE-0000').expect(404)).body.code).toBe('no_code');
    expect(((await root.get('/api/admin/codes').expect(200)).body as GiftCodeDto[])[0]!.uses).toBe(
      1,
    );
  });

  it('runs out, expires and can be switched off', async () => {
    const root = await signIn('Root');
    const [alice, bob, carol] = [await signIn('Alice'), await signIn('Bob'), await signIn('Carol')];

    // Two uses in all: the third member gets nothing, and loses nothing.
    await create(root, { code: 'TWO-ONLY', coins: 10, maxUses: 2 }).expect(201);
    await redeem(alice, 'TWO-ONLY').expect(200);
    await redeem(bob, 'TWO-ONLY').expect(200);
    const before = (await me(carol)).player.coins;
    expect((await redeem(carol, 'TWO-ONLY').expect(409)).body.code).toBe('code_used_up');
    expect((await me(carol)).player.coins).toBe(before);
    // The failed attempt did not use the code up for anyone else, nor count as a use.
    expect(((await root.get('/api/admin/codes').expect(200)).body as GiftCodeDto[])[0]!.uses).toBe(
      2,
    );

    // It ends at its date.
    const ends = clock.time + 3_600_000;
    await create(root, { code: 'SHORT-LIVED', coins: 10, maxUses: 10, expiresAt: ends }).expect(
      201,
    );
    await redeem(alice, 'SHORT-LIVED').expect(200);
    clock.advance(3_600_001);
    expect((await redeem(bob, 'SHORT-LIVED').expect(409)).body.code).toBe('code_expired');

    // An admin switches it off: it is as if it did not exist.
    const live: GiftCodeDto = (
      await create(root, { code: 'CANCELLED', coins: 10, maxUses: 10 }).expect(201)
    ).body;
    await root.delete(`/api/admin/codes/${live.id}`).expect(204);
    expect((await redeem(carol, 'CANCELLED').expect(404)).body.code).toBe('no_code');
    await root.delete(`/api/admin/codes/${live.id}`).expect(404);
    const listed = (await root.get('/api/admin/codes').expect(200)).body as GiftCodeDto[];
    expect(listed.find((code) => code.id === live.id)?.disabled).toBe(true);
  });

  it('gives the last use to one of two members who use it at the same time', async () => {
    const root = await signIn('Root');
    const [alice, bob] = [await signIn('Alice'), await signIn('Bob')];
    await create(root, { code: 'LAST-ONE', coins: 10, maxUses: 1 }).expect(201);
    const answers = await Promise.all([redeem(alice, 'LAST-ONE'), redeem(bob, 'LAST-ONE')]);
    expect(answers.map((answer) => answer.status).sort()).toEqual([200, 409]);
    const coins = [(await me(alice)).player.coins, (await me(bob)).player.coins].sort();
    expect(coins[1]! - coins[0]!).toBe(10);
  });
});
