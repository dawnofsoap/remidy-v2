import { lookup as resolveName } from 'node:dns/promises';
import http from 'node:http';
import https from 'node:https';
import { BlockList, isIP, type LookupFunction } from 'node:net';

/**
 * Fetching from addresses people give Remidy, such as a bill's website, without letting that reach
 * anything private: the server itself, the home network it runs on, or a cloud provider's metadata
 * service. Every address is checked, the connection uses the address that was checked, and each
 * redirect is checked the same way.
 */

// Two lists, because Node also checks IPv4 addresses against IPv6 rules written for mapped ones.
const blockedV4 = new BlockList();
const blockedV6 = new BlockList();
const IPV4_BLOCKED: [string, number][] = [
  ['0.0.0.0', 8], // "this network"
  ['10.0.0.0', 8], // private
  ['100.64.0.0', 10], // carrier-grade NAT
  ['127.0.0.0', 8], // loopback
  ['169.254.0.0', 16], // link-local, including cloud metadata services
  ['172.16.0.0', 12], // private
  ['192.0.0.0', 24], // protocol assignments
  ['192.0.2.0', 24], // documentation
  ['192.88.99.0', 24], // 6to4 relay
  ['192.168.0.0', 16], // private
  ['198.18.0.0', 15], // benchmarking
  ['198.51.100.0', 24], // documentation
  ['203.0.113.0', 24], // documentation
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // reserved, and broadcast
];
const IPV6_BLOCKED: [string, number][] = [
  ['::', 128], // unspecified
  ['::1', 128], // loopback
  ['::ffff:0:0', 96], // IPv4-mapped, which could hide any IPv4 address
  ['64:ff9b::', 96], // NAT64, which embeds IPv4 addresses
  ['64:ff9b:1::', 48], // local NAT64
  ['100::', 64], // discard
  ['2001::', 23], // protocol assignments, including Teredo
  ['2001:db8::', 32], // documentation
  ['2002::', 16], // 6to4, which embeds IPv4 addresses
  ['fc00::', 7], // unique local, the IPv6 private range
  ['fe80::', 10], // link-local
  ['fec0::', 10], // old site-local
  ['ff00::', 8], // multicast
];
for (const [network, prefix] of IPV4_BLOCKED) blockedV4.addSubnet(network, prefix, 'ipv4');
for (const [network, prefix] of IPV6_BLOCKED) blockedV6.addSubnet(network, prefix, 'ipv6');

/** Whether an address is on the public internet. Anything that isn't an address is refused. */
export function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 0) return false;
  return family === 4 ? !blockedV4.check(address, 'ipv4') : !blockedV6.check(address, 'ipv6');
}

/** Why a fetch was refused or failed, in words safe to log. Never says what was sent back. */
export class OutboundError extends Error {
  override name = 'OutboundError';
}

export interface SafeGetOptions {
  /** The most it reads before giving up. */
  maxBytes: number;
  /** For the whole fetch, redirects included. */
  timeoutMs?: number;
  /** Stops it early, such as when a search with several fetches runs out of time. */
  signal?: AbortSignal;
  headers?: Record<string, string>;
  maxRedirects?: number;
  /** Only for tests, which need a server on this computer. */
  addressAllowed?: (address: string) => boolean;
  /** Only for tests. Otherwise only the usual ports, 80 and 443, are allowed. */
  allowedPorts?: readonly number[];
}

export interface SafeResponse {
  /** Where it ended up, after any redirects. */
  url: URL;
  contentType: string;
  body: Buffer;
}

const REDIRECTS = new Set([301, 302, 303, 307, 308]);
const USER_AGENT = 'Remidy (+https://github.com/dawnofsoap/remidy-v2)';

function checkUrl(url: URL, options: SafeGetOptions) {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new OutboundError('Only web addresses can be fetched.');
  }
  if (url.username || url.password)
    throw new OutboundError('Addresses with a password aren’t fetched.');
  if (url.port !== '' && !(options.allowedPorts ?? []).includes(Number(url.port))) {
    throw new OutboundError('Only the usual web ports can be fetched.');
  }
  // An address written as numbers isn't looked up, so it's checked here.
  const host = url.hostname.replace(/^\[(.*)\]$/, '$1');
  const allowed = options.addressAllowed ?? isPublicAddress;
  if (isIP(host) !== 0 && !allowed(host)) {
    throw new OutboundError('That address is private, so it isn’t fetched.');
  }
}

/**
 * Looks a name up and refuses it if any of its addresses is private, so a name that points both
 * ways can't be used. The connection is made to the addresses returned here, so nothing can
 * change them between the check and the connection.
 */
function guardedLookup(allowed: (address: string) => boolean): LookupFunction {
  return (hostname, options, callback) => {
    resolveName(hostname, { all: true, order: 'verbatim' }).then(
      (addresses) => {
        const first = addresses[0];
        if (!first || addresses.some((entry) => !allowed(entry.address))) {
          callback(
            Object.assign(new OutboundError('That address is private, so it isn’t fetched.'), {
              code: 'EREFUSED',
            }),
            '',
          );
          return;
        }
        if (options.all) callback(null, addresses);
        else callback(null, first.address, first.family);
      },
      (error: unknown) => {
        callback(error as NodeJS.ErrnoException, '');
      },
    );
  };
}

type Answer =
  | { kind: 'redirect'; location: string | undefined }
  | { kind: 'done'; status: number; contentType: string; body: Buffer };

function requestOnce(url: URL, options: SafeGetOptions, signal: AbortSignal): Promise<Answer> {
  const transport = url.protocol === 'https:' ? https : http;
  return new Promise((resolve, reject) => {
    const request = transport.request(
      url,
      {
        method: 'GET',
        signal,
        // A new connection each time, so every one goes through the check.
        agent: false,
        lookup: guardedLookup(options.addressAllowed ?? isPublicAddress),
        headers: {
          'user-agent': USER_AGENT,
          // Compressed responses are refused, so a small download can't expand into a huge one.
          'accept-encoding': 'identity',
          ...options.headers,
        },
      },
      (response) => {
        const status = response.statusCode ?? 0;
        if (REDIRECTS.has(status)) {
          response.resume();
          resolve({ kind: 'redirect', location: response.headers.location });
          return;
        }
        const tooLarge = () => {
          response.destroy();
          reject(new OutboundError('It sent more than Remidy reads.'));
        };
        if (Number(response.headers['content-length'] ?? 0) > options.maxBytes) {
          tooLarge();
          return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        response.on('data', (chunk: Buffer) => {
          size += chunk.length;
          if (size > options.maxBytes) tooLarge();
          else chunks.push(chunk);
        });
        response.on('end', () => {
          resolve({
            kind: 'done',
            status,
            contentType: response.headers['content-type'] ?? '',
            body: Buffer.concat(chunks),
          });
        });
        response.on('error', reject);
      },
    );
    request.on('error', (error) => {
      reject(
        error instanceof OutboundError
          ? error
          : new OutboundError(signal.aborted ? 'It took too long.' : 'It couldn’t be reached.'),
      );
    });
    request.end();
  });
}

/** Fetches a public web address, refusing anything private, slow or too large. */
export async function safeGet(
  address: string | URL,
  options: SafeGetOptions,
): Promise<SafeResponse> {
  const signal = AbortSignal.any([
    AbortSignal.timeout(options.timeoutMs ?? 5000),
    ...(options.signal ? [options.signal] : []),
  ]);
  const maxRedirects = options.maxRedirects ?? 3;
  let url = new URL(address);
  for (let redirects = 0; ; redirects += 1) {
    checkUrl(url, options);
    const answer = await requestOnce(url, options, signal);
    if (answer.kind === 'redirect') {
      if (redirects >= maxRedirects) throw new OutboundError('It redirected too many times.');
      if (!answer.location || !URL.canParse(answer.location, url)) {
        throw new OutboundError('It redirected nowhere.');
      }
      url = new URL(answer.location, url);
      continue;
    }
    if (answer.status !== 200) {
      throw new OutboundError(`It answered with status ${String(answer.status)}.`);
    }
    return { url, contentType: answer.contentType, body: answer.body };
  }
}
