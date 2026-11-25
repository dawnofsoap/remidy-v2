import {
  importPreviewRequest,
  importPreviewResponse,
  importRequest,
  importResponse,
} from '@remidy/contracts';
import { defineRoute, type FeatureDependencies } from '../../core/feature.ts';
import { importBills, previewImport } from './repo.ts';

// v1 kept logos inside each bill, so an export can be a few megabytes.
const EXPORT_BODY_BYTES = 20 * 1024 * 1024;
const IMPORTS_PER_MINUTE = 10;

// Signed in rather than a space's role: a file can hold personal and household bills, and the
// import checks the person can add to each space it writes to.
export const importRoutes = ({ database: { orm } }: FeatureDependencies) => [
  defineRoute({
    method: 'POST',
    url: '/api/v1/imports/preview',
    access: 'signed-in',
    bodyLimit: EXPORT_BODY_BYTES,
    requestsPerMinute: IMPORTS_PER_MINUTE,
    body: importPreviewRequest,
    response: importPreviewResponse,
    handler: ({ user, body }) => previewImport(orm, user.userId, body.file),
  }),
  defineRoute({
    method: 'POST',
    url: '/api/v1/imports',
    access: 'signed-in',
    bodyLimit: EXPORT_BODY_BYTES,
    requestsPerMinute: IMPORTS_PER_MINUTE,
    body: importRequest,
    response: importResponse,
    status: 201,
    handler: ({ user, body }) => importBills(orm, user.userId, body),
  }),
];
