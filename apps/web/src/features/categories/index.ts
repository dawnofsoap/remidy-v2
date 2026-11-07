import { defineFeature } from '../../core/feature.ts';
import { CategoriesSection } from './components/CategoriesSection.tsx';

/** Bill categories, managed in Household, or in Settings for someone without a household. */
export const categories = defineFeature({
  name: 'categories',
  routes: [],
  nav: [],
  spaceSettings: [{ slug: 'categories', title: 'Categories', component: CategoriesSection }],
});

// For other features, such as Bills, to offer categories to choose from.
export { categoriesKey, fetchCategories, type Category } from './api.ts';
