import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { eq } from 'drizzle-orm';
import { applyRulesOverrides, withRules, type GameRules, type RulesOverrides } from '@2tamago/core';
import { rulesOverridesBody } from '@2tamago/core/contracts';
import { Clock, utcOffsetHours } from '../common/clock.js';
import { AppConfig } from '../config/app-config.js';
import type { Database } from '../database/database.js';
import { gameSettings } from '../database/schema.js';

const KEY = 'rules';
/** Other API instances pick up an admin change within this delay. */
const REFRESH_MS = 30_000;

/**
 * The game rules in use: the defaults and environment (`base`), plus the overrides an admin stored
 * in the database. `current` is synchronous and always up to date for this instance.
 */
@Injectable()
export class GameRulesService implements OnModuleInit, OnModuleDestroy {
  base: GameRules;
  private overrides: RulesOverrides = {};
  private effective: GameRules;
  private timer?: NodeJS.Timeout;

  constructor(
    @InjectDrizzle() private readonly db: Database,
    private readonly config: AppConfig,
    private readonly clock: Clock,
  ) {
    this.base = this.buildBase();
    this.effective = this.base;
  }

  get current(): GameRules {
    return this.effective;
  }

  get state() {
    return { base: this.base, overrides: this.overrides, effective: this.effective };
  }

  async onModuleInit() {
    await this.reload();
    this.timer = setInterval(() => void this.reload().catch(() => {}), REFRESH_MS);
    this.timer.unref();
  }

  onModuleDestroy() {
    clearInterval(this.timer);
  }

  /** Replaces all the overrides (an empty object goes back to the defaults). */
  async save(overrides: RulesOverrides) {
    await this.db
      .insert(gameSettings)
      .values({ key: KEY, value: overrides })
      .onConflictDoUpdate({
        target: gameSettings.key,
        set: { value: overrides, updatedAt: new Date() },
      });
    this.apply(overrides);
    return this.state;
  }

  private async reload() {
    const [row] = await this.db.select().from(gameSettings).where(eq(gameSettings.key, KEY));
    // A stored value that no longer validates (e.g. a removed rule) is ignored, not fatal.
    const parsed = rulesOverridesBody.safeParse(row?.value ?? {});
    this.apply(parsed.success ? parsed.data : {});
  }

  /** Defaults and environment. The night follows the wall clock of `GAME_TIMEZONE`, daylight saving included. */
  private buildBase(): GameRules {
    const night = {
      ...withRules().night,
      clockOffsetHours: utcOffsetHours(this.clock.now(), this.config.game.timezone),
    };
    return withRules({
      timeScale: this.config.game.timeScale,
      departureEnabled: this.config.game.departureEnabled,
      night,
    });
  }

  private apply(overrides: RulesOverrides) {
    this.base = this.buildBase();
    this.overrides = overrides;
    this.effective = applyRulesOverrides(this.base, overrides);
  }
}
