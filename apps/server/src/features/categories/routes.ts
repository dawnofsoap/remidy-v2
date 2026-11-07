import {
  categoryParams,
  categoryResponse,
  createCategoryRequest,
  updateCategoryRequest,
} from '@remidy/contracts';
import { z } from 'zod';
import { defineRoute, type FeatureDependencies } from '../../core/feature.ts';
import { createCategory, deleteCategory, listCategories, updateCategory } from './repo.ts';

const BASE = '/api/v1/spaces/:spaceId/categories';

export const categoryRoutes = ({ database: { orm } }: FeatureDependencies) => [
  defineRoute({
    method: 'GET',
    url: BASE,
    access: { space: 'member' },
    response: z.array(categoryResponse),
    handler: ({ space }) => listCategories(orm, space.id),
  }),
  defineRoute({
    method: 'POST',
    url: BASE,
    access: { space: 'manager' },
    body: createCategoryRequest,
    response: categoryResponse,
    status: 201,
    handler: ({ space, user, body }) => createCategory(orm, space.id, user.userId, body.name),
  }),
  defineRoute({
    method: 'PATCH',
    url: `${BASE}/:categoryId`,
    access: { space: 'manager' },
    params: categoryParams,
    body: updateCategoryRequest,
    response: categoryResponse,
    handler: ({ space, user, params, body }) =>
      updateCategory(orm, space.id, params.categoryId, user.userId, body),
  }),
  defineRoute({
    method: 'DELETE',
    url: `${BASE}/:categoryId`,
    access: { space: 'manager' },
    params: categoryParams,
    response: z.null(),
    status: 204,
    handler: async ({ space, user, params }) => {
      await deleteCategory(orm, space.id, params.categoryId, user.userId);
      return null;
    },
  }),
];
