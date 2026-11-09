import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { CONTEST_PRIZES, gameHours, trickScore, withRules } from '@2tamago/core';
import type {
  ContestBoard,
  ContestClaimResponse,
  ContestsOverview,
  MeResponse,
} from '@2tamago/core/contracts';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { Clock } from '../src/common/clock.js';
import { AppConfig } from '../src/config/app-config.js';
import { setupApp } from '../src/setup-app.js';

class FakeClock extends Clock {
  /** A Monday, so that a week is easy to count. */
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
const hours = (h: number) => gameHours(rules, h);
const WEEK = 7 * 86_400_000;

describe('Weekly contests (e2e)', () => {
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
          // Days pass in these tests: companions that are not looked after must stay.
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
  const adopt = (agent: Agent, name: string) =>
    agent.post('/api/pet').send({ name, species: 'mochi', color: 42 }).expect(201);
  const overview = async (agent: Agent): Promise<ContestsOverview> =>
    (await agent.get('/api/contests').expect(200)).body;
  const enter = (agent: Agent, kind: string) => agent.post('/api/contests/enter').send({ kind });
  const vote = (agent: Agent, playerId: string) =>
    agent.post('/api/contests/vote').send({ playerId });
  const claim = (agent: Agent, kind: string) => agent.post(`/api/contests/${kind}/claim`);
  const idOf = async (agent: Agent) => (await me(agent)).player.id;

  /** Children, which can be trained (admin rules: they stay children for a long while). */
  async function grownUp(...names: string[]) {
    const root = await signIn('Root');
    const agents: Agent[] = [];
    for (const name of names) {
      const agent = await signIn(name);
      await adopt(agent, `${name}’s pet`);
      agents.push(agent);
    }
    await root
      .put('/api/admin/rules')
      .send({ stageHours: { baby: 1, child: 1000 } })
      .expect(200);
    clock.advance(hours(1.7));
    return agents;
  }
  const train = async (agent: Agent, times: number) => {
    for (let i = 0; i < times; i++) {
      await agent.post('/api/pet/actions').send({ type: 'train', trick: 'sit' }).expect(201);
    }
  };

  it('ranks the tricks of the week, and lets a member enter again after more training', async () => {
    const [alice, bob, carol] = await grownUp('Alice', 'Bob', 'Carol');
    const empty = await overview(alice);
    expect(empty).toMatchObject({ tricks: { entries: [], mine: null }, last: null });
    expect(empty.tricks.problem).toBeNull();

    await train(alice, 4);
    await train(bob, 2);
    for (const agent of [carol, bob, alice]) await enter(agent, 'tricks').expect(200);

    const scoreOf = async (agent: Agent) => trickScore((await me(agent)).pet!.state);
    const [a, b] = [await scoreOf(alice), await scoreOf(bob)];
    expect(a).toBeGreaterThan(b);
    expect(b).toBeGreaterThan(0);
    let board = (await overview(carol)).tricks;
    expect(board.entries.map((e) => [e.playerName, e.rank, e.score])).toEqual([
      ['Alice', 1, a],
      ['Bob', 2, b],
      ['Carol', 3, 0],
    ]);
    expect(board.mine).toMatchObject({ playerName: 'Carol', rank: 3, isMine: true });
    expect(board.entries[0]).toMatchObject({
      petName: 'Alice’s pet',
      species: 'mochi',
      isMine: false,
    });

    // Bob trains more and enters again: his score follows, and he overtakes Alice.
    await train(bob, 3);
    const board2: ContestBoard = (await enter(bob, 'tricks').expect(200)).body;
    expect(board2.entries.map((e) => e.playerName)).toEqual(['Bob', 'Alice', 'Carol']);
    expect(board2.mine?.score).toBe(await scoreOf(bob));
    // Entering again is not entering twice.
    board = (await overview(carol)).tricks;
    expect(board.entries).toHaveLength(3);
  });

  it('keeps out those who cannot take part', async () => {
    const [alice] = await grownUp('Alice');
    const eve = await signIn('Eve'); // no companion
    expect((await enter(eve, 'tricks').expect(404)).body.code).toBe('no_pet');
    expect((await overview(eve)).beauty.problem).toBe('pet_gone');

    const dave = await signIn('Dave');
    await adopt(dave, 'Egg');
    expect((await enter(dave, 'beauty').expect(409)).body.code).toBe('still_an_egg');
    clock.advance(hours(0.5)); // a baby (the admin rule of `grownUp` made it so)
    expect((await enter(dave, 'tricks').expect(409)).body.code).toBe('too_young');
    await enter(dave, 'beauty').expect(200);

    await alice.post('/api/pet/actions').send({ type: 'startVacation' }).expect(201);
    expect((await enter(alice, 'tricks').expect(409)).body.code).toBe('on_vacation');
    await enter(alice, 'nothing').expect(400);
    await request(app.getHttpServer()).get('/api/contests').expect(401);
  });

  it('crowns the most voted, once a week each, and pays the podium', async () => {
    const [alice, bob, carol, dave] = await grownUp('Alice', 'Bob', 'Carol', 'Dave');
    const eve = await signIn('Eve'); // votes without competing
    const [aliceId, bobId] = [await idOf(alice), await idOf(bob)];
    for (const agent of [alice, bob, carol, dave]) await enter(agent, 'beauty').expect(200);

    // Not for oneself, not for someone who is not in.
    expect((await vote(alice, aliceId).expect(400)).body.code).toBe('own_profile');
    expect((await vote(eve, await idOf(eve)).expect(400)).body.code).toBe('own_profile');
    const stranger = await signIn('Stranger');
    expect((await vote(eve, await idOf(stranger)).expect(404)).body.code).toBe('no_entry');

    // Alice gets three votes, Bob two; Carol and Dave none (Carol entered first).
    await vote(eve, aliceId).expect(200);
    await vote(bob, aliceId).expect(200);
    await vote(dave, aliceId).expect(200);
    await vote(alice, bobId).expect(200);
    await vote(carol, bobId).expect(200);
    let board = (await overview(eve)).beauty;
    expect(board.entries.map((e) => [e.playerName, e.score])).toEqual([
      ['Alice', 3],
      ['Bob', 2],
      ['Carol', 0],
      ['Dave', 0],
    ]);
    expect(board.entries[0]?.votedByMe).toBe(true); // Eve's vote
    expect(board.entries[1]?.votedByMe).toBe(false);

    // A vote moves when its owner changes their mind, and does not count twice.
    await vote(eve, bobId).expect(200);
    board = (await overview(eve)).beauty;
    expect(board.entries.map((e) => [e.playerName, e.score])).toEqual([
      ['Bob', 3],
      ['Alice', 2],
      ['Carol', 0],
      ['Dave', 0],
    ]);
    await vote(eve, aliceId).expect(200); // back to Alice: 3 and 2 again
    expect((await overview(eve)).beauty.entries.map((e) => e.score)).toEqual([3, 2, 0, 0]);

    // Nothing to claim during the week itself.
    expect((await claim(alice, 'beauty').expect(409)).body.code).toBe('no_prize');

    // Next week: the contest starts over, last week is a podium to collect.
    clock.advance(WEEK);
    const next = await overview(alice);
    expect(next.beauty.entries).toEqual([]);
    expect(next.last?.results.map((r) => r.kind)).toEqual(['beauty']);
    const result = next.last!.results[0]!;
    expect(result.podium.map((e) => e.playerName)).toEqual(['Alice', 'Bob', 'Carol']);
    expect(result).toMatchObject({ prize: CONTEST_PRIZES[0], claimed: false });
    // Votes cast last week do not carry over.
    await vote(eve, aliceId).expect(404);

    const before = (await me(alice)).player.coins;
    const paid: ContestClaimResponse = (await claim(alice, 'beauty').expect(200)).body;
    expect(paid).toEqual({ prize: CONTEST_PRIZES[0], coins: before + CONTEST_PRIZES[0] });
    expect((await claim(alice, 'beauty').expect(409)).body.code).toBe('already_claimed');
    expect((await overview(alice)).last?.results[0]?.claimed).toBe(true);
    expect((await claim(bob, 'beauty').expect(200)).body.prize).toBe(CONTEST_PRIZES[1]);
    expect((await claim(carol, 'beauty').expect(200)).body.prize).toBe(CONTEST_PRIZES[2]);
    // Fourth: not on the podium. Someone who did not take part: nothing either.
    expect((await claim(dave, 'beauty').expect(409)).body.code).toBe('no_prize');
    expect((await claim(eve, 'beauty').expect(409)).body.code).toBe('no_prize');
    expect((await claim(alice, 'tricks').expect(409)).body.code).toBe('no_prize');
    await claim(alice, 'nothing').expect(400);

    // Two weeks on, last week is empty and there is nothing to show.
    clock.advance(WEEK);
    expect((await overview(alice)).last).toBeNull();
  });

  it('pays a prize once even when the claim is made twice at the same time', async () => {
    const [alice, bob] = await grownUp('Alice', 'Bob');
    await enter(alice, 'beauty').expect(200);
    await enter(bob, 'beauty').expect(200);
    await vote(bob, await idOf(alice)).expect(200);
    clock.advance(WEEK);
    const before = (await me(alice)).player.coins;
    const answers = await Promise.all([claim(alice, 'beauty'), claim(alice, 'beauty')]);
    expect(answers.map((answer) => answer.status).sort()).toEqual([200, 409]);
    expect((await me(alice)).player.coins).toBe(before + CONTEST_PRIZES[0]);
  });
});
