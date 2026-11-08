import {
  alertsOf,
  moodOf,
  simulate,
  type GameRules,
  type PetEvent,
  type PetState,
} from '@2tamago/core';
import type {
  ActionResponse,
  Inventory,
  OwnerActionBody,
  PetDto,
  PlayerDto,
} from '@2tamago/core/contracts';
import { api, ApiError } from './api.ts';
import { eventText, noticeText } from './texts.ts';
import { toasts } from './toasts.svelte.ts';

const REFRESH_MS = 60_000;

/**
 * Client-side game state. The API is the authority; between two calls the web
 * app runs the same simulation as the server (`@2tamago/core`) so stat bars
 * move smoothly without polling.
 */
class Game {
  player = $state<PlayerDto | null>(null);
  inventory = $state<Inventory>({});
  rules = $state<GameRules | null>(null);
  /** Last pet received from the API. */
  snapshot = $state.raw<PetDto | null>(null);
  /** Server time minus local time. */
  clockOffset = $state(0);
  now = $state(Date.now());
  busy = $state(false);
  loaded = $state(false);

  /** The pet as it is now, predicted locally from the last snapshot. */
  pet: PetState | null = $derived.by(() => {
    if (!this.snapshot) return null;
    if (!this.rules) return this.snapshot.state;
    return simulate(this.snapshot.state, this.now + this.clockOffset, this.rules).state;
  });
  mood = $derived(this.pet ? moodOf(this.pet) : null);
  alerts = $derived(this.pet ? alertsOf(this.pet) : []);

  #timers: ReturnType<typeof setInterval>[] = [];
  #lastHatchSync = 0;

  /** Loads everything; resolves to false when the player is not signed in. */
  async load(): Promise<boolean> {
    try {
      const [me, rules] = await Promise.all([api.me(), this.rules ?? api.rules()]);
      this.rules = rules;
      this.player = me.player;
      this.inventory = me.inventory;
      this.snapshot = me.pet;
      this.clockOffset = me.serverTime - Date.now();
      this.loaded = true;
      this.#startTimers();
      return true;
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) return false;
      throw error;
    }
  }

  async refresh(): Promise<void> {
    if (this.player) await this.load();
  }

  async act(action: OwnerActionBody): Promise<ActionResponse | null> {
    const result = await this.#run(() => api.act(action));
    if (result && action.type === 'treat') this.#addItem(action.item, -1);
    return result;
  }

  async adopt(name: string, species: PetState['species'], color: number): Promise<void> {
    await this.#run(async () => {
      this.snapshot = await api.adopt({ name, species, color });
    });
  }

  async startWalk() {
    return this.#run(() => api.startWalk());
  }

  async returnFromWalk() {
    const result = await this.#run(() => api.returnFromWalk());
    for (const item of result?.found.items ?? []) this.#addItem(item, 1);
    return result;
  }

  /** After giving a treat to another player's pet. */
  useItem(item: keyof Inventory): void {
    this.#addItem(item, -1);
  }

  #addItem(item: keyof Inventory, delta: number): void {
    this.inventory = {
      ...this.inventory,
      [item]: Math.max(0, (this.inventory[item] ?? 0) + delta),
    };
  }

  async buy(item: keyof Inventory, quantity = 1) {
    await this.#run(async () => {
      const result = await api.buy({ item, quantity });
      if (this.player) this.player.coins = result.coins;
      this.inventory = result.inventory;
      toasts.push('Merci pour ton achat !');
    });
  }

  /** Applies a response that carries a pet (owner actions, walks). */
  applyResponse(response: ActionResponse): void {
    if (this.player) this.player.coins = response.coins;
    if (response.pet.ownerId === this.player?.id) {
      this.snapshot = response.pet;
      this.#announce(response.events, response.pet.state.name);
    }
    for (const notice of response.notices) toasts.push(noticeText(notice));
  }

  signOut(): void {
    for (const timer of this.#timers) clearInterval(timer);
    this.#timers = [];
    this.player = null;
    this.snapshot = null;
    this.loaded = false;
  }

  async #run<T>(task: () => Promise<T>): Promise<T | null> {
    this.busy = true;
    try {
      const result = await task();
      if (result && typeof result === 'object' && 'pet' in result && 'coins' in result) {
        this.applyResponse(result as unknown as ActionResponse);
      }
      return result;
    } catch (error) {
      toasts.push(error instanceof Error ? error.message : String(error), 'error');
      return null;
    } finally {
      this.busy = false;
    }
  }

  #announce(events: PetEvent[], name: string): void {
    for (const event of events) {
      const text = eventText(event, name);
      if (text && event.type !== 'woke_up' && event.type !== 'fell_asleep') toasts.push(text);
    }
  }

  /**
   * The API hides an egg's traits, so a pet that hatched in our local prediction has none yet:
   * ask the server for the real state (at most once every 5 s while they disagree).
   */
  #syncHatching(): void {
    if (this.snapshot?.state.stage !== 'egg' || !this.pet || this.pet.stage === 'egg') return;
    if (this.now - this.#lastHatchSync < 5000) return;
    this.#lastHatchSync = this.now;
    void this.refresh().catch(() => {});
  }

  #startTimers(): void {
    if (this.#timers.length > 0) return;
    this.#timers.push(
      setInterval(() => {
        this.now = Date.now();
        this.#syncHatching();
      }, 1000),
    );
    this.#timers.push(setInterval(() => void this.refresh().catch(() => {}), REFRESH_MS));
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void this.refresh().catch(() => {});
    });
  }
}

export const game = new Game();
