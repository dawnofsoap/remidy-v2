import {
  importPreviewResponse,
  importResponse,
  type ImportPreviewResponse,
  type ImportResponse,
} from '@remidy/contracts';
import { apiRequest } from '../../core/session.ts';

/** Thrown when the chosen file isn't JSON, so the person hears about it before anything is sent. */
export class NotJsonFile extends Error {
  override name = 'NotJsonFile';
}

/** Reads the chosen file. The server decides whether it's a v1 export. */
export async function readExportFile(file: Blob): Promise<unknown> {
  try {
    return JSON.parse(await file.text()) as unknown;
  } catch {
    throw new NotJsonFile('That file isn’t a v1 export. In v1, export your data from Settings.');
  }
}

/** What importing the file would create. Nothing is saved. */
export const previewImport = (file: unknown): Promise<ImportPreviewResponse> =>
  apiRequest('POST', '/api/v1/imports/preview', { body: { file }, schema: importPreviewResponse });

/** Imports the chosen bills, all together or none. */
export const importBills = (
  file: unknown,
  bills: { index: number; shared: boolean }[],
): Promise<ImportResponse> =>
  apiRequest('POST', '/api/v1/imports', { body: { file, bills }, schema: importResponse });
