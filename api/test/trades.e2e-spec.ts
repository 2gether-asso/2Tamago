import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type {
  ActivityDto,
  Inventory,
  MeResponse,
  PushPayload,
  TradeDto,
  TradeOverview,
  TradeResult,
} from '@2tamago/core/contracts';
import { ITEMS } from '@2tamago/core';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { vi } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { Clock } from '../src/common/clock.js';
import { DAILY_BONUS } from '../src/players/players.service.js';
import { AppConfig } from '../src/config/app-config.js';
import { PushSender, type PushResult, type PushTarget } from '../src/push/push-sender.js';
import { setupApp } from '../src/setup-app.js';
import { TRADE } from '../src/social/trade.js';

class FakeClock extends Clock {
  time = Date.UTC(2026, 10, 9, 9);
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
  override async send(target: PushTarget, payload: PushPayload): Promise<PushResult> {
    this.sent.push({ endpoint: target.endpoint, payload });
    return 'sent';
  }
}

type Agent = ReturnType<typeof request.agent>;
const HOUR = 3_600_000;

describe('Trades (e2e)', () => {
  let app: INestApplication<App>;
  let clock: FakeClock;
  let sender: FakeSender;

  beforeEach(async () => {
    clock = new FakeClock();
    sender = new FakeSender();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AppConfig)
      .useValue(
        new AppConfig({
          DATABASE_URL: 'memory://',
          AUTH_DEV_LOGIN: 'true',
          VAPID_PUBLIC_KEY: 'public-key',
          VAPID_PRIVATE_KEY: 'private-key',
        }),
      )
      .overrideProvider(Clock)
      .useValue(clock)
      .overrideProvider(PushSender)
      .useValue(sender)
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
  const bag = async (agent: Agent): Promise<Inventory> => (await me(agent)).inventory;
  const buy = (agent: Agent, item: string, quantity = 1) =>
    agent.post('/api/shop/buy').send({ item, quantity }).expect(200);
  const overview = async (agent: Agent): Promise<TradeOverview> =>
    (await agent.get('/api/trades').expect(200)).body;
  const journal = async (agent: Agent): Promise<string[]> =>
    ((await agent.get('/api/activity').expect(200)).body as ActivityDto[]).map((e) => e.kind);
  const offer = (from: Agent, targetId: string, give: object, ask: object = {}) =>
    from.post('/api/trades').send({ targetId, offer: give, request: ask });

  it('swaps items between two players, once, and only if both have them', async () => {
    const alice = await signIn('Alice');
    const bob = await signIn('Bob');
    const carol = await signIn('Carol');
    const [bobId, aliceId] = [(await me(bob)).player.id, (await me(alice)).player.id];
    await buy(alice, 'cookie', 3);
    await buy(bob, 'cake');
    await buy(bob, 'strawberry');

    // The offer sets the items aside at once: Alice cannot spend them meanwhile.
    const proposal: TradeDto = (
      await offer(alice, bobId, { cookie: 2 }, { strawberry: 1 }).expect(201)
    ).body;
    expect(proposal).toMatchObject({
      proposerName: 'Alice',
      targetName: 'Bob',
      offer: { cookie: 2 },
      request: { strawberry: 1 },
    });
    expect(proposal.expiresAt).toBe(clock.time + TRADE.expireHours * HOUR);
    expect((await bag(alice)).cookie).toBe(1);

    // Each side sees it as theirs to answer, or to wait for; a third party sees nothing.
    expect((await overview(bob)).incoming.map((t) => t.id)).toEqual([proposal.id]);
    expect((await overview(alice)).outgoing.map((t) => t.id)).toEqual([proposal.id]);
    expect(await overview(carol)).toMatchObject({ incoming: [], outgoing: [] });
    expect((await overview(carol)).maxOpen).toBe(TRADE.maxOpen);
    expect(await journal(bob)).toContain('trade_offer');

    // Nobody else can answer for Bob, and the proposer cannot accept their own offer.
    for (const stranger of [carol, alice]) {
      expect((await stranger.post(`/api/trades/${proposal.id}/accept`).expect(404)).body.code).toBe(
        'no_trade',
      );
      await stranger.post(`/api/trades/${proposal.id}/decline`).expect(404);
    }
    await bob.delete(`/api/trades/${proposal.id}`).expect(404);

    // Bob sets his strawberry aside for Carol meanwhile: nothing moves, the offer stays open.
    const aside: TradeDto = (
      await offer(bob, (await me(carol)).player.id, { strawberry: 1 }).expect(201)
    ).body;
    expect((await bob.post(`/api/trades/${proposal.id}/accept`).expect(409)).body.code).toBe(
      'missing_item',
    );
    expect((await overview(bob)).incoming).toHaveLength(1);
    expect(await bag(bob)).toEqual({ cake: 1 });
    expect((await bag(alice)).cookie).toBe(1);

    await bob.delete(`/api/trades/${aside.id}`).expect(204);
    const done: TradeResult = (await bob.post(`/api/trades/${proposal.id}/accept`).expect(200))
      .body;
    expect(done.inventory).toEqual({ cake: 1, cookie: 2 });
    expect(await bag(bob)).toEqual({ cake: 1, cookie: 2 });
    expect(await bag(alice)).toEqual({ cookie: 1, strawberry: 1 });
    expect(await journal(alice)).toContain('trade_accepted');
    expect(await overview(bob)).toMatchObject({ incoming: [], outgoing: [] });

    // It is over: no second swap.
    expect((await bob.post(`/api/trades/${proposal.id}/accept`).expect(404)).body.code).toBe(
      'no_trade',
    );
    expect(await bag(alice)).toEqual({ cookie: 1, strawberry: 1 });
    expect(aliceId).not.toBe(bobId);
  });

  it('only lets one ask for what the other member owns', async () => {
    const alice = await signIn('Alice');
    const bob = await signIn('Bob');
    const bobId = (await me(bob)).player.id;
    await buy(alice, 'cookie', 2);
    await buy(bob, 'cake', 2);

    const target = (await alice.get(`/api/trades/targets/${bobId}`).expect(200)).body;
    expect(target).toEqual({ inventory: { cake: 2 }, wishlist: [] });
    await alice.get('/api/trades/targets/00000000-0000-4000-8000-000000000000').expect(404);

    expect((await offer(alice, bobId, { cookie: 1 }, { cake: 3 }).expect(409)).body.code).toBe(
      'missing_item',
    );
    expect(
      (await offer(alice, bobId, { cookie: 1 }, { strawberry: 1 }).expect(409)).body.code,
    ).toBe('missing_item');
    expect(await bag(alice)).toEqual({ cookie: 2 });
    await offer(alice, bobId, { cookie: 1 }, { cake: 2 }).expect(201);
  });

  it('trades coins as part of the bundle, set aside and settled atomically', async () => {
    const alice = await signIn('Alice');
    const bob = await signIn('Bob');
    const bobId = (await me(bob)).player.id;
    const coins = async (agent: Agent) => (await me(agent)).player.coins;
    const [a0, b0] = [await coins(alice), await coins(bob)];
    await buy(bob, 'cake');
    const withCoins = (from: Agent, give: object, ask: object, offerCoins = 0, requestCoins = 0) =>
      from
        .post('/api/trades')
        .send({ targetId: bobId, offer: give, request: ask, offerCoins, requestCoins });

    // Coins against an item: Alice buys Bob's cake for 30 coins, set aside at once.
    const sale: TradeDto = (await withCoins(alice, {}, { cake: 1 }, 30).expect(201)).body;
    expect(sale).toMatchObject({ offerCoins: 30, requestCoins: 0 });
    expect(await coins(alice)).toBe(a0 - 30);
    await bob.post(`/api/trades/${sale.id}/accept`).expect(200);
    expect(await coins(bob)).toBe(b0 - ITEMS.cake.price + 30);
    expect(await coins(alice)).toBe(a0 - 30);
    expect(await bag(alice)).toEqual({ cake: 1 });
    expect(await bag(bob)).toEqual({});

    // Item against coins: Alice sells the cake back for 20, Bob pays only if he accepts.
    const back: TradeDto = (await withCoins(alice, { cake: 1 }, {}, 0, 20).expect(201)).body;
    const bobBefore = await coins(bob);
    await bob.post(`/api/trades/${back.id}/accept`).expect(200);
    expect(await coins(bob)).toBe(bobBefore - 20);
    expect(await coins(alice)).toBe(a0 - 30 + 20);
    expect(await bag(bob)).toEqual({ cake: 1 });

    // Refused: more than one owns, coins on both sides, beyond the limit, or too much asked.
    expect((await withCoins(alice, {}, { cake: 1 }, 100_000).expect(400)).body).toBeDefined();
    await withCoins(alice, { cookie: 1 }, {}, 5, 5).expect(400);
    await withCoins(alice, {}, {}, 0, 0).expect(400);
    expect((await withCoins(alice, {}, { cake: 1 }, 1000).expect(409)).body.code).toBe(
      'not_enough_coins',
    );
    expect((await withCoins(alice, { cookie: 1 }, {}, 0, 1000).expect(409)).body.code).toBe(
      'not_enough_coins',
    );
    expect(await coins(alice)).toBe(a0 - 10);

    // Declining or withdrawing gives the coins back.
    const gift: TradeDto = (await withCoins(alice, {}, { cake: 1 }, 15).expect(201)).body;
    expect(await coins(alice)).toBe(a0 - 25);
    await bob.post(`/api/trades/${gift.id}/decline`).expect(204);
    expect(await coins(alice)).toBe(a0 - 10);
    const withdrawn: TradeDto = (await withCoins(alice, {}, { cake: 1 }, 15).expect(201)).body;
    await alice.delete(`/api/trades/${withdrawn.id}`).expect(204);
    expect(await coins(alice)).toBe(a0 - 10);
    await withCoins(alice, {}, { cake: 1 }, 15).expect(201);
    clock.advance(TRADE.expireHours * HOUR + 1000);
    await overview(bob);
    // Refunded (the new day brings Alice her daily bonus on top).
    expect(await coins(alice)).toBe(a0 - 10 + DAILY_BONUS);
  });

  it('keeps a wishlist and lets one ask for an item once a day', async () => {
    const alice = await signIn('Alice');
    const bob = await signIn('Bob');
    const bobId = (await me(bob)).player.id;
    const aliceId = (await me(alice)).player.id;
    await buy(bob, 'cake');

    expect((await alice.get('/api/wishlist').expect(200)).body.items).toEqual([]);
    const saved = (
      await alice
        .put('/api/wishlist')
        .send({ items: ['cake', 'cake', 'ribbon'] })
        .expect(200)
    ).body;
    expect(saved.items.sort()).toEqual(['cake', 'ribbon']);
    await alice
      .put('/api/wishlist')
      .send({ items: ['gold'] })
      .expect(400);
    const tooMany = Array.from({ length: 13 }, (_, i) => (i % 2 ? 'cake' : 'cookie'));
    await alice.put('/api/wishlist').send({ items: tooMany }).expect(400);
    expect(
      (await alice.get(`/api/trades/targets/${aliceId}`).expect(200)).body.wishlist.sort(),
    ).toEqual(['cake', 'ribbon']);

    const ask = (item: string, target = bobId) =>
      alice.post('/api/wishlist/ask').send({ targetId: target, item });
    // Only an item of the wishlist, that the member owns.
    expect((await ask('cookie').expect(409)).body.code).toBe('missing_item');
    expect((await ask('ribbon').expect(409)).body.code).toBe('missing_item');
    await ask('cake', aliceId).expect(400);
    await ask('cake').expect(204);
    const feed = (await bob.get('/api/activity').expect(200)).body as ActivityDto[];
    expect(feed.find((e) => e.kind === 'wish_request')?.data).toEqual({
      playerName: 'Alice',
      item: 'cake',
    });
    expect((await ask('cake').expect(409)).body.code).toBe('wish_already_asked');
    clock.advance(25 * HOUR);
    await ask('cake').expect(204);
  });

  it('gives the items back when the offer is declined, withdrawn or lapses', async () => {
    const alice = await signIn('Alice');
    const bob = await signIn('Bob');
    const bobId = (await me(bob)).player.id;
    await buy(alice, 'cookie', 4);
    const start = await bag(alice);

    const declined: TradeDto = (await offer(alice, bobId, { cookie: 2 }).expect(201)).body;
    expect((await bag(alice)).cookie).toBe(2);
    await bob.post(`/api/trades/${declined.id}/decline`).expect(204);
    expect(await bag(alice)).toEqual(start);
    expect(await journal(alice)).toContain('trade_declined');

    const withdrawn: TradeDto = (await offer(alice, bobId, { cookie: 3 }).expect(201)).body;
    expect((await bag(alice)).cookie).toBe(1);
    await alice.delete(`/api/trades/${withdrawn.id}`).expect(204);
    expect(await bag(alice)).toEqual(start);
    expect((await overview(bob)).incoming).toEqual([]);
    await bob.post(`/api/trades/${withdrawn.id}/accept`).expect(404);

    const lapsing: TradeDto = (await offer(alice, bobId, { cookie: 4 }).expect(201)).body;
    expect((await bag(alice)).cookie).toBeUndefined();
    clock.advance(TRADE.expireHours * HOUR - 1000);
    expect((await overview(bob)).incoming).toHaveLength(1);
    clock.advance(2000);
    expect(await overview(bob)).toMatchObject({ incoming: [], outgoing: [] });
    expect(await bag(alice)).toEqual(start);
    expect(await journal(alice)).toContain('trade_expired');
    expect((await bob.post(`/api/trades/${lapsing.id}/accept`).expect(404)).body.code).toBe(
      'no_trade',
    );
  });

  it('refuses what cannot be offered, and takes nothing when it does', async () => {
    const alice = await signIn('Alice');
    const bob = await signIn('Bob');
    const aliceId = (await me(alice)).player.id;
    const bobId = (await me(bob)).player.id;
    await buy(alice, 'cookie', 2);

    expect((await offer(alice, aliceId, { cookie: 1 }).expect(400)).body.code).toBe('own_profile');
    expect(
      (await offer(alice, '00000000-0000-4000-8000-000000000000', { cookie: 1 }).expect(404)).body
        .code,
    ).toBe('no_player');
    await offer(alice, bobId, {}, { cookie: 1 }).expect(400); // nothing offered
    await offer(alice, bobId, { cookie: 1 }, { cookie: 1 }).expect(400); // the same item twice
    await offer(alice, bobId, { cookie: 11 }).expect(400); // too many
    await offer(alice, bobId, { gold: 1 }).expect(400); // not an item
    await offer(alice, bobId, { crown: 2 }).expect(400); // an accessory is worn once

    // More than she has: refused, and the cookies she has are not touched.
    expect((await offer(alice, bobId, { cookie: 3 }).expect(409)).body.code).toBe('missing_item');
    expect((await offer(alice, bobId, { cookie: 1, cake: 1 }).expect(409)).body.code).toBe(
      'missing_item',
    );
    expect((await bag(alice)).cookie).toBe(2);

    // A few offers at a time, not a stock held hostage.
    await buy(alice, 'cookie', TRADE.maxOpen);
    for (let i = 0; i < TRADE.maxOpen; i++) await offer(alice, bobId, { cookie: 1 }).expect(201);
    expect((await offer(alice, bobId, { cookie: 1 }).expect(409)).body.code).toBe('trade_full');
    // The ones set aside are not lost: she still has the two that were not offered.
    expect((await bag(alice)).cookie).toBe(2);
    await request(app.getHttpServer()).get('/api/trades').expect(401);
  });

  it('keeps an accessory single: not given to an owner, not asked for by one', async () => {
    const alice = await signIn('Alice');
    const bob = await signIn('Bob');
    const carol = await signIn('Carol');
    const [aliceId, bobId] = [(await me(alice)).player.id, (await me(bob)).player.id];
    await buy(alice, 'ribbon');
    await buy(bob, 'ribbon');
    await buy(carol, 'cookie', 2);

    // Bob already wears one: a second would be wasted, so the offer is refused and kept by Alice.
    expect((await offer(alice, bobId, { ribbon: 1 }).expect(409)).body.code).toBe('trade_invalid');
    expect(await bag(alice)).toEqual({ ribbon: 1 });

    // Carol has none: she gets Alice's ribbon, and Alice the cookie she asked for in return.
    const swap: TradeDto = (
      await offer(alice, (await me(carol)).player.id, { ribbon: 1 }, { cookie: 1 }).expect(201)
    ).body;
    await carol.post(`/api/trades/${swap.id}/accept`).expect(200);
    expect(await bag(carol)).toEqual({ cookie: 1, ribbon: 1 });
    expect(await bag(alice)).toEqual({ cookie: 1 });

    // Carol, who now wears one, cannot ask Bob for his.
    expect((await offer(carol, bobId, { cookie: 1 }, { ribbon: 1 }).expect(409)).body.code).toBe(
      'trade_invalid',
    );
    expect((await bag(carol)).cookie).toBe(1);

    // Without an accessory in the way, a plain gift goes through (nothing asked back).
    const gift: TradeDto = (await offer(alice, bobId, { cookie: 1 }).expect(201)).body;
    await bob.post(`/api/trades/${gift.id}/accept`).expect(200);
    expect(await bag(bob)).toEqual({ cookie: 1, ribbon: 1 });
    expect(await bag(alice)).toEqual({});
    expect(aliceId).toBeDefined();
  });

  it('swaps once even when the answer arrives twice at the same time', async () => {
    const alice = await signIn('Alice');
    const bob = await signIn('Bob');
    await buy(alice, 'cookie', 2);
    await buy(bob, 'strawberry', 1);
    const trade: TradeDto = (
      await offer(alice, (await me(bob)).player.id, { cookie: 2 }, { strawberry: 1 }).expect(201)
    ).body;

    const answers = await Promise.all([
      bob.post(`/api/trades/${trade.id}/accept`),
      bob.post(`/api/trades/${trade.id}/accept`),
      alice.delete(`/api/trades/${trade.id}`),
    ]);
    const codes = answers.map((answer) => answer.status).sort();
    // One answer wins; the others find nothing pending. Whoever won, the items are consistent.
    expect(codes.filter((code) => code === 200 || code === 204)).toHaveLength(1);
    expect(codes.filter((code) => code === 404)).toHaveLength(2);
    const [a, b] = [await bag(alice), await bag(bob)];
    const swapped = a.strawberry === 1 && b.cookie === 2 && b.strawberry === undefined;
    const kept = a.cookie === 2 && b.strawberry === 1 && b.cookie === undefined;
    expect(swapped || kept).toBe(true);
  });

  it('nudges the member who is offered a trade', async () => {
    const alice = await signIn('Alice');
    const bob = await signIn('Bob');
    await bob
      .put('/api/push/subscription')
      .send({
        endpoint: 'https://push.example.test/bob',
        keys: { p256dh: 'p256dh-key', auth: 'auth-secret' },
        locale: 'fr',
      })
      .expect(204);
    await buy(alice, 'cookie');
    await offer(alice, (await me(bob)).player.id, { cookie: 1 }).expect(201);
    await vi.waitFor(() => expect(sender.sent).toHaveLength(1));
    expect(sender.sent[0]).toEqual({
      endpoint: 'https://push.example.test/bob',
      payload: { kind: 'trade_offer', petName: '', playerName: 'Alice', locale: 'fr' },
    });
  });
});
