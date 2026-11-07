import { defineFeature } from '../../core/feature.ts';
import { defineJob } from '../../core/jobs.ts';
import { extendDueDates } from './repo.ts';
import { billRoutes } from './routes.ts';
import { addSampleBills } from './sample-data.ts';

/** Bills and each time they're due. */
export const bills = defineFeature({
  name: 'bills',
  // Off until the screens are finished and tried for real.
  flagged: true,
  routes: billRoutes,
  sampleData: addSampleBills,
  jobs: ({ database }) => [
    defineJob({
      name: 'bill-due-dates',
      description: 'Adds upcoming due dates, so bills always show 13 months ahead.',
      cron: '7 * * * *',
      everyMinutes: 60,
      run: () => extendDueDates(database.orm),
    }),
  ],
});
