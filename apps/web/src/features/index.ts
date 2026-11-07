import type { WebFeature } from '../core/feature.ts';
import { admin } from './admin/index.tsx';
import { bills } from './bills/index.ts';
import { categories } from './categories/index.ts';
import { home } from './home/index.tsx';
import { settings } from './settings/index.tsx';
import { household } from './household/index.tsx';

// Every web feature is registered here, on one line each, in navigation order.
export const features: WebFeature[] = [home, bills, household, settings, admin, categories];
