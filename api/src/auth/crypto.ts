import { createHash, randomBytes } from 'node:crypto';

export const base64url = (data: Buffer | string): string => Buffer.from(data).toString('base64url');

export const sha256 = (data: string): Buffer => createHash('sha256').update(data).digest();

/** An unguessable value for codes and refresh tokens. */
export const randomToken = (bytes = 32): string => randomBytes(bytes).toString('base64url');

/** What we store of a secret: a leaked database does not leak working tokens. */
export const hashSecret = (secret: string): string => sha256(secret).toString('base64url');

/** PKCE (RFC 7636), S256: the challenge sent at the start, the verifier sent with the code. */
export const pkceChallenge = (verifier: string): string => sha256(verifier).toString('base64url');
export const isPkceChallenge = (value: string): boolean => /^[A-Za-z0-9_-]{43}$/.test(value);
export const isPkceVerifier = (value: string): boolean => /^[A-Za-z0-9._~-]{43,128}$/.test(value);
