import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { AccountOverview } from '@2tamago/core/contracts';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { AppConfig } from '../src/config/app-config.js';
import { setupApp } from '../src/setup-app.js';
import { TestClient } from './dpop-client.js';

type Agent = ReturnType<typeof request.agent>;

const CHROME =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const REAL_IP = '203.0.113.7';

describe('Account (e2e)', () => {
  let app: INestApplication<App>;

  async function start(env: Record<string, string> = {}) {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AppConfig)
      .useValue(
        new AppConfig({
          DATABASE_URL: 'memory://',
          AUTH_DEV_LOGIN: 'true',
          ADMIN_DISCORD_IDS: 'dev:root',
          ...env,
        }),
      )
      .compile();
    app = setupApp(moduleRef.createNestApplication());
    await app.init();
  }
  afterEach(async () => {
    await app.close();
  });

  /** A browser signing in with a key of its own: a real session, like the Discord flow opens. */
  async function signIn(name: string, headers: Record<string, string> = {}): Promise<Agent> {
    const agent = request.agent(app.getHttpServer());
    const client = new TestClient();
    let call = agent
      .post('/api/auth/dev-login')
      .set('DPoP', client.proof('POST', '/api/auth/dev-login'))
      .set('User-Agent', CHROME);
    for (const [key, value] of Object.entries(headers)) call = call.set(key, value);
    const { body } = await call.send({ name }).expect(200);
    agent.set('Authorization', `Bearer ${body.access_token}`);
    return agent;
  }
  const overview = async (agent: Agent): Promise<AccountOverview> =>
    (await agent.get('/api/account').expect(200)).body;

  it('lists my sessions, the current one marked, with the player IP behind two proxies', async () => {
    await start({ TRUST_PROXY: '2' });
    const alice = await signIn('Alice', { 'X-Forwarded-For': `${REAL_IP}, 10.99.0.1` });
    const { sessions, displayName } = await overview(alice);
    expect(displayName).toBe('Alice');
    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({ current: true, ip: REAL_IP, family: 'chrome/windows' });
  });

  it('stores the IP from the trusted header only when it is configured', async () => {
    await start({ CLIENT_IP_HEADER: 'CF-Connecting-IP' });
    const alice = await signIn('Alice', {
      'X-Forwarded-For': `1.2.3.4, 10.99.0.1`,
      'CF-Connecting-IP': REAL_IP,
    });
    expect((await overview(alice)).sessions[0]!.ip).toBe(REAL_IP);
    await app.close();

    await start();
    const bob = await signIn('Bob', { 'CF-Connecting-IP': '1.2.3.4' });
    expect((await overview(bob)).sessions[0]!.ip).not.toBe('1.2.3.4');
  });

  it('revokes one session, never another player’s, and all the others', async () => {
    await start();
    const laptop = await signIn('Alice');
    const phone = await signIn('Alice');
    const tablet = await signIn('Alice');
    const bob = await signIn('Bob');

    const { sessions } = await overview(laptop);
    expect(sessions).toHaveLength(3);
    const phoneId = (await overview(phone)).sessions.find((s) => s.current)!.id;

    // Not mine: same answer as a session that does not exist.
    const bobId = (await overview(bob)).sessions[0]!.id;
    const refused = await laptop.delete(`/api/account/sessions/${bobId}`).expect(404);
    expect(refused.body.code).toBe('no_session');
    await laptop.delete('/api/account/sessions/not-an-id').expect(400);
    expect((await overview(bob)).sessions).toHaveLength(1);

    await laptop.delete(`/api/account/sessions/${phoneId}`).expect(204);
    // Its access token stops working at once.
    await phone.get('/api/account').expect(401);
    expect((await overview(laptop)).sessions).toHaveLength(2);

    await laptop.delete('/api/account/sessions').expect(204);
    await tablet.get('/api/account').expect(401);
    const left = (await overview(laptop)).sessions;
    expect(left).toHaveLength(1);
    expect(left[0]!.current).toBe(true);
    expect((await overview(bob)).sessions).toHaveLength(1);
  });

  it('renames with the same rules as the moderation, and keeps the name', async () => {
    await start();
    const root = await signIn('Root');
    const alice = await signIn('Alice');
    await root
      .put('/api/admin/moderation/blocked-words')
      .send({ words: ['badword'] })
      .expect(200);

    await alice.put('/api/account/name').send({ name: 'x' }).expect(400);
    const blocked = await alice.put('/api/account/name').send({ name: 'B4dw0rd' }).expect(400);
    expect(blocked.body.code).toBe('name_not_allowed');

    await alice.put('/api/account/name').send({ name: '  Ada  ' }).expect(204);
    expect((await overview(alice)).displayName).toBe('Ada');
    expect((await alice.get('/api/me').expect(200)).body.player.displayName).toBe('Ada');
    // Signing in again does not bring the login name back.
    await signIn('Alice');
    expect((await overview(alice)).displayName).toBe('Ada');
  });

  it('refuses a rename when an admin set the name, until they unlock it', async () => {
    await start();
    const root = await signIn('Root');
    const alice = await signIn('Alice');
    const id = (await alice.get('/api/me').expect(200)).body.player.id;
    await root
      .put(`/api/admin/moderation/players/${id}/name`)
      .send({ name: 'Imposed' })
      .expect(204);

    expect((await overview(alice)).nameLocked).toBe(true);
    const refused = await alice.put('/api/account/name').send({ name: 'Mine' }).expect(409);
    expect(refused.body.code).toBe('name_locked');

    await root.delete(`/api/admin/moderation/players/${id}/name`).expect(204);
    await alice.put('/api/account/name').send({ name: 'Mine' }).expect(204);
  });

  it('needs a session', async () => {
    await start();
    await request(app.getHttpServer()).get('/api/account').expect(401);
    await request(app.getHttpServer()).delete('/api/account/sessions').expect(401);
  });
});
