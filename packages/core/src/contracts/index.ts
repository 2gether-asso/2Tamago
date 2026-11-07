/**
 * API contracts shared by the API (request validation) and the web app (typed
 * client). Request bodies are Zod schemas; responses are plain types.
 */
import { z } from 'zod';
import { ITEM_IDS, type ItemId } from '../engine/catalog.js';
import type { Alert, Mood } from '../engine/view.js';
import {
  SPECIES,
  TRICKS,
  type Form,
  type PetEvent,
  type PetState,
  type Species,
  type Stage,
} from '../engine/types.js';

const itemId = z.enum(ITEM_IDS as [ItemId, ...ItemId[]]);
const petName = z
  .string()
  .trim()
  .min(1)
  .max(20)
  .regex(/^[\p{L}\p{N} '’-]+$/u, 'Lettres, chiffres, espaces et tirets uniquement');

// ---------------------------------------------------------------- requests

export const devLoginBody = z.object({
  name: z.string().trim().min(2).max(32),
});
export type DevLoginBody = z.infer<typeof devLoginBody>;

export const adoptBody = z.object({
  name: petName,
  species: z.enum(SPECIES),
  color: z.number().int().min(0).max(359),
});
export type AdoptBody = z.infer<typeof adoptBody>;

export const ownerActionBody = z.discriminatedUnion('type', [
  z.object({ type: z.literal('feed') }),
  z.object({ type: z.literal('treat'), item: itemId }),
  z.object({ type: z.literal('play'), score: z.number().int().min(0).max(3) }),
  z.object({ type: z.literal('clean') }),
  z.object({ type: z.literal('medicine') }),
  z.object({ type: z.literal('sleep') }),
  z.object({ type: z.literal('wake') }),
  z.object({ type: z.literal('praise') }),
  z.object({ type: z.literal('scold') }),
  z.object({ type: z.literal('caress') }),
  z.object({ type: z.literal('train'), trick: z.enum(TRICKS) }),
  z.object({ type: z.literal('equip'), item: itemId.nullable() }),
  z.object({ type: z.literal('retire') }),
]);
export type OwnerActionBody = z.infer<typeof ownerActionBody>;

export const buyBody = z.object({
  item: itemId,
  quantity: z.number().int().min(1).max(20).default(1),
});
export type BuyBody = z.infer<typeof buyBody>;

export const giftBody = z.object({ item: itemId });
export type GiftBody = z.infer<typeof giftBody>;

export const uuidParam = z.uuid();

// --------------------------------------------------------------- responses

export interface PlayerDto {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  coins: number;
  isAdmin: boolean;
}

export interface PetDto {
  id: string;
  ownerId: string;
  ownerName: string;
  state: PetState;
  mood: Mood;
  alerts: Alert[];
}

export type Inventory = Partial<Record<ItemId, number>>;

export interface MeResponse {
  player: PlayerDto;
  pet: PetDto | null;
  inventory: Inventory;
  /** Server clock, so the client can correct its own when predicting. */
  serverTime: number;
}

export interface ActionResponse {
  pet: PetDto;
  events: PetEvent[];
  coins: number;
  /** Short French messages to show as toasts. */
  notices: string[];
}

export interface WalkEncounter {
  petId: string;
  name: string;
  species: Species;
  color: number;
  ownerName: string;
}

export interface WalkResponse extends ActionResponse {
  found: { coins: number; items: ItemId[] };
  encounters: WalkEncounter[];
}

export interface VillagePet {
  petId: string;
  name: string;
  species: Species;
  stage: Stage;
  form: Form | null;
  color: number;
  equipped: string | null;
  mood: Mood;
  ownerName: string;
  caressedToday: boolean;
}

export interface VisitResponse {
  pet: PetDto;
  caressedToday: boolean;
}

export type ActivityKind =
  'pet_event' | 'visit_caress' | 'visit_gift' | 'encounter' | 'daily_bonus';

export interface ActivityDto {
  id: string;
  kind: ActivityKind;
  data: Record<string, unknown>;
  createdAt: number;
  read: boolean;
}

export interface AlbumEntry {
  petId: string;
  name: string;
  species: Species;
  stage: Stage;
  form: Form | null;
  color: number;
  status: 'gone' | 'retired';
  bornAt: number;
  endedAt: number | null;
}

export interface ApiErrorBody {
  statusCode: number;
  message: string | string[];
  code?: string;
}
