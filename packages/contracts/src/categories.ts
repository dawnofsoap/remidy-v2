import { z } from 'zod';

export const CATEGORY_NAME_MAX = 50;

const categoryName = z
  .string()
  .trim()
  .min(1, 'Enter a name.')
  .max(CATEGORY_NAME_MAX, `Use ${String(CATEGORY_NAME_MAX)} characters or fewer.`);

export const categoryResponse = z.object({
  id: z.string(),
  name: z.string(),
  /** Hidden from choices for new bills, but kept for history. */
  archived: z.boolean(),
});
export type CategoryResponse = z.infer<typeof categoryResponse>;

export const categoryParams = z.object({
  categoryId: z.uuid('That isn’t a valid category.'),
});

export const createCategoryRequest = z.object({ name: categoryName });

export const updateCategoryRequest = z.object({
  name: categoryName.optional(),
  archived: z.boolean().optional(),
});
