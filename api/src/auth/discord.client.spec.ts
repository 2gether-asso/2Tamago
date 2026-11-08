import { ServiceUnavailableException } from '@nestjs/common';
import { AppConfig } from '../config/app-config.js';
import { DiscordClient } from './discord.client.js';

const config = new AppConfig({
  DISCORD_CLIENT_ID: 'client',
  DISCORD_CLIENT_SECRET: 'secret',
  DISCORD_GUILD_ID: 'guild',
  WEB_ORIGIN: 'https://tamago.example',
});
const client = new DiscordClient(config);

type Reply = { status?: number; body?: unknown };
/** Answers the three Discord calls in order: token, user, guild member. */
function stubDiscord(token: Reply, user: Reply, member: Reply) {
  const replies = [token, user, member];
  const calls: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      calls.push(url);
      const { status = 200, body = {} } = replies[calls.length - 1]!;
      return new Response(JSON.stringify(body), { status });
    }),
  );
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

const USER = { id: '42', username: 'ada_l', global_name: 'Ada', avatar: 'hash' };

describe('DiscordClient', () => {
  it('builds the authorization URL with the scopes it needs and the state', () => {
    const url = new URL(client.authorizeUrl('state-123'));
    expect(url.origin + url.pathname).toBe('https://discord.com/oauth2/authorize');
    expect(url.searchParams.get('client_id')).toBe('client');
    expect(url.searchParams.get('state')).toBe('state-123');
    expect(url.searchParams.get('scope')).toBe('identify guilds.members.read');
    expect(url.searchParams.get('redirect_uri')).toBe(
      'https://tamago.example/api/auth/discord/callback',
    );
  });

  it('is disabled and refuses to build URLs when Discord is not configured', () => {
    const unconfigured = new DiscordClient(new AppConfig({}));
    expect(unconfigured.enabled).toBe(false);
    expect(() => unconfigured.authorizeUrl('x')).toThrow(ServiceUnavailableException);
  });

  it('identifies a member, preferring the server nickname, then the global name', async () => {
    stubDiscord({ body: { access_token: 't' } }, { body: USER }, { body: { nick: 'Ada du Club' } });
    expect(await client.identify('code')).toEqual({
      id: '42',
      displayName: 'Ada du Club',
      avatarUrl: 'https://cdn.discordapp.com/avatars/42/hash.png?size=128',
      isMember: true,
    });

    stubDiscord({ body: { access_token: 't' } }, { body: USER }, { body: { nick: null } });
    expect((await client.identify('code')).displayName).toBe('Ada');

    stubDiscord(
      { body: { access_token: 't' } },
      { body: { ...USER, global_name: null, avatar: null } },
      { body: { nick: null } },
    );
    const plain = await client.identify('code');
    expect(plain).toMatchObject({ displayName: 'ada_l', avatarUrl: null });
  });

  it('knows someone outside the server is not a member (404)', async () => {
    stubDiscord({ body: { access_token: 't' } }, { body: USER }, { status: 404 });
    expect(await client.identify('code')).toMatchObject({ id: '42', isMember: false });
  });

  it('does not take a Discord outage or rate limit for "not a member"', async () => {
    for (const status of [429, 500, 503]) {
      stubDiscord({ body: { access_token: 't' } }, { body: USER }, { status });
      await expect(client.identify('code')).rejects.toThrow(`member lookup failed (${status})`);
    }
  });

  it('fails clearly when the code exchange or the user lookup is refused', async () => {
    stubDiscord({ status: 400 }, {}, {});
    await expect(client.identify('bad')).rejects.toThrow('token exchange failed (400)');
    stubDiscord({ body: { access_token: 't' } }, { status: 401 }, {});
    await expect(client.identify('code')).rejects.toThrow('user lookup failed (401)');
  });

  it('sends the code, the secret and the redirect URI to Discord', async () => {
    const calls = stubDiscord({ body: { access_token: 't' } }, { body: USER }, { body: {} });
    await client.identify('the-code');
    expect(calls[0]).toBe('https://discord.com/api/v10/oauth2/token');
    const init = vi.mocked(fetch).mock.calls[0]![1]!;
    const form = new URLSearchParams(init.body as URLSearchParams);
    expect(form.get('code')).toBe('the-code');
    expect(form.get('client_secret')).toBe('secret');
    expect(form.get('grant_type')).toBe('authorization_code');
    expect(calls[2]).toBe('https://discord.com/api/v10/users/@me/guilds/guild/member');
  });
});
