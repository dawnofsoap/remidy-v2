import { z } from 'zod';

// Matches LOGO_MAX_BYTES in @remidy/domain: 256 KB, written as base64.
const LOGO_MAX_BASE64 = Math.ceil((256 * 1024) / 3) * 4;

export const logoParams = z.object({ logoId: z.uuid('That isn’t a valid logo.') });

/** Finds logos for a bill from its name and website. */
export const logoSuggestRequest = z.object({
  name: z.string().trim().min(1, 'Enter a name.').max(100, 'Use 100 characters or fewer.'),
  url: z
    .url({ protocol: /^https?$/, error: 'Use a web address starting with https://' })
    .max(500, 'That address is too long.')
    .nullable()
    .default(null),
});

export const logoOption = z.object({
  logoId: z.string(),
  /** Whose logo it is, such as a company name or website. */
  label: z.string(),
  source: z.enum(['logo.dev', 'website']),
});
export type LogoOption = z.infer<typeof logoOption>;

export const logoSuggestResponse = z.object({ options: z.array(logoOption) });
export type LogoSuggestResponse = z.infer<typeof logoSuggestResponse>;

/** An image someone chose themselves. Its type is checked from its bytes, not from this. */
export const logoUploadRequest = z.object({
  image: z.base64('That isn’t an image.').max(LOGO_MAX_BASE64, 'Use an image of 256 KB or less.'),
});
export const logoUploadResponse = z.object({ logoId: z.string() });

/** Whether Logo.dev is set up. The keys themselves are never sent back. */
export const logoDevSettingResponse = z.object({
  configured: z.boolean(),
  updatedAt: z.string().nullable(),
});
export type LogoDevSettingResponse = z.infer<typeof logoDevSettingResponse>;

export const logoDevSettingRequest = z.object({
  publishableKey: z
    .string()
    .trim()
    .regex(/^pk_[A-Za-z0-9_-]{8,200}$/, 'A publishable key starts with pk_.'),
  secretKey: z
    .string()
    .trim()
    .regex(/^sk_[A-Za-z0-9_-]{8,200}$/, 'A secret key starts with sk_.'),
});
export type LogoDevSettingRequest = z.infer<typeof logoDevSettingRequest>;
