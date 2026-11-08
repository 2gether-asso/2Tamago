import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { MeResponse } from '@2tamago/core/contracts';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { DiscordClient, type DiscordIdentity } from '../src/auth/discord.client.js';
import { AppConfig } from '../src/config/app-config.js';
import { setupApp } from '../src/setup-app.js';

const WEB = 'https://tamago.example';

/** A Discord that answers from a table instead of the network, keyed by authorization code. */
class FakeDiscord {
  enabled = true;
  identities = new Map<string, DiscordIdentity | Error>();
  authorizeUrl(state: string) {
    return `https://discord.test/authorize?state=${state}`;
  }
  async identify(code: string): Promise<DiscordIdentity> {
    const answer = this.identities.get(code);
    if (!answer) throw new Error(`unexpected code ${code}`);
    if (answer instanceof Error) throw answer;
    return answer;
  }
}

const ADA: DiscordIdentity = {
  id: '1001',
  displayName: 'Ada',
  avatarUrl: 'https://cdn.example/ada.png',
  isMember: true,
};

describe('Discord sign-in (e2e)', () => {
  let app: INestApplication<App>;
  let discord: FakeDiscord;

  beforeEach(async () => {
    discord = new FakeDiscord();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AppConfig)
      .useValue(
        new AppConfig({
          DATABASE_URL: 'memory://',
          WEB_ORIGIN: WEB,
          DISCORD_CLIENT_ID: 'client',
          DISCORD_CLIENT_SECRET: 'secret',
          DISCORD_GUILD_ID: 'guild',
          DISCORD_INVITE_URL: 'https://discord.gg/2gether',
          ADMIN_DISCORD_IDS: '1001',
        }),
      )
      .overrideProvider(DiscordClient)
      .useValue(discord)
      .compile();
    app = setupApp(moduleRef.createNestApplication());
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  /** Starts a sign-in: an agent that keeps the cookies, and the `state` Discord will send back. */
  async function start() {
    const agent = request.agent(app.getHttpServer());
    const redirect = await agent.get('/api/auth/discord').expect(302);
    const state = new URL(redirect.headers.location!).searchParams.get('state')!;
    return { agent, state };
  }
  const callback = (agent: ReturnType<typeof request.agent>, query: Record<string, string>) =>
    agent.get('/api/auth/discord/callback').query(query);

  it('tells the login page what is offered, with the invitation link', async () => {
    const { body } = await request(app.getHttpServer()).get('/api/auth/config').expect(200);
    expect(body).toEqual({
      discord: true,
      devLogin: false,
      inviteUrl: 'https://discord.gg/2gether',
    });
  });

  it('signs a member in, with their Discord name and avatar, and resyncs them next time', async () => {
    discord.identities.set('ok', ADA);
    const first = await start();
    const done = await callback(first.agent, { code: 'ok', state: first.state }).expect(302);
    expect(done.headers.location).toBe(`${WEB}/`);
    const me: MeResponse = (await first.agent.get('/api/me').expect(200)).body;
    expect(me.player).toMatchObject({
      displayName: 'Ada',
      avatarUrl: 'https://cdn.example/ada.png',
      isAdmin: true,
    });

    // Renamed on Discord: the next sign-in updates the same player.
    discord.identities.set('again', { ...ADA, displayName: 'Ada L.' });
    const second = await start();
    await callback(second.agent, { code: 'again', state: second.state }).expect(302);
    const renamed: MeResponse = (await second.agent.get('/api/me').expect(200)).body;
    expect(renamed.player.id).toBe(me.player.id);
    expect(renamed.player.displayName).toBe('Ada L.');
  });

  it('turns away someone who is not in the server, without creating a session', async () => {
    discord.identities.set('out', { ...ADA, id: '2002', isMember: false });
    const { agent, state } = await start();
    const done = await callback(agent, { code: 'out', state }).expect(302);
    expect(done.headers.location).toBe(`${WEB}/login?error=not_member`);
    await agent.get('/api/me').expect(401);
  });

  it('refuses a callback whose state does not match, or that has none', async () => {
    discord.identities.set('ok', ADA);
    const { agent } = await start();
    const forged = await callback(agent, { code: 'ok', state: 'forged' }).expect(302);
    expect(forged.headers.location).toBe(`${WEB}/login?error=state`);
    const missing = await request(app.getHttpServer())
      .get('/api/auth/discord/callback')
      .query({ code: 'ok' })
      .expect(302);
    expect(missing.headers.location).toBe(`${WEB}/login?error=state`);
    await agent.get('/api/me').expect(401);
  });

  it('says so when the player cancels on Discord', async () => {
    const { agent, state } = await start();
    const done = await callback(agent, { error: 'access_denied', state }).expect(302);
    expect(done.headers.location).toBe(`${WEB}/login?error=denied`);
  });

  it('redirects with a clear error, instead of a JSON page, when Discord fails', async () => {
    discord.identities.set('boom', new Error('Discord token exchange failed (500)'));
    const { agent, state } = await start();
    const done = await callback(agent, { code: 'boom', state }).expect(302);
    expect(done.headers.location).toBe(`${WEB}/login?error=discord`);
    await agent.get('/api/me').expect(401);
  });

  it('uses each state once: replaying a callback does not sign in again', async () => {
    discord.identities.set('ok', ADA);
    const { agent, state } = await start();
    await callback(agent, { code: 'ok', state }).expect(302);
    const replay = await callback(agent, { code: 'ok', state }).expect(302);
    expect(replay.headers.location).toBe(`${WEB}/login?error=state`);
  });

  it('lets the web app, and only it, call the API with its session cookie', async () => {
    const allowed = await request(app.getHttpServer())
      .options('/api/me')
      .set('Origin', WEB)
      .set('Access-Control-Request-Method', 'GET')
      .expect(204);
    expect(allowed.headers['access-control-allow-origin']).toBe(WEB);
    expect(allowed.headers['access-control-allow-credentials']).toBe('true');

    const other = await request(app.getHttpServer())
      .get('/api/auth/config')
      .set('Origin', 'https://evil.example');
    expect(other.headers['access-control-allow-origin']).toBe(WEB);
  });
});
