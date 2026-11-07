import { defineFeature } from '../../core/feature.ts';
import { CategoriesSection } from './components/CategoriesSection.tsx';

/** Each space's bill categories, managed from Space settings. */
export const categories = defineFeature({
  name: 'categories',
  // Off until it's been tried for real.
  flagged: true,
  routes: [],
  nav: [],
  spaceSettings: [{ slug: 'categories', title: 'Categories', component: CategoriesSection }],
});
