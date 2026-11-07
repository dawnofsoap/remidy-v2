import { readdirSync, readFileSync } from 'node:fs';
import { extname, join, relative, sep } from 'node:path';
import type { FastifyInstance } from 'fastify';

export interface WebFile {
  body: Buffer;
  type: string;
  cacheControl: string;
}

const TYPES: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.woff2': 'font/woff2',
};

// Files in assets/ have their contents in their names, so they can be kept forever.
const FOREVER = 'public, max-age=31536000, immutable';
const CHECK_EACH_TIME = 'no-cache';

/**
 * Loads the built web app once at startup. Requests can only ever pick from this list, so a crafted
 * path can't reach anything else on disk.
 */
export function loadWebFiles(root: string): Map<string, WebFile> {
  const files = new Map<string, WebFile>();
  for (const entry of readdirSync(root, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const path = join(entry.parentPath, entry.name);
    const url = `/${relative(root, path).split(sep).join('/')}`;
    files.set(url, {
      body: readFileSync(path),
      type: TYPES[extname(path)] ?? 'application/octet-stream',
      cacheControl: url.startsWith('/assets/') ? FOREVER : CHECK_EACH_TIME,
    });
  }
  if (!files.has('/index.html')) throw new Error(`${root} has no index.html. Build the web app.`);
  return files;
}

/** Serves the web app from the same address as the API. Pages all load index.html. */
export function registerWebFiles(
  app: FastifyInstance,
  files: Map<string, WebFile>,
  requestsPerMinute: number,
): void {
  const rateLimit = { max: requestsPerMinute, timeWindow: '1 minute' };

  app.get('/*', { config: { declaredRoute: true, rateLimit } }, (request, reply) => {
    const [path = '/'] = request.url.split('?');
    const isPage = !path.startsWith('/api/') && !extname(path);
    const file = files.get(path) ?? (isPage ? files.get('/index.html') : undefined);
    if (!file) {
      reply.callNotFound();
      return;
    }
    return reply.header('cache-control', file.cacheControl).type(file.type).send(file.body);
  });
}
