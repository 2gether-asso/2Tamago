import { Controller, Get, Req } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import type { Request } from 'express';
import request from 'supertest';
import { clientIpMiddleware, resolveClientIp } from './client-ip.js';

describe('resolveClientIp', () => {
  it('keeps the proxy chain answer without a header', () => {
    expect(resolveClientIp('10.99.0.1', undefined)).toBe('10.99.0.1');
  });

  it('prefers a valid single IP from the trusted header', () => {
    expect(resolveClientIp('10.99.0.1', '203.0.113.7')).toBe('203.0.113.7');
    expect(resolveClientIp('10.99.0.1', ' 2001:db8::1 ')).toBe('2001:db8::1');
  });

  it('ignores a header that is not exactly one IP', () => {
    expect(resolveClientIp('10.99.0.1', '203.0.113.7, 10.0.0.1')).toBe('10.99.0.1');
    expect(resolveClientIp('10.99.0.1', 'not-an-ip')).toBe('10.99.0.1');
    expect(resolveClientIp('10.99.0.1', '')).toBe('10.99.0.1');
  });
});

describe('client IP behind the proxies (Express)', () => {
  const SEEN = '203.0.113.7';
  async function ipSeen(trust: number | string, header: string | undefined, headers: object) {
    @Controller()
    class Probe {
      @Get()
      ip(@Req() req: Request) {
        return req.ip;
      }
    }
    const moduleRef = await Test.createTestingModule({ controllers: [Probe] }).compile();
    const app = moduleRef.createNestApplication<NestExpressApplication>();
    app.set('trust proxy', trust);
    app.use(clientIpMiddleware(header));
    await app.init();
    try {
      const response = await request(app.getHttpServer())
        .get('/')
        .set(headers as Record<string, string>);
      return response.text;
    } finally {
      await app.close();
    }
  }
  // The supertest peer is 127.0.0.1: the first proxy. 10.99.0.1 is the second one.
  const production = { 'x-forwarded-for': `${SEEN}, 10.99.0.1`, 'cf-connecting-ip': SEEN };

  it('sees the second proxy when only one hop is trusted', async () => {
    expect(await ipSeen(1, undefined, production)).toBe('10.99.0.1');
  });

  it('sees the player with two trusted hops', async () => {
    expect(await ipSeen(2, undefined, production)).toBe(SEEN);
  });

  it('sees the player through the trusted header whatever the hops', async () => {
    expect(await ipSeen(1, 'cf-connecting-ip', production)).toBe(SEEN);
  });

  it('does not believe a spoofed header nobody configured', async () => {
    const spoof = { 'x-forwarded-for': '10.99.0.1', 'cf-connecting-ip': '1.2.3.4' };
    expect(await ipSeen(1, undefined, spoof)).toBe('10.99.0.1');
  });

  it('does not believe forwarded entries beyond the trusted hops', async () => {
    const spoof = { 'x-forwarded-for': '1.2.3.4, 203.0.113.7' };
    expect(await ipSeen(1, undefined, spoof)).toBe(SEEN);
  });
});
