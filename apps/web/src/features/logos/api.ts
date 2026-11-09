import {
  logoDevSettingResponse,
  logoSuggestResponse,
  logoUploadResponse,
  type LogoDevSettingRequest,
} from '@remidy/contracts';
import { apiRequest } from '../../core/session.ts';

/** Where a logo loads from, or null for a lettered tile. */
export const logoUrl = (logoId: string | null): string | null =>
  logoId ? `/api/v1/logos/${encodeURIComponent(logoId)}` : null;

export const suggestLogos = (name: string, url: string | null, signal?: AbortSignal) =>
  apiRequest('POST', '/api/v1/logos/suggest', {
    body: { name, url },
    schema: logoSuggestResponse,
    ...(signal ? { signal } : {}),
  });

/** Reads a chosen file and uploads it. The server checks it's an image it keeps. */
export async function uploadLogo(file: Blob): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const { logoId } = await apiRequest('POST', '/api/v1/logos', {
    body: { image: btoa(binary) },
    schema: logoUploadResponse,
  });
  return logoId;
}

const LOGO_DEV = '/api/v1/admin/settings/logo-dev';
export const LOGO_DEV_KEY = ['admin', 'logo-dev'];

export const fetchLogoDevSetting = ({ signal }: { signal: AbortSignal }) =>
  apiRequest('GET', LOGO_DEV, { schema: logoDevSettingResponse, signal });

export const saveLogoDevKeys = (keys: LogoDevSettingRequest) =>
  apiRequest('PUT', LOGO_DEV, { body: keys, schema: logoDevSettingResponse });

export const removeLogoDevKeys = () => apiRequest('DELETE', LOGO_DEV);
