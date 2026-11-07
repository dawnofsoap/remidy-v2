import { defineFeature } from '../../core/feature.ts';
import { categoryRoutes } from './routes.ts';

/** Each space's list of bill categories. New spaces get a starter set from the database. */
export const categories = defineFeature({
  name: 'categories',
  routes: categoryRoutes,
});
