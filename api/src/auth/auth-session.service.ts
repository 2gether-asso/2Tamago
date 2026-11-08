import { Injectable } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { JwtService } from '@nestjs/jwt';
import { eq, lt, or } from 'drizzle-orm';
import { Clock } from '../common/clock.js';
import { AppConfig } from '../config/app-config.js';
import type { Database } from '../database/database.js';
import { authCodes, authProofs, authSessions, players } from '../database/schema.js';
import { AuthError } from './auth-error.js';
import type { ClientInfo } from './client-info.js';
import { hashSecret, pkceChallenge, randomToken } from './crypto.js';
import type { DpopProof } from './dpop.js';
import { assessRefresh } from './session-policy.js';

/** Two tabs may refresh at once: the token that was just replaced still works for this long. */
const ROTATION_GRACE_MS = 30_000;
const CODE_TTL_MS = 60_000;
/** A proof is only accepted within ±2 minutes, so it is enough to remember it a bit longer. */
const PROOF_MEMORY_MS = 5 * 60_000;

export interface TokenSet {
  access_token: string;
  /** Absent when the refresh was a duplicate of one just done (the client already has the new one). */
  refresh_token?: string;
  /** Seconds. */
  expires_in: number;
}

/** What access tokens carry. */
export interface AccessClaims {
  sub: string;
  adm?: true;
  /** The session this token came from (absent for development tokens without a session). */
  sid?: string;
  typ: 'access';
}

type RefreshOutcome =
  | { ok: true; playerId: string; sessionId: string; refreshToken?: string }
  | { ok: false; error: AuthError; revoke?: string };

/**
 * Sessions of the web app: short access tokens, renewed with a rotating refresh token that only
 * the client holding the bound key can use, and watched for signs that it moved elsewhere.
 */
@Injectable()
export class AuthSessionService {
  constructor(
    @InjectDrizzle() private readonly db: Database,
    private readonly config: AppConfig,
    private readonly clock: Clock,
    private readonly jwt: JwtService,
  ) {}

  /** A code to hand to the browser after Discord, redeemable once with the PKCE verifier. */
  async createCode(playerId: string, codeChallenge: string): Promise<string> {
    const now = this.clock.now();
    await this.cleanup(now);
    const code = randomToken();
    await this.db.insert(authCodes).values({
      hash: hashSecret(code),
      playerId,
      codeChallenge,
      expiresAt: new Date(now + CODE_TTL_MS),
    });
    return code;
  }

  /** Spends a code. It is gone whatever happens next: a wrong verifier does not get a second try. */
  async redeemCode(code: string, verifier: string): Promise<string> {
    const [row] = await this.db
      .delete(authCodes)
      .where(eq(authCodes.hash, hashSecret(code)))
      .returning();
    if (!row || row.expiresAt.getTime() <= this.clock.now()) throw new AuthError('invalid_grant');
    if (pkceChallenge(verifier) !== row.codeChallenge) throw new AuthError('invalid_grant');
    return row.playerId;
  }

  /** Refuses a proof that was already used. */
  async consumeProof(proof: DpopProof): Promise<void> {
    const inserted = await this.db
      .insert(authProofs)
      .values({
        id: `${proof.thumbprint}:${proof.jti}`,
        expiresAt: new Date(this.clock.now() + PROOF_MEMORY_MS),
      })
      .onConflictDoNothing()
      .returning({ id: authProofs.id });
    if (inserted.length === 0) throw new AuthError('invalid_dpop');
  }

  async start(playerId: string, proof: DpopProof, client: ClientInfo): Promise<TokenSet> {
    const now = this.clock.now();
    const refreshToken = randomToken();
    const { auth } = this.config;
    const [session] = await this.db
      .insert(authSessions)
      .values({
        playerId,
        keyThumbprint: proof.thumbprint,
        refreshHash: hashSecret(refreshToken),
        rotatedAt: new Date(now),
        createdAt: new Date(now),
        lastUsedAt: new Date(now),
        idleExpiresAt: new Date(now + auth.refreshIdleSeconds * 1000),
        absoluteExpiresAt: new Date(now + auth.sessionMaxSeconds * 1000),
        firstIp: client.ip,
        firstNetwork: client.network,
        firstUserAgent: client.userAgent,
        clientFamily: client.family,
        lastIp: client.ip,
      })
      .returning({ id: authSessions.id });
    return { ...(await this.accessToken(playerId, session!.id)), refresh_token: refreshToken };
  }

  /** A development token: valid for a while, no session behind it, nothing to refresh. */
  accessTokenOnly(playerId: string): Promise<TokenSet> {
    return this.accessToken(playerId, undefined);
  }

  async refresh(refreshToken: string, proof: DpopProof, client: ClientInfo): Promise<TokenSet> {
    const outcome = await this.db.transaction(async (tx): Promise<RefreshOutcome> => {
      const hash = hashSecret(refreshToken);
      const [row] = await tx
        .select()
        .from(authSessions)
        .where(or(eq(authSessions.refreshHash, hash), eq(authSessions.previousRefreshHash, hash)))
        .for('update');
      if (!row) return { ok: false, error: new AuthError('invalid_grant') };
      // Only the client that signed in holds the key: a stolen token alone does nothing.
      if (row.keyThumbprint !== proof.thumbprint) {
        return { ok: false, error: new AuthError('invalid_dpop') };
      }
      const now = this.clock.now();

      if (row.refreshHash !== hash) {
        // An old token. Just replaced and within the grace: a second tab. Later: it was copied.
        if (now - row.rotatedAt.getTime() <= ROTATION_GRACE_MS) {
          return { ok: true, playerId: row.playerId, sessionId: row.id };
        }
        return { ok: false, error: new AuthError('invalid_grant'), revoke: row.id };
      }

      const { auth } = this.config;
      const verdict = assessRefresh(
        {
          idleExpiresAt: row.idleExpiresAt.getTime(),
          absoluteExpiresAt: row.absoluteExpiresAt.getTime(),
          firstNetwork: row.firstNetwork,
          clientFamily: row.clientFamily,
          roamingSince: row.roamingSince?.getTime() ?? null,
        },
        client,
        now,
        { refreshIdleSeconds: auth.refreshIdleSeconds, roamingSeconds: auth.roamingSeconds },
      );
      if (!verdict.allowed) {
        return { ok: false, error: new AuthError(verdict.reason), revoke: row.id };
      }

      const next = randomToken();
      await tx
        .update(authSessions)
        .set({
          refreshHash: hashSecret(next),
          previousRefreshHash: hash,
          rotatedAt: new Date(now),
          lastUsedAt: new Date(now),
          idleExpiresAt: new Date(verdict.idleExpiresAt),
          lastIp: client.ip,
          roamingSince: verdict.roamingSince === null ? null : new Date(verdict.roamingSince),
        })
        .where(eq(authSessions.id, row.id));
      return { ok: true, playerId: row.playerId, sessionId: row.id, refreshToken: next };
    });
    if (outcome.ok) {
      // Outside the transaction: it holds the connection (the embedded database has only one).
      const access = await this.accessToken(outcome.playerId, outcome.sessionId);
      return outcome.refreshToken ? { ...access, refresh_token: outcome.refreshToken } : access;
    }
    // Outside the transaction, which the error would have rolled back.
    if (outcome.revoke) await this.revoke(outcome.revoke);
    throw outcome.error;
  }

  /** Whether a session still stands: a revoked or expired one cuts its access tokens short. */
  async isLive(sessionId: string): Promise<boolean> {
    const [row] = await this.db
      .select({
        idleExpiresAt: authSessions.idleExpiresAt,
        absoluteExpiresAt: authSessions.absoluteExpiresAt,
      })
      .from(authSessions)
      .where(eq(authSessions.id, sessionId));
    if (!row) return false;
    const now = this.clock.now();
    return row.idleExpiresAt.getTime() > now && row.absoluteExpiresAt.getTime() > now;
  }

  async revoke(sessionId: string): Promise<void> {
    await this.db.delete(authSessions).where(eq(authSessions.id, sessionId));
  }

  /** Whether this discord account is an admin; read at each renewal, so a change applies soon. */
  private async isAdmin(playerId: string): Promise<boolean> {
    const [player] = await this.db
      .select({ discordId: players.discordId })
      .from(players)
      .where(eq(players.id, playerId));
    return !!player && this.config.auth.adminDiscordIds.includes(player.discordId);
  }

  private async accessToken(
    playerId: string,
    sessionId: string | undefined,
  ): Promise<Pick<TokenSet, 'access_token' | 'expires_in'>> {
    const claims: AccessClaims = {
      sub: playerId,
      ...((await this.isAdmin(playerId)) ? { adm: true as const } : {}),
      ...(sessionId ? { sid: sessionId } : {}),
      typ: 'access',
    };
    const expires_in = this.config.auth.accessTtlSeconds;
    return {
      access_token: await this.jwt.signAsync(claims, { expiresIn: expires_in }),
      expires_in,
    };
  }

  /** Forgets what is over: codes, proofs and sessions past their limits. */
  private async cleanup(now: number): Promise<void> {
    const at = new Date(now);
    await this.db.delete(authCodes).where(lt(authCodes.expiresAt, at));
    await this.db.delete(authProofs).where(lt(authProofs.expiresAt, at));
    await this.db
      .delete(authSessions)
      .where(or(lt(authSessions.idleExpiresAt, at), lt(authSessions.absoluteExpiresAt, at)));
  }
}
