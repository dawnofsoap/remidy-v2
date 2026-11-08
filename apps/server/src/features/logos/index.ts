import { z } from 'zod';
import { defineFeature, defineRoute, imageResponse } from '../../core/feature.ts';
import { AppError } from '../../core/errors.ts';
import { defineJob } from '../../core/jobs.ts';
import { deleteUnusedLogos, readLogo } from './repo.ts';

export { logoExists, storeLogo } from './repo.ts';
export { drawSampleLogo, type SampleShape } from './sample-logos.ts';

const NOT_FOUND = new AppError(404, 'not_found', 'That logo wasn’t found.');

// A logo never changes once stored, so the browser can keep it. Private, because it's only for
// people who are signed in.
const KEEP_FOR_A_YEAR = 'private, max-age=31536000, immutable';

/** Company logos shown beside bills, stored once and served from Remidy. */
export const logos = defineFeature({
  name: 'logos',
  routes: ({ database: { orm } }) => [
    // Any signed-in person can load a logo by its ID. IDs are random, so they can't be listed, and a
    // logo isn't private: it's a company's public image.
    defineRoute({
      method: 'GET',
      url: '/api/v1/logos/:logoId',
      access: 'signed-in',
      params: z.object({ logoId: z.uuid('That isn’t a valid logo.') }),
      response: imageResponse,
      handler: async ({ params }) => {
        const found = await readLogo(orm, params.logoId);
        if (!found) throw NOT_FOUND;
        return { body: found.bytes, type: found.contentType, cacheControl: KEEP_FOR_A_YEAR };
      },
    }),
  ],
  jobs: ({ database }) => [
    defineJob({
      name: 'unused-logos',
      description: 'Deletes logos that no bill has used for a day.',
      cron: '41 3 * * *',
      everyMinutes: 24 * 60,
      run: async () => {
        await deleteUnusedLogos(database.orm);
      },
    }),
  ],
});
