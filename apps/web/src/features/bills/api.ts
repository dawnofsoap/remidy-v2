import {
  agendaResponse,
  billResponse,
  historyResponse,
  paymentResponse,
  totalsResponse,
  type BillResponse,
  type BillScheduleInput,
} from '@remidy/contracts';
import { z } from 'zod';
import { apiRequest } from '../../core/session.ts';

export type Bill = BillResponse;

/** What the bill form sends. The space decides whether the bill is personal or shared. */
export interface BillInput {
  name: string;
  expectedCents: number | null;
  isVariable: boolean;
  schedule: BillScheduleInput;
  categoryId: string | null;
  autopay: boolean;
  url: string | null;
  notes: string | null;
}

/** Where a bill's logo loads from, or null for a lettered tile. */
export const logoUrl = (logoId: string | null): string | null =>
  logoId ? `/api/v1/logos/${encodeURIComponent(logoId)}` : null;

export const BILLS_KEY = ['bills'];
/** Everything that shows due dates, so it can all be refreshed after a change. */
export const AGENDA_KEY = ['agenda'];

export const fetchBills = (signal: AbortSignal) =>
  apiRequest('GET', '/api/v1/bills', { schema: z.array(billResponse), signal });

export const fetchAgenda = (from: string, to: string, signal: AbortSignal) =>
  apiRequest('GET', `/api/v1/agenda?from=${from}&to=${to}`, { schema: agendaResponse, signal });

const spaceBills = (spaceId: string) => `/api/v1/spaces/${spaceId}/bills`;

export const createBill = (spaceId: string, input: BillInput) =>
  apiRequest('POST', spaceBills(spaceId), { body: input, schema: billResponse });

export const updateBill = (
  spaceId: string,
  id: string,
  changes: Partial<BillInput> & { archived?: boolean },
) => apiRequest('PATCH', `${spaceBills(spaceId)}/${id}`, { body: changes, schema: billResponse });

/** Moves a bill between the person's personal space and their household, with its history. */
export const moveBill = (spaceId: string, id: string, toSpaceId: string) =>
  apiRequest('POST', `${spaceBills(spaceId)}/${id}/move`, {
    body: { toSpaceId },
    schema: billResponse,
  });

export const deleteBill = (spaceId: string, id: string) =>
  apiRequest('DELETE', `${spaceBills(spaceId)}/${id}`);

export const HISTORY_KEY = (billId: string) => ['bill-history', billId];
export const TOTALS_KEY = ['totals'];

export const fetchTotals = (from: string, to: string, signal: AbortSignal) =>
  apiRequest('GET', `/api/v1/totals?from=${from}&to=${to}`, { schema: totalsResponse, signal });

export const fetchHistory = (spaceId: string, billId: string, signal: AbortSignal) =>
  apiRequest('GET', `/api/v1/spaces/${spaceId}/bills/${billId}/history`, {
    schema: historyResponse,
    signal,
  });

export interface PaymentInput {
  paidOn: string;
  amountCents: number;
  confirmation: string | null;
  notes: string | null;
}

export const recordPayment = (spaceId: string, occurrenceId: string, input: PaymentInput) =>
  apiRequest('POST', `/api/v1/spaces/${spaceId}/occurrences/${occurrenceId}/payments`, {
    body: input,
    schema: paymentResponse,
  });

export const voidPayment = (spaceId: string, paymentId: string, reason: string) =>
  apiRequest('POST', `/api/v1/spaces/${spaceId}/payments/${paymentId}/void`, {
    body: { reason },
    schema: paymentResponse,
  });

export const setSkipped = (spaceId: string, occurrenceId: string, skipped: boolean) =>
  apiRequest(
    'POST',
    `/api/v1/spaces/${spaceId}/occurrences/${occurrenceId}/${skipped ? 'skip' : 'unskip'}`,
  );
