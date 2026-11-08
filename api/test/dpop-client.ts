import { createHash, generateKeyPairSync, randomBytes, sign, type KeyObject } from 'node:crypto';

const b64 = (data: Buffer | string) => Buffer.from(data).toString('base64url');

/** A browser stand-in: a key pair, and what the web app does with it (DPoP proofs, PKCE). */
export class TestClient {
  private readonly privateKey: KeyObject;
  readonly jwk: { kty: string; crv: string; x: string; y: string };

  constructor() {
    const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    this.privateKey = privateKey;
    this.jwk = publicKey.export({ format: 'jwk' }) as typeof this.jwk;
  }

  /** A signed DPoP proof for one request; `override` bends it to test refusals. */
  proof(
    method: string,
    path: string,
    override: { iat?: number; jti?: string; htm?: string; htu?: string; typ?: string } = {},
  ): string {
    const header = { typ: override.typ ?? 'dpop+jwt', alg: 'ES256', jwk: this.jwk };
    const payload = {
      jti: override.jti ?? randomBytes(12).toString('base64url'),
      htm: override.htm ?? method,
      htu: override.htu ?? `https://api.test${path}`,
      iat: override.iat ?? Math.floor(Date.now() / 1000),
    };
    const input = `${b64(JSON.stringify(header))}.${b64(JSON.stringify(payload))}`;
    const signature = sign('sha256', Buffer.from(input), {
      key: this.privateKey,
      dsaEncoding: 'ieee-p1363',
    });
    return `${input}.${b64(signature)}`;
  }

  /** A fresh PKCE pair. */
  static pkce() {
    const verifier = randomBytes(32).toString('base64url');
    return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') };
  }
}
