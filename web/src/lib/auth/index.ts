import type { AuthErrorCode, TokenResponse } from '@2tamago/core/contracts';
import { BASE } from '../api-base.ts';
import { createProof, generateKey } from './dpop.ts';
import { newPkce } from './pkce.ts';
import { clearSession, keepVerifier, loadSession, saveSession, takeVerifier } from './store.ts';

/** The API refused to continue this session: the player has to sign in again. */
export class SessionEnded extends Error {
  constructor(readonly code: AuthErrorCode | 'network') {
    super(code);
  }
}

/** Renew this long before the access token expires, so requests never meet an expired one. */
const RENEW_MARGIN_MS = 60_000;

/**
 * The access token lives here, in memory only: a reload starts without one and renews it from
 * the refresh token. The refresh token and the key it is bound to are in IndexedDB (store.ts).
 */
let accessToken: string | null = null;
let expiresAt = 0;
let renewing: Promise<string | null> | null = null;
/** Why the last session ended, for the login page to explain. */
let lastEnd: AuthErrorCode | null = null;

async function post(path: string, body: unknown, key: CryptoKeyPair, bearer?: string) {
  const url = `${BASE}${path}`;
  return fetch(url, {
    method: 'POST',
    credentials: 'omit',
    headers: {
      'Content-Type': 'application/json',
      DPoP: await createProof(key, 'POST', url),
      ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

async function adopt(tokens: TokenResponse, key: CryptoKeyPair, refreshToken?: string) {
  accessToken = tokens.access_token;
  expiresAt = Date.now() + tokens.expires_in * 1000;
  lastEnd = null;
  const next = tokens.refresh_token ?? refreshToken;
  if (next) await saveSession({ refreshToken: next, key });
}

async function end(code: AuthErrorCode): Promise<never> {
  accessToken = null;
  expiresAt = 0;
  lastEnd = code;
  await clearSession();
  throw new SessionEnded(code);
}

async function readError(response: Response): Promise<AuthErrorCode> {
  const body = (await response.json().catch(() => null)) as { code?: AuthErrorCode } | null;
  return body?.code ?? 'invalid_grant';
}

/** Renews the access token. Two tabs never do it at the same time (Web Locks). */
async function renew(): Promise<string | null> {
  const work = async (): Promise<string | null> => {
    // Another tab may have renewed while we waited for the lock.
    if (accessToken && Date.now() < expiresAt - RENEW_MARGIN_MS) return accessToken;
    const stored = await loadSession();
    if (!stored) return null;
    let response: Response;
    try {
      response = await post('/auth/refresh', { refresh_token: stored.refreshToken }, stored.key);
    } catch {
      // Offline or the API is down: the session is fine, only this call fails.
      throw new SessionEnded('network');
    }
    if (response.status === 401) return end(await readError(response));
    if (!response.ok) throw new SessionEnded('network');
    await adopt((await response.json()) as TokenResponse, stored.key, stored.refreshToken);
    return accessToken;
  };
  return navigator.locks ? navigator.locks.request('tamago-auth-renew', work) : work();
}

export const auth = {
  /**
   * A valid access token, renewed first if it is about to expire (or `force`d, after a 401).
   * Null when nobody is signed in. Throws `SessionEnded` when the API ends the session.
   */
  async accessToken(force = false): Promise<string | null> {
    if (!force && accessToken && Date.now() < expiresAt - RENEW_MARGIN_MS) return accessToken;
    renewing ??= renew().finally(() => {
      renewing = null;
    });
    return renewing;
  },

  /** Why the session ended, once: the login page explains it. */
  takeEnd(): AuthErrorCode | null {
    const code = lastEnd;
    lastEnd = null;
    return code;
  },

  /** Starts the Discord sign-in: keeps a PKCE secret, then leaves for the API (and Discord). */
  async beginDiscord(): Promise<void> {
    const { verifier, challenge } = await newPkce();
    keepVerifier(verifier);
    location.assign(`${BASE}/auth/discord?code_challenge=${challenge}`);
  },

  /** Back from Discord: trades the one-time code for tokens. */
  async finishDiscord(code: string): Promise<void> {
    const verifier = takeVerifier();
    if (!verifier) throw new SessionEnded('invalid_grant');
    const key = await generateKey();
    const response = await post('/auth/token', { code, code_verifier: verifier }, key);
    if (!response.ok) throw new SessionEnded(await readError(response));
    await adopt((await response.json()) as TokenResponse, key);
  },

  /** Development only: a session from just a name. */
  async devLogin(name: string): Promise<void> {
    const key = await generateKey();
    const response = await post('/auth/dev-login', { name }, key);
    if (!response.ok) throw new SessionEnded(await readError(response));
    await adopt((await response.json()) as TokenResponse, key);
  },

  /** Ends the session here and, if the API can be reached, there too. */
  async signOut(): Promise<void> {
    try {
      const token = await auth.accessToken();
      const stored = await loadSession();
      if (token && stored) await post('/auth/logout', {}, stored.key, token);
    } catch {
      // Best effort: the local session goes away either way.
    }
    accessToken = null;
    expiresAt = 0;
    lastEnd = null;
    await clearSession();
  },
};

// Browser tests read the access token to call the API directly. Not in production builds.
if (import.meta.env.DEV && typeof window !== 'undefined') {
  (window as unknown as { __tamago: unknown }).__tamago = { accessToken: () => auth.accessToken() };
}
