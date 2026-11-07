import { defineFeature } from '../../core/feature.ts';
import { CategoriesSection } from './components/CategoriesSection.tsx';

/** Bill categories, managed in Household, or in Settings for someone without a household. */
export const categories = defineFeature({
  name: 'categories',
  // Off until it's been tried for real.
  flagged: true,
  routes: [],
  nav: [],
  spaceSettings: [{ slug: 'categories', title: 'Categories', component: CategoriesSection }],
});
