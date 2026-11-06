import { secret } from '../other/internal.ts';
import { createDatabase } from '@remidy/db';

export const createdAt = new Date();
export const amount = parseFloat('10.50');
export const value = secret;
export const database = createDatabase('postgres://example');
