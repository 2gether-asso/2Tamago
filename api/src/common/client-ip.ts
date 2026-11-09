import { isIP } from 'node:net';
import type { NextFunction, Request, Response } from 'express';

/**
 * The IP of the player, as far as we can trust it. `proxyIp` is what Express computed with the
 * `trust proxy` setting (`TRUST_PROXY`). `headerValue` is the configured `CLIENT_IP_HEADER`
 * (never read when none is configured): it wins only when it holds exactly one valid IP, else
 * we keep the proxy chain's answer. A header nobody configured is never looked at.
 */
export function resolveClientIp(
  proxyIp: string | undefined,
  headerValue: string | string[] | undefined,
): string | undefined {
  const raw = Array.isArray(headerValue) ? headerValue[0] : headerValue;
  const candidate = raw?.trim();
  // Brackets and ports are not part of such headers; a list means a proxy we do not know.
  if (candidate && isIP(candidate) !== 0) return candidate;
  return proxyIp;
}

/** Makes `req.ip` the resolved client IP, so rate limits, sessions and logs all agree. */
export function clientIpMiddleware(header: string | undefined) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (header) {
      const ip = resolveClientIp(req.ip, req.headers[header]);
      Object.defineProperty(req, 'ip', { value: ip, configurable: true });
    }
    next();
  };
}
