import {
  logoDevSettingRequest,
  logoDevSettingResponse,
  logoParams,
  logoSuggestRequest,
  logoSuggestResponse,
  logoUploadRequest,
  logoUploadResponse,
} from '@remidy/contracts';
import { z } from 'zod';
import { AppError } from '../../core/errors.ts';
import { defineRoute, imageResponse, type FeatureDependencies } from '../../core/feature.ts';
import {
  removeSetting,
  secretSettingInfo,
  writeSecretSetting,
} from '../../core/instance-settings.ts';
import { guardedFetch, type Fetch } from './fetch.ts';
import { LOGO_DEV_SETTING } from './logo-dev.ts';
import { readLogo, storeLogo } from './repo.ts';
import { suggestLogos } from './suggest.ts';

const NOT_FOUND = new AppError(404, 'not_found', 'That logo wasn’t found.');

// A logo never changes once stored, so the browser can keep it. Private, because it's only for
// people who are signed in.
const KEEP_FOR_A_YEAR = 'private, max-age=31536000, immutable';
/** The whole search for logos, however many sites it asks. */
const SEARCH_SECONDS = 8;
/** Finding and uploading reach out or store files, so they're limited more than reading. */
const CHANGES_PER_MINUTE = 30;
/** Room for a 256 KB image written as base64, and the JSON around it. */
const UPLOAD_BODY_BYTES = 400 * 1024;

export const logoRoutes = (
  { database: { orm }, encryptor }: FeatureDependencies,
  makeFetch: (signal: AbortSignal) => Fetch = guardedFetch,
) => [
  // Any signed-in person can load a logo by its ID. IDs are random, so they can't be listed, and a
  // logo isn't private: it's a company's public image.
  defineRoute({
    method: 'GET',
    url: '/api/v1/logos/:logoId',
    access: 'signed-in',
    params: logoParams,
    response: imageResponse,
    handler: async ({ params }) => {
      const found = await readLogo(orm, params.logoId);
      if (!found) throw NOT_FOUND;
      return { body: found.bytes, type: found.contentType, cacheControl: KEEP_FOR_A_YEAR };
    },
  }),
  defineRoute({
    method: 'POST',
    url: '/api/v1/logos/suggest',
    access: 'signed-in',
    requestsPerMinute: CHANGES_PER_MINUTE,
    body: logoSuggestRequest,
    response: logoSuggestResponse,
    handler: async ({ body }) => ({
      options: await suggestLogos(body, {
        orm,
        encryptor,
        fetch: makeFetch(AbortSignal.timeout(SEARCH_SECONDS * 1000)),
      }),
    }),
  }),
  defineRoute({
    method: 'POST',
    url: '/api/v1/logos',
    access: 'signed-in',
    requestsPerMinute: CHANGES_PER_MINUTE,
    bodyLimit: UPLOAD_BODY_BYTES,
    body: logoUploadRequest,
    response: logoUploadResponse,
    status: 201,
    handler: async ({ body }) => ({
      logoId: await storeLogo(orm, Buffer.from(body.image, 'base64')),
    }),
  }),
  // Instance admins set up Logo.dev. The keys are stored encrypted and never sent back.
  defineRoute({
    method: 'GET',
    url: '/api/v1/admin/settings/logo-dev',
    access: 'instance-admin',
    response: logoDevSettingResponse,
    handler: () => secretSettingInfo(orm, LOGO_DEV_SETTING),
  }),
  defineRoute({
    method: 'PUT',
    url: '/api/v1/admin/settings/logo-dev',
    access: 'instance-admin',
    body: logoDevSettingRequest,
    response: logoDevSettingResponse,
    handler: async ({ body, user, request }) => {
      await writeSecretSetting(orm, encryptor, LOGO_DEV_SETTING, JSON.stringify(body), user.userId);
      request.log.info({ userId: user.userId }, 'The Logo.dev keys were set');
      return secretSettingInfo(orm, LOGO_DEV_SETTING);
    },
  }),
  defineRoute({
    method: 'DELETE',
    url: '/api/v1/admin/settings/logo-dev',
    access: 'instance-admin',
    response: z.null(),
    status: 204,
    handler: async ({ user, request }) => {
      await removeSetting(orm, LOGO_DEV_SETTING);
      request.log.info({ userId: user.userId }, 'The Logo.dev keys were removed');
      return null;
    },
  }),
];
