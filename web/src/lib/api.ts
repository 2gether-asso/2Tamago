import type { ContestKind, GameRules, ItemId, WalkZoneId } from '@2tamago/core';
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
  ContestBoard,
  PetWorkResponse,
  WorkResponse,
  WorkStatus,
  ContestClaimResponse,
  ContestsOverview,
  EventBody,
  EventsOverview,
  GameEventDto,
  BlockedWordsBody,
  ModerationLogEntry,
  ModerationPerson,
  GiftCodeBody,
  GiftCodeDto,
  RedeemResponse,
  TradeBody,
  TradeDto,
  TradeOverview,
  TradeResult,
  TradeTarget,
  WishAskBody,
  WishlistDto,
  CareActionBody,
  DaycareDto,
  DaycareOverview,
  PushSubscriptionBody,
  ClaimResponse,
  CommunityGoal,
  FavoriteResponse,
  WalkResponse,
  AccountOverview,
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

  account: () => call<AccountOverview>('GET', '/account'),
  renameSelf: (name: string) => call<void>('PUT', '/account/name', { name }),
  revokeSession: (id: string) => call<void>('DELETE', `/account/sessions/${id}`),
  revokeOtherSessions: () => call<void>('DELETE', '/account/sessions'),

  sendFeedback: (body: FeedbackBody) => call<void>('POST', '/feedback', body),
  clientConfig: () => call<ClientConfig>('GET', '/config'),
  rules: () => call<GameRules>('GET', '/game/rules'),
  me: () => call<MeResponse>('GET', '/me'),
  adopt: (body: AdoptBody) => call<PetDto>('POST', '/pet', body),
  act: (body: OwnerActionBody) => call<ActionResponse>('POST', '/pet/actions', body),
  startWalk: (zone: WalkZoneId) => call<ActionResponse>('POST', '/pet/walk', { zone }),
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

  daycare: () => call<DaycareOverview>('GET', '/daycare'),
  daycareInvite: (caretakerId: string) => call<DaycareDto>('POST', '/daycare', { caretakerId }),
  daycareAccept: (id: string) => call<DaycareDto>('POST', `/daycare/${id}/accept`),
  daycareDecline: (id: string) => call<void>('POST', `/daycare/${id}/decline`),
  daycareEnd: (id: string) => call<void>('DELETE', `/daycare/${id}`),
  daycareCare: (id: string, body: CareActionBody) =>
    call<ActionResponse>('POST', `/daycare/${id}/care`, body),

  trades: () => call<TradeOverview>('GET', '/trades'),
  tradeOffer: (body: TradeBody) => call<TradeDto>('POST', '/trades', body),
  tradeAccept: (id: string) => call<TradeResult>('POST', `/trades/${id}/accept`),
  tradeDecline: (id: string) => call<void>('POST', `/trades/${id}/decline`),
  tradeTarget: (playerId: string) => call<TradeTarget>('GET', `/trades/targets/${playerId}`),
  tradeCancel: (id: string) => call<void>('DELETE', `/trades/${id}`),

  wishlist: () => call<WishlistDto>('GET', '/wishlist'),
  setWishlist: (items: ItemId[]) => call<WishlistDto>('PUT', '/wishlist', { items }),
  wishAsk: (body: WishAskBody) => call<void>('POST', '/wishlist/ask', body),

  pushSubscribe: (body: PushSubscriptionBody) => call<void>('PUT', '/push/subscription', body),
  pushUnsubscribe: (endpoint: string) => call<void>('DELETE', '/push/subscription', { endpoint }),
  pushTest: () => call<{ sent: number }>('POST', '/push/test'),

  activity: () => call<ActivityDto[]>('GET', '/activity'),
  redeemCode: (code: string) => call<RedeemResponse>('POST', '/codes/redeem', { code }),
  adminCodes: () => call<GiftCodeDto[]>('GET', '/admin/codes'),
  adminCreateCode: (body: GiftCodeBody) => call<GiftCodeDto>('POST', '/admin/codes', body),
  adminDisableCode: (id: string) => call<void>('DELETE', `/admin/codes/${id}`),
  adminModerationSearch: (q: string) =>
    call<ModerationPerson[]>('GET', `/admin/moderation/search?q=${encodeURIComponent(q)}`),
  adminRenamePet: (petId: string, name: string) =>
    call<void>('PUT', `/admin/moderation/pets/${petId}/name`, { name }),
  adminRenamePlayer: (playerId: string, name: string) =>
    call<void>('PUT', `/admin/moderation/players/${playerId}/name`, { name }),
  adminUnlockPlayer: (playerId: string) =>
    call<void>('DELETE', `/admin/moderation/players/${playerId}/name`),
  adminBlockedWords: () => call<BlockedWordsBody>('GET', '/admin/moderation/blocked-words'),
  adminSaveBlockedWords: (words: string[]) =>
    call<BlockedWordsBody>('PUT', '/admin/moderation/blocked-words', { words }),
  adminModerationLog: () => call<ModerationLogEntry[]>('GET', '/admin/moderation/log'),
  events: () => call<EventsOverview>('GET', '/events'),
  adminEvents: () => call<GameEventDto[]>('GET', '/admin/events'),
  adminCreateEvent: (body: EventBody) => call<GameEventDto>('POST', '/admin/events', body),
  adminCancelEvent: (id: string) => call<void>('DELETE', `/admin/events/${id}`),
  contests: () => call<ContestsOverview>('GET', '/contests'),
  contestEnter: (kind: ContestKind) => call<ContestBoard>('POST', '/contests/enter', { kind }),
  contestVote: (playerId: string) => call<ContestBoard>('POST', '/contests/vote', { playerId }),
  contestClaim: (kind: ContestKind) =>
    call<ContestClaimResponse>('POST', `/contests/${kind}/claim`),
  work: () => call<WorkStatus>('GET', '/work'),
  workPlayer: (score: number) => call<WorkResponse>('POST', '/work/player', { score }),
  workPet: () => call<PetWorkResponse>('POST', '/work/pet'),
  adminStats: () => call<AdminStats>('GET', '/admin/stats'),
  adminRules: () => call<AdminRulesResponse>('GET', '/admin/rules'),
  saveAdminRules: (overrides: unknown) =>
    call<AdminRulesResponse>('PUT', '/admin/rules', overrides),

  markActivityRead: () => call<void>('POST', '/activity/read'),
};
