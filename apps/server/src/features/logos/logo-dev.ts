import { LOGO_MAX_BYTES, logoProblem } from '@remidy/domain';
import type { Fetch } from './fetch.ts';

/**
 * Logo.dev, a logo service an admin can set up. Searching sends the bill's name to it, and an
 * image is then fetched for each company it finds. Its free plan asks commercial projects to link
 * back to it, and a self-hosted household instance is personal use.
 */

export const LOGO_DEV_SETTING = 'logo-dev';
const MOST_OFFERED = 6;
const SEARCH_MAX_BYTES = 64 * 1024;
// A domain name only, so nothing from the search can change the address it's put into.
const DOMAIN = /^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

export interface LogoDevKeys {
  publishableKey: string;
  secretKey: string;
}

export interface Brand {
  name: string;
  domain: string;
}

/** The companies Logo.dev finds for a name, as their names and domains. */
export async function searchLogoDev(
  name: string,
  keys: LogoDevKeys,
  fetch: Fetch,
): Promise<Brand[]> {
  const url = new URL('https://api.logo.dev/search');
  url.searchParams.set('q', name);
  const response = await fetch(url, {
    maxBytes: SEARCH_MAX_BYTES,
    headers: { authorization: `Bearer ${keys.secretKey}`, accept: 'application/json' },
  });
  const found: unknown = JSON.parse(response.body.toString('utf8'));
  if (!Array.isArray(found)) return [];
  const brands: Brand[] = [];
  for (const item of found as unknown[]) {
    if (typeof item !== 'object' || item === null) continue;
    const { name: brandName, domain } = item as { name?: unknown; domain?: unknown };
    if (typeof domain !== 'string') continue;
    const cleaned = domain.trim().toLowerCase();
    if (!DOMAIN.test(cleaned) || brands.some((brand) => brand.domain === cleaned)) continue;
    brands.push({
      domain: cleaned,
      name:
        typeof brandName === 'string' && brandName.trim()
          ? brandName.trim().slice(0, 100)
          : cleaned,
    });
    if (brands.length === MOST_OFFERED) break;
  }
  return brands;
}

/** A company's logo from Logo.dev, or null when it has none Remidy can keep. */
export async function logoDevImage(
  domain: string,
  keys: LogoDevKeys,
  fetch: Fetch,
): Promise<Buffer | null> {
  if (!DOMAIN.test(domain)) return null;
  const url = new URL(`https://img.logo.dev/${domain}`);
  url.searchParams.set('token', keys.publishableKey);
  url.searchParams.set('size', '128');
  url.searchParams.set('format', 'png');
  // Without this, an unknown company gets a made-up lettered image, which the tile already does.
  url.searchParams.set('fallback', '404');
  try {
    const { body } = await fetch(url, { maxBytes: LOGO_MAX_BYTES });
    return logoProblem(body) === null ? body : null;
  } catch {
    return null;
  }
}

/** Reads stored keys, refusing anything that isn't both. */
export function parseLogoDevKeys(stored: string | null): LogoDevKeys | null {
  if (!stored) return null;
  try {
    const value: unknown = JSON.parse(stored);
    if (typeof value !== 'object' || value === null) return null;
    const { publishableKey, secretKey } = value as Partial<LogoDevKeys>;
    return typeof publishableKey === 'string' && typeof secretKey === 'string'
      ? { publishableKey, secretKey }
      : null;
  } catch {
    return null;
  }
}
