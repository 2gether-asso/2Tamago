import { z } from 'zod';

const bool = z
  .enum(['true', 'false', '1', '0', ''])
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

/** A URL, or an empty value (a variable that is set but blank, as docker compose does). */
const optionalUrl = z.union([z.literal(''), z.url()]).optional();

const envSchema = z
  .object({
    NODE_ENV: z.string().default('development'),
    PORT: z.coerce.number().int().default(3000),
    DATABASE_URL: z.string().default('pglite://.data/pglite'),
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
  readonly game: { timeScale: number; departureEnabled: boolean; timezone: string };

  constructor(source: Record<string, string | undefined> = process.env) {
    const env = envSchema.parse(source);
    this.env = env.NODE_ENV;
    this.port = env.PORT;
    this.databaseUrl = env.DATABASE_URL;
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
    this.game = {
      timeScale: env.GAME_TIME_SCALE,
      departureEnabled: env.GAME_DEPARTURE,
      timezone: env.GAME_TIMEZONE,
    };
  }
}
