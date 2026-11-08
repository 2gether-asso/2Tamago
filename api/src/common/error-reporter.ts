import * as Sentry from '@sentry/node';
import { Catch, HttpException, type ArgumentsHost } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';

/**
 * Error reporting to Sentry, or to any Sentry-compatible server such as GlitchTip: enabled by
 * `SENTRY_DSN`, a no-op without it.
 */
export function initErrorReporting(options: { dsn?: string; environment: string }): void {
  if (!options.dsn) return;
  Sentry.init({ dsn: options.dsn, environment: options.environment });
}

/** Reports an error that was handled (for example by a redirect), so it is still followed. */
export function captureError(error: unknown): void {
  Sentry.captureException(error);
}

/**
 * Reports unexpected errors (anything but a 4xx), then lets Nest answer as usual. Registered
 * before the more specific filters, which Nest tries first.
 */
@Catch()
export class ErrorReportingFilter extends BaseExceptionFilter {
  override catch(exception: unknown, host: ArgumentsHost): void {
    const status = exception instanceof HttpException ? exception.getStatus() : 500;
    if (status >= 500) Sentry.captureException(exception);
    super.catch(exception, host);
  }
}
