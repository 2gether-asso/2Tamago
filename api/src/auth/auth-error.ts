import { UnauthorizedException } from '@nestjs/common';

/** Why a sign-in, a code or a refresh was refused. The web app turns these codes into messages. */
export type AuthErrorCode =
  | 'invalid_grant' // unknown, used or expired code or refresh token; wrong PKCE verifier
  | 'invalid_dpop' // missing or wrong proof of possession
  | 'session_expired' // inactive for too long, or past its hard limit
  | 'session_suspicious' // the client changed (another browser or system): the session is revoked
  | 'session_roaming'; // too long on another network than the sign-in's: sign in again

export class AuthError extends UnauthorizedException {
  constructor(readonly code: AuthErrorCode) {
    super({ statusCode: 401, message: code, code });
  }
}
