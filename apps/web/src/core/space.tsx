import type { SpaceResponse } from '@remidy/contracts';
import { useQuery } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';
import { useAddressPart } from './params.ts';
import { fetchSpaces } from './session.ts';

const STORAGE_KEY = 'remidy.space';
const listeners = new Set<() => void>();

function readChosen(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

/** Remembers which space the person is working in, on this device. */
export function chooseSpace(id: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // Private browsing can refuse storage. The choice then lasts until the page reloads.
  }
  listeners.forEach((listener) => {
    listener();
  });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export const SPACES_QUERY_KEY = ['spaces'];

export function useSpaces() {
  return useQuery({ queryKey: SPACES_QUERY_KEY, queryFn: fetchSpaces });
}

/**
 * The space everything is about: the one chosen in the switcher, or the personal space until
 * another is chosen. Undefined while spaces are loading.
 */
export function useCurrentSpace(): SpaceResponse | undefined {
  const spaces = useSpaces().data;
  const chosen = useSyncExternalStore(subscribe, readChosen);
  return (
    spaces?.find((space) => space.id === chosen) ??
    spaces?.find((space) => space.kind === 'personal') ??
    spaces?.[0]
  );
}

/** The space named in the address, or null if the person isn't a member of it. */
export function useSpaceFromAddress(): {
  space: SpaceResponse | null;
  isPending: boolean;
  isError: boolean;
  refetch: () => void;
} {
  const spaceId = useAddressPart('spaceId');
  const spaces = useSpaces();
  return {
    space: spaces.data?.find((space) => space.id === spaceId) ?? null,
    isPending: spaces.isPending,
    isError: spaces.isError,
    refetch: () => void spaces.refetch(),
  };
}

/** Whether this role may change the space's settings. Members only see them. */
export const canManage = (space: SpaceResponse) => space.role !== 'member';
