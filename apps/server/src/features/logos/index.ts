import { defineFeature, type Feature } from '../../core/feature.ts';
import { defineJob } from '../../core/jobs.ts';
import type { Fetch } from './fetch.ts';
import { deleteUnusedLogos } from './repo.ts';
import { logoRoutes } from './routes.ts';

export { logoExists, storeLogo } from './repo.ts';
export { drawSampleLogo, type SampleShape } from './sample-logos.ts';

/**
 * Company logos shown beside bills: found on Logo.dev or the bill's website, or uploaded, then
 * stored once and served from Remidy. Tests give their own `makeFetch`, so nothing reaches the
 * internet.
 */
export function logosFeature(makeFetch?: (signal: AbortSignal) => Fetch): Feature {
  return defineFeature({
    name: 'logos',
    routes: (dependencies) => logoRoutes(dependencies, makeFetch),
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
}

export const logos = logosFeature();
