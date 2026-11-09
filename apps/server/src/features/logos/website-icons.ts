import { LOGO_MAX_BYTES, logoProblem } from '@remidy/domain';
import type { Fetch } from './fetch.ts';

/** How much of a page is read to find its icons, which are listed near the top. */
const PAGE_MAX_BYTES = 512 * 1024;
/** How many icons are tried before giving up. */
const MOST_TRIED = 4;

const ATTRIBUTE = /([a-z-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/gi;

function attributesOf(tag: string): Map<string, string> {
  const attributes = new Map<string, string>();
  for (const match of tag.matchAll(ATTRIBUTE)) {
    const [, name = '', double, single, bare] = match;
    attributes.set(name.toLowerCase(), double ?? single ?? bare ?? '');
  }
  return attributes;
}

/** The largest size an icon says it is, so bigger, sharper ones are tried first. */
function sizeOf(sizes: string | undefined, fallback: number): number {
  const found = [...(sizes ?? '').matchAll(/(\d+)x(\d+)/gi)].map((match) => Number(match[1]));
  return found.length > 0 ? Math.max(...found) : fallback;
}

/**
 * The icons a page lists, best first, then the usual `/favicon.ico`. SVG icons are left out,
 * because Remidy never keeps SVG.
 */
export function iconCandidates(html: string, page: URL): URL[] {
  const head = html.slice(0, Math.max(0, html.search(/<\/head>/i)) || html.length);
  const found: { url: URL; size: number }[] = [];
  for (const [tag] of head.matchAll(/<link\b[^>]*>/gi)) {
    const attributes = attributesOf(tag);
    const rel = (attributes.get('rel') ?? '').toLowerCase().split(/\s+/);
    const href = attributes.get('href');
    const isTouchIcon = rel.some((token) => token.startsWith('apple-touch-icon'));
    if (!href || !(isTouchIcon || rel.includes('icon'))) continue;
    if ((attributes.get('type') ?? '').includes('svg') || /\.svg(\?|#|$)/i.test(href)) continue;
    if (!URL.canParse(href, page)) continue;
    const url = new URL(href, page);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') continue;
    // Touch icons are made for home screens, so they're usually large and clear.
    found.push({ url, size: sizeOf(attributes.get('sizes'), isTouchIcon ? 180 : 16) });
  }
  const ordered = found.sort((a, b) => b.size - a.size).map((icon) => icon.url);
  ordered.push(new URL('/favicon.ico', page));
  const unique = [...new Map(ordered.map((url) => [url.href, url])).values()];
  return unique.slice(0, MOST_TRIED);
}

/** The website's own icon, or null when it hasn't one Remidy can keep. */
export async function findWebsiteIcon(website: string, fetch: Fetch): Promise<Buffer | null> {
  const page = new URL(website);
  let candidates = [new URL('/favicon.ico', page)];
  try {
    const response = await fetch(page, { maxBytes: PAGE_MAX_BYTES });
    if (response.contentType.includes('html')) {
      candidates = iconCandidates(response.body.toString('utf8'), response.url);
    }
  } catch {
    // The page couldn't be read, so only the usual icon is tried.
  }
  for (const candidate of candidates) {
    try {
      const { body } = await fetch(candidate, { maxBytes: LOGO_MAX_BYTES });
      if (logoProblem(body) === null) return body;
    } catch {
      // Try the next one.
    }
  }
  return null;
}
