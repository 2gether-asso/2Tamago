import { isIPv6 } from 'node:net';

/** What we remember of a client, to notice when a session moves somewhere else. */
export interface ClientInfo {
  ip: string;
  /** The network the IP belongs to: a mobile or home connection changes IP inside it. */
  network: string;
  userAgent: string;
  /** Browser and system, without versions (see `clientFamily`). */
  family: string;
}

/** IPv4 as is; IPv4-mapped IPv6 (`::ffff:1.2.3.4`) unwrapped. */
function normalize(ip: string): string {
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
  return (mapped?.[1] ?? ip).toLowerCase();
}

/** The /24 of an IPv4 address, the /64 of an IPv6 one: what a provider hands out to one line. */
export function networkOf(rawIp: string): string {
  const ip = normalize(rawIp);
  if (!isIPv6(ip)) return `${ip.split('.').slice(0, 3).join('.')}.0/24`;
  const [head = '', tail = ''] = ip.split('::');
  const words = head ? head.split(':') : [];
  const rest = tail ? tail.split(':') : [];
  const full = ip.includes('::')
    ? [...words, ...Array<string>(8 - words.length - rest.length).fill('0'), ...rest]
    : words;
  return `${full
    .slice(0, 4)
    .map((word) => word.replace(/^0+(?=.)/, ''))
    .join(':')}::/64`;
}

/**
 * Browser and operating system from a User-Agent, without version numbers: those change with
 * every update, while a session moving to another browser or system is a real warning.
 */
export function clientFamily(userAgent: string): string {
  const ua = userAgent;
  const browser = /Edg(e|A|iOS)?\//.test(ua)
    ? 'edge'
    : /OPR\/|Opera/.test(ua)
      ? 'opera'
      : /Firefox\/|FxiOS\//.test(ua)
        ? 'firefox'
        : /Chrome\/|CriOS\//.test(ua)
          ? 'chrome'
          : /Safari\//.test(ua)
            ? 'safari'
            : 'other';
  const system = /Android/.test(ua)
    ? 'android'
    : /iPhone|iPad|iPod/.test(ua)
      ? 'ios'
      : /Windows/.test(ua)
        ? 'windows'
        : /Mac OS X|Macintosh/.test(ua)
          ? 'macos'
          : /CrOS/.test(ua)
            ? 'chromeos'
            : /Linux|X11/.test(ua)
              ? 'linux'
              : 'other';
  return `${browser}/${system}`;
}

export function describeClient(ip: string | undefined, userAgent: string | undefined): ClientInfo {
  const address = normalize(ip ?? 'unknown');
  const agent = (userAgent ?? '').slice(0, 300);
  return {
    ip: address,
    network: address === 'unknown' ? 'unknown' : networkOf(address),
    userAgent: agent,
    family: clientFamily(agent),
  };
}
