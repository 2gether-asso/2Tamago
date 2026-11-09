import { Injectable, Logger } from '@nestjs/common';
import type { EventKind, Form, PetEvent, Species, Stage } from '@2tamago/core';
import { Clock } from '../common/clock.js';
import { AnnouncementSender } from './announcement-sender.js';
import { texts } from './announcement-texts.js';

/** At most this many messages in a window: a safety net against a flood, whatever the cause. */
export const MAX_MESSAGES = 20;
export const WINDOW_MS = 10 * 60_000;

export interface PetRef {
  petName: string;
  ownerName: string;
}

/**
 * What the community channel hears about: new players, hatchings, growth, and the first walk
 * two players share. Everything else stays in the game, to keep the channel readable.
 * Calls are fire-and-forget and safe to make without a webhook configured.
 */
@Injectable()
export class AnnouncementService {
  private readonly logger = new Logger(AnnouncementService.name);
  private sent: number[] = [];
  private dropping = false;

  constructor(
    private readonly sender: AnnouncementSender,
    private readonly clock: Clock,
  ) {}

  newPlayer(name: string): void {
    this.post(texts.newPlayer(name));
  }

  /** Announces the hatching and growth in `events`, for a pet that was just saved. */
  petEvents(
    pet: PetRef & { species: Species; form: Form | null },
    events: readonly PetEvent[],
  ): void {
    for (const event of events) {
      if (event.type === 'hatched') {
        this.post(texts.hatched(pet.petName, pet.ownerName, pet.species));
      } else if (event.type === 'evolved') {
        this.post(texts.evolved(pet.petName, pet.ownerName, event.data?.to as Stage, pet.form));
      }
    }
  }

  /** Only for two players who had never met on a walk before. */
  firstMeeting(a: PetRef, b: PetRef): void {
    this.post(texts.firstMeeting(a.petName, a.ownerName, b.petName, b.ownerName));
  }

  /** An admin scheduled an event: the community should know. */
  event(kind: EventKind, percent: number, startsAt: number, endsAt: number): void {
    this.post(texts.event(kind, percent, startsAt, endsAt));
  }

  /** The village reached its weekly walk target. */
  communityGoal(walks: number): void {
    this.post(texts.communityGoal(walks));
  }

  private post(text: string): void {
    if (!this.sender.enabled) return;
    const now = this.clock.now();
    this.sent = this.sent.filter((time) => now - time < WINDOW_MS);
    if (this.sent.length >= MAX_MESSAGES) {
      if (!this.dropping) this.logger.warn('Too many announcements: dropping some');
      this.dropping = true;
      return;
    }
    this.dropping = false;
    this.sent.push(now);
    void this.sender.send(text);
  }
}
