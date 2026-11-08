import type { ClientInit, HandleClientError } from '@sveltejs/kit/hooks';
import { clientConfig } from '#lib/client-config.svelte.ts';
import { reportError, startMonitoring } from '#lib/monitoring.ts';

export const init: ClientInit = async () => {
  const config = await clientConfig.load();
  if (config) await startMonitoring(config);
};

/** Errors thrown by our own code while navigating or rendering (404s and `error()` are expected). */
export const handleError: HandleClientError = ({ kind, error }) => {
  if (kind === 'unknown') reportError(error);
};
