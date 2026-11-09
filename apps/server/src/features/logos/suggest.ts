import type { LogoOption } from '@remidy/contracts';
import type { Encryptor } from '../../core/encryption.ts';
import type { FeatureDependencies } from '../../core/feature.ts';
import { readSecretSetting } from '../../core/instance-settings.ts';
import type { Fetch } from './fetch.ts';
import { LOGO_DEV_SETTING, logoDevImage, parseLogoDevKeys, searchLogoDev } from './logo-dev.ts';
import { storeLogo } from './repo.ts';
import { findWebsiteIcon } from './website-icons.ts';

export interface SuggestDependencies {
  orm: FeatureDependencies['database']['orm'];
  encryptor: Encryptor;
  fetch: Fetch;
}

async function fromLogoDev(name: string, { orm, encryptor, fetch }: SuggestDependencies) {
  const keys = parseLogoDevKeys(await readSecretSetting(orm, encryptor, LOGO_DEV_SETTING));
  if (!keys) return { configured: false, options: [] };
  let brands;
  try {
    brands = await searchLogoDev(name, keys, fetch);
  } catch {
    return { configured: true, options: [] };
  }
  const images = await Promise.all(
    brands.map(async (brand) => ({ brand, image: await logoDevImage(brand.domain, keys, fetch) })),
  );
  const options: LogoOption[] = [];
  for (const { brand, image } of images) {
    if (!image) continue;
    options.push({ logoId: await storeLogo(orm, image), label: brand.name, source: 'logo.dev' });
  }
  return { configured: true, options };
}

async function fromWebsite(url: string | null, { orm, fetch }: SuggestDependencies) {
  if (!url) return [];
  const image = await findWebsiteIcon(url, fetch);
  if (!image) return [];
  const option: LogoOption = {
    logoId: await storeLogo(orm, image),
    label: new URL(url).hostname.replace(/^www\./, ''),
    source: 'website',
  };
  return [option];
}

/**
 * Logos for a bill, from Logo.dev when it's set up and from the bill's own website. Each one found
 * is stored, so it can be shown and chosen. Ones never chosen are deleted a day later. Nothing
 * found is an empty list, never an error, so a bill can always be saved.
 */
export async function suggestLogos(
  request: { name: string; url: string | null },
  dependencies: SuggestDependencies,
): Promise<LogoOption[]> {
  const [logoDev, website] = await Promise.all([
    fromLogoDev(request.name, dependencies),
    fromWebsite(request.url, dependencies),
  ]);
  // The website's icon leads without Logo.dev, and follows its matches with it.
  const ordered = logoDev.configured
    ? [...logoDev.options, ...website]
    : [...website, ...logoDev.options];
  return [...new Map(ordered.map((option) => [option.logoId, option])).values()];
}
