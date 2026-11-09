import { ConflictException, Injectable } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import type { PushKind, PushPayload, PushSubscriptionBody } from '@2tamago/core/contracts';
import { and, eq, inArray } from 'drizzle-orm';
import { AppConfig } from '../config/app-config.js';
import type { Database } from '../database/database.js';
import { pets, pushSubscriptions } from '../database/schema.js';
import { PushSender } from './push-sender.js';

/** The browsers that receive a player's notifications. */
@Injectable()
export class PushService {
  constructor(
    @InjectDrizzle() private readonly db: Database,
    private readonly config: AppConfig,
    private readonly sender: PushSender,
  ) {}

  /** Registers a browser for the player; a browser already known moves to the current player. */
  async subscribe(playerId: string, body: PushSubscriptionBody): Promise<void> {
    this.assertEnabled();
    const values = {
      playerId,
      endpoint: body.endpoint,
      p256dh: body.keys.p256dh,
      auth: body.keys.auth,
      locale: body.locale,
    };
    await this.db
      .insert(pushSubscriptions)
      .values(values)
      .onConflictDoUpdate({ target: pushSubscriptions.endpoint, set: values });
  }

  async unsubscribe(playerId: string, endpoint: string): Promise<void> {
    await this.db
      .delete(pushSubscriptions)
      .where(
        and(eq(pushSubscriptions.playerId, playerId), eq(pushSubscriptions.endpoint, endpoint)),
      );
  }

  /** Sends one message to every browser of the player. Returns how many accepted it. */
  async notify(
    playerId: string,
    kind: PushKind,
    petName: string,
    playerName?: string,
  ): Promise<number> {
    if (!this.sender.enabled) return 0;
    const subscriptions = await this.db
      .select()
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.playerId, playerId));
    let sent = 0;
    const gone: string[] = [];
    for (const subscription of subscriptions) {
      const payload: PushPayload = {
        kind,
        petName,
        ...(playerName === undefined ? {} : { playerName }),
        locale: subscription.locale,
      };
      const result = await this.sender.send(subscription, payload);
      if (result === 'sent') sent += 1;
      else if (result === 'gone') gone.push(subscription.id);
    }
    if (gone.length > 0) {
      await this.db.delete(pushSubscriptions).where(inArray(pushSubscriptions.id, gone));
    }
    return sent;
  }

  /** The test notification of the settings: to the player's browsers, with their pet's name. */
  async test(playerId: string): Promise<number> {
    this.assertEnabled();
    const [pet] = await this.db
      .select({ state: pets.state })
      .from(pets)
      .where(and(eq(pets.ownerId, playerId), eq(pets.status, 'alive')));
    return this.notify(playerId, 'test', pet?.state.name ?? '');
  }

  private assertEnabled(): void {
    if (!this.config.push) {
      throw new ConflictException({ statusCode: 409, code: 'push_disabled' });
    }
  }
}
