import { TestClient } from '../../test/dpop-client.js';
import { AuthError } from './auth-error.js';
import { jwkThumbprint, verifyDpopProof } from './dpop.js';

const NOW = Date.UTC(2026, 10, 8, 12, 0, 0);
const request = { method: 'POST', path: '/api/auth/refresh', now: NOW };
const at = (offsetSeconds: number) => Math.floor(NOW / 1000) + offsetSeconds;

describe('verifyDpopProof', () => {
  const client = new TestClient();

  it('accepts a fresh proof for this method and path, and names the key', () => {
    const proof = client.proof('POST', '/api/auth/refresh', { iat: at(0) });
    const result = verifyDpopProof(proof, request);
    expect(result.thumbprint).toBe(
      jwkThumbprint({ kty: 'EC', crv: 'P-256', x: client.jwk.x, y: client.jwk.y } as never),
    );
    expect(result.jti.length).toBeGreaterThan(8);
  });

  it.each([
    ['another method', { htm: 'GET' }],
    ['another path', { htu: 'https://api.test/api/me' }],
    ['a proof from the past', { iat: at(-600) }],
    ['a proof from the future', { iat: at(600) }],
    ['a wrong type', { typ: 'JWT' }],
    ['a short id', { jti: 'abc' }],
  ])('refuses %s', (_, override) => {
    const proof = client.proof('POST', '/api/auth/refresh', { iat: at(0), ...override });
    expect(() => verifyDpopProof(proof, request)).toThrow(AuthError);
  });

  it('accepts a different origin in htu: only the path is compared (proxies rewrite hosts)', () => {
    const proof = client.proof('POST', '/api/auth/refresh', {
      iat: at(0),
      htu: 'https://elsewhere.example/api/auth/refresh?x=1',
    });
    expect(() => verifyDpopProof(proof, request)).not.toThrow();
  });

  it('refuses a proof whose signature was made by another key', () => {
    const real = client.proof('POST', '/api/auth/refresh', { iat: at(0) });
    const other = new TestClient().proof('POST', '/api/auth/refresh', { iat: at(0) });
    // The header (with the first key) and payload of one, the signature of the other.
    const forged = `${real.split('.').slice(0, 2).join('.')}.${other.split('.')[2]}`;
    expect(() => verifyDpopProof(forged, request)).toThrow(AuthError);
  });

  it('refuses anything that is not a proof', () => {
    for (const bad of [undefined, '', 'a.b', 'a.b.c', 'x'.repeat(5000)]) {
      expect(() => verifyDpopProof(bad, request)).toThrow(AuthError);
    }
  });

  it('refuses a payload edited after signing', () => {
    const [header, payload, signature] = client
      .proof('POST', '/api/auth/refresh', { iat: at(0) })
      .split('.');
    const edited = JSON.parse(Buffer.from(payload!, 'base64url').toString());
    edited.htm = 'DELETE';
    const forged = `${header}.${Buffer.from(JSON.stringify(edited)).toString('base64url')}.${signature}`;
    expect(() => verifyDpopProof(forged, { ...request, method: 'DELETE' })).toThrow(AuthError);
  });
});
