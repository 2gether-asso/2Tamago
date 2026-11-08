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
  PushSubscriptionBody,
  ClaimResponse,
  CommunityGoal,
  FavoriteResponse,
  WalkResponse,
} from '@2tamago/core/contracts';

import { hasMessage, t, type MessageKey } from './i18n/index.svelte.ts';
import { BASE } from './api-base.ts';
import { auth, SessionEnded } from './auth/index.ts';

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

async function send(method: string, path: string, body: unknown, token: string | null) {
  return fetch(BASE + path, {
    method,
    // No cookie is involved: the access token travels in a header.
    credentials: 'omit',
    headers: {
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

/** What a request says when the session is over: a 401 like any other, with the reason as code. */
function sessionEnded(ended: SessionEnded) {
  return ended.code === 'network'
    ? new ApiError(0, t('error.network'))
    : new ApiError(401, t('error.http', { status: 401 }), ended.code);
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  let response: Response;
  try {
    let token = await auth.accessToken();
    response = await send(method, path, body, token);
    if (response.status === 401 && token) {
      // The token may have been revoked or expired early: renew once and retry.
      token = await auth.accessToken(true);
      if (token) response = await send(method, path, body, token);
    }
  } catch (error) {
    if (error instanceof SessionEnded) throw sessionEnded(error);
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
  devLogin: (name: string) => auth.devLogin(name),
  logout: () => auth.signOut(),

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
  setFavorite: (playerId: string, favorite: boolean) =>
    call<FavoriteResponse>(favorite ? 'PUT' : 'DELETE', `/players/${playerId}/favorite`),
  village: () => call<VillagePet[]>('GET', '/village'),
  visit: (petId: string) => call<VisitResponse>('GET', `/village/${petId}`),
  caress: (petId: string) => call<ActionResponse>('POST', `/village/${petId}/caress`),
  gift: (petId: string, item: string) =>
    call<ActionResponse>('POST', `/village/${petId}/gift`, { item }),

  communityGoal: () => call<CommunityGoal>('GET', '/community/goal'),
  claimCommunityGoal: () => call<ClaimResponse>('POST', '/community/goal/claim'),

  pushSubscribe: (body: PushSubscriptionBody) => call<void>('PUT', '/push/subscription', body),
  pushUnsubscribe: (endpoint: string) => call<void>('DELETE', '/push/subscription', { endpoint }),
  pushTest: () => call<{ sent: number }>('POST', '/push/test'),

  activity: () => call<ActivityDto[]>('GET', '/activity'),
  adminStats: () => call<AdminStats>('GET', '/admin/stats'),
  adminRules: () => call<AdminRulesResponse>('GET', '/admin/rules'),
  saveAdminRules: (overrides: unknown) =>
    call<AdminRulesResponse>('PUT', '/admin/rules', overrides),

  markActivityRead: () => call<void>('POST', '/activity/read'),
};
