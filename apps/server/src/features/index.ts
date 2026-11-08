import type { Feature } from '../core/feature.ts';
import { bills } from './bills/index.ts';
import { categories } from './categories/index.ts';
import { logos } from './logos/index.ts';
import { spaces } from './spaces/index.ts';

// Every server feature is registered here, on one line each.
export const features: Feature[] = [spaces, categories, logos, bills];
