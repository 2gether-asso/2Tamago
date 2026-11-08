import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { gameHours, withRules } from '@2tamago/core';
import type {
  ActionResponse,
  ActivityDto,
  DaycareDto,
  DaycareOverview,
  MeResponse,
  VisitResponse,
} from '@2tamago/core/contracts';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { Clock } from '../src/common/clock.js';
import { AppConfig } from '../src/config/app-config.js';
import { setupApp } from '../src/setup-app.js';
import { DAYCARE, HOUR_MS } from '../src/social/daycare.js';

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
const hours = (h: number) => gameHours(rules, h);
type Agent = ReturnType<typeof request.agent>;

describe('Daycare (e2e)', () => {
  let app: INestApplication<App>;
  let clock: FakeClock;

  async function start(env: Record<string, string> = {}) {
    clock = new FakeClock();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AppConfig)
      .useValue(new AppConfig({ DATABASE_URL: 'memory://', AUTH_DEV_LOGIN: 'true', ...env }))
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
  /** A signed-in player with a hatched companion. */
  async function player(name: string) {
    const agent = await signIn(name);
    await agent
      .post('/api/pet')
      .send({ name: `${name}’s pet`, species: 'mochi', color: 42 })
      .expect(201);
    return agent;
  }
  const overview = async (agent: Agent): Promise<DaycareOverview> =>
    (await agent.get('/api/daycare').expect(200)).body;
  const journal = async (agent: Agent): Promise<ActivityDto[]> =>
    (await agent.get('/api/activity').expect(200)).body;
  const invite = (owner: Agent, caretakerId: string) =>
    owner.post('/api/daycare').send({ caretakerId });
  const care = (caretaker: Agent, id: string, body: object) =>
    caretaker.post(`/api/daycare/${id}/care`).send(body);

  it('entrusts a companion: invitation, answer, care, reward and the way back', async () => {
    await start();
    const alice = await player('Alice');
    const bob = await player('Bob');
    const carol = await player('Carol');
    clock.advance(hours(0.5)); // hatched
    const [aliceMe, bobMe] = [await me(alice), await me(bob)];

    // Not oneself, not a stranger, not twice.
    expect((await invite(alice, aliceMe.player.id).expect(400)).body.code).toBe('own_profile');
    expect(
      (await invite(alice, '00000000-0000-4000-8000-000000000000').expect(404)).body.code,
    ).toBe('no_player');
    const invitation: DaycareDto = (await invite(alice, bobMe.player.id).expect(201)).body;
    expect(invitation).toMatchObject({
      status: 'pending',
      petName: 'Alice’s pet',
      ownerName: 'Alice',
      caretakerName: 'Bob',
    });
    expect((await invite(alice, bobMe.player.id).expect(409)).body.code).toBe('daycare_exists');
    expect((await invite(alice, (await me(carol)).player.id).expect(409)).body.code).toBe(
      'daycare_exists',
    );

    // Both sides see it; the caretaker was told; nobody else may touch it.
    expect((await overview(alice)).entrusted?.status).toBe('pending');
    expect((await overview(alice)).maxDays).toBe(DAYCARE.maxDays);
    expect((await overview(bob)).invitations.map((d) => d.id)).toEqual([invitation.id]);
    expect((await overview(carol)).invitations).toEqual([]);
    expect((await journal(bob)).map((entry) => entry.kind)).toContain('daycare_invite');
    expect((await carol.post(`/api/daycare/${invitation.id}/accept`).expect(404)).body.code).toBe(
      'no_daycare',
    );
    expect((await alice.post(`/api/daycare/${invitation.id}/accept`).expect(404)).body.code).toBe(
      'no_daycare',
    );
    // Nothing to do before the answer.
    expect((await care(bob, invitation.id, { type: 'feed' }).expect(404)).body.code).toBe(
      'no_daycare',
    );

    const accepted: DaycareDto = (
      await bob.post(`/api/daycare/${invitation.id}/accept`).expect(200)
    ).body;
    expect(accepted.status).toBe('active');
    expect(accepted.expiresAt).toBe(clock.time + DAYCARE.maxDays * 24 * HOUR_MS);
    expect((await overview(bob)).caring.map((d) => d.id)).toEqual([invitation.id]);
    expect((await journal(alice)).map((entry) => entry.kind)).toContain('daycare_accepted');

    // The caretaker's door to the companion is the visit page, and only theirs.
    const petId = aliceMe.pet!.id;
    const asBob: VisitResponse = (await bob.get(`/api/village/${petId}`).expect(200)).body;
    const asCarol: VisitResponse = (await carol.get(`/api/village/${petId}`).expect(200)).body;
    expect(asBob.daycareId).toBe(invitation.id);
    expect(asCarol.daycareId).toBeNull();
    expect((await care(carol, invitation.id, { type: 'feed' }).expect(404)).body.code).toBe(
      'no_daycare',
    );

    // Care: it is the pet's life that changes, and the caretaker earns coins for real care.
    const hungry = (await me(alice)).pet!.state.stats.satiety;
    const bobCoins = (await me(bob)).player.coins;
    const fed: ActionResponse = (await care(bob, invitation.id, { type: 'feed' }).expect(201)).body;
    expect(fed.pet.ownerId).toBe(aliceMe.player.id);
    expect(fed.pet.state.stats.satiety).toBeGreaterThan(hungry);
    expect(fed.coins).toBe(bobCoins + DAYCARE.careReward);
    expect(fed.notices).toEqual([{ code: 'coins_earned', count: DAYCARE.careReward }]);
    expect((await me(alice)).pet!.state.stats.satiety).toBe(fed.pet.state.stats.satiety);
    // The engine's refusals reach the caretaker like the owner: fed enough, it is not hungry.
    let refused = 201;
    for (let meal = 0; meal < 3 && refused === 201; meal++) {
      refused = (await care(bob, invitation.id, { type: 'feed' })).status;
    }
    expect(refused).toBe(409);
    expect((await care(bob, invitation.id, { type: 'feed' }).expect(409)).body.code).toBe(
      'not_hungry',
    );
    // A caress is pleasant, not care: no coins, and the owner's journal is not flooded.
    const petted: ActionResponse = (await care(bob, invitation.id, { type: 'caress' }).expect(201))
      .body;
    expect(petted.notices).toEqual([]);
    const kinds = (await journal(alice)).filter((entry) => entry.kind === 'daycare_care');
    expect(kinds.length).toBeGreaterThan(0);
    expect(kinds.every((entry) => entry.data.action === 'feed')).toBe(true);
    // The owner's choices stay the owner's.
    for (const body of [
      { type: 'train', trick: 'sit' },
      { type: 'retire' },
      { type: 'startVacation' },
    ]) {
      await care(bob, invitation.id, body).expect(400);
    }
    // The owner can still look after their own companion.
    await alice.post('/api/pet/actions').send({ type: 'clean' }).expect(201);

    // The owner takes it back: the door closes, both are told what they should be.
    await alice.delete(`/api/daycare/${invitation.id}`).expect(204);
    expect((await care(bob, invitation.id, { type: 'clean' }).expect(404)).body.code).toBe(
      'no_daycare',
    );
    expect((await overview(bob)).caring).toEqual([]);
    expect((await overview(alice)).entrusted).toBeNull();
    expect((await journal(bob)).map((entry) => entry.kind)).toContain('daycare_ended');
    expect(
      ((await bob.get(`/api/village/${petId}`).expect(200)).body as VisitResponse).daycareId,
    ).toBeNull();
    await alice.delete(`/api/daycare/${invitation.id}`).expect(404);

    // Free again to entrust it, to someone else this time.
    await invite(alice, (await me(carol)).player.id).expect(201);
  });

  it('lets the caretaker decline or give back, and limits what one member looks after', async () => {
    await start();
    const alice = await player('Alice');
    const bob = await player('Bob');
    const carol = await player('Carol');
    const dave = await player('Dave');
    const eve = await player('Eve');
    clock.advance(hours(0.5));
    const id = async (agent: Agent) => (await me(agent)).player.id;

    // Declined: the owner is told, and may try someone else.
    const first: DaycareDto = (await invite(alice, await id(bob)).expect(201)).body;
    await bob.post(`/api/daycare/${first.id}/decline`).expect(204);
    expect((await journal(alice)).map((entry) => entry.kind)).toContain('daycare_declined');
    expect((await overview(alice)).entrusted).toBeNull();
    expect((await bob.post(`/api/daycare/${first.id}/decline`).expect(404)).body.code).toBe(
      'no_daycare',
    );

    // A member looks after two companions at most.
    for (const owner of [alice, carol]) {
      const sent: DaycareDto = (await invite(owner, await id(bob)).expect(201)).body;
      await bob.post(`/api/daycare/${sent.id}/accept`).expect(200);
    }
    expect((await invite(dave, await id(bob)).expect(409)).body.code).toBe('daycare_full');
    expect((await overview(bob)).caring).toHaveLength(2);

    // Another member's pending invitation cannot be accepted past the limit either.
    const pending: DaycareDto = (await invite(dave, await id(eve)).expect(201)).body;
    await eve.post(`/api/daycare/${pending.id}/accept`).expect(200);

    // The caretaker gives the companion back: the owner is told.
    const mine = (await overview(bob)).caring.find((d) => d.ownerName === 'Alice')!;
    await bob.delete(`/api/daycare/${mine.id}`).expect(204);
    expect((await journal(alice)).map((entry) => entry.kind)).toContain('daycare_ended');
    expect((await overview(bob)).caring).toHaveLength(1);
    // A third party can neither end it nor see it.
    const other = (await overview(bob)).caring[0]!;
    await dave.delete(`/api/daycare/${other.id}`).expect(404);
    await request(app.getHttpServer()).get('/api/daycare').expect(401);
  });

  it('refuses a companion on vacation, which needs no one', async () => {
    await start();
    const alice = await player('Alice');
    const bob = await player('Bob');
    clock.advance(hours(0.5));
    await alice.post('/api/pet/actions').send({ type: 'startVacation' }).expect(201);
    expect((await invite(alice, (await me(bob)).player.id).expect(409)).body.code).toBe(
      'on_vacation',
    );
    await alice.post('/api/pet/actions').send({ type: 'endVacation' }).expect(201);
    await invite(alice, (await me(bob)).player.id).expect(201);
  });

  it('lapses by itself: an unanswered invitation, and a stay that is too long', async () => {
    // A companion that never leaves, so that days can pass.
    await start({ GAME_DEPARTURE: 'false' });
    const alice = await player('Alice');
    const bob = await player('Bob');
    clock.advance(hours(0.5));
    const bobId = (await me(bob)).player.id;

    const unanswered: DaycareDto = (await invite(alice, bobId).expect(201)).body;
    clock.advance((DAYCARE.inviteHours + 1) * HOUR_MS);
    expect((await overview(bob)).invitations).toEqual([]);
    expect((await overview(alice)).entrusted).toBeNull();
    expect((await bob.post(`/api/daycare/${unanswered.id}/accept`).expect(404)).body.code).toBe(
      'no_daycare',
    );
    expect((await journal(alice)).map((entry) => entry.kind)).toContain('daycare_ended');

    const stay: DaycareDto = (await invite(alice, bobId).expect(201)).body;
    await bob.post(`/api/daycare/${stay.id}/accept`).expect(200);
    clock.advance((DAYCARE.maxDays * 24 - 1) * HOUR_MS);
    // Still open (the companion may refuse, but the door is not closed).
    expect((await care(bob, stay.id, { type: 'feed' })).status).not.toBe(404);
    clock.advance(2 * HOUR_MS);
    expect((await care(bob, stay.id, { type: 'clean' }).expect(404)).body.code).toBe('no_daycare');
    expect((await overview(bob)).caring).toEqual([]);
  });

  it('ends with the companion', async () => {
    await start();
    const alice = await player('Alice');
    const bob = await player('Bob');
    clock.advance(hours(0.5));
    const stay: DaycareDto = (await invite(alice, (await me(bob)).player.id).expect(201)).body;
    await bob.post(`/api/daycare/${stay.id}/accept`).expect(200);
    // Nobody feeds it for days: it leaves.
    clock.advance(hours(24 * 6));
    expect((await me(alice)).pet?.state.status).toBe('gone');
    expect((await overview(bob)).caring).toEqual([]);
    expect((await overview(alice)).entrusted).toBeNull();
    expect((await care(bob, stay.id, { type: 'feed' }).expect(404)).body.code).toBe('no_daycare');
  });
});
