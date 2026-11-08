import { Injectable, Logger } from '@nestjs/common';
import { AppConfig } from '../config/app-config.js';

/** Delivers an announcement to the community channel. Abstract so tests can capture messages. */
export abstract class AnnouncementSender {
  abstract readonly enabled: boolean;
  /** Never throws: a channel that is down must not disturb the game. */
  abstract send(text: string): Promise<void>;
}

/** Posts to a Discord channel webhook (`DISCORD_WEBHOOK_URL`). */
@Injectable()
export class WebhookSender extends AnnouncementSender {
  private readonly logger = new Logger(WebhookSender.name);

  constructor(private readonly config: AppConfig) {
    super();
  }

  override get enabled(): boolean {
    return this.config.discordWebhookUrl !== undefined;
  }

  override async send(text: string): Promise<void> {
    const url = this.config.discordWebhookUrl;
    if (!url) return;
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: '2Tamago',
          content: text,
          // Names come from players: they must never ping anyone.
          allowed_mentions: { parse: [] },
        }),
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) this.logger.warn(`Discord webhook answered ${response.status}`);
    } catch (error) {
      this.logger.warn(`Discord webhook failed: ${(error as Error).message}`);
    }
  }
}
