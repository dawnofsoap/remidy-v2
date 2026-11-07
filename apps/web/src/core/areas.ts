import { useQuery } from '@tanstack/react-query';
import { Settings, Shield, Users } from 'lucide-react';
import type { NavItem } from './feature.ts';
import { fetchSession, SESSION_QUERY_KEY } from './session.ts';
import { useCurrentSpace } from './space.tsx';

export function useIsInstanceAdmin(): boolean {
  const session = useQuery({ queryKey: SESSION_QUERY_KEY, queryFn: fetchSession });
  return session.data?.user.isInstanceAdmin === true;
}

/** The settings areas, in the order they're listed. Administration only for instance admins. */
export function useAreaLinks(): NavItem[] {
  const space = useCurrentSpace();
  const isAdmin = useIsInstanceAdmin();
  return [
    ...(space ? [{ to: `/spaces/${space.id}/settings`, label: 'Space', icon: Users }] : []),
    ...(isAdmin ? [{ to: '/admin', label: 'Administration', icon: Shield }] : []),
    { to: '/settings', label: 'Settings', icon: Settings },
  ];
}
