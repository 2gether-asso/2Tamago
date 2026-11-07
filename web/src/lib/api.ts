import type { GameRules } from '@2tamago/core';
import type {
  ActionResponse,
  ActivityDto,
  AdoptBody,
  AlbumEntry,
  ApiErrorBody,
  BuyBody,
  Inventory,
  MeResponse,
  OwnerActionBody,
  PetDto,
  VillagePet,
  VisitResponse,
  WalkResponse,
} from '@2tamago/core/contracts';

/** Same origin: Vite proxies `/api` in development, Caddy in production. */
const BASE = '/api';

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
      credentials: 'same-origin',
      headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'Le serveur est injoignable. Réessaie dans un instant.');
  }
  if (response.status === 204) return undefined as T;
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const error = data as ApiErrorBody | null;
    const message = Array.isArray(error?.message) ? error.message.join(', ') : error?.message;
    throw new ApiError(response.status, message ?? `Erreur ${response.status}`, error?.code);
  }
  return data as T;
}

export const api = {
  authConfig: () => call<{ discord: boolean; devLogin: boolean }>('GET', '/auth/config'),
  devLogin: (name: string) => call<{ token: string }>('POST', '/auth/dev-login', { name }),
  logout: () => call<void>('POST', '/auth/logout'),
  discordLoginUrl: `${BASE}/auth/discord`,

  rules: () => call<GameRules>('GET', '/game/rules'),
  me: () => call<MeResponse>('GET', '/me'),
  adopt: (body: AdoptBody) => call<PetDto>('POST', '/pet', body),
  act: (body: OwnerActionBody) => call<ActionResponse>('POST', '/pet/actions', body),
  startWalk: () => call<ActionResponse>('POST', '/pet/walk'),
  returnFromWalk: () => call<WalkResponse>('POST', '/pet/walk/return'),
  album: () => call<AlbumEntry[]>('GET', '/album'),

  buy: (body: BuyBody) => call<{ coins: number; inventory: Inventory }>('POST', '/shop/buy', body),

  village: () => call<VillagePet[]>('GET', '/village'),
  visit: (petId: string) => call<VisitResponse>('GET', `/village/${petId}`),
  caress: (petId: string) => call<ActionResponse>('POST', `/village/${petId}/caress`),
  gift: (petId: string, item: string) =>
    call<ActionResponse>('POST', `/village/${petId}/gift`, { item }),

  activity: () => call<ActivityDto[]>('GET', '/activity'),
  markActivityRead: () => call<void>('POST', '/activity/read'),
};
