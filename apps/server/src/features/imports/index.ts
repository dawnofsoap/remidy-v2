import { defineFeature } from '../../core/feature.ts';
import { importRoutes } from './routes.ts';

/** Importing bills and categories from v1's data export, reviewed before anything is saved. */
export const imports = defineFeature({
  name: 'imports',
  // Off until the review screen is finished and tried with a real export.
  flagged: true,
  routes: importRoutes,
});
