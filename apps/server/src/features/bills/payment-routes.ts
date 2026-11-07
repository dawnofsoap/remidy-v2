import {
  billParams,
  historyResponse,
  occurrenceParams,
  paymentParams,
  paymentResponse,
  recordPaymentRequest,
  voidPaymentRequest,
} from '@remidy/contracts';
import { z } from 'zod';
import { defineRoute, type FeatureDependencies } from '../../core/feature.ts';
import { billHistory, recordPayment, setSkipped, voidPayment } from './payments.repo.ts';

const SPACE = '/api/v1/spaces/:spaceId';
const skipResponse = z.object({ state: z.enum(['open', 'settled', 'skipped']) });

// Anyone in a space can pay its bills. Changing the bills themselves needs a manager.
export const paymentRoutes = ({ database: { orm } }: FeatureDependencies) => [
  defineRoute({
    method: 'POST',
    url: `${SPACE}/occurrences/:occurrenceId/payments`,
    access: { space: 'member' },
    params: occurrenceParams,
    body: recordPaymentRequest,
    response: paymentResponse,
    status: 201,
    handler: ({ space, user, params, body }) =>
      recordPayment(orm, space.id, params.occurrenceId, user.userId, body),
  }),
  defineRoute({
    method: 'POST',
    url: `${SPACE}/payments/:paymentId/void`,
    access: { space: 'member' },
    params: paymentParams,
    body: voidPaymentRequest,
    response: paymentResponse,
    handler: ({ space, user, params, body }) =>
      voidPayment(orm, space.id, params.paymentId, user.userId, body.reason),
  }),
  defineRoute({
    method: 'POST',
    url: `${SPACE}/occurrences/:occurrenceId/skip`,
    access: { space: 'member' },
    params: occurrenceParams,
    response: skipResponse,
    handler: ({ space, user, params }) =>
      setSkipped(orm, space.id, params.occurrenceId, user.userId, true),
  }),
  defineRoute({
    method: 'POST',
    url: `${SPACE}/occurrences/:occurrenceId/unskip`,
    access: { space: 'member' },
    params: occurrenceParams,
    response: skipResponse,
    handler: ({ space, user, params }) =>
      setSkipped(orm, space.id, params.occurrenceId, user.userId, false),
  }),
  defineRoute({
    method: 'GET',
    url: `${SPACE}/bills/:billId/history`,
    access: { space: 'member' },
    params: billParams,
    response: historyResponse,
    handler: ({ space, params }) => billHistory(orm, space.id, params.billId),
  }),
];
