import { bestPercent, type EventKind } from '@2tamago/core';
import type { EventsOverview } from '@2tamago/core/contracts';
import { api } from './api.ts';

const REFRESH_MS = 5 * 60_000;

/** The bonuses on now and announced: loaded once, and again now and then. */
class EventsStore {
  overview = $state.raw<EventsOverview>({ active: [], upcoming: [] });
  #timer: ReturnType<typeof setInterval> | null = null;

  async load(): Promise<void> {
    try {
      this.overview = await api.events();
    } catch {
      // The banner is only a courtesy: the server applies the bonuses either way.
    }
  }

  /** Starts refreshing (once). */
  start(): void {
    if (this.#timer) return;
    void this.load();
    this.#timer = setInterval(() => void this.load(), REFRESH_MS);
  }

  stop(): void {
    if (this.#timer) clearInterval(this.#timer);
    this.#timer = null;
    this.overview = { active: [], upcoming: [] };
  }

  /** The bonus of the moment for a kind, in percent (0: none). */
  percent(kind: EventKind): number {
    return bestPercent(this.overview.active, kind);
  }
}

export const events = new EventsStore();
