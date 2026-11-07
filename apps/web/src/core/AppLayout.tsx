import { enabledFeaturesResponse } from '@remidy/contracts';
import { useQuery } from '@tanstack/react-query';
import { Link, Outlet, useRouterState } from '@tanstack/react-router';
import { Ellipsis } from 'lucide-react';
import { createContext, useContext, useEffect, useRef } from 'react';
import { cn, focusRing, Toaster } from '../ui/index.ts';
import {
  visibleHome,
  visibleNav,
  visibleSpaceSettings,
  type NavItem,
  type WebFeature,
} from './feature.ts';
import { useAreaLinks } from './areas.ts';
import { activeLink, listLink } from './navStyles.ts';
import { ServerStatus } from './ServerStatus.tsx';
import type { SettingsSection } from './feature.ts';

const FeaturesContext = createContext<WebFeature[]>([]);
export const FeaturesProvider = FeaturesContext.Provider;

async function fetchEnabledFeatures({ signal }: { signal: AbortSignal }): Promise<string[]> {
  const response = await fetch('/api/v1/features', { signal });
  return enabledFeaturesResponse.parse(await response.json()).enabled;
}

/** What features add. Flagged ones stay hidden until the server confirms they're on. */
function useVisible<T>(pick: (features: WebFeature[], enabled: readonly string[]) => T): T {
  const features = useContext(FeaturesContext);
  const { data: enabled = [] } = useQuery({
    queryKey: ['enabled-features'],
    queryFn: fetchEnabledFeatures,
    retry: false,
  });
  return pick(features, enabled);
}

/** What features show on Home. */
export const useHomeSections = () => useVisible(visibleHome);

/** The sections features add about shared lists, such as categories. */
export const useSpaceSettingsSections = (): SettingsSection[] => useVisible(visibleSpaceSettings);

function NavList({ items }: { items: NavItem[] }) {
  return (
    <ul className="flex flex-col gap-1">
      {items.map(({ to, label, icon: Icon }) => (
        <li key={to}>
          <Link to={to} className={listLink}>
            <Icon aria-hidden="true" className="size-5" />
            {label}
          </Link>
        </li>
      ))}
    </ul>
  );
}

function Sidebar({ items }: { items: NavItem[] }) {
  return (
    <nav
      aria-label="Main"
      className="sticky top-0 hidden h-dvh w-58 flex-none flex-col gap-4 overflow-y-auto border-r border-line bg-surface p-4 md:flex"
    >
      <p className="px-3 text-xl font-bold tracking-tight">Remidy</p>
      <NavList items={items} />
      <div className="mt-auto border-t border-line pt-4">
        <NavList items={useAreaLinks()} />
      </div>
    </nav>
  );
}

const AREA_PATHS = /^\/(settings|admin|household|more)(\/|$)/;

function BottomNav({ items }: { items: NavItem[] }) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const tab = cn(
    'flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-xl text-xs font-medium text-ink-2',
    focusRing,
  );
  // The settings areas live behind More on phones, so More stays marked while in one.
  const inMore = AREA_PATHS.test(pathname);

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 border-t border-line bg-surface p-2 md:hidden"
    >
      <ul className="grid auto-cols-fr grid-flow-col gap-1">
        {items.map(({ to, label, icon: Icon }) => (
          <li key={to}>
            <Link to={to} className={cn(tab, activeLink)}>
              <Icon aria-hidden="true" className="size-5" />
              {label}
            </Link>
          </li>
        ))}
        <li>
          <Link
            to="/more"
            className={cn(tab, inMore && 'bg-accent-soft font-semibold text-accent-text')}
            {...(inMore ? { 'aria-current': 'page' as const } : {})}
          >
            <Ellipsis aria-hidden="true" className="size-5" />
            More
          </Link>
        </li>
      </ul>
    </nav>
  );
}

export function AppLayout() {
  const items = useVisible(visibleNav);
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const mainRef = useRef<HTMLElement>(null);
  const previousPathname = useRef(pathname);

  // After navigating, keyboard and screen reader users continue from the new page's content.
  useEffect(() => {
    if (previousPathname.current !== pathname) {
      previousPathname.current = pathname;
      mainRef.current?.focus();
    }
  }, [pathname]);

  return (
    <div className="flex min-h-dvh">
      <a
        href="#main"
        className={cn(
          'absolute top-2 left-2 z-10 -translate-y-20 rounded-xl bg-surface p-3 font-semibold focus:translate-y-0',
          focusRing,
        )}
      >
        Skip to content
      </a>
      <Sidebar items={items} />
      <div className="flex min-w-0 flex-auto flex-col">
        <main
          id="main"
          ref={mainRef}
          tabIndex={-1}
          className="relative min-w-0 flex-auto p-4 pb-24 outline-none md:p-8"
        >
          {/* Pages start beside the sidebar and can use most of a wide screen. Forms inside keep
              their own readable width. */}
          <div className="max-w-[100rem]">
            <ServerStatus />
            <Outlet />
          </div>
        </main>
      </div>
      <BottomNav items={items} />
      <Toaster />
    </div>
  );
}
