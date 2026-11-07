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
 * The settings areas, from the group to the person to the whole app: Household for its members,
 * then Settings, then Administration for instance admins only.
 */
export function useAreaLinks(): NavItem[] {
  const household = useHousehold();
  const isAdmin = useIsInstanceAdmin();
  return [
    ...(household ? [{ to: '/household', label: 'Household', icon: House }] : []),
    { to: '/settings', label: 'Settings', icon: Settings },
    ...(isAdmin ? [{ to: '/admin', label: 'Administration', icon: Shield }] : []),
  ];
}
