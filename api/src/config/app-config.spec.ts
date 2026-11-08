import { AppConfig } from './app-config.js';

describe('AppConfig', () => {
  it('has development defaults', () => {
    const config = new AppConfig({});
    expect(config.databaseUrl).toBe('pglite://.data/pglite');
    expect(config.discord).toBeNull();
    expect(config.game.timeScale).toBe(1);
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
