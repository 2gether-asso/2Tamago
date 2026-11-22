import type { AuthErrorCode } from './auth-error.js';
import type { ClientInfo } from './client-info.js';

/** The parts of a session the policy looks at. Times are milliseconds. */
export interface SessionTrail {
  idleExpiresAt: number;
  absoluteExpiresAt: number;
  firstNetwork: string;
  clientFamily: string;
  roamingSince: number | null;
  /** Other networks this session proved to be its own (see `assessRefresh`). */
  knownNetworks?: readonly string[];
  /** The network and time of the last refresh. */
  lastNetwork?: string;
  lastUsedAt?: number;
}

export interface SessionLimits {
  refreshIdleSeconds: number;
  roamingSeconds: number;
}

/** A network becomes known after refreshes from it this far apart (with the bound key). */
export const STABLE_NETWORK_MS = 60 * 60_000;
/** Networks remembered per session (home, work, mobile data…); the oldest is forgotten. */
export const MAX_KNOWN_NETWORKS = 8;

export type Verdict =
  | {
      allowed: true;
      roamingSince: number | null;
      idleExpiresAt: number;
      /** The session's known networks, with the one it just learnt (unchanged otherwise). */
      knownNetworks: string[];
    }
  | { allowed: false; reason: AuthErrorCode };

/**
 * Decides whether a session may refresh, from where it comes.
 *
 * - Past its inactivity delay or its hard limit: expired.
 * - Another browser or system than at sign-in: suspicious (the key binding makes this rare, so a
 *   change means the token left its browser).
 * - A known network (the sign-in's, or one learnt since): refreshes for weeks (the inactivity
 *   delay slides).
 * - Another network: tolerated for a while since the first refresh from there; after that,
 *   refreshing from it ends the session (a new sign-in is needed).
 *
 * Phones change networks all day (home Wi-Fi, mobile data, work), so a session learns the networks
 * it keeps using: one it refreshed from twice, an hour apart or more, or the one it used while
 * roaming once it comes back to a known network. Each refresh needs the key that never left the
 * browser, so a learnt network is still the same device; only the browser change stays fatal.
 */
export function assessRefresh(
  session: SessionTrail,
  client: ClientInfo,
  now: number,
  limits: SessionLimits,
): Verdict {
  if (now >= session.idleExpiresAt || now >= session.absoluteExpiresAt) {
    return { allowed: false, reason: 'session_expired' };
  }
  if (client.family !== session.clientFamily) {
    return { allowed: false, reason: 'session_suspicious' };
  }
  const known = session.knownNetworks ?? [];
  const isKnown = (network: string) => network === session.firstNetwork || known.includes(network);
  const learn = (network: string) =>
    [...known.filter((n) => n !== network), network].slice(-MAX_KNOWN_NETWORKS);

  let knownNetworks = [...known];
  let roamingSince: number | null = null;
  if (isKnown(client.network)) {
    // Back home after roaming: the network it roamed on was its own too.
    if (session.roamingSince !== null && session.lastNetwork && !isKnown(session.lastNetwork)) {
      knownNetworks = learn(session.lastNetwork);
    }
  } else {
    const stable =
      session.lastNetwork === client.network &&
      session.lastUsedAt !== undefined &&
      now - session.lastUsedAt >= STABLE_NETWORK_MS;
    roamingSince = session.roamingSince ?? now;
    if (now >= roamingSince + limits.roamingSeconds * 1000) {
      return { allowed: false, reason: 'session_roaming' };
    }
    if (stable) {
      knownNetworks = learn(client.network);
      roamingSince = null;
    }
  }
  return {
    allowed: true,
    roamingSince,
    idleExpiresAt: Math.min(now + limits.refreshIdleSeconds * 1000, session.absoluteExpiresAt),
    knownNetworks,
  };
}
