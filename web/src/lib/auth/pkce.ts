import { base64url, randomString } from './encoding.ts';

/**
 * PKCE (RFC 7636, S256): a secret kept in the browser, and its hash, sent to start the sign-in.
 * The code the API returns is only worth something to whoever knows the secret.
 */
export async function newPkce(): Promise<{ verifier: string; challenge: string }> {
  const verifier = randomString(32);
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return { verifier, challenge: base64url(hash) };
}
