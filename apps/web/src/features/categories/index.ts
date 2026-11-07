import { defineFeature } from '../../core/feature.ts';
import { CategoriesSection } from './components/CategoriesSection.tsx';

/** Each space's bill categories, managed from Settings. */
export const categories = defineFeature({
  name: 'categories',
  // Off until it's been tried for real.
  flagged: true,
  routes: [],
  nav: [],
  settings: [{ title: 'Categories', component: CategoriesSection }],
});
