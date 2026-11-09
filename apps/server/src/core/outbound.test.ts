import { createServer, type IncomingHttpHeaders, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { isPublicAddress, OutboundError, safeGet, type SafeGetOptions } from './outbound.ts';

describe('which addresses are public', () => {
  it.each(['8.8.8.8', '1.1.1.1', '93.184.215.14', '2606:4700:4700::1111', '2a00:1450:4001::64'])(
    'allows %s',
    (address) => {
      expect(isPublicAddress(address)).toBe(true);
    },
  );

  it.each([
    ['loopback', '127.0.0.1'],
    ['loopback, anywhere in its range', '127.255.0.9'],
    ['the unspecified address', '0.0.0.0'],
    ['a private network', '10.1.2.3'],
    ['a private network', '172.16.0.1'],
    ['a private network', '172.31.255.255'],
    ['a home network', '192.168.1.1'],
    ['carrier-grade NAT', '100.64.0.1'],
    ['a cloud metadata service', '169.254.169.254'],
    ['multicast', '224.0.0.1'],
    ['broadcast', '255.255.255.255'],
    ['documentation', '192.0.2.10'],
    ['benchmarking', '198.18.0.1'],
    ['IPv6 loopback', '::1'],
    ['the IPv6 unspecified address', '::'],
    ['an IPv6 private network', 'fd00::1'],
    ['IPv6 link-local', 'fe80::1'],
    ['IPv6 multicast', 'ff02::1'],
    ['IPv4 loopback inside IPv6', '::ffff:127.0.0.1'],
    ['an IPv4 private network inside IPv6', '::ffff:10.0.0.1'],
    ['NAT64 hiding a private address', '64:ff9b::a00:1'],
    ['6to4 hiding a private address', '2002:c0a8:101::1'],
    ['Teredo', '2001:0:4136:e378::1'],
    ['a name, which isn’t an address', 'localhost'],
    ['nothing', ''],
  ])('refuses %s: %s', (_why, address) => {
    expect(isPublicAddress(address)).toBe(false);
  });
});

describe('refusing addresses before connecting', () => {
  it.each([
    ['a file', 'file:///etc/passwd', /Only web addresses/],
    ['another protocol', 'ftp://example.com/logo.png', /Only web addresses/],
    ['a password in the address', 'https://user:secret@example.com/', /password/],
    ['an unusual port', 'https://example.com:8443/', /usual web ports/],
    ['loopback', 'http://127.0.0.1/', /private/],
    ['loopback, written as a number', 'http://2130706433/', /private/],
    ['IPv6 loopback', 'http://[::1]/', /private/],
    ['IPv4 loopback inside IPv6', 'http://[::ffff:127.0.0.1]/', /private/],
    ['a cloud metadata service', 'http://169.254.169.254/latest/meta-data/', /private/],
    ['a name for this computer', 'http://localhost/', /private/],
  ])('refuses %s, saying why', async (_why, address, reason) => {
    await expect(safeGet(address, { maxBytes: 1000 })).rejects.toThrow(reason);
  });
});
describe('fetching', () => {
  // A server on this computer stands in for a website. The tests allow its address and port, which
  // real fetching never would, and check everything else still applies.
  let server: Server;
  let port = 0;
  let hits: { url: string; headers: IncomingHttpHeaders }[] = [];
  let respond: (url: string) => {
    status: number;
    headers?: Record<string, string>;
    body?: string;
  } = () => ({ status: 200 });

  beforeAll(async () => {
    server = createServer((request, response) => {
      hits.push({ url: request.url ?? '', headers: request.headers });
      if (request.url === '/slow') return; // never answers
      if (request.url === '/stream') {
        response.writeHead(200, { 'content-type': 'text/plain' });
        const timer = setInterval(() => response.write('x'.repeat(1000)), 1);
        response.on('close', () => {
          clearInterval(timer);
        });
        return;
      }
      const answer = respond(request.url ?? '');
      response.writeHead(answer.status, answer.headers ?? {});
      response.end(answer.body ?? '');
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    port = (server.address() as AddressInfo).port;
  });

  afterAll(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  });

  beforeEach(() => {
    hits = [];
  });

  const local = (path: string) => `http://127.0.0.1:${String(port)}${path}`;
  const options = (more: Partial<SafeGetOptions> = {}): SafeGetOptions => ({
    maxBytes: 5000,
    timeoutMs: 1000,
    addressAllowed: (address) => address === '127.0.0.1',
    allowedPorts: [port],
    ...more,
  });

  it('returns the body and its type, asking for nothing compressed', async () => {
    respond = () => ({ status: 200, headers: { 'content-type': 'image/png' }, body: 'picture' });
    const result = await safeGet(local('/logo.png'), options());
    expect(result.body.toString()).toBe('picture');
    expect(result.contentType).toBe('image/png');
    expect(hits[0]?.headers['accept-encoding']).toBe('identity');
    expect(hits[0]?.headers['user-agent']).toMatch(/^Remidy/);
  });

  it('follows up to 3 redirects, and says where it ended up', async () => {
    respond = (url) => {
      const step = Number(url.slice(1));
      return step < 3
        ? { status: 302, headers: { location: `/${String(step + 1)}` } }
        : { status: 200, body: 'arrived' };
    };
    const result = await safeGet(local('/0'), options());
    expect(result.body.toString()).toBe('arrived');
    expect(result.url.pathname).toBe('/3');
    await expect(safeGet(local('/0'), options({ maxRedirects: 2 }))).rejects.toThrow(
      /redirected too many/,
    );
  });

  it.each([
    ['a private address', 'http://10.0.0.1/'],
    ['IPv6 loopback', `http://[::1]:PORT/`],
    ['another protocol', 'file:///etc/passwd'],
    ['an unusual port', 'http://127.0.0.1:1/'],
  ])('checks a redirect to %s the same way', async (_why, target) => {
    respond = () => ({
      status: 302,
      headers: { location: target.replace('PORT', String(port)) },
    });
    await expect(safeGet(local('/start'), options())).rejects.toThrow(OutboundError);
    // Only the first request was made.
    expect(hits).toHaveLength(1);
  });

  it('refuses a name when its addresses aren’t allowed, without connecting', async () => {
    await expect(
      safeGet(`http://localhost:${String(port)}/`, options({ addressAllowed: () => false })),
    ).rejects.toThrow(/private/);
    expect(hits).toHaveLength(0);
  });

  it('refuses this computer’s address, even on a port that’s allowed', async () => {
    await expect(safeGet(local('/'), { maxBytes: 1000, allowedPorts: [port] })).rejects.toThrow(
      /private/,
    );
    expect(hits).toHaveLength(0);
  });

  it('refuses a name when any one of its addresses is private', async () => {
    const twoWays = () =>
      Promise.resolve([
        { address: '127.0.0.1', family: 4 },
        { address: '10.0.0.1', family: 4 },
      ]);
    await expect(
      safeGet(`http://bills.test:${String(port)}/`, options({ resolve: twoWays })),
    ).rejects.toThrow(/private/);
    expect(hits).toHaveLength(0);
    // The same name with only the allowed address connects, so the lookup above was what refused.
    respond = () => ({ status: 200, body: 'ok' });
    const oneWay = () => Promise.resolve([{ address: '127.0.0.1', family: 4 }]);
    const result = await safeGet(
      `http://bills.test:${String(port)}/`,
      options({ resolve: oneWay }),
    );
    expect(result.body.toString()).toBe('ok');
  });

  it('stops reading at the limit, whether or not the size was given', async () => {
    respond = () => ({
      status: 200,
      headers: { 'content-length': '6000' },
      body: 'x'.repeat(6000),
    });
    await expect(safeGet(local('/big'), options())).rejects.toThrow(/more than/);
    await expect(safeGet(local('/stream'), options())).rejects.toThrow(/more than/);
  });

  it('gives up when it takes too long', async () => {
    await expect(safeGet(local('/slow'), options({ timeoutMs: 200 }))).rejects.toThrow(/too long/);
  });

  it('refuses anything but success', async () => {
    respond = () => ({ status: 404, body: 'missing' });
    await expect(safeGet(local('/missing'), options())).rejects.toThrow(/404/);
  });

  it('refuses a redirect with nowhere to go', async () => {
    respond = () => ({ status: 302 });
    await expect(safeGet(local('/nowhere'), options())).rejects.toThrow(/nowhere/);
  });
});
