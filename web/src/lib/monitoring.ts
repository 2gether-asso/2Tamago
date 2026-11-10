import type { ClientConfig } from '@2tamago/core/contracts';

type SentryBrowser = typeof import('@sentry/browser');

/** Share of transactions sent for performance monitoring (1%). */
const TRACES_SAMPLE_RATE = 0.01;

let sentry: SentryBrowser | null = null;
/** Errors raised before the SDK finished loading, sent once it is ready. */
let pending: unknown[] = [];

/**
 * Browser error tracking, to Sentry or GlitchTip. A no-op without a DSN; the SDK is only
 * downloaded when there is one. Never throws: monitoring must not break the game.
 */
export async function startMonitoring(config: Pick<ClientConfig, 'sentryDsn'>): Promise<void> {
  if (!config.sentryDsn || sentry) return;
  try {
    const sdk = await import('@sentry/browser');
    sdk.init({
      dsn: config.sentryDsn,
      environment: import.meta.env.MODE,
      // Performance data (page loads, navigations): a small sample, adjust to the traffic.
      tracesSampleRate: TRACES_SAMPLE_RATE,
      // GlitchTip does not support sessions: drop the default session integration (v11 has no
      // `autoSessionTracking` option), and add browser tracing for the transactions.
      integrations: (defaults) => [
        ...defaults.filter((integration) => integration.name !== 'BrowserSession'),
        sdk.browserTracingIntegration(),
      ],
    });
    sentry = sdk;
    for (const error of pending) sdk.captureException(error);
    pending = [];
  } catch {
    pending = [];
  }
}

/** Reports an unexpected error (the SDK also catches uncaught errors and rejections itself). */
export function reportError(error: unknown): void {
  if (sentry) sentry.captureException(error);
  else if (pending.length < 20) pending.push(error);
}
