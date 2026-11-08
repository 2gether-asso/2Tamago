import { clientFamily, describeClient, networkOf } from './client-info.js';

describe('networkOf', () => {
  it('groups IPv4 addresses by /24', () => {
    expect(networkOf('203.0.113.7')).toBe('203.0.113.0/24');
    expect(networkOf('203.0.113.200')).toBe('203.0.113.0/24');
    expect(networkOf('203.0.114.7')).not.toBe(networkOf('203.0.113.7'));
  });

  it('unwraps IPv4-mapped IPv6 addresses', () => {
    expect(networkOf('::ffff:203.0.113.7')).toBe('203.0.113.0/24');
  });

  it('groups IPv6 addresses by /64', () => {
    expect(networkOf('2001:db8:1:2:aaaa:bbbb:cccc:dddd')).toBe('2001:db8:1:2::/64');
    expect(networkOf('2001:db8:1:2::1')).toBe('2001:db8:1:2::/64');
    expect(networkOf('2001:0db8:0001:0002:0:0:0:9')).toBe('2001:db8:1:2::/64');
    expect(networkOf('2001:db8:1:3::1')).not.toBe(networkOf('2001:db8:1:2::1'));
    expect(networkOf('::1')).toBe('0:0:0:0::/64');
  });
});

describe('clientFamily', () => {
  const CHROME_WIN =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

  it('ignores versions, so a browser update keeps the session', () => {
    expect(clientFamily(CHROME_WIN)).toBe('chrome/windows');
    expect(clientFamily(CHROME_WIN.replace('130.0.0.0', '131.0.0.0'))).toBe('chrome/windows');
  });

  it('tells browsers and systems apart', () => {
    expect(clientFamily(`${CHROME_WIN} Edg/130.0.0.0`)).toBe('edge/windows');
    expect(
      clientFamily('Mozilla/5.0 (X11; Linux x86_64; rv:132.0) Gecko/20100101 Firefox/132.0'),
    ).toBe('firefox/linux');
    expect(
      clientFamily(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
      ),
    ).toBe('safari/ios');
    expect(
      clientFamily(
        'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
      ),
    ).toBe('chrome/android');
    expect(clientFamily('curl/8.0')).toBe('other/other');
  });

  it('describes a client from a request', () => {
    expect(describeClient('::ffff:203.0.113.7', CHROME_WIN)).toMatchObject({
      ip: '203.0.113.7',
      network: '203.0.113.0/24',
      family: 'chrome/windows',
    });
    expect(describeClient(undefined, undefined)).toMatchObject({
      ip: 'unknown',
      family: 'other/other',
    });
  });
});
