import { describe, expect, it } from 'vitest';
import { reportError, startMonitoring } from './monitoring.ts';

describe('monitoring', () => {
  it('does nothing without a DSN, and never throws', async () => {
    await expect(startMonitoring({ sentryDsn: null })).resolves.toBeUndefined();
    expect(() => reportError(new Error('boom'))).not.toThrow();
  });
});
