import { AppConfig } from '../config/app-config.js';
import { WebhookSender } from './announcement-sender.js';

const URL = 'https://discord.com/api/webhooks/1/token';
const sender = (webhook?: string) =>
  new WebhookSender(new AppConfig(webhook ? { DISCORD_WEBHOOK_URL: webhook } : {}));

afterEach(() => vi.unstubAllGlobals());

describe('WebhookSender', () => {
  it('is enabled only with a webhook URL, and treats a blank one as none', () => {
    expect(sender().enabled).toBe(false);
    expect(sender('').enabled).toBe(false);
    expect(sender(URL).enabled).toBe(true);
  });

  it('posts the message without letting it mention anyone', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);
    await sender(URL).send('Bonjour @everyone');
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(URL);
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({
      username: '2Tamago',
      content: 'Bonjour @everyone',
      allowed_mentions: { parse: [] },
    });
  });

  it('never throws, whatever Discord does', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 429 })),
    );
    await expect(sender(URL).send('x')).resolves.toBeUndefined();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(new Error('network down'))),
    );
    await expect(sender(URL).send('x')).resolves.toBeUndefined();
  });

  it('sends nothing without a webhook', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await sender().send('x');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
