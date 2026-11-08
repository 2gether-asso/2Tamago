import type { ClientInfo } from './client-info.js';
import { assessRefresh, type SessionTrail } from './session-policy.js';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const START = Date.UTC(2026, 10, 8, 12, 0, 0);
const LIMITS = { refreshIdleSeconds: 7 * 86_400, roamingSeconds: 6 * 3_600 };

const home: ClientInfo = {
  ip: '203.0.113.7',
  network: '203.0.113.0/24',
  userAgent: 'x',
  family: 'chrome/windows',
};
const mobile: ClientInfo = { ...home, ip: '198.51.100.9', network: '198.51.100.0/24' };

const session = (over: Partial<SessionTrail> = {}): SessionTrail => ({
  idleExpiresAt: START + 7 * DAY,
  absoluteExpiresAt: START + 30 * DAY,
  firstNetwork: home.network,
  clientFamily: home.family,
  roamingSince: null,
  ...over,
});

describe('assessRefresh', () => {
  it('lets a session on its sign-in network refresh, sliding the inactivity delay', () => {
    const verdict = assessRefresh(session(), home, START + 2 * DAY, LIMITS);
    expect(verdict).toEqual({
      allowed: true,
      roamingSince: null,
      idleExpiresAt: START + 9 * DAY,
    });
  });

  it('never goes past the hard limit', () => {
    const active = session({ idleExpiresAt: START + 29.5 * DAY });
    const verdict = assessRefresh(active, home, START + 29 * DAY, LIMITS);
    expect(verdict).toMatchObject({ allowed: true, idleExpiresAt: START + 30 * DAY });
  });

  it('ends a session that was inactive too long, or is past its hard limit', () => {
    expect(assessRefresh(session(), home, START + 8 * DAY, LIMITS)).toEqual({
      allowed: false,
      reason: 'session_expired',
    });
    expect(
      assessRefresh(session({ idleExpiresAt: START + 40 * DAY }), home, START + 31 * DAY, LIMITS),
    ).toEqual({ allowed: false, reason: 'session_expired' });
  });

  it('revokes when the browser or the system is not the one that signed in', () => {
    expect(
      assessRefresh(session(), { ...home, family: 'firefox/linux' }, START + HOUR, LIMITS),
    ).toEqual({ allowed: false, reason: 'session_suspicious' });
  });

  it('tolerates another network, but only for a few hours, starting at the first refresh there', () => {
    const first = assessRefresh(session(), mobile, START + 2 * DAY, LIMITS);
    expect(first).toEqual({
      allowed: true,
      roamingSince: START + 2 * DAY,
      idleExpiresAt: START + 9 * DAY,
    });

    const later = session({ roamingSince: START + 2 * DAY });
    expect(assessRefresh(later, mobile, START + 2 * DAY + 5 * HOUR, LIMITS)).toMatchObject({
      allowed: true,
      roamingSince: START + 2 * DAY,
    });
    expect(assessRefresh(later, mobile, START + 2 * DAY + 6 * HOUR, LIMITS)).toEqual({
      allowed: false,
      reason: 'session_roaming',
    });
  });

  it('does not extend the roaming allowance by refreshing again', () => {
    let roamingSince: number | null = null;
    let time = START;
    for (let i = 0; i < 5; i++) {
      time += HOUR;
      const verdict = assessRefresh(session({ roamingSince }), mobile, time, LIMITS);
      expect(verdict.allowed).toBe(true);
      roamingSince = verdict.allowed ? verdict.roamingSince : null;
    }
    expect(roamingSince).toBe(START + HOUR);
    expect(assessRefresh(session({ roamingSince }), mobile, START + 7 * HOUR, LIMITS)).toEqual({
      allowed: false,
      reason: 'session_roaming',
    });
  });

  it('ends the countdown when the player is back on the sign-in network', () => {
    const verdict = assessRefresh(
      session({ roamingSince: START + HOUR }),
      home,
      START + 3 * HOUR,
      LIMITS,
    );
    expect(verdict).toMatchObject({ allowed: true, roamingSince: null });
  });
});
