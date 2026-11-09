import { TRADE_LIMITS, type ItemId } from '@2tamago/core';
import { api } from './api.ts';
import { toasts } from './toasts.svelte.ts';

/** The viewer's wishlist: the items they would like to get from other members. */
class Wishlist {
  items = $state.raw<ItemId[]>([]);
  loaded = $state(false);
  busy = $state(false);

  readonly max = TRADE_LIMITS.maxWishlist;

  async load(): Promise<void> {
    if (this.loaded) return;
    try {
      this.items = (await api.wishlist()).items;
      this.loaded = true;
    } catch {
      // The shop works without it.
    }
  }

  has(id: ItemId): boolean {
    return this.items.includes(id);
  }

  async toggle(id: ItemId): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      const next = this.has(id) ? this.items.filter((item) => item !== id) : [...this.items, id];
      this.items = (await api.setWishlist(next)).items;
    } catch (e) {
      toasts.push((e as Error).message, 'error');
    } finally {
      this.busy = false;
    }
  }
}

export const wishlist = new Wishlist();
