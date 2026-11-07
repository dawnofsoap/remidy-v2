import { defineFeature } from '../../core/feature.ts';
import { categoryRoutes } from './routes.ts';

/** Each space's list of bill categories. New spaces get a starter set from the database. */
export const categories = defineFeature({
  name: 'categories',
  routes: categoryRoutes,
});

// For other features' sample data, such as Bills, to pick categories by name.
export { listCategories } from './repo.ts';
