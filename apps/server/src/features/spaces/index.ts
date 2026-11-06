import { spaceMemberResponse, spaceResponse, updateSpaceRequest } from '@remidy/contracts';
import { z } from 'zod';
import { AppError } from '../../core/errors.ts';
import { defineFeature, defineRoute } from '../../core/feature.ts';
import { getSpace, listMembers, listSpacesFor, updateSpace } from './repo.ts';

const NOT_FOUND = new AppError(404, 'not_found', 'That wasn’t found.');

export const spaces = defineFeature({
  name: 'spaces',
  routes: ({ database }) => [
    defineRoute({
      method: 'GET',
      url: '/api/v1/spaces',
      access: 'signed-in',
      response: z.array(spaceResponse),
      handler: ({ user }) => listSpacesFor(database.orm, user.userId),
    }),
    defineRoute({
      method: 'GET',
      url: '/api/v1/spaces/:spaceId',
      access: { space: 'member' },
      response: spaceResponse,
      handler: async ({ space }) => {
        const found = await getSpace(database.orm, space.id);
        if (!found) throw NOT_FOUND;
        return { ...found, role: space.role };
      },
    }),
    defineRoute({
      method: 'PATCH',
      url: '/api/v1/spaces/:spaceId',
      access: { space: 'manager' },
      body: updateSpaceRequest,
      response: spaceResponse,
      handler: async ({ space, body }) => {
        const updated = await updateSpace(database.orm, space.id, body);
        if (!updated) throw NOT_FOUND;
        return { ...updated, role: space.role };
      },
    }),
    defineRoute({
      method: 'GET',
      url: '/api/v1/spaces/:spaceId/members',
      access: { space: 'member' },
      response: z.array(spaceMemberResponse),
      handler: ({ space }) => listMembers(database.orm, space.id),
    }),
  ],
});
