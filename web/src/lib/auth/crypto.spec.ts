import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createProof, generateKey } from './dpop.ts';
import { base64url } from './encoding.ts';
import { newPkce } from './pkce.ts';

const decode = (part: string) => JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));

beforeEach(() => {
  vi.stubGlobal('location', { origin: 'https://tamago.example' });
});
afterEach(() => vi.unstubAllGlobals());

describe('base64url', () => {
  it('uses the URL alphabet, without padding', () => {
    expect(base64url(new Uint8Array([251, 255, 254]))).toBe('-__-');
    expect(base64url('a')).toBe('YQ');
  });
});

describe('PKCE', () => {
  it('gives a verifier and its S256 challenge, in the shape the API accepts', async () => {
    const { verifier, challenge } = await newPkce();
    expect(verifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(challenge).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
    expect(challenge).toBe(base64url(hash));
    expect((await newPkce()).verifier).not.toBe(verifier);
  });
});

describe('DPoP proof', () => {
  it('is a JWT signed by a key that cannot be exported, naming the request', async () => {
    const key = await generateKey();
    await expect(crypto.subtle.exportKey('jwk', key.privateKey)).rejects.toThrow();

    const proof = await createProof(key, 'post', '/api/auth/refresh', 1_794_000_000_500);
    const [header, payload, signature] = proof.split('.') as [string, string, string];
    expect(decode(header)).toMatchObject({
      typ: 'dpop+jwt',
      alg: 'ES256',
      jwk: { kty: 'EC', crv: 'P-256' },
    });
    expect(decode(header).jwk.d).toBeUndefined();
    expect(decode(payload)).toMatchObject({
      htm: 'POST',
      htu: 'https://tamago.example/api/auth/refresh',
      iat: 1_794_000_000,
    });

    const publicKey = await crypto.subtle.importKey(
      'jwk',
      decode(header).jwk,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify'],
    );
    const valid = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      publicKey,
      Buffer.from(signature, 'base64url'),
      new TextEncoder().encode(`${header}.${payload}`),
    );
    expect(valid).toBe(true);
  });

  it('is new each time, so it can be used once', async () => {
    const key = await generateKey();
    const a = decode((await createProof(key, 'GET', '/api/x')).split('.')[1]!);
    const b = decode((await createProof(key, 'GET', '/api/x')).split('.')[1]!);
    expect(a.jti).not.toBe(b.jti);
  });
});
