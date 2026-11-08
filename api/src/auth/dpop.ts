import { createPublicKey, verify, webcrypto } from 'node:crypto';
import { AuthError } from './auth-error.js';
import { base64url, sha256 } from './crypto.js';

/** What a valid proof tells us. */
export interface DpopProof {
  /** Thumbprint of the key that signed (RFC 7638). */
  thumbprint: string;
  /** Unique id of this proof: it can only be used once. */
  jti: string;
  /** When the client made it (seconds). */
  iat: number;
}

interface PublicJwk {
  kty: 'EC';
  crv: 'P-256';
  x: string;
  y: string;
}

/** RFC 7638: the SHA-256 of the key's required members in lexicographic order. */
export function jwkThumbprint(jwk: PublicJwk): string {
  const canonical = JSON.stringify({ crv: jwk.crv, kty: jwk.kty, x: jwk.x, y: jwk.y });
  return base64url(sha256(canonical));
}

function parseJson(part: string | undefined): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(Buffer.from(part ?? '', 'base64url').toString('utf8'));
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
  } catch {
    // Falls through.
  }
  throw new AuthError('invalid_dpop');
}

function publicJwk(value: unknown): PublicJwk {
  const jwk = value as Partial<PublicJwk> | undefined;
  if (
    jwk?.kty !== 'EC' ||
    jwk.crv !== 'P-256' ||
    typeof jwk.x !== 'string' ||
    typeof jwk.y !== 'string'
  ) {
    throw new AuthError('invalid_dpop');
  }
  // Only the public members: a private key sent by mistake is not kept.
  return { kty: 'EC', crv: 'P-256', x: jwk.x, y: jwk.y };
}

/**
 * Checks a DPoP proof (RFC 9449): an ES256 JWT, signed by the key it carries in its header, for
 * this HTTP method and path, made just now. The caller still has to refuse a `jti` seen before.
 * The origin of `htu` is not compared: the API sits behind proxies that may rewrite it.
 */
export function verifyDpopProof(
  proof: string | undefined,
  request: { method: string; path: string; now: number; maxSkewSeconds?: number },
): DpopProof {
  const parts = proof?.split('.') ?? [];
  if (parts.length !== 3 || proof!.length > 2_048) throw new AuthError('invalid_dpop');
  const header = parseJson(parts[0]);
  const payload = parseJson(parts[1]);
  if (header.typ !== 'dpop+jwt' || header.alg !== 'ES256') throw new AuthError('invalid_dpop');
  const jwk = publicJwk(header.jwk);

  let valid = false;
  try {
    valid = verify(
      'sha256',
      Buffer.from(`${parts[0]}.${parts[1]}`),
      {
        key: createPublicKey({ key: jwk as webcrypto.JsonWebKey, format: 'jwk' }),
        dsaEncoding: 'ieee-p1363',
      },
      Buffer.from(parts[2]!, 'base64url'),
    );
  } catch {
    valid = false;
  }
  if (!valid) throw new AuthError('invalid_dpop');

  const { jti, htm, htu, iat } = payload;
  if (typeof jti !== 'string' || jti.length < 8 || jti.length > 128) {
    throw new AuthError('invalid_dpop');
  }
  if (htm !== request.method.toUpperCase()) throw new AuthError('invalid_dpop');
  let htuPath: string;
  try {
    htuPath = new URL(String(htu)).pathname;
  } catch {
    throw new AuthError('invalid_dpop');
  }
  if (htuPath !== request.path) throw new AuthError('invalid_dpop');
  const skew = request.maxSkewSeconds ?? 120;
  if (typeof iat !== 'number' || Math.abs(request.now / 1000 - iat) > skew) {
    throw new AuthError('invalid_dpop');
  }
  return { thumbprint: jwkThumbprint(jwk), jti, iat };
}
