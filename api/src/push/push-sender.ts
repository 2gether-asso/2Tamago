import { Injectable, Logger } from '@nestjs/common';
import type { PushPayload } from '@2tamago/core/contracts';
import webpush from 'web-push';
import { AppConfig } from '../config/app-config.js';

export interface PushTarget {
  endpoint: string;
  p256dh: string;
  auth: string;
}

/** `gone`: the browser unsubscribed (or the subscription expired), so it can be forgotten. */
export type PushResult = 'sent' | 'gone' | 'failed';

/** Delivers a push message to one browser. Abstract so tests can capture the messages. */
export abstract class PushSender {
  abstract readonly enabled: boolean;
  /** Never throws: a push service that is down must not disturb the game. */
  abstract send(target: PushTarget, payload: PushPayload): Promise<PushResult>;
}

/** A notification is stale after this long (the pet's state has changed by then). */
const TTL_SECONDS = 2 * 3600;

/** Sends through the browsers' push services, signed with the VAPID keys. */
@Injectable()
export class WebPushSender extends PushSender {
  private readonly logger = new Logger(WebPushSender.name);

  constructor(private readonly config: AppConfig) {
    super();
  }

  override get enabled(): boolean {
    return this.config.push !== null;
  }

  override async send(target: PushTarget, payload: PushPayload): Promise<PushResult> {
    const push = this.config.push;
    if (!push) return 'failed';
    try {
      await webpush.sendNotification(
        { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
        JSON.stringify(payload),
        {
          vapidDetails: {
            subject: push.subject,
            publicKey: push.publicKey,
            privateKey: push.privateKey,
          },
          TTL: TTL_SECONDS,
          // A newer message of the same kind replaces the one still waiting in the push service.
          topic: payload.kind,
          timeout: 5000,
        },
      );
      return 'sent';
    } catch (error) {
      const status = (error as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) return 'gone';
      this.logger.warn(`Push failed${status ? ` (${status})` : ''}: ${(error as Error).message}`);
      return 'failed';
    }
  }
}
