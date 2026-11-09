import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type {
  ActivityDto,
  MeResponse,
  ModerationLogEntry,
  ModerationPerson,
} from '@2tamago/core/contracts';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { AppConfig } from '../src/config/app-config.js';
import { setupApp } from '../src/setup-app.js';

type Agent = ReturnType<typeof request.agent>;

describe('Name moderation (e2e)', () => {
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
  const adopt = (agent: Agent, name: string) =>
    agent.post('/api/pet').send({ name, species: 'mochi', color: 42 });
  const search = async (admin: Agent, q: string): Promise<ModerationPerson[]> =>
    (await admin.get('/api/admin/moderation/search').query({ q }).expect(200)).body;
  const journal = async (agent: Agent): Promise<ActivityDto[]> =>
    (await agent.get('/api/activity').expect(200)).body;

  it('is for admins only', async () => {
    const alice = await signIn('Alice');
    await alice.get('/api/admin/moderation/search').query({ q: 'al' }).expect(403);
    await alice.get('/api/admin/moderation/blocked-words').expect(403);
    await alice.put('/api/admin/moderation/blocked-words').send({ words: [] }).expect(403);
    await alice.get('/api/admin/moderation/log').expect(403);
    await request(app.getHttpServer()).get('/api/admin/moderation/log').expect(401);
  });

  it('refuses companion names with a blocked word, however it is dressed up', async () => {
    const root = await signIn('Root');
    const alice = await signIn('Alice');
    expect((await adopt(alice, 'Pompon').expect(201)).status).toBe(201);
    await alice.post('/api/pet').send({}).expect(400);

    const saved = (
      await root
        .put('/api/admin/moderation/blocked-words')
        .send({ words: ['badword', ' Méchant ', 'badword'] })
        .expect(200)
    ).body;
    expect(saved.words).toEqual(['badword', 'Méchant']);
    expect((await root.get('/api/admin/moderation/blocked-words').expect(200)).body.words).toEqual([
      'badword',
      'Méchant',
    ]);
    // Too short a word, or too many.
    await root
      .put('/api/admin/moderation/blocked-words')
      .send({ words: ['x'] })
      .expect(400);
    await root
      .put('/api/admin/moderation/blocked-words')
      .send({ words: Array.from({ length: 201 }, (_, i) => `word${i}`) })
      .expect(400);

    const bob = await signIn('Bob');
    for (const name of ['badword', 'B4D-W0RD', 'xx-Mechant-xx']) {
      const refused = await adopt(bob, name).expect(400);
      expect(refused.body.code).toBe('name_not_allowed');
    }
    await adopt(bob, 'Caillou').expect(201);
  });

  it('finds members by their name or their companion’s', async () => {
    const root = await signIn('Root');
    const alice = await signIn('Alice');
    const bob = await signIn('Bob');
    await adopt(alice, 'Pompon').expect(201);
    await adopt(bob, 'Caillou').expect(201);

    const byOwner = await search(root, 'alic');
    expect(byOwner).toMatchObject([{ playerName: 'Alice', petName: 'Pompon', nameLocked: false }]);
    const byPet = await search(root, 'CAILL');
    expect(byPet.map((person) => person.playerName)).toEqual(['Bob']);
    // Without a companion, still found by their own name.
    expect(await search(root, 'roo')).toMatchObject([{ playerName: 'Root', petId: null }]);
    // Too short a search finds nothing, and the wildcards of LIKE are just characters.
    expect(await search(root, 'a')).toEqual([]);
    expect(await search(root, '%%')).toEqual([]);
    expect(await search(root, '__')).toEqual([]);
  });

  it('renames a companion and tells its owner, and logs it', async () => {
    const root = await signIn('Root');
    const alice = await signIn('Alice');
    await adopt(alice, 'Rude').expect(201);
    const pet = (await me(alice)).pet!;

    await root
      .put(`/api/admin/moderation/pets/${pet.id}/name`)
      .send({ name: 'Pompon' })
      .expect(204);
    expect((await me(alice)).pet!.state.name).toBe('Pompon');
    const entry = (await journal(alice)).find((e) => e.kind === 'name_changed');
    expect(entry?.data).toEqual({ what: 'pet', name: 'Pompon' });
    await root.put(`/api/admin/moderation/pets/${pet.id}/name`).send({ name: 'x' }).expect(400);
    expect(
      (
        await root
          .put('/api/admin/moderation/pets/00000000-0000-4000-8000-000000000000/name')
          .send({ name: 'Pompon' })
          .expect(404)
      ).body.code,
    ).toBe('no_pet');

    const log: ModerationLogEntry[] = (await root.get('/api/admin/moderation/log').expect(200))
      .body;
    expect(log[0]).toMatchObject({
      adminName: 'Root',
      action: 'rename_pet',
      targetName: 'Alice',
      before: 'Rude',
      after: 'Pompon',
    });
  });

  it('renames a member, keeps the name past the next sign-in, and gives it back on request', async () => {
    const root = await signIn('Root');
    const alice = await signIn('Alice');
    const aliceId = (await me(alice)).player.id;

    await root
      .put(`/api/admin/moderation/players/${aliceId}/name`)
      .send({ name: 'Anonyme' })
      .expect(204);
    expect((await me(alice)).player.displayName).toBe('Anonyme');
    expect((await journal(alice)).find((e) => e.kind === 'name_changed')?.data).toEqual({
      what: 'player',
      name: 'Anonyme',
    });
    expect(await search(root, 'anonym')).toMatchObject([{ playerId: aliceId, nameLocked: true }]);

    // Signing in again would normally take the name Discord gives: not for a name an admin set.
    const again = await signIn('Alice');
    expect((await me(again)).player.displayName).toBe('Anonyme');

    await root.delete(`/api/admin/moderation/players/${aliceId}/name`).expect(204);
    await root.delete(`/api/admin/moderation/players/${aliceId}/name`).expect(404);
    const afterUnlock = await signIn('Alice');
    expect((await me(afterUnlock)).player.displayName).toBe('Alice');

    expect(
      (
        await root
          .put('/api/admin/moderation/players/00000000-0000-4000-8000-000000000000/name')
          .send({ name: 'Nobody' })
          .expect(404)
      ).body.code,
    ).toBe('no_player');

    const log: ModerationLogEntry[] = (await root.get('/api/admin/moderation/log').expect(200))
      .body;
    expect(log.map((entry) => entry.action)).toEqual(['unlock_player_name', 'rename_player']);
    expect(log[1]).toMatchObject({ before: 'Alice', after: 'Anonyme', targetName: 'Alice' });
  });
});
