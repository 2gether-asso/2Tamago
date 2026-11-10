import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { MeResponse } from '@2tamago/core/contracts';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { AppConfig } from '../src/config/app-config.js';
import { setupApp } from '../src/setup-app.js';

type Agent = ReturnType<typeof request.agent>;

describe('Shop (e2e)', () => {
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
  const buy = (agent: Agent, item: string, quantity = 1) =>
    agent.post('/api/shop/buy').send({ item, quantity });

  it('sells consumables in any quantity', async () => {
    const alice = await signIn('Alice');
    await buy(alice, 'cookie', 2).expect(200);
    const second = await buy(alice, 'cookie', 2).expect(200);
    expect(second.body.inventory).toEqual({ cookie: 4 });
  });

  it('keeps an accessory or a decoration once: no bundle, no second one', async () => {
    const alice = await signIn('Alice');
    const before = (await me(alice)).player.coins;

    expect((await buy(alice, 'ribbon', 2).expect(409)).body.code).toBe('already_owned');
    expect((await me(alice)).player.coins).toBe(before);

    await buy(alice, 'ribbon').expect(200);
    const again = await buy(alice, 'ribbon').expect(409);
    expect(again.body.code).toBe('already_owned');
    const bag = await me(alice);
    expect(bag.inventory).toEqual({ ribbon: 1 });
    expect(bag.player.coins).toBe(before - 50);
    // Even short of coins, the answer is that the player owns it.
    expect(bag.player.coins).toBeLessThan(50);
  });

  it('lets only one of two simultaneous purchases through, and charges once', async () => {
    const root = await signIn('Root');
    await root
      .post('/api/admin/codes')
      .send({ code: 'SHOP-FUNDS', coins: 500, maxUses: 5 })
      .expect(201);
    const alice = await signIn('Alice');
    await alice.post('/api/codes/redeem').send({ code: 'SHOP-FUNDS' }).expect(200);
    const before = (await me(alice)).player.coins;

    const results = await Promise.all([buy(alice, 'lamp'), buy(alice, 'lamp')]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    const bag = await me(alice);
    expect(bag.inventory).toEqual({ lamp: 1 });
    expect(bag.player.coins).toBe(before - 70);
  });
});
