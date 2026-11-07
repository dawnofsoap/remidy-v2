import { categoryResponse, type CategoryResponse } from '@remidy/contracts';
import { z } from 'zod';
import { apiRequest } from '../../core/session.ts';

export type Category = CategoryResponse;

const base = (spaceId: string) => `/api/v1/spaces/${spaceId}/categories`;

export const categoriesKey = (spaceId: string) => ['categories', spaceId];

export const fetchCategories = (spaceId: string, signal: AbortSignal) =>
  apiRequest('GET', base(spaceId), { schema: z.array(categoryResponse), signal });

export const createCategory = (spaceId: string, name: string) =>
  apiRequest('POST', base(spaceId), { body: { name }, schema: categoryResponse });

export const updateCategory = (
  spaceId: string,
  id: string,
  changes: { name?: string; archived?: boolean },
) => apiRequest('PATCH', `${base(spaceId)}/${id}`, { body: changes, schema: categoryResponse });

export const deleteCategory = (spaceId: string, id: string) =>
  apiRequest('DELETE', `${base(spaceId)}/${id}`);
