import { base64url, randomString } from './encoding.ts';

/** The browser's key: the private half cannot be exported, even by a script of the page. */
export async function generateKey(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
}

/**
 * A DPoP proof (RFC 9449) for one request: a JWT signed with our key, carrying the public key and
 * naming the method and URL, so it works for that request only, and only once.
 */
export async function createProof(
  key: CryptoKeyPair,
  method: string,
  url: string,
  now = Date.now(),
): Promise<string> {
  const { kty, crv, x, y } = await crypto.subtle.exportKey('jwk', key.publicKey);
  const header = { typ: 'dpop+jwt', alg: 'ES256', jwk: { kty, crv, x, y } };
  const payload = {
    jti: randomString(16),
    htm: method.toUpperCase(),
    htu: new URL(url, location.origin).href,
    iat: Math.floor(now / 1000),
  };
  const input = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
  // WebCrypto returns the raw r||s form that JWS ES256 uses.
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key.privateKey,
    new TextEncoder().encode(input),
  );
  return `${input}.${base64url(signature)}`;
}
