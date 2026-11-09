import { safeGet, type SafeResponse } from '../../core/outbound.ts';

/** Fetches a public address. Tests swap in their own, so nothing reaches the internet. */
export type Fetch = (
  url: URL,
  options: { maxBytes: number; headers?: Record<string, string> },
) => Promise<SafeResponse>;

/** Fetches through the guarded fetcher, giving up when the whole search runs out of time. */
export const guardedFetch =
  (signal: AbortSignal): Fetch =>
  (url, options) =>
    safeGet(url, { ...options, signal });
