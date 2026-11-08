import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { MeResponse, TokenResponse } from '@2tamago/core/contracts';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { DiscordClient, type DiscordIdentity } from '../src/auth/discord.client.js';
import { Clock } from '../src/common/clock.js';
import { AppConfig } from '../src/config/app-config.js';
import { setupApp } from '../src/setup-app.js';
import { TestClient } from './dpop-client.js';

/**
 * In-memory PGlite by default; set TEST_AUTH_DATABASE_URL to run against a real PostgreSQL (the
 * row lock of the refresh). A database of its own: specs running in parallel would share the data.
 */
const databaseUrl = process.env.TEST_AUTH_DATABASE_URL || 'memory://';
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

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const CHROME =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const FIREFOX = 'Mozilla/5.0 (X11; Linux x86_64; rv:132.0) Gecko/20100101 Firefox/132.0';
const HOME = '203.0.113.7';
const MOBILE = '198.51.100.9';

class FakeClock extends Clock {
  time = Date.now();
  override now() {
    return this.time;
  }
}

/** Where a request seems to come from. */
interface Origin {
  ip?: string;
  ua?: string;
}

describe('sessions (e2e)', () => {
  let app: INestApplication<App>;
  let discord: FakeDiscord;
  let clock: FakeClock;

  beforeEach(async () => {
    discord = new FakeDiscord();
    clock = new FakeClock();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AppConfig)
      .useValue(
        new AppConfig({
          DATABASE_URL: databaseUrl,
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
      .overrideProvider(Clock)
      .useValue(clock)
      .compile();
    app = setupApp(moduleRef.createNestApplication());
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());
  const from = (req: request.Test, origin: Origin = {}) =>
    req.set('X-Forwarded-For', origin.ip ?? HOME).set('User-Agent', origin.ua ?? CHROME);
  /** A proof made "now" on the fake clock. */
  const proof = (client: TestClient, method: string, path: string) =>
    client.proof(method, path, { iat: Math.floor(clock.now() / 1000) });

  /** The browser side of the start: a PKCE pair, and the signed `state` Discord would send back. */
  async function begin(origin: Origin = {}) {
    const pkce = TestClient.pkce();
    const redirect = await from(
      http().get('/api/auth/discord').query({ code_challenge: pkce.challenge }),
      origin,
    ).expect(302);
    const state = new URL(redirect.headers.location!).searchParams.get('state')!;
    return { ...pkce, state };
  }
  const callback = (query: Record<string, string>, origin: Origin = {}) =>
    from(http().get('/api/auth/discord/callback').query(query), origin);
  const exchange = (
    client: TestClient,
    body: { code: string; code_verifier: string },
    origin: Origin = {},
  ) =>
    from(
      http()
        .post('/api/auth/token')
        .set('DPoP', proof(client, 'POST', '/api/auth/token'))
        .send(body),
      origin,
    );
  const refresh = (client: TestClient, refreshToken: string, origin: Origin = {}) =>
    from(
      http()
        .post('/api/auth/refresh')
        .set('DPoP', proof(client, 'POST', '/api/auth/refresh'))
        .send({ refresh_token: refreshToken }),
      origin,
    );

  /** A full sign-in as a member: the tokens, and the key that owns the session. */
  async function signIn(origin: Origin = {}, identity: DiscordIdentity = ADA) {
    discord.identities.set('ok', identity);
    const client = new TestClient();
    const started = await begin(origin);
    const done = await callback({ code: 'ok', state: started.state }, origin).expect(302);
    const code = new URL(done.headers.location!).searchParams.get('code')!;
    const tokens: TokenResponse = (
      await exchange(client, { code, code_verifier: started.verifier }, origin).expect(200)
    ).body;
    return { client, tokens, code, started };
  }
  const me = (accessToken: string) =>
    http().get('/api/me').set('Authorization', `Bearer ${accessToken}`);

  it('tells the login page what is offered, with the invitation link', async () => {
    const { body } = await http().get('/api/auth/config').expect(200);
    expect(body).toEqual({
      discord: true,
      devLogin: false,
      inviteUrl: 'https://discord.gg/2gether',
    });
  });

  describe('signing in with Discord', () => {
    it('hands a one-time code to the web app, which trades it for tokens', async () => {
      discord.identities.set('ok', ADA);
      const started = await begin();
      const done = await callback({ code: 'ok', state: started.state }).expect(302);
      const location = new URL(done.headers.location!);
      expect(`${location.origin}${location.pathname}`).toBe(`${WEB}/login`);
      // No token and no cookie anywhere: just a code.
      expect(done.headers['set-cookie']).toBeUndefined();
      expect(location.hash).toBe('');

      const tokens: TokenResponse = (
        await exchange(new TestClient(), {
          code: location.searchParams.get('code')!,
          code_verifier: started.verifier,
        }).expect(200)
      ).body;
      expect(tokens.expires_in).toBe(1_800);
      expect(tokens.refresh_token).toBeTruthy();
      const player: MeResponse = (await me(tokens.access_token).expect(200)).body;
      expect(player.player).toMatchObject({
        displayName: 'Ada',
        avatarUrl: 'https://cdn.example/ada.png',
        isAdmin: true,
      });
    });

    it('resyncs the same player at the next sign-in', async () => {
      const first = await signIn();
      const before: MeResponse = (await me(first.tokens.access_token).expect(200)).body;
      const second = await signIn({}, { ...ADA, displayName: 'Ada L.' });
      const after: MeResponse = (await me(second.tokens.access_token).expect(200)).body;
      expect(after.player.id).toBe(before.player.id);
      expect(after.player.displayName).toBe('Ada L.');
    });

    it('turns away someone who is not in the server, without a code', async () => {
      discord.identities.set('out', { ...ADA, id: '2002', isMember: false });
      const { state } = await begin();
      const done = await callback({ code: 'out', state }).expect(302);
      expect(done.headers.location).toBe(`${WEB}/login?error=not_member`);
    });

    it('says so when the player cancels on Discord, or when Discord fails', async () => {
      const cancelled = await callback({ error: 'access_denied', state: (await begin()).state });
      expect(cancelled.headers.location).toBe(`${WEB}/login?error=denied`);

      discord.identities.set('boom', new Error('Discord token exchange failed (500)'));
      const failed = await callback({ code: 'boom', state: (await begin()).state }).expect(302);
      expect(failed.headers.location).toBe(`${WEB}/login?error=discord`);
    });

    it('refuses a callback whose state is forged, missing or not ours', async () => {
      discord.identities.set('ok', ADA);
      const { tokens } = await signIn();
      for (const state of ['forged', tokens.access_token, undefined]) {
        const done = await callback({ code: 'ok', ...(state ? { state } : {}) }).expect(302);
        expect(done.headers.location).toBe(`${WEB}/login?error=state`);
      }
    });

    it('refuses to start without a valid PKCE challenge', async () => {
      for (const query of [{}, { code_challenge: 'short' }]) {
        const done = await http().get('/api/auth/discord').query(query).expect(302);
        expect(done.headers.location).toBe(`${WEB}/login?error=state`);
      }
    });

    it('does not take the sign-in state for an access token', async () => {
      const { state } = await begin();
      await me(state).expect(401);
    });
  });

  describe('the one-time code', () => {
    it('works once', async () => {
      const { client, code, started } = await signIn();
      const again = await exchange(client, { code, code_verifier: started.verifier });
      expect(again.status).toBe(401);
      expect(again.body.code).toBe('invalid_grant');
    });

    it('is spent by a wrong PKCE verifier: no second try', async () => {
      discord.identities.set('ok', ADA);
      const started = await begin();
      const done = await callback({ code: 'ok', state: started.state }).expect(302);
      const code = new URL(done.headers.location!).searchParams.get('code')!;
      const thief = new TestClient();
      const wrong = await exchange(thief, { code, code_verifier: TestClient.pkce().verifier });
      expect(wrong.body.code).toBe('invalid_grant');
      const right = await exchange(new TestClient(), { code, code_verifier: started.verifier });
      expect(right.status).toBe(401);
    });

    it('expires after a minute', async () => {
      discord.identities.set('ok', ADA);
      const started = await begin();
      const done = await callback({ code: 'ok', state: started.state }).expect(302);
      const code = new URL(done.headers.location!).searchParams.get('code')!;
      clock.time += 61_000;
      const late = await exchange(new TestClient(), { code, code_verifier: started.verifier });
      expect(late.body.code).toBe('invalid_grant');
    });
  });

  describe('proof of possession', () => {
    it('is required to sign in and to refresh', async () => {
      const { tokens, started } = await signIn();
      const noProof = await http()
        .post('/api/auth/refresh')
        .send({ refresh_token: tokens.refresh_token });
      expect(noProof.status).toBe(401);
      expect(noProof.body.code).toBe('invalid_dpop');
      const noProofToken = await http()
        .post('/api/auth/token')
        .send({ code: 'x'.repeat(30), code_verifier: started.verifier });
      expect(noProofToken.body.code).toBe('invalid_dpop');
    });

    it('works once: a replayed proof is refused', async () => {
      const { client, tokens } = await signIn();
      const dpop = proof(client, 'POST', '/api/auth/refresh');
      const send = () =>
        from(
          http()
            .post('/api/auth/refresh')
            .set('DPoP', dpop)
            .send({ refresh_token: tokens.refresh_token }),
        );
      await send().expect(200);
      const replay = await send();
      expect(replay.status).toBe(401);
      expect(replay.body.code).toBe('invalid_dpop');
    });

    it('is bound to its request: another path or method is refused', async () => {
      const { client, tokens } = await signIn();
      const forPath = await from(
        http()
          .post('/api/auth/refresh')
          .set('DPoP', proof(client, 'POST', '/api/auth/token'))
          .send({ refresh_token: tokens.refresh_token }),
      );
      expect(forPath.body.code).toBe('invalid_dpop');
    });

    it('makes a stolen refresh token useless without the key, and does not end the session', async () => {
      const { client, tokens } = await signIn();
      const thief = await refresh(new TestClient(), tokens.refresh_token!);
      expect(thief.status).toBe(401);
      expect(thief.body.code).toBe('invalid_dpop');
      await refresh(client, tokens.refresh_token!).expect(200);
    });
  });

  describe('refreshing', () => {
    it('rotates the refresh token and keeps the player signed in', async () => {
      const { client, tokens } = await signIn();
      const next: TokenResponse = (await refresh(client, tokens.refresh_token!).expect(200)).body;
      expect(next.refresh_token).toBeTruthy();
      expect(next.refresh_token).not.toBe(tokens.refresh_token);
      await me(next.access_token).expect(200);
    });

    it('lets a second tab refresh with the token that was just replaced, without a new one', async () => {
      const { client, tokens } = await signIn();
      await refresh(client, tokens.refresh_token!).expect(200);
      clock.time += 10_000;
      const duplicate: TokenResponse = (await refresh(client, tokens.refresh_token!).expect(200))
        .body;
      expect(duplicate.refresh_token).toBeUndefined();
      await me(duplicate.access_token).expect(200);
    });

    it('revokes the whole session when an old refresh token comes back later', async () => {
      const { client, tokens } = await signIn();
      const next: TokenResponse = (await refresh(client, tokens.refresh_token!).expect(200)).body;
      clock.time += 31_000;
      const replay = await refresh(client, tokens.refresh_token!);
      expect(replay.body.code).toBe('invalid_grant');
      // The legitimate token was cut off too: whoever holds a copy gets nothing either.
      const after = await refresh(client, next.refresh_token!);
      expect(after.body.code).toBe('invalid_grant');
    });

    it('ends with the logout', async () => {
      const { client, tokens } = await signIn();
      await http()
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${tokens.access_token}`)
        .expect(204);
      const after = await refresh(client, tokens.refresh_token!);
      expect(after.body.code).toBe('invalid_grant');
    });

    it('cuts the access token short once the session is revoked', async () => {
      const { tokens } = await signIn();
      const bearer = `Bearer ${tokens.access_token}`;
      await http().get('/api/me').set('Authorization', bearer).expect(200);
      await http().post('/api/auth/logout').set('Authorization', bearer).expect(204);
      await http().get('/api/me').set('Authorization', bearer).expect(401);
    });

    it('needs a session to log out', async () => {
      await http().post('/api/auth/logout').expect(401);
    });
  });

  describe('where the session is used from', () => {
    it('keeps refreshing for days from the same network, sliding the inactivity delay', async () => {
      const { client, tokens } = await signIn({ ip: '203.0.113.7' });
      let refreshToken = tokens.refresh_token!;
      // Six days apart each time: past the first week in total, never idle for a week.
      for (let i = 0; i < 4; i++) {
        clock.time += 6 * DAY;
        const next: TokenResponse = (
          await refresh(client, refreshToken, { ip: `203.0.113.${20 + i}` }).expect(200)
        ).body;
        refreshToken = next.refresh_token!;
      }
      // 24 days in. The hard limit is 30.
      clock.time += 7 * DAY;
      const past = await refresh(client, refreshToken);
      expect(past.body.code).toBe('session_expired');
    });

    it('ends after a week without a refresh', async () => {
      const { client, tokens } = await signIn();
      clock.time += 7 * DAY + 1_000;
      const idle = await refresh(client, tokens.refresh_token!);
      expect(idle.status).toBe(401);
      expect(idle.body.code).toBe('session_expired');
    });

    it('tolerates another network for a few hours, then asks for a new sign-in', async () => {
      const { client, tokens } = await signIn();
      let refreshToken = tokens.refresh_token!;
      // Phone data: another network, refreshed every hour for five hours.
      for (let hour = 1; hour <= 5; hour++) {
        clock.time += HOUR;
        const next: TokenResponse = (
          await refresh(client, refreshToken, { ip: MOBILE }).expect(200)
        ).body;
        refreshToken = next.refresh_token!;
      }
      clock.time += 2 * HOUR;
      const late = await refresh(client, refreshToken, { ip: MOBILE });
      expect(late.status).toBe(401);
      expect(late.body.code).toBe('session_roaming');
      // The session is over, on any network.
      const home = await refresh(client, refreshToken, { ip: HOME });
      expect(home.body.code).toBe('invalid_grant');
    });

    it('stops the roaming countdown when the player is back on the sign-in network', async () => {
      const { client, tokens } = await signIn();
      clock.time += 4 * HOUR;
      const away: TokenResponse = (
        await refresh(client, tokens.refresh_token!, { ip: MOBILE }).expect(200)
      ).body;
      clock.time += HOUR;
      const back: TokenResponse = (
        await refresh(client, away.refresh_token!, { ip: HOME }).expect(200)
      ).body;
      // Away again, long after the first trip: a new allowance of its own.
      clock.time += 2 * DAY;
      await refresh(client, back.refresh_token!, { ip: MOBILE }).expect(200);
    });

    it('revokes a session that shows up in another browser or system', async () => {
      const { client, tokens } = await signIn();
      const other = await refresh(client, tokens.refresh_token!, { ua: FIREFOX });
      expect(other.status).toBe(401);
      expect(other.body.code).toBe('session_suspicious');
      const back = await refresh(client, tokens.refresh_token!);
      expect(back.body.code).toBe('invalid_grant');
    });

    it('survives a browser update', async () => {
      const { client, tokens } = await signIn();
      await refresh(client, tokens.refresh_token!, {
        ua: CHROME.replace('130.0.0.0', '131.0.0.0'),
      }).expect(200);
    });
  });

  it('lets the web app, and only it, call the API from another origin', async () => {
    const allowed = await http()
      .options('/api/me')
      .set('Origin', WEB)
      .set('Access-Control-Request-Method', 'GET')
      .set('Access-Control-Request-Headers', 'authorization,dpop,content-type')
      .expect(204);
    expect(allowed.headers['access-control-allow-origin']).toBe(WEB);
    expect(allowed.headers['access-control-allow-headers']).toMatch(/dpop/i);
    // No cookie is involved, so credentials are not allowed.
    expect(allowed.headers['access-control-allow-credentials']).toBeUndefined();

    const other = await http().get('/api/auth/config').set('Origin', 'https://evil.example');
    expect(other.headers['access-control-allow-origin']).toBe(WEB);
  });
});
