import { useQuery } from '@tanstack/react-query';
import { House, Settings, Shield } from 'lucide-react';
import type { NavItem } from './feature.ts';
import { fetchSession, SESSION_QUERY_KEY } from './session.ts';
import { useHousehold } from './space.tsx';

export function useIsInstanceAdmin(): boolean {
  const session = useQuery({ queryKey: SESSION_QUERY_KEY, queryFn: fetchSession });
  return session.data?.user.isInstanceAdmin === true;
}

/**
 * The settings areas, in the order they're listed. Household only for its members, and
 * Administration only for instance admins.
 */
export function useAreaLinks(): NavItem[] {
  const household = useHousehold();
  const isAdmin = useIsInstanceAdmin();
  return [
    ...(household ? [{ to: '/household', label: 'Household', icon: House }] : []),
    ...(isAdmin ? [{ to: '/admin', label: 'Administration', icon: Shield }] : []),
    { to: '/settings', label: 'Settings', icon: Settings },
  ];
}
