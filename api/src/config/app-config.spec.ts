import { AppConfig } from './app-config.js';

describe('AppConfig', () => {
  it('has development defaults', () => {
    const config = new AppConfig({});
    expect(config.databaseUrl).toBe('pglite://.data/pglite');
    expect(config.discord).toBeNull();
    expect(config.game.timeScale).toBe(1);
  });

  it('turns Web Push on only with both VAPID keys', () => {
    expect(new AppConfig({}).push).toBeNull();
    expect(new AppConfig({ VAPID_PUBLIC_KEY: 'pub' }).push).toBeNull();
    expect(new AppConfig({ VAPID_PUBLIC_KEY: 'pub', VAPID_PRIVATE_KEY: 'priv' }).push).toEqual({
      publicKey: 'pub',
      privateKey: 'priv',
      subject: 'mailto:admin@example.com',
    });
    expect(
      new AppConfig({
        VAPID_PUBLIC_KEY: 'pub',
        VAPID_PRIVATE_KEY: 'priv',
        VAPID_SUBJECT: 'https://2tamago.example',
      }).push?.subject,
    ).toBe('https://2tamago.example');
  });

  it('builds the database URL from its parts when DATABASE_URL is empty', () => {
    const config = new AppConfig({
      DATABASE_URL: '',
      DATABASE_HOST: 'db.example.org',
      DATABASE_PORT: '30068',
      DATABASE_NAME: 'tamago_db',
      DATABASE_USER: 'tamago user',
      DATABASE_PASSWORD: 'p@ss/w:rd',
    });
    const url = new URL(config.databaseUrl);
    expect(url.protocol).toBe('postgres:');
    expect(url.hostname).toBe('db.example.org');
    expect(url.port).toBe('30068');
    expect(url.pathname).toBe('/tamago_db');
    expect(decodeURIComponent(url.username)).toBe('tamago user');
    expect(decodeURIComponent(url.password)).toBe('p@ss/w:rd');
    expect(() => new AppConfig({ DATABASE_HOST: 'h' })).toThrow(/DATABASE_NAME/);
  });

  it('applies the defaults to blank values, as docker compose passes them', () => {
    const config = new AppConfig({
      DATABASE_URL: '',
      AUTH_ACCESS_TTL_MINUTES: '',
      AUTH_DEV_LOGIN: '',
      GAME_TIME_SCALE: '',
      GAME_DEPARTURE: '',
      GAME_TIMEZONE: '',
      DISCORD_INVITE_URL: '',
      WEB_ORIGIN: '',
    });
    expect(config.databaseUrl).toBe('pglite://.data/pglite');
    expect(config.auth.accessTtlSeconds).toBe(1800);
    expect(config.auth.devLogin).toBe(false);
    expect(config.game).toEqual({ timeScale: 1, departureEnabled: true, timezone: 'Europe/Paris' });
    expect(config.discordInviteUrl).toBeUndefined();
    expect(config.webOrigin).toBe('http://localhost:4321');
  });

  it('prefers DATABASE_URL over its parts', () => {
    const config = new AppConfig({ DATABASE_URL: 'postgres://a@b/c', DATABASE_HOST: 'other' });
    expect(config.databaseUrl).toBe('postgres://a@b/c');
  });

  it('reads the API and browser DSNs separately, both optional', () => {
    expect(new AppConfig({}).sentryWebDsn).toBeUndefined();
    const config = new AppConfig({ SENTRY_DSN: 'https://a@x/1', SENTRY_WEB_DSN: 'https://b@x/2' });
    expect(config.sentryDsn).toBe('https://a@x/1');
    expect(config.sentryWebDsn).toBe('https://b@x/2');
  });

  it('refuses unsafe production settings', () => {
    expect(() => new AppConfig({ NODE_ENV: 'production' })).toThrow(/AUTH_SECRET/);
    const secret = 'x'.repeat(32);
    expect(
      () => new AppConfig({ NODE_ENV: 'production', AUTH_SECRET: secret, AUTH_DEV_LOGIN: 'true' }),
    ).toThrow(/AUTH_DEV_LOGIN/);
    expect(new AppConfig({ NODE_ENV: 'production', AUTH_SECRET: secret }).auth.devLogin).toBe(
      false,
    );
  });

  it('enables Discord only when fully configured, and reads admin ids', () => {
    const config = new AppConfig({
      DISCORD_CLIENT_ID: 'id',
      DISCORD_CLIENT_SECRET: 'secret',
      DISCORD_GUILD_ID: 'guild',
      ADMIN_DISCORD_IDS: '1, 2',
    });
    expect(config.discord?.redirectUri).toBe('http://localhost:4321/api/auth/discord/callback');
    expect(config.auth.adminDiscordIds).toEqual(['1', '2']);
  });
});
