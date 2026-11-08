import type { GameRules } from '@2tamago/core';
import type {
  ActionResponse,
  AdminRulesResponse,
  AdminStats,
  ActivityDto,
  AdoptBody,
  AlbumEntry,
  ApiErrorBody,
  ClientConfig,
  FeedbackBody,
  BuyBody,
  Inventory,
  MeResponse,
  OwnerActionBody,
  PetDto,
  PlayerProfile,
  VillagePet,
  VisitResponse,
  WalkResponse,
} from '@2tamago/core/contracts';

import { hasMessage, t, type MessageKey } from './i18n/index.svelte.ts';

/**
 * The API lives on its own origin in production (`VITE_API_URL`, set at build time, for example
 * `https://api.example.org`). Without it the app uses the same origin: Vite proxies `/api` in development.
 */
const BASE = `${(import.meta.env.VITE_API_URL ?? '').replace(/\/+$/, '')}/api`;

/** The message to show for an API error: translated from its `code` when we know it. */
function errorMessage(status: number, code: string | undefined, serverMessage: string | undefined) {
  if (code && hasMessage(`error.${code}`)) return t(`error.${code}` as MessageKey);
  if (status === 400) return t('error.invalid_input');
  return serverMessage ?? t('error.http', { status });
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string,
  ) {
    super(message);
  }
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(BASE + path, {
      method,
      credentials: 'include',
      headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, t('error.network'));
  }
  if (response.status === 204) return undefined as T;
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const error = data as ApiErrorBody | null;
    const message = Array.isArray(error?.message) ? error.message.join(', ') : error?.message;
    throw new ApiError(
      response.status,
      errorMessage(response.status, error?.code, message),
      error?.code,
    );
  }
  return data as T;
}

export const api = {
  authConfig: () =>
    call<{ discord: boolean; devLogin: boolean; inviteUrl: string | null }>('GET', '/auth/config'),
  devLogin: (name: string) => call<{ token: string }>('POST', '/auth/dev-login', { name }),
  logout: () => call<void>('POST', '/auth/logout'),
  discordLoginUrl: `${BASE}/auth/discord`,

  sendFeedback: (body: FeedbackBody) => call<void>('POST', '/feedback', body),
  clientConfig: () => call<ClientConfig>('GET', '/config'),
  rules: () => call<GameRules>('GET', '/game/rules'),
  me: () => call<MeResponse>('GET', '/me'),
  adopt: (body: AdoptBody) => call<PetDto>('POST', '/pet', body),
  act: (body: OwnerActionBody) => call<ActionResponse>('POST', '/pet/actions', body),
  startWalk: () => call<ActionResponse>('POST', '/pet/walk'),
  returnFromWalk: () => call<WalkResponse>('POST', '/pet/walk/return'),
  album: () => call<AlbumEntry[]>('GET', '/album'),

  buy: (body: BuyBody) => call<{ coins: number; inventory: Inventory }>('POST', '/shop/buy', body),

  playerProfile: (playerId: string) => call<PlayerProfile>('GET', `/players/${playerId}`),
  village: () => call<VillagePet[]>('GET', '/village'),
  visit: (petId: string) => call<VisitResponse>('GET', `/village/${petId}`),
  caress: (petId: string) => call<ActionResponse>('POST', `/village/${petId}/caress`),
  gift: (petId: string, item: string) =>
    call<ActionResponse>('POST', `/village/${petId}/gift`, { item }),

  activity: () => call<ActivityDto[]>('GET', '/activity'),
  adminStats: () => call<AdminStats>('GET', '/admin/stats'),
  adminRules: () => call<AdminRulesResponse>('GET', '/admin/rules'),
  saveAdminRules: (overrides: unknown) =>
    call<AdminRulesResponse>('PUT', '/admin/rules', overrides),

  markActivityRead: () => call<void>('POST', '/activity/read'),
};
