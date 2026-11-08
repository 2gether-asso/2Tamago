import type { AuthErrorCode } from './auth-error.js';
import type { ClientInfo } from './client-info.js';

/** The parts of a session the policy looks at. Times are milliseconds. */
export interface SessionTrail {
  idleExpiresAt: number;
  absoluteExpiresAt: number;
  firstNetwork: string;
  clientFamily: string;
  roamingSince: number | null;
}

export interface SessionLimits {
  refreshIdleSeconds: number;
  roamingSeconds: number;
}

export type Verdict =
  | { allowed: true; roamingSince: number | null; idleExpiresAt: number }
  | { allowed: false; reason: AuthErrorCode };

/**
 * Decides whether a session may refresh, from where it comes.
 *
 * - Past its inactivity delay or its hard limit: expired.
 * - Another browser or system than at sign-in: suspicious (the key binding makes this rare, so a
 *   change means the token left its browser).
 * - Same network as the sign-in: refreshes for days (the inactivity delay slides).
 * - Another network (mobile data, a trip, or a thief): tolerated, but only for a few hours since
 *   the first refresh from there; after that, refreshing from another network ends the session
 *   (a new sign-in is needed). Coming back to the sign-in network ends that countdown.
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
  let roamingSince: number | null = null;
  if (client.network !== session.firstNetwork) {
    roamingSince = session.roamingSince ?? now;
    if (now >= roamingSince + limits.roamingSeconds * 1000) {
      return { allowed: false, reason: 'session_roaming' };
    }
  }
  return {
    allowed: true,
    roamingSince,
    idleExpiresAt: Math.min(now + limits.refreshIdleSeconds * 1000, session.absoluteExpiresAt),
  };
}
