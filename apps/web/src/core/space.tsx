import type { SpaceResponse } from '@remidy/contracts';
import { useQuery } from '@tanstack/react-query';
import { createContext, useContext } from 'react';
import { fetchSpaces } from './session.ts';

export const SPACES_QUERY_KEY = ['spaces'];

export function useSpaces() {
  return useQuery({ queryKey: SPACES_QUERY_KEY, queryFn: fetchSpaces });
}

/** The person's own space, for what's only theirs. */
export function usePersonalSpace(): SpaceResponse | undefined {
  return useSpaces().data?.find((space) => space.kind === 'personal');
}

/** The household the person belongs to, if any. A person belongs to one at most. */
export function useHousehold(): SpaceResponse | undefined {
  return useSpaces().data?.find((space) => space.kind === 'shared');
}

/**
 * The space whose shared lists, such as categories, the person uses: their household's, or their
 * own if they have none.
 */
export function useListsSpace(): SpaceResponse | undefined {
  const household = useHousehold();
  const personal = usePersonalSpace();
  return household ?? personal;
}

const SettingsSpaceContext = createContext<SpaceResponse | null>(null);

/** Tells the sections of a settings area which space they're about. */
export const SettingsSpaceProvider = SettingsSpaceContext.Provider;

/** The space the current settings section is about. */
export function useSettingsSpace(): SpaceResponse {
  const space = useContext(SettingsSpaceContext);
  if (!space) throw new Error('A space settings section was shown outside a settings area.');
  return space;
}

/** Whether this role may change the space's settings. Members only see them. */
export const canManage = (space: SpaceResponse) => space.role !== 'member';
