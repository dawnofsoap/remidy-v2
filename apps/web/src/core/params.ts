import { useParams } from '@tanstack/react-router';

/** A part of the current address, such as a space's id, or undefined if the page has none. */
export function useAddressPart(name: string): string | undefined {
  // The routes come from features, so the router can't know their parameters' types.
  const params: unknown = useParams({ strict: false });
  if (typeof params !== 'object' || params === null) return undefined;
  const value: unknown = (params as Record<string, unknown>)[name];
  return typeof value === 'string' ? value : undefined;
}
