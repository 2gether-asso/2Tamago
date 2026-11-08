import type { ClientConfig } from '@2tamago/core/contracts';
import { api } from './api.ts';

/** Public settings of the server (error tracking DSN, feedback availability), loaded once. */
class ClientConfigStore {
  value = $state.raw<ClientConfig | null>(null);
  private loading: Promise<ClientConfig | null> | null = null;

  load(): Promise<ClientConfig | null> {
    this.loading ??= api
      .clientConfig()
      .then((config) => (this.value = config))
      .catch(() => null);
    return this.loading;
  }

  get feedbackEnabled(): boolean {
    return this.value?.feedbackEnabled ?? false;
  }
}

export const clientConfig = new ClientConfigStore();
