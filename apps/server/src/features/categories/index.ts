import { defineFeature } from '../../core/feature.ts';
import { categoryRoutes } from './routes.ts';

/** Each space's list of bill categories. New spaces get a starter set from the database. */
export const categories = defineFeature({
  name: 'categories',
  routes: categoryRoutes,
});

// For other features: Bills' sample data picks categories by name, and the v1 import adds them.
export { createCategory, listCategories } from './repo.ts';
