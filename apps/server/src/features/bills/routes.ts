import {
  AGENDA_MAX_DAYS,
  agendaQuery,
  agendaResponse,
  billParams,
  billResponse,
  createBillRequest,
  moveBillRequest,
  updateBillRequest,
} from '@remidy/contracts';
import { z } from 'zod';
import { defineRoute, type FeatureDependencies } from '../../core/feature.ts';
import {
  agenda,
  checkRange,
  createBill,
  deleteBill,
  listBills,
  moveBill,
  updateBill,
} from './repo.ts';

const SPACE_BILLS = '/api/v1/spaces/:spaceId/bills';

export const billRoutes = ({ database: { orm } }: FeatureDependencies) => [
  // Reading covers every space the person belongs to, so nothing hides behind a choice of space.
  defineRoute({
    method: 'GET',
    url: '/api/v1/bills',
    access: 'signed-in',
    response: z.array(billResponse),
    handler: ({ user }) => listBills(orm, user.userId),
  }),
  defineRoute({
    method: 'GET',
    url: '/api/v1/agenda',
    access: 'signed-in',
    query: agendaQuery,
    response: agendaResponse,
    handler: ({ user, query }) => {
      const { from, to } = checkRange(query.from, query.to, AGENDA_MAX_DAYS);
      return agenda(orm, user.userId, from, to);
    },
  }),
  // Changing goes through the bill's space, so the usual role check applies.
  defineRoute({
    method: 'POST',
    url: SPACE_BILLS,
    access: { space: 'manager' },
    body: createBillRequest,
    response: billResponse,
    status: 201,
    handler: ({ space, user, body }) => createBill(orm, space.id, user.userId, body),
  }),
  defineRoute({
    method: 'PATCH',
    url: `${SPACE_BILLS}/:billId`,
    access: { space: 'manager' },
    params: billParams,
    body: updateBillRequest,
    response: billResponse,
    handler: ({ space, user, params, body }) =>
      updateBill(orm, space.id, params.billId, user.userId, body),
  }),
  defineRoute({
    method: 'POST',
    url: `${SPACE_BILLS}/:billId/move`,
    access: { space: 'manager' },
    params: billParams,
    body: moveBillRequest,
    response: billResponse,
    handler: ({ space, user, params, body }) =>
      moveBill(orm, space.id, params.billId, user.userId, body.toSpaceId),
  }),
  defineRoute({
    method: 'DELETE',
    url: `${SPACE_BILLS}/:billId`,
    access: { space: 'manager' },
    params: billParams,
    response: z.null(),
    status: 204,
    handler: async ({ space, user, params }) => {
      await deleteBill(orm, space.id, params.billId, user.userId);
      return null;
    },
  }),
];
