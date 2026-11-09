import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { simulate } from '@2tamago/core';
import type { PushKind } from '@2tamago/core/contracts';
import { and, eq, inArray, notInArray, sql } from 'drizzle-orm';
import { Clock } from '../common/clock.js';
import type { Database } from '../database/database.js';
import { pets, pushAlerts, pushSubscriptions } from '../database/schema.js';
import { GameRulesService } from '../game/game-rules.service.js';
import { pushKindsOf } from './push-alerts.js';
import { PushSender } from './push-sender.js';
import { PushService } from './push.service.js';

/** How often the pets of subscribed players are looked at. */
export const CHECK_INTERVAL_MS = 60_000;

/**
 * Watches the living pets of the players who enabled notifications and pushes when something
 * needs them. Each alert is sent once, when it starts (see `pushAlerts`); it can start again
 * after it ended. Reading is a preview of the simulation: nothing is saved here.
 */
@Injectable()
export class PushNotifier implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PushNotifier.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    @InjectDrizzle() private readonly db: Database,
    private readonly sender: PushSender,
    private readonly gameRules: GameRulesService,
    private readonly clock: Clock,
    private readonly push: PushService,
  ) {}

  onModuleInit() {
    if (!this.sender.enabled) return;
    this.timer = setInterval(() => void this.check(), CHECK_INTERVAL_MS);
    this.timer.unref();
  }

  onModuleDestroy() {
    clearInterval(this.timer);
  }

  /** One pass over the subscribed players. Public for tests; never throws. */
  async check(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.run();
    } catch (error) {
      this.logger.warn(`Push check failed: ${(error as Error).message}`);
    } finally {
      this.running = false;
    }
  }

  private async run(): Promise<void> {
    const now = this.clock.now();
    const rules = this.gameRules.current;
    const subscribed = this.db.select({ id: pushSubscriptions.playerId }).from(pushSubscriptions);
    const rows = await this.db
      .select({ ownerId: pets.ownerId, state: pets.state })
      .from(pets)
      .where(and(eq(pets.status, 'alive'), inArray(pets.ownerId, subscribed)));

    // An alert that ended, or whose pet is gone, may start again later.
    const owners = rows.map((row) => row.ownerId);
    await this.db
      .delete(pushAlerts)
      .where(owners.length > 0 ? notInArray(pushAlerts.playerId, owners) : sql`true`);

    for (const { ownerId, state } of rows) {
      try {
        const current = simulate(state, now, rules).state;
        await this.notifyPlayer(ownerId, current.name, pushKindsOf(current, now));
      } catch (error) {
        this.logger.warn(`Push for a player failed: ${(error as Error).message}`);
      }
    }
  }

  private async notifyPlayer(playerId: string, petName: string, active: PushKind[]): Promise<void> {
    const known = await this.db
      .select({ kind: pushAlerts.kind })
      .from(pushAlerts)
      .where(eq(pushAlerts.playerId, playerId));
    const knownKinds = known.map((row) => row.kind);

    const ended = knownKinds.filter((kind) => !active.includes(kind));
    if (ended.length > 0) {
      await this.db
        .delete(pushAlerts)
        .where(and(eq(pushAlerts.playerId, playerId), inArray(pushAlerts.kind, ended)));
    }

    for (const kind of active.filter((kind) => !knownKinds.includes(kind))) {
      // Claiming the row first: with several API instances, only one of them sends.
      const claimed = await this.db
        .insert(pushAlerts)
        .values({ playerId, kind })
        .onConflictDoNothing()
        .returning({ kind: pushAlerts.kind });
      if (claimed.length === 0) continue;
      const delivered = await this.push.notify(playerId, kind, petName);
      // Nobody got it (push service down, browser gone): try again at the next check.
      if (delivered === 0) {
        await this.db
          .delete(pushAlerts)
          .where(and(eq(pushAlerts.playerId, playerId), eq(pushAlerts.kind, kind)));
      }
    }
  }
}
