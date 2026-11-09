import { z } from 'zod';

const bool = z
  .enum(['true', 'false', '1', '0'])
  .optional()
  .transform((value) => value === 'true' || value === '1');

const csv = z
  .string()
  .optional()
  .transform((value) =>
    (value ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  );

/** A hop count (`2`) stays a number; anything else is passed to Express as is. */
function parseTrustProxy(value: string | undefined): number | string {
  const text = (value ?? '').trim();
  if (text === '') return 1;
  if (/^\d+$/.test(text)) return Number(text);
  if (/^(true|false)$/i.test(text)) {
    throw new Error('TRUST_PROXY: use a hop count or addresses, not true/false');
  }
  return text;
}

const optionalUrl = z.url().optional();

const envSchema = z
  .object({
    NODE_ENV: z.string().default('development'),
    PORT: z.coerce.number().int().default(3000),
    /** Connection string. Empty or unset: built from `DATABASE_HOST` and friends, else embedded PGlite. */
    DATABASE_URL: z.string().optional(),
    /** Components of a PostgreSQL URL, used only when `DATABASE_URL` is empty. */
    DATABASE_HOST: z.string().optional(),
    DATABASE_PORT: z.coerce.number().int().positive().default(5432),
    DATABASE_NAME: z.string().optional(),
    DATABASE_USER: z.string().optional(),
    DATABASE_PASSWORD: z.string().optional(),
    /** `false` when migrations are a separate deployment step (`node dist/migrate.js`). */
    DATABASE_AUTO_MIGRATE: z
      .enum(['true', 'false'])
      .default('true')
      .transform((value) => value === 'true'),

    AUTH_SECRET: z.string().min(16).optional(),
    AUTH_DEV_LOGIN: bool,
    /** Access tokens are short: the web app renews them quietly. */
    AUTH_ACCESS_TTL_MINUTES: z.coerce.number().positive().default(30),
    /** A session ends after this long without a refresh (each refresh starts the delay again). */
    AUTH_REFRESH_IDLE_DAYS: z.coerce.number().positive().default(7),
    /** Hard limit of a session, however active. */
    AUTH_SESSION_MAX_DAYS: z.coerce.number().positive().default(30),
    /** How long a session keeps refreshing after it moved to another network than its sign-in's. */
    AUTH_ROAMING_HOURS: z.coerce.number().positive().default(6),
    /**
     * Reverse proxies between the internet and the API (each one adds an `X-Forwarded-For` entry):
     * a hop count, or a list of addresses/subnets Express understands (`loopback, 10.99.0.0/16`).
     * `0` trusts no header at all.
     */
    TRUST_PROXY: z
      .string()
      .optional()
      .transform((value) => parseTrustProxy(value)),
    /**
     * A header set by an edge you trust and that carries the player's IP alone, such as
     * `CF-Connecting-IP` behind Cloudflare. Ignored when unset: anyone can send a header.
     */
    CLIENT_IP_HEADER: z
      .string()
      .regex(/^[a-z0-9-]+$/i, 'CLIENT_IP_HEADER must be a header name')
      .optional(),
    /** Sentry or GlitchTip DSN; error reporting is off without it. */
    SENTRY_DSN: z.string().optional(),
    /** DSN of the browser project (a public value, sent to the web app); web tracking is off without it. */
    SENTRY_WEB_DSN: z.string().optional(),
    WEB_ORIGIN: z.url().default('http://localhost:4321'),

    DISCORD_CLIENT_ID: z.string().optional(),
    DISCORD_CLIENT_SECRET: z.string().optional(),
    DISCORD_GUILD_ID: z.string().optional(),
    DISCORD_REDIRECT_URI: z.string().optional(),
    /** Invitation to the Discord server, offered to people who are not members yet. */
    DISCORD_INVITE_URL: optionalUrl,
    /** Channel webhook for the game announcements; announcements are off without it. */
    DISCORD_WEBHOOK_URL: optionalUrl,
    ADMIN_DISCORD_IDS: csv,

    /** Web Push (VAPID keys, see `make vapid-keys`); notifications are off without both keys. */
    VAPID_PUBLIC_KEY: z.string().optional(),
    VAPID_PRIVATE_KEY: z.string().optional(),
    /** A `mailto:` or https URL the push services can reach in case of abuse. */
    VAPID_SUBJECT: z.string().default('mailto:admin@example.com'),

    GAME_TIME_SCALE: z.coerce.number().positive().default(1),
    GAME_DEPARTURE: z
      .enum(['true', 'false'])
      .default('true')
      .transform((value) => value === 'true'),
    GAME_TIMEZONE: z.string().default('Europe/Paris'),
  })
  .refine((env) => env.NODE_ENV !== 'production' || (env.AUTH_SECRET?.length ?? 0) >= 32, {
    message: 'AUTH_SECRET (32+ characters) is required in production',
  })
  .refine((env) => env.NODE_ENV !== 'production' || !env.AUTH_DEV_LOGIN, {
    message: 'AUTH_DEV_LOGIN must not be enabled in production',
  });

/** `DATABASE_URL`, else a PostgreSQL URL from the `DATABASE_*` parts (credentials encoded), else PGlite. */
function databaseUrl(env: z.infer<typeof envSchema>): string {
  if (env.DATABASE_URL) return env.DATABASE_URL;
  if (!env.DATABASE_HOST) return 'pglite://.data/pglite';
  if (!env.DATABASE_NAME) throw new Error('DATABASE_NAME is required with DATABASE_HOST');
  const url = new URL('postgres://placeholder');
  url.hostname = env.DATABASE_HOST;
  url.port = String(env.DATABASE_PORT);
  url.pathname = `/${encodeURIComponent(env.DATABASE_NAME)}`;
  url.username = env.DATABASE_USER ?? '';
  url.password = env.DATABASE_PASSWORD ?? '';
  return url.toString();
}

/**
 * The single source of configuration (environment variables), validated once
 * at startup. Inject `AppConfig` instead of reading `process.env`.
 */
export class AppConfig {
  readonly env: string;
  readonly port: number;
  readonly databaseUrl: string;
  readonly databaseAutoMigrate: boolean;
  readonly auth: {
    secret: string;
    devLogin: boolean;
    accessTtlSeconds: number;
    refreshIdleSeconds: number;
    sessionMaxSeconds: number;
    roamingSeconds: number;
    adminDiscordIds: string[];
  };
  /** How the client IP is found behind the reverse proxies (see `client-ip.ts`). */
  readonly network: { trustProxy: number | string; clientIpHeader: string | undefined };
  readonly webOrigin: string;
  readonly sentryDsn: string | undefined;
  readonly sentryWebDsn: string | undefined;
  readonly discordInviteUrl: string | undefined;
  readonly discordWebhookUrl: string | undefined;
  readonly discord: {
    clientId: string;
    clientSecret: string;
    guildId: string;
    redirectUri: string;
  } | null;
  readonly push: { publicKey: string; privateKey: string; subject: string } | null;
  readonly game: { timeScale: number; departureEnabled: boolean; timezone: string };

  constructor(source: Record<string, string | undefined> = process.env) {
    // A variable that is set but blank (as docker compose passes unset ones) counts as unset.
    const env = envSchema.parse(
      Object.fromEntries(Object.entries(source).filter(([, value]) => value !== '')),
    );
    this.env = env.NODE_ENV;
    this.port = env.PORT;
    this.databaseUrl = databaseUrl(env);
    this.databaseAutoMigrate = env.DATABASE_AUTO_MIGRATE;
    this.auth = {
      // A missing secret is only accepted outside production (see the schema).
      secret: env.AUTH_SECRET ?? 'dev-only-insecure-secret-do-not-use',
      devLogin: env.AUTH_DEV_LOGIN,
      accessTtlSeconds: Math.round(env.AUTH_ACCESS_TTL_MINUTES * 60),
      refreshIdleSeconds: Math.round(env.AUTH_REFRESH_IDLE_DAYS * 86_400),
      sessionMaxSeconds: Math.round(env.AUTH_SESSION_MAX_DAYS * 86_400),
      roamingSeconds: Math.round(env.AUTH_ROAMING_HOURS * 3_600),
      adminDiscordIds: env.ADMIN_DISCORD_IDS,
    };
    this.network = {
      trustProxy: env.TRUST_PROXY,
      clientIpHeader: env.CLIENT_IP_HEADER?.toLowerCase(),
    };
    this.webOrigin = env.WEB_ORIGIN;
    this.sentryDsn = env.SENTRY_DSN || undefined;
    this.sentryWebDsn = env.SENTRY_WEB_DSN || undefined;
    this.discordInviteUrl = env.DISCORD_INVITE_URL || undefined;
    this.discordWebhookUrl = env.DISCORD_WEBHOOK_URL || undefined;
    this.discord =
      env.DISCORD_CLIENT_ID && env.DISCORD_CLIENT_SECRET && env.DISCORD_GUILD_ID
        ? {
            clientId: env.DISCORD_CLIENT_ID,
            clientSecret: env.DISCORD_CLIENT_SECRET,
            guildId: env.DISCORD_GUILD_ID,
            redirectUri: env.DISCORD_REDIRECT_URI ?? `${env.WEB_ORIGIN}/api/auth/discord/callback`,
          }
        : null;
    this.push =
      env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY
        ? {
            publicKey: env.VAPID_PUBLIC_KEY,
            privateKey: env.VAPID_PRIVATE_KEY,
            subject: env.VAPID_SUBJECT,
          }
        : null;
    this.game = {
      timeScale: env.GAME_TIME_SCALE,
      departureEnabled: env.GAME_DEPARTURE,
      timezone: env.GAME_TIMEZONE,
    };
  }
}
