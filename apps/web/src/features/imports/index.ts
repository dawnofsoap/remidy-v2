import { defineFeature } from '../../core/feature.ts';
import { ImportSection } from './components/ImportSection.tsx';

/** Importing bills from v1's data export, in Settings, reviewed before anything is saved. */
export const imports = defineFeature({
  name: 'imports',
  flagged: true,
  routes: [],
  nav: [],
  settings: [{ slug: 'import', title: 'Import from v1', component: ImportSection }],
});
